import React from 'react';
import { Ticket } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Clock, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TicketCardProps {
  ticket: Ticket;
  isActive?: boolean;
  onClick?: () => void;
}

const getTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export const TicketCard: React.FC<TicketCardProps> = ({ ticket, isActive, onClick }) => {
  const lastMessage = ticket.messages[ticket.messages.length - 1]?.text || 'No messages';
  
  const priorityVariants = {
    urgent: 'danger',
    high: 'warning',
    normal: 'info',
    low: 'secondary',
  } as const;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-6 rounded-[2rem] border transition-all duration-300 group outline-none',
        isActive 
          ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-600/20' 
          : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm'
      )}
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className={cn(
          'font-bold truncate pr-4 text-lg tracking-tight',
          isActive ? 'text-white' : 'text-slate-900'
        )}>
          {ticket.customerName}
        </h3>
        <Badge variant={priorityVariants[ticket.priority]} className={cn(isActive && 'bg-white/20 border-white/20 text-white')}>
          {ticket.priority}
        </Badge>
      </div>

      <p className={cn(
        'text-sm line-clamp-2 mb-6 font-medium leading-relaxed',
        isActive ? 'text-blue-100' : 'text-slate-500'
      )}>
        {lastMessage}
      </p>

      <div className="flex items-center gap-6">
        <div className={cn(
          'flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest',
          isActive ? 'text-blue-200' : 'text-slate-400'
        )}>
          <Clock size={14} strokeWidth={2.5} />
          {getTimeAgo(ticket.escalatedAt)}
        </div>
        <div className={cn(
          'flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest',
          isActive ? 'text-blue-200' : 'text-slate-400'
        )}>
          <MessageSquare size={14} strokeWidth={2.5} />
          {ticket.messages.length}
        </div>
      </div>
    </button>
  );
};
