import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Creator publishes / edits / removes a completion report for their own,
// COMPLETED campaign. RLS enforces ownership + admin moderation at the DB layer;
// these handlers add the "campaign must be completed" rule and input validation.

const createSchema = z.object({
  campaignId: z.string().uuid(),
  title: z.string().min(3).max(160),
  message: z.string().min(10).max(5000),
  images: z.array(z.string().url().or(z.string().min(1))).max(10).optional().default([]),
  documents: z.array(z.string().url().or(z.string().min(1))).max(10).optional().default([]),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(3).max(160).optional(),
  message: z.string().min(10).max(5000).optional(),
  images: z.array(z.string().min(1)).max(10).optional(),
  documents: z.array(z.string().min(1)).max(10).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  const { campaignId, title, message, images, documents } = parsed.data;

  // The user must be the campaign owner OR a team manager, and the campaign
  // must be completed. (RLS enforces the same at the DB layer.)
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, user_id, status')
    .eq('id', campaignId)
    .single();
  if (!campaign) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  let allowed = campaign.user_id === user.id;
  if (!allowed) {
    const { data: member } = await supabase
      .from('campaign_team_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .maybeSingle();
    allowed = member?.role === 'owner' || member?.role === 'manager';
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (campaign.status !== 'completed') {
    return NextResponse.json({ error: 'Campaign is not completed' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('campaign_reports')
    .insert({ campaign_id: campaignId, user_id: user.id, title, message, images, documents })
    .select('id')
    .single();
  if (error || !data) return NextResponse.json({ error: 'Could not create report' }, { status: 500 });

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

  // RLS restricts the update to the owner (or admin). Empty payload → no-op.
  const { error } = await supabase.from('campaign_reports').update(fields).eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not update report' }, { status: 500 });

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
