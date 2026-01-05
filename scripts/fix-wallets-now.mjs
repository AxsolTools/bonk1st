/**
 * AQUA Launchpad - Fix Wallets Table
 * Drops old camelCase columns and keeps snake_case
 */

import pg from 'pg';

const DATABASE_URL = 'postgresql://postgres:zu6j.DiaT$Q8ryw@db.rbmzrqsnsvzgoxzpynky.supabase.co:5432/postgres';

async function fixWallets() {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check current schema
    console.log('📋 Current wallets table columns:');
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'wallets' 
      ORDER BY ordinal_position
    `);
    result.rows.forEach(r => {
      console.log(`  - ${r.column_name} (${r.data_type}) ${r.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE'}`);
    });

    console.log('\n🔧 Fixing wallets table...\n');

    // Drop the old camelCase columns if they exist
    const dropColumns = [
      'publicKey',
      'sessionId', 
      'encryptedPrivateKey',
      'isPrimary',
      'userId',
      'createdAt',
      'updatedAt',
      'isActive'
    ];

    for (const col of dropColumns) {
      try {
        await client.query(`ALTER TABLE wallets DROP COLUMN IF EXISTS "${col}"`);
        console.log(`  ✅ Dropped column: ${col}`);
      } catch (e) {
        console.log(`  ⏭️  Column ${col} doesn't exist or couldn't be dropped`);
      }
    }

    // Ensure snake_case columns exist with correct constraints
    console.log('\n🔧 Ensuring snake_case columns exist...\n');
    
    const ensureColumns = [
      { name: 'session_id', type: 'TEXT', nullable: false, default: "gen_random_uuid()::text" },
      { name: 'public_key', type: 'VARCHAR(44)', nullable: false, default: null },
      { name: 'encrypted_private_key', type: 'TEXT', nullable: false, default: null },
      { name: 'label', type: 'TEXT', nullable: true, default: null },
      { name: 'is_primary', type: 'BOOLEAN', nullable: true, default: 'FALSE' },
      { name: 'user_id', type: 'UUID', nullable: true, default: null },
      { name: 'created_at', type: 'TIMESTAMPTZ', nullable: true, default: 'NOW()' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: true, default: 'NOW()' },
    ];

    for (const col of ensureColumns) {
      try {
        // Check if column exists
        const exists = await client.query(`
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'wallets' AND column_name = $1
        `, [col.name]);
        
        if (exists.rows.length === 0) {
          // Add column
          let sql = `ALTER TABLE wallets ADD COLUMN ${col.name} ${col.type}`;
          if (col.default) sql += ` DEFAULT ${col.default}`;
          await client.query(sql);
          console.log(`  ✅ Added column: ${col.name}`);
        } else {
          console.log(`  ⏭️  Column exists: ${col.name}`);
        }
      } catch (e) {
        console.log(`  ❌ Error with ${col.name}: ${e.message}`);
      }
    }

    // Remove NOT NULL constraints temporarily to allow migration
    console.log('\n🔧 Adjusting constraints...\n');
    try {
      await client.query(`ALTER TABLE wallets ALTER COLUMN public_key DROP NOT NULL`);
      await client.query(`ALTER TABLE wallets ALTER COLUMN encrypted_private_key DROP NOT NULL`);
      await client.query(`ALTER TABLE wallets ALTER COLUMN session_id DROP NOT NULL`);
      console.log('  ✅ Dropped NOT NULL constraints');
    } catch (e) {
      console.log('  ⏭️  Constraints already dropped or error:', e.message);
    }

    // Show final schema
    console.log('\n📋 Final wallets table columns:');
    const finalResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'wallets' 
      ORDER BY ordinal_position
    `);
    finalResult.rows.forEach(r => {
      console.log(`  - ${r.column_name} (${r.data_type}) ${r.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE'}`);
    });

    console.log('\n✅ Wallets table fixed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

fixWallets();

