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
import { useTickets, Message, type EscalationExplainability } from '../../context/TicketContext';
import type { ChatApiResponseContract } from '../../lib/ai-contract';

const API_URL = 'http://localhost:5001';
const SESSION_ID_KEY = 'smartTicket_sessionId';

function formatMsgTime(createdAt?: string): string {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  const now = new Date();
  const diffMins = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return isToday ? time : `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

function getTriggerSourceFromReason(reason?: ChatApiResponseContract['decision']['escalationReason']): EscalationExplainability['escalationTriggerSource'] {
  if (reason === 'user_requested_human') return 'user_request';
  if (reason === 'sensitive_account_action') return 'policy_rule';
  if (reason === 'low_confidence') return 'confidence_rule';
  return 'model_signal';
}

function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const created = `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(SESSION_ID_KEY, created);
  return created;
}

function getEscalationReasonCopy(reason?: ChatApiResponseContract['decision']['escalationReason']): string {
  switch (reason) {
    case 'user_requested_human':
      return 'You asked for a human agent, so I will connect you now.';
    case 'sensitive_account_action':
      return 'This request involves account-sensitive actions and needs a human agent.';
    case 'frustration_detected':
      return 'I can tell this has been frustrating, so I will bring in a human agent.';
    case 'missing_kb_info':
      return 'I do not have enough verified information in my knowledge base, so I will escalate this.';
    case 'low_confidence':
      return 'I am not fully confident in this answer, so I recommend a human handoff.';
    default:
      return 'I will connect you to a human agent for faster and safer support.';
  }
}

