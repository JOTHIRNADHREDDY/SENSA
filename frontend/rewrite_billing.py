import re

with open('src/components/billing/BillingPage.tsx', 'r') as f:
    content = f.read()

# 1. Remove PRICING_CATALOG
content = re.sub(r'// Pricing catalog \(Server-side mock\)\nexport const PRICING_CATALOG = \{[\s\S]*?\n\};\n', '', content)

# 2. Add imports
content = content.replace("import { CreditCard, ", "import { formatPrice } from '../../data/pricingCatalog';\nimport { CreditCard, ")

# 3. Add states
state_injection = """  const [pricingData, setPricingData] = useState<Record<string, any>>({});
  const [currency, setCurrency] = useState('USD');
  const [country, setCountry] = useState('US');
  const [pricesLoading, setPricesLoading] = useState(false);

  useEffect(() => {
    setPricesLoading(true);
    fetch(`/api/pricing/${country}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setPricingData(data.prices);
          const firstPlan = Object.values(data.prices)[0] as any;
          if (firstPlan && firstPlan.currency) {
            setCurrency(firstPlan.currency);
          }
        }
      })
      .catch(console.error)
      .finally(() => setPricesLoading(false));
  }, [country]);

  const getPrice = (planId: string) => {
    if (planId === 'enterprise') return null;
    const planData = pricingData[planId];
    if (!planData) return 0;
    return billingCycle === 'annual' ? planData.annual : planData.monthly;
  };
"""
content = content.replace("const [actionLoading, setActionLoading] = useState(false);", "const [actionLoading, setActionLoading] = useState(false);\n" + state_injection)

# 4. Replace hardcoded prices
content = content.replace("{billingCycle === 'monthly' ? '$299' : '$2,990'}", "{pricesLoading ? '...' : formatPrice(getPrice('base_license'), currency as any)}")
content = content.replace("{billingCycle === 'monthly' ? '$599' : '$5,990'}", "{pricesLoading ? '...' : formatPrice(getPrice('professional'), currency as any)}")
content = content.replace("{billingCycle === 'monthly' ? '$999' : '$9,990'}", "{pricesLoading ? '...' : formatPrice(getPrice('business'), currency as any)}")

# 5. Add country selector in Change Plan Modal
country_selector = """
            <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
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
                <span className="text-sm text-slate-400">Region:</span>
                <select value={country} onChange={e => setCountry(e.target.value)} className="bg-[#030303] border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none">
                  <option value="US">United States</option>
                  <option value="IN">India</option>
                  <option value="GB">United Kingdom</option>
                  <option value="DE">Europe (Germany)</option>
                </select>
              </div>
            </div>
"""

content = re.sub(r'<div className="flex items-center justify-center gap-2 bg\[#030303\].*?</div>\n\n            <div className="grid', country_selector + '            <div className="grid', content, flags=re.DOTALL)

with open('src/components/billing/BillingPage.tsx', 'w') as f:
    f.write(content)
