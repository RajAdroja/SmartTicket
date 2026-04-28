import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Header() {
  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'text-foreground font-semibold'
      : 'text-muted-foreground hover:text-foreground transition-colors';

  return (
    <header className="h-16 bg-card border-b border-border flex items-center px-6 justify-between shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">
          S
        </div>
        <span className="font-semibold text-foreground">AcmeCorp Dashboard</span>
      </div>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <NavLink to="/" className={navItemClass} end>
          Overview
        </NavLink>
        <span className="text-muted-foreground/70">Integrations</span>
        <NavLink to="/settings" className={navItemClass}>
          Settings
        </NavLink>
        <div className="w-8 h-8 rounded-full bg-muted"></div>
      </div>
    </header>
  );
}
