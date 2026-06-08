'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, Megaphone, Plus, Send, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/utils';

interface UpdateRow {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

const schema = z.object({
  title: z.string().min(1, 'Sarlavha kiritilishi shart').max(200),
  content: z.string().min(1, 'Matn kiritilishi shart').max(5000),
});
type FormData = z.infer<typeof schema>;

interface CampaignUpdatesProps {
  campaignId: string;
  campaignUserId: string;
  isOwner: boolean;
  initialUpdates: UpdateRow[];
}

export function CampaignUpdates({
  campaignId,
  campaignUserId,
  isOwner,
  initialUpdates,
}: CampaignUpdatesProps) {
  const [updates, setUpdates] = useState<UpdateRow[]>(initialUpdates);
  const [showForm, setShowForm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('campaign_updates')
      .select('id, title, content, created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    setUpdates((data as UpdateRow[]) ?? []);
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async (values: FormData) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Kirish talab qilinadi');
      return;
    }
    const { error } = await supabase.from('campaign_updates').insert({
      campaign_id: campaignId,
      user_id: campaignUserId,
      title: values.title.trim(),
      content: values.content.trim(),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Yangilik qo'shildi');
    reset();
    setShowForm(false);
    await load();
  };

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-brand-600" />
          Yangiliklar
          {updates.length > 0 && (
            <span className="text-base font-semibold text-gray-400">({updates.length})</span>
          )}
        </h2>

        {isOwner && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary px-4 py-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Yangilik qo'shish
          </button>
        )}
      </div>

      {/* Post form — owner only */}
      {isOwner && showForm && (
        <form onSubmit={handleSubmit(onSubmit)} className="card p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">Yangi yangilik</h3>
            <button
              type="button"
              onClick={() => { setShowForm(false); reset(); }}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Yopish"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div>
            <input
              {...register('title')}
              type="text"
              placeholder="Sarlavha"
              className="input"
            />
            {errors.title && (
              <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>
            )}
          </div>

          <div>
            <textarea
              {...register('content')}
              rows={4}
              placeholder="Yangilik matni..."
              className="input resize-none"
            />
            {errors.content && (
              <p className="text-xs text-red-500 mt-1">{errors.content.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); reset(); }}
              className="btn-ghost px-4 py-2 text-sm"
            >
              Bekor qilish
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-primary px-5 py-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saqlanmoqda...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  E'lon qilish
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Update list */}
      {updates.length === 0 ? (
        <p className="text-center text-gray-400 py-8">Hozircha yangiliklar yo'q</p>
      ) : (
        <div className="space-y-4">
          {updates.map((u) => (
            <article key={u.id} className="card p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-bold text-gray-900 dark:text-white leading-snug">
                  {u.title}
                </h3>
                <time
                  dateTime={u.created_at}
                  className="text-xs text-gray-400 flex-shrink-0 pt-0.5"
                  title={new Date(u.created_at).toLocaleString('uz-UZ')}
                >
                  {timeAgo(u.created_at)}
                </time>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {u.content}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
