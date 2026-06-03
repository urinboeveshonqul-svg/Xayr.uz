import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types';

/**
 * Service-role Supabase client. SERVER-ONLY — it bypasses Row Level Security,
 * so it must never be imported into a Client Component or shipped to the browser.
 * Used by the donation API + payment webhooks to write tamper-proof records.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
