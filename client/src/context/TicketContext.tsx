import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

export interface Message {
  id: string;
  sender: 'bot' | 'user' | 'agent';
  text: string;
  attachment?: string;
  isInternal?: boolean;
}

export interface Ticket {
  id: string;
  customerName: string;
  status: 'open' | 'pending' | 'on-hold' | 'resolved' | 'active';
  messages: Message[];
  escalatedAt: Date | string;
  summary?: string;
  tag?: string;
  userProfile?: {
    name: string;
    email: string;
    company: string;
  };
}

export interface Metrics {
  aiResolved: number;
  escalated: number;
  humanResolved: number;
  totalCsatScore: number;
  csatCount: number;
}

interface TicketContextType {
  tickets: Ticket[];
  socket: Socket | null;
  escalateTicket: (ticketId: string, customerName: string, chatHistory: Message[], userProfile: { name: string, email: string, company: string }) => void;
  sendAgentReply: (ticketId: string, message: Message) => void;
  resolveTicket: (ticketId: string) => void;
  joinTicketRoom: (ticketId: string) => void;
  joinAgentRoom: () => void;
  metrics: Metrics;
  markAiResolved: () => void;
  typingIndicators: Record<string, { user: boolean; agent: boolean }>;
  sendTypingStatus: (ticketId: string, isTyping: boolean, sender: 'user' | 'agent') => void;
  updateTicketStatus: (ticketId: string, status: Ticket['status']) => void;
  submitCsat: (rating: number, ticketId?: string) => void;
  agentOnlineCount: number;
}

const TicketContext = createContext<TicketContextType | undefined>(undefined);

const SOCKET_URL = 'http://localhost:5001';

export const TicketProvider = ({ children }: { children: ReactNode }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({ aiResolved: 0, escalated: 0, humanResolved: 0, totalCsatScore: 0, csatCount: 0 });
  const [typingIndicators, setTypingIndicators] = useState<Record<string, { user: boolean; agent: boolean }>>({});
  const [agentOnlineCount, setAgentOnlineCount] = useState(0);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    fetch(`${SOCKET_URL}/api/tickets/all`)
      .then(res => res.json())
      .then(data => setTickets(data))

    fetch(`${SOCKET_URL}/api/metrics`)
      .then(res => res.json())
      .then(data => setMetrics(data))

    newSocket.on('new_ticket', (ticket: Ticket) => {
      setTickets(prev => [...prev, ticket]);
    });

    newSocket.on('ticket_updated', (data: { ticketId: string, message: Message }) => {
      setTickets(prev => prev.map(t => {
        if (t.id === data.ticketId) {
          if (t.messages.find(m => m.id === data.message.id)) return t;
          return { ...t, messages: [...t.messages, data.message] };
        }
        return t;
      }));
    });

    newSocket.on('ticket_resolved', (ticketId: string) => {
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'resolved' } : t));
    });

    newSocket.on('ticket_status_updated', (data: { ticketId: string, status: Ticket['status'] }) => {
      setTickets(prev => prev.map(t => t.id === data.ticketId ? { ...t, status: data.status } : t));
    });

    newSocket.on('metrics_updated', (data: Metrics) => {
      setMetrics(data);
    });

    newSocket.on('typing_status', (data: { ticketId: string, sender: 'user' | 'agent', isTyping: boolean }) => {
      setTypingIndicators(prev => ({
        ...prev,
        [data.ticketId]: {
          ...(prev[data.ticketId] || { user: false, agent: false }),
          [data.sender]: data.isTyping
        }
      }));
    });

    newSocket.on('agent_online_count', (count: number) => {
      setAgentOnlineCount(count);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const escalateTicket = useCallback((ticketId: string, customerName: string, chatHistory: Message[], userProfile: { name: string, email: string, company: string }) => {
    if (socket) {
      socket.emit('escalate_ticket', { ticketId, customerName, chatHistory, userProfile });
      setTickets(prev => [
        ...prev,
        { id: ticketId, customerName, status: 'active', messages: chatHistory, escalatedAt: new Date(), userProfile }
      ]);
    }
  }, [socket]);

  const sendAgentReply = useCallback((ticketId: string, message: Message) => {
    if (socket) {
      socket.emit('agent_reply', { ticketId, message });
      setTickets(prev => prev.map(t => {
        if (t.id === ticketId) {
          if (t.messages.find(m => m.id === message.id)) return t;
          return { ...t, messages: [...t.messages, message] };
        }
        return t;
      }));
    }
  }, [socket]);

  const resolveTicket = useCallback((ticketId: string) => {
    if (socket) {
      socket.emit('resolve_ticket', ticketId);
    }
  }, [socket]);

  const updateTicketStatus = useCallback((ticketId: string, status: Ticket['status']) => {
    if (socket) {
      socket.emit('update_ticket_status', { ticketId, status });
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status } : t));
    }
  }, [socket]);

  const joinTicketRoom = useCallback((ticketId: string) => {
    if (socket) {
      socket.emit('customer_join_ticket', ticketId);
    }
  }, [socket]);

  const joinAgentRoom = useCallback(() => {
    if (socket) {
      socket.emit('agent_join');
    }
  }, [socket]);

  const markAiResolved = useCallback(() => {
    if (socket) {
      socket.emit('ai_resolved');
    }
  }, [socket]);

  const sendTypingStatus = useCallback((ticketId: string, isTyping: boolean, sender: 'user' | 'agent') => {
    if (socket) {
      socket.emit('typing_status', { ticketId, sender, isTyping });
    }
  }, [socket]);

  const submitCsat = useCallback((rating: number, ticketId?: string) => {
    if (socket) {
      socket.emit('submit_csat', { rating, ticketId });
    }
  }, [socket]);

  return (
    <TicketContext.Provider value={{ 
      tickets, socket, escalateTicket, sendAgentReply, resolveTicket, updateTicketStatus, joinTicketRoom, joinAgentRoom, metrics, markAiResolved,
      typingIndicators, sendTypingStatus, submitCsat, agentOnlineCount
    }}>
      {children}
    </TicketContext.Provider>
  );
};

export const useTickets = () => {
  const context = useContext(TicketContext);
  if (context === undefined) {
    throw new Error('useTickets must be used within a TicketProvider');
  }
  return context;
};
