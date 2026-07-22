'use client';

import { useState } from 'react';
import { FileText, PlusCircle, Clock } from 'lucide-react';
import { CreateCampaignForm } from './CreateCampaignForm';
import { useI18n } from '@/components/i18n/I18nProvider';
import { draftDisplayTitle } from '@/lib/drafts';
import type { CampaignCategory, CampaignDraft } from '@/types';

/**
 * Entry point for the create page. When the user already has an unfinished draft
 * it offers "Continue Draft" or "Start New Campaign" before rendering the form.
 * A `?draft=<id>` deep link (from the Drafts list) resumes that draft directly.
 */
export function CreateCampaignClient({
  userId,
  categories,
  drafts,
  initialDraftId = null,
}: {
  userId: string;
  categories: { id: string; slug: CampaignCategory }[];
  drafts: CampaignDraft[];
  initialDraftId?: string | null;
}) {
  const { t, locale } = useI18n();

  const preselected = initialDraftId ? drafts.find((d) => d.id === initialDraftId) ?? null : null;
  const [mode, setMode] = useState<'choose' | 'new' | 'continue'>(
    preselected ? 'continue' : drafts.length > 0 ? 'choose' : 'new'
  );
  const [draft, setDraft] = useState<CampaignDraft | null>(preselected);

  if (mode === 'choose') {
    const latest = drafts[0];
    return (
      <div className="card p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('draft.resumeTitle')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('draft.resumeHint')}</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="font-semibold text-gray-900 dark:text-white truncate">
            {draftDisplayTitle(latest, t('draft.untitled'))}
          </p>
          <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
            <Clock className="w-3.5 h-3.5" />
            {t('draft.lastEdited').replace('{time}', new Date(latest.updated_at).toLocaleString(locale))}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => { setDraft(latest); setMode('continue'); }}
            className="btn-primary flex-1 py-3 inline-flex items-center justify-center gap-2"
          >
            <FileText className="w-5 h-5" /> {t('draft.continueDraft')}
          </button>
          <button
            type="button"
            onClick={() => { setDraft(null); setMode('new'); }}
            className="btn-ghost flex-1 py-3 inline-flex items-center justify-center gap-2"
          >
            <PlusCircle className="w-5 h-5" /> {t('draft.startNew')}
          </button>
        </div>

        {drafts.length > 1 && (
          <p className="text-xs text-gray-400 text-center">
            {t('draft.moreInList').replace('{n}', String(drafts.length))}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8">
      <CreateCampaignForm userId={userId} categories={categories} initialDraft={draft} />
    </div>
  );
}
