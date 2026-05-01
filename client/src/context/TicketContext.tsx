import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Ticket, Metrics } from '@/lib/types';

interface TicketContextType {
  tickets: Ticket[];
  metrics: Metrics | null;
  activeTicket: Ticket | null;
  setActiveTicket: (ticket: Ticket | null) => void;
  isLoading: boolean;
}

const TicketContext = createContext<TicketContextType | undefined>(undefined);
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export const TicketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    const fetchData = async () => {
      try {
        const [ticketsRes, metricsRes] = await Promise.all([
          fetch(`${SOCKET_URL}/api/tickets`),
          fetch(`${SOCKET_URL}/api/metrics`)
        ]);
        setTickets(await ticketsRes.json());
        setMetrics(await metricsRes.json());
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();

    socket.on('connect', () => socket.emit('agent_join'));
    socket.on('new_ticket', (ticket: Ticket) => setTickets(prev => [ticket, ...prev]));
    socket.on('ticket_updated', ({ ticketId, message }) => {
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, messages: [...t.messages, message] } : t));
    });
    socket.on('metrics_updated', (newMetrics: Metrics) => setMetrics(newMetrics));
    return () => { socket.disconnect(); };
  }, []);

  return (
    <TicketContext.Provider value={{ tickets, metrics, activeTicket, setActiveTicket, isLoading }}>
      {children}
    </TicketContext.Provider>
  );
};

export const useTickets = () => {
  const context = useContext(TicketContext);
  if (!context) throw new Error('useTickets must be used within a TicketProvider');
  return context;
};
