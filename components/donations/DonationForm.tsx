'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils';

const PRESET_AMOUNTS = [10_000, 50_000, 100_000, 500_000];

const schema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: 'Miqdor kiriting' })
    .min(1_000, 'Minimal xayriya miqdori 1,000 so\'m'),
  donor_name: z.string().max(100).optional().or(z.literal('')),
  message: z.string().max(300).optional().or(z.literal('')),
  is_anonymous: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

interface DonationFormProps {
  campaignId: string;
  onClose: () => void;
}

export function DonationForm({ campaignId, onClose }: DonationFormProps) {
  const [customAmount, setCustomAmount] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { is_anonymous: false },
  });

  const isAnonymous = watch('is_anonymous');

  const pickPreset = (amount: number) => {
    setSelectedPreset(amount);
    setCustomAmount('');
    setValue('amount', amount, { shouldValidate: true });
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomAmount(val);
    setSelectedPreset(null);
    setValue('amount', Number(val), { shouldValidate: true });
  };

  const onSubmit = async (data: FormData) => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('donations').insert({
        campaign_id: campaignId,
        donor_id: user?.id ?? null,
        amount: data.amount,
        message: data.message || null,
        anonymous: data.is_anonymous,
        status: 'pending',
      });

      if (error) {
        toast.error('Xatolik: ' + error.message);
        return;
      }

      toast.success('Xayriyangiz qabul qilindi! To\'lov tez orada amalga oshiriladi.');
      onClose();
    } catch {
      toast.error('Kutilmagan xatolik yuz berdi');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 dark:text-white text-sm">
          Xayriya miqdori
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="btn-ghost p-1"
          aria-label="Yopish"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Preset amounts */}
        <div className="grid grid-cols-2 gap-2">
          {PRESET_AMOUNTS.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => pickPreset(amt)}
              className={`py-2 px-3 rounded-xl border text-sm font-semibold transition-all ${
                selectedPreset === amt
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-brand-300 dark:hover:border-brand-700'
              }`}
            >
              {formatMoney(amt)} so'm
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div>
          <label className="label">Boshqa miqdor (so'm)</label>
          <input
            type="number"
            value={customAmount}
            onChange={handleCustomChange}
            className="input"
            placeholder="Miqdorni kiriting"
            min={1000}
          />
          {errors.amount && (
            <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>
          )}
        </div>

        {/* Anonymous toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            {...register('is_anonymous')}
            type="checkbox"
            className="w-4 h-4 accent-brand-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Anonim xayriya qilish
          </span>
        </label>

        {/* Donor name (shown when not anonymous) */}
        {!isAnonymous && (
          <div>
            <label className="label">Ismingiz (ixtiyoriy)</label>
            <input
              {...register('donor_name')}
              type="text"
              className="input"
              placeholder="Ism Familiya"
            />
          </div>
        )}

        {/* Message */}
        <div>
          <label className="label">Xabar (ixtiyoriy)</label>
          <textarea
            {...register('message')}
            rows={2}
            className="input resize-none"
            placeholder="Kampaniya uchun tilaklaringizni yozing..."
          />
        </div>

        {/* Payment notice */}
        <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2 leading-relaxed">
          💳 To'lov tizimi tez orada ulanadi. Xayriyangiz qayd etiladi va siz bilan bog'laniladi.
        </p>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full py-2.5"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saqlanmoqda...
            </>
          ) : (
            'Xayriya qilish'
          )}
        </button>
      </form>
    </div>
  );
}
