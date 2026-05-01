import React from 'react';
import { cn } from '@/lib/utils';
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; icon?: React.ReactNode; }
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{label}</label>}
        <div className="relative">
          {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>}
          <input ref={ref} className={cn('w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-200', 'focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500', 'disabled:bg-slate-50 disabled:text-slate-400', icon && 'pl-10', error && 'border-red-500 focus:ring-red-500/10 focus:border-red-500', className)} {...props} />
        </div>
        {error && <p className="text-xs font-medium text-red-500 ml-1">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
