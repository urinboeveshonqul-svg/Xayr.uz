'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Clock, Users, MapPin, Calendar, Share2, Heart,
  ChevronLeft, Zap, CheckCircle, Send, Facebook, Link2
} from 'lucide-react';
import { formatMoney, formatMoneyFull, getProgress, daysLeft, CATEGORY_CONFIG, timeAgo } from '@/lib/utils';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { DonationForm } from '@/components/donations/DonationForm';
import { ReportCampaignButton } from '@/components/campaigns/ReportCampaignButton';
import { SaveButton } from '@/components/campaigns/SaveButton';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { Campaign, Donor } from '@/types';

interface CampaignDetailProps {
  campaign: Campaign;
  donors: Donor[];
}

export function CampaignDetail({ campaign, donors }: CampaignDetailProps) {
  const { t } = useI18n();
  const [showDonation, setShowDonation] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    setShareUrl(window.location.href);
  }, []);
  const pct = getProgress(campaign.current_amount, campaign.goal_amount);
  const days = daysLeft(campaign.deadline);
  const cat = CATEGORY_CONFIG[campaign.categories?.slug ?? 'other'];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl || window.location.href);
      toast.success('Havola nusxalandi');
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: campaign.title, url: shareUrl || window.location.href });
    } else {
      await copyLink();
    }
  };

  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(campaign.title)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;

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
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <cat.Icon className="w-24 h-24" />
                </div>
              )}
              <div className="absolute top-4 left-4 flex gap-2">
                <span className={`badge ${cat.color}`}><cat.Icon className="w-3.5 h-3.5" /> {cat.label}</span>
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

          {/* Additional images */}
          {campaign.images && campaign.images.length > 0 && (
            <div className="card p-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                Rasmlar
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {campaign.images.map((src, i) => (
                  <div
                    key={i}
                    className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800"
                  >
                    <Image
                      src={src}
                      alt={`${campaign.title} ${i + 1}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, 33vw"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Donor list */}
          <div className="card p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {t('detail.recentDonors')}
            </h2>
            {donors.length === 0 ? (
              <p className="text-sm text-gray-400">{t('detail.noDonors')}</p>
            ) : (
              <ul className="space-y-3">
                {donors.map((d) => {
                  const name = d.donor_name ?? t('detail.anonymous');
                  return (
                    <li key={d.id} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{name}</p>
                        {d.message && <p className="text-xs text-gray-500 truncate">{d.message}</p>}
                      </div>
                      <span className="text-sm font-bold text-brand-600 flex-shrink-0">
                        {formatMoney(d.amount)} so&apos;m
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
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

            {/* Save (bookmark) — reuses the shared SaveButton */}
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-2 text-center">Saqlash</p>
              <div className="flex justify-center">
                <SaveButton campaignId={campaign.id} />
              </div>
            </div>

            {/* Share buttons */}
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-2 text-center">Ulashish</p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={handleShare}
                  className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 hover:text-brand-600 hover:bg-brand-50 flex items-center justify-center transition-all"
                  title="Ulashish"
                  aria-label="Ulashish"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <a
                  href={telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 hover:text-blue-500 hover:bg-blue-50 flex items-center justify-center transition-all"
                  title="Telegram"
                  aria-label="Telegram"
                >
                  <Send className="w-4 h-4" />
                </a>
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center transition-all"
                  title="Facebook"
                  aria-label="Facebook"
                >
                  <Facebook className="w-4 h-4" />
                </a>
                <button
                  onClick={copyLink}
                  className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 hover:text-brand-600 hover:bg-brand-50 flex items-center justify-center transition-all"
                  title="Havolani nusxalash"
                  aria-label="Havolani nusxalash"
                >
                  <Link2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <ReportCampaignButton campaignId={campaign.id} />
          </div>

          {/* Creator card */}
          {campaign.profiles && (
            <div className="card p-6">
              <p className="text-xs text-gray-400 mb-3">{t('detail.creatorTitle')}</p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {(campaign.profiles.full_name ?? 'U').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 dark:text-white truncate">
                    {campaign.profiles.full_name ?? 'Foydalanuvchi'}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-brand-600" /> Tasdiqlangan
                  </p>
                </div>
              </div>
              {campaign.profiles.bio && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 leading-relaxed">
                  {campaign.profiles.bio}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
