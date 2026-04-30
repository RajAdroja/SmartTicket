import mongoose, { Schema, Document } from 'mongoose';
import dotenv from 'dotenv';
import type { ConfidenceLabel, EscalationReason } from './ai-contract';
dotenv.config();

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
  priority: 'urgent' | 'high' | 'normal' | 'low';
  messages: Message[];
  escalatedAt: Date;
  summary?: string;
  tag?: string;
  userProfile?: {
    name: string;
    email: string;
    company: string;
  };
  assignedAgentId?: string;
  assignedAgentName?: string;
  autoAssignedAt?: Date;
  lastAiConfidenceScore?: number;
  lastAiConfidenceLabel?: ConfidenceLabel;
  escalationReason?: EscalationReason;
  escalationTriggerSource?: 'user_request' | 'confidence_rule' | 'policy_rule' | 'model_signal';
  createdAt?: Date;
  updatedAt?: Date;
}

const MessageSchema = new Schema<Message>({
  id: String,
  sender: { type: String, enum: ['bot', 'user', 'agent'] },
  text: String,
  attachment: String,
  isInternal: { type: Boolean, default: false },
  createdAt: String,
}, { _id: false });

const TicketSchema = new Schema<Ticket>({
  id: { type: String, required: true, unique: true },
  customerName: String,
  status: { type: String, enum: ['open', 'pending', 'on-hold', 'resolved', 'active'], default: 'open' },
  priority: { type: String, enum: ['urgent', 'high', 'normal', 'low'], default: 'normal' },
  messages: [MessageSchema],
  escalatedAt: { type: Date, default: Date.now },
  summary: String,
  tag: String,
  userProfile: {
    name: String,
    email: String,
    company: String
  },
  assignedAgentId: { type: String, default: null },
  assignedAgentName: { type: String, default: null },
  autoAssignedAt: { type: Date, default: null },
  lastAiConfidenceScore: { type: Number, default: null },
  lastAiConfidenceLabel: { type: String, enum: ['high', 'medium', 'low'], default: null },
  escalationReason: {
    type: String,
    enum: ['none', 'missing_kb_info', 'sensitive_account_action', 'user_requested_human', 'frustration_detected', 'low_confidence'],
    default: 'none',
  },
  escalationTriggerSource: {
    type: String,
    enum: ['user_request', 'confidence_rule', 'policy_rule', 'model_signal'],
    default: 'model_signal',
  },
}, { timestamps: true });

const MetricsSchema = new Schema({
  _id: { type: String, default: 'global' },
  aiResolved: { type: Number, default: 0 },
  escalated: { type: Number, default: 0 },
  humanResolved: { type: Number, default: 0 },
  totalCsatScore: { type: Number, default: 0 },
  csatCount: { type: Number, default: 0 }
});

const KbSchema = new Schema({
  _id: { type: String, default: 'global' },
  content: {
    type: String,
    default: 'AcmeCorp is a B2B SaaS company that provides project management tools. Pricing is $10/mo for Pro and $50/mo for Enterprise. Support hours are 9AM-5PM EST.'
  }
});

export const TicketModel = mongoose.model('Ticket', TicketSchema);
export const MetricsModel = mongoose.model('Metrics', MetricsSchema);
export const KbModel = mongoose.model('Kb', KbSchema);

const CannedResponseSchema = new Schema({
  agentId: { type: String, required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: String, default: 'General' },
  isFavorite: { type: Boolean, default: false },
  usageCount: { type: Number, default: 0 },
}, { timestamps: true });

export const CannedResponseModel = mongoose.model('CannedResponse', CannedResponseSchema);

const FeedbackSchema = new Schema({
  sessionId: { type: String, required: true, unique: true },
  ticketId: { type: String, default: null },
  company: { type: String, default: 'global' },
  helpful: { type: Boolean, required: true },
  reasons: { type: [String], default: [] },
  comment: { type: String, default: '' },
  aiDecision: {
    confidenceScore: Number,
    confidenceLabel: String,
    escalationReason: String,
    recommendedAction: String,
  },
}, { timestamps: true });

