/**
 * AQUA Launchpad - Schema Check and Fix
 * Checks current schema and fixes column names
 */

import pg from 'pg';

const DATABASE_URL = 'postgresql://postgres:zu6j.DiaT$Q8ryw@db.rbmzrqsnsvzgoxzpynky.supabase.co:5432/postgres';

async function main() {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    
    // Check current wallets schema
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
    
    const columns = result.rows.map(r => r.column_name);
    
    // Check for camelCase columns and rename them
    const renames = [];
    
    if (columns.includes('publicKey')) renames.push(['publicKey', 'public_key']);
    if (columns.includes('sessionId')) renames.push(['sessionId', 'session_id']);
    if (columns.includes('encryptedPrivateKey')) renames.push(['encryptedPrivateKey', 'encrypted_private_key']);
    if (columns.includes('isPrimary')) renames.push(['isPrimary', 'is_primary']);
    if (columns.includes('userId')) renames.push(['userId', 'user_id']);
    if (columns.includes('createdAt')) renames.push(['createdAt', 'created_at']);
    if (columns.includes('updatedAt')) renames.push(['updatedAt', 'updated_at']);
    
    if (renames.length > 0) {
      console.log('\n🔧 Renaming columns...');
      for (const [oldName, newName] of renames) {
        console.log(`  Renaming "${oldName}" to "${newName}"...`);
        await client.query(`ALTER TABLE wallets RENAME COLUMN "${oldName}" TO ${newName}`);
      }
      console.log('✅ Column renames complete');
    } else {
      console.log('\n✅ All column names are already correct (snake_case)');
    }
    
    // Check for missing columns and add them
    const requiredColumns = [
      { name: 'session_id', type: 'TEXT' },
      { name: 'public_key', type: 'VARCHAR(44)' },
      { name: 'encrypted_private_key', type: 'TEXT' },
      { name: 'label', type: 'TEXT' },
      { name: 'is_primary', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'user_id', type: 'UUID' },
      { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()' },
      { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()' },
    ];
    
    // Refresh column list after renames
    const refreshed = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'wallets'
    `);
    const currentColumns = refreshed.rows.map(r => r.column_name);
    
    console.log('\n🔍 Checking for missing columns...');
    for (const col of requiredColumns) {
      if (!currentColumns.includes(col.name)) {
        console.log(`  Adding missing column: ${col.name}`);
        await client.query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
      }
    }
    
    // Create system_config table
    console.log('\n📦 Ensuring system_config table exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    // Enable RLS
    await client.query(`ALTER TABLE system_config ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE wallets ENABLE ROW LEVEL SECURITY`);
    
    // Create/update policies
    console.log('🔐 Setting up RLS policies...');
    
    const policies = [
      `DROP POLICY IF EXISTS "Allow wallet creation" ON wallets`,
      `DROP POLICY IF EXISTS "Allow reading own wallets" ON wallets`,
      `DROP POLICY IF EXISTS "Allow updating own wallets" ON wallets`,
      `DROP POLICY IF EXISTS "Allow deleting own wallets" ON wallets`,
      `DROP POLICY IF EXISTS "Service role access only" ON system_config`,
      `CREATE POLICY "Allow wallet creation" ON wallets FOR INSERT WITH CHECK (true)`,
      `CREATE POLICY "Allow reading own wallets" ON wallets FOR SELECT USING (true)`,
      `CREATE POLICY "Allow updating own wallets" ON wallets FOR UPDATE USING (true)`,
      `CREATE POLICY "Allow deleting own wallets" ON wallets FOR DELETE USING (true)`,
      `CREATE POLICY "Service role access only" ON system_config FOR ALL USING (true)`,
    ];
    
    for (const policy of policies) {
      try {
        await client.query(policy);
      } catch (e) {
        // Ignore policy already exists errors
      }
    }
    
    console.log('\n✅ Schema fix complete!');
    
    // Show final schema
    console.log('\n📋 Final wallets table columns:');
    const finalResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_name = 'wallets' 
      ORDER BY ordinal_position
    `);
    finalResult.rows.forEach(r => {
      console.log(`  - ${r.column_name}: ${r.data_type}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

main();

