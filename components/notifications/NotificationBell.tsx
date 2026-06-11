'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { timeAgo } from '@/lib/utils';
import type { Notification } from '@/types';

/**
 * Navbar notification bell: unread badge + dropdown of the latest notifications.
 * Reads/writes go through the browser Supabase client; RLS (notifications_select_own
 * / notifications_update_own) scopes everything to the signed-in user. Renders
 * nothing when logged out. No DB schema changes.
 */
export function NotificationBell() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setUserId(null);
      return;
    }
    setUserId(user.id);

    const [{ data }, { count }] = await Promise.all([
      supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false),
    ]);

    setItems(data ?? []);
    setUnread(count ?? 0);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!userId) return null;

  const toggle = () => {
    setOpen((o) => {
      if (!o) load(); // refresh when opening
      return !o;
    });
  };

  const markRead = async (n: Notification) => {
    if (n.is_read) return;
    const supabase = createClient();
    await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
    setItems((p) => p.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
  };

  const onItemClick = async (n: Notification) => {
    await markRead(n);
    setOpen(false);
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
    setUnread(0);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative p-3 rounded-xl text-gray-600 hover:text-green-600 hover:bg-green-50 transition-all"
        aria-label={t('ux.notifTitle')}
        title={t('ux.notifTitle')}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-bold text-gray-900 text-sm">{t('ux.notifTitle')}</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-semibold text-green-600 hover:underline">
                {t('ux.notifMarkAll')}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">{t('ux.notifEmpty')}</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onItemClick(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 ${
                    !n.is_read ? 'bg-green-50/50' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      n.is_read ? 'bg-transparent' : 'bg-green-500'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900 truncate">{n.title}</span>
                    {n.body && <span className="block text-xs text-gray-500 line-clamp-2">{n.body}</span>}
                    <span className="block text-[11px] text-gray-400 mt-0.5">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          <Link
            href={`/${locale}/notifications`}
            onClick={() => setOpen(false)}
            className="block text-center text-sm font-semibold text-green-600 hover:bg-gray-50 py-3 border-t border-gray-100"
          >
            {t('ux.notifViewAll')}
          </Link>
        </div>
      )}
    </div>
  );
}
