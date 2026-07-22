import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// List the authenticated user's active saved cards — DISPLAY fields only.
// token_ciphertext is column-REVOKEd from `authenticated`, so it can never be
// selected here; RLS scopes rows to the owner.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  const { data, error } = await supabase
    .from('saved_payment_methods')
    .select('id, provider, card_brand, last4, card_holder, is_default, created_at, last_used_at')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ cards: [] });
  return NextResponse.json({ cards: data ?? [] });
}
