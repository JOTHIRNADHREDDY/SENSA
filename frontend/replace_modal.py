import re

with open('src/components/billing/BillingPage.tsx', 'r') as f:
    content = f.read()

start_marker = "{/* Change Plan Modal */}"
end_marker = "By confirming this subscription, you authorize SENSA and its payment provider to charge the selected payment method according to the billing frequency and terms displayed above. Any applicable prorated amount will be shown before confirmation.\n            </p>\n          </div>\n        </div>\n      )}"

new_content = """{/* Change Plan Modal */}
      {isChangePlanModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#030303]/80 backdrop-blur-sm">
          <div className="bg-[#0A0E17] border border-slate-800 rounded-2xl p-6 sm:p-8 max-w-5xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button onClick={() => setIsChangePlanModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-display font-semibold text-white mb-6">Change Subscription Plan</h2>
            
            <div className="flex items-center justify-center gap-2 bg-[#030303] border border-slate-800 rounded-lg p-1 w-fit mx-auto mb-8">
              <button 
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${billingCycle === 'monthly' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Monthly
              </button>
              <button 
                onClick={() => setBillingCycle('annual')}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${billingCycle === 'annual' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Annual <span className="text-emerald-400 text-xs ml-1">-16%</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* Base License */}
              <div className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col ${sub.plan_id === 'base_license' ? 'bg-sky-500/10 border-sky-500/50' : 'bg-[#030303] border-slate-800 hover:border-slate-700'}`}>
                <h3 className="font-bold text-white mb-1 uppercase text-sm">Base License</h3>
                <div className="text-xl font-bold text-white mb-4">
                  {billingCycle === 'monthly' ? '$299' : '$2,990'}
                  <span className="text-xs font-normal text-slate-500">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                </div>
                <ul className="space-y-2 text-xs text-slate-400 mb-6 flex-1">
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-0.5" /> Up to 16 cameras</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-0.5" /> 1 Edge Appliance</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-0.5" /> 30-day history</li>
                </ul>
                <button 
                  onClick={() => alert('Proceeding to plan change flow for Base License.')}
                  disabled={sub.plan_id === 'base_license'} 
                  className={`w-full mt-auto py-2 disabled:bg-slate-800 disabled:text-slate-500 font-semibold rounded text-sm ${sub.plan_id === 'base_license' ? 'bg-slate-800 text-slate-500' : 'bg-sky-500 text-black hover:bg-sky-400'}`}>
                  {sub.plan_id === 'base_license' ? 'Current Plan' : 'Select Plan'}
                </button>
              </div>

              {/* Professional */}
              <div className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col ${sub.plan_id === 'professional' ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-[#030303] border-slate-800 hover:border-slate-700'}`}>
                <h3 className="font-bold text-white mb-1 uppercase text-sm">Professional</h3>
                <div className="text-xl font-bold text-white mb-4">
                  {billingCycle === 'monthly' ? '$599' : '$5,990'}
                  <span className="text-xs font-normal text-slate-500">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                </div>
                <ul className="space-y-2 text-xs text-slate-400 mb-6 flex-1">
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> Up to 32 cameras</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> 1 Edge Appliance</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> 60-day history</li>
                </ul>
                <button 
                  onClick={() => alert('Proceeding to plan change flow for Professional.')}
                  disabled={sub.plan_id === 'professional'} 
                  className={`w-full mt-auto py-2 disabled:bg-slate-800 disabled:text-slate-500 font-semibold rounded text-sm ${sub.plan_id === 'professional' ? 'bg-slate-800 text-slate-500' : 'bg-emerald-500 text-black hover:bg-emerald-400'}`}>
                  {sub.plan_id === 'professional' ? 'Current Plan' : 'Select Plan'}
                </button>
              </div>

              {/* Business */}
              <div className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col ${sub.plan_id === 'business' ? 'bg-amber-500/10 border-amber-500/50' : 'bg-[#030303] border-slate-800 hover:border-slate-700'}`}>
                <h3 className="font-bold text-white mb-1 uppercase text-sm">Business</h3>
                <div className="text-xl font-bold text-white mb-4">
                  {billingCycle === 'monthly' ? '$999' : '$9,990'}
                  <span className="text-xs font-normal text-slate-500">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                </div>
                <ul className="space-y-2 text-xs text-slate-400 mb-6 flex-1">
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /> Up to 64 cameras</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /> 2 Edge Appliances</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /> 90-day history</li>
                </ul>
                <button 
                  onClick={() => alert('Proceeding to plan change flow for Business.')}
                  disabled={sub.plan_id === 'business'} 
                  className={`w-full mt-auto py-2 disabled:bg-slate-800 disabled:text-slate-500 font-semibold rounded text-sm ${sub.plan_id === 'business' ? 'bg-slate-800 text-slate-500' : 'bg-amber-500 text-black hover:bg-amber-400'}`}>
                  {sub.plan_id === 'business' ? 'Current Plan' : 'Select Plan'}
                </button>
              </div>

              {/* Enterprise */}
              <div className={`p-4 rounded-xl border transition-all flex flex-col ${sub.plan_id === 'enterprise' ? 'bg-purple-500/10 border-purple-500/50' : 'bg-[#030303] border-slate-800'}`}>
                <h3 className="font-bold text-white mb-1 uppercase text-sm">Enterprise</h3>
                <div className="text-xl font-bold text-white mb-4">
                  Custom
                </div>
                <ul className="space-y-2 text-xs text-slate-400 mb-6 flex-1">
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" /> 100+ cameras</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" /> Multiple Edge Appliances</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" /> Dedicated SLA</li>
                </ul>
                <button onClick={onContactSales} className="w-full mt-auto py-2 bg-white text-black hover:bg-slate-200 font-semibold rounded text-sm">
                  Contact Sales &rarr;
                </button>
              </div>
            </div>
            
            <p className="text-xs text-slate-500 text-center">
              By confirming this subscription, you authorize SENSA and its payment provider to charge the selected payment method according to the billing frequency and terms displayed above. Any applicable prorated amount will be shown before confirmation.
            </p>
          </div>
        </div>
      )}"""

start_idx = content.find(start_marker)
end_idx = content.find(end_marker) + len(end_marker)

if start_idx != -1 and content.find(end_marker) != -1:
    new_full_content = content[:start_idx] + new_content + content[end_idx:]
    with open('src/components/billing/BillingPage.tsx', 'w') as f:
        f.write(new_full_content)
    print("Successfully replaced.")
else:
    print("Could not find markers.")
