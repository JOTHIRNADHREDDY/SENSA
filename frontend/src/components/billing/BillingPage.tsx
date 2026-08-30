import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { db } from '../../lib/firebase';
import { doc, getDoc, collection, getDocs, setDoc, Timestamp } from 'firebase/firestore';
import { BillingSubscription, Invoice } from '../../types';
import { formatPrice } from '../../data/pricingCatalog';
import { CountrySelect } from '../CountrySelect';
import { CreditCard, FileText, CheckCircle2, AlertCircle, RefreshCw, ChevronRight, Download, Info, Shield, Plus, Building2, User, Mail, MapPin, Zap, X } from 'lucide-react';


const DEFAULT_TRIAL_SUBSCRIPTION: BillingSubscription = {
  id: 'sub_trial_default',
  plan_id: 'pilot',
  status: 'trialing',
  billing_cycle: 'monthly',
  currency: 'USD',
  amount_minor: 0,
  current_period_start: new Date().toISOString(),
  current_period_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days
  next_billing_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  cancel_at_period_end: false,
  payment_method: null,
  billing_info: null
};

interface BillingPageProps {
  onContactSupport: () => void;
  onContactSales: () => void;
}

export const BillingPage: React.FC<BillingPageProps> = ({ onContactSupport, onContactSales }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<BillingSubscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  
  // Modals state
  const [isChangePlanModalOpen, setIsChangePlanModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isUpdateBillingModalOpen, setIsUpdateBillingModalOpen] = useState(false);
  const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  
  // Form state
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [actionLoading, setActionLoading] = useState(false);
  const [pricingData, setPricingData] = useState<Record<string, any>>({});
  const [currency, setCurrency] = useState('USD');
  const [country, setCountry] = useState('US');
  const [pricesLoading, setPricesLoading] = useState(false);

  useEffect(() => {
    setPricesLoading(true);
    fetch((import.meta.env.VITE_API_BASE_URL || '') + `/api/v1/billing/price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country })
    })
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


  useEffect(() => {
    if (!user) return;
    const fetchBillingData = async () => {
      setLoading(true);
      try {
        const subDoc = await getDoc(doc(db, 'subscriptions', user.uid));
        if (subDoc.exists()) {
          setSub(subDoc.data() as BillingSubscription);
        } else {
          // If no subscription exists in Firestore, set up a trial
          setSub(DEFAULT_TRIAL_SUBSCRIPTION);
          // Optional: we don't automatically write it to DB here to avoid unneeded writes,
          // assuming backend does this on user creation.
        }

        const invSnapshot = await getDocs(collection(db, `subscriptions/${user.uid}/invoices`));
        const invs = invSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
        // Sort descending by date
        invs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setInvoices(invs);

      } catch (err) {
        console.error("Failed to load billing data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBillingData();
  }, [user]);

  const formatCurrency = (amountMinor: number | null, currency: string) => {
    if (amountMinor === null) return 'Custom';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amountMinor / 100);
  };

  const formatDate = (isoString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(isoString));
  };

  const handlePlanChangeSelect = (newPlanId: string, maxCameras: number) => {
    // In a real app, this would check current camera count
    // and prevent downgrade if current count > maxCameras
    if (sub && sub.plan_id === 'business' && (newPlanId === 'professional' || newPlanId === 'base_license')) {
      alert(`Warning: Your current deployment might exceed the ${maxCameras} camera limit of the new plan. Please reduce camera usage before downgrading.`);
      return;
    }
    
    if (sub && sub.plan_id === 'professional' && newPlanId === 'base_license') {
      alert(`Warning: Your current deployment might exceed the ${maxCameras} camera limit of the new plan. Please reduce camera usage before downgrading.`);
      return;
    }

    const confirmMsg = `Are you sure you want to change your plan to ${newPlanId.replace('_', ' ').toUpperCase()}?`;
    if (window.confirm(confirmMsg)) {
      alert(`Plan successfully changed to ${newPlanId.replace('_', ' ').toUpperCase()}. Charges have been prorated.`);
      setIsChangePlanModalOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-[60vh] flex flex-col items-center justify-center text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin mb-4 text-sky-500" />
        <p>Loading billing information...</p>
      </div>
    );
  }

  if (!sub) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] text-sky-400 tracking-widest mb-2 border border-sky-500/20 rounded bg-sky-500/5 px-2 py-0.5 inline-block">
            ACCOUNT &middot; BILLING
          </div>
          <h1 className="font-display text-3xl font-bold text-white mb-2">Billing & Subscription</h1>
          <p className="text-slate-400 text-sm max-w-xl">
            Manage your SENSA subscription, payment methods, invoices, and billing information.
          </p>
        </div>
        <button 
          onClick={onContactSupport}
          className="px-4 py-2 bg-[#0A0E17] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
        >
          Contact Billing Support
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (Plan & Status) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Subscription Status Banner */}
          <div className={`p-4 rounded-xl border flex items-start gap-3 ${
            sub.status === 'active' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
            sub.status === 'trialing' ? 'bg-sky-500/10 border-sky-500/20 text-sky-400' :
            sub.status === 'past_due' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
            sub.status === 'payment_failed' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
            sub.status === 'pending' ? 'bg-slate-800/50 border-slate-700 text-slate-300' :
            'bg-slate-900 border-slate-800 text-slate-400'
          }`}>
            {sub.status === 'active' && <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />}
            {sub.status === 'trialing' && <Zap className="w-5 h-5 shrink-0 mt-0.5" />}
            {(sub.status === 'past_due' || sub.status === 'payment_failed') && <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
            {sub.status === 'canceled' && <Info className="w-5 h-5 shrink-0 mt-0.5" />}
            {sub.status === 'pending' && <RefreshCw className="w-5 h-5 shrink-0 mt-0.5 animate-spin" />}
            
            <div className="flex-1">
              <h3 className="text-sm font-bold mb-1">
                {sub.status === 'active' && 'Your SENSA subscription is active.'}
                {sub.status === 'trialing' && 'Your SENSA trial is active.'}
                {sub.status === 'past_due' && 'Payment requires attention'}
                {sub.status === 'payment_failed' && 'Payment requires attention'}
                {sub.status === 'canceled' && 'Your subscription is cancelled.'}
                {sub.status === 'pending' && 'Your payment or subscription change is being processed.'}
              </h3>
              <p className="text-xs opacity-90 leading-relaxed">
                {sub.status === 'trialing' && `Trial ends: ${formatDate(sub.current_period_end)}`}
                {sub.status === 'past_due' && 'Your latest payment could not be completed.'}
                {sub.status === 'payment_failed' && 'We couldn\'t process your latest payment.'}
                {sub.status === 'canceled' && `Access remains available until ${formatDate(sub.current_period_end)}`}
              </p>
            </div>
            
            {(sub.status === 'past_due' || sub.status === 'payment_failed') && (
              <button 
                onClick={() => setIsPaymentMethodModalOpen(true)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-xs font-semibold transition-colors"
              >
                Update Payment Method
              </button>
            )}
            {sub.status === 'canceled' && (
              <button className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-xs font-semibold transition-colors">
                Reactivate Subscription
              </button>
            )}
          </div>

          {/* Current Plan Card */}
          <div className="bg-[#0A0E17] border border-slate-800 rounded-2xl p-6">
            <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-4">CURRENT PLAN</div>
            
            <div className="flex flex-col sm:flex-row justify-between gap-6 pb-6 border-b border-white/5">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-display font-semibold text-white uppercase">
                    {sub.plan_id.replace('_', ' ')}
                  </h2>
                  <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                    sub.status === 'active' || sub.status === 'trialing' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-slate-800/50 border-slate-700 text-slate-400'
                  }`}>
                    &bull; {sub.status}
                  </div>
                </div>
                {sub.plan_id === 'enterprise' ? (
                  <p className="text-slate-400 text-sm">Managed under enterprise agreement</p>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-3xl font-bold text-white">{formatCurrency(sub.amount_minor, sub.currency)}</span>
                      <span className="text-slate-500 text-sm">/ {sub.billing_cycle === 'annual' ? 'year' : 'month'}</span>
                    </div>
                    {sub.status !== 'canceled' && (
                      <p className="text-slate-400 text-sm mt-2">
                        Next billing date: <span className="text-slate-300">{formatDate(sub.next_billing_date)}</span>
                      </p>
                    )}
                  </>
                )}
              </div>
              
              <div className="flex flex-col gap-2 shrink-0">
                {sub.plan_id === 'enterprise' ? (
                  <button onClick={onContactSales} className="w-full sm:w-auto px-5 py-2.5 bg-white text-black hover:bg-slate-200 rounded-lg text-sm font-semibold transition-all">
                    Contact Account Manager
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => setIsChangePlanModalOpen(true)}
                      className="w-full sm:w-auto px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-[#030303] rounded-lg text-sm font-semibold transition-all"
                    >
                      Change Plan
                    </button>
                    {sub.status !== 'canceled' && sub.plan_id !== 'pilot' && (
                      <button 
                        onClick={() => setIsCancelModalOpen(true)}
                        className="w-full sm:w-auto px-5 py-2.5 bg-[#030303] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        Cancel Subscription
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="pt-6">
              <h4 className="text-xs font-semibold text-slate-300 mb-4 uppercase tracking-wider">Included in your plan</h4>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sub.plan_id === 'pilot' ? (
                  <>
                    <li className="flex items-start gap-2 text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" /> 14-day full access</li>
                    <li className="flex items-start gap-2 text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" /> Up to 4 camera streams</li>
                  </>
                ) : sub.plan_id === 'enterprise' ? (
                  <>
                    <li className="flex items-start gap-2 text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> Unlimited sites</li>
                    <li className="flex items-start gap-2 text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> Licensed cameras</li>
                    <li className="flex items-start gap-2 text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> Custom data retention</li>
                    <li className="flex items-start gap-2 text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> Dedicated SLA</li>
                  </>
                ) : (
                  <>
                    <li className="flex items-start gap-2 text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" /> Up to 16 camera streams</li>
                    <li className="flex items-start gap-2 text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" /> 1 SENSA Edge Appliance</li>
                    <li className="flex items-start gap-2 text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" /> 30-day snapshot history</li>
                    <li className="flex items-start gap-2 text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" /> Alerting and integrations</li>
                  </>
                )}
              </ul>
            </div>
          </div>

          {/* Payment Method & Billing Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Payment Method */}
            <div className="bg-[#0A0E17] border border-slate-800 rounded-2xl p-6 flex flex-col">
              <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-4">PAYMENT METHOD</div>
              {sub.payment_method ? (
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-8 bg-white rounded border border-slate-200 flex items-center justify-center">
                    {/* Placeholder for Card Icon */}
                    <span className="text-[#030303] font-bold text-xs uppercase">{sub.payment_method.brand}</span>
                  </div>
                  <div>
                    <p className="text-slate-200 text-sm font-medium">•••• •••• •••• {sub.payment_method.last4}</p>
                    <p className="text-slate-500 text-xs">Expires {String(sub.payment_method.exp_month).padStart(2, '0')}/{sub.payment_method.exp_year}</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center items-center text-center py-4 mb-6">
                  <CreditCard className="w-6 h-6 text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400">No payment method added.</p>
                </div>
              )}
              
              <button 
                onClick={() => setIsPaymentMethodModalOpen(true)}
                className="mt-auto w-full py-2 bg-[#030303] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                {sub.payment_method ? 'Update Payment Method' : 'Add Payment Method'}
              </button>
            </div>

            {/* Billing Info */}
            <div className="bg-[#0A0E17] border border-slate-800 rounded-2xl p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="font-mono text-[10px] text-slate-500 tracking-widest">BILLING INFORMATION</div>
                <button onClick={() => setIsUpdateBillingModalOpen(true)} className="text-sky-400 hover:text-sky-300 text-xs font-medium transition-colors">
                  Edit
                </button>
              </div>
              
              {sub.billing_info ? (
                <div className="space-y-1 text-sm text-slate-300 flex-1">
                  {sub.billing_info.company && <p className="font-medium text-white">{sub.billing_info.company}</p>}
                  <p>{sub.billing_info.name}</p>
                  <p>{sub.billing_info.email}</p>
                  <p className="pt-2">{sub.billing_info.address}</p>
                  <p>{sub.billing_info.city}, {sub.billing_info.state} {sub.billing_info.postal_code}</p>
                  <p>{sub.billing_info.country}</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center items-center text-center py-4">
                  <Building2 className="w-6 h-6 text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400">Billing details incomplete.</p>
                </div>
              )}
            </div>

          </div>

          {/* Invoice History */}
          <div className="bg-[#0A0E17] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <div className="font-mono text-[10px] text-slate-500 tracking-widest">INVOICE HISTORY</div>
            </div>
            
            {invoices.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <FileText className="w-8 h-8 text-slate-700 mb-3" />
                <h4 className="text-white font-medium mb-1">No invoices yet</h4>
                <p className="text-slate-500 text-sm">Your invoices will appear here after your first paid transaction.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs font-medium text-slate-500 bg-[#030303]/50">
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 font-medium">Invoice</th>
                      <th className="px-6 py-3 font-medium">Description</th>
                      <th className="px-6 py-3 font-medium text-right">Amount</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {invoices.map(inv => (
                      <tr key={inv.id} className="border-b border-slate-800/50 hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4 text-slate-300">{formatDate(inv.date)}</td>
                        <td className="px-6 py-4 font-mono text-slate-400 text-xs">{inv.id}</td>
                        <td className="px-6 py-4 text-slate-300">{inv.description}</td>
                        <td className="px-6 py-4 text-right font-medium text-white">{formatCurrency(inv.amount_minor, inv.currency)}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                            inv.status === 'paid' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                            inv.status === 'pending' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                            inv.status === 'failed' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                            'bg-slate-800/50 border-slate-700 text-slate-400'
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setSelectedInvoice(inv)} className="text-sky-400 hover:text-sky-300 text-xs font-medium">View</button>
                            {inv.pdf_url && (
                              <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white">
                                <Download className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <div className="bg-[#030303] border border-slate-800 rounded-2xl p-6 flex items-start gap-4">
             <Shield className="w-6 h-6 text-slate-600 shrink-0" />
             <div>
               <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Payment Security</h4>
               <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                 Payment-card details are handled through configured payment-processing infrastructure. SENSA does not display or store full payment-card credentials in the application interface.
               </p>
             </div>
          </div>

        </div>
        
        {/* Right Column (Summary & Tax) */}
        <div className="space-y-6">
          
          {/* Billing Summary */}
          <div className="bg-[#0A0E17] border border-slate-800 rounded-2xl p-6">
            <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-4">CURRENT BILLING</div>
            
            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center border-b border-slate-800/50 pb-3">
                <span className="text-slate-400">Plan</span>
                <span className="text-white font-medium uppercase">{sub.plan_id.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800/50 pb-3">
                <span className="text-slate-400">Billing cycle</span>
                <span className="text-white font-medium capitalize">{sub.billing_cycle}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800/50 pb-3">
                <span className="text-slate-400">Amount</span>
                <span className="text-white font-medium">{formatCurrency(sub.amount_minor, sub.currency)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800/50 pb-3">
                <span className="text-slate-400">Tax</span>
                <span className="text-slate-500 text-xs text-right max-w-[140px]">Calculated according to billing location</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-slate-300 font-medium">Total</span>
                <span className="text-white font-bold text-lg">{formatCurrency(sub.amount_minor, sub.currency)}</span>
              </div>
            </div>
          </div>

          {/* Tax Information */}
          <div className="bg-[#0A0E17] border border-slate-800 rounded-2xl p-6">
            <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-4">TAX INFORMATION</div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Billing country:</span>
                <span className="text-slate-300">{sub.billing_info?.country || 'Not set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tax ID:</span>
                <span className="text-slate-300 font-mono">{sub.billing_info?.tax_id || 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tax treatment:</span>
                <span className="text-slate-300">Standard</span>
              </div>
              <p className="text-xs text-slate-500 mt-4 leading-relaxed p-3 bg-slate-900/50 rounded-lg">
                Tax calculated at checkout according to your billing location and applicable rules.
              </p>
            </div>
          </div>

          {/* Refunds & Policies */}
          <div className="bg-transparent border border-slate-800 rounded-2xl p-6">
            <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-3">REFUNDS &amp; CANCELLATIONS</div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Refund eligibility is governed by the SENSA Refund, Cancellation &amp; Subscription Policy and any applicable consumer-protection or contractual requirements.
            </p>
            <button className="text-sky-400 hover:text-sky-300 text-xs font-medium transition-colors">
              View Refund Policy &rarr;
            </button>
          </div>

        </div>

      </div>

      {/* --- MODALS (Simplified for preview) --- */}

      {/* Cancel Modal */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#030303]/80 backdrop-blur-sm">
          <div className="bg-[#0A0E17] border border-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setIsCancelModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-display font-semibold text-white mb-3">Cancel SENSA subscription?</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Your subscription will remain active until the end of the current billing period unless otherwise specified by your agreement.
            </p>
            
            <div className="bg-[#030303] border border-slate-800 rounded-lg p-4 space-y-3 mb-8 text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Current plan</span>
                <span className="font-medium uppercase text-white">{sub.plan_id.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Current billing period</span>
                <span className="capitalize">{sub.billing_cycle}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Access end date</span>
                <span className="text-amber-400 font-medium">{formatDate(sub.current_period_end)}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row-reverse gap-3">
              <button 
                onClick={() => {
                  alert("Subscription cancellation requested. Redirecting to cancellation flow...");
                  setIsCancelModalOpen(false);
                }} 
                className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg text-sm transition-colors"
              >
                Confirm Cancellation
              </button>
              <button 
                onClick={() => setIsCancelModalOpen(false)} 
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white font-medium rounded-lg text-sm transition-colors"
              >
                Keep Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Plan Modal */}
      {isChangePlanModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#030303]/80 backdrop-blur-sm">
          <div className="bg-[#0A0E17] border border-slate-800 rounded-2xl p-6 sm:p-8 max-w-5xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button onClick={() => setIsChangePlanModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-display font-semibold text-white mb-6">Change Subscription Plan</h2>
            
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
                <span className="text-sm font-medium text-slate-400">Region</span>
                <CountrySelect value={country} onChange={setCountry} disabled={pricesLoading} />
                {pricesLoading && <span className="text-xs text-slate-500 animate-pulse">Loading prices...</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* Base License */}
              <div className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col ${sub.plan_id === 'base_license' ? 'bg-sky-500/10 border-sky-500/50' : 'bg-[#030303] border-slate-800 hover:border-slate-700'}`}>
                <h3 className="font-bold text-white mb-1 uppercase text-sm">Base License</h3>
                <div className="text-xl font-bold text-white mb-4">
                  {pricesLoading ? '...' : formatPrice(getPrice('base_license'), currency as any)}
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
                  {pricesLoading ? '...' : formatPrice(getPrice('professional'), currency as any)}
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
                  {pricesLoading ? '...' : formatPrice(getPrice('business'), currency as any)}
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
      )}

    </div>
  );
};
