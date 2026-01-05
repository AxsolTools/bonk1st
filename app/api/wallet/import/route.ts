/**
 * AQUA Launchpad - Wallet Import API
 * 
 * Imports an existing Solana wallet from:
 * - BIP39 mnemonic phrase (12 or 24 words)
 * - Base58 private key
 * - Base64 private key
 * 
 * Security:
 * - Private keys are encrypted before storage
 * - Encryption keys are user-specific
 * - Input validation prevents malformed data
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

// Standard Solana derivation path
const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { secretKey, label, sessionId: providedSessionId } = body;

    // Validate input
    if (!secretKey || typeof secretKey !== 'string') {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 1002, 
            message: 'Private key or recovery phrase required' 
          } 
        },
        { status: 400 }
      );
    }

    // Get or create session ID
    const sessionId = providedSessionId || generateSecureRandom(16);

    const supabase = await createClient();
    const adminClient = getAdminClient();

    // Get service salt for encryption
    const serviceSalt = await getOrCreateServiceSalt(adminClient);

    let keypair: Keypair;
    let importedMnemonic: string | null = null;
    const trimmedInput = secretKey.trim();

    // Detect input type and derive keypair
    if (trimmedInput.includes(' ')) {
      // Input contains spaces - treat as mnemonic phrase
      const normalizedMnemonic = trimmedInput.toLowerCase();
      
      if (!bip39.validateMnemonic(normalizedMnemonic)) {
        return NextResponse.json(
          { 
            success: false, 
            error: { 
              code: 1002, 
              message: 'Invalid recovery phrase. Please check for typos.' 
            } 
          },
          { status: 400 }
        );
      }

      // Derive keypair from mnemonic
      const seed = bip39.mnemonicToSeedSync(normalizedMnemonic);
      const derivedSeed = derivePath(SOLANA_DERIVATION_PATH, seed.toString('hex')).key;
      keypair = Keypair.fromSeed(derivedSeed);
      importedMnemonic = normalizedMnemonic;
      
    } else {
      // No spaces - treat as private key (base58 or base64)
      let privateKeyBytes: Uint8Array;
      
      try {
        // Try base58 first (most common format)
        privateKeyBytes = bs58.decode(trimmedInput);
      } catch {
        try {
          // Try base64 as fallback
          privateKeyBytes = new Uint8Array(Buffer.from(trimmedInput, 'base64'));
        } catch {
          return NextResponse.json(
            { 
              success: false, 
              error: { 
                code: 1002, 
                message: 'Invalid private key format. Use base58 or base64 encoding.' 
              } 
            },
            { status: 400 }
          );
        }
      }

      // Validate key length
      if (privateKeyBytes.length !== 64) {
        return NextResponse.json(
          { 
            success: false, 
            error: { 
              code: 1002, 
              message: 'Invalid private key length. Expected 64 bytes.' 
            } 
          },
          { status: 400 }
        );
      }

      try {
        keypair = Keypair.fromSecretKey(privateKeyBytes);
      } catch (e) {
        return NextResponse.json(
          { 
            success: false, 
            error: { 
              code: 1002, 
              message: 'Invalid private key. Could not derive wallet.' 
            } 
          },
          { status: 400 }
        );
      }
    }

    const publicKey = keypair.publicKey.toBase58();

    // Check if wallet already exists for this session
    const { data: existingWallet } = await supabase
      .from('wallets')
      .select('id, label')
      .eq('session_id', sessionId)
      .eq('public_key', publicKey)
      .single();

    if (existingWallet) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 1003, 
            message: `Wallet already imported as "${existingWallet.label}"` 
          } 
        },
        { status: 400 }
      );
    }

    // Encrypt private key for storage
    const encryptedPrivateKey = encryptPrivateKey(
      bs58.encode(keypair.secretKey),
      sessionId,
      serviceSalt
    );

    // Encrypt mnemonic if provided
    let encryptedMnemonicValue: string | null = null;
    if (importedMnemonic) {
      encryptedMnemonicValue = encryptMnemonic(importedMnemonic, sessionId, serviceSalt);
    }

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
        label: label || 'Imported Wallet',
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

    return NextResponse.json({
      success: true,
      data: {
        walletId: wallet.id,
        publicKey,
        sessionId,
        isPrimary: isFirstWallet,
        label: label || 'Imported Wallet',
        hasMnemonic: !!importedMnemonic,
      },
    });

  } catch (error) {
    console.error('[WALLET] Import error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 1000, 
          message: 'Failed to import wallet',
          details: error instanceof Error ? error.message : 'Unknown error'
        } 
      },
      { status: 500 }
    );
  }
}
