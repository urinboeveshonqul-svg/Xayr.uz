'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { timeAgo } from '@/lib/utils';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface CommentRow {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  users: { full_name: string | null; avatar_url: string | null } | null;
}

const schema = z.object({
  content: z.string().min(1).max(2000),
});
type FormData = z.infer<typeof schema>;

export function Comments({ campaignId }: { campaignId: string }) {
  const { t, locale } = useI18n();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, user_id, users(full_name, avatar_url)')
      .eq('campaign_id', campaignId)
      .is('parent_id', null)
      .order('created_at', { ascending: false });
    setComments((data as unknown as CommentRow[]) ?? []);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    load();
  }, [load]);

  const onSubmit = async (values: FormData) => {
    const supabase = createClient();
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) {
      toast.error(t('detail.loginToComment'));
      return;
    }
    const { error } = await supabase.from('comments').insert({
      campaign_id: campaignId,
      user_id: u.id,
      content: values.content.trim(),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    reset();
    await load();
  };

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
        <MessageCircle className="w-6 h-6 text-brand-600" />
        {t('detail.commentsTitle')}
        {comments.length > 0 && (
          <span className="text-base font-semibold text-gray-400">({comments.length})</span>
        )}
      </h2>

      {/* Composer */}
      {user ? (
        <form onSubmit={handleSubmit(onSubmit)} className="card p-4 mb-6">
          <textarea
            {...register('content')}
            rows={3}
            className="input resize-none"
            placeholder={t('detail.writeComment')}
          />
          <div className="flex justify-end mt-3">
            <button type="submit" disabled={isSubmitting} className="btn-primary px-5 py-2.5">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('detail.posting')}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {t('detail.post')}
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="card p-4 mb-6 text-center text-sm">
          <Link
            href={`/${locale}/auth/login`}
            className="text-brand-600 font-semibold hover:underline"
          >
            {t('detail.loginToComment')}
          </Link>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-center text-gray-400 py-8">{t('detail.noComments')}</p>
      ) : (
        <div className="space-y-4">
          {comments.map((c) => {
            const name = c.users?.full_name ?? 'User';
            return (
              <div key={c.id} className="card p-4 flex gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">{name}</span>
                    <span className="text-xs text-gray-400">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap break-words">
                    {c.content}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
