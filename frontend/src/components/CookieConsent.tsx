import React, { useState, useEffect } from 'react';

export const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('sensa_cookie_consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('sensa_cookie_consent', 'all');
    setIsVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem('sensa_cookie_consent', 'essential');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-slate-900 border-t border-slate-800 p-4 sm:p-6 shadow-2xl animate-in slide-in-from-bottom-10">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-1 space-y-2">
          <h3 className="text-white font-bold">Your Privacy Matters</h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            SENSA uses strictly necessary cookies to operate this website. With your consent, we may also use optional analytics and performance cookies to improve your experience. 
            You can choose to accept all, reject non-essential, or manage your preferences.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto shrink-0">
          <button 
            onClick={handleReject}
            className="w-full sm:w-auto px-4 py-2 bg-transparent border border-slate-700 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Manage Preferences
          </button>
          <button 
            onClick={handleReject}
            className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Reject Non-Essential
          </button>
          <button 
            onClick={handleAcceptAll}
            className="w-full sm:w-auto px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold rounded-lg transition-colors"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
};
