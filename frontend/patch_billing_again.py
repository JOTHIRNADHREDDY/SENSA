import re

with open('src/components/billing/BillingPage.tsx', 'r') as f:
    content = f.read()

target = """            <div className="flex items-center justify-center gap-2 bg-[#030303] border border-slate-800 rounded-lg p-1 w-fit mx-auto mb-8">
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
            </div>"""

replacement = """            <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
              <div className="flex items-center justify-center gap-2 bg-[#030303] border border-slate-800 rounded-lg p-1 w-fit mx-auto sm:mx-0">
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
              <div className="flex items-center gap-3 mx-auto sm:mx-0">
                <span className="text-sm font-medium text-slate-400">Region</span>
                <CountrySelect value={country} onChange={setCountry} disabled={pricesLoading} />
                {pricesLoading && <span className="text-xs text-slate-500 animate-pulse">Loading prices...</span>}
              </div>
            </div>"""

if target in content:
    content = content.replace(target, replacement)
else:
    print("TARGET NOT FOUND IN BILLING PAGE")

with open('src/components/billing/BillingPage.tsx', 'w') as f:
    f.write(content)
