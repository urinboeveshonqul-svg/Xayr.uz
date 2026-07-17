'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Users, UserPlus, Trash2, Loader2, Crown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/Avatar';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { TeamRole } from '@/types';

export interface TeamMemberRow {
  id: string;
  user_id: string;
  role: TeamRole;
  full_name: string | null;
  avatar_url: string | null;
}

const ROLE_BADGE: Record<TeamRole, string> = {
  owner: 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400',
  manager: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  editor: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

/**
 * Campaign team roster (public) + owner-only management: invite by email
 * (manager/editor only), change roles, remove members. The 'owner' row is
 * trigger-managed and immutable — RLS blocks any client write to it, so the
 * controls simply aren't rendered for it.
 */
export function CampaignTeam({
  campaignId,
  members,
  isOwner,
}: {
  campaignId: string;
  members: TeamMemberRow[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const roleLabel: Record<TeamRole, string> = {
    owner: t('ux.roleOwner'),
    manager: t('ux.roleManager'),
    editor: t('ux.roleEditor'),
  };
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<TeamRole, 'owner'>>('editor');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (members.length === 0 && !isOwner) return null;

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: u } = await supabase
        .from('users')
        .select('id')
        .eq('email', target)
        .maybeSingle();
      if (!u) {
        toast.error(t('toasts.teamUserNotFound'));
        return;
      }
      const { error } = await supabase
        .from('campaign_team_members')
        .insert({ campaign_id: campaignId, user_id: u.id, role });
      if (error) {
        toast.error(error.code === '23505' ? t('toasts.teamAlready') : t('toasts.generic'));
        return;
      }
      toast.success(t('toasts.teamAdded'));
      setEmail('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (memberId: string, next: Exclude<TeamRole, 'owner'>) => {
    setBusyId(memberId);
    try {
      const { error } = await createClient()
        .from('campaign_team_members')
        .update({ role: next })
        .eq('id', memberId);
      if (error) {
        toast.error(t('toasts.generic'));
        return;
      }
      toast.success(t('toasts.teamRoleChanged'));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (memberId: string) => {
    if (!window.confirm(t('toasts.teamRemoveConfirm'))) return;
    setBusyId(memberId);
    try {
      const { error } = await createClient()
        .from('campaign_team_members')
        .delete()
        .eq('id', memberId);
      if (error) {
        toast.error(t('toasts.generic'));
        return;
      }
      toast.success(t('toasts.teamRemoved'));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card p-6 mb-6">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Users className="w-5 h-5 text-brand-600" />
        {t('ux.teamTitle')}
        {members.length > 0 && (
          <span className="text-sm font-semibold text-gray-400">({members.length})</span>
        )}
      </h2>

      {/* Roster */}
      <ul className="space-y-3">
        {members.map((m) => {
          const name = m.full_name ?? 'Foydalanuvchi';
          return (
            <li key={m.id} className="flex items-center gap-3">
              <Avatar src={m.avatar_url} name={name} className="w-9 h-9 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate flex items-center gap-1.5">
                  {name}
                  {m.role === 'owner' && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                </p>
              </div>

              <span className={`badge ${ROLE_BADGE[m.role]}`}>{roleLabel[m.role]}</span>

              {/* Owner-only controls; owner row is immutable (RLS-enforced too) */}
              {isOwner && m.role !== 'owner' && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <select
                    value={m.role}
                    disabled={busyId === m.id}
                    onChange={(e) => changeRole(m.id, e.target.value as Exclude<TeamRole, 'owner'>)}
                    className="input py-1 text-xs w-28"
                  >
                    <option value="manager">Menejer</option>
                    <option value="editor">Muharrir</option>
                  </select>
                  <button
                    onClick={() => remove(m.id)}
                    disabled={busyId === m.id}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Jamoadan chiqarish"
                    aria-label="Jamoadan chiqarish"
                  >
                    {busyId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Invite (owner only) */}
      {isOwner && (
        <form onSubmit={invite} className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="A'zo emaili"
            className="input flex-1 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Exclude<TeamRole, 'owner'>)}
            className="input sm:w-32 text-sm"
          >
            <option value="editor">Muharrir</option>
            <option value="manager">Menejer</option>
          </select>
          <button type="submit" disabled={busy || !email.trim()} className="btn-primary px-4 py-2 text-sm">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Qo&apos;shish
          </button>
        </form>
      )}
    </section>
  );
}
