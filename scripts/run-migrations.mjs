/**
 * AQUA Launchpad - Migration Runner
 * Runs all SQL migrations against Supabase PostgreSQL
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Database configuration
const DATABASE_URL = 'postgresql://postgres:zu6j.DiaT$Q8ryw@db.rbmzrqsnsvzgoxzpynky.supabase.co:5432/postgres';

// Migration files in order
const migrations = [
  '012-fix-column-names.sql',
  '011-fix-schema.sql',
  '002-create-users-table.sql',
  '003-create-referrals-table.sql',
  '004-create-platform-fees-table.sql',
  '005-create-token-parameters-table.sql',
  '006-create-chat-comments-tables.sql',
  '007-create-trades-price-history.sql',
  '008-create-helper-functions.sql',
  '013-create-missing-tables.sql',
  '014-setup-platform-config.sql',
  '015-add-metrics-indices.sql',
];

async function runMigration(client, filename) {
  console.log(`\n📦 Running migration: ${filename}`);
  
  const filepath = join(__dirname, filename);
  const sql = readFileSync(filepath, 'utf-8');
  
  try {
    await client.query(sql);
    console.log(`  ✅ Completed: ${filename}`);
    return { success: true };
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log(`  ⏭️  Skipped (already exists): ${filename}`);
      return { success: true, skipped: true };
    }
    console.log(`  ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runAllMigrations() {
  console.log('🚀 AQUA Launchpad - Running Database Migrations\n');
  console.log('Connecting to Supabase PostgreSQL...');
  console.log('----------------------------------------');
  
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const migration of migrations) {
      const result = await runMigration(client, migration);
      if (result.success) {
        if (result.skipped) skipped++;
        else succeeded++;
      } else {
        failed++;
      }
    }
    
    console.log('\n----------------------------------------');
    console.log(`📊 Results: ${succeeded} succeeded, ${skipped} skipped, ${failed} failed`);
    console.log('✅ Migration process completed!');
    
    console.log('\n📋 Next steps:');
    console.log('1. Enable Realtime in Supabase Dashboard for: token_chat, token_comments, tokens, trades');
    console.log('2. Configure platform fee config table with your developer wallet');
    console.log('3. Deploy the app to Digital Ocean');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  } finally {
    await client.end();
  }
}

runAllMigrations();
