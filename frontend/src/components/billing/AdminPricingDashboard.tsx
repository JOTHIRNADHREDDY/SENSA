import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { formatPrice } from '../../data/pricingCatalog';
import { Save, RefreshCw } from 'lucide-react';

export const AdminPricingDashboard: React.FC = () => {
  const [prices, setPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPrices();
  }, []);

  const fetchPrices = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'regional_prices'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPrices(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePriceChange = (id: string, field: 'monthly' | 'annual', valStr: string) => {
    const val = parseInt(valStr, 10);
    if (isNaN(val)) return;
    setPrices(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const p of prices) {
        await setDoc(doc(db, 'regional_prices', p.id), p);
      }
      alert('Prices saved successfully');
    } catch (err) {
      console.error(err);
      alert('Failed to save prices');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-white">Loading pricing configuration...</div>;
  }

  return (
    <div className="p-8 bg-[#0A0E17] min-h-screen text-white">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold font-display">Regional Pricing Engine</h1>
            <p className="text-slate-400">Manage base prices for different global markets.</p>
          </div>
          <div className="flex gap-4">
            <button onClick={fetchPrices} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg">
              <RefreshCw className="w-5 h-5 text-slate-300" />
            </button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-black font-semibold rounded-lg disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>

        <div className="bg-[#030303] border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[#0A0E17] border-b border-white/10">
              <tr>
                <th className="p-4 font-semibold text-slate-300">Country</th>
                <th className="p-4 font-semibold text-slate-300">Plan</th>
                <th className="p-4 font-semibold text-slate-300">Currency</th>
                <th className="p-4 font-semibold text-slate-300">Monthly (Minor)</th>
                <th className="p-4 font-semibold text-slate-300">Annual (Minor)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {prices.map(p => (
                <tr key={p.id} className="hover:bg-white/5">
                  <td className="p-4 font-medium">{p.country}</td>
                  <td className="p-4 capitalize">{p.planId.replace('_', ' ')}</td>
                  <td className="p-4">{p.currency}</td>
                  <td className="p-4">
                    <input 
                      type="number" 
                      value={p.monthly} 
                      onChange={(e) => handlePriceChange(p.id, 'monthly', e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-32 focus:border-sky-500 outline-none"
                    />
                    <div className="text-xs text-slate-500 mt-1">{formatPrice(p.monthly, p.currency)}</div>
                  </td>
                  <td className="p-4">
                    <input 
                      type="number" 
                      value={p.annual} 
                      onChange={(e) => handlePriceChange(p.id, 'annual', e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-32 focus:border-sky-500 outline-none"
                    />
                    <div className="text-xs text-slate-500 mt-1">{formatPrice(p.annual, p.currency)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
