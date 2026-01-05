/**
 * AQUA Launchpad - Wallet Withdraw API
 * 
 * Allows users to withdraw SOL from their managed wallet to any destination address
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js"
import bs58 from "bs58"
import { getAdminClient } from "@/lib/supabase/admin"
import { decryptPrivateKey, getOrCreateServiceSalt } from "@/lib/crypto"
import { solToLamports, lamportsToSol } from "@/lib/precision"

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"

export async function POST(request: NextRequest) {
  try {
    // Get auth headers
    const sessionId = request.headers.get("x-session-id")
    const walletAddress = request.headers.get("x-wallet-address")

    if (!sessionId || !walletAddress) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: "Authentication required" } },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { destination, amount } = body

    // Validate destination address
    if (!destination) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: "Destination address required" } },
        { status: 400 }
      )
    }

    let destinationPubkey: PublicKey
    try {
      destinationPubkey = new PublicKey(destination)
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: "Invalid destination address" } },
        { status: 400 }
      )
    }

    // Validate amount
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: "Invalid amount" } },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()
    const connection = new Connection(HELIUS_RPC_URL, "confirmed")

    // Verify wallet belongs to session and get encrypted key
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data: wallet, error: walletError } = await (adminClient
      .from("wallets") as any)
      .select("encrypted_private_key, public_key")
      .eq("session_id", sessionId)
      .eq("public_key", walletAddress)
      .single()

    if (walletError || !wallet) {
      return NextResponse.json(
        { success: false, error: { code: 1003, message: "Wallet not found or unauthorized" } },
        { status: 403 }
      )
    }

    // Decrypt private key
    const serviceSalt = await getOrCreateServiceSalt(adminClient)
    const privateKeyBase58 = decryptPrivateKey(wallet.encrypted_private_key, sessionId, serviceSalt)
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))

    // Check balance
    const balance = await connection.getBalance(keypair.publicKey)
    const amountLamports = solToLamports(amount)
    const estimatedFee = 5000n // ~0.000005 SOL

    if (BigInt(balance) < amountLamports + estimatedFee) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 2001,
            message: "Insufficient balance",
            breakdown: {
              currentBalance: lamportsToSol(BigInt(balance)).toFixed(9),
              requestedAmount: amount.toFixed(9),
              estimatedFee: lamportsToSol(estimatedFee).toFixed(9),
            },
          },
        },
        { status: 400 }
      )
    }

    // Create and send transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: destinationPubkey,
        lamports: Number(amountLamports),
      })
    )

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
    transaction.recentBlockhash = blockhash
    transaction.feePayer = keypair.publicKey

    transaction.sign(keypair)

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    })

    // Confirm transaction
    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    )

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
    }

    console.log(`[WITHDRAW] ${amount} SOL from ${walletAddress} to ${destination}. TX: ${signature}`)

    return NextResponse.json({
      success: true,
      data: {
        txSignature: signature,
        from: walletAddress,
        to: destination,
        amountSol: amount,
      },
    })
  } catch (error) {
    console.error("[WITHDRAW] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: "Withdrawal failed",
          details: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 500 }
    )
  }
}

