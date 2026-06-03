import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ProfileForm } from '@/components/profile/ProfileForm';

export const metadata: Metadata = {
  title: 'Mening profilim — Xayr',
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login?next=/profile');

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/');

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">
          <div className="mb-8">
            <h1 className="section-title">Mening profilim</h1>
            <p className="section-sub">Shaxsiy ma'lumotlaringizni boshqaring</p>
          </div>
          <div className="card p-8">
            <ProfileForm profile={profile} email={user.email ?? ''} />
          </div>

          <Link
            href={`/${locale}/profile/donations`}
            className="mt-4 card p-4 flex items-center gap-3 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
              <Heart className="w-5 h-5 text-brand-600" />
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">
              Mening xayriyalarim
            </span>
            <span className="ml-auto text-gray-400">→</span>
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
