'use client';

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ExternalLink, Trash2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils';
import type { Campaign, CampaignStatus } from '@/types';

const STATUSES: { value: CampaignStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Barchasi' },
  { value: 'pending', label: 'Kutilmoqda' },
  { value: 'active', label: 'Faol' },
  { value: 'paused', label: "To'xtatilgan" },
  { value: 'rejected', label: 'Rad etilgan' },
  { value: 'completed', label: 'Yakunlangan' },
];

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  active: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  paused: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  completed: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
};

interface Props {
  initialCampaigns: Campaign[];
  locale: string;
}

export function AdminCampaignsManager({ initialCampaigns, locale }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [filter, setFilter] = useState<CampaignStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = campaigns.filter(
    (c) =>
      (filter === 'all' || c.status === filter) &&
      (!search.trim() || c.title.toLowerCase().includes(search.toLowerCase()))
  );

  // Admins can update/delete any campaign (RLS: is_admin()).
  const setStatus = async (id: string, status: CampaignStatus) => {
    setBusyId(id);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('campaigns').update({ status }).eq('id', id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
      toast.success('Holat yangilandi');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Kampaniyani butunlay o'chirishni tasdiqlaysizmi?")) return;
    setBusyId(id);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      toast.success("O'chirildi");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sarlavha bo'yicha qidirish..."
          className="input flex-1"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as CampaignStatus | 'all')}
          className="input sm:w-48"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500">{visible.length} ta kampaniya</p>

      <div className="space-y-3">
        {visible.map((c) => {
          const busy = busyId === c.id;
          return (
            <div key={c.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`badge ${STATUS_BADGE[c.status] ?? ''}`}>{c.status}</span>
                  {c.is_urgent && <span className="badge bg-red-500 text-white">🆘</span>}
                </div>
                <p className="font-semibold text-gray-900 dark:text-white truncate">{c.title}</p>
                <p className="text-xs text-gray-400">
                  {formatMoney(c.current_amount)} / {formatMoney(c.goal_amount)} so&apos;m · {c.donors_count} donor
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={c.status}
                  disabled={busy}
                  onChange={(e) => setStatus(c.id, e.target.value as CampaignStatus)}
                  className="input py-1.5 text-xs w-36"
                >
                  {STATUSES.filter((s) => s.value !== 'all').map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <Link
                  href={`/${locale}/campaigns/${c.slug}`}
                  target="_blank"
                  className="btn-ghost p-2 border border-gray-200 dark:border-gray-700"
                  title="Ko'rish"
                >
                  <ExternalLink className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => remove(c.id)}
                  disabled={busy}
                  className="p-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                  title="O'chirish"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="card p-12 text-center text-gray-400">Kampaniyalar topilmadi</div>
        )}
      </div>
    </div>
  );
}
