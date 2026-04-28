import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Header() {
  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'text-zinc-900 font-semibold'
      : 'text-zinc-600 hover:text-zinc-900 transition-colors';

  return (
    <header className="h-16 bg-white border-b border-zinc-200 flex items-center px-6 justify-between shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
          S
        </div>
        <span className="font-semibold text-zinc-900">AcmeCorp Dashboard</span>
      </div>
      <div className="flex items-center gap-4 text-sm text-zinc-600">
        <NavLink to="/" className={navItemClass} end>
          Overview
        </NavLink>
        <span className="text-zinc-400">Integrations</span>
        <NavLink to="/settings" className={navItemClass}>
          Settings
        </NavLink>
        <div className="w-8 h-8 rounded-full bg-zinc-200"></div>
      </div>
    </header>
  );
}
