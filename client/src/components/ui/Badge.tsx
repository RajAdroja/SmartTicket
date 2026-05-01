import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'secondary';
}

export const Badge: React.FC<BadgeProps> = ({ className, variant = 'info', children, ...props }) => {
  const variants = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
    warning: 'bg-amber-50 text-amber-700 border-amber-200/50',
    danger: 'bg-rose-50 text-rose-700 border-rose-200/50',
    info: 'bg-blue-50 text-blue-700 border-blue-200/50',
    secondary: 'bg-slate-100 text-slate-600 border-slate-200/50',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight border',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
