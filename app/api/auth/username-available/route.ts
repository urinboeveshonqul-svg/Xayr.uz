import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Live username availability for the registration form.
 *   GET /api/auth/username-available?u=<candidate>
 * Format is validated here and reserved/taken via the is_username_available RPC
 * (SECURITY DEFINER). Returns { available, reason }.
 */
export async function GET(request: Request) {
  const u = (new URL(request.url).searchParams.get('u') || '').toLowerCase().trim();

  if (!/^[a-z0-9_.]{3,30}$/.test(u)) {
    return NextResponse.json({ available: false, reason: 'invalid' });
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc('is_username_available', { candidate: u });
    return NextResponse.json({ available: data === true, reason: data === true ? 'ok' : 'taken' });
  } catch {
    return NextResponse.json({ available: false, reason: 'error' });
  }
}
