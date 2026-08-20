import React, { useState } from 'react';
import { ChevronDown, CheckCircle2 } from 'lucide-react';

const FAQS = [
  {
    q: 'What kind of cameras do I need?',
    a: 'SENSA works with almost any existing IP camera that supports RTSP (Real Time Streaming Protocol). This includes brands like Hikvision, Dahua, Axis, and most generic security cameras. No proprietary hardware is required.',
  },
  {
    q: 'Does it work without internet?',
    a: 'The AI detection runs entirely on your local network. Video feeds are processed locally, so it works continuously even if the internet drops. However, you do need an active internet connection to receive WhatsApp alerts.',
  },
  {
    q: 'How fast are the WhatsApp alerts?',
    a: 'Our edge-processing detection engine triggers WhatsApp alerts with snapshot attachments in under 2.8 seconds from the exact moment an intrusion or zone breach occurs.',
  },
  {
    q: 'Is my video stored in the cloud?',
    a: 'No. Raw video streams NEVER leave your local network. Only small JPEG alert snapshots at the moment of detection are sent for alert purposes. Zero continuous video leaves your premises.',
  },
  {
    q: 'What hardware runs the local agent?',
    a: 'Any standard Windows 10/11 PC or Linux machine with a dual-core CPU and 4GB RAM. No dedicated GPU is needed. A quad-core CPU with 8GB RAM handles up to 16 RTSP streams smoothly.',
  },
  {
    q: 'What happens after the live pilot?',
    a: 'After 10 days, your account is automatically paused. Your custom polygon zones and camera settings are saved. You can upgrade to any paid tier to resume active monitoring instantly.',
  },
];

export const TechSpecsAndFaq: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div className="w-full">
      {/* Ready CTA Section */}
      <section className="py-24 px-4 sm:px-6 bg-[#030303] text-center border-b border-white/5">
        <div className="max-w-4xl mx-auto space-y-8">
          <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">Ready to turn your cameras into AI security?</h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button className="w-full sm:w-auto bg-[#5fa9f2] hover:bg-[#4d97e0] text-black font-semibold text-lg px-8 py-3.5 rounded-full transition-all">
              Book Live Demo
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-sm text-slate-400 font-medium">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#5fa9f2]" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#5fa9f2]" />
              <span>Setup in 15 minutes</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 px-4 sm:px-6 bg-[#030303]">
        <div className="max-w-3xl mx-auto space-y-12">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white">Frequently asked questions</h2>
          </div>
          
          <div className="divide-y divide-white/10 border-y border-white/10">
            {FAQS.map((faq, idx) => {
              const isOpen = openIdx === idx;
              return (
                <div key={idx} className="py-6">
                  <button
                    onClick={() => setOpenIdx(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between text-left text-white font-medium hover:text-[#5fa9f2] transition-colors"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180 text-[#5fa9f2]' : 'text-slate-500'}`} />
                  </button>
                  {isOpen && (
                    <div className="pt-4 text-slate-400 leading-relaxed text-sm">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Enterprise Contact Banner */}
      <section className="py-24 px-4 sm:px-6 bg-[#030303] border-t border-white/5">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h3 className="text-3xl font-bold text-white">Need a live demo or custom quote?</h3>
            <p className="text-slate-400 max-w-2xl mx-auto">
              For solar farms, warehouses, or industrial plants with 20+ camera feeds — we provide personal onboarding and customized agent setups.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <a
              href="mailto:sales@sensa.io?subject=SENSA%20Enterprise%20Demo"
              className="px-8 py-3 rounded-full bg-[#5fa9f2] text-black font-semibold hover:bg-[#4d97e0] transition-colors"
            >
              BOOK A DEMO &rarr;
            </a>
            <a
              href="mailto:support@sensa.io"
              className="px-8 py-3 rounded-full bg-white/5 text-white font-semibold hover:bg-white/10 transition-colors border border-white/10"
            >
              EMAIL US
            </a>
          </div>
        </div>
      </section>

      {/* Technical Specifications Section */}
      <section className="py-24 px-4 sm:px-6 bg-[#030303] border-t border-white/5">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-white">Specifications</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-8 rounded-2xl bg-[#0b0e14] border border-white/5 space-y-4">
              <div className="text-[#5fa9f2] font-semibold text-sm uppercase tracking-widest">AI Engine</div>
              <ul className="text-sm text-slate-400 space-y-2">
                <li>• Model: YOLOv8 Inference</li>
                <li>• Rate: 5 FPS per stream</li>
                <li>• Hardware: CPU-only execution</li>
                <li>• Dwell Filter: 0.5s – 5.0s</li>
              </ul>
            </div>
            
            <div className="p-8 rounded-2xl bg-[#0b0e14] border border-white/5 space-y-4">
              <div className="text-[#5fa9f2] font-semibold text-sm uppercase tracking-widest">Supported Cameras</div>
              <ul className="text-sm text-slate-400 space-y-2">
                <li>• Protocols: RTSP, ONVIF</li>
                <li>• Formats: H.264, H.265</li>
                <li>• Resolution: 720p to 4K</li>
                <li>• Brands: 200+ CCTV models</li>
              </ul>
            </div>
            
            <div className="p-8 rounded-2xl bg-[#0b0e14] border border-white/5 space-y-4">
              <div className="text-[#5fa9f2] font-semibold text-sm uppercase tracking-widest">Agent Hardware</div>
              <ul className="text-sm text-slate-400 space-y-2">
                <li>• OS: Win 10/11, Linux, Docker</li>
                <li>• RAM: 4GB min, 8GB req</li>
                <li>• CPU: Dual-core min</li>
                <li>• Storage: Local SQLite</li>
              </ul>
            </div>
            
            <div className="p-8 rounded-2xl bg-[#0b0e14] border border-white/5 space-y-4">
              <div className="text-[#5fa9f2] font-semibold text-sm uppercase tracking-widest">Alert Dispatch</div>
              <ul className="text-sm text-slate-400 space-y-2">
                <li>• WhatsApp: &lt; 2.8s delivery</li>
                <li>• Email: HTML + Snapshot</li>
                <li>• Webhook: HTTP POST JSON</li>
                <li>• Offline: Local queueing</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
};
