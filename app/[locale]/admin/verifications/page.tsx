import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AdminVerifications,
  type VerificationRow,
  type VerificationHistoryRow,
} from '@/components/admin/AdminVerifications';

export const metadata: Metadata = { title: 'Tasdiqlash — Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminVerificationsPage() {
  const admin = createAdminClient();

  // NOTE: verification_requests has two FKs to users (user_id, reviewed_by),
  // so the embed MUST be disambiguated with `users!user_id`.
  const [{ data: pendingData }, { data: historyData }] = await Promise.all([
    admin
      .from('verification_requests')
      .select('id, user_id, legal_name, date_of_birth, address, phone, status, created_at, users!user_id(email, full_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('verification_requests')
      .select('id, legal_name, status, rejection_reason, reviewed_at, created_at, users!user_id(email, full_name)')
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const pending = (pendingData as unknown as VerificationRow[]) ?? [];
  const history = (historyData as unknown as VerificationHistoryRow[]) ?? [];

  return <AdminVerifications initial={pending} history={history} />;
}
