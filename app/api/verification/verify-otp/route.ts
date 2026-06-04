import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashOtp } from '@/lib/otp';

export const runtime = 'nodejs';

const schema = z.object({ phone: z.string(), code: z.string().min(4).max(8) });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 422 });
  const { phone, code } = parsed.data;

  const admin = createAdminClient();
  const { data: otp } = await admin
    .from('phone_otps')
    .select('*')
    .eq('user_id', user.id)
    .eq('phone', phone.trim())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otp) return NextResponse.json({ error: 'Code not found' }, { status: 404 });
  if (new Date(otp.expires_at).getTime() < Date.now())
    return NextResponse.json({ error: 'Code expired' }, { status: 410 });
  if (otp.attempts >= 5)
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });

  if (otp.code_hash !== hashOtp(code)) {
    await admin.from('phone_otps').update({ attempts: otp.attempts + 1 }).eq('id', otp.id);
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
  }

  await admin.from('phone_otps').update({ verified: true }).eq('id', otp.id);
  return NextResponse.json({ verified: true });
}
