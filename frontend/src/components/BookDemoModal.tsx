import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, ArrowRight, RefreshCw, Shield, AlertCircle, ArrowLeft, Check, Phone, Copy, Key, LogIn } from 'lucide-react';
import { PhoneInput, PhoneData } from './PhoneInput';
import { useAuth } from '../lib/AuthContext';

interface BookDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLegal: (type: string) => void;
  onSignIn: () => void;
}

type DemoStep = 'auth-check' | 'phone' | 'otp' | 'booking' | 'success';
type AsyncState = 'idle' | 'loading' | 'success' | 'error';

export const BookDemoModal: React.FC<BookDemoModalProps> = ({ isOpen, onClose, onOpenLegal, onSignIn }) => {
  const shouldReduceMotion = useReducedMotion();
  const { user } = useAuth();

  const [step, setStep] = useState<DemoStep>('auth-check');
  const [phoneData, setPhoneData] = useState<PhoneData>({
    country_code: '+91', country_iso2: 'IN', country_name: 'India',
    phone_number: '', phone_e164: '+91', is_valid: false
  });
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [sendState, setSendState] = useState<AsyncState>('idle');
  const [verifyState, setVerifyState] = useState<AsyncState>('idle');
  const [bookState, setBookState] = useState<AsyncState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [demoAccessKey, setDemoAccessKey] = useState<string | null>(null);
  const [demoExpiresAt, setDemoExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

  // Determine initial step based on auth state
  useEffect(() => {
    if (!isOpen) return;
    if (!user) {
      setStep('auth-check');
    } else {
      // Check if user already has demo access
      checkExistingDemo();
    }
  }, [isOpen, user]);

  // OTP countdown
  useEffect(() => {
    if (step !== 'otp' || timerSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) { setCanResend(true); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, timerSeconds]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSendState('idle');
      setVerifyState('idle');
      setBookState('idle');
      setErrorMsg('');
      setOtp(['', '', '', '', '', '']);
      setVerificationToken(null);
      setCopied(false);
    }
  }, [isOpen]);

  const checkExistingDemo = async () => {
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/v1/demo/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.hasDemo) {
        setDemoAccessKey(null); // Key was only shown once
        setDemoExpiresAt(data.expiresAt);
        setStep('success');
      } else {
        setStep('phone');
      }
    } catch {
      setStep('phone');
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneData.is_valid || sendState === 'loading') return;
    setErrorMsg('');
    setSendState('loading');

    try {
      const token = await user!.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/v1/demo/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ phone: phoneData.phone_e164 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send verification code');

      setSendState('success');
      setStep('otp');
      setTimerSeconds(60);
      setCanResend(false);
    } catch (error: any) {
      setSendState('error');
      setErrorMsg(error.message || 'Unable to send verification code. Please try again.');
    }
  };

  const handleOtpInput = (val: string, index: number) => {
    const clean = val.replace(/\D/g, '');
    const newOtp = [...otp];
    newOtp[index] = clean;
    setOtp(newOtp);
    if (clean && index < 5) document.getElementById(`demo-otp-${index + 1}`)?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newOtp = Array.from({ length: 6 }, (_, i) => pasted[i] || '');
      setOtp(newOtp);
      document.getElementById(`demo-otp-${Math.min(pasted.length, 5)}`)?.focus();
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`demo-otp-${index - 1}`)?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullOtp = otp.join('');
    if (fullOtp.length < 6) { setErrorMsg('Please enter the complete 6-digit code'); return; }
    if (verifyState === 'loading') return;
    setErrorMsg('');
    setVerifyState('loading');

    try {
      const token = await user!.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/v1/demo/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ phone: phoneData.phone_e164, otp: fullOtp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');

      setVerificationToken(data.verificationToken);
      setVerifyState('success');
      // Auto-proceed to booking
      await handleBookDemo(data.verificationToken);
    } catch (error: any) {
      setVerifyState('error');
      setErrorMsg(error.message || 'Verification failed. Please try again.');
    }
  };

  const handleBookDemo = async (vToken: string) => {
    setBookState('loading');
    setErrorMsg('');
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/v1/demo/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ verificationToken: vToken, phone: phoneData.phone_e164 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to book demo');

      setBookState('success');
      setDemoAccessKey(data.accessKey || null);
      setDemoExpiresAt(data.expiresAt || null);
      setStep('success');
    } catch (error: any) {
      setBookState('error');
      setErrorMsg(error.message || 'Failed to book demo. Please try again.');
    }
  };

  const handleResendOtp = async () => {
    if (!canResend || sendState === 'loading') return;
    setErrorMsg('');
    setSendState('loading');
    setOtp(['', '', '', '', '', '']);

    try {
      const token = await user!.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/v1/demo/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ phone: phoneData.phone_e164 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend code');

      setSendState('success');
      setTimerSeconds(60);
      setCanResend(false);
    } catch (error: any) {
      setSendState('error');
      setErrorMsg(error.message || 'Failed to resend code. Please try again.');
    }
  };

  const handleCopyKey = () => {
    if (demoAccessKey) {
      navigator.clipboard.writeText(demoAccessKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const steps = [
    { num: 1, label: 'Phone' },
    { num: 2, label: 'Verify' },
    { num: 3, label: 'Confirmed' },
  ];

  const currentStepNum = step === 'phone' ? 1 : step === 'otp' || step === 'booking' ? 2 : 3;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
        >
          <motion.div
            initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.95, y: shouldReduceMotion ? 0 : 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.95, y: shouldReduceMotion ? 0 : 20 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.3, ease: 'easeOut' }}
            className="max-w-lg w-full bg-[#0A0E17] border border-white/[0.06] rounded-2xl shadow-2xl shadow-black/60 relative my-8"
          >
            {/* Close button */}
            <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors z-10" aria-label="Close">
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 border-b border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <img src="/SENSA_1.png" alt="SENSA" className="w-6 h-6 object-contain" />
                <span className="text-xs font-mono text-sky-400 tracking-wider">SENSA DEMO ACCESS</span>
              </div>
              <h2 className="text-xl font-bold text-white">
                {step === 'success' ? 'Demo Access Confirmed' : step === 'auth-check' ? 'Sign In Required' : 'Book a Live Demo'}
              </h2>
              {step !== 'success' && step !== 'auth-check' && (
                <p className="text-sm text-slate-400 mt-1">
                  Verify your mobile number to secure your demo access.
                </p>
              )}
            </div>

            {/* Step indicator */}
            {step !== 'auth-check' && step !== 'success' && (
              <div className="px-6 sm:px-8 py-3 border-b border-white/5 flex items-center gap-1">
                {steps.map((s, i) => (
                  <React.Fragment key={s.num}>
                    <div className={`flex items-center gap-1.5 ${currentStepNum >= s.num ? 'text-sky-400' : 'text-slate-600'}`}>
                      <span className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center border transition-colors ${
                        currentStepNum > s.num ? 'bg-sky-500 border-sky-500 text-white' :
                        currentStepNum === s.num ? 'border-sky-500 text-sky-400 bg-sky-500/10' :
                        'border-slate-700 text-slate-600'
                      }`}>
                        {currentStepNum > s.num ? <Check className="w-3 h-3" /> : s.num}
                      </span>
                      <span className="text-[11px] font-medium hidden sm:inline">{s.label}</span>
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`flex-1 h-px mx-1 ${currentStepNum > s.num ? 'bg-sky-500' : 'bg-slate-800'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Error banner */}
            {errorMsg && (
              <div className="mx-6 sm:mx-8 mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="px-6 sm:px-8 py-5">

              {/* AUTH CHECK — Not signed in */}
              {step === 'auth-check' && (
                <div className="text-center space-y-5">
                  <div className="w-16 h-16 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto">
                    <LogIn className="w-8 h-8 text-sky-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Please sign in to continue</p>
                    <p className="text-sm text-slate-400 mt-1">You need a SENSA account to book a demo.</p>
                  </div>
                  <button
                    onClick={() => { onClose(); onSignIn(); }}
                    className="w-full bg-sky-500 hover:bg-sky-400 text-[#030303] font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-500/20"
                  >
                    <LogIn className="w-4 h-4" /> Sign In or Create Account
                  </button>
                </div>
              )}

              {/* PHONE INPUT */}
              {step === 'phone' && (
                <form onSubmit={handleSendOtp} className="space-y-5">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto">
                      <Phone className="w-6 h-6 text-sky-400" />
                    </div>
                    <p className="text-sm font-medium text-white">Verify Your Mobile Number</p>
                    <p className="text-xs text-slate-400">
                      Your mobile number is required to confirm your demo request and secure your demo access.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Mobile Number</label>
                    <PhoneInput value={phoneData} onChange={setPhoneData} />
                    <p className="text-[10px] text-slate-500 mt-1.5">Used for demo access verification only.</p>
                  </div>

                  <button
                    type="submit"
                    disabled={!phoneData.is_valid || sendState === 'loading'}
                    className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 text-[#030303] font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-500/20 disabled:shadow-none"
                  >
                    {sendState === 'loading' ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Sending verification code...</>
                    ) : (
                      <><ArrowRight className="w-4 h-4" /> Send Verification Code</>
                    )}
                  </button>
                </form>
              )}

              {/* OTP VERIFICATION */}
              {step === 'otp' && (
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto">
                      <Shield className="w-6 h-6 text-sky-400" />
                    </div>
                    <p className="text-sm font-medium text-white">Enter verification code</p>
                    <p className="text-xs text-slate-400">
                      We sent a 6-digit code to{' '}
                      <span className="text-sky-400 font-mono font-medium">
                        {phoneData.country_code} {phoneData.phone_number.substring(0, 2)}{'•'.repeat(Math.max(0, phoneData.phone_number.length - 4))}{phoneData.phone_number.slice(-2)}
                      </span>
                    </p>
                  </div>

                  {/* OTP input boxes */}
                  <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        id={`demo-otp-${i}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleOtpInput(e.target.value, i)}
                        onKeyDown={e => handleOtpKeyDown(e, i)}
                        className="w-11 h-12 text-center text-lg font-mono font-bold bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={otp.join('').length < 6 || verifyState === 'loading' || bookState === 'loading'}
                    className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 text-[#030303] font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-500/20 disabled:shadow-none"
                  >
                    {verifyState === 'loading' || bookState === 'loading' ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> {bookState === 'loading' ? 'Booking demo...' : 'Verifying...'}</>
                    ) : (
                      <><Check className="w-4 h-4" /> Verify & Continue</>
                    )}
                  </button>

                  {/* Resend / Timer */}
                  <div className="text-center">
                    {canResend ? (
                      <button type="button" onClick={handleResendOtp} className="text-xs text-sky-400 hover:text-sky-300 transition-colors">
                        Resend code
                      </button>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Resend code in <span className="text-sky-400 font-mono">{timerSeconds}s</span>
                      </p>
                    )}
                  </div>

                  {/* Back button */}
                  <button
                    type="button"
                    onClick={() => { setStep('phone'); setOtp(['', '', '', '', '', '']); setErrorMsg(''); setVerifyState('idle'); setSendState('idle'); }}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3" /> Change number
                  </button>
                </form>
              )}

              {/* SUCCESS */}
              {step === 'success' && (
                <div className="space-y-5">
                  <div className="text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Demo Access Confirmed</h3>
                    <p className="text-sm text-slate-400">Your demo has been successfully booked.</p>
                  </div>

                  {demoAccessKey && (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-slate-300">Your Demo Access Key</label>
                      <div className="flex items-center gap-2 bg-slate-950 border border-emerald-500/20 rounded-lg p-3">
                        <Key className="w-4 h-4 text-emerald-400 shrink-0" />
                        <code className="text-sm font-mono text-emerald-400 flex-1 select-all">{demoAccessKey}</code>
                        <button
                          onClick={handleCopyKey}
                          className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                          title="Copy key"
                        >
                          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-amber-400/80">
                        ⚠️ Save this key now. It will not be shown again.
                      </p>
                    </div>
                  )}

                  {!demoAccessKey && (
                    <div className="bg-slate-950 border border-sky-500/20 rounded-lg p-3">
                      <p className="text-xs text-slate-400">You already have an active demo booking.</p>
                    </div>
                  )}

                  {demoExpiresAt && (
                    <p className="text-xs text-slate-500 text-center">
                      Expires: {new Date(demoExpiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  )}

                  <button
                    onClick={onClose}
                    className="w-full bg-sky-500 hover:bg-sky-400 text-[#030303] font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-500/20"
                  >
                    Continue to Dashboard <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 sm:px-8 pb-5 pt-2 border-t border-white/5">
              <p className="text-[10px] text-slate-600 text-center">
                By continuing you agree to the SENSA{' '}
                <button type="button" onClick={() => onOpenLegal('terms')} className="text-sky-400/60 hover:text-sky-400">Terms</button>{' '}and{' '}
                <button type="button" onClick={() => onOpenLegal('privacy')} className="text-sky-400/60 hover:text-sky-400">Privacy Policy</button>.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
