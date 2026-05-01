import React from 'react';
import { Sidebar } from './Sidebar';
interface DashboardLayoutProps { children: React.ReactNode; }
export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-['Inter']">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative"><div className="max-w-[1400px] mx-auto p-12">{children}</div></main>
    </div>
  );
};
