import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { User, CreditCard, LayoutDashboard, LogOut, ChevronDown } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenTrialModal: () => void;
  activeAlertCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenTrialModal,
  activeAlertCount,
}) => {
  const [activeSection, setActiveSection] = useState<string>('');
  const { user, loading: authLoading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    const handleScroll = () => {
      if (activeTab !== 'hero') {
        setActiveSection('');
        return;
      }
      
      const sections = ['how-it-works', 'pricing', 'faq'];
      let current = '';
      
      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= 200) {
            current = section;
          }
        }
      }
      
      setActiveSection((prev) => {
        if (current && current !== prev) return current;
        if (window.scrollY < 100 && prev !== '') return '';
        return prev;
      });
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(handleScroll);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    // Run once on mount after a small delay to allow DOM to settle
    setTimeout(handleScroll, 100);
    
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [activeTab]);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const initials = user ? (user.displayName || user.email || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '';

  return (
    <header className="sticky top-0 z-50 w-full bg-[#030303]/90 backdrop-blur-md border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div 
          onClick={() => setActiveTab('hero')}
          className="flex items-center gap-4 cursor-pointer group"
        >
          <img src="/SENSA_1.png" alt="Sensa Logo" className="w-8 h-8 group-hover:scale-105 transition-transform object-contain" />
          <img src="/SENSA_2.png" alt="Sensa Brand" className="h-8 object-contain -ml-1" />
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <a
            href="#how-it-works"
            onClick={(e) => {
              if (activeTab !== 'hero') {
                setActiveTab('hero');
              }
            }}
            className={`transition-colors ${activeTab === 'hero' && (activeSection === '' || activeSection === 'how-it-works') ? 'text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Product
          </a>
          <a
            href="#pricing"
            onClick={(e) => {
              if (activeTab !== 'hero') {
                setActiveTab('hero');
              }
            }}
            className={`transition-colors ${activeTab === 'hero' && activeSection === 'pricing' ? 'text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Pricing
          </a>
          <a
            href="#faq"
            onClick={(e) => {
              if (activeTab !== 'hero') {
                setActiveTab('hero');
              }
            }}
            className={`transition-colors ${activeTab === 'hero' && activeSection === 'faq' ? 'text-white' : 'text-slate-400 hover:text-white'}`}
          >
            FAQ
          </a>
        </nav>

        {/* CTA Actions */}
        <div className="flex items-center gap-4 text-sm font-medium">
          {!authLoading && !user && (
            <button
              onClick={() => setActiveTab('login')}
              className="text-slate-300 hover:text-white transition-colors hidden sm:block"
            >
              Log in
            </button>
          )}

          {/* User Avatar Menu */}
          {!authLoading && user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-label="User menu"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full object-cover border border-white/10" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold border border-white/10">
                    {initials}
                  </div>
                )}
                <span className="text-sm text-slate-300 hidden sm:inline max-w-[100px] truncate">
                  {user.displayName || user.email?.split('@')[0] || 'User'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-[#0A0E17] border border-white/10 rounded-xl shadow-2xl shadow-black/50 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* User info header */}
                  <div className="px-3.5 py-2.5 border-b border-white/5">
                    <p className="text-sm font-medium text-white truncate">{user.displayName || 'SENSA User'}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => { setActiveTab('profile'); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                    >
                      <User className="w-4 h-4 text-slate-500" /> Profile
                    </button>
                    <button
                      onClick={() => { setActiveTab('dashboard'); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                    >
                      <LayoutDashboard className="w-4 h-4 text-slate-500" /> Dashboard
                    </button>
                    <button
                      onClick={() => { setActiveTab('billing'); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                    >
                      <CreditCard className="w-4 h-4 text-slate-500" /> Billing
                    </button>
                  </div>

                  <div className="border-t border-white/5 py-1">
                    <button
                      onClick={async () => {
                        setMenuOpen(false);
                        await logout();
                        setActiveTab('hero');
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/5 transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={onOpenTrialModal}
            className="bg-[#5fa9f2] hover:bg-[#4d97e0] text-black px-5 py-2 rounded-full transition-all"
          >
            Book Live Demo
          </button>
        </div>
      </div>
    </header>
  );
};
