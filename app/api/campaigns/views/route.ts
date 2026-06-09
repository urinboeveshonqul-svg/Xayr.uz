import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Records a campaign view. Anti-spam is layered:
 *   - the client beacon only POSTs once per browser per ~6h (localStorage),
 *   - the campaign owner is excluded here,
 *   - a per-IP+campaign rate limit (fails open) backstops scripted inflation.
 * The actual increment is a SECURITY DEFINER RPC so the protected `views`
 * column can be updated without bumping `updated_at`.
 */
export async function POST(request: Request) {
  let campaignId: string | null = null;
  try {
    const body = await request.json();
    if (typeof body?.campaignId === 'string') campaignId = body.campaignId;
  } catch {
    /* malformed body → handled below */
  }
  if (!campaignId || !UUID.test(campaignId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    const [{ data: { user } }, { data: campaign }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('campaigns').select('user_id').eq('id', campaignId).single(),
    ]);

    if (!campaign) return NextResponse.json({ ok: false }, { status: 404 });

    // Don't count the owner viewing their own campaign.
    if (user && user.id === campaign.user_id) {
      return NextResponse.json({ ok: true, counted: false });
    }

    // Backstop against refresh/scripted spam (per visitor IP + campaign).
    const rl = await enforceRateLimit('views', `${getClientIp(request)}:${campaignId}`);
    if (!rl.success) {
      return NextResponse.json({ ok: true, counted: false });
    }

    await supabase.rpc('increment_campaign_views', { p_campaign_id: campaignId });
    return NextResponse.json({ ok: true, counted: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
