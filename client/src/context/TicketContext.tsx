import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

export interface Message {
  id: string;
  sender: 'bot' | 'user' | 'agent';
  text: string;
  attachment?: string;
  isInternal?: boolean;
  createdAt?: string;
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
  lastAiConfidenceScore?: number;
  lastAiConfidenceLabel?: 'high' | 'medium' | 'low';
  escalationReason?: 'none' | 'missing_kb_info' | 'sensitive_account_action' | 'user_requested_human' | 'frustration_detected' | 'low_confidence';
  escalationTriggerSource?: 'user_request' | 'confidence_rule' | 'policy_rule' | 'model_signal';
}

export interface EscalationExplainability {
  lastAiConfidenceScore?: number;
  lastAiConfidenceLabel?: 'high' | 'medium' | 'low';
  escalationReason?: 'none' | 'missing_kb_info' | 'sensitive_account_action' | 'user_requested_human' | 'frustration_detected' | 'low_confidence';
  escalationTriggerSource?: 'user_request' | 'confidence_rule' | 'policy_rule' | 'model_signal';
}

export interface Metrics {
  aiResolved: number;
  escalated: number;
  humanResolved: number;
  totalCsatScore: number;
  csatCount: number;
}

export interface OnlineAgent {
  agentId: string;
  name: string;
  status: 'available' | 'busy' | 'away';
}

export interface TransferNotification {
  ticketId: string;
  fromAgentName: string;
  note: string;
}

interface TicketContextType {
  tickets: Ticket[];
  socket: Socket | null;
  agentId: string;
  agentStatus: 'available' | 'busy' | 'away';
  setAgentStatus: (status: 'available' | 'busy' | 'away') => void;
  onlineAgents: OnlineAgent[];
  transferNotification: TransferNotification | null;
  clearTransferNotification: () => void;
  escalateTicket: (ticketId: string, customerName: string, chatHistory: Message[], userProfile: { name: string, email: string, company: string }, explainability?: EscalationExplainability) => void;
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
  transferTicket: (ticketId: string, toAgentId: string, note: string) => void;
}

const TicketContext = createContext<TicketContextType | undefined>(undefined);

const SOCKET_URL = 'http://localhost:5001';

// Generate a unique agent ID per socket connection (unique per tab/session)
// We use a module-level variable so it's stable for the lifetime of this page load
// but different across tabs (unlike sessionStorage which is shared between same-origin tabs)
const AGENT_ID = `agent-${Math.random().toString(36).slice(2, 10)}`;
const AGENT_NAME = `Agent ${AGENT_ID.slice(-4)}`;

export const TicketProvider = ({ children }: { children: ReactNode }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({ aiResolved: 0, escalated: 0, humanResolved: 0, totalCsatScore: 0, csatCount: 0 });
  const [typingIndicators, setTypingIndicators] = useState<Record<string, { user: boolean; agent: boolean }>>({});
  const [agentOnlineCount, setAgentOnlineCount] = useState(0);
  const [onlineAgents, setOnlineAgents] = useState<OnlineAgent[]>([]);
  const [transferNotification, setTransferNotification] = useState<TransferNotification | null>(null);
  const [agentStatus, setAgentStatusLocal] = useState<'available' | 'busy' | 'away'>('available');
  const agentId = AGENT_ID;

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

    newSocket.on('online_agents', (agents: OnlineAgent[]) => {
      setOnlineAgents(agents);
    });

    newSocket.on('ticket_transferred', (data: { ticketId: string; toAgentId: string; fromAgentName: string; note: string }) => {
      if (data.toAgentId === agentId) {
        setTransferNotification({ ticketId: data.ticketId, fromAgentName: data.fromAgentName, note: data.note });
      }
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const escalateTicket = useCallback((ticketId: string, customerName: string, chatHistory: Message[], userProfile: { name: string, email: string, company: string }, explainability?: EscalationExplainability) => {
    if (socket) {
      socket.emit('escalate_ticket', { ticketId, customerName, chatHistory, userProfile, explainability });
      setTickets(prev => [
        ...prev,
        {
          id: ticketId,
          customerName,
          status: 'active',
          messages: chatHistory,
          escalatedAt: new Date(),
          userProfile,
          lastAiConfidenceScore: explainability?.lastAiConfidenceScore,
          lastAiConfidenceLabel: explainability?.lastAiConfidenceLabel,
          escalationReason: explainability?.escalationReason,
          escalationTriggerSource: explainability?.escalationTriggerSource,
        }
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
      socket.emit('agent_join', { agentId: AGENT_ID, name: AGENT_NAME });
      // Also request the current list immediately so we don't wait for the next join event
      socket.emit('get_online_agents');
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

  const transferTicket = useCallback((ticketId: string, toAgentId: string, note: string) => {
    if (socket) {
      socket.emit('transfer_ticket', { ticketId, toAgentId, note, fromAgentName: AGENT_NAME });
    }
  }, [socket]);

  const clearTransferNotification = useCallback(() => {
    setTransferNotification(null);
  }, []);

  const setAgentStatus = useCallback((status: 'available' | 'busy' | 'away') => {
    setAgentStatusLocal(status);
    if (socket) {
      socket.emit('set_agent_status', status);
    }
  }, [socket]);

  return (
    <TicketContext.Provider value={{ 
      tickets, socket, agentId, agentStatus, setAgentStatus, onlineAgents, transferNotification, clearTransferNotification,
      escalateTicket, sendAgentReply, resolveTicket, updateTicketStatus, joinTicketRoom, joinAgentRoom, metrics, markAiResolved,
      typingIndicators, sendTypingStatus, submitCsat, agentOnlineCount, transferTicket
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
