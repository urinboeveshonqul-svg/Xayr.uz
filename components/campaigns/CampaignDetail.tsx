'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import {
  Clock, Users, MapPin, Calendar, Share2, Heart,
  ChevronLeft, Zap, CheckCircle
} from 'lucide-react';
import { formatMoneyFull, getProgress, daysLeft, CATEGORY_CONFIG, timeAgo } from '@/lib/utils';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { DonationForm } from '@/components/donations/DonationForm';
import type { Campaign } from '@/types';

interface CampaignDetailProps {
  campaign: Campaign;
}

export function CampaignDetail({ campaign }: CampaignDetailProps) {
  const [showDonation, setShowDonation] = useState(false);
  const pct = getProgress(campaign.current_amount, campaign.goal_amount);
  const days = daysLeft(campaign.deadline);
  const cat = CATEGORY_CONFIG[campaign.categories?.slug ?? 'other'];

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: campaign.title, url: window.location.href });
    } else {
      await navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back */}
      <Link href="/campaigns" className="btn-ghost mb-6 inline-flex">
        <ChevronLeft className="w-4 h-4" />
        Barcha kampaniyalar
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Image */}
          <div className="card overflow-hidden">
            <div className="relative h-72 sm:h-96 bg-gray-100 dark:bg-gray-800">
              {campaign.image_url ? (
                <Image
                  src={campaign.image_url}
                  alt={campaign.title}
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 1024px) 100vw, 66vw"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-8xl">
                  {cat.emoji}
                </div>
              )}
              <div className="absolute top-4 left-4 flex gap-2">
                <span className={`badge ${cat.color}`}>{cat.emoji} {cat.label}</span>
                {campaign.is_urgent && (
                  <span className="badge bg-red-500 text-white">
                    <Zap className="w-3 h-3" /> Shoshilinch
                  </span>
                )}
              </div>
            </div>

            <div className="p-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3 leading-tight">
                {campaign.title}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                {campaign.description}
              </p>
            </div>
          </div>

          {/* Story */}
          {campaign.story && (
            <div className="card p-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                Batafsil ma'lumot
              </h2>
              <div className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                {campaign.story}
              </div>
            </div>
          )}

          {/* Meta info */}
          <div className="card p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Kampaniya haqida
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {campaign.location && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Joylashuv</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{campaign.location}</p>
                  </div>
                </div>
              )}
              {campaign.deadline && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Muddat</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {new Date(campaign.deadline).toLocaleDateString('uz-UZ')}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Yaratilgan</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {timeAgo(campaign.created_at)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Donation card */}
          <div className="card p-6 sticky top-24">
            {/* Stats */}
            <div className="mb-5">
              <div className="text-3xl font-black text-brand-600 mb-1">
                {formatMoneyFull(campaign.current_amount)}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatMoneyFull(campaign.goal_amount)} maqsaddan
              </p>
            </div>

            <ProgressBar raised={campaign.current_amount} goal={campaign.goal_amount} className="mb-4" />

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="text-center">
                <div className="text-xl font-bold text-gray-900 dark:text-white">{pct}%</div>
                <div className="text-xs text-gray-400">To'plandi</div>
              </div>
              <div className="text-center border-x border-gray-100 dark:border-gray-800">
                <div className="text-xl font-bold text-gray-900 dark:text-white">{campaign.donors_count}</div>
                <div className="text-xs text-gray-400">Donorlar</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {days !== null ? (days > 0 ? days : '0') : '∞'}
                </div>
                <div className="text-xs text-gray-400">Kun qoldi</div>
              </div>
            </div>

            {/* Donate button */}
            {!showDonation ? (
              <button
                onClick={() => setShowDonation(true)}
                className="btn-primary w-full text-base py-3"
              >
                <Heart className="w-5 h-5" />
                Xayriya qilish
              </button>
            ) : (
              <DonationForm
                campaignId={campaign.id}
                onClose={() => setShowDonation(false)}
              />
            )}

            {/* Share */}
            <button
              onClick={handleShare}
              className="btn-secondary w-full mt-3"
            >
              <Share2 className="w-4 h-4" />
              Ulashish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
