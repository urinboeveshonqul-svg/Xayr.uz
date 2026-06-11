'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Flag, Loader2, X } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

const REASONS = [
  { value: 'fraud', key: 'ux.flagFraud' },
  { value: 'misleading', key: 'ux.flagMisleading' },
  { value: 'spam', key: 'ux.flagSpam' },
  { value: 'other', key: 'ux.flagOther' },
] as const;

type Reason = (typeof REASONS)[number]['value'];

export function ReportCampaignButton({ campaignId }: { campaignId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>('fraud');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/campaigns/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, reason, details: details.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast.error(t('ux.flagAlready'));
        setOpen(false);
        return;
      }
      if (!res.ok) {
        toast.error(json.error ?? t('ux.errGeneric'));
        return;
      }
      toast.success(t('ux.flagSent'));
      setOpen(false);
      setDetails('');
      setReason('fraud');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors mt-4 mx-auto"
        type="button"
      >
        <Flag className="w-3.5 h-3.5" />
        {t('ux.flagBtn')}
      </button>

      {/* Modal backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-pop">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Flag className="w-4 h-4 text-red-500" />
                {t('ux.flagTitle')}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                aria-label="Yopish"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Reason radio group */}
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  {t('ux.flagReason')}
                </p>
                <div className="space-y-2">
                  {REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        reason === r.value
                          ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        className="accent-red-500"
                      />
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {t(r.key)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Optional details */}
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                  {t('ux.flagDetails')} <span className="font-normal text-gray-400">({t('ux.optional')})</span>
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  className="input resize-none text-sm"
                  placeholder="Muammo haqida qisqacha yozing..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-ghost flex-1 py-2.5 text-sm"
                >
                  {t('ux.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Yuborilmoqda...
                    </>
                  ) : (
                    t('ux.submit')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
