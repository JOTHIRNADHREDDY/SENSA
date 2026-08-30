import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, HelpCircle, ArrowRight, X } from 'lucide-react';
import { formatPrice, CurrencyCode } from '../data/pricingCatalog';
import { CountrySelect } from './CountrySelect';

interface PricingSectionProps {
  onSelectPlan: (plan: string) => void;
}

const REGIONS = [
  { code: 'US', name: 'United States' },
  { code: 'IN', name: 'India' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Europe (Germany)' },
];

export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectPlan }) => {
  const [country, setCountry] = useState('US');
  const [isAnnual, setIsAnnual] = useState(false);
  const [pricingData, setPricingData] = useState<Record<string, any>>({});
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [isLoading, setIsLoading] = useState(true);
  
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [recCameras, setRecCameras] = useState<number>(10);
  
  useEffect(() => {
    setIsLoading(true);
    fetch((import.meta.env.VITE_API_BASE_URL || '') + `/api/v1/billing/price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setPricingData(data.prices);
          // Get currency from the first available plan
          const firstPlan = Object.values(data.prices)[0] as any;
          if (firstPlan && firstPlan.currency) {
            setCurrency(firstPlan.currency);
          }
        }
      })
      .catch(err => console.error("Failed to load prices", err))
      .finally(() => setIsLoading(false));
  }, [country]);

  const handleRecommendation = () => {
    if (recCameras <= 2) return 'Pilot';
    if (recCameras <= 16) return 'Base License';
    if (recCameras <= 32) return 'Professional';
    if (recCameras <= 64) return 'Business';
    return 'Enterprise';
  };

  const getPrice = (planId: string) => {
    if (planId === 'enterprise') return null;
    const planData = pricingData[planId];
    if (!planData) return 0;
    return isAnnual ? planData.annual : planData.monthly;
  };

  return (
    <section id="pricing" className="py-32 bg-[#030303] relative border-t border-white/5">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0E17] to-[#030303] opacity-50"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
            Transparent Pricing
          </div>
          <h2 className="text-3xl md:text-5xl font-display font-bold text-white">Find the right plan for your facility</h2>
          <p className="text-slate-400 max-w-2xl mx-auto text-lg">Start with a 14-day pilot, or deploy across your enterprise.</p>
        </div>
        
        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between mb-12 gap-6 bg-[#0A0E17] p-4 rounded-2xl border border-white/5">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-400">Region</span>
            <CountrySelect value={country} onChange={setCountry} disabled={isLoading} />
            {isLoading && <span className="text-xs text-slate-500 animate-pulse">Loading prices...</span>}
          </div>

          <div className="flex items-center p-1 bg-[#030303] rounded-xl border border-white/5">
            <button
              onClick={() => setIsAnnual(false)}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                !isAnnual ? 'bg-[#5fa9f2] text-black shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                isAnnual ? 'bg-[#5fa9f2] text-black shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              Annual Billing
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${isAnnual ? 'bg-black/20' : 'bg-[#5fa9f2]/20 text-[#5fa9f2]'}`}>
                Save ~16%
              </span>
            </button>
          </div>
        </div>
        
        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          
          {/* Pilot */}
          <div className="bg-[#0A0E17] border border-white/5 rounded-3xl p-8 flex flex-col hover:border-slate-700 transition-colors">
            <div className="mb-8">
              <h3 className="text-xl font-bold text-white mb-2">PILOT</h3>
              <p className="text-slate-400 text-sm h-10">Proof of concept for your team.</p>
              <div className="mt-6 flex items-baseline gap-2">
                <AnimatePresence mode="popLayout">
                  <motion.span 
                    key={getPrice('pilot')}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-4xl font-bold text-white inline-block"
                  >
                    {formatPrice(getPrice('pilot'), currency)}
                  </motion.span>
                </AnimatePresence>
              </div>
              <p className="text-sm text-slate-500 mt-2">/ 14 days</p>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>Up to 2 Camera Feeds</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>Use your own Windows PC (BYOD)</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>WhatsApp Alerts & Dashboard</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>Basic AI detection</span>
              </li>
            </ul>
            
            <button onClick={() => onSelectPlan('Pilot')} className="w-full py-3 rounded-full bg-white/5 hover:bg-white/10 text-white font-medium transition-colors border border-white/10">
              Book Live Demo
            </button>
          </div>

          {/* Base */}
          <div className="bg-gradient-to-b from-[#0A0E17] to-[#030303] border border-[#5fa9f2]/50 rounded-3xl p-8 flex flex-col relative shadow-[0_0_30px_rgba(95,169,242,0.1)]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#5fa9f2] text-black text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              Most Popular
            </div>
            <div className="mb-8">
              <h3 className="text-xl font-bold text-white mb-2">BASE LICENSE</h3>
              <p className="text-slate-400 text-sm h-10">For standard facilities.</p>
              <div className="mt-6 flex items-baseline gap-2">
                <AnimatePresence mode="popLayout">
                  <motion.span 
                    key={getPrice('base_license')}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-4xl font-bold text-white inline-block"
                  >
                    {formatPrice(getPrice('base_license'), currency)}
                  </motion.span>
                </AnimatePresence>
              </div>
              <p className="text-sm text-[#5fa9f2] mt-2 font-medium">/ {isAnnual ? 'year' : 'month'}</p>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>Up to 16 Camera Streams</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>1 SENSA Edge Appliance</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>30-Day Snapshot History</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>AI Detection & WhatsApp Alerts</span>
              </li>
            </ul>
            
            <button onClick={() => onSelectPlan('Base License')} className="w-full py-3 rounded-full bg-[#5fa9f2] hover:bg-[#4d97e0] text-black font-semibold transition-all">
              Choose Base License
            </button>
          </div>

          {/* Professional */}
          <div className="bg-[#0A0E17] border border-emerald-500/30 rounded-3xl p-8 flex flex-col relative hover:border-emerald-500/50 transition-colors">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              Growing Sites
            </div>
            <div className="mb-8">
              <h3 className="text-xl font-bold text-white mb-2">PROFESSIONAL</h3>
              <p className="text-slate-400 text-sm h-10">For larger facilities with higher camera workloads.</p>
              <div className="mt-6 flex items-baseline gap-2">
                <AnimatePresence mode="popLayout">
                  <motion.span 
                    key={getPrice('professional')}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-4xl font-bold text-white inline-block"
                  >
                    {formatPrice(getPrice('professional'), currency)}
                  </motion.span>
                </AnimatePresence>
              </div>
              <p className="text-sm text-slate-500 mt-2">/ {isAnnual ? 'year' : 'month'}</p>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>Up to 32 Camera Streams</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>60-Day Snapshot History</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>Advanced AI & Zones</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>Team Access & Analytics</span>
              </li>
            </ul>
            
            <button onClick={() => onSelectPlan('Professional')} className="w-full py-3 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-medium transition-colors border border-emerald-500/20">
              Choose Professional
            </button>
          </div>

          {/* Business */}
          <div className="bg-[#0A0E17] border border-amber-500/30 rounded-3xl p-8 flex flex-col relative hover:border-amber-500/50 transition-colors">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              Advanced
            </div>
            <div className="mb-8">
              <h3 className="text-xl font-bold text-white mb-2">BUSINESS</h3>
              <p className="text-slate-400 text-sm h-10">For high-volume single-site or multi-site deployments.</p>
              <div className="mt-6 flex items-baseline gap-2">
                <AnimatePresence mode="popLayout">
                  <motion.span 
                    key={getPrice('business')}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-4xl font-bold text-white inline-block"
                  >
                    {formatPrice(getPrice('business'), currency)}
                  </motion.span>
                </AnimatePresence>
              </div>
              <p className="text-sm text-slate-500 mt-2">/ {isAnnual ? 'year' : 'month'}</p>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>Up to 64 Camera Streams</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>2 SENSA Edge Appliances</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>90-Day Snapshot History</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>API Access & Webhooks</span>
              </li>
            </ul>
            
            <button onClick={() => onSelectPlan('Business')} className="w-full py-3 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-medium transition-colors border border-amber-500/20">
              Choose Business
            </button>
          </div>

          {/* Enterprise */}
          <div className="bg-[#0A0E17] border border-purple-500/30 rounded-3xl p-8 flex flex-col relative hover:border-purple-500/50 transition-colors">
            <div className="mb-8">
              <h3 className="text-xl font-bold text-white mb-2">ENTERPRISE</h3>
              <p className="text-slate-400 text-sm h-10">For multi-site and large-scale deployments.</p>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white">Custom</span>
              </div>
              <p className="text-sm text-transparent mt-2">/ month</p>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>100+ Camera Streams</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>Multiple Edge Appliances</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>Enterprise API & SLAs</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Check className="w-5 h-5 text-[#5fa9f2] shrink-0" />
                <span>Custom Data Residency</span>
              </li>
            </ul>
            
            <button onClick={() => onSelectPlan('Enterprise')} className="w-full py-3 rounded-full bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 font-medium transition-colors border border-purple-500/20">
              Contact Sales
            </button>
          </div>

        </div>

        {/* Find My Plan */}
        <div className="mt-16 text-center">
          {!showRecommendation ? (
            <div className="inline-flex flex-col items-center">
              <p className="text-slate-400 mb-4">Not sure which plan is right for you?</p>
              <button 
                onClick={() => setShowRecommendation(true)}
                className="flex items-center gap-2 px-6 py-2 rounded-full border border-white/10 hover:bg-white/5 text-white transition-colors text-sm"
              >
                <HelpCircle className="w-4 h-4" /> Find My Plan <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="bg-[#0A0E17] border border-white/5 p-8 rounded-2xl max-w-2xl mx-auto text-left animate-in fade-in slide-in-from-bottom-4 relative">
              
<style>{`
  .cctv-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 8px;
    background: #1e293b;
    border-radius: 999px;
    outline: none;
  }
  .cctv-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 28px;
    height: 28px;
    background-color: #030303;
    border-radius: 50%;
    cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230ea5e9' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5'/%3E%3Crect x='2' y='6' width='14' height='12' rx='2'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
    border: 2px solid #0ea5e9;
    box-shadow: 0 0 10px rgba(14, 165, 233, 0.4);
  }
  .cctv-slider::-moz-range-thumb {
    width: 28px;
    height: 28px;
    background-color: #030303;
    border-radius: 50%;
    cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230ea5e9' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5'/%3E%3Crect x='2' y='6' width='14' height='12' rx='2'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
    border: 2px solid #0ea5e9;
    box-shadow: 0 0 10px rgba(14, 165, 233, 0.4);
  }
`}</style>

              <button 
                onClick={() => setShowRecommendation(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-xl font-bold text-white mb-6">Plan Recommendation</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">How many cameras do you need to connect?</label>
                  <input 
                    type="range" 
                    min="1" 
                    max="150" 
                    value={recCameras}
                    onChange={(e) => setRecCameras(parseInt(e.target.value))}
                    className="w-full cctv-slider"
                  />
                  <div className="text-right text-sky-400 font-bold mt-2">{recCameras} Cameras</div>
                </div>
                <div className="p-4 bg-sky-500/10 border border-sky-500/20 rounded-xl">
                  <p className="text-sm text-sky-300 mb-1">Recommended Plan:</p>
                  <p className="text-2xl font-bold text-white">{handleRecommendation()}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Feature Comparison Table */}
        <div className="pt-24 pb-24">
          <div className="text-center mb-12">
            <h3 className="text-2xl font-bold text-white">Compare SENSA Plans</h3>
          </div>
          <div className="max-w-7xl mx-auto bg-[#0b0e14] border border-white/5 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="border-b border-white/10 text-white text-sm">
                    <th className="py-5 px-6 font-semibold w-1/6">Feature</th>
                    <th className="py-5 px-6 font-semibold text-center">Pilot</th>
                    <th className="py-5 px-6 font-semibold text-center text-[#5fa9f2]">Base License</th>
                    <th className="py-5 px-6 font-semibold text-center text-emerald-400">Professional</th>
                    <th className="py-5 px-6 font-semibold text-center text-amber-400">Business</th>
                    <th className="py-5 px-6 font-semibold text-center text-purple-400">Enterprise</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {/* Camera & Infrastructure */}
                  <tr>
                    <td colSpan={6} className="py-4 px-6 text-slate-500 text-xs font-bold tracking-widest uppercase bg-[#030303]">
                      Camera & Infrastructure
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-5 px-6 text-slate-300 font-medium">Camera Streams</td>
                    <td className="py-5 px-6 text-center text-slate-400">2</td>
                    <td className="py-5 px-6 text-center text-slate-400">16</td>
                    <td className="py-5 px-6 text-center text-slate-400">32</td>
                    <td className="py-5 px-6 text-center text-slate-400">64</td>
                    <td className="py-5 px-6 text-center text-slate-400">100+ Custom</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-5 px-6 text-slate-300 font-medium">Edge Appliances</td>
                    <td className="py-5 px-6 text-center text-slate-500">BYOD</td>
                    <td className="py-5 px-6 text-center text-slate-400">1 included</td>
                    <td className="py-5 px-6 text-center text-slate-400">1 included</td>
                    <td className="py-5 px-6 text-center text-slate-400">2 included</td>
                    <td className="py-5 px-6 text-center text-slate-400">Multiple Custom</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-5 px-6 text-slate-300 font-medium">Snapshot History</td>
                    <td className="py-5 px-6 text-center text-slate-400">14 days</td>
                    <td className="py-5 px-6 text-center text-slate-400">30 days</td>
                    <td className="py-5 px-6 text-center text-slate-400">60 days</td>
                    <td className="py-5 px-6 text-center text-slate-400">90 days</td>
                    <td className="py-5 px-6 text-center text-slate-400">Custom</td>
                  </tr>
                  
                  {/* AI & Alerts */}
                  <tr>
                    <td colSpan={6} className="py-4 px-6 text-slate-500 text-xs font-bold tracking-widest uppercase bg-[#030303]">
                      AI Detection & Alerts
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-5 px-6 text-slate-300 font-medium">AI Detection</td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-[#5fa9f2] mx-auto" /></td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-[#5fa9f2] mx-auto" /></td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-amber-400 mx-auto" /></td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-purple-400 mx-auto" /></td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-5 px-6 text-slate-300 font-medium">WhatsApp Alerts</td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-[#5fa9f2] mx-auto" /></td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-[#5fa9f2] mx-auto" /></td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-amber-400 mx-auto" /></td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-purple-400 mx-auto" /></td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-5 px-6 text-slate-300 font-medium">Email Alerts</td>
                    <td className="py-5 px-6 text-center text-slate-600">—</td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-[#5fa9f2] mx-auto" /></td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-amber-400 mx-auto" /></td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-purple-400 mx-auto" /></td>
                  </tr>
                  
                  {/* Advanced Features */}
                  <tr>
                    <td colSpan={6} className="py-4 px-6 text-slate-500 text-xs font-bold tracking-widest uppercase bg-[#030303]">
                      Management & Integrations
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-5 px-6 text-slate-300 font-medium">Team Access</td>
                    <td className="py-5 px-6 text-center text-slate-600">—</td>
                    <td className="py-5 px-6 text-center text-slate-400">Basic</td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                    <td className="py-5 px-6 text-center text-slate-400">Advanced</td>
                    <td className="py-5 px-6 text-center text-slate-400">Custom</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-5 px-6 text-slate-300 font-medium">API & Webhooks</td>
                    <td className="py-5 px-6 text-center text-slate-600">—</td>
                    <td className="py-5 px-6 text-center text-slate-600">—</td>
                    <td className="py-5 px-6 text-center text-slate-600">—</td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-amber-400 mx-auto" /></td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-purple-400 mx-auto" /></td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-5 px-6 text-slate-300 font-medium">Multi-Site Architecture</td>
                    <td className="py-5 px-6 text-center text-slate-600">—</td>
                    <td className="py-5 px-6 text-center text-slate-600">—</td>
                    <td className="py-5 px-6 text-center text-slate-400">Limited</td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-amber-400 mx-auto" /></td>
                    <td className="py-5 px-6 text-center"><Check className="w-5 h-5 text-purple-400 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-5 px-6 text-slate-300 font-medium">Support</td>
                    <td className="py-5 px-6 text-center text-slate-400">Email</td>
                    <td className="py-5 px-6 text-center text-slate-400">Standard</td>
                    <td className="py-5 px-6 text-center text-slate-400">Priority</td>
                    <td className="py-5 px-6 text-center text-slate-400">Priority</td>
                    <td className="py-5 px-6 text-center text-slate-400">Dedicated SLA</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
