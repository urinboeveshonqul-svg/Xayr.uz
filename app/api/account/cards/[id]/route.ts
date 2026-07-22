import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/crypto/token-cipher';
import { cardTokenDelete, isClickCardTokenConfigured } from '@/lib/payments/providers/click-card-token';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();

// Delete a saved card: best-effort revoke at Click (card_token/delete), then
// remove the row via the owner-scoped RPC. Local deletion is authoritative — if
// Click's revoke fails, the card is still gone from our side.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 });

  // Read the encrypted token (service role — the only reader of token_ciphertext),
  // scoped to this owner, so we can revoke it at Click before deleting.
  if (isClickCardTokenConfigured()) {
    try {
      const admin = createAdminClient();
      const { data: row } = await admin
        .from('saved_payment_methods')
        .select('token_ciphertext, enc_version')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (row?.token_ciphertext) {
        const token = decryptToken(row.token_ciphertext, row.enc_version ?? 1);
        await cardTokenDelete(token); // best-effort; ignore result
      }
    } catch (e) {
      console.error('[cards/delete] click revoke skipped', (e as Error).message);
    }
  }

  const { error } = await supabase.rpc('delete_card', { p_card_id: id });
  if (error) return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
