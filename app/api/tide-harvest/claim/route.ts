/**
 * AQUA Launchpad - Tide Harvest Claim API
 * Allows creators to claim accumulated rewards
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js"
import bs58 from "bs58"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

// GET - Get tide harvest status for a token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tokenAddress = searchParams.get("token_address")
    const creatorWallet = searchParams.get("creator_wallet")

    if (!tokenAddress && !creatorWallet) {
      return NextResponse.json(
        { error: "token_address or creator_wallet is required" },
        { status: 400 }
      )
    }

    let query = supabase.from("tide_harvests").select("*")

    if (tokenAddress) {
      query = query.eq("token_address", tokenAddress)
    }
    if (creatorWallet) {
      query = query.eq("creator_wallet", creatorWallet)
    }

    const { data, error } = await query

    if (error) throw error

    // Calculate totals if multiple harvests
    const totalAccumulated = data?.reduce((sum, h) => sum + Number(h.total_accumulated), 0) || 0
    const totalClaimed = data?.reduce((sum, h) => sum + Number(h.total_claimed), 0) || 0
    const pendingAmount = totalAccumulated - totalClaimed

    return NextResponse.json({
      success: true,
      data: {
        harvests: data || [],
        totalAccumulated,
        totalClaimed,
        pendingAmount,
      },
    })
  } catch (error) {
    console.error("[TIDE-HARVEST] GET error:", error)
    return NextResponse.json(
      { error: "Failed to get tide harvest data" },
      { status: 500 }
    )
  }
}

// POST - Claim pending rewards
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token_address, creator_wallet, claim_amount } = body

    if (!token_address || !creator_wallet) {
      return NextResponse.json(
        { error: "token_address and creator_wallet are required" },
        { status: 400 }
      )
    }

    // Get the tide harvest record
    const { data: harvest, error: fetchError } = await supabase
      .from("tide_harvests")
      .select("*")
      .eq("token_address", token_address)
      .single()

    if (fetchError || !harvest) {
      return NextResponse.json(
        { error: "Tide harvest record not found" },
        { status: 404 }
      )
    }

    // Verify ownership
    if (harvest.creator_wallet !== creator_wallet) {
      return NextResponse.json(
        { error: "Not authorized to claim this harvest" },
        { status: 403 }
      )
    }

    // Calculate pending amount
    const pendingAmount = Number(harvest.total_accumulated) - Number(harvest.total_claimed)
    const amountToClaim = claim_amount ? Math.min(Number(claim_amount), pendingAmount) : pendingAmount

    if (amountToClaim <= 0) {
      return NextResponse.json(
        { error: "No pending rewards to claim" },
        { status: 400 }
      )
    }

    // Minimum claim amount (0.001 SOL)
    const MIN_CLAIM = 0.001
    if (amountToClaim < MIN_CLAIM) {
      return NextResponse.json(
        { error: `Minimum claim amount is ${MIN_CLAIM} SOL` },
        { status: 400 }
      )
    }

    // Get the token's creator vault and check balance
    // In a real implementation, this would interact with the Pump.fun creator vault PDA
    // For now, we'll create a claim record and simulate the transfer
    
    // Create claim record
    const { data: claim, error: claimError } = await supabase
      .from("tide_harvest_claims")
      .insert({
        tide_harvest_id: harvest.id,
        token_address,
        creator_wallet,
        amount: amountToClaim,
        status: "pending",
      })
      .select()
      .single()

    if (claimError) throw claimError

    // Execute actual claim from creator vault
    const txSignature = await executeCreatorVaultClaim(
      token_address,
      creator_wallet,
      amountToClaim,
      claim.id
    )

    // Update the claim with signature
    await supabase
      .from("tide_harvest_claims")
      .update({
        tx_signature: txSignature,
        status: "confirmed",
      })
      .eq("id", claim.id)

    // Update the harvest record
    const { data: updatedHarvest, error: updateError } = await supabase
      .from("tide_harvests")
      .update({
        total_claimed: Number(harvest.total_claimed) + amountToClaim,
        last_claim_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", harvest.id)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      data: {
        claim: {
          id: claim.id,
          amount: amountToClaim,
          txSignature,
          status: "confirmed",
        },
        harvest: updatedHarvest,
        message: `Successfully claimed ${amountToClaim.toFixed(4)} SOL`,
      },
    })
  } catch (error) {
    console.error("[TIDE-HARVEST] POST error:", error)
    return NextResponse.json(
      { error: "Failed to claim rewards" },
      { status: 500 }
    )
  }
}

// ============================================================================
// CREATOR VAULT CLAIM EXECUTION
// ============================================================================

async function executeCreatorVaultClaim(
  tokenAddress: string,
  creatorWallet: string,
  amountSol: number,
  claimId: string
): Promise<string> {
  console.log(`[TIDE-HARVEST] Executing claim: ${amountSol} SOL for ${tokenAddress}`)

  // 1. Get creator's encrypted wallet key
  const { data: wallet, error: walletError } = await supabase
    .from("wallets")
    .select("encrypted_private_key")
    .eq("public_key", creatorWallet)
    .single()

  if (walletError || !wallet?.encrypted_private_key) {
    throw new Error("Creator wallet not found in system")
  }

  // 2. Get decryption salt
  const { data: saltConfig } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", "service_salt")
    .single()

  if (!saltConfig?.value) {
    throw new Error("Service configuration not found")
  }

  // 3. Decrypt the private key
  const privateKeyBytes = await decryptWalletKey(wallet.encrypted_private_key, saltConfig.value)
  const creatorKeypair = Keypair.fromSecretKey(privateKeyBytes)

  // 4. Derive the creator vault PDA (Pump.fun format)
  // The vault PDA is derived from: [b"vault", mint_pubkey, creator_pubkey]
  const mintPubkey = new PublicKey(tokenAddress)
  const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")
  
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), mintPubkey.toBuffer(), creatorKeypair.publicKey.toBuffer()],
    PUMP_PROGRAM_ID
  )

  // 5. Check vault balance
  const vaultBalance = await connection.getBalance(vaultPDA)
  const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL)

  if (vaultBalance < amountLamports) {
    throw new Error(`Insufficient vault balance: ${vaultBalance / LAMPORTS_PER_SOL} SOL available`)
  }

  // 6. Create the claim transaction
  // For Pump.fun creator vaults, we need to call the withdraw_creator_fees instruction
  // This requires the proper instruction data for the Pump.fun program
  const transaction = new Transaction()

  // Add compute budget if needed
  transaction.add(
    // ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
    // ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
  )

  // The actual claim instruction would be specific to Pump.fun's program
  // For a standard SOL transfer from a PDA, we would need the program to sign
  // Since we can't directly call Pump.fun's internal functions, we use their API
  
  // Alternative: Use PumpPortal API for creator claims if available
  const pumpPortalResponse = await fetch("https://pumpportal.fun/api/creator-claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mint: tokenAddress,
      creatorPublicKey: creatorWallet,
      amount: amountLamports,
    }),
  })

  if (pumpPortalResponse.ok) {
    // PumpPortal returns a transaction to sign
    const txData = await pumpPortalResponse.arrayBuffer()
    const tx = Transaction.from(Buffer.from(txData))
    tx.sign(creatorKeypair)
    
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    })

    // Wait for confirmation
    await connection.confirmTransaction(signature, "confirmed")
    console.log(`[TIDE-HARVEST] Claim executed via PumpPortal: ${signature}`)
    return signature
  }

  // Fallback: Direct RPC call if PumpPortal API not available
  // This creates a simple transfer instruction (only works if vault is a regular account)
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: vaultPDA,
      toPubkey: creatorKeypair.publicKey,
      lamports: amountLamports,
    })
  )

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized")
  transaction.recentBlockhash = blockhash
  transaction.feePayer = creatorKeypair.publicKey

  // Sign and send
  transaction.sign(creatorKeypair)
  
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 3,
  })

  // Wait for confirmation with timeout
  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  )

  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
  }

  console.log(`[TIDE-HARVEST] Claim executed: ${signature}`)
  return signature
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
    saltBytes.buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  )

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes.buffer as ArrayBuffer,
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
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    derivedKey,
    combined.buffer as ArrayBuffer
  )

  return new Uint8Array(decrypted)
}

