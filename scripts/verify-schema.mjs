/**
 * AQUA Launchpad - Database Schema Verification
 * 
 * Verifies that all required tables and columns exist
 * Fixes schema issues if found
 */

import pg from 'pg';
const { Client } = pg;

// Database configuration
const DATABASE_URL = 'postgresql://postgres.rbmzrqsnsvzgoxzpynky:Axsolpumpfun1!@aws-0-us-east-2.pooler.supabase.com:5432/postgres';

async function verifySchema() {
  console.log('🔍 AQUA Database Schema Verification');
  console.log('====================================\n');

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check wallets table schema
    console.log('📋 Checking wallets table...');
    const walletsResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'wallets'
      ORDER BY ordinal_position;
    `);

    if (walletsResult.rows.length === 0) {
      console.log('❌ wallets table does not exist');
    } else {
      console.log('Columns:');
      walletsResult.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'YES' ? '(nullable)' : '(required)'}`);
      });
      
      // Check for required columns
      const columns = walletsResult.rows.map(r => r.column_name);
      const required = ['id', 'session_id', 'public_key', 'encrypted_private_key', 'label', 'is_primary'];
      const missing = required.filter(col => !columns.includes(col));
      
      if (missing.length > 0) {
        console.log(`\n❌ Missing required columns: ${missing.join(', ')}`);
      } else {
        console.log('\n✅ All required columns present');
      }
      
      // Check for legacy columns that should be removed
      const legacy = ['publicKey', 'encryptedPrivateKey', 'isPrimary', 'userId', 'sessionId'];
      const found_legacy = legacy.filter(col => columns.includes(col));
      
      if (found_legacy.length > 0) {
        console.log(`\n⚠️  Legacy columns found (may cause issues): ${found_legacy.join(', ')}`);
        
        // Try to drop them
        console.log('Attempting to remove legacy columns...');
        for (const col of found_legacy) {
          try {
            await client.query(`ALTER TABLE wallets DROP COLUMN IF EXISTS "${col}";`);
            console.log(`  Dropped: ${col}`);
          } catch (e) {
            console.log(`  Failed to drop ${col}: ${e.message}`);
          }
        }
      }
    }

    console.log('\n');

    // Check tokens table
    console.log('📋 Checking tokens table...');
    const tokensResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'tokens'
      ORDER BY ordinal_position;
    `);

    if (tokensResult.rows.length === 0) {
      console.log('❌ tokens table does not exist - creating...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS tokens (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          creator_id text,
          creator_wallet text NOT NULL,
          mint_address text UNIQUE NOT NULL,
          name text NOT NULL,
          symbol text NOT NULL,
          description text,
          image_url text,
          metadata_uri text,
          total_supply bigint DEFAULT 1000000000,
          decimals int DEFAULT 9,
          price_sol numeric DEFAULT 0,
          price_usd numeric DEFAULT 0,
          market_cap numeric DEFAULT 0,
          current_liquidity numeric DEFAULT 0,
          volume_24h numeric DEFAULT 0,
          change_24h numeric DEFAULT 0,
          holders int DEFAULT 1,
          water_level numeric DEFAULT 50,
          constellation_strength numeric DEFAULT 50,
          stage text DEFAULT 'bonding',
          migration_threshold numeric DEFAULT 85,
          bonding_curve_progress numeric DEFAULT 0,
          migrated_at timestamptz,
          migration_pool_address text,
          website text,
          twitter text,
          telegram text,
          discord text,
          launch_tx_signature text,
          initial_buy_sol numeric DEFAULT 0,
          pour_rate numeric DEFAULT 1,
          evaporation_rate numeric DEFAULT 0.5,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );
      `);
      console.log('✅ tokens table created');
    } else {
      console.log(`✅ tokens table exists (${tokensResult.rows.length} columns)`);
    }

    console.log('\n');

    // Check system_config table (for vault fallback)
    console.log('📋 Checking system_config table...');
    const configResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'system_config';
    `);

    if (configResult.rows.length === 0) {
      console.log('❌ system_config table does not exist - creating...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_config (
          id serial PRIMARY KEY,
          key text UNIQUE NOT NULL,
          value text NOT NULL,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );
      `);
      console.log('✅ system_config table created');
    } else {
      console.log('✅ system_config table exists');
    }

    // Test wallet insert
    console.log('\n📝 Testing wallet insert...');
    try {
      const testResult = await client.query(`
        INSERT INTO wallets (session_id, public_key, encrypted_private_key, label, is_primary)
        VALUES ('test_verify_' || gen_random_uuid(), 'TEST_PUBLIC_KEY', 'TEST_ENCRYPTED', 'Test', false)
        RETURNING id;
      `);
      console.log('✅ Test insert successful, ID:', testResult.rows[0].id);
      
      // Clean up test
      await client.query(`DELETE FROM wallets WHERE public_key = 'TEST_PUBLIC_KEY';`);
      console.log('✅ Test record cleaned up');
    } catch (e) {
      console.log('❌ Test insert failed:', e.message);
    }

    console.log('\n====================================');
    console.log('✅ Schema verification complete');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

verifySchema();

