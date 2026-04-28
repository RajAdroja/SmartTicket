import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTickets, Ticket } from '../context/TicketContext';
import { User, Send, CheckCircle2, BarChart3, MessageSquare, Bot, Users, CheckCircle, Paperclip, Star, Sparkles, Loader2, X, Database, EyeOff, Save, Volume2, VolumeX, FileText, UploadCloud, Trash2 } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

const API_URL = 'http://localhost:5001';

export default function AgentDashboard() {
  const { tickets, sendAgentReply, resolveTicket, joinAgentRoom, metrics, typingIndicators, sendTypingStatus } = useTickets();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [activeTab, setActiveTab] = useState<'queue' | 'analytics' | 'knowledge'>('queue');
  const [attachment, setAttachment] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [isGeneratingReplies, setIsGeneratingReplies] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [kbText, setKbText] = useState('');
  const [isSavingKb, setIsSavingKb] = useState(false);
  const [isPdfUploading, setIsPdfUploading] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [selectedKbCompany, setSelectedKbCompany] = useState('global');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('agent_sound') !== 'false');
  const prevTicketCountRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('agent_sound', String(soundEnabled));
  }, [soundEnabled]);

  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const frequencies = [523.25, 659.25, 783.99];
      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.4);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.5);
      });
    } catch (e) {  }
  }, [soundEnabled]);

  const activeTickets = tickets.filter(t => t.status === 'active');
  useEffect(() => {
    if (activeTickets.length > prevTicketCountRef.current) {
      playChime();
    }
    prevTicketCountRef.current = activeTickets.length;
  }, [activeTickets.length, playChime]);

  useEffect(() => {
    joinAgentRoom();
  }, [joinAgentRoom]);

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  useEffect(() => {
    if (selectedTicketId && selectedTicket) {
      const lastMsg = selectedTicket.messages[selectedTicket.messages.length - 1];
      if (lastMsg?.sender === 'user') {
        setIsGeneratingReplies(true);
        fetch(`${API_URL}/api/suggest-replies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: selectedTicketId })
        })
          .then(res => res.json())
          .then(data => setSmartReplies(data.suggestions || []))
          .finally(() => setIsGeneratingReplies(false));
      } else {
        setSmartReplies([]);
      }
    } else {
      setSmartReplies([]);
    }
  }, [selectedTicketId, selectedTicket?.messages.length]);

  useEffect(() => {
    if (activeTab === 'knowledge') {
      fetch(`${API_URL}/api/kb?company=${encodeURIComponent(selectedKbCompany)}`)
        .then(res => res.json())
        .then(data => setKbText(data.kb || ''))
    }
  }, [activeTab, selectedKbCompany]);

  const handleSaveKb = () => {
    setIsSavingKb(true);
    fetch(`${API_URL}/api/kb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kb: kbText, company: selectedKbCompany })
    })
      .then(res => res.json())
      .finally(() => setIsSavingKb(false));
  };

  const handlePdfUpload = async (file: File) => {
    setIsPdfUploading(true);
    setPdfStatus(null);
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('company', selectedKbCompany);
      const res = await fetch(`${API_URL}/api/kb/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        const kbRes = await fetch(`${API_URL}/api/kb?company=${encodeURIComponent(selectedKbCompany)}`);
        const kbData = await kbRes.json();
        setKbText(kbData.kb);
        setPdfStatus({ type: 'success', message: `Successfully processed "${file.name}" — ${data.pages} page(s), ${data.characters.toLocaleString()} characters extracted` });
      } else {
        setPdfStatus({ type: 'error', message: data.error || 'Upload failed' });
      }
    } catch {
      setPdfStatus({ type: 'error', message: 'Network error — could not reach server' });
    } finally {
      setIsPdfUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReply(e.target.value);
    if (selectedTicketId) {
      sendTypingStatus(selectedTicketId, true, 'agent');
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingStatus(selectedTicketId, false, 'agent');
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

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!reply.trim() && !attachment) || !selectedTicketId) return;

    sendAgentReply(selectedTicketId, {
      id: Date.now().toString(),
      sender: 'agent',
      text: reply.trim(),
      attachment: attachment || undefined,
      isInternal
    });
    setReply('');
    setAttachment(null);
    setIsInternal(false);
    sendTypingStatus(selectedTicketId, false, 'agent');
  };

  const handleResolve = () => {
    if (selectedTicketId) {
      resolveTicket(selectedTicketId);
      setSelectedTicketId(null);
    }
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

      <div className="h-screen bg-zinc-100 flex flex-col font-sans text-zinc-800">
      <header className="h-14 bg-zinc-900 text-white flex items-center px-6 justify-between shrink-0 shadow-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center font-bold">
            T
          </div>
          <span className="font-semibold text-sm tracking-tight uppercase">Agent Workspace</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex bg-zinc-800 rounded-md p-1">
            <button 
              onClick={() => setActiveTab('queue')}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'queue' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Live Queue
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'analytics' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Analytics
            </button>
            <button 
              onClick={() => setActiveTab('knowledge')}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'knowledge' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Knowledge Base
            </button>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={() => setSoundEnabled(p => !p)}
              className="text-zinc-400 hover:text-white transition-colors p-1"
              title={soundEnabled ? 'Mute notifications' : 'Enable notifications'}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <span className="flex items-center gap-2 border-l border-zinc-700 pl-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Online
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {}
        <div className="w-80 bg-white border-r border-zinc-200 flex flex-col">
          <div className="p-4 border-b border-zinc-200 bg-zinc-50 flex justify-between items-center">
            <h2 className="font-semibold text-zinc-700 text-sm uppercase tracking-wider">Live Queue</h2>
            <Badge variant="secondary">{activeTickets.length}</Badge>
          </div>
          <div className="flex-1 overflow-y-auto">
            {activeTickets.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 text-sm">
                No active escalations.
              </div>
            ) : (
              <div className="flex flex-col">
                {activeTickets.map(ticket => (
                  <button
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`p-4 border-b border-zinc-100 text-left transition-colors flex flex-col gap-2 ${
                      selectedTicketId === ticket.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'hover:bg-zinc-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-zinc-900">{ticket.customerName}</span>
                        {ticket.tag && <Badge variant="outline" className="text-[10px] py-0">{ticket.tag}</Badge>}
                      </div>
                      <span className="text-xs text-zinc-400">
                        {new Date(ticket.escalatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-500 truncate w-full">
                      {ticket.messages[ticket.messages.length - 1]?.text}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {}
        <div className="flex-1 flex flex-col bg-zinc-50 overflow-y-auto">
          {activeTab === 'analytics' ? (
            <div className="p-8 max-w-5xl mx-auto w-full animate-in fade-in">
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-zinc-900">Platform Analytics</h1>
                <p className="text-zinc-500">Real-time metrics for your SmartTicket deployment.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center mb-4">
                    <MessageSquare className="text-indigo-600" size={20} />
                  </div>
                  <span className="text-zinc-500 text-sm font-medium">Total Interactions</span>
                  <span className="text-3xl font-bold text-zinc-900 mt-1">{metrics.aiResolved + metrics.escalated}</span>
                </div>

                <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center mb-4">
                    <Bot className="text-emerald-600" size={20} />
                  </div>
                  <span className="text-zinc-500 text-sm font-medium">Resolved by AI Only</span>
                  <span className="text-3xl font-bold text-zinc-900 mt-1">{metrics.aiResolved}</span>
                  <span className="text-xs text-emerald-600 font-medium mt-2 bg-emerald-50 px-2 py-1 rounded-md self-start">
                    {metrics.aiResolved + metrics.escalated > 0 ? Math.round((metrics.aiResolved / (metrics.aiResolved + metrics.escalated)) * 100) : 0}% Deflection Rate
                  </span>
                </div>

                <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
                  <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center mb-4">
                    <Users className="text-amber-600" size={20} />
                  </div>
                  <span className="text-zinc-500 text-sm font-medium">Escalated to Human</span>
                  <span className="text-3xl font-bold text-zinc-900 mt-1">{metrics.escalated}</span>
                </div>

                <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                    <CheckCircle className="text-blue-600" size={20} />
                  </div>
                  <span className="text-zinc-500 text-sm font-medium">Resolved by Human</span>
                  <span className="text-3xl font-bold text-zinc-900 mt-1">{metrics.humanResolved}</span>
                </div>

                <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
                  <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center mb-4">
                    <Star className="text-yellow-600" size={20} />
                  </div>
                  <span className="text-zinc-500 text-sm font-medium">Avg CSAT Score</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-3xl font-bold text-zinc-900">
                      {metrics.csatCount > 0 ? (metrics.totalCsatScore / metrics.csatCount).toFixed(1) : 'N/A'}
                    </span>
                    {metrics.csatCount > 0 && <Star size={16} className="text-yellow-500 fill-current" />}
                  </div>
                  <span className="text-xs text-zinc-400 font-medium mt-2">
                    Based on {metrics.csatCount} reviews
                  </span>
                </div>
              </div>
            </div>
          ) : activeTab === 'knowledge' ? (
            <div className="p-8 max-w-4xl mx-auto w-full animate-in fade-in flex flex-col h-full gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                    <Database className="text-indigo-600" /> AI Knowledge Base
                  </h1>
                  <p className="text-zinc-500 mt-1">Manage standard and company-specific knowledge to ground the AI.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Target Company</label>
                    <select
                      value={selectedKbCompany}
                      onChange={(e) => setSelectedKbCompany(e.target.value)}
                      className="text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="global">Global (All Users)</option>
                      <option value="Acme Corp">Acme Corp</option>
                      <option value="Globex">Globex</option>
                      <option value="Initech">Initech</option>
                    </select>
                  </div>
                  <Button onClick={handleSaveKb} disabled={isSavingKb} className="bg-indigo-600 hover:bg-indigo-700 gap-2 mt-4">
                    {isSavingKb ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save Changes
                  </Button>
                </div>
              </div>

              {}
              <div
                onDragOver={e => { e.preventDefault(); setIsDraggingPdf(true); }}
                onDragLeave={() => setIsDraggingPdf(false)}
                onDrop={async e => {
                  e.preventDefault();
                  setIsDraggingPdf(false);
                  const file = e.dataTransfer.files[0];
                  if (file) await handlePdfUpload(file);
                }}
                onClick={() => pdfInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-all ${
                  isDraggingPdf
                    ? 'border-indigo-500 bg-indigo-50 scale-[1.01]'
                    : 'border-zinc-200 hover:border-indigo-400 hover:bg-zinc-50'
                }`}
              >
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = ''; }}
                />
                {isPdfUploading ? (
                  <><Loader2 size={28} className="text-indigo-500 animate-spin" /><p className="text-sm font-medium text-indigo-600">Extracting text from PDF...</p></>
                ) : (
                  <>
                    <UploadCloud size={28} className={isDraggingPdf ? 'text-indigo-500' : 'text-zinc-400'} />
                    <div className="text-center">
                      <p className="text-sm font-semibold text-zinc-700">Drop a PDF here or <span className="text-indigo-600">click to browse</span></p>
                      <p className="text-xs text-zinc-400 mt-1">Max 10MB · Text will be appended to the knowledge base below</p>
                    </div>
                  </>
                )}
              </div>

              {}
              {pdfStatus && (
                <div className={`text-sm px-4 py-2.5 rounded-lg flex items-center gap-2 font-medium ${
                  pdfStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}>
                  <FileText size={14} />
                  {pdfStatus.message}
                  <button onClick={() => setPdfStatus(null)} className="ml-auto"><X size={14} /></button>
                </div>
              )}

              {}
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Knowledge Base Content</p>
                  {kbText && (
                    <button onClick={() => setKbText('')} className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700">
                      <Trash2 size={12} /> Clear all
                    </button>
                  )}
                </div>
                <textarea
                  value={kbText}
                  onChange={e => setKbText(e.target.value)}
                  placeholder="Type or paste knowledge base content here, or upload a PDF above..."
                  className="flex-1 w-full p-4 rounded-xl border border-zinc-200 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-mono text-sm min-h-[200px]"
                />
              </div>
            </div>
          ) : !selectedTicket ? (
            <div className="flex-1 flex items-center justify-center text-zinc-400 flex-col gap-3">
              <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center">
                <User size={24} className="text-zinc-300" />
              </div>
              <p>Select a ticket to view the chat history and reply.</p>
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col min-w-0">
                {}
                <div className="flex flex-col shrink-0 bg-white border-b border-zinc-200">
                  <div className="h-16 px-6 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-zinc-900 flex items-center gap-2">
                      Chat with {selectedTicket.customerName}
                      {selectedTicket.tag && <Badge variant="secondary" className="bg-indigo-50 text-indigo-700">{selectedTicket.tag}</Badge>}
                    </h2>
                    <p className="text-xs text-zinc-500">
                      {selectedTicket.status === 'resolved' ? 'Ticket Resolved' : 'Escalated from AI Assistant'}
                    </p>
                  </div>
                  {selectedTicket.status === 'active' && (
                    <Button variant="outline" size="sm" onClick={handleResolve} className="gap-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                      <CheckCircle2 size={16} /> Mark Resolved
                    </Button>
                  )}
                </div>
                {selectedTicket.summary && (
                  <div className="px-6 pb-3 pt-1">
                    <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3 flex gap-3 items-start">
                      <Sparkles className="text-indigo-500 shrink-0 mt-0.5" size={16} />
                      <div className="text-sm text-indigo-900">
                        <span className="font-semibold">AI Summary: </span>
                        {selectedTicket.summary}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {}
              <div className="flex-1 p-6 overflow-y-auto" ref={scrollRef}>
                <div className="max-w-3xl mx-auto space-y-6 pb-4">
                  {selectedTicket.messages.map((msg, idx) => {
                    const isAgent = msg.sender === 'agent';
                    const isBot = msg.sender === 'bot';
                    
                    return (
                      <div key={msg.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] p-4 rounded-2xl shadow-sm relative ${
                          isAgent 
                            ? (msg.isInternal ? 'bg-amber-100 text-amber-900 rounded-tr-sm border border-amber-200' : 'bg-indigo-600 text-white rounded-tr-sm') 
                            : isBot 
                              ? 'bg-zinc-200 text-zinc-800 rounded-tl-sm'
                              : 'bg-white text-zinc-800 border border-zinc-200 rounded-tl-sm'
                        }`}>
                          {msg.isInternal && (
                            <div className="absolute -top-3 right-2 flex items-center gap-1 bg-amber-200 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                              <EyeOff size={10} /> Internal
                            </div>
                          )}
                          <div className={`text-xs mb-1 font-semibold ${isAgent ? (msg.isInternal ? 'text-amber-700' : 'text-indigo-200') : isBot ? 'text-zinc-500' : 'text-zinc-400'}`}>
                            {isAgent ? 'You' : isBot ? 'AI Assistant' : selectedTicket.customerName}
                          </div>
                          {msg.text && <div className="text-sm">{msg.text}</div>}
                          {msg.attachment && (
                            <img 
                              src={msg.attachment} 
                              alt="Attachment" 
                              className="mt-2 rounded-md max-w-full max-h-64 object-cover cursor-zoom-in hover:opacity-90 transition-opacity" 
                              onClick={() => setZoomedImage(msg.attachment!)}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {typingIndicators[selectedTicketId]?.user && selectedTicket.status === 'active' && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-zinc-200 p-3 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                          <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                          <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></span>
                        </div>
                        <span className="text-xs text-zinc-400">Customer is typing...</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {}
              {selectedTicket.status === 'active' ? (
                <div className="p-4 bg-white border-t border-zinc-200 flex flex-col gap-3">
                  {isGeneratingReplies ? (
                    <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium px-1">
                      <Loader2 size={14} className="animate-spin" />
                      Generating Smart Replies...
                    </div>
                  ) : smartReplies.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {smartReplies.map((suggestion, idx) => (
                        <button 
                          key={idx}
                          onClick={() => setReply(suggestion)}
                          className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 rounded-full text-xs font-medium transition-colors border border-indigo-100"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {attachment && (
                    <div className="mb-2 relative inline-block self-start">
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

                  <form onSubmit={handleSend} className="max-w-4xl mx-auto w-full flex gap-3">
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
                      value={reply}
                      onChange={handleInputChange}
                      placeholder="Type your reply..."
                      className="flex-1"
                    />
                    <div className="flex items-center gap-2 shrink-0 bg-zinc-100 p-1 rounded-md border border-zinc-200">
                      <button
                        type="button"
                        onClick={() => setIsInternal(!isInternal)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                          isInternal ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200' : 'text-zinc-500 hover:text-zinc-700'
                        }`}
                      >
                        {isInternal && <EyeOff size={14} />}
                        Whisper Note
                      </button>
                    </div>
                    <Button type="submit" disabled={!reply.trim() && !attachment} className={isInternal ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-indigo-600 hover:bg-indigo-700"}>
                      <Send size={18} className="mr-2" /> {isInternal ? 'Add Note' : 'Send Reply'}
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="p-4 bg-zinc-50 border-t border-zinc-200 text-center flex flex-col items-center justify-center gap-1">
                  <span className="text-zinc-500 font-medium">This ticket has been resolved.</span>
                  <span className="text-zinc-400 text-sm">You can no longer send messages to this session.</span>
                </div>
              )}
              </div>

              {}
              {selectedTicket.userProfile && (
                <div className="w-72 bg-white border-l border-zinc-200 flex flex-col shrink-0 overflow-y-auto hidden lg:flex">
                  <div className="p-6 border-b border-zinc-100 flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-2xl font-bold mb-3 shadow-inner">
                      {selectedTicket.userProfile.name.charAt(0).toUpperCase()}
                    </div>
                    <h3 className="font-bold text-zinc-900 text-lg">{selectedTicket.userProfile.name}</h3>
                    <p className="text-sm text-zinc-500 mb-2">{selectedTicket.userProfile.email}</p>
                    <Badge variant="secondary" className="bg-zinc-100 text-zinc-700">{selectedTicket.userProfile.company}</Badge>
                  </div>
                  
                  <div className="p-6">
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">Past Tickets</h4>
                    <div className="flex flex-col gap-3">
                      {tickets
                        .filter(t => t.userProfile?.email === selectedTicket.userProfile?.email && t.id !== selectedTicket.id)
                        .map(t => (
                          <div key={t.id} className="p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-xs font-semibold text-zinc-700">{new Date(t.escalatedAt).toLocaleDateString()}</span>
                              <Badge variant="outline" className={`text-[9px] py-0 ${t.status === 'resolved' ? 'text-emerald-600 border-emerald-200 bg-emerald-50' : 'text-amber-600 border-amber-200 bg-amber-50'}`}>
                                {t.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-zinc-500 line-clamp-2">{t.summary || t.messages[0]?.text || 'No summary available'}</p>
                          </div>
                        ))}
                      {tickets.filter(t => t.userProfile?.email === selectedTicket.userProfile?.email && t.id !== selectedTicket.id).length === 0 && (
                        <p className="text-xs text-zinc-400 italic">No previous tickets found.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
    </>
  );
}
