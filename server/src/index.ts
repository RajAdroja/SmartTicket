import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import {
  connectDB, getActiveTickets, getAllTickets, addTicket, addMessageToTicket, resolveTicket,
  Message, getMetrics, incrementEscalated, incrementHumanResolved, incrementAiResolved,
  submitCsat, getKnowledgeBase, setKnowledgeBase, TicketModel
} from './store';
import { generateChatResponse, generateSummary, generateSmartReplies, generateTag } from './gemini';

dotenv.config();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

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
  const { messages, company } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }
  const { reply, suggestEscalation, suggestResolution } = await generateChatResponse(messages, company);
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

// 7. PDF upload → extract text → append to Knowledge Base
app.post('/api/kb/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Only PDF files are supported' });

    const data = await pdfParse(req.file.buffer);
    const extractedText = data.text.trim();

    if (!extractedText) return res.status(422).json({ error: 'Could not extract text from this PDF' });

    const targetCompany = req.body.company || 'global';
    
    // Append to existing KB (or replace — your choice; here we append with a separator)
    const existing = await getKnowledgeBase(targetCompany);
    const separator = existing ? '\n\n---\n\n' : '';
    const updated = `${existing}${separator}${extractedText}`;
    await setKnowledgeBase(updated, targetCompany);

    res.json({ success: true, pages: data.numpages, characters: extractedText.length, preview: extractedText.slice(0, 300) });
  } catch (err: any) {
    console.error('PDF parse error:', err);
    res.status(500).json({ error: 'Failed to parse PDF', detail: err.message });
  }
});

// WEBSOCKET EVENTS
let agentCount = 0;

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('agent_join', () => {
    socket.join('agents_room');
    agentCount++;
    io.emit('agent_online_count', agentCount); // broadcast to everyone (including customers)
    console.log(`Agent joined: ${socket.id} | Online agents: ${agentCount}`);
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
    const wasAgent = socket.rooms.has('agents_room');
    if (wasAgent) {
      agentCount = Math.max(0, agentCount - 1);
      io.emit('agent_online_count', agentCount);
      console.log(`Agent disconnected: ${socket.id} | Online agents: ${agentCount}`);
    } else {
      console.log(`User disconnected: ${socket.id}`);
    }
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
