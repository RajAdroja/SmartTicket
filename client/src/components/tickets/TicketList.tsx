import React from 'react';
import { TicketCard } from './TicketCard';
import { useTickets } from '@/context/TicketContext';

export const TicketList = () => {
  const { tickets, activeTicket, setActiveTicket } = useTickets();

  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-20 h-20 bg-slate-100 rounded-[2rem] flex items-center justify-center text-slate-300">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-400 rounded-full animate-spin" />
        </div>
        <div>
          <p className="text-slate-900 font-bold">Waiting for tickets...</p>
          <p className="text-slate-400 text-sm">Everything is quiet in the queue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {tickets.map((ticket) => (
        <TicketCard
          key={ticket.id}
          ticket={ticket}
          isActive={activeTicket?.id === ticket.id}
          onClick={() => setActiveTicket(ticket)}
        />
      ))}
    </div>
  );
};
