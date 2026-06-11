'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Bookmark } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { loadSavedIds, markSaved } from '@/lib/saved-campaigns';

/**
 * Toggle a campaign in the user's saved_campaigns. Rendered inside the card's
 * <Link>, so clicks must not navigate — we stop propagation + prevent default.
 */
export function SaveButton({
  campaignId,
  initialSaved,
}: {
  campaignId: string;
  initialSaved?: boolean;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [saved, setSaved] = useState(initialSaved ?? false);
  const [busy, setBusy] = useState(false);

  // Resolve initial state from the shared cache unless the parent provided it.
  useEffect(() => {
    if (initialSaved !== undefined) return;
    let active = true;
    loadSavedIds().then((set) => {
      if (active) setSaved(set.has(campaignId));
    });
    return () => { active = false; };
  }, [campaignId, initialSaved]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/${locale}/auth/login?next=/campaigns`);
      return;
    }

    const next = !saved;
    setSaved(next); // optimistic
    setBusy(true);
    try {
      if (next) {
        const { error } = await supabase
          .from('saved_campaigns')
          .insert({ user_id: user.id, campaign_id: campaignId });
        // 23505 = unique violation → already saved, treat as success.
        if (error && error.code !== '23505') throw error;
        toast.success(t('ux.savedToast'));
      } else {
        const { error } = await supabase
          .from('saved_campaigns')
          .delete()
          .eq('user_id', user.id)
          .eq('campaign_id', campaignId);
        if (error) throw error;
        toast.success(t('ux.unsavedToast'));
      }
      await markSaved(campaignId, next);
    } catch {
      setSaved(!next); // revert
      toast.error(t('ux.errGeneric'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? 'Saqlanganlardan olib tashlash' : 'Saqlash'}
      title={saved ? 'Saqlanganlardan olib tashlash' : 'Saqlash'}
      className="w-9 h-9 rounded-full bg-white/95 backdrop-blur-md shadow-lg flex items-center justify-center transition-all hover:scale-110 disabled:opacity-60"
    >
      <Bookmark
        className={`w-4 h-4 transition-colors ${
          saved ? 'fill-brand-600 text-brand-600' : 'text-gray-600'
        }`}
      />
    </button>
  );
}
