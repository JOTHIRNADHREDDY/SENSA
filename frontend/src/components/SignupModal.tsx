import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DataStorageMode } from '../types';
import { X, CheckCircle2, ArrowRight, RefreshCw, Zap, Cloud, HardDrive, Info, AlertCircle, Eye, EyeOff, ArrowLeft, Check, Shield } from 'lucide-react';
import { legalDocuments } from '../data/legalDocuments';
import { PhoneInput, PhoneData } from './PhoneInput';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult, linkWithPhoneNumber } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleteSignup: (phone: string, mode: DataStorageMode) => void;
  onOpenLegal: (type: string) => void;
  onSwitchToLogin?: () => void;
  googlePrefill?: {
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
  } | null;
}

// Password strength checker
function getPasswordStrength(pw: string): { score: number; label: string; color: string; checks: { label: string; met: boolean }[] } {
  const checks = [
    { label: 'At least 8 characters', met: pw.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(pw) },
    { label: 'Lowercase letter', met: /[a-z]/.test(pw) },
    { label: 'Number', met: /\d/.test(pw) },
    { label: 'Special character', met: /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = checks.filter(c => c.met).length;
  if (score <= 1) return { score, label: 'Very weak', color: 'bg-red-500', checks };
  if (score === 2) return { score, label: 'Weak', color: 'bg-orange-500', checks };
  if (score === 3) return { score, label: 'Fair', color: 'bg-amber-500', checks };
  if (score === 4) return { score, label: 'Strong', color: 'bg-emerald-400', checks };
  return { score, label: 'Very strong', color: 'bg-emerald-500', checks };
}

// Map Firebase error codes to user-friendly messages
function getPhoneAuthErrorMessage(error: any): string {
  const code = error?.code || '';
  const map: Record<string, string> = {
    'auth/invalid-phone-number': 'The phone number format is invalid. Please check and try again.',
    'auth/missing-phone-number': 'Please enter a phone number.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes before trying again.',
    'auth/quota-exceeded': 'SMS quota exceeded. Please try again later.',
    'auth/captcha-check-failed': 'Security verification failed. Please refresh and try again.',
    'auth/recaptcha-not-enabled': 'Security verification failed. Please refresh and try again.',
    'auth/network-request-failed': 'Network error. Please check your internet connection.',
    'auth/operation-not-allowed': 'Phone authentication is not enabled. Please contact support.',
    'auth/app-not-authorized': 'This app is not authorized for phone authentication.',
    'auth/invalid-verification-code': 'The verification code is incorrect. Please check and try again.',
    'auth/code-expired': 'The verification code has expired. Please request a new one.',
    'auth/credential-already-in-use': 'This phone number is already linked to another account.',
  };
  return map[code] || error?.message || 'Unable to send the verification code. Please check your number and try again.';
}

export const SignupModal: React.FC<SignupModalProps> = ({ isOpen, onClose, onCompleteSignup, onOpenLegal, onSwitchToLogin, googlePrefill }) => {
  const shouldReduceMotion = useReducedMotion();
  const { user, signInWithGoogle } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [phoneData, setPhoneData] = useState<PhoneData>({
    country_code: '+91', country_iso2: 'IN', country_name: 'India',
    phone_number: '', phone_e164: '+91', is_valid: false
  });
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [storageMode, setStorageMode] = useState<DataStorageMode>('hybrid');

  // Legal State
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);

  // Firebase Phone Auth State
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);

  const isGoogleFlow = !!googlePrefill;
  const pwStrength = getPasswordStrength(password);

  // Prefill from Google
  useEffect(() => {
    if (googlePrefill) {
      if (googlePrefill.displayName) setFullName(googlePrefill.displayName);
      if (googlePrefill.email) setEmail(googlePrefill.email);
      setStep(1);
    }
  }, [googlePrefill]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) cleanupRecaptcha();
  }, [isOpen]);

  // OTP countdown
  useEffect(() => {
    if (step !== 2 || timerSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) { setCanResend(true); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, timerSeconds]);

  const cleanupRecaptcha = useCallback(() => {
    if (recaptchaVerifierRef.current) {
      try { recaptchaVerifierRef.current.clear(); } catch {}
      recaptchaVerifierRef.current = null;
    }
  }, []);

  const initRecaptcha = useCallback(() => {
    cleanupRecaptcha();
    if (!recaptchaContainerRef.current) return null;
    try {
      const verifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
        size: 'invisible',
        callback: () => {},
        'expired-callback': () => { setErrorMsg('Security verification expired. Please try again.'); cleanupRecaptcha(); }
      });
      recaptchaVerifierRef.current = verifier;
      return verifier;
    } catch {
      setErrorMsg('Failed to initialize security verification. Please refresh.');
      return null;
    }
  }, [cleanupRecaptcha]);

  // Validate step 1 fields
  const validateStep1 = (): boolean => {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) errors.fullName = 'Full name is required';
    if (!email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address';
    if (!isGoogleFlow) {
      if (!password) errors.password = 'Password is required';
      else if (password.length < 8) errors.password = 'Password must be at least 8 characters';
      if (!confirmPassword) errors.confirmPassword = 'Please confirm your password';
      else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
    }
    if (!phoneData.is_valid) errors.phone = 'Enter a valid mobile number';
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
      const verifier = initRecaptcha();
      if (!verifier) { setLoading(false); return; }

      let result: ConfirmationResult;
      if (user && isGoogleFlow) {
        result = await linkWithPhoneNumber(user, phoneData.phone_e164, verifier);
      } else {
        result = await signInWithPhoneNumber(auth, phoneData.phone_e164, verifier);
      }
      setConfirmationResult(result);
      setStep(2);
      setTimerSeconds(60);
      setCanResend(false);
    } catch (error: any) {
      setErrorMsg(getPhoneAuthErrorMessage(error));
      cleanupRecaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleOtpInput = (val: string, index: number) => {
    const clean = val.replace(/\D/g, '');
    const newOtp = [...otp];
    newOtp[index] = clean;
    setOtp(newOtp);
    if (clean && index < 5) document.getElementById(`otp-input-${index + 1}`)?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newOtp = Array.from({ length: 6 }, (_, i) => pasted[i] || '');
      setOtp(newOtp);
      document.getElementById(`otp-input-${Math.min(pasted.length, 5)}`)?.focus();
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-input-${index - 1}`)?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullOtp = otp.join('');
    if (fullOtp.length < 6) { setErrorMsg('Please enter the complete 6-digit code'); return; }
    if (!confirmationResult) { setErrorMsg('Verification session expired. Please request a new code.'); return; }
    if (loading) return;
    setErrorMsg('');
    setLoading(true);
    try {
      await confirmationResult.confirm(fullOtp);
      setStep(3);
    } catch (error: any) {
      setErrorMsg(getPhoneAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend || loading) return;
    setErrorMsg('');
    setLoading(true);
    setOtp(['', '', '', '', '', '']);
    try {
      const verifier = initRecaptcha();
      if (!verifier) { setLoading(false); return; }
      let result: ConfirmationResult;
      if (user && isGoogleFlow) {
        result = await linkWithPhoneNumber(user, phoneData.phone_e164, verifier);
      } else {
        result = await signInWithPhoneNumber(auth, phoneData.phone_e164, verifier);
      }
      setConfirmationResult(result);
      setTimerSeconds(60);
      setCanResend(false);
    } catch (error: any) {
      setErrorMsg(getPhoneAuthErrorMessage(error));
      cleanupRecaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg('');
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) { setErrorMsg('Authentication session lost. Please try again.'); setLoading(false); return; }
      const token = await currentUser.getIdToken();
      const res = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/v1/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          displayName: fullName, email, phone: phoneData.phone_e164,
          photoURL: googlePrefill?.photoURL || '', storageMode,
          provider: isGoogleFlow ? 'google' : 'phone',
          legalAccepted: true, termsVersion: legalDocuments.terms.version,
          privacyVersion: legalDocuments.privacy.version, marketingConsent,
        })
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'Failed to create profile'); }
      setStep(4);
      // Auto-close after success
      setTimeout(() => {
        onCompleteSignup(phoneData.phone_e164, storageMode);
        onClose();
      }, 2000);
    } catch (error: any) {
      setErrorMsg(error.message || 'Failed to create account. Please try again.');
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
      if (result.isNewUser) {
        setFullName(result.user.displayName || '');
        setEmail(result.user.email || '');
      } else {
        // Existing user — close and go to dashboard
        onClose();
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
    return <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1" role="alert"><AlertCircle className="w-3 h-3" />{err}</p>;
  };

  // Step progress
  const steps = [
    { num: 1, label: 'Account' },
    { num: 2, label: 'Verify' },
    { num: 3, label: 'Storage' },
    { num: 4, label: 'Done' },
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
            {/* reCAPTCHA container */}
            <div ref={recaptchaContainerRef} id="recaptcha-container"></div>

            {/* Close button */}
            <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors z-10" aria-label="Close">
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 border-b border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <img src="/SENSA_1.png" alt="SENSA" className="w-6 h-6 object-contain" />
                <span className="text-xs font-mono text-sky-400 tracking-wider">SENSA SECURE ACCESS</span>
              </div>
              <h2 className="text-xl font-bold text-white">
                {step === 4 ? 'Account Created!' : isGoogleFlow ? 'Complete Your Account' : 'Create your SENSA account'}
              </h2>
              {step !== 4 && (
                <p className="text-sm text-slate-400 mt-1">
                  {isGoogleFlow ? 'Complete your profile to get started with SENSA.' : 'Set up your AI-powered security workspace.'}
                </p>
              )}
            </div>

            {/* Step indicator */}
            {step !== 4 && (
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

            {/* Error banner */}
            {errorMsg && (
              <div className="mx-6 sm:mx-8 mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="px-6 sm:px-8 py-5">
              {/* ============ STEP 1: ACCOUNT INFO ============ */}
              {step === 1 && (
                <form onSubmit={handleStep1Submit} className="space-y-4" noValidate>
                  {/* Google sign-up */}
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

                  {/* Name */}
                  <div>
                    <label htmlFor="signup-name" className="text-xs font-medium text-slate-300 mb-1.5 block">Full Name</label>
                    <input id="signup-name" type="text" value={fullName} onChange={e => { setFullName(e.target.value); setFieldErrors(p => ({...p, fullName: ''})); }}
                      placeholder="John Doe" className="w-full bg-[#030303] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 transition-all" />
                    <FieldError field="fullName" />
                  </div>

                  {/* Email */}
                  <div>
                    <label htmlFor="signup-email" className="text-xs font-medium text-slate-300 mb-1.5 block">Email Address</label>
                    <input id="signup-email" type="email" value={email} readOnly={isGoogleFlow}
                      onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({...p, email: ''})); }}
                      placeholder="name@company.com"
                      className={`w-full bg-[#030303] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 transition-all ${isGoogleFlow ? 'opacity-60 cursor-not-allowed' : ''}`} />
                    <FieldError field="email" />
                  </div>

                  {/* Password (non-Google only) */}
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
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <FieldError field="password" />
                        {/* Password strength */}
                        {password.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-300 ${pwStrength.color}`} style={{ width: `${(pwStrength.score / 5) * 100}%` }} />
                              </div>
                              <span className={`text-[10px] font-mono ${pwStrength.score >= 4 ? 'text-emerald-400' : pwStrength.score >= 3 ? 'text-amber-400' : 'text-rose-400'}`}>
                                {pwStrength.label}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                              {pwStrength.checks.map(c => (
                                <span key={c.label} className={`text-[10px] flex items-center gap-1 ${c.met ? 'text-emerald-400' : 'text-slate-600'}`}>
                                  {c.met ? <Check className="w-2.5 h-2.5" /> : <span className="w-2.5 h-2.5 rounded-full border border-slate-700 inline-block" />}
                                  {c.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <label htmlFor="signup-confirm-password" className="text-xs font-medium text-slate-300 mb-1.5 block">Confirm Password</label>
                        <div className="relative">
                          <input id="signup-confirm-password" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword}
                            onChange={e => { setConfirmPassword(e.target.value); setFieldErrors(p => ({...p, confirmPassword: ''})); }}
                            placeholder="Re-enter your password"
                            className="w-full bg-[#030303] border border-white/10 rounded-lg pl-3.5 pr-10 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 transition-all" />
                          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" aria-label={showConfirmPassword ? 'Hide' : 'Show'}>
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <FieldError field="confirmPassword" />
                      </div>
                    </>
                  )}

                  {/* Phone */}
                  <div>
                    <label htmlFor="phone-input" className="text-xs font-medium text-slate-300 mb-1.5 block">Mobile Number</label>
                    <PhoneInput value={phoneData} onChange={v => { setPhoneData(v); setFieldErrors(p => ({...p, phone: ''})); }} />
                    <p className="text-[10px] text-slate-500 mt-1">Used for account verification and real-time security alerts.</p>
                    <FieldError field="phone" />
                  </div>

                  {/* Legal */}
                  <div className="pt-1 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer group">
                      <input type="checkbox" checked={legalAccepted} onChange={e => { setLegalAccepted(e.target.checked); setFieldErrors(p => ({...p, legal: ''})); }}
                        className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-950 accent-sky-500 shrink-0" />
                      <span className="text-xs text-slate-300 leading-relaxed">
                        I agree to the SENSA{' '}
                        <button type="button" onClick={() => onOpenLegal('terms')} className="text-sky-400 hover:underline">Terms of Service</button>{' '}and{' '}
                        <button type="button" onClick={() => onOpenLegal('privacy')} className="text-sky-400 hover:underline">Privacy Policy</button>.
                      </span>
                    </label>
                    <FieldError field="legal" />

                    <label className="flex items-start gap-2.5 cursor-pointer group">
                      <input type="checkbox" checked={marketingConsent} onChange={e => setMarketingConsent(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-950 accent-sky-500 shrink-0" />
                      <span className="text-xs text-slate-400 leading-relaxed">
                        I'd like to receive product updates and security notices from SENSA.
                      </span>
                    </label>
                  </div>

                  {/* Submit */}
                  <button type="submit" disabled={loading}
                    className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 text-[#030303] font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-500/20 disabled:shadow-none mt-2">
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    <span>{loading ? 'Sending verification code...' : 'Continue'}</span>
                  </button>
                </form>
              )}

              {/* ============ STEP 2: OTP VERIFY ============ */}
              {step === 2 && (
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto">
                      <Shield className="w-6 h-6 text-sky-400" />
                    </div>
                    <p className="text-sm font-medium text-white">Verify your mobile number</p>
                    <p className="text-xs text-slate-400">
                      We sent a 6-digit code to{' '}
                      <span className="text-sky-400 font-mono font-medium">
                        {phoneData.country_code} {phoneData.phone_number.substring(0, 2)}{'•'.repeat(Math.max(0, phoneData.phone_number.length - 4))}{phoneData.phone_number.slice(-2)}
                      </span>
                    </p>
                  </div>

                  <div className="flex justify-center gap-2 sm:gap-3">
                    {otp.map((digit, i) => (
                      <input key={i} id={`otp-input-${i}`} type="text" inputMode="numeric" maxLength={1}
                        value={digit} onChange={e => handleOtpInput(e.target.value, i)}
                        onPaste={i === 0 ? handleOtpPaste : undefined} onKeyDown={e => handleOtpKeyDown(e, i)}
                        className="w-10 h-12 sm:w-11 sm:h-13 text-center bg-[#030303] border border-white/10 text-sky-400 text-lg font-bold font-mono rounded-lg outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition-all"
                        aria-label={`Digit ${i + 1}`} />
                    ))}
                  </div>

                  <button type="submit" disabled={loading || otp.join('').length < 6}
                    className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 text-[#030303] font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-500/20 disabled:shadow-none">
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>{loading ? 'Verifying...' : 'Verify Code'}</span>
                  </button>

                  <div className="text-center space-y-2">
                    <button type="button" disabled={!canResend || loading} onClick={handleResendOtp}
                      className="text-xs font-mono text-slate-400 hover:text-sky-400 disabled:opacity-50 transition-colors">
                      {canResend ? 'Resend Code' : `Resend in ${timerSeconds}s`}
                    </button>
                    <button type="button" onClick={() => { setStep(1); setOtp(['','','','','','']); setErrorMsg(''); setConfirmationResult(null); cleanupRecaptcha(); }}
                      className="block w-full text-xs text-slate-500 hover:text-slate-300 transition-colors">
                      <ArrowLeft className="w-3 h-3 inline mr-1" />Change number
                    </button>
                  </div>
                </form>
              )}

              {/* ============ STEP 3: STORAGE MODE ============ */}
              {step === 3 && (
                <form onSubmit={handleCompleteProfile} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300 block">Data Storage Mode</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { mode: 'local' as DataStorageMode, icon: HardDrive, label: 'LOCAL' },
                        { mode: 'hybrid' as DataStorageMode, icon: Zap, label: 'HYBRID' },
                        { mode: 'cloud' as DataStorageMode, icon: Cloud, label: 'CLOUD' },
                      ]).map(opt => (
                        <button key={opt.mode} type="button" onClick={() => setStorageMode(opt.mode)}
                          className={`p-3 rounded-lg border text-center text-xs font-mono transition-all ${
                            storageMode === opt.mode ? 'bg-sky-500/15 border-sky-500/50 text-sky-300 font-bold' : 'bg-[#030303] border-white/10 text-slate-400 hover:border-white/20'
                          }`}>
                          <opt.icon className="w-4 h-4 mx-auto mb-1.5" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-relaxed bg-[#030303] p-2.5 rounded-lg border border-white/5">
                      {storageMode === 'local' && "Video processing and storage in your local environment. You manage infrastructure and security."}
                      {storageMode === 'hybrid' && "Local processing with metadata and alerts synced to SENSA cloud infrastructure."}
                      {storageMode === 'cloud' && "Full cloud processing and storage in SENSA-managed infrastructure."}
                    </div>
                  </div>

                  <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5 flex gap-2 text-[10px] text-slate-400 leading-relaxed">
                    <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      Customers are responsible for ensuring camera deployment and monitoring comply with applicable laws.{' '}
                      <button type="button" onClick={() => onOpenLegal('cctvNotice')} className="text-sky-400 hover:underline">CCTV Notice</button>
                    </span>
                  </div>

                  <button type="submit" disabled={loading}
                    className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-500/20 disabled:shadow-none">
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
                  </button>
                </form>
              )}

              {/* ============ STEP 4: SUCCESS ============ */}
              {step === 4 && (
                <div className="text-center py-6 space-y-4">
                  <motion.div
                    initial={{ scale: shouldReduceMotion ? 1 : 0 }} animate={{ scale: 1 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 15 }}
                    className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto"
                  >
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </motion.div>
                  <h3 className="text-lg font-bold text-white">Welcome to SENSA!</h3>
                  <p className="text-sm text-slate-400">Your account has been created successfully. Redirecting to your dashboard...</p>
                  <div className="flex justify-center">
                    <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
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
