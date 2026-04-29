import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import {
  connectDB, getActiveTickets, getAllTickets, addTicket, addMessageToTicket, resolveTicket,
  updateTicketStatus, Message, getMetrics, incrementEscalated, incrementHumanResolved, incrementAiResolved,
  submitCsat, getKnowledgeBase, setKnowledgeBase, TicketModel, submitAiFeedback, getFeedbackAnalytics
} from './store';
import { generateChatResponse, generateSummary, generateSmartReplies, generateTag } from './gemini';
import { ChatApiResponseSchema, ChatDecisionSchema, DEFAULT_FEEDBACK_OPTIONS } from './ai-contract';

dotenv.config();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.post('/api/chat', async (req, res) => {
  const { messages, company } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  const { reply, suggestEscalation, suggestResolution, decision } = await generateChatResponse(messages, company);
  const lastUserText = [...messages].reverse().find((msg: any) => msg?.sender === 'user' && typeof msg?.text === 'string')?.text ?? '';

  // force escalation for low confidence and sensitive actions.
  const LOW_CONFIDENCE_THRESHOLD = 50;
  const userIntentEscalation = /human|agent|support|escalate|representative/i.test(lastUserText);
  const lowConfidenceEscalation = decision.confidenceScore < LOW_CONFIDENCE_THRESHOLD || decision.confidenceLabel === 'low';
  const sensitiveActionEscalation = decision.escalationReason === 'sensitive_account_action';
  const finalSuggestEscalation = suggestEscalation || lowConfidenceEscalation || sensitiveActionEscalation || userIntentEscalation;
  const finalSuggestResolution = finalSuggestEscalation ? false : suggestResolution;

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

  const finalDecision = ChatDecisionSchema.parse({
    ...decision,
    escalationReason: finalEscalationReason,
    recommendedAction: finalSuggestEscalation
      ? 'auto_escalate'
      : decision.confidenceLabel === 'medium'
        ? 'offer_human'
        : 'continue_ai',
  });

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

app.get('/api/metrics', async (req, res) => {
  res.json(await getMetrics());
});

app.post('/api/feedback', async (req, res) => {
  const { sessionId, ticketId, company, helpful, reasons, comment, aiDecision } = req.body ?? {};
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (typeof helpful !== 'boolean') {
    return res.status(400).json({ error: 'helpful must be boolean' });
  }
  if (reasons && !Array.isArray(reasons)) {
    return res.status(400).json({ error: 'reasons must be an array when provided' });
  }
  if (comment && typeof comment !== 'string') {
    return res.status(400).json({ error: 'comment must be a string when provided' });
  }

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
  res.json(await getFeedbackAnalytics());
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

    // Add a system message to the ticket thread so the history shows the transfer
    const transferMsg: Message = {
      id: `transfer-${Date.now()}`,
      sender: 'bot',
      text: `🔄 Ticket transferred${fromAgentName ? ` from ${fromAgentName}` : ''}${note ? `. Note: ${note}` : ''}.`,
      isInternal: true,
    };
    await addMessageToTicket(ticketId, transferMsg);

    // Notify all agents — the target agent will highlight it
    io.to('agents_room').emit('ticket_transferred', {
      ticketId,
      toAgentId,
      fromAgentName: fromAgentName || 'An agent',
      note: note || '',
      message: transferMsg,
    });

    // Also push the message update so the thread stays in sync
    io.to('agents_room').emit('ticket_updated', { ticketId, message: transferMsg });
    io.to(ticketId).emit('ticket_updated', { ticketId, message: transferMsg });
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
    const { ticketId, customerName, chatHistory, userProfile, explainability } = data;
    socket.join(ticketId);

    const [summary, tag] = await Promise.all([
      generateSummary(chatHistory),
      generateTag(chatHistory)
    ]);

    const newTicket = {
      id: ticketId,
      customerName,
      status: 'open' as const,
      messages: chatHistory,
      escalatedAt: new Date(),
      summary,
      tag,
      userProfile,
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
