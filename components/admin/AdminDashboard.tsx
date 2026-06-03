'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, ExternalLink, Clock, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, CATEGORY_CONFIG, timeAgo } from '@/lib/utils';
import type { Campaign } from '@/types';

interface AdminDashboardProps {
  pendingCampaigns: Campaign[];
}

export function AdminDashboard({ pendingCampaigns }: AdminDashboardProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(pendingCampaigns);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const updateStatus = async (id: string, status: 'active' | 'rejected') => {
    setLoadingId(id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('campaigns')
        .update({ status })
        .eq('id', id);

      if (error) {
        toast.error('Xatolik: ' + error.message);
        return;
      }

      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      toast.success(
        status === 'active' ? 'Kampaniya tasdiqlandi!' : 'Kampaniya rad etildi.'
      );
    } catch {
      toast.error('Kutilmagan xatolik yuz berdi');
    } finally {
      setLoadingId(null);
    }
  };

  if (campaigns.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
          Kutilayotgan kampaniyalar yo'q
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Barcha kampaniyalar ko'rib chiqildi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary badge */}
      <div className="flex items-center gap-2 mb-6">
        <span className="badge bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
          <Clock className="w-3 h-3" />
          {campaigns.length} ta kutilmoqda
        </span>
      </div>

      {campaigns.map((campaign) => {
        const cat = CATEGORY_CONFIG[campaign.category];
        const isLoading = loadingId === campaign.id;

        return (
          <div key={campaign.id} className="card p-5">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Thumbnail */}
              <div className="relative w-full sm:w-32 h-24 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center text-4xl">
                {campaign.image_url ? (
                  <Image
                    src={campaign.image_url}
                    alt={campaign.title}
                    fill
                    className="object-cover"
                    sizes="128px"
                  />
                ) : (
                  cat.emoji
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-start gap-2 mb-1">
                  <span className={`badge ${cat.color}`}>
                    {cat.emoji} {cat.label}
                  </span>
                  {campaign.is_urgent && (
                    <span className="badge bg-red-500 text-white">🆘 Shoshilinch</span>
                  )}
                </div>

                <h3 className="font-bold text-gray-900 dark:text-white text-base leading-snug mb-1 truncate">
                  {campaign.title}
                </h3>

                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                  {campaign.description}
                </p>

                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
                  <span>🎯 Maqsad: {formatMoney(campaign.goal)} so'm</span>
                  {campaign.location && <span>📍 {campaign.location}</span>}
                  <span>🕐 {timeAgo(campaign.created_at)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex sm:flex-col gap-2 flex-shrink-0">
                <Link
                  href={`/campaigns/${campaign.slug}`}
                  target="_blank"
                  className="btn-ghost text-xs gap-1 border border-gray-200 dark:border-gray-700"
                  title="Ko'rish"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Ko'rish
                </Link>

                <button
                  onClick={() => updateStatus(campaign.id, 'active')}
                  disabled={isLoading}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl
                             bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400
                             hover:bg-green-100 dark:hover:bg-green-900/40 font-semibold text-xs
                             transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  Tasdiqlash
                </button>

                <button
                  onClick={() => updateStatus(campaign.id, 'rejected')}
                  disabled={isLoading}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl
                             bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400
                             hover:bg-red-100 dark:hover:bg-red-900/40 font-semibold text-xs
                             transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  Rad etish
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
