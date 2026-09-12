import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, ArrowRight, RefreshCw, AlertCircle, Eye, EyeOff, HardDrive, Zap, Cloud, Info, Check } from 'lucide-react';
import { DataStorageMode } from '../types';
import { useAuth } from '../lib/AuthContext';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleteSignup: (phone: string, mode: DataStorageMode) => void;
  onOpenLegal: (type: 'terms' | 'privacy' | 'cctvNotice' | 'aiNotice') => void;
  googlePrefill?: { uid?: string; displayName: string | null; email: string | null; photoURL: string | null } | null;
  onSwitchToLogin?: () => void;
}

export const SignupModal: React.FC<SignupModalProps> = ({ isOpen, onClose, onCompleteSignup, onOpenLegal, googlePrefill, onSwitchToLogin }) => {
  const shouldReduceMotion = useReducedMotion();
  const { loginWithCustomToken, signInWithGoogle } = useAuth();
  
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  
  const [storageMode, setStorageMode] = useState<DataStorageMode>('hybrid');
  
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  const isGoogleFlow = !!googlePrefill;

  useEffect(() => {
    if (isOpen) {
      if (googlePrefill) {
        setFullName(googlePrefill.displayName || '');
        setEmail(googlePrefill.email || '');
      } else {
        setFullName('');
        setEmail('');
      }
      setPassword('');
      setConfirmPassword('');
      setStep(1);
      setErrorMsg('');
      setFieldErrors({});
      setLegalAccepted(false);
    }
  }, [isOpen, googlePrefill]);

  const validateStep1 = () => {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) errors.fullName = 'Full Name is required';
    if (!email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address';
    if (!isGoogleFlow) {
      if (!password) errors.password = 'Password is required';
      else if (password.length < 8) errors.password = 'Password must be at least 8 characters';
      if (!confirmPassword) errors.confirmPassword = 'Please confirm your password';
      else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
    }
    if (!legalAccepted) errors.legal = 'You must accept the Terms and Privacy Policy';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep1() || loading) return;
    setErrorMsg('');
    setLoading(true);

    try {
      if (!isGoogleFlow) {
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.toLowerCase().trim(),
            password,
            displayName: fullName,
            firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create account');

        await loginWithCustomToken(data.firebaseToken);
      } else {
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/link-google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: googlePrefill?.uid,
            email,
            displayName: fullName,
            photoURL: googlePrefill?.photoURL,
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create account');
      }

      setStep(3);
      setTimeout(() => {
        onCompleteSignup('', storageMode);
        onClose();
      }, 2000);
    } catch (error: any) {
      setErrorMsg(error.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    setErrorMsg('');
    try {
      const result = await signInWithGoogle();
      
      const token = await result.user.getIdToken();
      const checkRes = await fetch(`${API_BASE_URL}/api/v1/auth/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const checkData = await checkRes.json();
      
      if (checkData.exists) {
        onClose();
      } else {
        setFullName(result.user.displayName || '');
        setEmail(result.user.email || '');
        // Transition to step 2 directly for Google user without profile
        // But need them to accept legal first? Actually let's just prefill and stay on step 1.
        // They need to click continue to accept terms.
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to sign in with Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  const FieldError: React.FC<{ field: string }> = ({ field }) => {
    const err = fieldErrors[field];
    if (!err) return null;
    return <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{err}</p>;
  };

  const steps = [
    { num: 1, label: 'Account' },
    { num: 3, label: 'Done' },
  ];

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
            <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors z-10">
              <X className="w-4 h-4" />
            </button>

            <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 border-b border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <img src="/SENSA_1.png" alt="SENSA" className="w-6 h-6 object-contain" />
                <span className="text-xs font-mono text-sky-400 tracking-wider">SENSA SECURE ACCESS</span>
              </div>
              <h2 className="text-xl font-bold text-white">
                {step === 3 ? 'Account Created!' : isGoogleFlow ? 'Complete Your Account' : 'Create your SENSA account'}
              </h2>
              {step !== 3 && (
                <p className="text-sm text-slate-400 mt-1">
                  {isGoogleFlow ? 'Complete your profile to get started with SENSA.' : 'Set up your AI-powered security workspace.'}
                </p>
              )}
            </div>

            {step !== 3 && (
              <div className="px-6 sm:px-8 py-3 border-b border-white/5 flex items-center gap-1">
                {steps.map((s, i) => (
                  <React.Fragment key={s.num}>
                    <div className={`flex items-center gap-1.5 ${step >= s.num ? 'text-sky-400' : 'text-slate-600'}`}>
                      <span className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center border transition-colors ${
                        step > s.num ? 'bg-sky-500 border-sky-500 text-white' :
                        step === s.num ? 'border-sky-500 text-sky-400 bg-sky-500/10' :
                        'border-slate-700 text-slate-600'
                      }`}>
                        {step > s.num ? <Check className="w-3 h-3" /> : s.num}
                      </span>
                      <span className="text-[11px] font-medium hidden sm:inline">{s.label}</span>
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`flex-1 h-px mx-1 ${step > s.num ? 'bg-sky-500' : 'bg-slate-800'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}

            {errorMsg && (
              <div className="mx-6 sm:mx-8 mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="px-6 sm:px-8 py-5">
              {step === 1 && (
                <form onSubmit={handleStep1Submit} className="space-y-4" noValidate>
                  {!isGoogleFlow && (
                    <>
                      <button
                        type="button"
                        onClick={handleGoogleSignup}
                        disabled={googleLoading}
                        className="w-full bg-white/[0.03] border border-white/10 hover:border-white/20 hover:bg-white/[0.06] text-slate-200 py-2.5 rounded-lg text-sm flex items-center justify-center gap-3 transition-colors disabled:opacity-50"
                      >
                        {googleLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : (
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                          </svg>
                        )}
                        <span>{googleLoading ? 'Signing in...' : 'Continue with Google'}</span>
                      </button>

                      <div className="relative flex items-center py-1">
                        <div className="flex-grow border-t border-white/10" />
                        <span className="mx-4 text-[10px] font-mono text-slate-600 uppercase tracking-wider">or</span>
                        <div className="flex-grow border-t border-white/10" />
                      </div>
                    </>
                  )}

                  <div>
                    <label htmlFor="signup-name" className="text-xs font-medium text-slate-300 mb-1.5 block">Full Name</label>
                    <input id="signup-name" type="text" value={fullName} onChange={e => { setFullName(e.target.value); setFieldErrors(p => ({...p, fullName: ''})); }}
                      placeholder="John Doe" className="w-full bg-[#030303] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 transition-all" />
                    <FieldError field="fullName" />
                  </div>

                  <div>
                    <label htmlFor="signup-email" className="text-xs font-medium text-slate-300 mb-1.5 block">Email Address</label>
                    <input id="signup-email" type="email" value={email} readOnly={isGoogleFlow}
                      onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({...p, email: ''})); }}
                      placeholder="name@company.com"
                      className={`w-full bg-[#030303] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 transition-all ${isGoogleFlow ? 'opacity-60 cursor-not-allowed' : ''}`} />
                    <FieldError field="email" />
                  </div>

                  {!isGoogleFlow && (
                    <>
                      <div>
                        <label htmlFor="signup-password" className="text-xs font-medium text-slate-300 mb-1.5 block">Password</label>
                        <div className="relative">
                          <input id="signup-password" type={showPassword ? 'text' : 'password'} value={password}
                            onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({...p, password: ''})); }}
                            placeholder="Minimum 8 characters"
                            className="w-full bg-[#030303] border border-white/10 rounded-lg pl-3.5 pr-10 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 transition-all" />
                          <button type="button" onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <FieldError field="password" />
                      </div>

                      <div>
                        <label htmlFor="signup-confirm-password" className="text-xs font-medium text-slate-300 mb-1.5 block">Confirm Password</label>
                        <div className="relative">
                          <input id="signup-confirm-password" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword}
                            onChange={e => { setConfirmPassword(e.target.value); setFieldErrors(p => ({...p, confirmPassword: ''})); }}
                            placeholder="Re-enter your password"
                            className="w-full bg-[#030303] border border-white/10 rounded-lg pl-3.5 pr-10 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 transition-all" />
                          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <FieldError field="confirmPassword" />
                      </div>
                    </>
                  )}

                  <div className="pt-1 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer group">
                      <input type="checkbox" checked={legalAccepted} onChange={e => { setLegalAccepted(e.target.checked); setFieldErrors(p => ({...p, legal: ''})); }}
                        className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-950 accent-sky-500 shrink-0" />
                      <span className="text-xs text-slate-300 leading-relaxed">
                        I agree to the SENSA <button type="button" onClick={() => onOpenLegal('terms')} className="text-sky-400 hover:underline">Terms of Service</button> and <button type="button" onClick={() => onOpenLegal('privacy')} className="text-sky-400 hover:underline">Privacy Policy</button>.
                      </span>
                    </label>
                    <FieldError field="legal" />
                  </div>

                  <button type="submit" disabled={loading}
                    className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 text-[#030303] font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all mt-2">
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
                  </button>
                </form>
              )}


              {step === 3 && (
                <div className="text-center py-6 space-y-4">
                  <motion.div
                    initial={{ scale: shouldReduceMotion ? 1 : 0 }} animate={{ scale: 1 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 15 }}
                    className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto"
                  >
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </motion.div>
                  <h3 className="text-lg font-bold text-white">Welcome to SENSA!</h3>
                  <p className="text-sm text-slate-400">Your account has been created successfully. Redirecting...</p>
                  <div className="flex justify-center">
                    <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {step === 1 && !isGoogleFlow && (
              <div className="px-6 sm:px-8 pb-6 pt-2 border-t border-white/5 text-center">
                <p className="text-sm text-slate-400">
                  Already have an account?{' '}
                  <button type="button" onClick={onSwitchToLogin || onClose} className="text-sky-400 hover:text-sky-300 font-medium transition-colors">
                    Sign in
                  </button>
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
