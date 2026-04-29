import mongoose, { Schema, Document } from 'mongoose';
import dotenv from 'dotenv';
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
  messages: Message[];
  escalatedAt: Date;
  summary?: string;
  tag?: string;
  userProfile?: {
    name: string;
    email: string;
    company: string;
  };
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
  messages: [MessageSchema],
  escalatedAt: { type: Date, default: Date.now },
  summary: String,
  tag: String,
  userProfile: {
    name: String,
    email: String,
    company: String
  }
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
