import { Metadata } from 'next';
import { Mail } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminMessages, type ContactMessageRow } from '@/components/admin/AdminMessages';

export const metadata: Metadata = { title: 'Murojaatlar — Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminMessagesPage() {
  const admin = createAdminClient();

  const { data } = await admin
    .from('contact_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  const messages: ContactMessageRow[] = data ?? [];
  const unread = messages.filter((m) => !m.is_read).length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
          <Mail className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900 dark:text-white">Murojaatlar</h2>
          <p className="text-sm text-gray-500">
            {unread > 0 ? `${unread} ta o'qilmagan xabar` : "O'qilmagan xabarlar yo'q"}
          </p>
        </div>
      </div>

      <AdminMessages initial={messages} />
    </div>
  );
}
