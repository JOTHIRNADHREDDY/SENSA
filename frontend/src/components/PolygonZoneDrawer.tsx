import React, { useState, useEffect } from 'react';
import { CameraStream, PolygonZone, Point } from '../types';
import { Maximize2, Trash2, CheckCircle2, RotateCcw, Sliders, Shield, AlertCircle, X, HelpCircle, Home } from 'lucide-react';

interface PolygonZoneDrawerProps {
  cameras: CameraStream[];
  zones: PolygonZone[];
  selectedCameraId?: string;
  onSaveZone: (zone: PolygonZone) => void;
  onDeleteZone: (zoneId: string) => void;
  onClose?: () => void;
}

export const PolygonZoneDrawer: React.FC<PolygonZoneDrawerProps> = ({
  cameras,
  zones,
  selectedCameraId = cameras[0]?.id || 'cam-01',
  onSaveZone,
  onDeleteZone,
  onClose,
}) => {
  const [activeCamId, setActiveCamId] = useState<string>(selectedCameraId);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([
    { x: 25, y: 20 },
    { x: 75, y: 20 },
    { x: 75, y: 80 },
    { x: 25, y: 80 },
  ]);
  const [zoneName, setZoneName] = useState<string>('Restricted Gate Polygon');
  const [dwellTime, setDwellTime] = useState<number>(1.5);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [showTour, setShowTour] = useState<boolean>(false);
  const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('sensa_polygon_tour_seen');
    if (!hasSeenTour) {
      setShowTour(true);
    }
  }, []);

  const handleCloseTour = () => {
    localStorage.setItem('sensa_polygon_tour_seen', 'true');
    setShowTour(false);
  };

  const activeCam = cameras.find((c) => c.id === activeCamId) || cameras[0];
  const camZones = zones.filter((z) => z.cameraId === activeCamId);

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // If we're interacting with a specific point via drag, ignore the background click
    if ((e.target as Element).tagName === 'circle' || draggingPointIndex !== null) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);

    if (currentPoints.length >= 8) {
      alert('Maximum 8 points allowed for standard polygon zones');
      return;
    }
    setCurrentPoints([...currentPoints, { x, y }]);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGCircleElement>, index: number) => {
    e.stopPropagation();
    setDraggingPointIndex(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingPointIndex === null) return;

    const rect = e.currentTarget.getBoundingClientRect();
    let x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    let y = Math.round(((e.clientY - rect.top) / rect.height) * 100);

    // Clamp coordinates to canvas boundaries
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    setCurrentPoints(prev => {
      const newPoints = [...prev];
      newPoints[draggingPointIndex] = { x, y };
      return newPoints;
    });
  };

  const handlePointerUp = () => {
    setDraggingPointIndex(null);
  };

  const handleResetZone = () => {
    const existingZone = zones.find(z => z.cameraId === activeCamId);
    if (existingZone) {
      setCurrentPoints(existingZone.points);
      setZoneName(existingZone.name);
      setDwellTime(existingZone.dwellTimeSeconds || 1.5);
    } else {
      setCurrentPoints([]);
    }
  };

  const handleSave = () => {
    if (currentPoints.length < 3) {
      alert('Please click at least 3 points on the camera stream to define a closed polygon zone.');
      return;
    }

    const newZone: PolygonZone = {
      id: `zone-${Date.now()}`,
      cameraId: activeCamId,
      name: zoneName || `${activeCam.name} Zone`,
      points: currentPoints,
      color: '#f43f5e',
      active: true,
      dwellTimeSeconds: dwellTime,
    };

    onSaveZone(newZone);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  // Convert points array into SVG points string
  const svgPointsString = currentPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="space-y-6 relative">
      {/* Onboarding Tour Overlay */}
      {showTour && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0b0e14] border border-white/10 p-6 sm:p-8 rounded-2xl max-w-lg w-full shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            {/* Background accent */}
            <div className="absolute -top-32 -right-32 w-64 h-64 bg-sky-500/10 blur-3xl rounded-full"></div>
            
            <div className="flex items-start justify-between mb-6 relative z-10">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-sky-500/10 rounded-xl text-sky-400">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">How to Draw Zones</h3>
                  <p className="text-sm text-slate-400 font-mono mt-1">First-time user guide</p>
                </div>
              </div>
              <button onClick={handleCloseTour} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mb-8 relative z-10">
              <div className="flex gap-3 text-sm">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs">1</div>
                  <div className="w-0.5 h-full bg-slate-800/50"></div>
                </div>
                <div className="pb-4">
                  <span className="font-bold text-white block">Reset the canvas</span>
                  <span className="text-slate-400">Click the reset icon below the settings to clear the default polygon.</span>
                </div>
              </div>
              
              <div className="flex gap-3 text-sm">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs">2</div>
                  <div className="w-0.5 h-full bg-slate-800/50"></div>
                </div>
                <div className="pb-4">
                  <span className="font-bold text-white block">Draw your shape</span>
                  <span className="text-slate-400">Click anywhere on the camera feed to place points. The points will connect automatically.</span>
                </div>
              </div>

              <div className="flex gap-3 text-sm">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs">3</div>
                </div>
                <div>
                  <span className="font-bold text-white block">Save to activate</span>
                  <span className="text-slate-400">Adjust the dwell time and click 'Save Polygon Zone' to activate AI detection for that area.</span>
                </div>
              </div>
            </div>

            <button 
              onClick={handleCloseTour}
              className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-3 rounded-xl transition-colors relative z-10"
            >
              Get Started
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors mr-1"
            title="Back to Dashboard"
          >
            <Home className="w-5 h-5" />
          </button>
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Maximize2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Interactive Polygon Zone Drawer</h2>
            <p className="text-xs text-slate-400 font-mono">
              Click anywhere on the camera feed to draw precise detection alert boundaries.
            </p>
          </div>
        </div>

        {/* Camera Selector Dropdown */}
        <select
          value={activeCamId}
          onChange={(e) => setActiveCamId(e.target.value)}
          className="bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-2 text-xs font-mono outline-none cursor-pointer hover:border-sky-500 transition-colors"
        >
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Camera Stream SVG Canvas (Spans 2 cols) */}
        <div className="lg:col-span-2 space-y-3">
          <div
            className="relative w-full aspect-video rounded-2xl border border-slate-800 overflow-hidden shadow-2xl select-none"
            style={{ background: activeCam.snapshotBg }}
          >
            {/* Background Camera Label */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-slate-950/80 text-sky-400 border border-slate-800 text-xs font-mono font-bold">
                {activeCam.code} • {activeCam.name}
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-mono border border-emerald-500/30">
                ONVIF Stream Active
              </span>
            </div>

            {/* Clickable SVG Overlay for drawing polygon */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              onClick={handleCanvasClick}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className={`absolute inset-0 w-full h-full z-20 ${draggingPointIndex !== null ? 'cursor-grabbing' : 'cursor-crosshair'}`}
            >
              {/* Render Existing Saved Zones */}
              {camZones.map((z) => (
                <polygon
                  key={z.id}
                  points={z.points.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill={z.color}
                  fillOpacity="0.15"
                  stroke={z.color}
                  strokeWidth="0.8"
                  strokeDasharray="2,2"
                />
              ))}

              {/* Render Active Drawn Polygon */}
              {currentPoints.length > 0 && (
                <polygon
                  points={svgPointsString}
                  fill="#0ea5e9"
                  fillOpacity="0.25"
                  stroke="#0ea5e9"
                  strokeWidth="1.2"
                />
              )}

              {/* Render Drawn Points handles */}
              {currentPoints.map((pt, idx) => (
                <g key={idx}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="2.5"
                    fill="#38bdf8"
                    stroke="#ffffff"
                    strokeWidth="0.5"
                    className="cursor-grab hover:scale-150 transition-transform origin-center"
                    style={{ transformOrigin: `${pt.x}px ${pt.y}px` }}
                    onPointerDown={(e) => handlePointerDown(e, idx)}
                  />
                  <text
                    x={pt.x + 2}
                    y={pt.y - 2}
                    fill="#ffffff"
                    fontSize="3"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    P{idx + 1}
                  </text>
                </g>
              ))}
            </svg>

            {/* Canvas Hint */}
            <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between text-[11px] font-mono text-slate-300 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
              <span>Points added: {currentPoints.length} / 8</span>
              <span className="text-sky-400">Click on feed to place polygon vertex</span>
            </div>
          </div>

          {/* Point Coordinates Quick View */}
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono text-slate-300">
            <span className="text-slate-400 font-bold">Zone Coordinates:</span>
            {currentPoints.map((p, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-slate-950 text-sky-400 border border-slate-800">
                P{i + 1}: ({p.x}%, {p.y}%)
              </span>
            ))}
            {currentPoints.length === 0 && <span className="text-slate-500">No points added. Click on canvas above.</span>}
          </div>
        </div>

        {/* Zone Configuration Controls */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <Sliders className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-bold text-white">Zone Parameters</h3>
            </div>

            {/* Zone Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block">Zone Label</label>
              <input
                type="text"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="e.g. Restricted Gate Polygon"
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3.5 py-2 text-xs font-mono outline-none focus:border-sky-500 transition-colors"
              />
            </div>

            {/* Dwell Time Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <label className="text-slate-400 uppercase tracking-wider">Intrusion Dwell Filter</label>
                <span className="text-sky-400 font-bold">{dwellTime}s</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="5.0"
                step="0.5"
                value={dwellTime}
                onChange={(e) => setDwellTime(parseFloat(e.target.value))}
                className="w-full accent-sky-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-400 leading-normal">
                An object must remain inside this polygon for at least {dwellTime} seconds before firing WhatsApp alert.
              </p>
            </div>

            {/* Controls Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-lg shadow-sky-500/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Polygon Zone</span>
              </button>

              <button
                onClick={handleResetZone}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                title="Revert to saved zone"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Zone</span>
              </button>
            </div>

            {savedSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Polygon Zone updated and synchronized with camera AI engine!</span>
              </div>
            )}
          </div>

          {/* Active Saved Zones List */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider">
              Saved Zones for {activeCam.code} ({camZones.length})
            </h4>

            {camZones.length === 0 ? (
              <p className="text-xs text-slate-500 font-mono italic">No custom zones saved for this camera yet.</p>
            ) : (
              camZones.map((z) => (
                <div
                  key={z.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono"
                >
                  <div>
                    <span className="font-bold text-white block">{z.name}</span>
                    <span className="text-[10px] text-slate-400">{z.points.length} points • Dwell: {z.dwellTimeSeconds}s</span>
                  </div>
                  <button
                    onClick={() => onDeleteZone(z.id)}
                    className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
