import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const REASONS = ['fraud', 'misleading', 'spam', 'other'] as const;

const submitSchema = z.object({
  campaignId: z.string().uuid(),
  reason: z.enum(REASONS),
  details: z.string().max(1000).optional(),
});

const resolveSchema = z.object({
  id: z.string().uuid(),
});

// POST — authenticated user submits a flag.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  const { campaignId, reason, details } = parsed.data;

  // Confirm the campaign exists and is visible.
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .single();
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  // Prevent duplicate pending flags from the same user for the same campaign.
  const { data: existing } = await supabase
    .from('campaign_flags')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('reporter_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'already_reported' }, { status: 409 });
  }

  const { error } = await supabase.from('campaign_flags').insert({
    campaign_id: campaignId,
    reporter_id: user.id,
    reason,
    details: details?.trim() || null,
  });
  if (error) return NextResponse.json({ error: 'Could not submit report' }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 201 });
}

// PATCH — admin marks a flag as resolved.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify admin role.
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });

  // Use service-role client to bypass RLS for the update.
  const admin = createAdminClient();
  const { error } = await admin
    .from('campaign_flags')
    .update({ status: 'resolved', resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq('id', parsed.data.id);
  if (error) return NextResponse.json({ error: 'Could not resolve flag' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
