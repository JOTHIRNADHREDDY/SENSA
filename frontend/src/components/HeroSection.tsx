import { motion } from 'motion/react';
import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface HeroSectionProps {
  onOpenTrial: () => void;
  onOpenCompatibility: () => void;
  onOpenDashboard: () => void;
  onOpenInspector: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onOpenTrial,
  onOpenCompatibility,
  onOpenDashboard,
}) => {
  return (
    <div className="w-full">
      <section className="relative pt-24 pb-20 px-4 sm:px-6 text-center">
        <motion.div 
          initial="hidden" 
          animate="visible" 
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
          }} 
          className="max-w-4xl mx-auto space-y-8"
        >
          
          {/* Live System Pill */}
          <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { type: "spring" } } }} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 text-sm font-medium">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
            </span>
            <span>Turn Your Cameras Into Smarter Security</span>
          </motion.div>

          {/* Headline */}
          <div className="space-y-6">
            <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-white leading-[1.1]">
              Turn Any Camera Into
              <br className="hidden sm:block" /> an AI Security System.
            </h1>
            <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
              Detect intruders in real time. Receive WhatsApp alerts in under 3 seconds. 
              Works with your existing IP cameras. No proprietary hardware needed. Go live quickly.
            </p>
          </div>

          {/* Action Buttons */}
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring" } } }} className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={onOpenTrial}
              className="w-full sm:w-auto bg-[#5fa9f2] hover:bg-[#4d97e0] text-black font-semibold text-lg px-8 py-3.5 rounded-full transition-all flex items-center justify-center gap-2"
            >
              Book Live Demo
              <span className="text-xl">→</span>
            </button>
            <button
              onClick={onOpenCompatibility}
              className="w-full sm:w-auto bg-transparent border border-white/20 text-white hover:bg-white/5 font-semibold text-lg px-8 py-3.5 rounded-full transition-all"
            >
              Check System Compatibility
            </button>
          </motion.div>
          <div className="text-slate-500 text-sm mt-6 mb-2">
            Works with any IP Camera (Hikvision, Dahua, Axis). Runs on standard Windows PCs or NVIDIA edge devices.
          </div>

          {/* Checkmarks */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 pt-8 text-sm text-slate-400 font-medium">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#5fa9f2]" />
              <span>Runs on standard PCs</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#5fa9f2]" />
              <span>Works with existing cameras</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#5fa9f2]" />
              <span>Video stays on your network</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#5fa9f2]" />
              <span>GDPR & DPDP compliant</span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Hero Dashboard Image */}
      <section className="px-4 sm:px-6 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-sky-900/20 bg-[#0b0e14]">
            <img 
              src="/images/security_dashboard_hero_1786586746980.jpg" 
              alt="SENSA Dashboard Interface" 
              className="w-full h-auto object-cover"
              referrerPolicy="no-referrer"
            />
            {/* Glossy overlay effect */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#030303]/80 via-transparent to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-12 border-b border-white/5 bg-[#030303]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <p className="text-sm font-semibold tracking-widest text-slate-500 uppercase">Trusted by facility managers and warehouse directors</p>
          </div>

          
          <div className="mt-8 max-w-3xl mx-auto bg-[#0a0d14] border border-white/10 rounded-2xl p-8 relative">
            <div className="absolute -top-4 -left-4 text-6xl text-[#5fa9f2]/20">"</div>
            <p className="text-lg md:text-xl text-slate-300 italic text-center relative z-10 leading-relaxed">
              "We used to pay guards to stare at monitors. Within the first week of installing SENSA on our existing Hikvision cameras, we caught a perimeter breach at 2 AM that our guards had missed. The WhatsApp alert was instant."
            </p>
            <div className="mt-6 text-center">
              <div className="font-bold text-white">David Miller</div>
              <div className="text-sm text-slate-500">Director of Operations, APEX Logistics</div>
            </div>
          </div>
        </div>
      </section>

      {/* Alternating Feature 1: WhatsApp Alerts */}
      <section className="py-24 px-4 sm:px-6 bg-[#030303]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1 relative">
            <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-[#0b0e14] max-w-sm mx-auto">
              <img 
                src="/images/whatsapp_alert_feature_1786586774560.jpg" 
                alt="WhatsApp Instant Alert" 
                className="w-full h-auto object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
          <div className="order-1 md:order-2 space-y-6">
            <div className="text-sky-400 text-sm font-bold tracking-widest uppercase">Instant Notifications</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">3 second WhatsApp alerts with visual proof.</h2>
            <p className="text-slate-400 text-lg leading-relaxed">
              Don't wait for morning to check the logs. Receive immediate push notifications directly on WhatsApp the millisecond a human or vehicle breaches your perimeter.
            </p>
            <ul className="space-y-4 pt-4">
              <li className="flex items-center gap-3 text-slate-300">
                <CheckCircle2 className="w-5 h-5 text-[#5fa9f2]" />
                <span>Annotated JPEG snapshots included</span>
              </li>
              <li className="flex items-center gap-3 text-slate-300">
                <CheckCircle2 className="w-5 h-5 text-[#5fa9f2]" />
                <span><strong className="text-white">99.8% accuracy.</strong> AI filters out shadows, animals, and weather.</span>
              </li>
              <li className="flex items-center gap-3 text-slate-300">
                <CheckCircle2 className="w-5 h-5 text-[#5fa9f2]" />
                <span>No proprietary app downloads needed</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Alternating Feature 2: Polygon Zones */}
      <section className="py-24 px-4 sm:px-6 bg-[#030303] border-t border-white/5">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <div className="text-sky-400 text-sm font-bold tracking-widest uppercase">Custom Precision</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">Draw detection zones to ignore the noise.</h2>
            <p className="text-slate-400 text-lg leading-relaxed">
              Not every movement is a threat. Use our intuitive polygon drawing tool to mask out busy streets, swaying trees, or neighboring properties. Get alerted only when someone enters the restricted zone.
            </p>
            <ul className="space-y-4 pt-4">
              <li className="flex items-center gap-3 text-slate-300">
                <CheckCircle2 className="w-5 h-5 text-[#5fa9f2]" />
                <span>Infinite custom polygon shapes</span>
              </li>
              <li className="flex items-center gap-3 text-slate-300">
                <CheckCircle2 className="w-5 h-5 text-[#5fa9f2]" />
                <span>Zero false alarms from irrelevant areas</span>
              </li>
              <li className="flex items-center gap-3 text-slate-300">
                <CheckCircle2 className="w-5 h-5 text-[#5fa9f2]" />
                <span>Update zones instantly via the dashboard</span>
              </li>
            </ul>
          </div>
          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-sky-900/20 bg-[#0b0e14]">
              <img 
                src="/images/polygon_zone_feature_1786586790074.jpg" 
                alt="Draw Custom Polygon Zones" 
                className="w-full h-auto object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Architecture / Hardware Section */}
      <section className="py-24 px-4 sm:px-6 bg-[#0a0d14] border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="text-sky-400 text-sm font-bold tracking-widest uppercase">Simple Architecture</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">How it connects to your site</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              No need to rip and replace. SENSA plugs directly into your existing camera network.
            </p>
          </div>
          
          <div className="relative max-w-4xl mx-auto">
            {/* Connecting lines */}
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#5fa9f2]/50 to-transparent -translate-y-1/2 z-0 hidden md:block"></div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
              {/* Step 1 */}
              <div className="bg-[#030303] border border-white/10 p-6 rounded-2xl flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-white/5 rounded-xl flex items-center justify-center mb-4">
                  <span className="text-3xl">🎥</span>
                </div>
                <h3 className="text-white font-bold mb-2">Existing IP Cameras</h3>
                <p className="text-sm text-slate-400">Provide RTSP streams from any standard NVR or IP camera (Hikvision, Dahua, CP Plus, Axis).</p>
              </div>
              
              {/* Step 2 */}
              <div className="bg-[#1A6AFB]/10 border border-[#1A6AFB]/30 p-6 rounded-2xl flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-[#1A6AFB]/10 to-transparent pointer-events-none"></div>
                <div className="w-16 h-16 bg-[#1A6AFB]/20 text-[#5fa9f2] rounded-xl flex items-center justify-center mb-4">
                  <span className="text-3xl">🖥️</span>
                </div>
                <h3 className="text-white font-bold mb-2">SENSA Local Edge</h3>
                <p className="text-sm text-slate-400">Use your own Windows PC, or use our provided SENSA Edge Appliance connected to your local network.</p>
              </div>
              
              {/* Step 3 */}
              <div className="bg-[#030303] border border-white/10 p-6 rounded-2xl flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-[#25D366]/10 text-[#25D366] rounded-xl flex items-center justify-center mb-4">
                  <span className="text-3xl">💬</span>
                </div>
                <h3 className="text-white font-bold mb-2">Instant Alerts</h3>
                <p className="text-sm text-slate-400">The edge device instantly sends annotated images via WhatsApp to your security team the second a breach occurs.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid Section */}
      <section className="py-24 px-4 sm:px-6 bg-[#030303]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="text-[#5fa9f2] text-xs font-bold tracking-[0.2em] uppercase">Precision Engineered</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">Security that actually works</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Advanced AI for enterprise-grade threat detection — without enterprise hardware costs.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {/* Feature 1 */}
            <div className="bg-[#0f111a] border border-white/5 p-8 rounded-2xl hover:border-white/10 transition-colors">
              <span className="text-3xl block mb-4">⚡</span>
              <h3 className="text-lg font-bold text-white mb-2">Real-time Detection</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Sub-second YOLOv8n inference on persons and vehicles, running entirely on your own hardware at 5 FPS.
              </p>
            </div>
            {/* Feature 2 */}
            <div className="bg-[#0f111a] border border-white/5 p-8 rounded-2xl hover:border-white/10 transition-colors">
              <span className="text-3xl block mb-4">📐</span>
              <h3 className="text-lg font-bold text-white mb-2">Polygon Zones</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Draw precise alert zones on your camera feed. Alerts only fire when something enters a zone you defined.
              </p>
            </div>
            {/* Feature 3 */}
            <div className="bg-[#0f111a] border border-white/5 p-8 rounded-2xl hover:border-white/10 transition-colors">
              <span className="text-3xl block mb-4">🌙</span>
              <h3 className="text-lg font-bold text-white mb-2">Night Detection</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Optimized for low-light and infrared footage. Catches activity your eyes would miss at 3 AM.
              </p>
            </div>
            {/* Feature 4 */}
            <div className="bg-[#0f111a] border border-white/5 p-8 rounded-2xl hover:border-white/10 transition-colors">
              <span className="text-3xl block mb-4">🎯</span>
              <h3 className="text-lg font-bold text-white mb-2">False Alarm Filtering</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Five-layer filter: confidence threshold, min bounding box, 1.5s dwell time, 60s dedup, and time-window schedules. Only real events alert.
              </p>
            </div>
            {/* Feature 5 */}
            <div className="bg-[#0f111a] border border-white/5 p-8 rounded-2xl hover:border-white/10 transition-colors">
              <span className="text-3xl block mb-4">🎥</span>
              <h3 className="text-lg font-bold text-white mb-2">Multi-Camera Support</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Manage any number of RTSP streams from one dashboard. Hikvision, CP Plus, Dahua, Axis, and 200+ brands.
              </p>
            </div>
            {/* Feature 6 */}
            <div className="bg-[#0f111a] border border-white/5 p-8 rounded-2xl hover:border-white/10 transition-colors">
              <span className="text-3xl block mb-4">📱</span>
              <h3 className="text-lg font-bold text-white mb-2">WhatsApp Alerts</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Intrusion detected → WhatsApp with snapshot in 2.8s. Also supports email and webhooks. Works offline via queue.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-24 px-4 sm:px-6 bg-[#030303] border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="text-sky-400 text-sm font-bold tracking-widest uppercase">The Process</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">Path to protection</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            <div className="hidden md:block absolute top-12 left-8 right-8 h-[1px] bg-white/10 z-0"></div>
            
            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-[#030303] border border-white/10 rounded-full flex items-center justify-center text-xl font-bold text-white">1</div>
              <h4 className="text-lg font-bold text-white">Book Demo</h4>
              <p className="text-sm text-slate-400">Schedule a walkthrough with our security engineers.</p>
            </div>
            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-[#030303] border border-white/10 rounded-full flex items-center justify-center text-xl font-bold text-white">2</div>
              <h4 className="text-lg font-bold text-white">Site Audit</h4>
              <p className="text-sm text-slate-400">We assess your camera layout and local hardware needs.</p>
            </div>
            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-[#030303] border border-white/10 rounded-full flex items-center justify-center text-xl font-bold text-white">3</div>
              <h4 className="text-lg font-bold text-white">Deploy Edge</h4>
              <p className="text-sm text-slate-400">We ship the SENSA Edge Appliance or install remotely on your PC.</p>
            </div>
            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-[#030303] border border-white/10 rounded-full flex items-center justify-center text-xl font-bold text-white">4</div>
              <h4 className="text-lg font-bold text-white">Go Live</h4>
              <p className="text-sm text-slate-400">Receive instant WhatsApp alerts for perimeter breaches.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
