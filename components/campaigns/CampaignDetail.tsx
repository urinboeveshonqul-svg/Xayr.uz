'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Clock, Users, MapPin, Calendar, Share2, Heart,
  ChevronLeft, Zap, CheckCircle, CheckCircle2, CalendarX, Send, Facebook, Link2, MessageCircle
} from 'lucide-react';
import { formatMoney, formatMoneyFull, getProgress, daysLeft, CATEGORY_CONFIG, timeAgo, isCampaignEnded, isGoalReached } from '@/lib/utils';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Gallery } from '@/components/ui/Gallery';
import { Avatar } from '@/components/ui/Avatar';
import { DonationForm } from '@/components/donations/DonationForm';
import { ReportCampaignButton } from '@/components/campaigns/ReportCampaignButton';
import { SaveButton } from '@/components/campaigns/SaveButton';
import { ShareModal } from '@/components/campaigns/ShareModal';
import { FollowButton } from '@/components/profile/FollowButton';
import { useI18n } from '@/components/i18n/I18nProvider';
import { trackShare, shareLinks } from '@/lib/share';
import type { Campaign, Donor } from '@/types';

interface CampaignDetailProps {
  campaign: Campaign;
  donors: Donor[];
}

export function CampaignDetail({ campaign, donors }: CampaignDetailProps) {
  const { t, locale } = useI18n();
  const [showDonation, setShowDonation] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  // Mobile sticky donate bar: appears after scrolling past the hero.
  const [showSticky, setShowSticky] = useState(false);
  const donateCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShareUrl(window.location.href);
  }, []);

  useEffect(() => {
    // Passive listener; setState bails out unless the threshold flips, so
    // scrolling causes no re-renders beyond the two transitions.
    const onScroll = () => {
      const next = window.scrollY > 400;
      setShowSticky((s) => (s === next ? s : next));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const donateFromSticky = () => {
    setShowDonation(true);
    donateCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const pct = getProgress(campaign.current_amount, campaign.goal_amount);
  const days = daysLeft(campaign.deadline);
  const cat = CATEGORY_CONFIG[campaign.categories?.slug ?? 'other'];

  // Donations are closed once the campaign is archived or past its deadline.
  // "Successfully Funded" when the goal was met, otherwise "Campaign Ended".
  const ended = isCampaignEnded(campaign.status, campaign.deadline);
  const goalReached = isGoalReached(campaign.current_amount, campaign.goal_amount);

  // Cover + additional images, deduped — one gallery for everything.
  const galleryImages = [
    ...new Set([campaign.image_url, ...(campaign.images ?? [])].filter((s): s is string => !!s)),
  ];

  const badges = (
    <div className="absolute top-4 left-4 flex gap-2 z-10">
      <span className={`badge ${cat.color}`}><cat.Icon className="w-3.5 h-3.5" /> {cat.label}</span>
      {campaign.is_urgent && (
        <span className="badge bg-red-500 text-white">
          <Zap className="w-3 h-3" /> {t('ux.urgent')}
        </span>
      )}
    </div>
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl || window.location.href);
      trackShare(campaign.id, 'copy_link');
      toast.success(t('ux.linkCopied'));
    } catch {
      /* clipboard unavailable */
    }
  };

  // Native device share sheet (WhatsApp/Telegram/Instagram/SMS/Email/…) with a
  // custom modal fallback when the Web Share API is unavailable (most desktops).
  const handleShare = async () => {
    const url = shareUrl || window.location.href;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: campaign.title, text: campaign.description, url });
        trackShare(campaign.id, 'native');
      } catch {
        /* user dismissed the share sheet — not an error */
      }
    } else {
      setShowShare(true);
    }
  };

  const links = shareLinks(shareUrl || (typeof window !== 'undefined' ? window.location.href : ''), campaign.title);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back */}
      <Link href="/campaigns" className="btn-ghost mb-6 inline-flex">
        <ChevronLeft className="w-4 h-4" />
        {t('ux.allCampaigns')}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Gallery: main viewer + thumbnail strip + lightbox + mobile swipe */}
          <div className="card overflow-hidden">
            {galleryImages.length > 0 ? (
              <Gallery images={galleryImages} alt={campaign.title} priority overlay={badges} />
            ) : (
              <div className="relative h-72 sm:h-96 bg-gray-100 dark:bg-gray-800">
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <cat.Icon className="w-24 h-24" />
                </div>
                {badges}
              </div>
            )}

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
                {t('ux.story')}
              </h2>
              <div className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                {campaign.story}
              </div>
            </div>
          )}

          {/* Meta info */}
          <div className="card p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {t('ux.aboutCampaign')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {campaign.location && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{t('ux.location')}</p>
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
                    <p className="text-xs text-gray-400">{t('ux.deadline')}</p>
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
                  <p className="text-xs text-gray-400">{t('ux.createdAt')}</p>
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
                      <Avatar src={d.donor_avatar} name={name} className="w-9 h-9 text-xs" />
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
          <div ref={donateCardRef} className="card p-6 sticky top-24">
            {/* Stats */}
            <div className="mb-5">
              <div className="text-3xl font-black text-brand-600 mb-1">
                {formatMoneyFull(campaign.current_amount)}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatMoneyFull(campaign.goal_amount)} {t('ux.ofGoal')}
              </p>
            </div>

            <ProgressBar raised={campaign.current_amount} goal={campaign.goal_amount} className="mb-4" />

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="text-center">
                <div className="text-xl font-bold text-gray-900 dark:text-white">{pct}%</div>
                <div className="text-xs text-gray-400">{t('ux.collected')}</div>
              </div>
              <div className="text-center border-x border-gray-100 dark:border-gray-800">
                <div className="text-xl font-bold text-gray-900 dark:text-white">{campaign.donors_count}</div>
                <div className="text-xs text-gray-400">{t('ux.donors')}</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {days !== null ? (days > 0 ? days : '0') : '∞'}
                </div>
                <div className="text-xs text-gray-400">{t('ux.daysLeft')}</div>
              </div>
            </div>

            {/* Donate button — replaced by an "ended" notice once the campaign is
                archived or past its deadline (donations are disabled). */}
            {ended ? (
              <div
                className={`rounded-2xl p-4 text-center ${
                  goalReached
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40'
                    : 'bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800'
                }`}
              >
                {goalReached ? (
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto mb-2" />
                ) : (
                  <CalendarX className="w-7 h-7 text-gray-400 mx-auto mb-2" />
                )}
                <p className={`text-sm font-bold ${goalReached ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-200'}`}>
                  {goalReached ? t('detail.fundedTitle') : t('detail.endedTitle')}
                </p>
                <p className="text-xs text-gray-500 mt-1">{t('detail.endedNote')}</p>
              </div>
            ) : !showDonation ? (
              <button
                onClick={() => setShowDonation(true)}
                className="btn-primary w-full text-base py-4 min-h-[56px] lg:min-h-0 lg:py-3"
              >
                <Heart className="w-5 h-5" />
                {t('ux.donate')}
              </button>
            ) : (
              <DonationForm
                campaignId={campaign.id}
                onClose={() => setShowDonation(false)}
              />
            )}

            {/* Save (bookmark) — reuses the shared SaveButton */}
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-2 text-center">{t('ux.saveLbl')}</p>
              <div className="flex justify-center">
                <SaveButton campaignId={campaign.id} />
              </div>
            </div>

            {/* Share buttons */}
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-2 text-center">{t('ux.share')}</p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={handleShare}
                  className="w-11 h-11 lg:w-10 lg:h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 hover:text-brand-600 hover:bg-brand-50 flex items-center justify-center transition-all"
                  title={t('ux.share')}
                  aria-label={t('ux.share')}
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <a
                  href={links.whatsapp}
                  onClick={() => trackShare(campaign.id, 'whatsapp')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-11 h-11 lg:w-10 lg:h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 hover:text-green-600 hover:bg-green-50 flex items-center justify-center transition-all"
                  title="WhatsApp"
                  aria-label="WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                </a>
                <a
                  href={links.telegram}
                  onClick={() => trackShare(campaign.id, 'telegram')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-11 h-11 lg:w-10 lg:h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 hover:text-blue-500 hover:bg-blue-50 flex items-center justify-center transition-all"
                  title="Telegram"
                  aria-label="Telegram"
                >
                  <Send className="w-4 h-4" />
                </a>
                <a
                  href={links.facebook}
                  onClick={() => trackShare(campaign.id, 'facebook')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-11 h-11 lg:w-10 lg:h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center transition-all"
                  title="Facebook"
                  aria-label="Facebook"
                >
                  <Facebook className="w-4 h-4" />
                </a>
                <button
                  onClick={copyLink}
                  className="w-11 h-11 lg:w-10 lg:h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 hover:text-brand-600 hover:bg-brand-50 flex items-center justify-center transition-all"
                  title={t('ux.copyLink')}
                  aria-label={t('ux.copyLink')}
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
                <Avatar
                  src={campaign.profiles.avatar_url}
                  name={campaign.profiles.full_name}
                  className="w-12 h-12 text-lg"
                />
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 dark:text-white truncate">
                    {campaign.profiles.full_name ?? 'Foydalanuvchi'}
                  </p>
                  {campaign.profiles.username && (
                    <Link
                      href={`/${locale}/u/${campaign.profiles.username}`}
                      className="text-xs text-gray-400 hover:text-brand-600 transition-colors truncate block"
                    >
                      @{campaign.profiles.username}
                    </Link>
                  )}
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <CheckCircle className="w-3 h-3 text-brand-600" /> {t('ux.verified')}
                  </p>
                </div>
              </div>
              {campaign.profiles.bio && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 leading-relaxed">
                  {campaign.profiles.bio}
                </p>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <FollowButton creatorId={campaign.user_id} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile sticky donate bar — sits above the bottom nav; hides while the
          donation form is open. Desktop unchanged (lg:hidden). */}
      {showSticky && !showDonation && !ended && (
        <div className="lg:hidden fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3 pb-2 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-brand-600 truncate">
                {formatMoneyFull(campaign.current_amount)}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-1.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-gray-500 flex-shrink-0">{pct}%</span>
              </div>
            </div>
            <button
              onClick={handleShare}
              className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
              title={t('ux.share')}
              aria-label={t('ux.share')}
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button
              onClick={donateFromSticky}
              className="btn-primary px-5 min-h-[48px] flex-shrink-0"
            >
              <Heart className="w-4 h-4" />
              {t('ux.donate')}
            </button>
          </div>
        </div>
      )}

      {/* Share modal — primary entry on desktop, Web Share fallback on mobile */}
      {showShare && (
        <ShareModal
          campaignId={campaign.id}
          title={campaign.title}
          imageUrl={campaign.image_url}
          url={shareUrl || (typeof window !== 'undefined' ? window.location.href : '')}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
