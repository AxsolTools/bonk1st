/**
 * Boosts API - Handle token boost payments
 * Collects SOL to platform fee wallet
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { createClient } from "@supabase/supabase-js"
import bs58 from "bs58"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

// Platform fee wallet - where boost payments go
const PLATFORM_FEE_WALLET = process.env.PLATFORM_FEE_WALLET || "AQUAx8KwoebRVxckPAGgkH4NXHCPnrHcQmvMfqK9pump"

/**
 * POST - Process a boost payment
 */
export async function POST(request: NextRequest) {
  try {
    const sessionId = request.headers.get('x-session-id')
    const walletAddress = request.headers.get('x-wallet-address')

    if (!sessionId || !walletAddress) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { tokenAddress, amount, boostCount = 1 } = body

    if (!tokenAddress || !amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid boost parameters" },
        { status: 400 }
      )
    }

    // Validate boost count matches payment tier
    const validTiers = [
      { sol: 0.1, boosts: 1 },
      { sol: 0.5, boosts: 5 },
      { sol: 1, boosts: 10 },
      { sol: 5, boosts: 50 },
    ]
    const matchingTier = validTiers.find(t => Math.abs(t.sol - amount) < 0.001 && t.boosts === boostCount)
    if (!matchingTier) {
      return NextResponse.json(
        { success: false, error: "Invalid boost tier" },
        { status: 400 }
      )
    }

    // Get the wallet's encrypted private key
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("encrypted_private_key")
      .eq("session_id", sessionId)
      .eq("public_key", walletAddress)
      .single()

    if (walletError || !wallet?.encrypted_private_key) {
      return NextResponse.json(
        { success: false, error: "Wallet not found" },
        { status: 404 }
      )
    }

    // Get service salt for decryption
    const { data: saltConfig } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "service_salt")
      .single()

    if (!saltConfig?.value) {
      return NextResponse.json(
        { success: false, error: "Service configuration error" },
        { status: 500 }
      )
    }

    // Decrypt private key
    const privateKeyBase58 = decryptPrivateKey(wallet.encrypted_private_key, sessionId, saltConfig.value)
    const payerKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))

    // Check balance
    const balance = await connection.getBalance(payerKeypair.publicKey)
    const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL)
    const txFeeLamports = 5000 // ~0.000005 SOL for tx fee

    if (balance < amountLamports + txFeeLamports) {
      return NextResponse.json({
        success: false,
        error: `Insufficient balance. Need ${((amountLamports + txFeeLamports) / LAMPORTS_PER_SOL).toFixed(6)} SOL`
      })
    }

    // Create transfer transaction to platform fee wallet
    const platformWallet = new PublicKey(PLATFORM_FEE_WALLET)
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        toPubkey: platformWallet,
        lamports: amountLamports,
      })
    )

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized")
    transaction.recentBlockhash = blockhash
    transaction.feePayer = payerKeypair.publicKey

    // Sign and send
    transaction.sign(payerKeypair)
    
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
      return NextResponse.json({
        success: false,
        error: "Transaction failed"
      })
    }

    // Record boost in database
    try {
      await supabase.from("boosts").insert({
        token_address: tokenAddress,
        wallet_address: walletAddress,
        amount: amount,
        boost_count: boostCount,
        tx_signature: signature,
        status: "confirmed",
      })

      // Update token's total boost count
      const { data: token } = await supabase
        .from("tokens")
        .select("boost_amount")
        .eq("mint_address", tokenAddress)
        .single()

      if (token) {
        await supabase
          .from("tokens")
          .update({ boost_amount: (token.boost_amount || 0) + boostCount })
          .eq("mint_address", tokenAddress)
      }
    } catch (dbError) {
      console.warn("[BOOSTS] Failed to record boost in DB:", dbError)
      // Continue - the payment was successful
    }

    console.log(`[BOOSTS] Boost successful: ${amount} SOL (+${boostCount} boosts) for ${tokenAddress} - ${signature}`)

    return NextResponse.json({
      success: true,
      data: {
        txSignature: signature,
        amount: amount,
        boostCount: boostCount,
        message: `Successfully added ${boostCount} boosts with ${amount} SOL`
      }
    })
  } catch (error) {
    console.error("[BOOSTS] POST error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to process boost" },
      { status: 500 }
    )
  }
}

/**
 * Decrypt private key using session ID and service salt
 */
function decryptPrivateKey(encryptedData: string, sessionId: string, serviceSalt: string): string {
  // Import the decrypt function logic
  const crypto = require('crypto')
  
  const parts = encryptedData.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format')
  }

  const [ivHex, ciphertextHex, authTagHex] = parts
  
  // Derive key from sessionId + serviceSalt
  const keyMaterial = sessionId + serviceSalt
  const key = crypto.createHash('sha256').update(keyMaterial).digest()
  
  const iv = Buffer.from(ivHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(ciphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  
  return decrypted.toString('utf8')
}
