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
  const { reply, suggestEscalation, suggestResolution } = await generateChatResponse(messages, company);
  res.json({ reply, suggestEscalation, suggestResolution });
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

io.on('connection', (socket) => {

  socket.on('agent_join', () => {
    socket.join('agents_room');
    agentCount++;
    io.emit('agent_online_count', agentCount);
  });

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

  socket.on('ai_resolved', async () => {
    await incrementAiResolved();
    const metrics = await getMetrics();
    io.to('agents_room').emit('metrics_updated', metrics);
  });

  socket.on('typing_status', (data: { ticketId: string, sender: 'user' | 'agent', isTyping: boolean }) => {
    io.to(data.ticketId).emit('typing_status', data);
    io.to('agents_room').emit('typing_status', data);
  });

  socket.on('submit_csat', async (data: { ticketId?: string, rating: number }) => {
    await submitCsat(data.rating);
    const metrics = await getMetrics();
    io.to('agents_room').emit('metrics_updated', metrics);
  });

  socket.on('disconnect', () => {
    const wasAgent = socket.rooms.has('agents_room');
    if (wasAgent) {
      agentCount = Math.max(0, agentCount - 1);
      io.emit('agent_online_count', agentCount);
    } else {
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
