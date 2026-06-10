'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Globe, Lock, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Toggles users.donor_stats_public for the signed-in user (users_update_self
 * RLS scopes the write to their own row). Public = anyone may read aggregate
 * donor stats via get_donor_stats(); private (default) = owner/admin only.
 */
export function DonorPrivacyToggle({
  userId,
  initial,
}: {
  userId: string;
  initial: boolean;
}) {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    const next = !isPublic;
    setIsPublic(next); // optimistic — UI flips instantly
    setBusy(true);
    try {
      // .select().single() verifies the write actually PERSISTED: a silent
      // 0-row no-op (RLS mismatch) or a missing column can't masquerade as
      // success anymore — both revert with a precise error.
      const { data, error } = await createClient()
        .from('users')
        .update({ donor_stats_public: next })
        .eq('id', userId)
        .select('donor_stats_public')
        .single();

      if (error || data?.donor_stats_public !== next) {
        setIsPublic(!next); // revert
        const missingColumn =
          error?.code === '42703' || (error?.message ?? '').includes('donor_stats_public');
        toast.error(
          missingColumn
            ? "Ma'lumotlar bazasi yangilanmagan (donor-profiles.sql migratsiyasi kerak)"
            : error?.message ?? "Saqlanmadi — qayta urinib ko'ring"
        );
        return;
      }

      toast.success(next ? 'Statistika ommaviy qilindi' : 'Statistika maxfiy qilindi');
      router.refresh(); // keep the server-rendered profile state in sync
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={isPublic}
      title={isPublic ? 'Statistikangiz hammaga ko\'rinadi' : 'Statistikangiz faqat sizga ko\'rinadi'}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-60 ${
        isPublic
          ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 hover:bg-brand-100'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isPublic ? (
        <Globe className="w-3.5 h-3.5" />
      ) : (
        <Lock className="w-3.5 h-3.5" />
      )}
      {isPublic ? 'Ommaviy' : 'Maxfiy'}
    </button>
  );
}
