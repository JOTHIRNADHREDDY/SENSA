import React, { useState } from 'react';
import { Camera, Brain, Bell, LayoutDashboard, Shield, AlertCircle, ArrowRight, ArrowLeft, Mail, Lock, Check } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';

interface LoginPageProps {
  onBackToApp: () => void;
  onOpenLegal: (type: 'terms' | 'privacy') => void;
  onCreateAccount: () => void;
  onGoHome: () => void;
  onGoogleNewUser?: (userData: { displayName: string | null; email: string | null; photoURL: string | null }) => void;
}

type AuthState = 'login' | 'forgot' | 'mfa' | 'sso';

export const LoginPage: React.FC<LoginPageProps> = ({ onBackToApp, onOpenLegal, onCreateAccount, onGoHome, onGoogleNewUser }) => {
  const { signInWithGoogle } = useAuth();
  const [authState, setAuthState] = useState<AuthState>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [legalChecked, setLegalChecked] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MFA State
  const [mfaCode, setMfaCode] = useState('');
  
  // SSO State
  const [ssoEmail, setSsoEmail] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!legalChecked) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const { auth } = await import('../../lib/firebase');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Check if SENSA profile exists
      const token = await userCredential.user.getIdToken();
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!data.exists) {
        // Orphaned account
        const { signOut } = await import('firebase/auth');
        await signOut(auth);
        setError('Account verification incomplete. Please sign up to complete your profile.');
      } else {
        onBackToApp(); // Success -> Go to dashboard
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('The email or password is incorrect.');
      } else {
        setError(err.message || 'Failed to sign in.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      const { auth } = await import('../../lib/firebase');
      await sendPasswordResetEmail(auth, email);
      setError('If an account is associated with this address, a password-reset link will be sent shortly.');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaVerify = (e: React.FormEvent) => {
    e.preventDefault();
    // MFA not yet fully implemented on backend, placeholder
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setError('The verification code is invalid or expired.');
    }, 1000);
  };

  const handleSsoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setError('Enterprise SSO is not configured for this domain.');
    }, 1500);
  };

  const isValidLogin = email.includes('@') && password.length > 0 && legalChecked;

  const renderLeftPanel = () => (
    <div className="hidden lg:flex flex-col w-[45%] bg-[#050B14] border-r border-sky-500/10 p-12 relative overflow-hidden">
      {/* Decorative background grid and glow */}
      <div className="absolute inset-0 bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay"></div>
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-sky-500/5 via-transparent to-transparent pointer-events-none"></div>
      
      {/* Small system label */}
      <div className="flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <img src="/SENSA_1.png" alt="SENSA Logo" className="w-8 h-8 object-contain" />
          <img src="/SENSA_2.png" alt="SENSA Brand" className="h-10 object-contain -ml-1 opacity-90" />
        </div>
        <div className="font-mono text-[10px] text-sky-400 tracking-widest px-2 py-1 border border-sky-500/20 rounded bg-sky-500/5">
          AUTH NODE · GLOBAL-01
        </div>
      </div>

      <div className="mt-16 z-10 max-w-md">
        <div className="font-mono text-xs text-sky-400 tracking-wider mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4" />
          AI SECURITY PLATFORM
        </div>
        <h1 className="font-display text-4xl font-bold text-white leading-tight mb-4">
          Secure access to your SENSA workspace.
        </h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          Monitor AI-powered security alerts, cameras, sites, and intelligent detection systems from one secure workspace.
        </p>
      </div>

      {/* Visual System Representation */}
      <div className="mt-16 flex-1 z-10">
        <div className="flex items-center justify-between text-slate-500 max-w-sm relative">
          <div className="absolute left-6 top-1/2 -translate-y-1/2 w-[calc(100%-3rem)] h-px bg-gradient-to-r from-sky-500/0 via-sky-500/20 to-sky-500/0"></div>
          
          <div className="flex flex-col items-center gap-2 relative z-10 bg-[#050B14] px-2">
            <div className="w-10 h-10 rounded border border-sky-500/20 bg-[#0a111c] flex items-center justify-center text-sky-400">
              <Camera className="w-5 h-5" />
            </div>
            <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">Camera</span>
          </div>

          <div className="flex flex-col items-center gap-2 relative z-10 bg-[#050B14] px-2">
            <div className="w-10 h-10 rounded border border-emerald-500/20 bg-[#0a1617] flex items-center justify-center text-emerald-400">
              <Brain className="w-5 h-5" />
            </div>
            <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">AI Logic</span>
          </div>

          <div className="flex flex-col items-center gap-2 relative z-10 bg-[#050B14] px-2">
            <div className="w-10 h-10 rounded border border-amber-500/20 bg-[#16120a] flex items-center justify-center text-amber-400">
              <AlertCircle className="w-5 h-5" />
            </div>
            <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">Alert</span>
          </div>

          <div className="flex flex-col items-center gap-2 relative z-10 bg-[#050B14] px-2">
            <div className="w-10 h-10 rounded border border-sky-500/20 bg-[#0a111c] flex items-center justify-center text-sky-400">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">Dashboard</span>
          </div>
        </div>
      </div>

      {/* Security Badges */}
      <div className="mt-12 flex gap-3 flex-wrap z-10">
        {['LOCAL PROCESSING', 'ENCRYPTED CONNECTION', 'GLOBAL INFRASTRUCTURE', 'ROLE-BASED ACCESS'].map((badge) => (
          <div key={badge} className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/5 border border-white/5 text-[10px] font-mono text-slate-300">
            <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
            {badge}
          </div>
        ))}
      </div>

      <div className="mt-auto pt-8 border-t border-white/5 font-mono text-[10px] tracking-widest text-slate-500 z-10">
        SENSA · AI SECURITY INFRASTRUCTURE
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-[#030303] text-slate-200 flex selection:bg-sky-500/30">
      {renderLeftPanel()}
      
      {/* Right Panel - Login Card Container */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-y-auto custom-scrollbar">
        
        {/* Back to Home Button */}
        <div className="absolute top-6 left-6 sm:top-8 sm:left-8">
          <button 
            onClick={onGoHome}
            className="flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-400 hover:text-white transition-colors uppercase group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Return to Home
          </button>
        </div>

        {/* Mobile Logo Only */}
        <div className="lg:hidden mb-8 mt-12 flex items-center gap-3">
          <img src="/SENSA_1.png" alt="SENSA Logo" className="w-8 h-8 object-contain" />
          <img src="/SENSA_2.png" alt="SENSA Brand" className="h-8 object-contain -ml-1 opacity-90" />
        </div>

        <div className="w-full max-w-[420px] bg-[#0A0E17] border border-white/5 rounded-xl p-8 shadow-2xl shadow-black/50">
          
          {/* LOGIN STATE */}
          {authState === 'login' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h2 className="font-display text-2xl font-semibold text-white mb-2">Welcome back</h2>
              <p className="text-slate-400 text-sm mb-8">Sign in to your SENSA workspace.</p>

              {error && (
                <div className="mb-6 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300" htmlFor="email">Email</label>
                  <div className="relative">
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full bg-[#030303] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300" htmlFor="password">Password</label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full bg-[#030303] border border-white/10 rounded-lg pl-4 pr-10 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none text-xs font-medium"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative w-4 h-4 bg-[#030303] border border-white/20 rounded flex items-center justify-center group-hover:border-sky-500/50 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="opacity-0 absolute inset-0 cursor-pointer"
                      />
                      {rememberMe && <Check className="w-3 h-3 text-sky-400" />}
                    </div>
                    <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">Remember me</span>
                  </label>
                  
                  <button 
                    type="button" 
                    onClick={() => { setError(null); setAuthState('forgot'); }}
                    className="text-xs text-sky-400 hover:text-sky-300 transition-colors focus:outline-none"
                  >
                    Forgot password?
                  </button>
                </div>

                <div className="pt-2">
                  <label className="flex items-start gap-3 cursor-pointer group p-3 rounded border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                    <div className="relative w-4 h-4 shrink-0 bg-[#030303] border border-white/20 rounded flex items-center justify-center group-hover:border-sky-500/50 mt-0.5 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={legalChecked}
                        onChange={(e) => setLegalChecked(e.target.checked)}
                        className="opacity-0 absolute inset-0 cursor-pointer"
                      />
                      {legalChecked && <Check className="w-3 h-3 text-sky-400" />}
                    </div>
                    <div className="text-xs text-slate-400 leading-relaxed">
                      I acknowledge the current SENSA{' '}
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenLegal('terms'); }} className="text-sky-400 hover:text-sky-300 underline underline-offset-2">Terms of Service</button>
                      {' '}and{' '}
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenLegal('privacy'); }} className="text-sky-400 hover:text-sky-300 underline underline-offset-2">Privacy Policy</button>.
                      <p className="text-[10px] text-slate-500 mt-1">
                        Your account remains governed by the legal terms accepted when your account was created or subsequently updated.
                      </p>
                    </div>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={!isValidLogin || isLoading}
                  className="w-full bg-sky-500 hover:bg-sky-400 text-[#030303] font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_15px_rgba(14,165,233,0.3)] disabled:shadow-none"
                >
                  {isLoading ? 'Signing in...' : (
                    <>Sign In <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>

              <div className="mt-8">
                <div className="relative flex items-center py-4">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink-0 mx-4 text-xs font-mono text-slate-600 uppercase tracking-wider">Or continue with</span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    type="button"
                    onClick={async () => {
                      try {
                        setIsLoading(true);
                        setError(null);
                        const result = await signInWithGoogle();
                        if (result.isNewUser && onGoogleNewUser) {
                          // New Google user — open registration to complete profile
                          onGoogleNewUser({
                            displayName: result.user.displayName,
                            email: result.user.email,
                            photoURL: result.user.photoURL,
                          });
                        } else {
                          // Existing user — go to dashboard
                          onBackToApp();
                        }
                      } catch (err: any) {
                        setError(err?.message || 'Failed to sign in with Google');
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    className="w-full bg-[#030303] border border-white/10 hover:border-white/20 hover:bg-white/5 text-slate-300 py-2.5 rounded-lg text-sm flex items-center justify-center gap-3 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                  </button>
                  <button className="w-full bg-[#030303] border border-white/10 hover:border-white/20 hover:bg-white/5 text-slate-300 py-2.5 rounded-lg text-sm flex items-center justify-center gap-3 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 21 21">
                      <path fill="#f25022" d="M1 1h9v9H1z" />
                      <path fill="#00a4ef" d="M1 11h9v9H1z" />
                      <path fill="#7fba00" d="M11 1h9v9h-9z" />
                      <path fill="#ffb900" d="M11 11h9v9h-9z" />
                    </svg>
                    Continue with Microsoft
                  </button>
                  <button 
                    onClick={() => { setError(null); setAuthState('sso'); }}
                    className="w-full bg-[#030303] border border-white/10 hover:border-white/20 hover:bg-white/5 text-slate-300 py-2.5 rounded-lg text-sm flex items-center justify-center gap-3 transition-colors"
                  >
                    <Shield className="w-4 h-4 text-slate-400" />
                    Enterprise SSO
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FORGOT PASSWORD STATE */}
          {authState === 'forgot' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="font-display text-2xl font-semibold text-white mb-2">Reset your password</h2>
              <p className="text-slate-400 text-sm mb-8">Enter the email associated with your SENSA account.</p>

              {error && (
                <div className={`mb-6 p-3 rounded border text-xs flex items-start gap-2 ${error.includes('sent') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300" htmlFor="reset-email">Email</label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full bg-[#030303] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 transition-all"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={!email.includes('@') || isLoading}
                  className="w-full bg-white text-black hover:bg-slate-200 font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>

              <button 
                onClick={() => { setError(null); setAuthState('login'); }}
                className="mt-6 flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Back to sign in
              </button>
            </div>
          )}

          {/* MFA STATE */}
          {authState === 'mfa' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="font-display text-2xl font-semibold text-white mb-2">Verify your identity</h2>
              <p className="text-slate-400 text-sm mb-8">Enter the verification code sent to your registered authentication method.</p>

              {error && (
                <div className="mb-6 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleMfaVerify} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300" htmlFor="mfa-code">Verification Code</label>
                  <input
                    id="mfa-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full bg-[#030303] border border-white/10 rounded-lg px-4 py-2.5 text-center tracking-[0.5em] text-lg font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 transition-all"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={mfaCode.length !== 6 || isLoading}
                  className="w-full bg-sky-500 hover:bg-sky-400 text-[#030303] font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_15px_rgba(14,165,233,0.3)] disabled:shadow-none"
                >
                  {isLoading ? 'Verifying...' : 'Verify'}
                </button>
              </form>

              <div className="mt-6 space-y-3">
                <button className="w-full text-xs text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-2">
                  Resend code <span className="text-slate-600 ml-1">Resend available in 00:30</span>
                </button>
                <button className="w-full text-xs text-sky-400 hover:text-sky-300 transition-colors flex items-center justify-center">
                  Use another verification method
                </button>
              </div>

              <button 
                onClick={() => { setError(null); setAuthState('login'); setMfaCode(''); }}
                className="mt-8 flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Cancel
              </button>
            </div>
          )}

          {/* ENTERPRISE SSO STATE */}
          {authState === 'sso' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="font-display text-2xl font-semibold text-white mb-2">Enterprise sign in</h2>
              <p className="text-slate-400 text-sm mb-8">Sign in using your organization's identity provider.</p>

              <form onSubmit={handleSsoSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300" htmlFor="sso-email">Work email</label>
                  <input
                    id="sso-email"
                    type="email"
                    autoComplete="email"
                    value={ssoEmail}
                    onChange={(e) => setSsoEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full bg-[#030303] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 transition-all"
                    required
                  />
                </div>

                {ssoEmail.includes('@') && ssoEmail.length > 5 && (
                  <div className="p-3 bg-white/5 border border-white/10 rounded flex items-start gap-3 animate-in fade-in duration-300">
                    <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-300">
                      Your organization uses enterprise identity management. You will be redirected to authenticate.
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!ssoEmail.includes('@') || isLoading}
                  className="w-full bg-white text-black hover:bg-slate-200 font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Redirecting...' : 'Continue'}
                </button>
              </form>

              <button 
                onClick={() => { setError(null); setAuthState('login'); }}
                className="mt-6 flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Back to sign in
              </button>
            </div>
          )}
        </div>

        {/* Global Footer Elements in Login context */}
        <div className="mt-8 flex flex-col items-center gap-6 pb-8">
          <div className="text-slate-400 text-sm flex items-center gap-2">
            Don't have a SENSA account? 
            <button 
              onClick={onCreateAccount}
              className="text-sky-400 hover:text-sky-300 font-medium transition-colors flex items-center gap-1"
            >
              Create an account <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
              Secure connection
            </div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
              SENSA Authentication
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <span className="text-xs text-slate-600">Worldwide platform · Privacy controls vary by jurisdiction</span>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <button onClick={() => onOpenLegal('privacy')} className="hover:text-slate-300 transition-colors">Privacy</button>
              <button onClick={() => onOpenLegal('terms')} className="hover:text-slate-300 transition-colors">Terms</button>
              <button onClick={() => onOpenLegal('terms')} className="hover:text-slate-300 transition-colors">Security</button>
              <a href="mailto:support@sensa.io" className="hover:text-slate-300 transition-colors">Contact</a>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
