import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateOtp, hashOtp, sendOtpSms } from '@/lib/otp';

export const runtime = 'nodejs';

const schema = z.object({ phone: z.string().min(7).max(20) });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid phone' }, { status: 422 });
  const phone = parsed.data.phone.trim();

  const code = generateOtp();
  const admin = createAdminClient();

  // One active OTP per user.
  await admin.from('phone_otps').delete().eq('user_id', user.id);
  const { error } = await admin.from('phone_otps').insert({
    user_id: user.id,
    phone,
    code_hash: hashOtp(code),
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  if (error) return NextResponse.json({ error: 'Could not create code' }, { status: 500 });

  await sendOtpSms(phone, code);

  // No SMS provider wired yet → return the code in non-production for testing.
  const devCode = process.env.NODE_ENV !== 'production' ? code : undefined;
  return NextResponse.json({ sent: true, devCode });
}
