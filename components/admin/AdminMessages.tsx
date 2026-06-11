'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Mail, CheckCheck, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/utils';

export interface ContactMessageRow {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

export function AdminMessages({ initial }: { initial: ContactMessageRow[] }) {
  const [rows, setRows] = useState<ContactMessageRow[]>(initial);
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = rows.filter((r) => filter === 'all' || !r.is_read);
  const unreadCount = rows.filter((r) => !r.is_read).length;

  // Admin-only update via RLS (cm_update_admin).
  const markRead = async (id: string) => {
    setBusyId(id);
    try {
      const { error } = await createClient()
        .from('contact_messages')
        .update({ is_read: true })
        .eq('id', id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setRows((p) => p.map((r) => (r.id === id ? { ...r, is_read: true } : r)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {(['unread', 'all'] as const).map((fl) => (
          <button
            key={fl}
            onClick={() => setFilter(fl)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              filter === fl
                ? 'bg-brand-600 text-white shadow'
                : 'text-gray-600 dark:text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20'
            }`}
          >
            {fl === 'unread' ? `O'qilmagan${unreadCount > 0 ? ` (${unreadCount})` : ''}` : 'Barchasi'}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card p-12 text-center">
          <Mail className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">Xabarlar yo&apos;q</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((m) => (
            <article
              key={m.id}
              className={`card p-5 ${!m.is_read ? 'border-l-4 border-l-brand-500' : 'opacity-70'}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 dark:text-white truncate">
                    {m.subject || '—'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {m.name} ·{' '}
                    <a href={`mailto:${m.email}`} className="text-brand-600 hover:underline">
                      {m.email}
                    </a>{' '}
                    · {timeAgo(m.created_at)}
                  </p>
                </div>
                {!m.is_read && (
                  <button
                    onClick={() => markRead(m.id)}
                    disabled={busyId === m.id}
                    className="btn-ghost text-xs px-3 py-1.5 flex-shrink-0 flex items-center gap-1"
                  >
                    {busyId === m.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCheck className="w-3.5 h-3.5" />
                    )}
                    O&apos;qildi
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                {m.message}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
