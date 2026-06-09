'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/utils';
import type { Notification } from '@/types';

/**
 * Full notifications page list. Initial rows are fetched server-side (RLS-scoped)
 * and passed in; interactions (mark-read / mark-all) use the browser client under
 * the existing notifications_update_own policy. No DB schema changes.
 */
export function NotificationsView({
  initial,
  userId,
  locale,
}: {
  initial: Notification[];
  userId: string;
  locale: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>(initial);
  const unread = items.filter((n) => !n.is_read).length;

  const markRead = async (n: Notification) => {
    if (n.is_read) return;
    const supabase = createClient();
    await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
    setItems((p) => p.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
  };

  const onItemClick = async (n: Notification) => {
    await markRead(n);
    if (n.link) router.push(`/${locale}${n.link}`);
  };

  const markAll = async () => {
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    setItems((p) => p.map((x) => ({ ...x, is_read: true })));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-title flex items-center gap-2">
          <Bell className="w-6 h-6 text-brand-600" />
          Bildirishnomalar
          {unread > 0 && <span className="text-base font-semibold text-gray-400">({unread})</span>}
        </h1>
        {unread > 0 && (
          <button onClick={markAll} className="btn-ghost text-sm gap-1.5">
            <CheckCheck className="w-4 h-4" />
            Barchasini o&apos;qildi
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card p-12 text-center text-gray-500 dark:text-gray-400">
          Hozircha bildirishnomalar yo&apos;q
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => onItemClick(n)}
              className={`w-full text-left card p-4 flex gap-3 hover:shadow-md transition-all ${
                !n.is_read ? 'border-l-4 border-l-brand-500' : ''
              }`}
            >
              <span
                className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                  n.is_read ? 'bg-gray-300' : 'bg-brand-500'
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{n.title}</p>
                {n.body && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{n.body}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
