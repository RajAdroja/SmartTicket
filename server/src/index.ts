import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  connectDB, getActiveTickets, getAllTickets, addTicket, addMessageToTicket, resolveTicket,
  Message, getMetrics, incrementEscalated, incrementHumanResolved, incrementAiResolved,
  submitCsat, getKnowledgeBase, setKnowledgeBase, TicketModel
} from './store';
import { generateChatResponse, generateSummary, generateSmartReplies, generateTag } from './gemini';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// REST ENDPOINTS

// 1. Chat endpoint for AI
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }
  const { reply, suggestEscalation, suggestResolution } = await generateChatResponse(messages);
  res.json({ reply, suggestEscalation, suggestResolution });
});

// 2. Fetch active queue for Agent Dashboard
app.get('/api/tickets', async (req, res) => {
  res.json(await getActiveTickets());
});

// 3. Fetch all tickets (for history)
app.get('/api/tickets/all', async (req, res) => {
  res.json(await getAllTickets());
});

// 4. Fetch metrics
app.get('/api/metrics', async (req, res) => {
  res.json(await getMetrics());
});

// 5. Suggest Smart Replies
app.post('/api/suggest-replies', async (req, res) => {
  const { ticketId } = req.body;
  const ticket = await TicketModel.findOne({ id: ticketId }).lean();
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }
  const suggestions = await generateSmartReplies((ticket as any).messages);
  res.json({ suggestions });
});

// 6. Knowledge Base endpoints
app.get('/api/kb', async (req, res) => {
  res.json({ kb: await getKnowledgeBase() });
});

app.post('/api/kb', async (req, res) => {
  const { kb } = req.body;
  if (typeof kb === 'string') {
    await setKnowledgeBase(kb);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid format' });
  }
});

// WEBSOCKET EVENTS
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('agent_join', () => {
    socket.join('agents_room');
    console.log(`Agent joined: ${socket.id}`);
  });

  // Customer escalates to human
  socket.on('escalate_ticket', async (data: { ticketId: string, customerName: string, chatHistory: Message[], userProfile: { name: string, email: string, company: string } }) => {
    const { ticketId, customerName, chatHistory, userProfile } = data;
    socket.join(ticketId);

    const [summary, tag] = await Promise.all([
      generateSummary(chatHistory),
      generateTag(chatHistory)
    ]);

    const newTicket = {
      id: ticketId,
      customerName,
      status: 'active' as const,
      messages: chatHistory,
      escalatedAt: new Date(),
      summary,
      tag,
      userProfile
    };

    await addTicket(newTicket);
    await incrementEscalated();

    const metrics = await getMetrics();
    io.to('agents_room').emit('new_ticket', newTicket);
    io.to('agents_room').emit('metrics_updated', metrics);
    console.log(`Ticket escalated: ${ticketId}`);
  });

  // Agent replies to a ticket
  socket.on('agent_reply', async (data: { ticketId: string, message: Message }) => {
    const { ticketId, message } = data;
    const added = await addMessageToTicket(ticketId, message);
    if (added) {
      io.to(ticketId).emit('ticket_updated', { ticketId, message });
      io.to('agents_room').emit('ticket_updated', { ticketId, message });
    }
  });

  // Customer joins their specific ticket room
  socket.on('customer_join_ticket', (ticketId: string) => {
    socket.join(ticketId);
    console.log(`Customer joined ticket room: ${ticketId}`);
  });

  // Agent resolves ticket
  socket.on('resolve_ticket', async (ticketId: string) => {
    const resolved = await resolveTicket(ticketId);
    if (resolved) {
      await incrementHumanResolved();
      const metrics = await getMetrics();
      io.to('agents_room').emit('ticket_resolved', ticketId);
      io.to('agents_room').emit('metrics_updated', metrics);
      io.to(ticketId).emit('ticket_resolved', ticketId);
      console.log(`Ticket resolved: ${ticketId}`);
    }
  });

  // AI resolves ticket
  socket.on('ai_resolved', async () => {
    await incrementAiResolved();
    const metrics = await getMetrics();
    io.to('agents_room').emit('metrics_updated', metrics);
    console.log('Ticket AI resolved');
  });

  // Typing Indicators
  socket.on('typing_status', (data: { ticketId: string, sender: 'user' | 'agent', isTyping: boolean }) => {
    io.to(data.ticketId).emit('typing_status', data);
    io.to('agents_room').emit('typing_status', data);
  });

  // CSAT Surveys
  socket.on('submit_csat', async (data: { ticketId?: string, rating: number }) => {
    await submitCsat(data.rating);
    const metrics = await getMetrics();
    io.to('agents_room').emit('metrics_updated', metrics);
    console.log(`CSAT received: ${data.rating}`);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5001;

// Connect to MongoDB first, then start server
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('❌ Failed to connect to MongoDB:', err);
  process.exit(1);
});
