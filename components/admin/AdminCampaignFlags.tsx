'use client';

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ExternalLink, CheckCircle2, Loader2, Flag } from 'lucide-react';
import { timeAgo } from '@/lib/utils';

const REASON_LABEL: Record<string, string> = {
  fraud: 'Firibgarlik',
  misleading: "Noto'g'ri ma'lumot",
  spam: 'Spam',
  other: 'Boshqa',
};

export interface FlagRow {
  id: string;
  campaign_id: string;
  reason: string;
  details: string | null;
  status: 'pending' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  campaigns: { title: string; slug: string } | null;
  reporter: { full_name: string | null } | null;
}

interface Props {
  initialFlags: FlagRow[];
  locale: string;
}

export function AdminCampaignFlags({ initialFlags, locale }: Props) {
  const [flags, setFlags] = useState<FlagRow[]>(initialFlags);
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = flags.filter((f) => filter === 'all' || f.status === filter);

  const resolve = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch('/api/campaigns/flag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Xatolik yuz berdi');
        return;
      }
      setFlags((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, status: 'resolved', resolved_at: new Date().toISOString() }
            : f
        )
      );
      toast.success('Shikoyat hal etildi');
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = flags.filter((f) => f.status === 'pending').length;

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(['pending', 'resolved', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              filter === s
                ? 'bg-brand-600 text-white shadow'
                : 'text-gray-600 dark:text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20'
            }`}
          >
            {s === 'pending' ? `Kutilmoqda${pendingCount > 0 ? ` (${pendingCount})` : ''}` : s === 'resolved' ? "Hal qilingan" : 'Barchasi'}
          </button>
        ))}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="card p-12 text-center">
          <Flag className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">Shikoyatlar yo'q</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((f) => (
            <div
              key={f.id}
              className={`card p-5 flex flex-col sm:flex-row sm:items-start gap-4 ${
                f.status === 'resolved' ? 'opacity-60' : ''
              }`}
            >
              {/* Status indicator */}
              <div className="flex-shrink-0 mt-0.5">
                {f.status === 'pending' ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 block mt-1" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Campaign link */}
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                    {REASON_LABEL[f.reason] ?? f.reason}
                  </span>
                  {f.campaigns && (
                    <Link
                      href={`/${locale}/campaigns/${f.campaigns.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-gray-900 dark:text-white hover:text-brand-600 flex items-center gap-1 truncate"
                    >
                      {f.campaigns.title}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </Link>
                  )}
                </div>

                {/* Reporter + time */}
                <p className="text-xs text-gray-400 mb-2">
                  {f.reporter?.full_name ?? 'Anonim'} · {timeAgo(f.created_at)}
                  {f.resolved_at && ` · Hal qilindi: ${timeAgo(f.resolved_at)}`}
                </p>

                {/* Optional details */}
                {f.details && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {f.details}
                  </p>
                )}
              </div>

              {/* Resolve action */}
              {f.status === 'pending' && (
                <button
                  onClick={() => resolve(f.id)}
                  disabled={busyId === f.id}
                  className="btn-ghost text-sm px-4 py-2 flex-shrink-0 flex items-center gap-1.5"
                >
                  {busyId === f.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                  Hal qilish
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
