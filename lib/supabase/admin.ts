/**
 * AQUA Launchpad - Supabase Admin Client
 * 
 * Uses service role key for privileged operations like:
 * - Vault access for encryption salt
 * - Service-level data operations
 * - Bypassing RLS when needed
 */

import { createClient } from '@supabase/supabase-js';

// Singleton admin client
let adminClient: ReturnType<typeof createClient> | null = null;

/**
 * Get or create the Supabase admin client
 * Uses the service role key for elevated permissions
 */
export function getAdminClient() {
  if (adminClient) {
    return adminClient;
  }
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase configuration. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    );
  }
  
  adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  
  return adminClient;
}

/**
 * Execute a function with the admin client
 * Provides type safety and error handling
 */
export async function withAdminClient<T>(
  fn: (client: ReturnType<typeof createClient>) => Promise<T>
): Promise<T> {
  const client = getAdminClient();
  return fn(client);
}

