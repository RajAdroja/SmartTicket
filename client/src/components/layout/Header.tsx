import React from 'react';

export default function Header() {
  return (
    <header className="h-16 bg-white border-b border-zinc-200 flex items-center px-6 justify-between shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
          S
        </div>
        <span className="font-semibold text-zinc-900">AcmeCorp Dashboard</span>
      </div>
      <div className="flex items-center gap-4 text-sm text-zinc-600">
        <span>Overview</span>
        <span>Integrations</span>
        <span>Settings</span>
        <div className="w-8 h-8 rounded-full bg-zinc-200"></div>
      </div>
    </header>
  );
}
