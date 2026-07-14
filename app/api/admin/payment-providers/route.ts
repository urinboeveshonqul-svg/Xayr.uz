import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PROVIDER_IDS } from '@/lib/payments/providers-meta';

export const runtime = 'nodejs';

const schema = z.object({
  id: z.string().refine((v) => PROVIDER_IDS.includes(v), 'Unknown provider'),
  enabled: z.boolean().optional(),
  coming_soon: z.boolean().optional(),
  priority: z.number().int().min(0).max(10_000).optional(),
  is_default: z.literal(true).optional(), // default is only ever set, never unset directly
});

/**
 * Update payment provider settings (admin-only). Availability itself is
 * resolved server-side by lib/payments/catalog.ts — an admin can enable a
 * provider here, but it only becomes selectable once its implementation and
 * merchant credentials exist (fail-safe).
 */
export async function POST(request: Request) {
  // 1) Authenticate + RBAC (server-verified, never trusted from the client).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2) Validate input.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  }
  const { id, enabled, coming_soon, priority, is_default } = parsed.data;

  // 3) Apply with the service role. Upsert so the route works even if a future
  //    provider id hasn't been seeded by the migration yet.
  const admin = createAdminClient();

  if (is_default) {
    // Single default: clear the flag everywhere first.
    const { error: clearErr } = await admin
      .from('payment_provider_settings')
      .update({ is_default: false })
      .eq('is_default', true);
    if (clearErr) {
      return NextResponse.json({ error: 'Could not update settings' }, { status: 500 });
    }
  }

  const { error } = await admin.from('payment_provider_settings').upsert(
    {
      id,
      ...(enabled !== undefined ? { enabled } : {}),
      ...(coming_soon !== undefined ? { coming_soon } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(is_default ? { is_default: true } : {}),
    },
    { onConflict: 'id' }
  );
  if (error) {
    // Most likely the settings table doesn't exist yet (migration #47 pending).
    return NextResponse.json({ error: 'Could not update settings' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
