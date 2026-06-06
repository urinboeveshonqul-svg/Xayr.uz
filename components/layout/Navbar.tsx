'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X, Heart, LogOut, LayoutDashboard, Search, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Profile } from '@/types';

export function Navbar() {
  const { t, locale } = useI18n();
  const L = (path: string) => `/${locale}${path}`;

  const [user, setUser]         = useState<SupabaseUser | null>(null);
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    // Scroll behaviour is independent of Supabase — wire it up first so the
    // navbar still works even if auth is unavailable.
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);

    // Guard: a Supabase outage (or missing env) must not throw out of this
    // effect — the Navbar renders on every page, so an unguarded throw here would
    // blank the entire site. On failure we degrade to the signed-out navbar.
    let unsubscribe = () => {};

    // Load a user's profile row, swallowing any Supabase error. The Postgrest
    // query builder is a PromiseLike (no .catch), so we use await + try/catch.
    const loadProfile = async (
      supabase: ReturnType<typeof createClient>,
      userId: string
    ) => {
      try {
        const { data: p } = await supabase.from('users').select('*').eq('id', userId).single();
        setProfile(p);
      } catch {
        setProfile(null);
      }
    };

    try {
      const supabase = createClient();

      (async () => {
        try {
          const { data } = await supabase.auth.getUser();
          setUser(data?.user ?? null);
          if (data?.user) await loadProfile(supabase, data.user.id);
        } catch {
          setUser(null);
        }
      })();

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          void loadProfile(supabase, session.user.id);
        } else {
          setProfile(null);
        }
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    } catch {
      /* Supabase unavailable — keep the signed-out navbar. */
    }

    return () => {
      unsubscribe();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      /* ignore — still send the user home below */
    }
    window.location.href = `/${locale}`;
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 backdrop-blur-xl shadow-lg border-b border-gray-200'
          : 'bg-white border-b border-gray-100'
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">

          {/* Logo */}
          <Link href={L('')} className="flex items-center gap-3 group">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <span className="text-2xl">💚</span>
            </div>
            <span className="text-2xl font-black bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              Xayr
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-2">
            <Link href={L('/campaigns')} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:text-green-600 hover:bg-green-50 transition-all">
              {t('nav.campaigns')}
            </Link>
            <Link href={L('/campaigns?category=medical')} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:text-green-600 hover:bg-green-50 transition-all">
              {t('nav.medical')}
            </Link>
            <Link href={L('/campaigns?category=education')} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:text-green-600 hover:bg-green-50 transition-all">
              {t('nav.education')}
            </Link>
            <Link href={L('/campaigns?category=disaster')} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:text-green-600 hover:bg-green-50 transition-all">
              {t('nav.emergency')}
            </Link>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-3">

            {/* Search */}
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="p-3 rounded-xl text-gray-600 hover:text-green-600 hover:bg-green-50 transition-all"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Language switcher */}
            <LanguageSwitcher />

            {user ? (
              <>
                {profile?.role === 'admin' && (
                  <Link href={L('/admin')} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:text-green-600 hover:bg-green-50 transition-all flex items-center gap-2">
                    <LayoutDashboard className="w-4 h-4" />
                    {t('nav.admin')}
                  </Link>
                )}
                <Link href={L('/campaigns/create')} className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-sm font-black hover:shadow-lg hover:scale-105 transition-all flex items-center gap-2">
                  <Heart className="w-4 h-4" />
                  {t('nav.createProject')}
                </Link>
                <Link href={L('/profile')} className="p-3 rounded-xl text-gray-600 hover:text-green-600 hover:bg-green-50 transition-all" title={t('nav.profile')}>
                  <User className="w-5 h-5" />
                </Link>
                <button onClick={handleSignOut} className="p-3 rounded-xl text-gray-600 hover:text-red-600 hover:bg-red-50 transition-all" title={t('nav.logout')}>
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <>
                <Link href={L('/auth/login')} className="px-6 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100 transition-all">
                  {t('nav.login')}
                </Link>
                <Link href={L('/auth/register')} className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-sm font-black hover:shadow-lg hover:scale-105 transition-all">
                  {t('nav.register')}
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="lg:hidden p-2 rounded-xl text-gray-700 hover:bg-gray-100 transition-all"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Search Bar (Desktop) */}
        {searchOpen && (
          <div className="hidden lg:block pb-4 animate-fade-in">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={t('nav.searchPlaceholder')}
                className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl border-2 border-gray-200 focus:border-green-500 focus:outline-none text-sm font-medium"
                autoFocus
              />
            </div>
          </div>
        )}
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="lg:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-2 animate-fade-in">

          {/* Mobile Search */}
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={t('nav.searchPlaceholder')}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 rounded-xl border border-gray-200 focus:border-green-500 focus:outline-none text-sm"
            />
          </div>

          {/* Language switcher (mobile) */}
          <div className="pb-2">
            <LanguageSwitcher />
          </div>

          <Link href={L('/campaigns')} className="block px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-green-50 hover:text-green-600 transition-all" onClick={() => setMenuOpen(false)}>
            {t('nav.campaigns')}
          </Link>
          <Link href={L('/campaigns?category=medical')} className="block px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-green-50 hover:text-green-600 transition-all" onClick={() => setMenuOpen(false)}>
            🏥 {t('nav.medical')}
          </Link>
          <Link href={L('/campaigns?category=education')} className="block px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-green-50 hover:text-green-600 transition-all" onClick={() => setMenuOpen(false)}>
            📚 {t('nav.education')}
          </Link>
          <Link href={L('/campaigns?category=disaster')} className="block px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-green-50 hover:text-green-600 transition-all" onClick={() => setMenuOpen(false)}>
            🚨 {t('nav.emergency')}
          </Link>

          {user ? (
            <>
              {profile?.role === 'admin' && (
                <Link href={L('/admin')} className="block px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-green-50 hover:text-green-600 transition-all" onClick={() => setMenuOpen(false)}>
                  {t('nav.admin')}
                </Link>
              )}
              <Link href={L('/profile')} className="block px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-green-50 hover:text-green-600 transition-all" onClick={() => setMenuOpen(false)}>
                {t('nav.profile')}
              </Link>
              <Link href={L('/campaigns/create')} className="block px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-sm font-black text-center" onClick={() => setMenuOpen(false)}>
                {t('nav.createProject')}
              </Link>
              <button onClick={handleSignOut} className="w-full text-left px-4 py-3 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition-all">
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              <Link href={L('/auth/login')} className="block px-4 py-3 bg-gray-100 rounded-xl text-sm font-bold text-gray-700 text-center" onClick={() => setMenuOpen(false)}>
                {t('nav.login')}
              </Link>
              <Link href={L('/auth/register')} className="block px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-sm font-black text-center" onClick={() => setMenuOpen(false)}>
                {t('nav.register')}
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