export const FeedbackModel = mongoose.model('Feedback', FeedbackSchema);

const MetricsSnapshotSchema = new Schema({
  date: { type: Date, required: true, index: true },
  aiResolved: { type: Number, default: 0 },
  escalated: { type: Number, default: 0 },
  humanResolved: { type: Number, default: 0 },
  totalCsatScore: { type: Number, default: 0 },
  csatCount: { type: Number, default: 0 },
  avgResolutionTimeMs: { type: Number, default: 0 },
}, { timestamps: true });

export const MetricsSnapshotModel = mongoose.model('MetricsSnapshot', MetricsSnapshotSchema);

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set in .env');
  await mongoose.connect(uri);
  await MetricsModel.findOneAndUpdate(
    { _id: 'global' }, {}, { upsert: true, new: true }
  );
  await KbModel.findOneAndUpdate(
    { _id: 'global' }, {}, { upsert: true, new: true }
  );
}

export const getActiveTickets = async (): Promise<Ticket[]> => {
  const docs = await TicketModel.find({ status: { $ne: 'resolved' } }).lean();
  return docs as unknown as Ticket[];
};

export const getAllTickets = async (): Promise<Ticket[]> => {
  const docs = await TicketModel.find().lean();
  return docs as unknown as Ticket[];
};

export const addTicket = async (ticket: Ticket) => {
  await TicketModel.create(ticket);
};

export const addMessageToTicket = async (ticketId: string, message: Message): Promise<boolean> => {
  const result = await TicketModel.updateOne(
    { id: ticketId },
    { $push: { messages: message } }
  );
  return result.modifiedCount > 0;
};

export const resolveTicket = async (ticketId: string): Promise<boolean> => {
  const result = await TicketModel.updateOne({ id: ticketId }, { status: 'resolved' });
  return result.modifiedCount > 0;
};

export const updateTicketStatus = async (ticketId: string, status: Ticket['status']): Promise<boolean> => {
  const result = await TicketModel.updateOne({ id: ticketId }, { status });
  return result.modifiedCount > 0;
};

export const assignTicketToAgent = async (ticketId: string, agentId: string, agentName: string, autoAssigned: boolean = false): Promise<Ticket | null> => {
  const result = await TicketModel.findOneAndUpdate(
    { id: ticketId },
    {
      assignedAgentId: agentId,
      assignedAgentName: agentName,
      ...(autoAssigned && { autoAssignedAt: new Date() })
    },
    { new: true }
  ).lean();
  return result as unknown as Ticket | null;
};

export const updateTicketPriority = async (ticketId: string, priority: Ticket['priority']): Promise<boolean> => {
  const result = await TicketModel.updateOne({ id: ticketId }, { priority });
  return result.modifiedCount > 0;
};

export const getMetrics = async () => {
  const m = await MetricsModel.findById('global').lean();
  return m || { aiResolved: 0, escalated: 0, humanResolved: 0, totalCsatScore: 0, csatCount: 0 };
};

export const incrementAiResolved = async () => {
  await MetricsModel.updateOne({ _id: 'global' }, { $inc: { aiResolved: 1 } }, { upsert: true });
};

export const incrementEscalated = async () => {
  await MetricsModel.updateOne({ _id: 'global' }, { $inc: { escalated: 1 } }, { upsert: true });
};

export const incrementHumanResolved = async () => {
  await MetricsModel.updateOne({ _id: 'global' }, { $inc: { humanResolved: 1 } }, { upsert: true });
};

export const submitCsat = async (rating: number) => {
  await MetricsModel.updateOne(
    { _id: 'global' },
    { $inc: { totalCsatScore: rating, csatCount: 1 } },
    { upsert: true }
  );
};

export const getKnowledgeBase = async (company: string = 'global'): Promise<string> => {
  const kb = await KbModel.findById(company).lean() as any;
  return kb?.content || '';
};

