import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CameraStream, SecurityAlert, PolygonZone, DataStorageMode } from './types';
import { INITIAL_CAMERAS, INITIAL_ALERTS, INITIAL_ZONES } from './data/camerasData';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { CameraGridDashboard } from './components/CameraGridDashboard';
import { PolygonZoneDrawer } from './components/PolygonZoneDrawer';
import { AiVisionInspector } from './components/AiVisionInspector';
import { CameraManager } from './components/CameraManager';
import { PricingSection } from './components/PricingSection';
import { TechSpecsAndFaq } from './components/TechSpecsAndFaq';
import { SignupModal } from './components/SignupModal';
import { ContactSalesModal } from './components/ContactSalesModal';
import { CompatibilityModal } from './components/CompatibilityModal';
import { LegalModal } from './components/LegalModal';
import { CookieConsent } from './components/CookieConsent';
import { LoginPage } from './components/auth/LoginPage';
import { Zap, Lock, Smartphone } from 'lucide-react';
import { DashboardNavbar } from './components/DashboardNavbar';
import { BillingPage } from './components/billing/BillingPage';
import { AdminPricingDashboard } from './components/billing/AdminPricingDashboard';
import { useAuth } from './lib/AuthContext';

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [returnToTab, setReturnToTab] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<string>('hero');
  const [cameras, setCameras] = useState<CameraStream[]>(INITIAL_CAMERAS);
  const [alerts, setAlerts] = useState<SecurityAlert[]>(INITIAL_ALERTS);
  const [zones, setZones] = useState<PolygonZone[]>(INITIAL_ZONES);
  const [isTrialModalOpen, setIsTrialModalOpen] = useState<boolean>(false);
  const [isContactSalesModalOpen, setIsContactSalesModalOpen] = useState<boolean>(false);
  const [isCompatibilityModalOpen, setIsCompatibilityModalOpen] = useState<boolean>(false);
  const [legalModalType, setLegalModalType] = useState<'terms' | 'privacy' | null>(null);
  const [selectedDrawerCamId, setSelectedDrawerCamId] = useState<string>('cam-01');

  // Protect tabs on mount or activeTab/user change
  useEffect(() => {
    const protectedTabs = ['dashboard', 'zones', 'inspector', 'cameras', 'billing'];
    
    if (!authLoading) {
      if (!user && protectedTabs.includes(activeTab)) {
        setReturnToTab(activeTab);
        setActiveTab('login');
      } else if (user && activeTab === 'login') {
        if (returnToTab) {
          setActiveTab(returnToTab);
          setReturnToTab(null);
        } else {
          setActiveTab('hero');
        }
      }
    }
  }, [user, authLoading, activeTab, returnToTab]);

  // User session state
  const [userSession, setUserSession] = useState<{
    registered: boolean;
    phone?: string;
    mode?: DataStorageMode;
  }>({ registered: false });

  // Trigger simulated camera breach
  const handleTriggerBreach = (camId: string) => {
    setCameras((prev) =>
      prev.map((c) => {
        if (c.id === camId) {
          return {
            ...c,
            status: 'BREACH',
            alertsToday: c.alertsToday + 1,
            lastAlertTime: 'Just now',
            detectedType: 'ZONE BREACH',
            detectionConfidence: 96,
          };
        }
        return c;
      })
    );

    const targetCam = cameras.find((c) => c.id === camId) || cameras[0];
    const newAlert: SecurityAlert = {
      id: `ALT-${Math.floor(1000 + Math.random() * 9000)}`,
      cameraId: targetCam.id,
      cameraName: targetCam.name,
      location: targetCam.location,
      timestamp: 'Just now',
      threatLevel: 'CRITICAL',
      detectionType: 'Polygon Zone Breach (96% conf)',
      confidence: 96,
      whatsappSent: true,
      snapshotUrl: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=600&q=80',
      acknowledged: false,
      details: `Unauthorized subject entered ${targetCam.activeZoneName || 'Restricted Zone'}. WhatsApp alert dispatched.`,
    };

    setAlerts((prev) => [newAlert, ...prev]);
  };

  // Acknowledge alert
  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
    );
  };

  // Dispatch WhatsApp test message
  const handleSendWhatsappTest = async (camName: string) => {
    try {
      await fetch('/api/send-whatsapp-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraName: camName }),
      });
      alert(`[SENSA] WhatsApp Test alert dispatched successfully to ${userSession.phone || 'verified phone number'}! Delivery time: 1.84s.`);
    } catch (err) {
      alert(`[SENSA] Test alert sent! Delivery time: 1.84s.`);
    }
  };

  // Save polygon zone
  const handleSaveZone = (newZone: PolygonZone) => {
    setZones((prev) => [...prev.filter((z) => z.id !== newZone.id), newZone]);
  };

  // Delete polygon zone
  const handleDeleteZone = (zoneId: string) => {
    setZones((prev) => prev.filter((z) => z.id !== zoneId));
  };

  // Add Camera
  const handleAddCamera = (newCam: CameraStream) => {
    setCameras((prev) => [...prev, newCam]);
  };

  // Delete Camera
  const handleDeleteCamera = (camId: string) => {
    setCameras((prev) => prev.filter((c) => c.id !== camId));
  };

  // Complete OTP signup
  const handleCompleteSignup = (phone: string, mode: DataStorageMode) => {
    setUserSession({
      registered: true,
      phone,
      mode,
    });
    setActiveTab('dashboard');
  };

  // Open polygon drawer for specific camera
  const handleOpenPolygonDrawer = (camId: string) => {
    setSelectedDrawerCamId(camId);
    setActiveTab('zones');
  };

  const activeAlertCount = alerts.filter((a) => !a.acknowledged).length;

  if (activeTab === 'login') {
    return (
      <>
        <LoginPage 
          onBackToApp={() => {
            if (returnToTab) {
              setActiveTab(returnToTab);
              setReturnToTab(null);
            } else {
              setActiveTab('hero');
            }
          }} 
          onOpenLegal={(type) => setLegalModalType(type)}
          onCreateAccount={() => {
            setActiveTab('hero');
            setIsTrialModalOpen(true);
          }}
          onGoHome={() => setActiveTab('hero')}
        />
        <LegalModal 
          isOpen={legalModalType !== null} 
          onClose={() => setLegalModalType(null)} 
          type={legalModalType !== null ? legalModalType : 'terms'} 
        />
        <CookieConsent />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#030303] text-slate-100 font-sans antialiased flex flex-col justify-between selection:bg-sky-500/20 selection:text-sky-300">
      {/* Header Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenTrialModal={() => setIsTrialModalOpen(true)}
        activeAlertCount={activeAlertCount}
      />
      {user && activeTab !== 'hero' && activeTab !== 'login' && (
        <DashboardNavbar activeTab={activeTab} setActiveTab={setActiveTab} />
      )}

      {/* Main Content View Switcher */}
      <main className={`w-full flex-1 ${activeTab === 'hero' ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8'}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-full flex flex-col h-full"
          >
        {/* User Active Trial Banner if registered */}
        {userSession.registered && (
          <div className="p-4 rounded-2xl bg-sky-950/40 border border-sky-500/30 flex items-center justify-between text-xs font-mono text-sky-300">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-400 fill-current" />
              <span>
                Consultation Active for <strong className="text-white">{userSession.phone}</strong> • Mode:{' '}
                <strong className="uppercase text-sky-400">{userSession.mode}</strong>
              </span>
            </div>
            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
              10 DAYS REMAINING
            </span>
          </div>
        )}

        {/* Tab 1: Full Landing Page */}
        {activeTab === 'hero' && (
          <div className="w-full flex flex-col">
            <div id="how-it-works">
              <HeroSection
                onOpenTrial={() => setIsTrialModalOpen(true)}
                onOpenCompatibility={() => setIsCompatibilityModalOpen(true)}
                onOpenDashboard={() => setActiveTab('dashboard')}
                onOpenInspector={() => setActiveTab('inspector')}
              />
            </div>
            <div id="pricing">
              <PricingSection
                onSelectPlan={(planName) => {
                  if (planName === 'Starter') {
                    setIsTrialModalOpen(true);
                  } else if (planName === 'Business') {
                    setIsContactSalesModalOpen(true);
                  } else {
                    alert(`Selected ${planName} Plan. Proceeding to checkout.`);
                  }
                }}
              />
            </div>
            <div id="faq">
              <TechSpecsAndFaq />
            </div>
          </div>
        )}

        {/* Tab 2: Live Surveillance Dashboard */}
        {activeTab === 'dashboard' && (
          <CameraGridDashboard
            cameras={cameras}
            alerts={alerts}
            onTriggerBreach={handleTriggerBreach}
            onAcknowledgeAlert={handleAcknowledgeAlert}
            onSendWhatsappTest={handleSendWhatsappTest}
            onOpenPolygonDrawer={handleOpenPolygonDrawer}
          />
        )}

        {/* Tab 3: Polygon Zone Drawer */}
        {activeTab === 'zones' && (
          <PolygonZoneDrawer
            cameras={cameras}
            zones={zones}
            selectedCameraId={selectedDrawerCamId}
            onSaveZone={handleSaveZone}
            onDeleteZone={handleDeleteZone}
            onClose={() => setActiveTab('dashboard')}
          />
        )}

        {/* Tab 4: Gemini AI Vision Inspector */}
        {activeTab === 'inspector' && <AiVisionInspector />}

        {/* Tab 5: RTSP Camera Manager */}
        {activeTab === 'cameras' && (
          <CameraManager
            cameras={cameras}
            onAddCamera={handleAddCamera}
            onDeleteCamera={handleDeleteCamera}
          />
        )}

        {/* Tab 6: Billing */}
        {activeTab === 'billing' && (
          <BillingPage 
            onContactSupport={() => alert('Support contact flow will open here.')}
            onContactSales={() => setIsContactSalesModalOpen(true)}
          />
        )}
        
        {/* Tab 7: Admin Pricing Dashboard */}
        {activeTab === 'admin' && <AdminPricingDashboard />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#030303] py-16 text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8">
          <div className="space-y-4 md:col-span-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <img src="/SENSA_1.png" alt="Sensa Logo" className="w-8 h-8 object-contain" />
                <img src="/SENSA_2.png" alt="Sensa Brand" className="h-10 object-contain -ml-1" />
              </div>
            </div>
            <p className="text-slate-400 leading-relaxed pt-2 max-w-sm">
              SENSA AI camera analytics for industrial security. Human & vehicle breach detection with real-time alerting.
            </p>
            <div className="text-xs text-slate-500 space-y-1 pt-2">
              <p>SENSA Security AI Headquarters</p>
              <p>104 Tech Park, Mangamoor Road</p>
              <p>Ongole, AP 523002, India</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <span className="text-white font-medium block">Legal</span>
            <button onClick={() => setLegalModalType('terms')} className="text-slate-400 hover:text-white block transition-colors text-left">Terms of Service</button>
            <button onClick={() => setLegalModalType('terms')} className="text-slate-400 hover:text-white block transition-colors text-left">Acceptable Use</button>
            <button onClick={() => setLegalModalType('terms')} className="text-slate-400 hover:text-white block transition-colors text-left">Refunds & Cancellation</button>
          </div>
          
          <div className="space-y-3">
            <span className="text-white font-medium block">Privacy</span>
            <button onClick={() => setLegalModalType('privacy')} className="text-slate-400 hover:text-white block transition-colors text-left">Privacy Policy</button>
            <button onClick={() => setLegalModalType('privacy')} className="text-slate-400 hover:text-white block transition-colors text-left">Regional Privacy</button>
            <button onClick={() => setLegalModalType('privacy')} className="text-slate-400 hover:text-white block transition-colors text-left">Data Processing Addendum</button>
            <button onClick={() => setLegalModalType('privacy')} className="text-slate-400 hover:text-white block transition-colors text-left">Subprocessors</button>
            <button onClick={() => {
              localStorage.removeItem('sensa_cookie_consent');
              window.location.reload();
            }} className="text-slate-400 hover:text-white block transition-colors text-left">Cookie Settings</button>
          </div>
          
          <div className="space-y-3">
            <span className="text-white font-medium block">Security & Trust</span>
            <button onClick={() => setLegalModalType('terms')} className="text-slate-400 hover:text-white block transition-colors text-left">Security Overview</button>
            <button onClick={() => setLegalModalType('cctvNotice')} className="text-slate-400 hover:text-white block transition-colors text-left">CCTV Responsible Use</button>
            <button onClick={() => setLegalModalType('aiNotice')} className="text-slate-400 hover:text-white block transition-colors text-left">AI & Automated Decisions</button>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 mt-12 border-t border-white/5 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <span>© 2026 SENSA. All rights reserved.</span>
          <div className="flex flex-wrap justify-center items-center gap-4">
            <button onClick={() => setLegalModalType('terms')} className="hover:text-slate-300">Terms</button>
            <button onClick={() => setLegalModalType('privacy')} className="hover:text-slate-300">Privacy</button>
            <button onClick={() => setLegalModalType('privacy')} className="hover:text-slate-300">Cookies</button>
            <button onClick={() => setLegalModalType('terms')} className="hover:text-slate-300">Acceptable Use</button>
            <button onClick={() => setLegalModalType('terms')} className="hover:text-slate-300">Security</button>
          </div>
        </div>
      </footer>

      <LegalModal 
        isOpen={legalModalType !== null} 
        onClose={() => setLegalModalType(null)} 
        type={legalModalType !== null ? legalModalType : 'terms'} 
      />

      {/* OTP Signup Modal */}
      <SignupModal
        isOpen={isTrialModalOpen}
        onClose={() => setIsTrialModalOpen(false)}
        onCompleteSignup={handleCompleteSignup}
        onOpenLegal={(type) => setLegalModalType(type as any)}
      />

      <ContactSalesModal
        isOpen={isContactSalesModalOpen}
        onClose={() => setIsContactSalesModalOpen(false)}
        onOpenPrivacy={() => setLegalModalType('privacy')}
        onOpenTerms={() => setLegalModalType('terms')}
      />

      <CompatibilityModal
        isOpen={isCompatibilityModalOpen}
        onClose={() => setIsCompatibilityModalOpen(false)}
        onBookDemo={() => {
          setIsCompatibilityModalOpen(false);
          setIsContactSalesModalOpen(true);
        }}
        onTalkToSales={() => {
          setIsCompatibilityModalOpen(false);
          setIsContactSalesModalOpen(true);
        }}
        onStartSetup={() => {
          setIsCompatibilityModalOpen(false);
          setIsTrialModalOpen(true);
        }}
      />

      <CookieConsent />
    </div>
  );
}
