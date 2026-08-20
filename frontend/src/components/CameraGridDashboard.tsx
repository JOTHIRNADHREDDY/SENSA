import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CameraStream, SecurityAlert } from '../types';
import { 
  Video, Bell, ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw, 
  Volume2, VolumeX, Eye, Send, Sliders, Smartphone, Lock, Maximize2, X
} from 'lucide-react';

const playNotificationSound = () => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;
  
  const ctx = new AudioContextClass();
  
  const playBeep = (time: number, freq: number, type: OscillatorType) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.15, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(time);
    osc.stop(time + 0.35);
  };

  // Play a quick subtle two-tone alert
  playBeep(ctx.currentTime, 659.25, 'sine'); // E5
  playBeep(ctx.currentTime + 0.12, 880.00, 'sine'); // A5
};

interface CameraGridDashboardProps {
  cameras: CameraStream[];
  alerts: SecurityAlert[];
  onTriggerBreach: (camId: string) => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onSendWhatsappTest: (camName: string) => void;
  onOpenPolygonDrawer: (camId: string) => void;
}

export const CameraGridDashboard: React.FC<CameraGridDashboardProps> = ({
  cameras,
  alerts,
  onTriggerBreach,
  onAcknowledgeAlert,
  onSendWhatsappTest,
  onOpenPolygonDrawer,
}) => {
  const [selectedCam, setSelectedCam] = useState<CameraStream | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [confidenceFilter, setConfidenceFilter] = useState(0.8);
  const [liveTime, setLiveTime] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'grid' | 'alerts' | 'controls'>('grid');
  const [simulating, setSimulating] = useState(false);
  const prevAlertsLengthRef = useRef(alerts.length);

  useEffect(() => {
    if (alerts.length > prevAlertsLengthRef.current && soundEnabled) {
      playNotificationSound();
    }
    prevAlertsLengthRef.current = alerts.length;
  }, [alerts, soundEnabled]);

  useEffect(() => {
    const updateTime = () => {
      setLiveTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const breachAlerts = alerts.filter(a => !a.acknowledged);

  return (
    <div className="space-y-6">
      {/* Top Controls & Metrics Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Live Surveillance Grid</h2>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                6 FEEDS ONLINE
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">RTSP Encrypted local stream</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Sound Alarm Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono transition-all cursor-pointer ${
              soundEnabled 
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse' 
                : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-rose-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            <span>{soundEnabled ? 'SIREN READY' : 'SIREN MUTED'}</span>
          </button>

          {/* Simulate Breach Button */}
          <button
            onClick={() => {
              setSimulating(true);
              const randomCam = cameras[Math.floor(Math.random() * cameras.length)];
              onTriggerBreach(randomCam.id);
              setTimeout(() => setSimulating(false), 600);
            }}
            disabled={simulating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>{simulating ? 'Simulating Breach...' : '⚡ Simulate Breach'}</span>
          </button>

          {/* Clock display */}
          <div className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-sky-400">
            <span>SYS CLOCK: {liveTime || '12:00:00'}</span>
          </div>
        </div>
      </div>

      {/* Main Grid Views & Alert Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 3x2 CCTV Cameras Grid (Spans 3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cameras.map((cam, idx) => {
              const isBreach = cam.status === 'BREACH';
              const isWarning = cam.status === 'WARNING';

              return (
                <motion.div
                  key={cam.id}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.05, ease: 'easeOut' }}
                  className={`relative rounded-2xl overflow-hidden border aspect-video flex flex-col justify-between p-3 transition-all cursor-pointer group ${
                    isBreach
                      ? 'border-rose-500/80 bg-rose-950/20 shadow-lg shadow-rose-950/50'
                      : isWarning
                      ? 'border-amber-500/80 bg-amber-950/20'
                      : 'border-slate-800/90 bg-slate-950/90 hover:border-sky-500/50'
                  }`}
                  style={{ background: cam.snapshotBg }}
                  onClick={() => setSelectedCam(cam)}
                >
                  {/* Top Status Header */}
                  <div className="relative z-10 flex items-center justify-between text-[11px] font-mono opacity-80 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/80 text-sky-400 border border-slate-800">
                      <span>{cam.code}</span>
                      <span className="text-slate-500">•</span>
                      <span className="truncate max-w-[100px] text-slate-300">{cam.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {isBreach && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500 text-white font-bold text-[10px] animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-white" /> REC BREACH
                        </span>
                      )}
                      {!isBreach && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/90 text-emerald-400 border border-slate-800 text-[10px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> {cam.fps} FPS
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Simulated Bounding Box Overlay */}
                  <div className="relative z-10 my-auto flex items-center justify-center">
                    {isBreach && (
                      <div className="relative border-2 border-rose-500 bg-rose-500/10 rounded p-4 text-center animate-pulse w-3/4">
                        <div className="absolute -top-3 left-2 px-1.5 py-0.5 bg-rose-600 text-white font-mono text-[9px] font-bold uppercase rounded">
                          PERSON • {cam.detectionConfidence}% CONF
                        </div>
                        <p className="text-[11px] font-mono font-bold text-rose-300">
                          {cam.activeZoneName || 'RESTRICTED POLYGON BREACH'}
                        </p>
                      </div>
                    )}
                    {isWarning && (
                      <div className="relative border-2 border-amber-500 bg-amber-500/10 rounded p-3 text-center w-3/4">
                        <div className="absolute -top-3 left-2 px-1.5 py-0.5 bg-amber-600 text-white font-mono text-[9px] font-bold uppercase rounded">
                          VEHICLE • {cam.detectionConfidence}% CONF
                        </div>
                        <p className="text-[10px] font-mono font-semibold text-amber-300">
                          CHECKPOINT DWELL DETECTED
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Bottom Feed Footer Bar */}
                  <div className="relative z-10 flex items-center justify-between text-[10px] font-mono opacity-80 group-hover:opacity-100 transition-opacity">
                    <span className="text-slate-400 truncate max-w-[120px]">{cam.location}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenPolygonDrawer(cam.id);
                      }}
                      className="px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/40 text-sky-300 border border-sky-500/30 transition-all"
                    >
                      Draw Zone
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Right Sidebar: Real-time Alert Dispatch & WhatsApp simulator */}
        <div className="h-full">
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col h-full min-h-[500px]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-rose-400 animate-bounce" />
                <h3 className="text-sm font-bold text-white">Live Alert Stream</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono font-bold">
                {alerts.length} Total
              </span>
            </div>

            {/* Alert List */}
            <div className="space-y-2.5 flex-1 overflow-y-auto pr-1 min-h-0 py-2 custom-scrollbar">
              {alerts.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs font-mono">
                  No security alerts recorded.
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-xl border text-xs space-y-2 transition-all ${
                      !alert.acknowledged
                        ? 'bg-rose-950/30 border-rose-500/60'
                        : 'bg-slate-950 border-slate-800 opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {alert.cameraName}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{alert.timestamp}</span>
                    </div>

                    <p className="text-slate-300 text-[11px] leading-relaxed">{alert.details}</p>

                    {/* WhatsApp Status Pill */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] font-mono">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Smartphone className="w-3 h-3" />
                        WhatsApp Alert Sent (1.8s)
                      </span>

                      {!alert.acknowledged ? (
                        <button
                          onClick={() => onAcknowledgeAlert(alert.id)}
                          className="px-2 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all cursor-pointer"
                        >
                          Acknowledge
                        </button>
                      ) : (
                        <span className="text-slate-500 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Resolved
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Manual Test Alert Button */}
            <button
              onClick={() => onSendWhatsappTest('Gate Entry Main')}
              className="w-full shrink-0 mt-auto flex items-center justify-center gap-2 p-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-mono transition-all cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Test WhatsApp Dispatch to Phone</span>
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Camera Modal */}
      {selectedCam && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl space-y-4 p-6 relative">
            <button
              onClick={() => setSelectedCam(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                <Video className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{selectedCam.name}</h3>
                <p className="text-xs font-mono text-slate-400">{selectedCam.code} • {selectedCam.brand} • {selectedCam.location}</p>
              </div>
            </div>

            <div 
              className="w-full aspect-video rounded-xl border border-slate-800 flex items-center justify-center relative overflow-hidden"
              style={{ background: selectedCam.snapshotBg }}
            >
              <div className="absolute top-4 left-4 px-3 py-1 bg-slate-950/80 rounded border border-slate-800 text-xs font-mono text-sky-400">
                RTSP URL: {selectedCam.rtspUrl}
              </div>

              <div className="text-center space-y-2">
                <p className="text-sm font-mono text-slate-300">Live Stream Feed Active</p>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-mono">
                  Detection Engine: YOLOv8n (5 FPS)
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  const camId = selectedCam.id;
                  setSelectedCam(null);
                  onOpenPolygonDrawer(camId);
                }}
                className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs transition-all cursor-pointer"
              >
                Configure Polygon Intrusion Zone
              </button>

              <button
                onClick={() => setSelectedCam(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-mono cursor-pointer"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
