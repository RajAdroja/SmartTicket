import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, PhoneCall, Paperclip, Star } from 'lucide-react';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTickets, Message } from '../../context/TicketContext';

const API_URL = 'http://localhost:5001';

export default function ChatWidget() {
  const { escalateTicket, joinTicketRoom, sendAgentReply, tickets, markAiResolved, resolveTicket, sendTypingStatus, typingIndicators, submitCsat, agentOnlineCount } = useTickets();
  
  const loadInitialMessages = () => {
    const saved = localStorage.getItem('smartTicket_messages');
    if (saved) return JSON.parse(saved);
    return [{ id: '1', sender: 'bot', text: 'Hi there! I am the SmartTicket AI assistant. How can I help you today?' }];
  };

  const [isOpen, setIsOpen] = useState(() => localStorage.getItem('smartTicket_isOpen') === 'true');
  const [messages, setMessages] = useState<Message[]>(loadInitialMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(() => localStorage.getItem('smartTicket_ticketId'));
  const MOCK_CUSTOMER_COMPANY = 'Acme Corp';
  const [isResolved, setIsResolved] = useState(() => localStorage.getItem('smartTicket_isResolved') === 'true');
  const [hasSubmittedCsat, setHasSubmittedCsat] = useState(false);
  const [attachment, setAttachment] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevAgentMsgCountRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('smartTicket_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (ticketId) {
      localStorage.setItem('smartTicket_ticketId', ticketId);
    } else {
      localStorage.removeItem('smartTicket_ticketId');
    }
  }, [ticketId]);

  useEffect(() => {
    localStorage.setItem('smartTicket_isOpen', String(isOpen));
  }, [isOpen]);

  useEffect(() => {
    localStorage.setItem('smartTicket_isResolved', String(isResolved));
  }, [isResolved]);

  useEffect(() => {
    if (ticketId) {
      joinTicketRoom(ticketId);
    }
  }, [ticketId, joinTicketRoom]);

  useEffect(() => {
    if (ticketId) {
      const activeTicket = tickets.find(t => t.id === ticketId);
      if (activeTicket) {
        if (activeTicket.status === 'resolved' && !isResolved) {
          setIsResolved(true);
          const lastMsg = activeTicket.messages[activeTicket.messages.length - 1];
          if (!lastMsg || !lastMsg.text.includes('Chat ended by user')) {
            setMessages([
              ...activeTicket.messages,
              { id: Date.now().toString(), sender: 'bot', text: 'This ticket has been resolved by the agent.' }
            ]);
          } else {
            setMessages(activeTicket.messages);
          }
          return;
        }

        if (activeTicket.messages.length > messages.length) {
          setMessages(activeTicket.messages);
        }
      }
    }
  }, [tickets, ticketId, messages.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    if (ticketId) {
      const activeTicket = tickets.find(t => t.id === ticketId);
      if (activeTicket) {
        const agentMsgCount = activeTicket.messages.filter(m => m.sender === 'agent' && !m.isInternal).length;
        if (!isOpen && agentMsgCount > prevAgentMsgCountRef.current) {
          setUnreadCount(prev => prev + (agentMsgCount - prevAgentMsgCountRef.current));
        }
        prevAgentMsgCountRef.current = agentMsgCount;
      }
    }
  }, [tickets, ticketId, isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (ticketId) {
      sendTypingStatus(ticketId, true, 'user');
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingStatus(ticketId, false, 'user');
      }, 1500);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachment(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() && !attachment) return;

    const userMessage: Message = { 
      id: Date.now().toString(), 
      sender: 'user', 
      text: input.trim(),
      attachment: attachment || undefined
    };
    
    const newHistory = [...messages, userMessage];
    
    if (ticketId) {
      sendAgentReply(ticketId, userMessage);
      setInput('');
      setAttachment(null);
      sendTypingStatus(ticketId, false, 'user');
      return;
    }

    setMessages(newHistory);
    setInput('');
    setAttachment(null);
    setIsTyping(true);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory, company: MOCK_CUSTOMER_COMPANY })
      });
      const data = await response.json();
      
      const botMessage: Message = { id: Date.now().toString(), sender: 'bot', text: data.reply };
      const updatedHistory = [...newHistory, botMessage];
      setMessages(updatedHistory);
      
      if (data.suggestEscalation) {
        const newId = `ticket-${Date.now()}`;
        setTicketId(newId);
        
        const escalationMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          sender: 'bot', 
          text: 'I am connecting you to the next available agent. Please hold on...' 
        };
        
        const finalHistory = [...updatedHistory, escalationMsg];
        setMessages(finalHistory);
        
        joinTicketRoom(newId);
        escalateTicket(newId, "Customer", updatedHistory, { name: "Customer", email: "", company: MOCK_CUSTOMER_COMPANY });
      } else if (data.suggestResolution) {
        markAiResolved();
        localStorage.removeItem('smartTicket_messages');
        
        setTimeout(() => {
          setMessages([{ id: '1', sender: 'bot', text: 'Hi there! I am the SmartTicket AI assistant. How can I help you today?' }]);
        }, 3000);
      }
    } catch (error) {
      setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'bot', text: "I'm having trouble reaching the server right now." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleEscalate = () => {
    const newId = `ticket-${Date.now()}`;
    setTicketId(newId);
    
    const escalationMsg: Message = { 
      id: Date.now().toString(), 
      sender: 'bot', 
      text: 'I am connecting you to the next available agent. Please hold on...' 
    };
    
    const finalHistory = [...messages, escalationMsg];
    setMessages(finalHistory);
    
    joinTicketRoom(newId);
    
    escalateTicket(newId, 'Customer', finalHistory, { name: 'Customer', email: '', company: '' });
  };

  const handleDownloadTranscript = () => {
    const transcript = messages
      .filter(m => !m.isInternal)
      .map(m => `[${m.sender.toUpperCase()}] ${m.text}`)
      .join('\n');
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smartticket-transcript.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEndChat = () => {
    if (ticketId) {
      const endMsg: Message = { id: Date.now().toString(), sender: 'bot', text: 'Chat ended by user.' };
      sendAgentReply(ticketId, endMsg);
      resolveTicket(ticketId);
    }
  };

  const handleStartNewChat = () => {
    localStorage.removeItem('smartTicket_messages');
    localStorage.removeItem('smartTicket_ticketId');
    localStorage.removeItem('smartTicket_isResolved');
    setTicketId(null);
    setIsResolved(false);
    setHasSubmittedCsat(false);
    setMessages([{ id: '1', sender: 'bot', text: 'Hi there! I am the SmartTicket AI assistant. How can I help you today?' }]);
  };

  const handleCsatSubmit = (rating: number) => {
    submitCsat(rating, ticketId || undefined);
    setHasSubmittedCsat(true);
  };

  const visibleMessages = messages.filter((msg) => !msg.isInternal);
  const isCompactWidget =
    !ticketId &&
    !isResolved &&
    !isTyping &&
    !attachment &&
    visibleMessages.length <= 1;

  return (
    <>
      {zoomedImage && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 1500,
            bgcolor: 'rgba(0, 0, 0, 0.8)',
            display: 'grid',
            placeItems: 'center',
            p: 2,
            cursor: 'zoom-out',
          }}
          onClick={() => setZoomedImage(null)}
        >
          <Box component="img" src={zoomedImage} alt="Zoomed attachment" sx={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 1 }} />
          <IconButton
            onClick={() => setZoomedImage(null)}
            sx={{ position: 'absolute', top: 16, right: 16, color: 'common.white', bgcolor: 'rgba(255,255,255,0.15)' }}
          >
            <X size={24} />
          </IconButton>
        </Box>
      )}

      <Box sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1200 }}>
        {!isOpen && (
          <Badge badgeContent={unreadCount} color="error" overlap="circular" invisible={unreadCount === 0}>
            <IconButton
              onClick={() => {
                setIsOpen(true);
                setUnreadCount(0);
              }}
              sx={{
                width: 56,
                height: 56,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                boxShadow: 6,
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              <MessageSquare size={24} />
            </IconButton>
          </Badge>
        )}

        {isOpen && (
          <Card
            sx={{
              width: 380,
              maxWidth: 'calc(100vw - 32px)',
              height: isCompactWidget ? 420 : 560,
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: 8,
            }}
          >
            <Box
              sx={{
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                px: 2,
                py: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
              }}
            >
              <Stack direction="row" spacing={1.25} alignItems="center">
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: 'rgba(255,255,255,0.2)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Bot size={20} />
                </Box>
                <Box>
                  <Typography variant="subtitle2" fontWeight={700}>
                    SmartTicket Support
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.9 }}>
                    {ticketId ? 'Connected to Agent' : agentOnlineCount > 0 ? 'Agents Online' : 'No Agents Online'}
                  </Typography>
                </Box>
              </Stack>
              <IconButton
                size="small"
                onClick={() => {
                  setIsOpen(false);
                  setUnreadCount(0);
                  if (!ticketId && messages.length > 1) {
                    markAiResolved();
                    localStorage.removeItem('smartTicket_messages');
                    setMessages([{ id: '1', sender: 'bot', text: 'Hi there! I am the SmartTicket AI assistant. How can I help you today?' }]);
                  }
                }}
                sx={{ color: 'inherit' }}
              >
                <X size={18} />
              </IconButton>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
              <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                <Stack spacing={1.5}>
                  {visibleMessages.map((msg) => (
                    <Box key={msg.id} sx={{ display: 'flex', justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                      <Box
                        sx={(theme) => ({
                          maxWidth: '82%',
                          px: 1.5,
                          py: 1.25,
                          borderRadius: 2,
                          bgcolor:
                            msg.sender === 'user'
                              ? 'primary.main'
                              : msg.sender === 'agent'
                                ? 'success.main'
                                : 'background.paper',
                          color: msg.sender === 'bot' ? 'text.primary' : 'common.white',
                          border: msg.sender === 'bot' ? `1px solid ${theme.palette.divider}` : 'none',
                        })}
                      >
                        {msg.sender === 'agent' && (
                          <Typography variant="caption" sx={{ display: 'block', opacity: 0.85, mb: 0.5, fontWeight: 700 }}>
                            Agent
                          </Typography>
                        )}
                        {msg.text && <Typography variant="body2">{msg.text}</Typography>}
                        {msg.attachment && (
                          <Box
                            component="img"
                            src={msg.attachment}
                            alt="Attachment"
                            onClick={() => setZoomedImage(msg.attachment!)}
                            sx={{
                              mt: 1,
                              borderRadius: 1,
                              maxWidth: '100%',
                              maxHeight: 160,
                              objectFit: 'cover',
                              cursor: 'zoom-in',
                            }}
                          />
                        )}
                      </Box>
                    </Box>
                  ))}

                  {visibleMessages.length <= 1 && !isResolved && (
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      {['Billing question', 'Order update', 'Talk to support'].map((prompt) => (
                        <Chip key={prompt} label={prompt} size="small" onClick={() => setInput(prompt)} />
                      ))}
                    </Stack>
                  )}

                  {(isTyping || (ticketId && typingIndicators[ticketId]?.agent)) && !isResolved && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <Box sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
                        <Typography variant="caption" color="text.secondary">
                          {ticketId ? 'Agent is typing...' : 'AI is typing...'}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </Stack>
              </Box>
            </Box>

            <Divider />
            <Box sx={{ p: 1.5, bgcolor: 'background.paper' }}>
              {isResolved ? (
                <Stack spacing={1.5}>
                  {!hasSubmittedCsat ? (
                    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        How was your experience?
                      </Typography>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 1, justifyContent: 'center' }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <IconButton key={star} onClick={() => handleCsatSubmit(star)} size="small" color="warning">
                            <Star size={20} />
                          </IconButton>
                        ))}
                      </Stack>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="success.main" textAlign="center" fontWeight={600}>
                      Thank you for your feedback!
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" fullWidth onClick={handleStartNewChat}>
                      Start New Chat
                    </Button>
                    <Button variant="outlined" fullWidth onClick={handleDownloadTranscript}>
                      Download Transcript
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                <>
                  {!ticketId ? (
                    <Button variant="outlined" fullWidth sx={{ mb: 1.25 }} onClick={handleEscalate} startIcon={<PhoneCall size={14} />}>
                      Talk to Human
                    </Button>
                  ) : (
                    <Button variant="outlined" color="error" fullWidth sx={{ mb: 1.25 }} onClick={handleEndChat} startIcon={<X size={14} />}>
                      End Chat
                    </Button>
                  )}

                  {attachment && (
                    <Box sx={{ mb: 1.25, position: 'relative', width: 64 }}>
                      <Box component="img" src={attachment} alt="Preview" sx={{ width: 64, height: 64, borderRadius: 1, objectFit: 'cover' }} />
                      <IconButton size="small" onClick={() => setAttachment(null)} sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'error.main', color: 'error.contrastText', '&:hover': { bgcolor: 'error.dark' } }}>
                        <X size={12} />
                      </IconButton>
                    </Box>
                  )}

                  <Box component="form" onSubmit={handleSend} sx={{ display: 'flex', gap: 1 }}>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleFileChange}
                    />
                    <IconButton
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      color={attachment ? 'primary' : 'default'}
                      sx={{ border: 1, borderColor: 'divider' }}
                    >
                      <Paperclip size={18} />
                    </IconButton>
                    <TextField
                      value={input}
                      onChange={handleInputChange}
                      placeholder="Type your message..."
                      disabled={isTyping && !ticketId}
                      size="small"
                      fullWidth
                    />
                    <Button type="submit" variant="contained" disabled={(!input.trim() && !attachment) || (isTyping && !ticketId)} sx={{ minWidth: 44, px: 1.25 }}>
                      <Send size={18} />
                    </Button>
                  </Box>
                </>
              )}
            </Box>
          </Card>
        )}
      </Box>
    </>
  );
}