export const setKnowledgeBase = async (content: string, company: string = 'global') => {
  await KbModel.updateOne({ _id: company }, { content }, { upsert: true });
};

export const submitAiFeedback = async (payload: {
  sessionId: string;
  ticketId?: string;
  company?: string;
  helpful: boolean;
  reasons?: string[];
  comment?: string;
  aiDecision?: {
    confidenceScore?: number;
    confidenceLabel?: string;
    escalationReason?: string;
    recommendedAction?: string;
  };
}) => {
  try {
    const doc = await FeedbackModel.create({
      sessionId: payload.sessionId,
      ticketId: payload.ticketId || null,
      company: payload.company || 'global',
      helpful: payload.helpful,
      reasons: payload.reasons || [],
      comment: payload.comment || '',
      aiDecision: payload.aiDecision || {},
    });
    return { ok: true as const, duplicate: false as const, doc };
  } catch (error: any) {
    if (error?.code === 11000) {
      return { ok: false as const, duplicate: true as const };
    }
    throw error;
  }
};

export const getExplainabilityMetrics = async () => {
  const docs = await TicketModel.find(
    {},
    { lastAiConfidenceLabel: 1, escalationReason: 1, escalationTriggerSource: 1 }
  ).lean() as Array<{
    lastAiConfidenceLabel?: ConfidenceLabel | null;
    escalationReason?: EscalationReason | null;
    escalationTriggerSource?: 'user_request' | 'confidence_rule' | 'policy_rule' | 'model_signal' | null;
  }>;

  const confidenceDistribution = { high: 0, medium: 0, low: 0, unknown: 0 };
  const escalationReasonCounts: Record<string, number> = {};
  const triggerSourceCounts: Record<string, number> = {};

  for (const doc of docs) {
    if (doc.lastAiConfidenceLabel === 'high') confidenceDistribution.high += 1;
    else if (doc.lastAiConfidenceLabel === 'medium') confidenceDistribution.medium += 1;
    else if (doc.lastAiConfidenceLabel === 'low') confidenceDistribution.low += 1;
    else confidenceDistribution.unknown += 1;

    const reason = doc.escalationReason || 'none';
    escalationReasonCounts[reason] = (escalationReasonCounts[reason] ?? 0) + 1;

    const trigger = doc.escalationTriggerSource || 'model_signal';
    triggerSourceCounts[trigger] = (triggerSourceCounts[trigger] ?? 0) + 1;
  }

  return {
    totalTickets: docs.length,
    confidenceDistribution,
    escalationReasonCounts,
    triggerSourceCounts,
  };
};

const KB_SUGGESTION_MAP: Record<string, string> = {
  incorrect_answer: 'Review and correct core troubleshooting answers in the knowledge base.',
  unclear_answer: 'Rewrite key answers with simpler language and step-by-step formatting.',
  missing_context: 'Add missing product/version and account-state context to common issue entries.',
  too_slow: 'Create concise quick-response snippets for high-frequency support questions.',
  needed_human_help: 'Document clearer escalation rules and boundary cases for AI handoff.',
};

