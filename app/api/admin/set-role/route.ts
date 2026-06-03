import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const schema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['user', 'admin']),
});

export async function POST(request: Request) {
  // 1) Authenticate the caller.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2) RBAC: the caller must be an admin (verified server-side, not trusted from client).
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3) Validate input.
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
  const { userId, role } = parsed.data;

  // 4) Guard against self-lockout.
  if (userId === user.id) {
    return NextResponse.json({ error: "O'z rolingizni o'zgartirib bo'lmaydi" }, { status: 400 });
  }

  // 5) Apply with the service role (clients cannot write the role column).
  const admin = createAdminClient();
  const { error } = await admin.from('users').update({ role }).eq('id', userId);
  if (error) {
    return NextResponse.json({ error: 'Could not update role' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
