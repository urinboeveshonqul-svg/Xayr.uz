'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export interface EditableCampaign {
  id: string;
  slug: string;
  title: string;
  description: string;
  story: string | null;
  goal_amount: number;
  location: string | null;
  deadline: string | null;
}

/**
 * Owner edit form for content fields. Protected columns (status,
 * current_amount, donors_count, views) are untouchable at the DB layer
 * (field-guard trigger), and RLS limits row access to the owner/manager —
 * so this form can only ever change safe content fields.
 */
export function EditCampaignForm({ campaign, locale }: { campaign: EditableCampaign; locale: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(campaign.title);
  const [description, setDescription] = useState(campaign.description);
  const [story, setStory] = useState(campaign.story ?? '');
  const [goal, setGoal] = useState(String(campaign.goal_amount));
  const [location, setLocation] = useState(campaign.location ?? '');
  const [deadline, setDeadline] = useState(campaign.deadline ? campaign.deadline.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const goalNum = Math.floor(Number(goal));
    if (title.trim().length < 5) { toast.error("Sarlavha kamida 5 ta belgidan iborat bo'lsin"); return; }
    if (description.trim().length < 10) { toast.error("Tavsif kamida 10 ta belgidan iborat bo'lsin"); return; }
    if (!goalNum || goalNum <= 0) { toast.error("Maqsad summasi noto'g'ri"); return; }

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
        })
        .eq('id', campaign.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Kampaniya yangilandi');
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
          <input type="number" min={1} value={goal} onChange={(e) => setGoal(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Muddat (ixtiyoriy)</label>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="input" />
        </div>
      </div>

      <div>
        <label className="label">Joylashuv (ixtiyoriy)</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} className="input" />
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
