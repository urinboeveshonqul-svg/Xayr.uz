import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { verifyTurnstile, tokenFromBody } from '@/lib/turnstile';
import { getClientIp } from '@/lib/rate-limit';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';

/**
 * Campaign creation. The row insert is routed server-side so it can be
 * Turnstile-gated (previously inserted directly from the client). Images are
 * still uploaded client-side to the own-folder-scoped storage bucket; their
 * public URLs are passed here.
 *
 * Authorization is unchanged: the insert runs under the user's own session
 * (cookie-based client), so the KYC RLS gate (campaigns_insert_own requires
 * verified KYC or admin) and the protected-field / publish triggers all still
 * apply. slug + category_id are derived server-side (never trusted from client).
 */
const schema = z.object({
  title: z.string().min(10).max(120),
  description: z.string().min(30).max(500),
  story: z.string().max(20000).nullable().optional(),
  category: z.enum(['medical', 'education', 'disaster', 'community', 'environment', 'animal', 'sport', 'other']),
  goal: z.number().int().min(100000).max(100_000_000_000),
  location: z.string().max(120).nullable().optional(),
  deadline: z.string().max(10).nullable().optional(),
  is_urgent: z.boolean().optional().default(false),
  image_url: z.string().url(),
  images: z.array(z.string().url()).max(10).optional().default([]),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const ts = await verifyTurnstile(tokenFromBody(body), getClientIp(request));
  if (!ts.success) {
    return NextResponse.json({ error: 'captcha_failed' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  }
  const d = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolve category server-side; never trust a client-sent category_id.
  const { data: cat } = await supabase.from('categories').select('id').eq('slug', d.category).maybeSingle();

  const slug = `${slugify(d.title)}-${Date.now().toString(36)}`;

  // Insert under the user's session so RLS (KYC gate) + triggers enforce.
  const { error } = await supabase.from('campaigns').insert({
    user_id: user.id,
    title: d.title,
    slug,
    description: d.description,
    story: d.story || null,
    category_id: cat?.id ?? null,
    goal_amount: d.goal,
    deadline: d.deadline || null,
    location: d.location || null,
    is_urgent: !!d.is_urgent,
    image_url: d.image_url,
    images: d.images ?? [],
    status: 'pending',
  });
  if (error) {
    // Most likely the KYC RLS gate denied the insert.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, slug }, { status: 201 });
}
