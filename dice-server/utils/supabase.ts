import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

// Use Aqua's Supabase credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseAdmin: SupabaseClient | null = null;
let supabasePublic: SupabaseClient | null = null;

try {
  if (supabaseUrl && supabaseServiceKey) {
    // Service role client for admin operations (backend only)
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log('[SUPABASE] Admin client initialized with Aqua credentials');
  } else {
    console.warn('[SUPABASE] Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).');
    console.warn('[SUPABASE] Chat and Aqua wallet integration will not work.');
  }

  // Public client for frontend (if needed)
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && publishableKey) {
    supabasePublic = createClient(supabaseUrl, publishableKey);
    console.log('[SUPABASE] Public client initialized');
  }
} catch (error: any) {
  console.error('[SUPABASE] Error initializing Supabase clients:', error.message);
  console.warn('[SUPABASE] Chat feature will not work. Continuing without Supabase.');
}

export { supabaseAdmin, supabasePublic };