export const getFeedbackAnalytics = async () => {
  const docs = await FeedbackModel.find(
    {},
    { helpful: 1, reasons: 1, aiDecision: 1 }
  ).lean() as Array<{
    helpful: boolean;
    reasons?: string[];
    aiDecision?: { confidenceLabel?: ConfidenceLabel };
  }>;

  const totalFeedback = docs.length;
  let helpfulCount = 0;
  let lowConfidenceTotal = 0;
  let lowConfidenceHelpfulCount = 0;
  const negativeReasonCounts: Record<string, number> = {};

  for (const doc of docs) {
    if (doc.helpful) helpfulCount += 1;

    if (doc.aiDecision?.confidenceLabel === 'low') {
      lowConfidenceTotal += 1;
      if (doc.helpful) lowConfidenceHelpfulCount += 1;
    }

    if (!doc.helpful) {
      for (const reason of doc.reasons ?? []) {
        negativeReasonCounts[reason] = (negativeReasonCounts[reason] ?? 0) + 1;
      }
    }
  }

  const helpfulRate = totalFeedback > 0 ? helpfulCount / totalFeedback : 0;
  const lowConfidenceHelpfulRate = lowConfidenceTotal > 0 ? lowConfidenceHelpfulCount / lowConfidenceTotal : 0;
  const topNegativeReasons = Object.entries(negativeReasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  const kbImprovementSuggestions = topNegativeReasons
    .map(({ reason, count }) => {
      const suggestion = KB_SUGGESTION_MAP[reason];
      if (!suggestion) return null;
      return { reason, count, suggestion };
    })
    .filter(Boolean);

  return {
    totalFeedback,
    helpfulCount,
    unhelpfulCount: totalFeedback - helpfulCount,
    helpfulRate,
    lowConfidenceSampleSize: lowConfidenceTotal,
    lowConfidenceHelpfulRate,
    topNegativeReasons,
    kbImprovementSuggestions,
  };
};

// Canned Responses CRUD

export const createCannedResponse = async (agentId: string, title: string, content: string, category: string = 'General') => {
  const response = await CannedResponseModel.create({
    agentId,
    title,
    content,
    category,
    isFavorite: false,
    usageCount: 0,
  });
  return response.toObject();
};

export const getCannedResponses = async (agentId: string, category?: string) => {
  const query: any = { agentId };
  if (category && category !== 'all') {
    query.category = category;
  }
  const responses = await CannedResponseModel.find(query)
    .sort({ isFavorite: -1, usageCount: -1, createdAt: -1 })
    .lean();
  return responses;
};

export const updateCannedResponse = async (id: string, updates: { title?: string; content?: string; category?: string; isFavorite?: boolean }) => {
  const response = await CannedResponseModel.findByIdAndUpdate(id, updates, { new: true }).lean();
  return response;
};

export const deleteCannedResponse = async (id: string) => {
  const result = await CannedResponseModel.deleteOne({ _id: id });
  return result.deletedCount > 0;
};

export const incrementCannedResponseUsage = async (id: string) => {
  const response = await CannedResponseModel.findByIdAndUpdate(
    id,
    { $inc: { usageCount: 1 } },
    { new: true }
  ).lean();
  return response;
};

// Time-Series Metrics

export const saveMetricsSnapshot = async (date: Date, metrics: any) => {
  const snapshot = await MetricsSnapshotModel.findOneAndUpdate(
    { date: new Date(date.toDateString()) },
    {
      date: new Date(date.toDateString()),
      aiResolved: metrics.aiResolved || 0,
      escalated: metrics.escalated || 0,
      humanResolved: metrics.humanResolved || 0,
      totalCsatScore: metrics.totalCsatScore || 0,
      csatCount: metrics.csatCount || 0,
      avgResolutionTimeMs: metrics.avgResolutionTimeMs || 0,
    },
    { upsert: true, new: true }
  ).lean();
  return snapshot;
};

export const getMetricsTimeSeries = async (days: number = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const snapshots = await MetricsSnapshotModel.find({
    date: { $gte: startDate }
  })
    .sort({ date: 1 })
    .lean();
  
  return snapshots;
};

export const calculateAverageResolutionTime = async () => {
  const resolved = await TicketModel.find({ status: 'resolved' })
    .select('escalatedAt updatedAt')
    .lean();
  
  if (resolved.length === 0) return 0;
  
  const totalMs = resolved.reduce((sum, ticket) => {
    const escalated = new Date(ticket.escalatedAt).getTime();
    const updated = ticket.updatedAt ? new Date(ticket.updatedAt).getTime() : new Date().getTime();
    return sum + (updated - escalated);
  }, 0);
  
  return Math.round(totalMs / resolved.length);
};
