export interface Message {
  id: string;
  sender: 'bot' | 'user' | 'agent';
  text: string;
  attachment?: string;
  isInternal?: boolean;
  createdAt?: string;
}

export type TicketStatus = 'open' | 'pending' | 'on-hold' | 'resolved' | 'active';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Ticket {
  id: string;
  customerName: string;
  status: TicketStatus;
  priority: TicketPriority;
  messages: Message[];
  escalatedAt: string;
  summary?: string;
  tag?: string;
  userProfile?: {
    name: string;
    email: string;
    company: string;
  };
  assignedAgentId?: string;
  assignedAgentName?: string;
  lastAiConfidenceScore?: number;
  lastAiConfidenceLabel?: 'high' | 'medium' | 'low';
  escalationReason?: string;
}

export interface Metrics {
  totalTickets: number;
  activeTickets: number;
  resolvedTickets: number;
  aiResolved: number;
  humanResolved: number;
  avgResolutionTimeMs: number;
}
