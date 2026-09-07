import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { User, Shield, Mail, Phone, Building2, Calendar, Clock, CheckCircle2, XCircle, Edit3, LogOut, Key, Camera, RefreshCw, Save, X, Check } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { auth } from '../lib/firebase';
import { updateProfile, sendEmailVerification } from 'firebase/auth';

interface ProfilePageProps {
  onSignOut: () => void;
  setActiveTab: (tab: string) => void;
}

interface SensaProfile {
  displayName?: string;
  phone?: string;
  storageMode?: string;
  provider?: string;
  createdAt?: string;
}

interface OrgInfo {
  name?: string;
  role?: string;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ onSignOut, setActiveTab }) => {
  const shouldReduceMotion = useReducedMotion();
  const { user, logout } = useAuth();
  const [sensaProfile, setSensaProfile] = useState<SensaProfile | null>(null);
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const headers = { 'Authorization': `Bearer ${token}` };

      // Load SENSA profile
      const profileRes = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/v1/auth/profile', { headers });
      if (profileRes.ok) {
        const data = await profileRes.json();
        if (data.exists && data.profile?.fields) {
          const f = data.profile.fields;
          setSensaProfile({
            displayName: f.displayName?.stringValue || '',
            phone: f.phone?.stringValue || '',
            storageMode: f.storageMode?.stringValue || 'hybrid',
            provider: f.provider?.stringValue || '',
            createdAt: f.createdAt?.timestampValue || '',
          });
        }
      }

      // Load organization
      const orgRes = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/v1/organizations', { headers });
      if (orgRes.ok) {
        const orgData = await orgRes.json();
        if (orgData.organizations?.length > 0) {
          const org = orgData.organizations[0];
          const orgName = org.fields?.name?.stringValue || 'My Organization';
          const isOwner = org.fields?.ownerId?.stringValue === user.uid;
          setOrgInfo({ name: orgName, role: isOwner ? 'Owner' : 'Member' });
        }
      }
    } catch (e) {
      console.error('Failed to load profile data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = () => {
    setEditing(true);
    setEditName(user?.displayName || sensaProfile?.displayName || '');
    setEditPhone(sensaProfile?.phone || user?.phoneNumber || '');
    setSaveSuccess(false);
  };

  const handleSaveProfile = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      // Update Firebase displayName
      if (editName !== user.displayName) {
        await updateProfile(user, { displayName: editName });
      }

      // Update SENSA backend
      const token = await user.getIdToken(true);
      const res = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/v1/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ displayName: editName, phone: editPhone })
      });
      if (!res.ok) throw new Error('Failed to update profile');
      
      setSaveSuccess(true);
      setEditing(false);
      await loadProfile();
    } catch (e) {
      console.error('Failed to save profile:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSendEmailVerification = async () => {
    if (!user || sendingVerification) return;
    setSendingVerification(true);
    try {
      await sendEmailVerification(user);
      setVerificationSent(true);
    } catch (e) {
      console.error('Failed to send verification email:', e);
    } finally {
      setSendingVerification(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    onSignOut();
  };

  if (!user) return null;

  const providers = user.providerData.map(p => p.providerId);
  const hasGoogle = providers.includes('google.com');
  const hasPassword = providers.includes('password');
  const hasPhone = providers.includes('phone');
  const initials = (user.displayName || user.email || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const accountAge = user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown';
  const lastSignIn = user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 text-sky-400 animate-spin" />
      </div>
    );
  }

  const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; delay?: number }> = ({ title, icon, children, delay = 0 }) => (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.4, delay: shouldReduceMotion ? 0 : delay, ease: 'easeOut' }}
      className="bg-[#0A0E17] border border-white/[0.06] rounded-xl overflow-hidden"
    >
      <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </motion.div>
  );

  const InfoRow: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-xs font-medium text-slate-500 sm:w-36 shrink-0">{label}</span>
      <span className={`text-sm text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>{value || <span className="text-slate-600">Not set</span>}</span>
    </div>
  );

  const Badge: React.FC<{ verified: boolean; label: string }> = ({ verified, label }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
      verified ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
    }`}>
      {verified ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.4 }}
        className="bg-[#0A0E17] border border-white/[0.06] rounded-xl overflow-hidden"
      >
        <div className="h-20 bg-gradient-to-r from-sky-500/20 via-blue-500/10 to-transparent" />
        <div className="px-5 pb-5 -mt-8 flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="relative">
            {user.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-16 h-16 rounded-full border-2 border-[#0A0E17] object-cover shadow-lg" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-16 h-16 rounded-full border-2 border-[#0A0E17] bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                {initials}
              </div>
            )}
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#0A0E17] flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white truncate">{user.displayName || sensaProfile?.displayName || 'SENSA User'}</h2>
            <p className="text-sm text-slate-400 truncate">{user.email}</p>
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <button onClick={handleStartEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
              <Edit3 className="w-3 h-3" /> Edit Profile
            </button>
          </div>
        </div>
        {saveSuccess && (
          <div className="mx-5 mb-4 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Profile updated successfully.
          </div>
        )}
      </motion.div>

      {/* Edit Modal */}
      {editing && (
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : undefined }}
          className="bg-[#0A0E17] border border-sky-500/20 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Edit3 className="w-4 h-4 text-sky-400" /> Edit Profile</h3>
            <button onClick={() => setEditing(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Full Name</label>
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
              className="w-full bg-[#030303] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-sky-500/50 transition-all" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Phone</label>
            <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)}
              className="w-full bg-[#030303] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono outline-none focus:border-sky-500/50 transition-all" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button onClick={handleSaveProfile} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-[#030303] text-xs font-bold transition-colors disabled:opacity-50">
              {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </motion.div>
      )}

      {/* Personal Information */}
      <Section title="Personal Information" icon={<User className="w-4 h-4 text-sky-400" />} delay={0.1}>
        <InfoRow label="Full Name" value={user.displayName || sensaProfile?.displayName} />
        <InfoRow label="Email" value={
          <span className="flex items-center gap-2">
            {user.email}
            <Badge verified={user.emailVerified} label={user.emailVerified ? 'Verified' : 'Not Verified'} />
          </span>
        } />
        <InfoRow label="Phone" value={
          sensaProfile?.phone || user.phoneNumber ? (
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs">{sensaProfile?.phone || user.phoneNumber}</span>
              <Badge verified={!!user.phoneNumber || hasPhone} label={user.phoneNumber || hasPhone ? 'Verified' : 'Not Verified'} />
            </span>
          ) : null
        } />
        <InfoRow label="Storage Mode" value={
          sensaProfile?.storageMode ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-mono uppercase font-bold">
              {sensaProfile.storageMode}
            </span>
          ) : null
        } />
      </Section>

      {/* Account Information */}
      <Section title="Account Information" icon={<Calendar className="w-4 h-4 text-sky-400" />} delay={0.15}>
        <InfoRow label="User ID" value={user.uid} mono />
        <InfoRow label="Account Created" value={accountAge} />
        <InfoRow label="Last Sign In" value={lastSignIn} />
      </Section>

      {/* Security */}
      <Section title="Security" icon={<Shield className="w-4 h-4 text-sky-400" />} delay={0.2}>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate-200">Google</p>
                <p className="text-[10px] text-slate-500">Sign in with Google</p>
              </div>
            </div>
            <Badge verified={hasGoogle} label={hasGoogle ? 'Connected' : 'Not Connected'} />
          </div>

          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                <Key className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <p className="text-sm text-slate-200">Email &amp; Password</p>
                <p className="text-[10px] text-slate-500">Traditional sign in</p>
              </div>
            </div>
            <Badge verified={hasPassword} label={hasPassword ? 'Enabled' : 'Not Set'} />
          </div>

          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                <Phone className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <p className="text-sm text-slate-200">Phone</p>
                <p className="text-[10px] text-slate-500">SMS verification</p>
              </div>
            </div>
            <Badge verified={hasPhone || !!user.phoneNumber} label={hasPhone || user.phoneNumber ? 'Verified' : 'Not Verified'} />
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                <Mail className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <p className="text-sm text-slate-200">Email Verification</p>
                <p className="text-[10px] text-slate-500">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge verified={user.emailVerified} label={user.emailVerified ? 'Verified' : 'Not Verified'} />
              {!user.emailVerified && (
                <button onClick={handleSendEmailVerification} disabled={sendingVerification || verificationSent}
                  className="text-[10px] text-sky-400 hover:text-sky-300 font-medium disabled:opacity-50 transition-colors">
                  {verificationSent ? 'Sent!' : sendingVerification ? 'Sending...' : 'Verify'}
                </button>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* Organization */}
      {orgInfo && (
        <Section title="Organization" icon={<Building2 className="w-4 h-4 text-sky-400" />} delay={0.25}>
          <InfoRow label="Organization" value={orgInfo.name} />
          <InfoRow label="Role" value={
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-mono uppercase font-bold">
              {orgInfo.role}
            </span>
          } />
        </Section>
      )}

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.4, delay: shouldReduceMotion ? 0 : 0.3 }}
        className="flex flex-col sm:flex-row gap-3"
      >
        <button onClick={() => setActiveTab('billing')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
          <Key className="w-4 h-4" /> Billing &amp; Subscription
        </button>
        <button onClick={handleSignOut}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm font-medium text-rose-400 hover:bg-rose-500/20 transition-colors">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </motion.div>
    </div>
  );
};
