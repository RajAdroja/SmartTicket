import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { z } from 'zod';
import {
  connectDB, getActiveTickets, getAllTickets, addTicket, addMessageToTicket, resolveTicket,
  updateTicketStatus, Message, getMetrics, incrementEscalated, incrementHumanResolved, incrementAiResolved,
  submitCsat, getKnowledgeBase, setKnowledgeBase, TicketModel, submitAiFeedback, getFeedbackAnalytics, assignTicketToAgent
} from './store';
import { generateChatResponse, generateSummary, generateSmartReplies, generateTag } from './gemini';
import { ChatApiResponseSchema, ChatDecisionSchema, DEFAULT_FEEDBACK_OPTIONS } from './ai-contract';

dotenv.config();

function flagEnabled(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

const CONFIDENCE_MODE = flagEnabled(process.env.CONFIDENCE_MODE, true);
const FEEDBACK_LOOP_ENABLED = flagEnabled(process.env.FEEDBACK_LOOP_ENABLED, true);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ChatMessageInputSchema = z.object({
  id: z.string(),
  sender: z.enum(['bot', 'user', 'agent']),
  text: z.string(),
  attachment: z.string().optional(),
  isInternal: z.boolean().optional(),
  createdAt: z.string().optional(),
});

/**
 * COMPANY TOKEN REGISTRY
 * Maps secret API tokens → company name.
 * In production this would live in a database/env, but for demonstration
 * we keep it in memory. Tokens are added when a company registers their KB.
 * Format: { "secret-token-abc123": "FlowMint", ... }
 */
const COMPANY_TOKEN_REGISTRY: Record<string, string> = {};

// Allow the registry to be seeded from environment variable:
// COMPANY_TOKENS=FlowMint:token123,AcmeCorp:token456
if (process.env.COMPANY_TOKENS) {
  process.env.COMPANY_TOKENS.split(',').forEach(pair => {
    const [company, token] = pair.split(':');
    if (company && token) COMPANY_TOKEN_REGISTRY[token.trim()] = company.trim();
  });
}

/**
 * Resolve the authorised company name from a chat request.
 * - If a companyToken is provided and valid → return its mapped company name.
 * - If a companyToken is provided but INVALID → return undefined (use global KB only).
 * - If no token is provided but a company name is → allow it (backward-compatible for direct/agent use).
 */
function resolveCompany(company?: string, companyToken?: string): string | undefined {
  if (companyToken) {
    const authorized = COMPANY_TOKEN_REGISTRY[companyToken];
    if (!authorized) {
      console.warn(`[KB Security] Rejected unknown companyToken; falling back to global KB.`);
      return undefined; // token provided but invalid → deny company KB
    }
    return authorized; // token is valid → use its company
  }
  return company; // no token → pass company name through (agent/direct use)
}

function findAgentNameById(agentId: string): string | null {
  const agent = Array.from(onlineAgents.values()).find((a) => a.agentId === agentId);
  return agent?.name ?? null;
}

/**
 * Calculate ticket count per agent (active tickets only)
 */
async function getAgentLoadMap(): Promise<Record<string, number>> {
  const tickets = await getActiveTickets();
  const loadMap: Record<string, number> = {};
  
  // Initialize all online agents with 0
  for (const agent of onlineAgents.values()) {
    loadMap[agent.agentId] = 0;
  }
  
  // Count active tickets per agent
  for (const ticket of tickets) {
    if (ticket.assignedAgentId) {
      loadMap[ticket.assignedAgentId] = (loadMap[ticket.assignedAgentId] ?? 0) + 1;
    }
  }
  
  return loadMap;
}

/**
 * Find the best available agent for auto-assignment
 * Strategy: Round-robin with load balancing
 * - Only consider agents with status = "available"
 * - Assign to agent with fewest active tickets
 * - Return null if no available agents
 */
async function findBestAvailableAgent(): Promise<{ agentId: string; name: string } | null> {
  const availableAgents = Array.from(onlineAgents.values()).filter(a => a.status === 'available');
  
  if (availableAgents.length === 0) {
    return null;
  }
  
  const loadMap = await getAgentLoadMap();
  
  // Sort by ticket count (ascending) to find least-loaded agent
  const sorted = availableAgents.sort((a, b) => {
    const loadA = loadMap[a.agentId] ?? 0;
    const loadB = loadMap[b.agentId] ?? 0;
    return loadA - loadB;
  });
  
  const best = sorted[0];
  return { agentId: best.agentId, name: best.name };
}

const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageInputSchema).min(1),
  company: z.string().optional(),
  companyToken: z.string().optional(), // secret token issued per company
});