export default function ChatWidget() {
  const { escalateTicket, joinTicketRoom, sendAgentReply, tickets, markAiResolved, resolveTicket, sendTypingStatus, typingIndicators, submitCsat, agentOnlineCount, socket } = useTickets();
  
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
  const [chatSessionId, setChatSessionId] = useState<string>(() => getOrCreateSessionId());
  const [isAiResolvedSession, setIsAiResolvedSession] = useState(false);
  const [feedbackPrompt, setFeedbackPrompt] = useState('Was this AI response helpful?');
  const [feedbackHelpful, setFeedbackHelpful] = useState<boolean | null>(null);
  const [feedbackReasons, setFeedbackReasons] = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackOptions, setFeedbackOptions] = useState<{ positiveReasonOptions: string[]; negativeReasonOptions: string[] }>({
    positiveReasonOptions: [],
    negativeReasonOptions: [],
  });
  const [feedbackSubmitState, setFeedbackSubmitState] = useState<'idle' | 'submitting' | 'submitted' | 'duplicate' | 'error'>('idle');
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);
  const [attachment, setAttachment] = useState<string | null>(null);
  const [latestDecision, setLatestDecision] = useState<ChatApiResponseContract['decision'] | null>(null);
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
    if (ticketId && socket) {
      joinTicketRoom(ticketId);
    }
  }, [ticketId, joinTicketRoom, socket]);

  useEffect(() => {
    if (ticketId) {
      const activeTicket = tickets.find(t => t.id === ticketId);
      if (activeTicket) {
        if (activeTicket.status === 'resolved' && !isResolved) {
          setIsResolved(true);
          setIsAiResolvedSession(false);
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
      attachment: attachment || undefined,
      createdAt: new Date().toISOString(),
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
      const data = (await response.json()) as ChatApiResponseContract;
      setLatestDecision(data.decision || null);
      
      const botMessage: Message = { id: Date.now().toString(), sender: 'bot', text: data.reply, createdAt: new Date().toISOString() };
      const updatedHistory = [...newHistory, botMessage];
      setMessages(updatedHistory);
      
      if (data.suggestEscalation) {
        const newId = `ticket-${Date.now()}`;
        setTicketId(newId);
        const escalationReasonMessage: Message = {
          id: `escalation-reason-${Date.now()}`,
          sender: 'bot',
          text: getEscalationReasonCopy(data.decision?.escalationReason),
          createdAt: new Date().toISOString(),
        };
        
        const escalationMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'bot',
          text: 'I am connecting you to the next available agent. Please hold on...',
          createdAt: new Date().toISOString(),
        };
        
        const finalHistory = [...updatedHistory, escalationReasonMessage, escalationMsg];
        setMessages(finalHistory);
        const explainability: EscalationExplainability = {
          lastAiConfidenceScore: data.decision?.confidenceScore,
          lastAiConfidenceLabel: data.decision?.confidenceLabel,
          escalationReason: data.decision?.escalationReason,
          escalationTriggerSource: getTriggerSourceFromReason(data.decision?.escalationReason),
        };
        
        joinTicketRoom(newId);
        escalateTicket(newId, "Customer", finalHistory, { name: "Customer", email: "", company: MOCK_CUSTOMER_COMPANY }, explainability);
      } else if (data.suggestResolution) {
        markAiResolved();
        setIsResolved(true);
        setIsAiResolvedSession(true);
        setFeedbackPrompt(data.feedbackOptions?.helpfulPrompt || 'Was this AI response helpful?');
        setFeedbackOptions({
          positiveReasonOptions: data.feedbackOptions?.positiveReasonOptions || [],
          negativeReasonOptions: data.feedbackOptions?.negativeReasonOptions || [],
        });
        setFeedbackHelpful(null);
        setFeedbackReasons([]);
        setFeedbackComment('');
        setFeedbackSubmitState('idle');
      }
    } catch (error) {
      setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'bot', text: "I'm having trouble reaching the server right now.", createdAt: new Date().toISOString() }]);
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
      text: 'I am connecting you to the next available agent. Please hold on...',
      createdAt: new Date().toISOString(),
    };
    
    const finalHistory = [...messages, escalationMsg];
    setMessages(finalHistory);
    
    joinTicketRoom(newId);
    
    escalateTicket(
      newId,
      'Customer',
      finalHistory,
      { name: 'Customer', email: '', company: MOCK_CUSTOMER_COMPANY },
      {
        escalationReason: 'user_requested_human',
        escalationTriggerSource: 'user_request',
      }
    );
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
      const endMsg: Message = { id: Date.now().toString(), sender: 'bot', text: 'Chat ended by user.', createdAt: new Date().toISOString() };
      sendAgentReply(ticketId, endMsg);
      resolveTicket(ticketId);
      // Set resolved locally immediately — don't wait for the socket round-trip
      // so the UI transitions even if the customer socket missed the ticket room
      setMessages(prev => [...prev, endMsg]);
      setIsResolved(true);
    }
  };

  const handleStartNewChat = () => {
    localStorage.removeItem('smartTicket_messages');
    localStorage.removeItem('smartTicket_ticketId');
    localStorage.removeItem('smartTicket_isResolved');
    localStorage.removeItem(SESSION_ID_KEY);
    const nextSessionId = getOrCreateSessionId();
    setChatSessionId(nextSessionId);
    setTicketId(null);
    setIsResolved(false);
    setIsAiResolvedSession(false);
    setLatestDecision(null);
    setHasSubmittedCsat(false);
    setFeedbackHelpful(null);
    setFeedbackReasons([]);
    setFeedbackComment('');
    setFeedbackSubmitState('idle');
    setMessages([{ id: '1', sender: 'bot', text: 'Hi there! I am the SmartTicket AI assistant. How can I help you today?' }]);
  };

  const handleCsatSubmit = (rating: number) => {
    submitCsat(rating, ticketId || undefined);
    setSelectedRating(rating);
    setHasSubmittedCsat(true);
  };

  const toggleFeedbackReason = (reason: string) => {
    setFeedbackReasons(prev => prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]);
  };

  const handleFeedbackSubmit = async () => {
    if (feedbackHelpful === null || feedbackSubmitState === 'submitting') return;
    setFeedbackSubmitState('submitting');
    try {
      const res = await fetch(`${API_URL}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: chatSessionId,
          ticketId: ticketId || undefined,
          company: MOCK_CUSTOMER_COMPANY,
          helpful: feedbackHelpful,
          reasons: feedbackReasons,
          comment: feedbackComment.trim(),
          aiDecision: latestDecision || undefined,
        }),
      });
      if (res.status === 409) {
        setFeedbackSubmitState('duplicate');
      } else if (res.ok) {
        setFeedbackSubmitState('submitted');
      } else {
        setFeedbackSubmitState('error');
      }
    } catch {
      setFeedbackSubmitState('error');
    }
  };

  const visibleMessages = messages.filter((msg) => !msg.isInternal);
  const isCompactWidget =
    !ticketId &&
    !isResolved &&
    !isTyping &&
    !attachment &&
    visibleMessages.length <= 1;

  // Proactive trigger — auto-open after 30s if user hasn't opened chat yet this session
  useEffect(() => {
    if (isOpen || isResolved || ticketId) return;
    const alreadyTriggered = sessionStorage.getItem('smartticket_proactive_shown');
    if (alreadyTriggered) return;
    const timer = setTimeout(() => {
      sessionStorage.setItem('smartticket_proactive_shown', '1');
      setIsOpen(true);
      // Add a proactive message if chat is still at the initial state
      setMessages(prev => {
        if (prev.length === 1 && prev[0].sender === 'bot') {
          return [
            ...prev,
            { id: `proactive-${Date.now()}`, sender: 'bot', text: '👋 Need help? I\'m here if you have any questions!', createdAt: new Date().toISOString() }
          ];
        }
        return prev;
      });
    }, 30_000);
    return () => clearTimeout(timer);
  }, [isOpen, isResolved, ticketId]);

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
                bgcolor: '#1863dc',
                color: '#ffffff',
                boxShadow: 6,
                '&:hover': { bgcolor: '#1450b0' },
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
                bgcolor: '#1863dc',
                color: '#ffffff',
                px: 2,
                py: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
              }}
            >
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
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
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
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
                          // Use fixed chat colors — never inherit primary.main which flips to
                          // white in dark mode and makes user text invisible
                          bgcolor:
                            msg.sender === 'user'
                              ? '#1863dc'
                              : msg.sender === 'agent'
                                ? '#16a34a'
                                : theme.palette.background.paper,
                          color:
                            msg.sender === 'bot'
                              ? theme.palette.text.primary
                              : '#ffffff',
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
                        {formatMsgTime(msg.createdAt) && (
                          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.6, fontSize: '0.65rem' }}>
                            {formatMsgTime(msg.createdAt)}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}

                  {visibleMessages.length <= 1 && !isResolved && (
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
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
                  {isAiResolvedSession ? (
                    <Box sx={(theme) => ({ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, p: 2, background: '#f8fafc' })}>
                      {(feedbackSubmitState === 'submitted' || feedbackSubmitState === 'duplicate') ? (
                        <Box sx={{ textAlign: 'center', py: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.dark' }}>
                            Thanks for your feedback!
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {feedbackSubmitState === 'duplicate'
                              ? 'Feedback for this chat session was already submitted.'
                              : 'Your feedback has been recorded.'}
                          </Typography>
                        </Box>
                      ) : (
                        <Stack spacing={1.25}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {feedbackPrompt}
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant={feedbackHelpful === true ? 'contained' : 'outlined'}
                              onClick={() => { setFeedbackHelpful(true); setFeedbackReasons([]); }}
                            >
                              Yes
                            </Button>
                            <Button
                              size="small"
                              variant={feedbackHelpful === false ? 'contained' : 'outlined'}
                              onClick={() => { setFeedbackHelpful(false); setFeedbackReasons([]); }}
                            >
                              No
                            </Button>
                          </Stack>
                          {feedbackHelpful !== null && (
                            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                              {(feedbackHelpful ? feedbackOptions.positiveReasonOptions : feedbackOptions.negativeReasonOptions).map((reason) => (
                                <Chip
                                  key={reason}
                                  label={reason.replaceAll('_', ' ')}
                                  size="small"
                                  color={feedbackReasons.includes(reason) ? 'primary' : 'default'}
                                  onClick={() => toggleFeedbackReason(reason)}
                                />
                              ))}
                            </Stack>
                          )}
                          <TextField
                            size="small"
                            multiline
                            minRows={2}
                            value={feedbackComment}
                            onChange={(e) => setFeedbackComment(e.target.value)}
                            placeholder="Optional comment..."
                          />
                          {feedbackSubmitState === 'error' && (
                            <Typography variant="caption" color="error">
                              Could not submit feedback. Please try again.
                            </Typography>
                          )}
                          <Button
                            variant="contained"
                            onClick={handleFeedbackSubmit}
                            disabled={feedbackHelpful === null || feedbackSubmitState === 'submitting'}
                          >
                            {feedbackSubmitState === 'submitting' ? 'Submitting...' : 'Submit Feedback'}
                          </Button>
                        </Stack>
                      )}
                    </Box>
                  ) : !hasSubmittedCsat ? (
                    <Box sx={(theme) => ({ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, p: 2, background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)' })}>
                      <Stack alignItems="center" spacing={1.5}>
                        <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(245,158,11,0.35)' }}>
                          <Star size={22} color="#fff" fill="#fff" />
                        </Box>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#92400e' }}>
                            How was your experience?
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#b45309' }}>
                            Your feedback helps us improve
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <IconButton
                              key={star}
                              size="small"
                              onMouseEnter={() => setHoveredStar(star)}
                              onMouseLeave={() => setHoveredStar(0)}
                              onClick={() => handleCsatSubmit(star)}
                              sx={{ transition: 'transform 0.15s', transform: hoveredStar >= star ? 'scale(1.25)' : 'scale(1)', p: 0.5 }}
                            >
                              <Star
                                size={28}
                                color="#f59e0b"
                                fill={hoveredStar >= star ? '#f59e0b' : 'none'}
                                strokeWidth={1.5}
                              />
                            </IconButton>
                          ))}
                        </Stack>
                        <Stack direction="row" justifyContent="space-between" sx={{ width: '100%', px: 1 }}>
                          <Typography variant="caption" sx={{ color: '#b45309', fontSize: '0.6rem' }}>Terrible</Typography>
                          <Typography variant="caption" sx={{ color: '#b45309', fontSize: '0.6rem' }}>Excellent</Typography>
                        </Stack>
                      </Stack>
                    </Box>
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 1 }}>
                      <Stack direction="row" justifyContent="center" spacing={0.25} sx={{ mb: 0.75 }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star key={star} size={18} color="#f59e0b" fill={star <= selectedRating ? '#f59e0b' : 'none'} strokeWidth={1.5} />
                        ))}
                      </Stack>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.dark' }}>
                        Thanks for your feedback!
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Your rating has been submitted.
                      </Typography>
                    </Box>
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
                    <>
                      {latestDecision && latestDecision.confidenceLabel !== 'high' && (
                        <Box
                          sx={(theme) => ({
                            mb: 1.25,
                            px: 1.25,
                            py: 1,
                            borderRadius: 1.5,
                            border: `1px solid ${theme.palette.divider}`,
                            bgcolor: latestDecision.confidenceLabel === 'low' ? 'warning.light' : 'background.default',
                          })}
                        >
                          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
                            AI confidence: {latestDecision.confidenceLabel === 'low' ? 'Low' : 'Medium'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {latestDecision.confidenceLabel === 'low'
                              ? 'A human handoff is recommended for accuracy.'
                              : 'You can continue with AI or switch to a human agent now.'}
                          </Typography>
                        </Box>
                      )}
                      <Button variant="outlined" fullWidth sx={{ mb: 1.25 }} onClick={handleEscalate} startIcon={<PhoneCall size={14} />}>
                        Talk to Human
                      </Button>
                    </>
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
                    <Button type="submit" variant="contained" disabled={(!input.trim() && !attachment) || (isTyping && !ticketId)} sx={{ minWidth: 44, px: 1.25, bgcolor: '#1863dc', '&:hover': { bgcolor: '#1450b0' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground' } }}>
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
