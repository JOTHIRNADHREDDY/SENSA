import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DataStorageMode } from '../types';
import { X, Smartphone, Shield, CheckCircle2, Lock, ArrowRight, RefreshCw, Zap, Server, Cloud, HardDrive, Info, AlertCircle } from 'lucide-react';
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
  googlePrefill?: {
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
  } | null;
}

// Map Firebase error codes to user-friendly messages
function getPhoneAuthErrorMessage(error: any): string {
  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-phone-number':
      return 'The phone number format is invalid. Please check and try again.';
    case 'auth/missing-phone-number':
      return 'Please enter a phone number.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes before trying again.';
    case 'auth/quota-exceeded':
      return 'SMS quota exceeded. Please try again later.';
    case 'auth/captcha-check-failed':
    case 'auth/recaptcha-not-enabled':
      return 'Security verification failed. Please refresh the page and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    case 'auth/operation-not-allowed':
      return 'Phone authentication is not enabled. Please contact support.';
    case 'auth/app-not-authorized':
      return 'This app is not authorized for phone authentication. Please contact support.';
    case 'auth/invalid-verification-code':
      return 'The verification code is incorrect. Please check and try again.';
    case 'auth/code-expired':
      return 'The verification code has expired. Please request a new one.';
    case 'auth/credential-already-in-use':
      return 'This phone number is already linked to another account.';
    default:
      return error?.message || 'Unable to send the verification code right now. Please check your number and try again.';
  }
}

