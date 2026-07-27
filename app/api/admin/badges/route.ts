import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminBadgeCounts } from '@/lib/admin/badges';

export const runtime = 'nodejs';
// Badge counts are live open-work numbers — never cache them.
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/badges → every admin nav badge count in ONE request.
 *
 * The counts themselves are computed in lib/admin/badges.ts (the same function
 * the /admin layout uses for the initial server render), so the number a badge
 * shows after a client refresh is produced by identical logic to the one it was
 * first rendered with.
 *
 * Auth mirrors the other admin routes: session user + server-side role check.
 * Returns only integers — no campaign, user, donation or message data.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const counts = await getAdminBadgeCounts();
  return NextResponse.json(counts, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
