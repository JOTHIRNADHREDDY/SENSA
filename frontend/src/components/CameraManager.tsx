import React, { useState } from 'react';
import { CameraStream } from '../types';
import { CAMERA_BRAND_TEMPLATES } from '../data/camerasData';
import { Sliders, Plus, Search, CheckCircle2, RefreshCw, Video, Link, Shield, Trash2, Cpu } from 'lucide-react';

interface CameraManagerProps {
  cameras: CameraStream[];
  onAddCamera: (cam: CameraStream) => void;
  onDeleteCamera: (camId: string) => void;
}

export const CameraManager: React.FC<CameraManagerProps> = ({
  cameras,
  onAddCamera,
  onDeleteCamera,
}) => {
  const [scanning, setScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<any[]>([]);
  const [selectedBrand, setSelectedBrand] = useState(CAMERA_BRAND_TEMPLATES[0].brand);
  const [camName, setCamName] = useState('New Warehouse Camera');
  const [camLocation, setCamLocation] = useState('Building C Perimeter');
  const [ipAddress, setIpAddress] = useState('192.168.1.110');
  const [rtspUrl, setRtspUrl] = useState(CAMERA_BRAND_TEMPLATES[0].format);

  const handleBrandChange = (brandName: string) => {
    setSelectedBrand(brandName);
    const tmpl = CAMERA_BRAND_TEMPLATES.find((b) => b.brand === brandName);
    if (tmpl) {
      setRtspUrl(tmpl.format.replace('[ip]', ipAddress));
    }
  };

  const handleScanOnvif = () => {
    setScanning(true);
    setDiscoveredDevices([]);

    setTimeout(() => {
      setDiscoveredDevices([
        { ip: '192.168.1.107', brand: 'Hikvision DS-2CD2143G0-I', port: 554, status: 'Ready' },
        { ip: '192.168.1.108', brand: 'CP Plus CP-UNC-TE31L2', port: 554, status: 'Ready' },
        { ip: '192.168.1.109', brand: 'Dahua IPC-HFW2431T-ZS', port: 554, status: 'Ready' },
      ]);
      setScanning(false);
    }, 1800);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newCam: CameraStream = {
      id: `cam-${Date.now()}`,
      code: `CAM-0${cameras.length + 1}`,
      name: camName,
      location: camLocation,
      brand: selectedBrand,
      rtspUrl: rtspUrl,
      status: 'ONLINE',
      fps: 5,
      confidenceThreshold: 0.85,
      alertsToday: 0,
      detectedType: 'CLEAR',
      detectionConfidence: 99,
      snapshotBg: 'radial-gradient(ellipse at 50% 50%, #0d1a0d, #06090d 80%)',
    };

    onAddCamera(newCam);
    alert(`Camera "${camName}" connected successfully via RTSP!`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">RTSP Camera Streams & ONVIF Discovery</h2>
            <p className="text-xs text-slate-400 font-mono">
              Connect existing IP cameras, DVRs & NVRs. Works with 200+ CCTV camera brands.
            </p>
          </div>
        </div>

        <button
          onClick={handleScanOnvif}
          disabled={scanning}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 text-xs font-mono transition-all cursor-pointer disabled:opacity-50"
        >
          {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          <span>{scanning ? 'Scanning Local Subnet...' : 'Scan ONVIF Devices'}</span>
        </button>
      </div>

      {/* Discovered ONVIF Devices Banner */}
      {discoveredDevices.length > 0 && (
        <div className="p-4 rounded-2xl bg-sky-950/30 border border-sky-500/40 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-mono text-sky-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Discovered {discoveredDevices.length} ONVIF Cameras on Local Subnet
            </span>
            <span className="text-[10px] font-mono text-slate-400">192.168.1.0/24</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {discoveredDevices.map((dev, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-2">
                <div className="flex items-center justify-between text-white font-bold">
                  <span>{dev.brand}</span>
                  <span className="text-emerald-400 text-[10px]">{dev.status}</span>
                </div>
                <p className="text-[10px] text-slate-400">IP: {dev.ip} • Port: {dev.port}</p>
                <button
                  onClick={() => {
                    setCamName(dev.brand);
                    setIpAddress(dev.ip);
                    setRtspUrl(`rtsp://admin:pass@${dev.ip}:554/stream1`);
                  }}
                  className="w-full py-1 rounded bg-sky-500/20 hover:bg-sky-500/40 text-sky-300 border border-sky-500/30 text-[10px] font-bold"
                >
                  Import Feed Settings
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connected Cameras List (Spans 2 cols) */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider">
            Connected IP Camera Streams ({cameras.length})
          </h3>

          <div className="space-y-3">
            {cameras.map((cam) => (
              <div
                key={cam.id}
                className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sky-400 font-mono text-xs font-bold">
                    {cam.code}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">{cam.name}</h4>
                      <span className="px-2 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-mono">
                        {cam.brand}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono truncate max-w-xs">{cam.rtspUrl}</p>
                    <span className="text-[10px] text-slate-500 font-mono block">Location: {cam.location}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 border-slate-800/80 pt-2 sm:pt-0">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono">
                    {cam.fps} FPS
                  </span>

                  <button
                    onClick={() => onDeleteCamera(cam.id)}
                    className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                    title="Remove Camera"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add Camera Form Wizard */}
        <div className="space-y-4">
          <form onSubmit={handleAddSubmit} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <Plus className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-bold text-white">Add Camera RTSP Feed</h3>
            </div>

            {/* Brand Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block">Camera Brand / Protocol</label>
              <select
                value={selectedBrand}
                onChange={(e) => handleBrandChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3.5 py-2 text-xs font-mono outline-none focus:border-sky-500"
              >
                {CAMERA_BRAND_TEMPLATES.map((b) => (
                  <option key={b.brand} value={b.brand}>{b.brand}</option>
                ))}
              </select>
            </div>

            {/* Camera Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block">Camera Name</label>
              <input
                type="text"
                required
                value={camName}
                onChange={(e) => setCamName(e.target.value)}
                placeholder="e.g. Loading Bay 5"
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3.5 py-2 text-xs font-mono outline-none focus:border-sky-500"
              />
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block">Facility Zone</label>
              <input
                type="text"
                required
                value={camLocation}
                onChange={(e) => setCamLocation(e.target.value)}
                placeholder="e.g. North Gate Boundary"
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3.5 py-2 text-xs font-mono outline-none focus:border-sky-500"
              />
            </div>

            {/* RTSP Stream URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block">RTSP Stream URL</label>
              <input
                type="text"
                required
                value={rtspUrl}
                onChange={(e) => setRtspUrl(e.target.value)}
                placeholder="rtsp://admin:pass@192.168.1.101:554/..."
                className="w-full bg-slate-950 border border-slate-800 text-sky-400 rounded-xl px-3.5 py-2 text-xs font-mono outline-none focus:border-sky-500"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-lg shadow-sky-500/20"
            >
              <Video className="w-4 h-4" />
              <span>Connect Camera Stream</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
