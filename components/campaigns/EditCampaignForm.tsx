'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, Save, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { isValidVideoUrl, normalizeVideoUrl } from '@/lib/video';
import { MAX_GOAL_AMOUNT, isGoalWithinLimit, isDurationWithinLimit, todayISO, maxDeadlineISO } from '@/lib/campaign-limits';

export interface EditableCampaign {
  id: string;
  slug: string;
  title: string;
  description: string;
  story: string | null;
  goal_amount: number;
  location: string | null;
  deadline: string | null;
  video_url: string | null;
  created_at: string;
}

/**
 * Owner edit form for content fields. Protected columns (status,
 * current_amount, donors_count, views) are untouchable at the DB layer
 * (field-guard trigger), and RLS limits row access to the owner/manager —
 * so this form can only ever change safe content fields.
 */
export function EditCampaignForm({ campaign, locale }: { campaign: EditableCampaign; locale: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [title, setTitle] = useState(campaign.title);
  const [description, setDescription] = useState(campaign.description);
  const [story, setStory] = useState(campaign.story ?? '');
  const [goal, setGoal] = useState(String(campaign.goal_amount));
  const [location, setLocation] = useState(campaign.location ?? '');
  const [deadline, setDeadline] = useState(campaign.deadline ? campaign.deadline.slice(0, 10) : '');
  // Optional Instagram video — editable (add / replace) or clearable (remove).
  const [videoUrl, setVideoUrl] = useState(campaign.video_url ?? '');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const goalNum = Math.floor(Number(goal));
    if (title.trim().length < 5) { toast.error(t('toasts.editTitleMin')); return; }
    if (description.trim().length < 10) { toast.error(t('toasts.editDescMin')); return; }
    if (!goalNum || goalNum <= 0) { toast.error(t('toasts.editGoalInvalid')); return; }
    // Same caps as creation apply while editing (goal ≤ 1B; duration ≤ 60 days
    // from the campaign's creation date). Mirrored by the DB trigger.
    if (!isGoalWithinLimit(goalNum)) { toast.error(t('limits.goalMax')); return; }
    if (deadline && !isDurationWithinLimit(deadline, new Date(campaign.created_at))) {
      toast.error(t('limits.durationMax'));
      return;
    }

    // Empty ⇒ remove the video. A non-empty value must be a valid Instagram link.
    const video = videoUrl.trim();
    if (video && !isValidVideoUrl(video)) { setVideoError(t('video.invalid')); toast.error(t('video.invalid')); return; }

    setSaving(true);
    try {
      const { error } = await createClient()
        .from('campaigns')
        .update({
          title: title.trim(),
          description: description.trim(),
          story: story.trim() || null,
          goal_amount: goalNum,
          location: location.trim() || null,
          deadline: deadline || null,
          video_url: video ? normalizeVideoUrl(video) : null,
        })
        .eq('id', campaign.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t('toasts.campaignUpdated'));
      router.push(`/${locale}/campaigns/${campaign.slug}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="card p-6 sm:p-8 space-y-5">
      <div>
        <label className="label">Sarlavha</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="input" />
      </div>

      <div>
        <label className="label">Qisqa tavsif</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} className="input resize-none" />
      </div>

      <div>
        <label className="label">Batafsil hikoya</label>
        <textarea value={story} onChange={(e) => setStory(e.target.value)} rows={8} maxLength={10000} className="input resize-y" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Maqsad summasi (so&apos;m)</label>
          <input type="number" min={1} max={MAX_GOAL_AMOUNT} value={goal} onChange={(e) => setGoal(e.target.value)} className="input" />
          <p className="text-xs text-gray-400 mt-1">{t('limits.goalHint')}</p>
        </div>
        <div>
          <label className="label">Muddat (ixtiyoriy)</label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            min={todayISO()}
            max={maxDeadlineISO(new Date(campaign.created_at))}
            className="input"
          />
          <p className="text-xs text-gray-400 mt-1">{t('limits.durationHint')}</p>
        </div>
      </div>

      <div>
        <label className="label">Joylashuv (ixtiyoriy)</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} className="input" />
      </div>

      <div>
        <label className="label">{t('video.fieldLabel')}</label>
        <div className="flex gap-2">
          <input
            type="url"
            inputMode="url"
            value={videoUrl}
            onChange={(e) => { setVideoUrl(e.target.value); setVideoError(null); }}
            onBlur={() => setVideoError(videoUrl.trim() && !isValidVideoUrl(videoUrl.trim()) ? t('video.invalid') : null)}
            maxLength={300}
            className="input flex-1"
            placeholder="https://www.instagram.com/reel/..."
          />
          {videoUrl.trim() && (
            <button
              type="button"
              onClick={() => { setVideoUrl(''); setVideoError(null); }}
              className="btn-ghost px-3 py-2.5 text-sm inline-flex items-center gap-1.5 flex-shrink-0"
            >
              <X className="w-4 h-4" /> {t('video.remove')}
            </button>
          )}
        </div>
        {videoError
          ? <p className="text-red-500 text-xs mt-1">{videoError}</p>
          : <p className="text-xs text-gray-400 mt-1">{t('video.fieldHint')}</p>}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/${locale}/campaigns/${campaign.slug}`)}
          className="btn-ghost px-5 py-2.5"
        >
          Bekor qilish
        </button>
        <button type="submit" disabled={saving} className="btn-primary px-6 py-2.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Saqlash
        </button>
      </div>
    </form>
  );
}
