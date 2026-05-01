import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Ticket } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Clock, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TicketCardProps {
  ticket: Ticket;
  isActive?: boolean;
  onClick?: () => void;
}

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
        'w-full text-left p-5 rounded-[1.5rem] border transition-all duration-300 group',
        isActive 
          ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-600/20 translate-x-1' 
          : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-md'
      )}
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className={cn(
          'font-bold truncate pr-2',
          isActive ? 'text-white' : 'text-slate-900'
        )}>
          {ticket.customerName}
        </h3>
        <Badge variant={priorityVariants[ticket.priority]}>
          {ticket.priority}
        </Badge>
      </div>

      <p className={cn(
        'text-sm line-clamp-2 mb-4',
        isActive ? 'text-blue-100' : 'text-slate-500'
      )}>
        {lastMessage}
      </p>

      <div className="flex items-center gap-4">
        <div className={cn(
          'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider',
          isActive ? 'text-blue-200' : 'text-slate-400'
        )}>
          <Clock size={12} />
          {formatDistanceToNow(new Date(ticket.escalatedAt))} ago
        </div>
        <div className={cn(
          'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider',
          isActive ? 'text-blue-200' : 'text-slate-400'
        )}>
          <MessageSquare size={12} />
          {ticket.messages.length} messages
        </div>
      </div>
    </button>
  );
};
