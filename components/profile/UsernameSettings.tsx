'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { AtSign, Check, X, Loader2, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

type Avail = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
const COOLDOWN_DAYS = 30;

/**
 * Profile → Username settings. Reuses the existing backend only:
 *   - availability  → GET /api/auth/username-available (is_username_available RPC)
 *   - change        → change_username() RPC (enforces format/reserved/unique/30-day)
 * No schema or RPC changes. After a successful change we router.refresh() so the
 * navbar, profile, and any server-rendered user data update immediately.
 */
export function UsernameSettings({
  initialUsername,
  changedAt,
}: {
  initialUsername: string | null;
  changedAt: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const [current, setCurrent] = useState(initialUsername ?? '');
  const [lastChanged, setLastChanged] = useState<string | null>(changedAt);
  const [value, setValue] = useState(initialUsername ?? '');
  const [avail, setAvail] = useState<Avail>('idle');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // 30-day cooldown: when was it last changed, and when can it change again?
  const nextChange = useMemo(
    () => (lastChanged ? new Date(new Date(lastChanged).getTime() + COOLDOWN_DAYS * 86400000) : null),
    [lastChanged]
  );
  const locked = !!nextChange && nextChange.getTime() > Date.now();
  const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('uz-UZ');

  const normalized = value.toLowerCase().trim();
  const unchanged = normalized === current.toLowerCase();

  // Live availability — debounced, skipped while locked or unchanged.
  useEffect(() => {
    setSuggestions([]);
    if (locked || unchanged) { setAvail('idle'); return; }
    if (!normalized) { setAvail('idle'); return; }
    if (!/^[a-z0-9_.]{3,30}$/.test(normalized)) { setAvail('invalid'); return; }
    setAvail('checking');
    const h = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/username-available?u=${encodeURIComponent(normalized)}`);
        const json = await res.json();
        if (json.available) {
          setAvail('available');
        } else {
          setAvail('taken');
          const year = new Date().getFullYear();
          setSuggestions([`${normalized}1`, `${normalized}_uz`, `${normalized}${year}`]);
        }
      } catch {
        setAvail('idle');
      }
    }, 400);
    return () => clearTimeout(h);
  }, [normalized, locked, unchanged]);

  const canSave = !saving && !locked && !unchanged && avail === 'available';

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { data, error } = await createClient().rpc('change_username', { new_name: normalized });
      if (error) {
        const map: Record<string, string> = {
          username_change_too_soon: t('dash.unCooldown'),
          username_taken: t('auth.usernameTaken'),
          invalid_username: t('auth.vUsername'),
          reserved_username: t('dash.unReserved'),
        };
        const key = Object.keys(map).find((k) => error.message.includes(k));
        toast.error(key ? map[key] : t('dash.unError'));
        return;
      }
      const saved = data ?? normalized;
      setCurrent(saved);
      setValue(saved);
      setLastChanged(new Date().toISOString());
      setAvail('idle');
      toast.success(t('dash.unSaved'));
      router.refresh(); // navbar + server-rendered user data update immediately
    } catch {
      toast.error(t('dash.unError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0">
          <AtSign className="w-4 h-4 text-brand-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">{t('dash.unTitle')}</h2>
          <p className="text-xs text-gray-400">
            {t('dash.unCurrent')}: <span className="font-semibold">@{current || '—'}</span>
          </p>
        </div>
      </div>

      {/* Input */}
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">@</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={locked || saving}
          type="text"
          autoCapitalize="none"
          spellCheck={false}
          className="input pl-8 pr-10 lowercase disabled:opacity-60"
          placeholder={t('auth.usernamePlaceholder')}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {locked && <Lock className="w-4 h-4 text-gray-400" />}
          {!locked && avail === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          {!locked && avail === 'available' && <Check className="w-4 h-4 text-green-600" />}
          {!locked && (avail === 'taken' || avail === 'invalid') && <X className="w-4 h-4 text-red-500" />}
        </span>
      </div>

      {/* Status line */}
      {!locked && avail === 'available' && (
        <p className="text-green-600 text-xs mt-1">✓ {t('auth.usernameAvailable')}</p>
      )}
      {!locked && avail === 'invalid' && <p className="text-red-500 text-xs mt-1">{t('auth.vUsername')}</p>}
      {!locked && avail === 'taken' && (
        <div className="mt-1.5">
          <p className="text-red-500 text-xs">{t('auth.usernameTaken')}</p>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setValue(s)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400 hover:bg-brand-100 transition-colors"
                >
                  @{s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cooldown info */}
      <div className="mt-3 text-xs text-gray-400 space-y-0.5">
        {lastChanged && (
          <p>{t('dash.unLastChanged')}: {fmtDate(lastChanged)}</p>
        )}
        {locked && nextChange && (
          <p className="text-yellow-600 dark:text-yellow-500">
            {t('dash.unCooldown')} {t('dash.unNextChange')}: {fmtDate(nextChange)}
          </p>
        )}
      </div>

      <button onClick={save} disabled={!canSave} className="btn-primary w-full sm:w-auto px-6 py-2.5 mt-4">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {t('dash.unSave')}
      </button>
    </div>
  );
}
