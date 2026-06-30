import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Creator submits / edits a completion report for their own COMPLETED campaign.
// Reports are MODERATED (completion-reports-v2.sql): a guard trigger forces new
// or edited reports to 'pending', and only an admin can approve them. These
// handlers add the "campaign completed", "summary >= 200 chars", and
// "reported total <= total withdrawn" rules; RLS + the trigger enforce the rest.

const fundItem = z.object({
  category: z.string().min(1).max(60),
  description: z.string().max(300).optional().default(''),
  amount: z.number().int().min(0).max(100_000_000_000),
});
const timelineItem = z.object({
  label: z.string().min(1).max(120),
  date: z.string().min(1).max(40),
});
const beneficiary = z.enum([
  'successfully_completed', 'ongoing_recovery', 'project_finished', 'project_delayed', 'other',
]);
const media = z.array(z.string().min(1)).max(20).optional().default([]);

const baseFields = {
  title: z.string().min(3).max(160),
  message: z.string().min(200).max(5000),
  images: media,
  documents: media,
  videos: media,
  before_images: media,
  after_images: media,
  fund_breakdown: z.array(fundItem).max(50).optional().default([]),
  timeline: z.array(timelineItem).max(30).optional().default([]),
  beneficiary_status: beneficiary.nullable().optional(),
};

const createSchema = z.object({ campaignId: z.string().uuid(), ...baseFields });
const patchSchema = z.object({ id: z.string().uuid(), ...baseFields });

/** Total successfully-withdrawn (paid payouts) for a campaign — the report cap. */
async function totalWithdrawn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignId: string,
): Promise<number> {
  const { data } = await supabase
    .from('payout_requests')
    .select('amount, status')
    .eq('campaign_id', campaignId)
    .eq('status', 'paid');
  return (data ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  const { campaignId, ...fields } = parsed.data;

  // Owner or team manager, and the campaign must be completed.
  const { data: campaign } = await supabase
    .from('campaigns').select('id, user_id, status').eq('id', campaignId).single();
  if (!campaign) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let allowed = campaign.user_id === user.id;
  if (!allowed) {
    const { data: member } = await supabase
      .from('campaign_team_members').select('role')
      .eq('campaign_id', campaignId).eq('user_id', user.id).maybeSingle();
    allowed = member?.role === 'owner' || member?.role === 'manager';
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (campaign.status !== 'completed') {
    return NextResponse.json({ error: 'Campaign is not completed' }, { status: 409 });
  }

  // One report per campaign — edit the existing one (PATCH) instead of creating a 2nd.
  const { data: existingReport } = await supabase
    .from('campaign_reports').select('id').eq('campaign_id', campaignId).limit(1).maybeSingle();
  if (existingReport) {
    return NextResponse.json({ error: 'report_exists' }, { status: 409 });
  }

  const reported = fields.fund_breakdown.reduce((s, i) => s + i.amount, 0);
  if (reported > (await totalWithdrawn(supabase, campaignId))) {
    return NextResponse.json({ error: 'reported_exceeds_withdrawn' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('campaign_reports')
    .insert({ campaign_id: campaignId, user_id: user.id, ...fields })
    .select('id')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not create report' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  const { id, ...fields } = parsed.data;

  // Enforce the reported-total cap against the report's campaign.
  const { data: existing } = await supabase
    .from('campaign_reports').select('campaign_id').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const reported = fields.fund_breakdown.reduce((s, i) => s + i.amount, 0);
  if (reported > (await totalWithdrawn(supabase, existing.campaign_id))) {
    return NextResponse.json({ error: 'reported_exceeds_withdrawn' }, { status: 409 });
  }

  // RLS limits the update to the owner; the guard trigger re-sets status to
  // 'pending' and blocks edits to an already-approved report ('report_locked').
  const { error } = await supabase.from('campaign_reports').update(fields).eq('id', id);
  if (error) {
    const locked = error.message.includes('report_locked');
    return NextResponse.json(
      { error: locked ? 'report_locked' : 'Could not update report' },
      { status: locked ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // RLS allows the owner OR an admin to delete; anyone else is a no-op.
  const { error } = await supabase.from('campaign_reports').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not delete report' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