const FeedbackRequestSchema = z.object({
  sessionId: z.string().min(1),
  ticketId: z.string().optional(),
  company: z.string().optional(),
  helpful: z.boolean(),
  reasons: z.array(z.string()).max(20).optional(),
  comment: z.string().max(2000).optional(),
  aiDecision: z.object({
    confidenceScore: z.number().int().min(0).max(100).optional(),
    confidenceLabel: z.enum(['high', 'medium', 'low']).optional(),
    escalationReason: z.string().optional(),
    recommendedAction: z.string().optional(),
  }).optional(),
});

const EscalateTicketPayloadSchema = z.object({
  ticketId: z.string().min(1),
  customerName: z.string().min(1),
  chatHistory: z.array(ChatMessageInputSchema),
  userProfile: z.object({
    name: z.string(),
    email: z.string(),
    company: z.string(),
  }),
  explainability: z.object({
    lastAiConfidenceScore: z.number().int().min(0).max(100).optional(),
    lastAiConfidenceLabel: z.enum(['high', 'medium', 'low']).optional(),
    escalationReason: z.enum(['none', 'missing_kb_info', 'sensitive_account_action', 'user_requested_human', 'frustration_detected', 'low_confidence']).optional(),
    escalationTriggerSource: z.enum(['user_request', 'confidence_rule', 'policy_rule', 'model_signal']).optional(),
  }).optional(),
});

