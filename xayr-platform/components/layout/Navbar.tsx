'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X, Heart, LogOut, LayoutDashboard, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Profile } from '@/types';

export function Navbar() {
  const [user, setUser]         = useState<SupabaseUser | null>(null);
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single()
          .then(({ data: p }) => setProfile(p));
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
          .then(({ data: p }) => setProfile(p));
      } else {
        setProfile(null);
      }
    });

    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl shadow-card border-b border-gray-100 dark:border-gray-800'
          : 'bg-white dark:bg-gray-950 border-b border-gray-100/60 dark:border-gray-800/60'
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[66px]">

          {/* ── Logo ─────────────────────────────────────── */}
          <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-brand group-hover:scale-105 transition-transform duration-200">
              <Heart className="w-4.5 h-4.5 text-white fill-white w-[18px] h-[18px]" />
            </div>
            <span className="text-xl font-black text-gray-900 dark:text-white tracking-tight group-hover:text-brand-600 transition-colors">
              Xayr
            </span>
          </Link>

          {/* ── Desktop Nav ───────────────────────────────── */}
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/campaigns"
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900 transition-all duration-150"
            >
              Kampaniyalar
            </Link>
            <Link
              href="/campaigns/create"
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900 transition-all duration-150"
            >
              Kampaniya yaratish
            </Link>
          </nav>

          {/* ── Desktop Auth ──────────────────────────────── */}
          <div className="hidden md:flex items-center gap-2.5">
            {user ? (
              <>
                {profile?.role === 'admin' && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 transition-all"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Admin
                  </Link>
                )}
                <Link href="/campaigns/create" className="btn-primary h-9 px-4 text-sm">
                  <Heart className="w-3.5 h-3.5 fill-white" />
                  Yordam so'rash
                </Link>
                {/* Avatar / sign-out */}
                <button
                  onClick={handleSignOut}
                  title="Chiqish"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900 transition-all text-sm text-gray-600 dark:text-gray-400"
                >
                  <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-700 dark:text-brand-400 font-bold text-xs">
                    {profile?.full_name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="btn-secondary h-9 px-4 text-sm">
                  Kirish
                </Link>
                <Link href="/auth/register" className="btn-primary h-9 px-4 text-sm">
                  Ro'yxatdan o'tish
                </Link>
              </>
            )}
          </div>

          {/* ── Mobile toggle ─────────────────────────────── */}
          <button
            className="md:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            {menuOpen
              ? <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              : <Menu className="w-5 h-5 text-gray-700 dark:text-gray-300" />}
          </button>
        </div>
      </div>

      {/* ── Mobile Menu ────────────────────────────────────── */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-4 space-y-1 animate-fade-in shadow-card-md">
          <Link
            href="/campaigns"
            className="flex items-center px-4 py-3 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
            onClick={() => setMenuOpen(false)}
          >
            Kampaniyalar
          </Link>
          <Link
            href="/campaigns/create"
            className="flex items-center px-4 py-3 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
            onClick={() => setMenuOpen(false)}
          >
            Kampaniya yaratish
          </Link>

          {user ? (
            <>
              {profile?.role === 'admin' && (
                <Link
                  href="/admin"
                  className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
                  onClick={() => setMenuOpen(false)}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Admin Panel
                </Link>
              )}
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800 mt-2">
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <LogOut className="w-4 h-4" />
                  Chiqish
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2 pt-3 border-t border-gray-100 dark:border-gray-800 mt-2">
              <Link
                href="/auth/login"
                className="btn-secondary w-full justify-center"
                onClick={() => setMenuOpen(false)}
              >
                Kirish
              </Link>
              <Link
                href="/auth/register"
                className="btn-primary w-full justify-center"
                onClick={() => setMenuOpen(false)}
              >
                Ro'yxatdan o'tish
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
