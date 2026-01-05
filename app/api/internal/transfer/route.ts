/**
 * AQUA Launchpad - Internal Transfer API
 * Handles SOL transfers from platform wallets (for referral payouts, etc.)
 * 
 * This is an internal API - not exposed to users directly
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { 
  Connection, 
  Keypair, 
  Transaction, 
  SystemProgram, 
  PublicKey,
  LAMPORTS_PER_SOL 
} from "@solana/web3.js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

// Internal API key for security
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "aqua-internal-transfer-key"

export async function POST(request: NextRequest) {
  try {
    // Verify internal call (basic security)
    const origin = request.headers.get("origin")
    const host = request.headers.get("host")
    
    // Only allow internal calls (same origin or no origin for server-to-server)
    if (origin && !origin.includes(host || "")) {
      console.warn("[INTERNAL-TRANSFER] External origin blocked:", origin)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const body = await request.json()
    const { fromWallet, toWallet, amountLamports, encryptedKey } = body

    if (!fromWallet || !toWallet || !amountLamports || !encryptedKey) {
      return NextResponse.json(
        { error: "Missing required fields: fromWallet, toWallet, amountLamports, encryptedKey" },
        { status: 400 }
      )
    }

    // Validate addresses
    try {
      new PublicKey(fromWallet)
      new PublicKey(toWallet)
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 })
    }

    // Get decryption salt
    const { data: saltConfig } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "service_salt")
      .single()

    if (!saltConfig?.value) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 })
    }

    // Decrypt the private key
    const privateKeyBytes = await decryptWalletKey(encryptedKey, saltConfig.value)
    const fromKeypair = Keypair.fromSecretKey(privateKeyBytes)

    // Verify the keypair matches the fromWallet
    if (fromKeypair.publicKey.toBase58() !== fromWallet) {
      return NextResponse.json({ error: "Keypair mismatch" }, { status: 400 })
    }

    // Check balance
    const balance = await connection.getBalance(fromKeypair.publicKey)
    const requiredBalance = amountLamports + 5000 // Amount + estimated fee
    
    if (balance < requiredBalance) {
      return NextResponse.json(
        { error: `Insufficient balance: ${balance / LAMPORTS_PER_SOL} SOL available, ${requiredBalance / LAMPORTS_PER_SOL} SOL required` },
        { status: 400 }
      )
    }

    // Create and send transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized")
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: new PublicKey(toWallet),
        lamports: amountLamports,
      })
    )

    transaction.recentBlockhash = blockhash
    transaction.feePayer = fromKeypair.publicKey
    transaction.sign(fromKeypair)

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    })

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    )

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
    }

    console.log(`[INTERNAL-TRANSFER] Success: ${amountLamports / LAMPORTS_PER_SOL} SOL from ${fromWallet} to ${toWallet}`)
    console.log(`[INTERNAL-TRANSFER] Signature: ${signature}`)

    return NextResponse.json({
      success: true,
      signature,
      amount: amountLamports / LAMPORTS_PER_SOL,
    })

  } catch (error) {
    console.error("[INTERNAL-TRANSFER] Error:", error)
    const message = error instanceof Error ? error.message : "Transfer failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Helper to decrypt wallet key
async function decryptWalletKey(encryptedData: string, salt: string): Promise<Uint8Array> {
  const parts = encryptedData.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format")
  }

  const [ivHex, ciphertextHex, authTagHex] = parts

  const hexToBytes = (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
    }
    return bytes
  }

  const iv = hexToBytes(ivHex)
  const ciphertext = hexToBytes(ciphertextHex)
  const authTag = hexToBytes(authTagHex)
  const saltBytes = hexToBytes(salt)

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    saltBytes.buffer.slice(saltBytes.byteOffset, saltBytes.byteOffset + saltBytes.byteLength),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  )

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes.buffer.slice(saltBytes.byteOffset, saltBytes.byteOffset + saltBytes.byteLength),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  )

  const combined = new Uint8Array(ciphertext.length + authTag.length)
  combined.set(ciphertext)
  combined.set(authTag, ciphertext.length)

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) },
    derivedKey,
    combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength)
  )

  return new Uint8Array(decrypted)
}

