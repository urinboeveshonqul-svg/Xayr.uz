'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X, Heart, LogOut, LayoutDashboard, Search, Globe } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Profile } from '@/types';

export function Navbar() {
  const [user, setUser]         = useState<SupabaseUser | null>(null);
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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

    const onScroll = () => setScrolled(window.scrollY > 20);
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
          ? 'bg-white/90 backdrop-blur-xl shadow-lg border-b border-gray-200'
          : 'bg-white border-b border-gray-100'
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <span className="text-2xl">💚</span>
            </div>
            <span className="text-2xl font-black bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              Xayr
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-2">
            <Link href="/campaigns" className="px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:text-green-600 hover:bg-green-50 transition-all">
              Kampaniyalar
            </Link>
            <Link href="/campaigns?category=medical" className="px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:text-green-600 hover:bg-green-50 transition-all">
              Tibbiyot
            </Link>
            <Link href="/campaigns?category=education" className="px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:text-green-600 hover:bg-green-50 transition-all">
              Ta'lim
            </Link>
            <Link href="/campaigns?category=disaster" className="px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:text-green-600 hover:bg-green-50 transition-all">
              Favqulodda
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

            {/* Language */}
            <button className="p-3 rounded-xl text-gray-600 hover:text-green-600 hover:bg-green-50 transition-all">
              <Globe className="w-5 h-5" />
            </button>

            {user ? (
              <>
                {profile?.role === 'admin' && (
                  <Link href="/admin" className="px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:text-green-600 hover:bg-green-50 transition-all flex items-center gap-2">
                    <LayoutDashboard className="w-4 h-4" />
                    Admin
                  </Link>
                )}
                <Link href="/campaigns/create" className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-sm font-black hover:shadow-lg hover:scale-105 transition-all flex items-center gap-2">
                  <Heart className="w-4 h-4" />
                  Loyiha Yaratish
                </Link>
                <button onClick={handleSignOut} className="p-3 rounded-xl text-gray-600 hover:text-red-600 hover:bg-red-50 transition-all" title="Chiqish">
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="px-6 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100 transition-all">
                  Kirish
                </Link>
                <Link href="/auth/register" className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-sm font-black hover:shadow-lg hover:scale-105 transition-all">
                  Ro'yxatdan O'tish
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
                placeholder="Kampaniyalarda qidirish..."
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
              placeholder="Qidirish..."
              className="w-full pl-12 pr-4 py-3 bg-gray-50 rounded-xl border border-gray-200 focus:border-green-500 focus:outline-none text-sm"
            />
          </div>

          <Link
            href="/campaigns"
            className="block px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-green-50 hover:text-green-600 transition-all"
            onClick={() => setMenuOpen(false)}
          >
            Kampaniyalar
          </Link>
          <Link
            href="/campaigns?category=medical"
            className="block px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-green-50 hover:text-green-600 transition-all"
            onClick={() => setMenuOpen(false)}
          >
            🏥 Tibbiyot
          </Link>
          <Link
            href="/campaigns?category=education"
            className="block px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-green-50 hover:text-green-600 transition-all"
            onClick={() => setMenuOpen(false)}
          >
            📚 Ta'lim
          </Link>
          <Link
            href="/campaigns?category=disaster"
            className="block px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-green-50 hover:text-green-600 transition-all"
            onClick={() => setMenuOpen(false)}
          >
            🚨 Favqulodda
          </Link>
          
          {user ? (
            <>
              {profile?.role === 'admin' && (
                <Link
                  href="/admin"
                  className="block px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-green-50 hover:text-green-600 transition-all"
                  onClick={() => setMenuOpen(false)}
                >
                  Admin Panel
                </Link>
              )}
              <Link
                href="/campaigns/create"
                className="block px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-sm font-black text-center"
                onClick={() => setMenuOpen(false)}
              >
                Loyiha Yaratish
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition-all"
              >
                Chiqish
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              <Link href="/auth/login" className="block px-4 py-3 bg-gray-100 rounded-xl text-sm font-bold text-gray-700 text-center" onClick={() => setMenuOpen(false)}>
                Kirish
              </Link>
              <Link href="/auth/register" className="block px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-sm font-black text-center" onClick={() => setMenuOpen(false)}>
                Ro'yxatdan O'tish
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
