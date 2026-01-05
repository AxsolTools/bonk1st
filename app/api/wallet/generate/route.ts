/**
 * AQUA Launchpad - Wallet Generation API
 * 
 * Generates a new Solana wallet with:
 * - BIP39 mnemonic phrase
 * - HD derivation (Solana standard path)
 * - AES-256-GCM encryption for private key storage
 * 
 * Security:
 * - Private keys are encrypted before storage
 * - Encryption keys are user-specific
 * - Service salt is auto-managed via Supabase Vault
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Keypair } from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { 
  encryptPrivateKey, 
  encryptMnemonic, 
  getOrCreateServiceSalt,
  generateSecureRandom 
} from '@/lib/crypto';

// Standard Solana derivation path (Phantom, Solflare compatible)
const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { label, sessionId: providedSessionId } = body;

    // Get or create session ID
    const sessionId = providedSessionId || generateSecureRandom(16);

    const supabase = await createClient();
    const adminClient = getAdminClient();

    // Get service salt for encryption (auto-created if not exists)
    const serviceSalt = await getOrCreateServiceSalt(adminClient);

    // Generate BIP39 mnemonic (12 words = 128 bits of entropy)
    const mnemonic = bip39.generateMnemonic(128);

    // Derive seed from mnemonic
    const seed = bip39.mnemonicToSeedSync(mnemonic);

    // Derive keypair using Solana's standard derivation path
    const derivedSeed = derivePath(SOLANA_DERIVATION_PATH, seed.toString('hex')).key;
    const keypair = Keypair.fromSeed(derivedSeed);

    // Get public key in base58 format
    const publicKey = keypair.publicKey.toBase58();

    // Encrypt private key using user-specific key
    // The encryption key is derived from sessionId + serviceSalt
    const encryptedPrivateKey = encryptPrivateKey(
      bs58.encode(keypair.secretKey),
      sessionId,
      serviceSalt
    );

    // Encrypt mnemonic for secure backup storage
    const encryptedMnemonic = encryptMnemonic(mnemonic, sessionId, serviceSalt);

    // Check if this is the first wallet for this session
    const { data: existingWallets } = await supabase
      .from('wallets')
      .select('id')
      .eq('session_id', sessionId);

    const isFirstWallet = !existingWallets || existingWallets.length === 0;

    // Store wallet in database
    const { data: wallet, error: insertError } = await supabase
      .from('wallets')
      .insert({
        session_id: sessionId,
        public_key: publicKey,
        encrypted_private_key: encryptedPrivateKey,
        label: label || 'Main Wallet',
        is_primary: isFirstWallet,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[WALLET] Database insert error:', insertError);
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 1001, 
            message: 'Failed to store wallet' 
          } 
        },
        { status: 500 }
      );
    }

    // Return wallet info to user
    // IMPORTANT: Only return mnemonic and secretKey once - user must save them!
    const secretKeyBase58 = bs58.encode(keypair.secretKey);
    
    return NextResponse.json({
      success: true,
      data: {
        walletId: wallet.id,
        publicKey,
        secretKey: secretKeyBase58, // Base58 encoded private key - shown only once!
        sessionId,
        mnemonic, // 12-word recovery phrase - shown only once!
        isPrimary: isFirstWallet,
        label: label || 'Main Wallet',
      },
      warning: 'Save your recovery phrase and private key now! They will NOT be shown again.',
    });

  } catch (error) {
    console.error('[WALLET] Generation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 1000, 
          message: 'Failed to generate wallet',
          details: error instanceof Error ? error.message : 'Unknown error'
        } 
      },
      { status: 500 }
    );
  }
}
