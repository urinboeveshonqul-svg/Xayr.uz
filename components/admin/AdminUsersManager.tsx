'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, ShieldCheck, Shield } from 'lucide-react';

interface AdminUser {
  id: string;
  full_name: string | null;
  email: string | null;
  role: 'user' | 'admin';
  created_at: string;
}

interface Props {
  initialUsers: AdminUser[];
  currentUserId: string;
}

export function AdminUsersManager({ initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = users.filter(
    (u) =>
      !search.trim() ||
      (u.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const setRole = async (userId: string, role: 'user' | 'admin') => {
    setBusyId(userId);
    try {
      const res = await fetch('/api/admin/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error ?? 'Xatolik');
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      toast.success('Rol yangilandi');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Ism yoki email bo'yicha qidirish..."
        className="input"
      />
      <p className="text-sm text-gray-500">{visible.length} ta foydalanuvchi</p>

      <div className="space-y-2">
        {visible.map((u) => {
          const busy = busyId === u.id;
          const isSelf = u.id === currentUserId;
          return (
            <div key={u.id} className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                {(u.full_name ?? u.email ?? 'U').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white truncate">{u.full_name ?? '—'}</p>
                <p className="text-xs text-gray-400 truncate">{u.email}</p>
              </div>
              <span
                className={`badge ${
                  u.role === 'admin'
                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                {u.role}
              </span>
              {isSelf ? (
                <span className="text-xs text-gray-300 w-20 text-center">Siz</span>
              ) : u.role === 'admin' ? (
                <button
                  onClick={() => setRole(u.id, 'user')}
                  disabled={busy}
                  className="btn-ghost text-xs gap-1 border border-gray-200 dark:border-gray-700 w-20 justify-center"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                  User
                </button>
              ) : (
                <button
                  onClick={() => setRole(u.id, 'admin')}
                  disabled={busy}
                  className="btn-ghost text-xs gap-1 border border-gray-200 dark:border-gray-700 w-20 justify-center"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  Admin
                </button>
              )}
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="card p-12 text-center text-gray-400">Foydalanuvchilar topilmadi</div>
        )}
      </div>
    </div>
  );
}
