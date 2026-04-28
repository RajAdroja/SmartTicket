import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, PhoneCall, Paperclip, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
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

  return (
    <>
      {}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
          onClick={() => setZoomedImage(null)}
        >
          <img src={zoomedImage} alt="Zoomed attachment" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
          <button 
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-sm transition-colors"
            onClick={() => setZoomedImage(null)}
          >
            <X size={24} />
          </button>
        </div>
      )}

      <div className="fixed bottom-6 right-6 z-50">
      {!isOpen && (
        <button 
          onClick={() => { setIsOpen(true); setUnreadCount(0); }}
          className="relative w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-transform transform hover:scale-105 active:scale-95"
        >
          <MessageSquare size={24} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-rose-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md animate-bounce">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <Card className="w-[380px] h-[600px] max-h-[80vh] flex flex-col shadow-2xl border-zinc-200/60 overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200">
          <CardHeader className="bg-indigo-600 text-white p-4 flex flex-row items-center justify-between shrink-0 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                <Bot size={20} />
              </div>
              <div className="flex flex-col">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  SmartTicket Support
                </CardTitle>
                <p className="text-xs text-indigo-200 flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${agentOnlineCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
                  {ticketId ? 'Connected to Agent' : agentOnlineCount > 0 ? 'Agents Online' : 'No Agents Online'}
                </p>
              </div>
            </div>
            <button 
              onClick={() => {
                setIsOpen(false);
                setUnreadCount(0);
                if (!ticketId && messages.length > 1) {
                  markAiResolved();
                  localStorage.removeItem('smartTicket_messages');
                  setMessages([{ id: '1', sender: 'bot', text: 'Hi there! I am the SmartTicket AI assistant. How can I help you today?' }]);
                }
              }} 
              className="text-white/70 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </CardHeader>
          
          <CardContent className="flex-1 p-0 overflow-hidden bg-zinc-50 flex flex-col relative">
            <div className="flex-1 p-4 overflow-y-auto" ref={scrollRef}>
              <div className="space-y-4 flex flex-col pb-4">
                {messages.filter(msg => !msg.isInternal).map(msg => (
                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${
                    msg.sender === 'user' 
                      ? 'bg-indigo-600 text-white rounded-tr-sm' 
                      : msg.sender === 'agent'
                        ? 'bg-emerald-600 text-white rounded-tl-sm'
                        : 'bg-white text-zinc-800 border border-zinc-100 rounded-tl-sm'
                  }`}>
                    {msg.sender === 'agent' && <div className="text-[10px] uppercase font-bold text-emerald-200 mb-1">Agent</div>}
                    {msg.text && <div className="text-sm">{msg.text}</div>}
                    {msg.attachment && (
                      <img 
                        src={msg.attachment} 
                        alt="Attachment" 
                        className="mt-2 rounded-md max-w-full max-h-40 object-cover cursor-zoom-in hover:opacity-90 transition-opacity" 
                        onClick={() => setZoomedImage(msg.attachment!)}
                      />
                    )}
                  </div>
                </div>
                ))}
                {(isTyping || (ticketId && typingIndicators[ticketId]?.agent)) && !isResolved && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-zinc-100 p-3 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></span>
                      </div>
                      <span className="text-xs text-zinc-400">{ticketId ? 'Agent is typing...' : 'AI is typing...'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>

          <div className="p-3 bg-zinc-50 border-t border-zinc-100">
            {isResolved ? (
              <div className="flex flex-col gap-3">
                {!hasSubmittedCsat ? (
                  <div className="bg-white border border-zinc-200 p-3 rounded-lg shadow-sm flex flex-col items-center">
                    <p className="text-xs text-zinc-600 font-medium mb-2">How was your experience?</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button key={star} onClick={() => handleCsatSubmit(star)} className="p-1 hover:text-amber-500 text-zinc-300 transition-colors">
                          <Star size={24} className="fill-current" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-2 text-sm text-emerald-600 font-medium">
                    Thank you for your feedback!
                  </div>
                )}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                    onClick={handleStartNewChat}
                  >
                    Start New Chat
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 gap-2 text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                    onClick={handleDownloadTranscript}
                  >
                    Download Transcript
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {!ticketId ? (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mb-3 gap-2 text-zinc-600 hover:text-indigo-600 border-zinc-200"
                    onClick={handleEscalate}
                  >
                    <PhoneCall size={14} /> Talk to Human
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mb-3 gap-2 text-rose-600 hover:text-rose-700 border-zinc-200"
                    onClick={handleEndChat}
                  >
                    <X size={14} /> End Chat
                  </Button>
                )}
                
                {attachment && (
                  <div className="mb-3 relative inline-block">
                    <img src={attachment} alt="Preview" className="h-16 w-16 object-cover rounded-md border border-zinc-200 shadow-sm" />
                    <button 
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 shadow-sm hover:bg-rose-600 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                <form onSubmit={handleSend} className="flex gap-2">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="icon" 
                    className={`shrink-0 ${attachment ? 'text-indigo-600 border-indigo-600 bg-indigo-50' : 'text-zinc-400'}`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip size={18} />
                  </Button>
                  <Input 
                    value={input}
                    onChange={handleInputChange}
                    placeholder="Type your message..."
                    disabled={isTyping && !ticketId}
                    className="bg-white border-zinc-200"
                  />
                  <Button type="submit" disabled={(!input.trim() && !attachment) || (isTyping && !ticketId)} className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
                    <Send size={18} />
                  </Button>
                </form>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
    </>
  );
}
