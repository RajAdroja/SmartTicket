import React from 'react';
import { LayoutDashboard, MessageSquare, BarChart3, Settings, LogOut, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
const navItems = [{ icon: LayoutDashboard, label: 'Queue', id: 'queue' }, { icon: MessageSquare, label: 'Live Chat', id: 'chat' }, { icon: BarChart3, label: 'Analytics', id: 'analytics' }, { icon: Settings, label: 'Settings', id: 'settings' }];
export const Sidebar = () => {
  const [activeTab, setActiveTab] = React.useState('queue');
  return (
    <aside className="w-72 h-screen bg-white border-r border-slate-200 flex flex-col shrink-0">
      <div className="p-8 flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20"><Sparkles size={20} /></div>
        <span className="font-bold text-slate-900 text-xl tracking-tight">SmartTicket</span>
      </div>
      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => (
          <button key={item.id} onClick={() => setActiveTab(item.id)} className={cn('w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-300', activeTab === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 translate-x-1' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900')}>
            <item.icon size={20} />{item.label}
          </button>
        ))}
      </nav>
      <div className="p-6 border-t border-slate-100">
        <button className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-sm font-bold text-slate-400 hover:bg-red-50 hover:text-red-600 transition-all duration-300"><LogOut size={20} />Sign Out</button>
      </div>
    </aside>
  );
};
