const fs = require('fs');

let code = fs.readFileSync('src/components/PricingSection.tsx', 'utf8');

code = code.replace(
  "import { Check, HelpCircle, ArrowRight } from 'lucide-react';",
  "import { Check, HelpCircle, ArrowRight, X } from 'lucide-react';"
);

const sliderCSS = `
<style>{\`
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
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%230ea5e9' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16.75 12h3.632a1 1 0 0 1 .894 1.447l-2.034 4.069a1 1 0 0 1-1.708.134l-2.124-2.97'/%3E%3Cpath d='M17.106 9.053a1 1 0 0 1 1.053-.447l1.36.34a1 1 0 0 1 .632 1.487l-1.352 2.224a1 1 0 0 1-1.636-.073l-1.124-1.72'/%3E%3Cpath d='M2 19h5'/%3E%3Cpath d='M4 19v-5'/%3E%3Cpath d='M7.743 14.5a3 3 0 1 1 4.514-3.5'/%3E%3Cpath d='M7 10.5 4.5 13'/%3E%3Cpath d='M9 13.5l-2.5 2.5'/%3E%3C/svg%3E");
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
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%230ea5e9' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16.75 12h3.632a1 1 0 0 1 .894 1.447l-2.034 4.069a1 1 0 0 1-1.708.134l-2.124-2.97'/%3E%3Cpath d='M17.106 9.053a1 1 0 0 1 1.053-.447l1.36.34a1 1 0 0 1 .632 1.487l-1.352 2.224a1 1 0 0 1-1.636-.073l-1.124-1.72'/%3E%3Cpath d='M2 19h5'/%3E%3Cpath d='M4 19v-5'/%3E%3Cpath d='M7.743 14.5a3 3 0 1 1 4.514-3.5'/%3E%3Cpath d='M7 10.5 4.5 13'/%3E%3Cpath d='M9 13.5l-2.5 2.5'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
    border: 2px solid #0ea5e9;
    box-shadow: 0 0 10px rgba(14, 165, 233, 0.4);
  }
\`}</style>
`;

const replaceTarget = `            <div className="bg-[#0A0E17] border border-white/5 p-8 rounded-2xl max-w-2xl mx-auto text-left animate-in fade-in slide-in-from-bottom-4">
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
                    className="w-full accent-sky-500"
                  />`;

const newTarget = `            <div className="bg-[#0A0E17] border border-white/5 p-8 rounded-2xl max-w-2xl mx-auto text-left animate-in fade-in slide-in-from-bottom-4 relative">
              ${sliderCSS}
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
                  />`;

code = code.replace(replaceTarget, newTarget);
fs.writeFileSync('src/components/PricingSection.tsx', code);
console.log('Patched');
