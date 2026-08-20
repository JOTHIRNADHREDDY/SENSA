import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';

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
        <div className="flex items-center gap-6 text-sm font-medium">
          {!authLoading && !user && (
            <button
              onClick={() => setActiveTab('login')}
              className="text-slate-300 hover:text-white transition-colors hidden sm:block"
            >
              Log in
            </button>
          )}
          {!authLoading && user && (
            <>
              <button
                onClick={() => setActiveTab('dashboard')}
                className="text-slate-300 hover:text-white transition-colors hidden sm:block"
              >
                Dashboard
              </button>
              <button
                onClick={async () => {
                  await logout();
                  setActiveTab('hero');
                }}
                className="text-slate-300 hover:text-white transition-colors hidden sm:block"
              >
                Log out
              </button>
            </>
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
