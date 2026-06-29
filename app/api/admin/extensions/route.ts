import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Admin approve/reject of a campaign extension.
 *
 * Why a server route instead of a direct client RPC: approving reactivates the
 * campaign (expired → active), which must rejoin the ONE cached surface — the
 * ISR homepage (featured/trending/active grid, `revalidate = 60`). Only a
 * server context can call revalidatePath, so we do it here. Every other surface
 * (detail page, listings, search, Saved, Recently Viewed, dashboards, related)
 * is dynamically rendered and already reflects the in-place status update on the
 * next load — no campaign record is duplicated and the ID/slug never change.
 *
 * The underlying SECURITY DEFINER RPCs enforce `is_admin()` themselves; the
 * role check here is defense-in-depth and lets us 403 early.
 */
const schema = z.object({
  action: z.enum(['approve', 'reject']),
  requestId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  }
  const { action, requestId, reason } = parsed.data;

  if (action === 'reject') {
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'reason_required' }, { status: 422 });
    }
    // Reject keeps the campaign expired → nothing cached changes.
    const { error } = await supabase.rpc('reject_campaign_extension', {
      p_request_id: requestId,
      p_note: reason.trim(),
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  // Approve → reactivates the campaign (the RPC also notifies owner + donors).
  const { error } = await supabase.rpc('approve_campaign_extension', { p_request_id: requestId });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Invalidate the only cached surface so the reactivated campaign reappears in
  // featured/trending immediately. The campaign page is dynamic already; we
  // revalidate it too so any future caching there can't go stale.
  revalidatePath('/[locale]', 'page');
  revalidatePath('/[locale]/campaigns/[slug]', 'page');

  return NextResponse.json({ ok: true });
}
