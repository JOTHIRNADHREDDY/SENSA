const fs = require('fs');

const content = `
import React, { useState, useEffect } from 'react';
import { X, Check, Search, ChevronRight, CheckCircle2, AlertTriangle, Info, ArrowRight, ShieldCheck, Cpu, Wifi, Video, RefreshCw, XCircle } from 'lucide-react';
import { COUNTRIES } from '../data/countries';

interface CompatibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookDemo: () => void;
  onTalkToSales: () => void;
  onStartSetup: () => void;
}

type Step = 1 | 2 | 3 | 4;

const CAMERA_BRANDS = [
  'Hikvision', 'Dahua', 'Axis', 'Bosch', 'Hanwha', 'CP Plus', 'Reolink',
  'Amcrest', 'Uniview', 'Tiandy', 'Vivotek', 'Panasonic', 'Sony', 'Other', 'Not Sure'
];

export const CompatibilityModal: React.FC<CompatibilityModalProps> = ({
  isOpen,
  onClose,
  onBookDemo,
  onTalkToSales,
  onStartSetup
}) => {
  const [step, setStep] = useState<Step>(1);
  
  // Step 1: Cameras
  const [cameraType, setCameraType] = useState<string[]>([]);
  const [cameraBrand, setCameraBrand] = useState<string>('');
  const [cameraBrandSearch, setCameraBrandSearch] = useState('');
  const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);
  const [cameraProtocol, setCameraProtocol] = useState<string>('');
  const [cameraCount, setCameraCount] = useState<string>('');
  
  // Step 2: Compute
  const [hardwareType, setHardwareType] = useState<string>('');
  const [processor, setProcessor] = useState<string>('');
  const [ram, setRam] = useState<string>('');
  const [gpu, setGpu] = useState<string>('');
  const [nvidiaDevice, setNvidiaDevice] = useState<string>('');
  
  // Step 3: Network
  const [networkType, setNetworkType] = useState<string>('');
  const [agentReach, setAgentReach] = useState<string>('');
  const [internetConnection, setInternetConnection] = useState<string>('');
  const [hasNvr, setHasNvr] = useState<string>('');
  const [nvrExposesStream, setNvrExposesStream] = useState<string>('');
  
  // Advanced Test
  const [rtspUrl, setRtspUrl] = useState('');
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'fail' | 'unable'>('idle');

  // Step 4: Results (Lead Capture)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [countryIso2, setCountryIso2] = useState('US');
  const [mobile, setMobile] = useState('');

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setStep(1);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleCameraType = (type: string) => {
    if (cameraType.includes(type)) {
      setCameraType(cameraType.filter(t => t !== type));
    } else {
      setCameraType([...cameraType, type]);
    }
  };

  const filteredBrands = CAMERA_BRANDS.filter(b => b.toLowerCase().includes(cameraBrandSearch.toLowerCase()));

  // Logic evaluation
  const evaluateCameras = () => {
    let status = 'unknown';
    if (cameraType.includes('IP Camera') || cameraType.includes('NVR-connected IP Cameras') || cameraType.includes('ONVIF Cameras') || cameraType.includes('RTSP Cameras')) {
      if (cameraProtocol === 'ONVIF' || cameraProtocol === 'RTSP' || cameraProtocol === 'Both') {
        status = 'pass';
      }
    }
    return status;
  };

  const evaluateCompute = () => {
    if (hardwareType === 'Windows PC') {
      if (ram === '8 GB' || gpu === 'No GPU') return 'warning';
      if (ram === 'Not Sure' || processor === 'Not Sure' || gpu === 'Not Sure') return 'unknown';
      return 'pass';
    }
    if (hardwareType === 'NVIDIA Edge Device') {
      if (nvidiaDevice === 'Not Sure') return 'unknown';
      return 'pass';
    }
    if (hardwareType === 'Dedicated Server' || hardwareType === 'Linux PC' || hardwareType === 'Cloud VM') return 'pass';
    if (hardwareType === 'I don\\'t have hardware yet') return 'warning';
    return 'unknown';
  };

  const evaluateNetwork = () => {
    if (agentReach === 'No') return 'fail';
    if (agentReach === 'Not Sure') return 'unknown';
    if (hasNvr === 'Yes' && nvrExposesStream === 'No') return 'fail';
    if (hasNvr === 'Yes' && nvrExposesStream === 'Not Sure') return 'unknown';
    return 'pass';
  };

  const overallStatus = () => {
    const c = evaluateCameras();
    const h = evaluateCompute();
    const n = evaluateNetwork();

    if (c === 'fail' || n === 'fail') return 'UPGRADE RECOMMENDED';
    if (c === 'unknown' || h === 'unknown' || n === 'unknown') return 'NEEDS REVIEW';
    if (h === 'warning') return 'LIKELY READY';
    return 'READY';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'READY': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
      case 'LIKELY READY': return 'text-sky-400 bg-sky-400/10 border-sky-400/30';
      case 'NEEDS REVIEW': return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
      case 'UPGRADE RECOMMENDED': return 'text-rose-400 bg-rose-400/10 border-rose-400/30';
      default: return 'text-slate-400 bg-slate-800 border-slate-700';
    }
  };

  const handleTestRtsp = () => {
    setTestResult('testing');
    setTimeout(() => {
      setTestResult('unable');
    }, 1500);
  };

  // Reusable Option Component
  const SelectOption = ({ label, selected, onClick, description }: { label: string, selected: boolean, onClick: () => void, description?: string }) => (
    <button
      onClick={onClick}
      className={\`w-full text-left p-4 rounded-xl border transition-all duration-200 \${
        selected 
          ? 'bg-sky-500/10 border-sky-500/50 shadow-[0_0_15px_rgba(14,165,233,0.1)]' 
          : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
      }\`}
    >
      <div className="flex items-start gap-3">
        <div className={\`mt-1 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 \${
          selected ? 'border-sky-500 bg-sky-500/20' : 'border-slate-600'
        }\`}>
          {selected && <div className="w-2.5 h-2.5 rounded-full bg-sky-400" />}
        </div>
        <div>
          <div className={\`font-medium \${selected ? 'text-sky-100' : 'text-slate-300'}\`}>{label}</div>
          {description && <div className="text-sm text-slate-500 mt-1">{description}</div>}
        </div>
      </div>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#050505] w-full h-full md:h-auto md:max-h-[95vh] md:max-w-5xl md:rounded-2xl border-0 md:border border-white/10 shadow-2xl flex flex-col overflow-hidden relative">
        
        {/* Subtle Blue Glow Background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-64 bg-sky-500/10 blur-[100px] pointer-events-none"></div>

        {/* Header */}
        <div className="flex items-center justify-between p-4 md:px-8 md:py-6 border-b border-white/10 sticky top-0 bg-[#050505]/95 backdrop-blur z-20">
          <div>
            <div className="text-xs font-bold tracking-[0.2em] text-sky-400 mb-1">VASAI COMPATIBILITY CHECK</div>
            <h2 className="text-xl md:text-2xl font-bold text-white">Is Your System Ready for VASAI?</h2>
            <p className="text-sm text-slate-400 hidden md:block mt-1">Check your cameras, hardware, and network in less than 2 minutes.</p>
            <div className="text-[10px] text-slate-500 font-mono mt-2 hidden md:block">CAMERA · COMPUTE · NETWORK · DEPLOYMENT</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="bg-slate-900/50 border-b border-white/5">
          <div className="flex items-center text-xs font-mono font-medium overflow-x-auto no-scrollbar">
            {[1, 2, 3, 4].map((s) => (
              <React.Fragment key={s}>
                <div className={\`flex items-center gap-2 px-4 md:px-8 py-3 \${step === s ? 'text-sky-400 bg-sky-500/5' : step > s ? 'text-emerald-400' : 'text-slate-500'}\`}>
                  {step > s ? <Check size={14} /> : <span>0{s}</span>}
                  <span>{s === 1 ? 'CAMERAS' : s === 2 ? 'COMPUTE' : s === 3 ? 'NETWORK' : 'RESULT'}</span>
                </div>
                {s < 4 && <div className="text-slate-700">→</div>}
              </React.Fragment>
            ))}
          </div>
          <div className="h-0.5 w-full bg-slate-800">
            <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: \`\${(step / 4) * 100}%\` }}></div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10">
          
          {/* STEP 1: CAMERAS */}
          {step === 1 && (
            <div className="max-w-2xl mx-auto space-y-10 pb-20 md:pb-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2 text-center md:text-left">
                <h3 className="text-2xl font-bold text-white">Let's check your cameras.</h3>
                <p className="text-slate-400">VASAI is designed to work with common IP camera and RTSP/ONVIF environments.</p>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-semibold text-slate-300">What type of camera system do you use?</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {['IP Camera', 'NVR-connected IP Cameras', 'ONVIF Cameras', 'RTSP Cameras', 'Mixed Camera Environment', 'I\\'m Not Sure'].map(type => (
                    <button
                      key={type}
                      onClick={() => toggleCameraType(type)}
                      className={\`w-full text-left p-4 rounded-xl border transition-all duration-200 \${
                        cameraType.includes(type)
                          ? 'bg-sky-500/10 border-sky-500/50 text-sky-100 shadow-[0_0_15px_rgba(14,165,233,0.1)]'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }\`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={\`w-5 h-5 rounded border flex items-center justify-center \${cameraType.includes(type) ? 'border-sky-500 bg-sky-500' : 'border-slate-600'}\`}>
                          {cameraType.includes(type) && <Check size={14} className="text-white" />}
                        </div>
                        {type}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 relative">
                <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider text-xs">DO YOU KNOW YOUR CAMERA BRAND?</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search size={18} className="text-slate-500" />
                  </div>
                  <input
                    type="text"
                    value={cameraBrand}
                    onChange={(e) => {
                      setCameraBrand(e.target.value);
                      setCameraBrandSearch(e.target.value);
                      setIsBrandDropdownOpen(true);
                    }}
                    onFocus={() => setIsBrandDropdownOpen(true)}
                    placeholder="Search brand (e.g., Hikvision)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:border-sky-500 transition-colors"
                  />
                  {isBrandDropdownOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                      {filteredBrands.length > 0 ? (
                        filteredBrands.map(brand => (
                          <button
                            key={brand}
                            className="w-full text-left px-4 py-3 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                            onClick={() => {
                              setCameraBrand(brand);
                              setIsBrandDropdownOpen(false);
                            }}
                          >
                            {brand}
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-slate-500 text-sm">No exact match found. Compatibility may depend on RTSP / ONVIF support.</div>
                      )}
                    </div>
                  )}
                </div>
                {cameraBrand && !['Hikvision', 'Dahua', 'Axis', 'Bosch', 'Hanwha', 'CP Plus'].includes(cameraBrand) && cameraBrand !== 'Not Sure' && (
                  <div className="flex gap-2 text-sm text-slate-400 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                    <Info size={16} className="text-sky-400 shrink-0 mt-0.5" />
                    <span>Compatibility may depend on RTSP / ONVIF support.</span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <label className="text-sm font-semibold text-slate-300">Which camera protocol is available?</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SelectOption label="ONVIF" description="Recommended for compatible camera discovery and configuration." selected={cameraProtocol === 'ONVIF'} onClick={() => setCameraProtocol('ONVIF')} />
                  <SelectOption label="RTSP" description="VASAI can use an RTSP stream when the required stream configuration is supported." selected={cameraProtocol === 'RTSP'} onClick={() => setCameraProtocol('RTSP')} />
                  <SelectOption label="Both" description="ONVIF + RTSP" selected={cameraProtocol === 'Both'} onClick={() => setCameraProtocol('Both')} />
                  <SelectOption label="Not Sure" description="We'll help you determine this." selected={cameraProtocol === 'Not Sure'} onClick={() => setCameraProtocol('Not Sure')} />
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-semibold text-slate-300">How many cameras do you want to connect?</label>
                <div className="flex flex-wrap gap-3">
                  {['1', '2–4', '5–16', '17–50', '51–250', '250+', 'Not sure'].map(c => (
                    <button
                      key={c}
                      onClick={() => setCameraCount(c)}
                      className={\`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 border \${
                        cameraCount === c
                          ? 'bg-sky-500/10 border-sky-500/50 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.1)]'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }\`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {cameraType.length > 0 && cameraProtocol && (
                <div className={\`p-5 rounded-xl border \${evaluateCameras() === 'pass' ? 'bg-sky-500/5 border-sky-500/20' : 'bg-amber-500/5 border-amber-500/20'}\`}>
                  {evaluateCameras() === 'pass' ? (
                    <>
                      <div className="flex items-center gap-2 text-sky-400 font-bold mb-3">
                        <CheckCircle2 size={20} />
                        <h3>LIKELY COMPATIBLE</h3>
                      </div>
                      <div className="space-y-2 text-sm text-slate-300">
                        <div className="flex items-center gap-2"><Check size={16} className="text-emerald-500" /> IP camera environment</div>
                        <div className="flex items-center gap-2"><Check size={16} className="text-emerald-500" /> RTSP or ONVIF available</div>
                        <div className="flex items-center gap-2"><Check size={16} className="text-emerald-500" /> Supported stream configuration</div>
                      </div>
                      <p className="text-xs text-slate-500 mt-4">Final compatibility depends on the exact camera/NVR model and stream configuration.</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-amber-400 font-bold mb-2">
                        <AlertTriangle size={20} />
                        <h3>Compatibility Cannot Yet Be Determined</h3>
                      </div>
                      <p className="text-sm text-slate-400">We need your exact camera model or RTSP/ONVIF information to confirm compatibility.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: COMPUTE */}
          {step === 2 && (
            <div className="max-w-2xl mx-auto space-y-10 pb-20 md:pb-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2 text-center md:text-left">
                <h3 className="text-2xl font-bold text-white">Where will VASAI run?</h3>
                <p className="text-slate-400">VASAI can be deployed on customer-managed computers or supported edge hardware, depending on the workload.</p>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-semibold text-slate-300">What hardware do you have?</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {['Windows PC', 'Linux PC', 'NVIDIA Edge Device', 'Dedicated Server', 'Cloud VM', 'I\\'t have hardware yet', 'Not Sure'].map(type => (
                    <SelectOption key={type} label={type} selected={hardwareType === type} onClick={() => setHardwareType(type)} />
                  ))}
                </div>
              </div>

              {hardwareType === 'Windows PC' && (
                <div className="space-y-8 animate-in fade-in duration-300 bg-slate-900/30 p-6 rounded-2xl border border-white/5">
                  <div className="space-y-4">
                    <label className="text-sm font-semibold text-slate-300">Processor</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {['Intel Core i5 or equivalent', 'Intel Core i7 or equivalent', 'Intel Core i9 or equivalent', 'AMD Ryzen 5', 'AMD Ryzen 7', 'AMD Ryzen 9', 'Other', 'Not Sure'].map(p => (
                        <SelectOption key={p} label={p} selected={processor === p} onClick={() => setProcessor(p)} />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-sm font-semibold text-slate-300">RAM</label>
                    <div className="flex flex-wrap gap-3">
                      {['8 GB', '16 GB', '32 GB', '64 GB+', 'Not Sure'].map(r => (
                        <button
                          key={r}
                          onClick={() => setRam(r)}
                          className={\`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 border \${
                            ram === r
                              ? 'bg-sky-500/10 border-sky-500/50 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.1)]'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          }\`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-sm font-semibold text-slate-300">GPU</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {['NVIDIA GPU', 'AMD GPU', 'Integrated graphics', 'No GPU', 'Not Sure'].map(g => (
                        <SelectOption key={g} label={g} selected={gpu === g} onClick={() => setGpu(g)} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {hardwareType === 'NVIDIA Edge Device' && (
                <div className="space-y-6 animate-in fade-in duration-300 bg-slate-900/30 p-6 rounded-2xl border border-white/5">
                  <div className="space-y-4">
                    <label className="text-sm font-semibold text-slate-300">NVIDIA Hardware</label>
                    <select
                      value={nvidiaDevice}
                      onChange={(e) => setNvidiaDevice(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors appearance-none custom-select"
                    >
                      <option value="" disabled className="text-slate-600">Select device...</option>
                      {['Jetson Orin Nano', 'Jetson Orin NX', 'Jetson AGX Orin', 'RTX GPU PC', 'Other NVIDIA device', 'Not Sure'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 text-sm text-slate-400 bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <Info size={16} className="text-sky-400 shrink-0 mt-0.5" />
                    <span>GPU acceleration availability depends on the VASAI deployment package and model configuration.</span>
                  </div>
                </div>
              )}

              {hardwareType && (
                <div className={\`p-5 rounded-xl border \${
                  evaluateCompute() === 'pass' ? 'bg-emerald-500/5 border-emerald-500/20' : 
                  evaluateCompute() === 'warning' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-800/50 border-slate-700'
                }\`}>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-bold tracking-widest uppercase text-slate-500">COMPUTE STATUS</h3>
                    {evaluateCompute() === 'pass' && (
                      <div>
                        <div className="text-emerald-400 font-bold mb-1">GOOD FIT</div>
                        <p className="text-sm text-slate-300">Your hardware appears suitable for the selected camera workload.</p>
                      </div>
                    )}
                    {evaluateCompute() === 'warning' && (
                      <div>
                        <div className="text-amber-400 font-bold mb-1">MAY REQUIRE OPTIMIZATION</div>
                        <p className="text-sm text-slate-300">Your hardware may work with reduced resolution, FPS, camera count, or optimized AI inference.</p>
                      </div>
                    )}
                    {evaluateCompute() === 'unknown' && (
                      <div>
                        <div className="text-slate-300 font-bold mb-1">INSUFFICIENT INFORMATION</div>
                        <p className="text-sm text-slate-400">We need additional hardware information before determining compatibility.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: NETWORK */}
          {step === 3 && (
            <div className="max-w-2xl mx-auto space-y-10 pb-20 md:pb-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2 text-center md:text-left">
                <h3 className="text-2xl font-bold text-white">Let's check your network.</h3>
                <p className="text-slate-400">Reliable camera connectivity is essential for stable AI detection.</p>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-semibold text-slate-300">How are your cameras connected?</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {['Same Local Network', 'Separate VLAN', 'Remote Site', 'VPN', 'Cloud-connected cameras', 'Not Sure'].map(type => (
                    <SelectOption key={type} label={type} selected={networkType === type} onClick={() => setNetworkType(type)} />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-semibold text-slate-300">Can the VASAI Agent reach the camera streams?</label>
                <div className="flex gap-3">
                  {['Yes', 'No', 'Not Sure'].map(r => (
                    <button
                      key={r}
                      onClick={() => setAgentReach(r)}
                      className={\`flex-1 py-3 rounded-xl border transition-all duration-200 font-medium \${
                        agentReach === r
                          ? 'bg-sky-500/10 border-sky-500/50 text-sky-100 shadow-[0_0_15px_rgba(14,165,233,0.1)]'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }\`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-semibold text-slate-300">Internet connection available?</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {['Always connected', 'Intermittent', 'Local network only', 'Not sure'].map(c => (
                    <SelectOption key={c} label={c} selected={internetConnection === c} onClick={() => setInternetConnection(c)} />
                  ))}
                </div>
                <div className="flex gap-2 text-sm text-slate-400 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                  <Info size={16} className="text-sky-400 shrink-0 mt-0.5" />
                  <span>Internet connectivity requirements depend on your selected VASAI deployment and alerting configuration.</span>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-semibold text-slate-300">Do your cameras connect through an NVR?</label>
                <div className="flex gap-3">
                  {['Yes', 'No', 'Not Sure'].map(r => (
                    <button
                      key={r}
                      onClick={() => setHasNvr(r)}
                      className={\`flex-1 py-3 rounded-xl border transition-all duration-200 font-medium \${
                        hasNvr === r
                          ? 'bg-sky-500/10 border-sky-500/50 text-sky-100'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }\`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {hasNvr === 'Yes' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 p-6 bg-slate-900/30 rounded-2xl border border-white/5">
                  <label className="text-sm font-semibold text-slate-300">Does the NVR expose RTSP or ONVIF streams?</label>
                  <div className="flex gap-3">
                    {['Yes', 'No', 'Not Sure'].map(r => (
                      <button
                        key={r}
                        onClick={() => setNvrExposesStream(r)}
                        className={\`flex-1 py-3 rounded-xl border transition-all duration-200 font-medium \${
                          nvrExposesStream === r
                            ? 'bg-sky-500/10 border-sky-500/50 text-sky-100'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }\`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="text-sm text-slate-400 mt-3 text-center">VASAI compatibility depends on whether the NVR provides a supported stream interface.</div>
                </div>
              )}

              {/* Advanced Check */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden">
                <details className="group">
                  <summary className="flex items-center justify-between p-4 bg-slate-900/50 cursor-pointer list-none font-medium text-slate-300 hover:text-white transition-colors">
                    Advanced camera test
                    <ChevronRight size={18} className="text-slate-500 group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="p-6 bg-slate-950/50 border-t border-slate-800 space-y-4">
                    <label className="text-xs font-mono text-slate-400">RTSP URL</label>
                    <div className="flex flex-col md:flex-row gap-3">
                      <input
                        type="text"
                        value={rtspUrl}
                        onChange={(e) => setRtspUrl(e.target.value)}
                        placeholder="rtsp://..."
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-sky-500 transition-colors font-mono text-sm"
                      />
                      <button
                        onClick={handleTestRtsp}
                        disabled={!rtspUrl || testResult === 'testing'}
                        className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {testResult === 'testing' ? <RefreshCw size={16} className="animate-spin" /> : 'Test Stream'}
                      </button>
                    </div>
                    {testResult === 'unable' && (
                      <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-400/10 p-3 rounded-lg border border-amber-400/20">
                        <XCircle size={16} />
                        UNABLE TO TEST (Local test proxy not available in this preview)
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </div>
          )}

          {/* STEP 4: RESULTS */}
          {step === 4 && (
            <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-10">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-white">Your VASAI Compatibility Result</h2>
                <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">CHECK ID: AUTO-GENERATED • ENVIRONMENT ANALYSIS</div>
              </div>

              <div className={\`p-6 md:p-8 rounded-2xl border bg-opacity-10 \${getStatusColor(overallStatus())} flex flex-col md:flex-row items-center md:items-start gap-6\`}>
                <div className="shrink-0 p-4 rounded-full bg-white/10 mt-1">
                  {overallStatus() === 'READY' || overallStatus() === 'LIKELY READY' ? (
                    <ShieldCheck size={48} className="opacity-90" />
                  ) : overallStatus() === 'NEEDS REVIEW' ? (
                    <AlertTriangle size={48} className="opacity-90" />
                  ) : (
                    <Info size={48} className="opacity-90" />
                  )}
                </div>
                <div className="text-center md:text-left space-y-3">
                  <h3 className="text-2xl font-bold">{overallStatus()}</h3>
                  <p className="text-white/80 leading-relaxed">
                    {overallStatus() === 'READY' && 'Your environment appears ready for a VASAI deployment.'}
                    {overallStatus() === 'LIKELY READY' && 'Your environment appears suitable, but a few technical details should be verified.'}
                    {overallStatus() === 'NEEDS REVIEW' && 'Your system may be compatible, but additional information is required.'}
                    {overallStatus() === 'UPGRADE RECOMMENDED' && 'Your current environment may require hardware or configuration changes.'}
                  </p>
                  
                  {(overallStatus() === 'READY' || overallStatus() === 'LIKELY READY') && (
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-2 text-sm text-white/90 pt-2 font-medium">
                      <span className="flex items-center gap-1.5"><Check size={16} className="opacity-75" /> Camera environment</span>
                      <span className="flex items-center gap-1.5"><Check size={16} className="opacity-75" /> Compute environment</span>
                      <span className="flex items-center gap-1.5"><Check size={16} className="opacity-75" /> Network environment</span>
                    </div>
                  )}

                  <div className="pt-4 flex flex-wrap gap-3 justify-center md:justify-start">
                    {overallStatus() === 'READY' && (
                      <>
                        <button onClick={onBookDemo} className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-full transition-colors flex items-center gap-2">
                          Book a Live Demo <ArrowRight size={16} />
                        </button>
                        <button onClick={onStartSetup} className="px-6 py-2.5 bg-transparent border border-emerald-500/50 text-emerald-100 hover:bg-emerald-500/10 rounded-full transition-colors font-medium">
                          Start Setup Planning
                        </button>
                      </>
                    )}
                    {overallStatus() === 'LIKELY READY' && (
                      <button onClick={onTalkToSales} className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-black font-bold rounded-full transition-colors flex items-center gap-2">
                        Book Technical Review <ArrowRight size={16} />
                      </button>
                    )}
                    {overallStatus() === 'NEEDS REVIEW' && (
                      <button onClick={onTalkToSales} className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-full transition-colors flex items-center gap-2">
                        Talk to VASAI <ArrowRight size={16} />
                      </button>
                    )}
                    {overallStatus() === 'UPGRADE RECOMMENDED' && (
                      <button onClick={onTalkToSales} className="px-6 py-2.5 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-full transition-colors flex items-center gap-2">
                        View Recommended Setup <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Technical Summary Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Cameras */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 text-sky-400 font-bold text-sm tracking-wider">
                    <Video size={18} /> CAMERAS
                  </div>
                  <div className="space-y-2 text-sm">
                    {(cameraProtocol === 'RTSP' || cameraProtocol === 'Both') ? (
                      <div className="flex gap-2 text-emerald-400"><Check size={16} className="shrink-0" /> <span className="text-slate-300">RTSP available</span></div>
                    ) : (
                      <div className="flex gap-2 text-amber-400"><AlertTriangle size={16} className="shrink-0" /> <span className="text-slate-300">RTSP status unknown</span></div>
                    )}
                    {(cameraType.includes('IP Camera') || cameraType.includes('NVR-connected IP Cameras')) ? (
                      <div className="flex gap-2 text-emerald-400"><Check size={16} className="shrink-0" /> <span className="text-slate-300">IP camera environment</span></div>
                    ) : (
                      <div className="flex gap-2 text-amber-400"><AlertTriangle size={16} className="shrink-0" /> <span className="text-slate-300">IP status unknown</span></div>
                    )}
                    <div className="flex gap-2 text-amber-400"><AlertTriangle size={16} className="shrink-0" /> <span className="text-slate-300">Exact camera model not verified</span></div>
                  </div>
                </div>

                {/* Compute */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 text-sky-400 font-bold text-sm tracking-wider">
                    <Cpu size={18} /> COMPUTE
                  </div>
                  <div className="space-y-2 text-sm">
                    {hardwareType ? (
                      <div className="flex gap-2 text-emerald-400"><Check size={16} className="shrink-0" /> <span className="text-slate-300">{hardwareType}</span></div>
                    ) : (
                      <div className="flex gap-2 text-rose-400"><XCircle size={16} className="shrink-0" /> <span className="text-slate-300">Hardware not specified</span></div>
                    )}
                    {ram ? (
                      <div className="flex gap-2 text-emerald-400"><Check size={16} className="shrink-0" /> <span className="text-slate-300">{ram} RAM</span></div>
                    ) : null}
                    {!gpu || gpu === 'Not Sure' ? (
                      <div className="flex gap-2 text-amber-400"><AlertTriangle size={16} className="shrink-0" /> <span className="text-slate-300">GPU information incomplete</span></div>
                    ) : (
                      <div className="flex gap-2 text-emerald-400"><Check size={16} className="shrink-0" /> <span className="text-slate-300">{gpu}</span></div>
                    )}
                  </div>
                </div>

                {/* Network */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 text-sky-400 font-bold text-sm tracking-wider">
                    <Wifi size={18} /> NETWORK
                  </div>
                  <div className="space-y-2 text-sm">
                    {networkType ? (
                      <div className="flex gap-2 text-emerald-400"><Check size={16} className="shrink-0" /> <span className="text-slate-300">{networkType}</span></div>
                    ) : (
                      <div className="flex gap-2 text-rose-400"><XCircle size={16} className="shrink-0" /> <span className="text-slate-300">Network unspecified</span></div>
                    )}
                    {agentReach === 'Yes' ? (
                      <div className="flex gap-2 text-emerald-400"><Check size={16} className="shrink-0" /> <span className="text-slate-300">Camera reachable</span></div>
                    ) : (
                      <div className="flex gap-2 text-amber-400"><AlertTriangle size={16} className="shrink-0" /> <span className="text-slate-300">Reachability unverified</span></div>
                    )}
                    {internetConnection === 'Not sure' || !internetConnection ? (
                      <div className="flex gap-2 text-amber-400"><AlertTriangle size={16} className="shrink-0" /> <span className="text-slate-300">Internet config not verified</span></div>
                    ) : (
                      <div className="flex gap-2 text-sky-400"><Info size={16} className="shrink-0" /> <span className="text-slate-300">{internetConnection}</span></div>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommended Setup */}
              <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Recommended VASAI Setup</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-950 p-4 rounded-xl border border-white/5">
                    <div className="text-xs text-slate-500 font-mono mb-1">TIER</div>
                    <div className="font-bold text-sky-100">Standard Site</div>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-white/5">
                    <div className="text-xs text-slate-500 font-mono mb-1">CAPACITY</div>
                    <div className="font-bold text-sky-100">Up to {cameraCount || '16'} streams</div>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-white/5">
                    <div className="text-xs text-slate-500 font-mono mb-1">COMPUTE</div>
                    <div className="font-bold text-sky-100">Recommended edge</div>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-white/5">
                    <div className="text-xs text-slate-500 font-mono mb-1">ARCHITECTURE</div>
                    <div className="font-bold text-sky-100">Local / Hybrid</div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-4 text-center">Based on the information provided, your environment appears suitable. Final compatibility may depend on the exact camera, NVR, stream configuration, workload, and deployment package.</p>
              </div>

              {/* Lead Capture */}
              <div className="bg-[#0f111a] border border-white/10 rounded-2xl p-6 md:p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 blur-[80px] pointer-events-none"></div>
                <div className="relative z-10 max-w-2xl">
                  <h3 className="text-xl font-bold text-white mb-2">Want a confirmed compatibility review?</h3>
                  <p className="text-slate-400 text-sm mb-6">Send your configuration to the VASAI team and we'll review your environment.</p>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input type="text" placeholder="Name" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors" />
                      <input type="email" placeholder="Work Email" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors" />
                    </div>
                    <input type="text" placeholder="Company" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors" />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <select
                        value={countryIso2}
                        onChange={(e) => setCountryIso2(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors appearance-none"
                      >
                        {COUNTRIES.map(c => (
                          <option key={c.iso2} value={c.iso2}>{c.name}</option>
                        ))}
                      </select>
                      <input type="tel" placeholder="Mobile Number" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors" />
                    </div>

                    <button className="w-full py-4 bg-sky-500 hover:bg-sky-400 text-black font-bold rounded-xl transition-colors mt-2 flex items-center justify-center gap-2">
                      Request Technical Review <ArrowRight size={18} />
                    </button>
                    <p className="text-xs text-slate-500 text-center mt-3">
                      Your compatibility information is used to evaluate your VASAI deployment requirements. See our Privacy Policy for information about how submitted information is processed.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="text-center">
                <button onClick={() => setStep(1)} className="text-slate-400 hover:text-white text-sm underline underline-offset-4 transition-colors">
                  Check Again
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Footer Actions (Steps 1-3) */}
        {step < 4 && (
          <div className="border-t border-white/10 bg-[#050505] p-4 md:px-8 md:py-6 shrink-0 flex justify-between items-center sticky bottom-0 z-20">
            {step > 1 ? (
              <button 
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="px-6 py-3 text-slate-400 hover:text-white font-medium transition-colors"
              >
                Back
              </button>
            ) : <div></div>}
            
            <button 
              onClick={() => setStep((s) => (s + 1) as Step)}
              className="px-8 py-3 bg-white hover:bg-slate-200 text-black rounded-full font-bold transition-colors flex items-center gap-2 w-full md:w-auto justify-center"
            >
              {step === 3 ? 'View Results' : 'Continue'} <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
`

fs.writeFileSync('src/components/CompatibilityModal.tsx', content.trim());
console.log('CompatibilityModal.tsx generated successfully.');