const feedbackCooldown = new Map<string, number>();
const FEEDBACK_COOLDOWN_MS = 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.post('/api/chat', async (req, res) => {
  const parsedRequest = ChatRequestSchema.safeParse(req.body);
  if (!parsedRequest.success) {
    return res.status(400).json({
      error: 'Invalid chat request',
      issues: parsedRequest.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  const { messages, company, companyToken } = parsedRequest.data;
  const effectiveCompany = resolveCompany(company, companyToken);
  if (companyToken && !effectiveCompany) {
    console.warn(`[KB Security] Invalid companyToken rejected for company="${company}". Using global KB.`);
  }

  const { reply, suggestEscalation, suggestResolution, decision } = await generateChatResponse(messages, effectiveCompany);
  const lastUserText = [...messages].reverse().find((msg: any) => msg?.sender === 'user' && typeof msg?.text === 'string')?.text ?? '';

  // force escalation for low confidence and sensitive actions.
  const LOW_CONFIDENCE_THRESHOLD = 50;
  const userIntentEscalation = /human|agent|support|escalate|representative/i.test(lastUserText);
  const lowConfidenceEscalation = decision.confidenceScore < LOW_CONFIDENCE_THRESHOLD || decision.confidenceLabel === 'low';
  const sensitiveActionEscalation = decision.escalationReason === 'sensitive_account_action';
  const finalSuggestEscalation = CONFIDENCE_MODE
    ? suggestEscalation || lowConfidenceEscalation || sensitiveActionEscalation || userIntentEscalation
    : suggestEscalation;
  const finalSuggestResolution = CONFIDENCE_MODE
    ? (finalSuggestEscalation ? false : suggestResolution)
    : suggestResolution;

  const finalDecision = (() => {
    if (!CONFIDENCE_MODE) {
      return ChatDecisionSchema.parse({
        ...decision,
        recommendedAction: suggestEscalation ? 'auto_escalate' : 'continue_ai',
      });
    }
    let finalEscalationReason = decision.escalationReason;
    if (sensitiveActionEscalation) {
      finalEscalationReason = 'sensitive_account_action';
    } else if (userIntentEscalation) {
      finalEscalationReason = 'user_requested_human';
    } else if (lowConfidenceEscalation) {
      finalEscalationReason = 'low_confidence';
    } else if (!finalSuggestEscalation) {
      finalEscalationReason = 'none';
    }
    return ChatDecisionSchema.parse({
      ...decision,
      escalationReason: finalEscalationReason,
      recommendedAction: finalSuggestEscalation
        ? 'auto_escalate'
        : decision.confidenceLabel === 'medium'
          ? 'offer_human'
          : 'continue_ai',
    });
  })();

  const payload = ChatApiResponseSchema.parse({
    reply,
    suggestEscalation: finalSuggestEscalation,
    suggestResolution: finalSuggestResolution,
    decision: finalDecision,
    feedbackOptions: DEFAULT_FEEDBACK_OPTIONS,
  });

  res.json(payload);
});

app.get('/api/tickets', async (req, res) => {
  res.json(await getActiveTickets());
});

app.get('/api/tickets/all', async (req, res) => {
  res.json(await getAllTickets());
});

app.get('/api/agents/load', async (req, res) => {
  const loadMap = await getAgentLoadMap();
  const agentsList = Array.from(onlineAgents.values()).map(agent => ({
    agentId: agent.agentId,
    name: agent.name,
    status: agent.status,
    ticketCount: loadMap[agent.agentId] ?? 0,
  }));
  res.json({ agents: agentsList });
});

app.get('/api/metrics', async (req, res) => {
  res.json(await getMetrics());
});

app.post('/api/feedback', async (req, res) => {
  if (!FEEDBACK_LOOP_ENABLED) {
    return res.status(503).json({ error: 'Feedback loop is disabled' });
  }
  const parsedRequest = FeedbackRequestSchema.safeParse(req.body);
  if (!parsedRequest.success) {
    return res.status(400).json({
      error: 'Invalid feedback request',
      issues: parsedRequest.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  const { sessionId, ticketId, company, helpful, reasons, comment, aiDecision } = parsedRequest.data;

  const now = Date.now();
  const feedbackKey = `${sessionId}:${req.ip ?? 'unknown'}`;
  const lastSubmissionAt = feedbackCooldown.get(feedbackKey) ?? 0;
  if (now - lastSubmissionAt < FEEDBACK_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Feedback submitted too quickly. Please wait a few seconds.' });
  }
  feedbackCooldown.set(feedbackKey, now);

  const result = await submitAiFeedback({
    sessionId,
    ticketId,
    company,
    helpful,
    reasons,
    comment,
    aiDecision,
  });

  if (result.duplicate) {
    return res.status(409).json({ error: 'Feedback already submitted for this session' });
  }

  res.json({ success: true });
});

app.get('/api/metrics/feedback', async (_req, res) => {
  if (!FEEDBACK_LOOP_ENABLED) {
    return res.status(503).json({ error: 'Feedback loop is disabled' });
  }
  res.json(await getFeedbackAnalytics());
});

app.get('/api/feature-flags', (_req, res) => {
  res.json({
    confidenceMode: CONFIDENCE_MODE,
    feedbackLoopEnabled: FEEDBACK_LOOP_ENABLED,
  });
});

app.post('/api/suggest-replies', async (req, res) => {
  const { ticketId } = req.body;
  const ticket = await TicketModel.findOne({ id: ticketId }).lean();
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }
  const suggestions = await generateSmartReplies((ticket as any).messages);
  res.json({ suggestions });
});

app.get('/api/kb', async (req, res) => {
  const company = req.query.company as string || 'global';
  res.json({ kb: await getKnowledgeBase(company) });
});

app.post('/api/kb', async (req, res) => {
  const { kb, company } = req.body;
  const targetCompany = company || 'global';
  if (typeof kb === 'string') {
    await setKnowledgeBase(kb, targetCompany);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid format' });
  }
});

/**
 * POST /api/company/register
 * Issues a secret API token for a company, enabling secure KB access from their widget.
 * Body: { company: string }
 * Returns: { company, token }
 */
app.post('/api/company/register', (req, res) => {
  const { company } = req.body;
  if (!company || typeof company !== 'string') {
    return res.status(400).json({ error: 'company name is required' });
  }
  // Check if already registered — return existing token
  const existing = Object.entries(COMPANY_TOKEN_REGISTRY).find(([, c]) => c === company);
  if (existing) {
    return res.json({ company, token: existing[0], existing: true });
  }
  // Generate a new cryptographically random token
  const token = `smt_${company.toLowerCase().replace(/\s+/g, '_')}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  COMPANY_TOKEN_REGISTRY[token] = company;
  console.log(`[KB Security] Registered company "${company}" with token ${token}`);
  res.json({ company, token, existing: false });
});

/**
 * GET /api/company/tokens
 * Lists all registered companies (tokens are hidden for security).
 */
app.get('/api/company/tokens', (_req, res) => {
  const companies = Object.values(COMPANY_TOKEN_REGISTRY);
  res.json({ companies });
});

app.post('/api/kb/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Only PDF files are supported' });

    const data = await pdfParse(req.file.buffer);
    const extractedText = data.text.trim();

    if (!extractedText) return res.status(422).json({ error: 'Could not extract text from this PDF' });

    const targetCompany = req.body.company || 'global';
    
    const existing = await getKnowledgeBase(targetCompany);
    const separator = existing ? '\n\n---\n\n' : '';
    const updated = `${existing}${separator}${extractedText}`;
    await setKnowledgeBase(updated, targetCompany);

    res.json({ success: true, pages: data.numpages, characters: extractedText.length, preview: extractedText.slice(0, 300) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to parse PDF', detail: err.message });
  }
});

let agentCount = 0;

// Track online agents: socketId -> { agentId, name, status }
const onlineAgents = new Map<string, { agentId: string; name: string; status: 'available' | 'busy' | 'away' }>();

// Track active typing: socketId -> { ticketId, sender }
const activeTyping = new Map<string, { ticketId: string; sender: 'user' | 'agent' }>();

io.on('connection', (socket) => {

  socket.on('agent_join', (payload?: { agentId?: string; name?: string }) => {
    socket.join('agents_room');
    agentCount++;

    const agentId = payload?.agentId || socket.id;
    const name = payload?.name || `Agent ${agentCount}`;
    onlineAgents.set(socket.id, { agentId, name, status: 'available' });

    io.emit('agent_online_count', agentCount);
    // Broadcast updated agent list to all agents (including the one who just joined)
    io.to('agents_room').emit('online_agents', Array.from(onlineAgents.values()));
  });

  // Allow any agent to request the current list at any time
  socket.on('get_online_agents', () => {
    socket.emit('online_agents', Array.from(onlineAgents.values()));
  });

  // Handle agent status change
  socket.on('set_agent_status', (status: 'available' | 'busy' | 'away') => {
    const agent = onlineAgents.get(socket.id);
    if (agent) {
      agent.status = status;
      // Broadcast updated agent list to all agents
      io.to('agents_room').emit('online_agents', Array.from(onlineAgents.values()));
    }
  });

  socket.on('transfer_ticket', async (data: { ticketId: string; toAgentId: string; note?: string; fromAgentName?: string }) => {
    const { ticketId, toAgentId, note, fromAgentName } = data;

    const toAgentName = findAgentNameById(toAgentId) || 'Agent';

    // Add a system message to the ticket thread so the history shows the transfer
    const transferMsg: Message = {
      id: `transfer-${Date.now()}`,
      sender: 'bot',
      text: `🔄 Ticket transferred${fromAgentName ? ` from ${fromAgentName}` : ''}${note ? `. Note: ${note}` : ''}.`,
      isInternal: true,
    };
    await addMessageToTicket(ticketId, transferMsg);
    await TicketModel.updateOne({ id: ticketId }, { assignedAgentId: toAgentId, assignedAgentName: toAgentName });

    // Notify all agents — the target agent will highlight it
    io.to('agents_room').emit('ticket_transferred', {
      ticketId,
      toAgentId,
      toAgentName,
      fromAgentName: fromAgentName || 'An agent',
      note: note || '',
      message: transferMsg,
    });

    const ticket = await TicketModel.findOne({ id: ticketId }).lean();
    if (ticket) {
      io.to('agents_room').emit('ticket_assigned', { ticket });
      io.to(ticketId).emit('ticket_assigned', { ticket });
    }

    // Also push the message update so the thread stays in sync
    io.to('agents_room').emit('ticket_updated', { ticketId, message: transferMsg });
    io.to(ticketId).emit('ticket_updated', { ticketId, message: transferMsg });
  });

  socket.on('assign_ticket', async (data: { ticketId: string; agentId: string; agentName: string }) => {
    const parsed = z.object({
      ticketId: z.string().min(1),
      agentId: z.string().min(1),
      agentName: z.string().min(1),
    }).safeParse(data);

    if (!parsed.success) {
      socket.emit('ticket_error', { error: 'Invalid assign payload' });
      return;
    }

    const { ticketId, agentId, agentName } = parsed.data;
    const updated = await TicketModel.findOneAndUpdate(
      { id: ticketId },
      { assignedAgentId: agentId, assignedAgentName: agentName },
      { new: true }
    ).lean();

    if (!updated) {
      socket.emit('ticket_error', { error: 'Ticket not found' });
      return;
    }

    io.to('agents_room').emit('ticket_assigned', { ticket: updated });
    io.to(ticketId).emit('ticket_assigned', { ticket: updated });
  });

  socket.on('escalate_ticket', async (data: {
    ticketId: string,
    customerName: string,
    chatHistory: Message[],
    userProfile: { name: string, email: string, company: string },
    explainability?: {
      lastAiConfidenceScore?: number;
      lastAiConfidenceLabel?: 'high' | 'medium' | 'low';
      escalationReason?: 'none' | 'missing_kb_info' | 'sensitive_account_action' | 'user_requested_human' | 'frustration_detected' | 'low_confidence';
      escalationTriggerSource?: 'user_request' | 'confidence_rule' | 'policy_rule' | 'model_signal';
    }
  }) => {
    const parsedPayload = EscalateTicketPayloadSchema.safeParse(data);
    if (!parsedPayload.success) {
      socket.emit('ticket_error', { error: 'Invalid escalate payload' });
      return;
    }
    const { ticketId, customerName, chatHistory, userProfile, explainability } = parsedPayload.data;
    socket.join(ticketId);

    const [summary, tag] = await Promise.all([
      generateSummary(chatHistory),
      generateTag(chatHistory)
    ]);

    // Try to auto-assign to best available agent
    const bestAgent = await findBestAvailableAgent();

    const newTicket = {
      id: ticketId,
      customerName,
      status: 'open' as const,
      messages: chatHistory,
      escalatedAt: new Date(),
      summary,
      tag,
      userProfile,
      assignedAgentId: bestAgent?.agentId,
      assignedAgentName: bestAgent?.name,
      autoAssignedAt: bestAgent ? new Date() : undefined,
      lastAiConfidenceScore: explainability?.lastAiConfidenceScore,
      lastAiConfidenceLabel: explainability?.lastAiConfidenceLabel,
      escalationReason: explainability?.escalationReason || 'none',
      escalationTriggerSource: explainability?.escalationTriggerSource || 'model_signal',
    };

    await addTicket(newTicket);
    await incrementEscalated();

    const metrics = await getMetrics();
    io.to('agents_room').emit('new_ticket', newTicket);
    io.to('agents_room').emit('metrics_updated', metrics);
    
    // Notify the assigned agent if auto-assigned
    if (bestAgent) {
      io.to('agents_room').emit('ticket_auto_assigned', {
        ticketId,
        agentId: bestAgent.agentId,
        agentName: bestAgent.name,
        customerName,
      });
    }
  });

  socket.on('agent_reply', async (data: { ticketId: string, message: Message }) => {
    const { ticketId, message } = data;
    const added = await addMessageToTicket(ticketId, message);
    if (added) {
      io.to(ticketId).emit('ticket_updated', { ticketId, message });
      io.to('agents_room').emit('ticket_updated', { ticketId, message });
    }
  });

  socket.on('customer_join_ticket', (ticketId: string) => {
    socket.join(ticketId);
  });

  socket.on('resolve_ticket', async (ticketId: string) => {
    const resolved = await resolveTicket(ticketId);
    if (resolved) {
      await incrementHumanResolved();
      const metrics = await getMetrics();
      io.to('agents_room').emit('ticket_resolved', ticketId);
      io.to('agents_room').emit('metrics_updated', metrics);
      io.to(ticketId).emit('ticket_resolved', ticketId);
    }
  });

  socket.on('update_ticket_status', async (data: { ticketId: string, status: 'open' | 'pending' | 'on-hold' | 'resolved' | 'active' }) => {
    const updated = await updateTicketStatus(data.ticketId, data.status);
    if (updated) {
      io.to(data.ticketId).emit('ticket_status_updated', data);
      io.to('agents_room').emit('ticket_status_updated', data);
    }
  });

  socket.on('ai_resolved', async () => {
    await incrementAiResolved();
    const metrics = await getMetrics();
    io.to('agents_room').emit('metrics_updated', metrics);
  });

  socket.on('typing_status', (data: { ticketId: string, sender: 'user' | 'agent', isTyping: boolean }) => {
    if (data.isTyping) {
      activeTyping.set(socket.id, { ticketId: data.ticketId, sender: data.sender });
    } else {
      activeTyping.delete(socket.id);
    }
    io.to(data.ticketId).emit('typing_status', data);
    io.to('agents_room').emit('typing_status', data);
  });

  socket.on('submit_csat', async (data: { ticketId?: string, rating: number }) => {
    await submitCsat(data.rating);
    const metrics = await getMetrics();
    io.to('agents_room').emit('metrics_updated', metrics);
  });

  socket.on('disconnect', () => {
    // Clear any active typing indicator for this socket
    const typing = activeTyping.get(socket.id);
    if (typing) {
      activeTyping.delete(socket.id);
      const clearEvent = { ticketId: typing.ticketId, sender: typing.sender, isTyping: false };
      io.to(typing.ticketId).emit('typing_status', clearEvent);
      io.to('agents_room').emit('typing_status', clearEvent);
    }

    const wasAgent = onlineAgents.has(socket.id);
    if (wasAgent) {
      onlineAgents.delete(socket.id);
      agentCount = Math.max(0, agentCount - 1);
      io.emit('agent_online_count', agentCount);
      io.to('agents_room').emit('online_agents', Array.from(onlineAgents.values()));
    }
  });
});

const PORT = process.env.PORT || 5001;

connectDB().then(() => {
  server.listen(PORT, () => {
  });
}).catch((err) => {
  process.exit(1);
});
