import React from 'react';
import { Camera, LayoutDashboard, Activity, Map, CreditCard, Settings, User } from 'lucide-react';

interface DashboardNavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const DashboardNavbar: React.FC<DashboardNavbarProps> = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'cameras', label: 'Cameras', icon: Camera },
    { id: 'inspector', label: 'Alerts', icon: Activity },
    { id: 'zones', label: 'Sites & Zones', icon: Map },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'admin', label: 'Admin', icon: Settings },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="w-full bg-[#0A0E17]/80 backdrop-blur-md border-b border-white/5 sticky top-16 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto custom-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                isActive 
                  ? 'border-sky-500 text-sky-400 bg-sky-500/5' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-sky-500' : 'opacity-70'}`} />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
