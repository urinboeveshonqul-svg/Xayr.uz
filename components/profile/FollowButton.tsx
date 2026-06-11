'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Users, UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

/**
 * Follow/unfollow a creator + live follower count. Self-following is hidden in
 * the UI and blocked at the DB layer (check constraint + RLS); duplicates are
 * blocked by the unique constraint (23505 treated as already-following).
 * Guests are sent to login.
 */
export function FollowButton({ creatorId }: { creatorId: string }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const [{ data: { user } }, { count: c }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('creator_followers')
          .select('*', { count: 'exact', head: true })
          .eq('creator_id', creatorId),
      ]);
      if (!active) return;
      setCount(c ?? 0);
      setUserId(user?.id ?? null);
      if (user) {
        const { data } = await supabase
          .from('creator_followers')
          .select('id')
          .eq('creator_id', creatorId)
          .eq('follower_id', user.id)
          .maybeSingle();
        if (active) setFollowing(!!data);
      }
      if (active) setLoaded(true);
    })();
    return () => { active = false; };
  }, [creatorId]);

  const toggle = async () => {
    if (busy) return;
    if (!userId) {
      router.push(`/${locale}/auth/login`);
      return;
    }
    const next = !following;
    setFollowing(next); // optimistic
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    setBusy(true);
    try {
      const supabase = createClient();
      if (next) {
        const { error } = await supabase
          .from('creator_followers')
          .insert({ follower_id: userId, creator_id: creatorId });
        // 23505 = already following → treat as success.
        if (error && error.code !== '23505') throw error;
      } else {
        const { error } = await supabase
          .from('creator_followers')
          .delete()
          .eq('follower_id', userId)
          .eq('creator_id', creatorId);
        if (error) throw error;
      }
    } catch {
      setFollowing(!next); // revert
      setCount((c) => Math.max(0, c + (next ? -1 : 1)));
      toast.error(t('ux.errGeneric'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-400 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" />
        {count} {t('ux.followers')}
      </span>

      {/* Hidden on your own profile card (self-follow also blocked in DB) */}
      {loaded && userId !== creatorId && (
        <button
          onClick={toggle}
          disabled={busy}
          aria-pressed={following}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-60 ${
            following
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              : 'bg-brand-600 text-white hover:bg-brand-700 shadow'
          }`}
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : following ? (
            <UserCheck className="w-4 h-4" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          {following ? t('ux.following') : t('ux.follow')}
        </button>
      )}
    </div>
  );
}