export const SignupModal: React.FC<SignupModalProps> = ({ isOpen, onClose, onCompleteSignup, onOpenLegal, googlePrefill }) => {
  const { user } = useAuth();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phoneData, setPhoneData] = useState<PhoneData>({
    country_code: '+91',
    country_iso2: 'IN',
    country_name: 'India',
    phone_number: '',
    phone_e164: '+91',
    is_valid: false
  });
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [timerSeconds, setTimerSeconds] = useState<number>(60);
  const [canResend, setCanResend] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Form State
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [storageMode, setStorageMode] = useState<DataStorageMode>('hybrid');
  
  // Legal State
  const [legalAccepted, setLegalAccepted] = useState<boolean>(false);
  const [marketingConsent, setMarketingConsent] = useState<boolean>(false);
  const [loginLegalAcknowledged, setLoginLegalAcknowledged] = useState<boolean>(false);

  // Firebase Phone Auth State
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);

  // Prefill from Google when available
  useEffect(() => {
    if (googlePrefill) {
      if (googlePrefill.displayName) setFullName(googlePrefill.displayName);
      if (googlePrefill.email) setEmail(googlePrefill.email);
      setMode('signup');
      // Google users start at phone step since they already have name/email
      setStep(1);
    }
  }, [googlePrefill]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      // Cleanup reCAPTCHA on close
      cleanupRecaptcha();
    }
  }, [isOpen]);

  useEffect(() => {
    if (step !== 2 || timerSeconds <= 0) return;

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step, timerSeconds]);

  const cleanupRecaptcha = useCallback(() => {
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch (e) {
        // Ignore cleanup errors
      }
      recaptchaVerifierRef.current = null;
    }
  }, []);

  const initRecaptcha = useCallback(() => {
    cleanupRecaptcha();
    
    if (!recaptchaContainerRef.current) return null;

    try {
      const verifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved — will proceed with phone auth
        },
        'expired-callback': () => {
          setErrorMsg('Security verification expired. Please try again.');
          cleanupRecaptcha();
        }
      });
      recaptchaVerifierRef.current = verifier;
      return verifier;
    } catch (e) {
      console.error('Failed to initialize reCAPTCHA:', e);
      setErrorMsg('Failed to initialize security verification. Please refresh the page.');
      return null;
    }
  }, [cleanupRecaptcha]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneData.is_valid) {
      setErrorMsg('Enter a valid mobile number for the selected country.');
      return;
    }
    if (loading) return; // Prevent duplicate requests

    setErrorMsg('');
    setLoading(true);

    try {
      const verifier = initRecaptcha();
      if (!verifier) {
        setLoading(false);
        return;
      }

      // Use the authenticated user's auth instance if Google-signed-in (for linking),
      // or regular signInWithPhoneNumber for standalone phone signup
      let result: ConfirmationResult;
      if (user && googlePrefill) {
        // Link phone to existing Google account
        result = await linkWithPhoneNumber(user, phoneData.phone_e164, verifier);
      } else {
        result = await signInWithPhoneNumber(auth, phoneData.phone_e164, verifier);
      }
      
      setConfirmationResult(result);
      setStep(2);
      setTimerSeconds(60);
      setCanResend(false);
    } catch (error: any) {
      console.error('Phone auth error:', error);
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

    if (clean && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  // Handle paste for OTP
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length > 0) {
      const newOtp = [...otp];
      for (let i = 0; i < 6; i++) {
        newOtp[i] = pastedData[i] || '';
      }
      setOtp(newOtp);
      // Focus the last filled input or the next empty one
      const focusIndex = Math.min(pastedData.length, 5);
      const nextInput = document.getElementById(`otp-input-${focusIndex}`);
      nextInput?.focus();
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-input-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullOtp = otp.join('');
    if (fullOtp.length < 6) {
      setErrorMsg('Please enter the complete 6-digit code');
      return;
    }
    if (!confirmationResult) {
      setErrorMsg('Verification session expired. Please request a new code.');
      return;
    }
    if (loading) return;

    setErrorMsg('');
    setLoading(true);

    try {
      await confirmationResult.confirm(fullOtp);
      setStep(3);
    } catch (error: any) {
      console.error('OTP verification error:', error);
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
      if (!verifier) {
        setLoading(false);
        return;
      }

      let result: ConfirmationResult;
      if (user && googlePrefill) {
        result = await linkWithPhoneNumber(user, phoneData.phone_e164, verifier);
      } else {
        result = await signInWithPhoneNumber(auth, phoneData.phone_e164, verifier);
      }

      setConfirmationResult(result);
      setTimerSeconds(60);
      setCanResend(false);
    } catch (error: any) {
      console.error('Resend OTP error:', error);
      setErrorMsg(getPhoneAuthErrorMessage(error));
      cleanupRecaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const isGoogleFlow = !!googlePrefill;
    
    if (!fullName || !email) {
      setErrorMsg('Name and email are required');
      return;
    }
    if (!isGoogleFlow && !password) {
      setErrorMsg('Password is required');
      return;
    }
    if (!legalAccepted) {
      setErrorMsg('Please review and accept the SENSA Terms of Service and Privacy Policy before creating your account.');
      return;
    }
    setErrorMsg('');
    setLoading(true);

    try {
      // Get the current authenticated user's token for backend call
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setErrorMsg('Authentication session lost. Please try again.');
        setLoading(false);
        return;
      }

      const token = await currentUser.getIdToken();
      
      // Create SENSA profile via backend
      const res = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/v1/auth/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          displayName: fullName,
          email: email,
          phone: phoneData.phone_e164,
          photoURL: googlePrefill?.photoURL || '',
          storageMode: storageMode,
          provider: isGoogleFlow ? 'google' : 'phone',
          legalAccepted: true,
          termsVersion: legalDocuments.terms.version,
          privacyVersion: legalDocuments.privacy.version,
          marketingConsent: marketingConsent,
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create profile');
      }

      setLoading(false);
      onCompleteSignup(phoneData.phone_e164, storageMode);
      onClose();
    } catch (error: any) {
      console.error('Profile creation error:', error);
      setErrorMsg(error.message || 'Failed to create account. Please try again.');
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter email and password');
      return;
    }
    if (!loginLegalAcknowledged) {
      setErrorMsg('Please acknowledge the current legal documents.');
      return;
    }
    setErrorMsg('');
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      onClose();
    }, 1000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 relative shadow-2xl my-8">
        {/* Invisible reCAPTCHA container */}
        <div ref={recaptchaContainerRef} id="recaptcha-container"></div>
        
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-mono">
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>SENSA SECURE ACCESS</span>
          </div>
          <h3 className="text-2xl font-bold text-white">
            {mode === 'signup' ? (googlePrefill ? 'Complete Your Account' : 'Create Account') : 'Welcome Back'}
          </h3>
          {!googlePrefill && (
            <div className="flex justify-center gap-4 mt-2 border-b border-slate-800 pb-2">
              <button 
                className={`text-sm font-medium pb-2 ${mode === 'signup' ? 'text-sky-400 border-b-2 border-sky-400' : 'text-slate-500'}`}
                onClick={() => { setMode('signup'); setErrorMsg(''); }}
              >
                Sign Up
              </button>
              <button 
                className={`text-sm font-medium pb-2 ${mode === 'login' ? 'text-sky-400 border-b-2 border-sky-400' : 'text-slate-500'}`}
                onClick={() => { setMode('login'); setErrorMsg(''); }}
              >
                Log In
              </button>
            </div>
          )}
          {googlePrefill && (
            <p className="text-sm text-slate-400">Complete your SENSA profile to get started.</p>
          )}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Work Email"
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-sky-500"
              />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-sky-500"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-3 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={loginLegalAcknowledged}
                  onChange={(e) => setLoginLegalAcknowledged(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-950 accent-sky-500"
                />
                <span className="leading-snug">
                  I acknowledge the current SENSA <button type="button" onClick={() => onOpenLegal('terms')} className="text-sky-400 hover:underline">Terms of Service</button> and <button type="button" onClick={() => onOpenLegal('privacy')} className="text-sky-400 hover:underline">Privacy Policy</button>.
                </span>
              </label>
              <p className="text-[10px] text-slate-500 pl-7 leading-relaxed">
                By continuing, you acknowledge the current SENSA legal documents. Your original account agreement remains governed by the version accepted when your account was created or subsequently updated.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !loginLegalAcknowledged}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-sm transition-all cursor-pointer shadow-lg shadow-sky-500/25 disabled:shadow-none"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              <span>Log In</span>
            </button>
          </form>
        )}

        {mode === 'signup' && (
          <>
            {/* Step Indicator Bar */}
            <div className="flex items-center justify-between text-xs font-mono border-b border-slate-800 pb-4">
              <div className={`flex items-center gap-1.5 ${step >= 1 ? 'text-sky-400 font-bold' : 'text-slate-500'}`}>
                <span className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-[10px]">1</span>
                <span>Phone</span>
              </div>
              <div className={`flex items-center gap-1.5 ${step >= 2 ? 'text-sky-400 font-bold' : 'text-slate-500'}`}>
                <span className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-[10px]">2</span>
                <span>Verify</span>
              </div>
              <div className={`flex items-center gap-1.5 ${step >= 3 ? 'text-sky-400 font-bold' : 'text-slate-500'}`}>
                <span className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-[10px]">3</span>
                <span>Account</span>
              </div>
            </div>

            {/* Step 1: Phone Entry */}
            {step === 1 && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 flex gap-3 mb-2 text-xs">
                  <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <p className="text-slate-300">
                    <span className="font-semibold text-white">Enterprise customers</span> may require additional contractual terms, security commitments, DPAs, data-residency requirements, or negotiated service levels.{' '}
                    <button type="button" className="text-sky-400 hover:underline">Enterprise Security &amp; Compliance</button>
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="phone-input" className="text-xs font-mono text-slate-400 uppercase tracking-wider block">
                    Mobile number
                  </label>
                  <PhoneInput 
                    value={phoneData}
                    onChange={setPhoneData}
                  />
                  <p className="text-[10px] text-slate-500 font-mono">
                    Used to verify account and deliver real-time intrusion WhatsApp alerts.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading || !phoneData.is_valid}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-lg shadow-sky-500/25 disabled:shadow-none"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>{loading ? 'Sending...' : 'Send Verification Code'}</span>
                </button>
              </form>
            )}

            {/* Step 2: OTP Verification */}
            {step === 2 && (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-white">
                    Verify your mobile number
                  </p>
                  <p className="text-xs font-mono text-slate-300">
                    We sent a verification code to <span className="text-sky-400 font-bold">{phoneData.country_code} {phoneData.phone_number.substring(0, 2)}{'X'.repeat(Math.max(0, phoneData.phone_number.length - 4))}{phoneData.phone_number.slice(-2)}</span>
                  </p>
                </div>

                <div className="flex justify-between gap-2">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      id={`otp-input-${i}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpInput(e.target.value, i)}
                      onPaste={i === 0 ? handleOtpPaste : undefined}
                      onKeyDown={(e) => handleOtpKeyDown(e, i)}
                      className="w-10 h-12 text-center bg-slate-950 border border-slate-800 text-sky-400 text-lg font-bold font-mono rounded-xl outline-none focus:border-sky-500"
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.join('').length < 6}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-lg shadow-sky-500/25 disabled:shadow-none"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{loading ? 'Verifying...' : 'Verify Code'}</span>
                </button>

                <div className="text-center space-y-2 mt-4">
                  <button
                    type="button"
                    disabled={!canResend || loading}
                    onClick={handleResendOtp}
                    className="block w-full text-xs font-mono text-slate-400 hover:text-sky-400 disabled:opacity-50 transition-colors"
                  >
                    {canResend ? 'Resend OTP Code' : `Resend in ${timerSeconds}s`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setOtp(['', '', '', '', '', '']);
                      setErrorMsg('');
                      setConfirmationResult(null);
                      cleanupRecaptcha();
                    }}
                    className="block w-full text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Change mobile number
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Registration & Storage Selection */}
            {step === 3 && (
              <form onSubmit={handleCompleteRegister} className="space-y-4">
                <div className="space-y-3">
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2.5 text-xs font-mono outline-none focus:border-sky-500"
                  />

                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Work Email"
                    readOnly={!!googlePrefill}
                    className={`w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2.5 text-xs font-mono outline-none focus:border-sky-500 ${googlePrefill ? 'opacity-60 cursor-not-allowed' : ''}`}
                  />

                  {!googlePrefill && (
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password (min 8 chars)"
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2.5 text-xs font-mono outline-none focus:border-sky-500"
                    />
                  )}
                </div>

                {/* Storage Mode Selector */}
                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block">
                    Data Storage Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setStorageMode('local')}
                      className={`p-2.5 rounded-xl border text-center font-mono text-xs transition-all ${
                        storageMode === 'local' ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-bold' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <HardDrive className="w-4 h-4 mx-auto mb-1" />
                      <span>LOCAL</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStorageMode('hybrid')}
                      className={`p-2.5 rounded-xl border text-center font-mono text-xs transition-all ${
                        storageMode === 'hybrid' ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-bold' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Zap className="w-4 h-4 mx-auto mb-1" />
                      <span>HYBRID</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStorageMode('cloud')}
                      className={`p-2.5 rounded-xl border text-center font-mono text-xs transition-all ${
                        storageMode === 'cloud' ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-bold' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Cloud className="w-4 h-4 mx-auto mb-1" />
                      <span>CLOUD</span>
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 leading-relaxed bg-slate-950 p-2 rounded-lg border border-slate-800">
                    {storageMode === 'local' && "Video processing and storage occur in the customer's configured local environment. The customer is responsible for local infrastructure, physical security, network security, backups, and retention settings."}
                    {storageMode === 'hybrid' && "Certain processing occurs locally while configured metadata, snapshots, alerts, health information, or other service data may synchronize with SENSA infrastructure according to the selected configuration."}
                    {storageMode === 'cloud' && "Configured service data may be stored and processed in SENSA-managed cloud infrastructure and may be subject to applicable data-location and international-transfer provisions."}
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 bg-slate-800/30 p-2.5 rounded-lg border border-slate-700/50 mt-4 leading-relaxed">
                  SENSA provides AI-assisted video analysis and alerting. Customers are responsible for ensuring that camera deployment, monitoring, recording, employee monitoring, biometric processing, and alert practices comply with applicable laws, notices, consent requirements, workplace rules, and local restrictions.{' '}
                  <button type="button" onClick={() => onOpenLegal('cctvNotice')} className="text-sky-400 hover:underline whitespace-nowrap">Read CCTV &amp; Responsible Use Notice</button>
                </div>

                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold text-white mb-2">Account Agreement</h4>
                  <label className="flex items-start gap-3 text-xs text-slate-300 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={legalAccepted}
                      onChange={(e) => setLegalAccepted(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-950 accent-sky-500"
                    />
                    <span className="leading-snug">
                      I have read and agree to the SENSA <button type="button" onClick={() => onOpenLegal('terms')} className="text-sky-400 hover:underline">Terms of Service</button> and <button type="button" onClick={() => onOpenLegal('privacy')} className="text-sky-400 hover:underline">Privacy Policy</button>.
                    </span>
                  </label>

                  <label className="flex items-start gap-3 text-xs text-slate-300 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={marketingConsent}
                      onChange={(e) => setMarketingConsent(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-950 accent-sky-500"
                    />
                    <span className="leading-snug">
                      I would like to receive product updates, security notices, and occasional marketing communications from SENSA.
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading || !legalAccepted}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-sm transition-all cursor-pointer shadow-lg shadow-sky-500/25 disabled:shadow-none mt-4"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-current" />}
                  <span>{loading ? 'Creating Account...' : 'Create Free Account →'}</span>
                </button>
              </form>
            )}
          </>
        )}
      </div>
            </motion.div>
      )}
    </AnimatePresence>
  );
};
