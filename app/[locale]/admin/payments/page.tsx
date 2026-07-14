import { Metadata } from 'next';
import { CreditCard } from 'lucide-react';
import { getPaymentCatalog } from '@/lib/payments/catalog';
import { AdminPaymentProviders } from '@/components/admin/AdminPaymentProviders';

export const metadata: Metadata = { title: "To'lov tizimlari — Admin" };
export const dynamic = 'force-dynamic';

/**
 * Payment provider settings — enable/disable providers, mark them Coming Soon,
 * reorder, and pick the default, all without code changes. RBAC comes from the
 * shared /admin layout; writes go through /api/admin/payment-providers.
 */
export default async function AdminPaymentsPage() {
  const catalog = await getPaymentCatalog();
  const activeCount = catalog.filter((e) => e.enabled).length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900 dark:text-white">To&apos;lov tizimlari</h2>
          <p className="text-sm text-gray-500">
            {activeCount > 0 ? `${activeCount} ta faol to'lov tizimi` : "Faol to'lov tizimi yo'q"}
          </p>
        </div>
      </div>

      <AdminPaymentProviders initial={catalog} />
    </div>
  );
}
