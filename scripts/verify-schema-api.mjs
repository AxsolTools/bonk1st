/**
 * AQUA Launchpad - Database Schema Verification via API
 * 
 * Verifies that all required tables and columns exist using Supabase client
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rbmzrqsnsvzgoxzpynky.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJibXpycXNuc3Z6Z294enB5bmt5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjQ0OTg2MywiZXhwIjoyMDc4MDI1ODYzfQ.2LWSL_-rKZuaRqugScUUWusupdD2a-z8SACQmcUuh9w';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function verifySchema() {
  console.log('🔍 AQUA Database Schema Verification (via API)');
  console.log('==============================================\n');

  try {
    // Test wallets table
    console.log('📋 Testing wallets table...');
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('*')
      .limit(1);
    
    if (walletsError) {
      console.log('❌ wallets table error:', walletsError.message);
    } else {
      console.log('✅ wallets table accessible');
      console.log('   Sample columns:', wallets && wallets.length > 0 ? Object.keys(wallets[0]).join(', ') : 'No rows yet');
    }

    // Test insert into wallets
    console.log('\n📝 Testing wallet insert...');
    const testSessionId = 'test_verify_' + Date.now();
    const { data: insertResult, error: insertError } = await supabase
      .from('wallets')
      .insert({
        session_id: testSessionId,
        public_key: 'TEST_KEY_' + Date.now(),
        encrypted_private_key: 'TEST_ENCRYPTED',
        label: 'Schema Test',
        is_primary: false,
      })
      .select();
    
    if (insertError) {
      console.log('❌ Insert failed:', insertError.message);
      console.log('   Details:', insertError.details);
      console.log('   Hint:', insertError.hint);
    } else {
      console.log('✅ Insert successful');
      console.log('   ID:', insertResult[0]?.id);
      
      // Clean up
      await supabase.from('wallets').delete().eq('session_id', testSessionId);
      console.log('✅ Test record cleaned up');
    }

    // Test tokens table
    console.log('\n📋 Testing tokens table...');
    const { error: tokensError } = await supabase
      .from('tokens')
      .select('*')
      .limit(1);
    
    if (tokensError) {
      console.log('❌ tokens table error:', tokensError.message);
    } else {
      console.log('✅ tokens table accessible');
    }

    // Test system_config table
    console.log('\n📋 Testing system_config table...');
    const { error: configError } = await supabase
      .from('system_config')
      .select('*')
      .limit(1);
    
    if (configError) {
      console.log('⚠️  system_config table error:', configError.message);
      console.log('   (This is expected if using Vault for salt storage)');
    } else {
      console.log('✅ system_config table accessible');
    }

    // Test token_parameters table
    console.log('\n📋 Testing token_parameters table...');
    const { error: paramsError } = await supabase
      .from('token_parameters')
      .select('*')
      .limit(1);
    
    if (paramsError) {
      console.log('❌ token_parameters table error:', paramsError.message);
    } else {
      console.log('✅ token_parameters table accessible');
    }

    // Test referrals table
    console.log('\n📋 Testing referrals table...');
    const { error: referralsError } = await supabase
      .from('referrals')
      .select('*')
      .limit(1);
    
    if (referralsError) {
      console.log('❌ referrals table error:', referralsError.message);
    } else {
      console.log('✅ referrals table accessible');
    }

    // Test token_chat table
    console.log('\n📋 Testing token_chat table...');
    const { error: chatError } = await supabase
      .from('token_chat')
      .select('*')
      .limit(1);
    
    if (chatError) {
      console.log('❌ token_chat table error:', chatError.message);
    } else {
      console.log('✅ token_chat table accessible');
    }

    // Test token_comments table
    console.log('\n📋 Testing token_comments table...');
    const { error: commentsError } = await supabase
      .from('token_comments')
      .select('*')
      .limit(1);
    
    if (commentsError) {
      console.log('❌ token_comments table error:', commentsError.message);
    } else {
      console.log('✅ token_comments table accessible');
    }

    // Test trades table
    console.log('\n📋 Testing trades table...');
    const { error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .limit(1);
    
    if (tradesError) {
      console.log('❌ trades table error:', tradesError.message);
    } else {
      console.log('✅ trades table accessible');
    }

    // Test platform_fees table
    console.log('\n📋 Testing platform_fees table...');
    const { error: feesError } = await supabase
      .from('platform_fees')
      .select('*')
      .limit(1);
    
    if (feesError) {
      console.log('❌ platform_fees table error:', feesError.message);
    } else {
      console.log('✅ platform_fees table accessible');
    }

    console.log('\n==============================================');
    console.log('Schema verification complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

verifySchema();

