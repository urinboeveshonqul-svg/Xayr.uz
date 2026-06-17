import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminUsersManager } from '@/components/admin/AdminUsersManager';

export const metadata: Metadata = { title: 'Foydalanuvchilar — Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('id, full_name, email, role, email_confirmed, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  const users =
    (data as { id: string; full_name: string | null; email: string | null; role: 'user' | 'admin'; email_confirmed: boolean; created_at: string }[]) ?? [];

  return <AdminUsersManager initialUsers={users} currentUserId={user?.id ?? ''} />;
}
