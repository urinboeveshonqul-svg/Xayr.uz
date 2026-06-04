'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Loader2, Upload, ArrowLeft, ArrowRight, ShieldCheck, Camera,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

const MAX = 5 * 1024 * 1024;
type DocType = 'id_front' | 'id_back' | 'selfie';

export function VerificationWizard({ userId }: { userId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const folder = useState(() => Date.now().toString(36))[0];

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 — personal details
  const [legalName, setLegalName] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  // Steps 2–3 — identity documents + selfie
  const [paths, setPaths] = useState<Record<DocType, string | null>>({ id_front: null, id_back: null, selfie: null });
  const [previews, setPreviews] = useState<Record<DocType, string | null>>({ id_front: null, id_back: null, selfie: null });
  const [uploading, setUploading] = useState<DocType | null>(null);

  const upload = async (file: File, type: DocType) => {
    if (file.size > MAX) { toast.error('Max 5MB'); return; }
    setUploading(type);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${userId}/${folder}/${type}.${ext}`;
      const { error } = await supabase.storage
        .from('verification-documents')
        .upload(path, file, { upsert: true });
      if (error) { toast.error(error.message); return; }
      setPaths((p) => ({ ...p, [type]: path }));
      setPreviews((p) => ({ ...p, [type]: URL.createObjectURL(file) }));
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/verification/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legal_name: legalName, date_of_birth: dob, address,
          documents: { id_front: paths.id_front, id_back: paths.id_back, selfie: paths.selfie },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.error ?? 'Error'); return; }
      toast.success(t('verify.pendingMsg'));
      router.push(`/${locale}/verify`);
      router.refresh();
    } finally { setSubmitting(false); }
  };

  const canNext =
    (step === 0 && legalName.trim().length >= 3 && !!dob && address.trim().length >= 5) ||
    (step === 1 && !!paths.id_front) ||
    (step === 2 && !!paths.selfie);

  const titles = [
    t('verify.step1Title'),
    t('verify.step3Title'),
    t('verify.step4Title'),
    t('verify.step5Title'),
  ];
  const TOTAL = titles.length;

  const UploadTile = ({ type, label }: { type: DocType; label: string }) => (
    <label className="block cursor-pointer">
      <span className="label">{label}</span>
      <div className="relative h-40 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 overflow-hidden flex items-center justify-center text-gray-400 hover:border-brand-400">
        {previews[type] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previews[type]!} alt={label} className="w-full h-full object-cover" />
        ) : uploading === type ? (
          <Loader2 className="w-7 h-7 animate-spin" />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-7 h-7" />
            <span className="text-xs">{t('verify.uploadHint')}</span>
          </div>
        )}
      </div>
      <input type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, type); }} />
    </label>
  );

  return (
    <div className="card p-6">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm font-semibold text-gray-500 mb-2">
          <span>{t('verify.step')} {step + 1}/{TOTAL}</span>
          <span className="text-brand-600">{titles[step]}</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
        </div>
      </div>

      {/* Step 1 — personal details */}
      {step === 0 && (
        <div className="space-y-4">
          <div><label className="label">{t('verify.legalName')}</label>
            <input className="input" value={legalName} onChange={(e) => setLegalName(e.target.value)} /></div>
          <div><label className="label">{t('verify.dob')}</label>
            <input type="date" className="input" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().split('T')[0]} /></div>
          <div><label className="label">{t('verify.address')}</label>
            <textarea rows={2} className="input resize-none" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        </div>
      )}

      {/* Step 2 — identity document */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{t('verify.step3Hint')}</p>
          <UploadTile type="id_front" label={t('verify.idFront')} />
          <UploadTile type="id_back" label={t('verify.idBack')} />
        </div>
      )}

      {/* Step 3 — selfie */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-brand-600"><Camera className="w-5 h-5" /><span className="font-semibold">{t('verify.step4Title')}</span></div>
          <p className="text-sm text-gray-500">{t('verify.step4Hint')}</p>
          <UploadTile type="selfie" label={t('verify.selfie')} />
        </div>
      )}

      {/* Step 4 — review */}
      {step === 3 && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-brand-600 mb-2"><ShieldCheck className="w-5 h-5" /><span className="font-semibold">{t('verify.step5Title')}</span></div>
          <Row label={t('verify.legalName')} value={legalName} />
          <Row label={t('verify.dob')} value={dob} />
          <Row label={t('verify.address')} value={address} />
          <Row label={t('verify.step3Title')} value={paths.id_back ? '2' : '1'} />
          <Row label={t('verify.selfie')} value="✓" />
        </div>
      )}

      {/* Nav */}
      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <button onClick={() => setStep((s) => s - 1)} className="btn-secondary py-4 flex-1">
            <ArrowLeft className="w-5 h-5" /> {t('verify.back')}
          </button>
        )}
        {step < TOTAL - 1 ? (
          <button onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="btn-primary py-4 text-base flex-1">
            {t('verify.next')} <ArrowRight className="w-5 h-5" />
          </button>
        ) : (
          <button onClick={submit} disabled={submitting} className="btn-primary py-4 text-base flex-1">
            {submitting ? <><Loader2 className="w-5 h-5 animate-spin" />{t('verify.submitting')}</> : t('verify.submit')}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 dark:border-gray-800 py-2">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-900 dark:text-white text-right break-words">{value}</span>
    </div>
  );
}
