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
  const [ticketSearch, setTicketSearch] = useState('');
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
  const filteredTickets = [...tickets].reverse().filter(ticket => {
    const searchText = ticketSearch.trim().toLowerCase();
    if (!searchText) return true;
    return [
      ticket.customerName,
      ticket.id,
      ticket.tag || '',
      ticket.messages[ticket.messages.length - 1]?.text || ''
    ].some(value => value.toLowerCase().includes(searchText));
  });

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

      <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden">
      <header className="h-16 bg-slate-900 text-white flex items-center px-6 justify-between shrink-0 shadow-sm z-20 relative">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm shadow-inner ring-1 ring-white/10">
            <span className="text-white">ST</span>
          </div>
          <span className="font-semibold tracking-tight text-white">
            SmartTicket Hub
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex bg-slate-800/80 rounded-lg p-1.5 border border-slate-700">
            <button 
              onClick={() => setActiveTab('queue')}
              className={`px-4 py-1.5 text-sm rounded-md transition-all duration-200 font-medium ${activeTab === 'queue' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
            >
              Live Queue
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-1.5 text-sm rounded-md transition-all duration-200 font-medium ${activeTab === 'analytics' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
            >
              Analytics
            </button>
            <button 
              onClick={() => setActiveTab('knowledge')}
              className={`px-4 py-1.5 text-sm rounded-md transition-all duration-200 font-medium ${activeTab === 'knowledge' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
            >
              Knowledge Base
            </button>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium">
            <button
              onClick={() => setSoundEnabled(p => !p)}
              className="text-slate-400 hover:text-white transition-colors p-2 rounded-full hover:bg-slate-800"
              title={soundEnabled ? 'Mute notifications' : 'Enable notifications'}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <div className="flex items-center gap-2 border-l border-slate-700 pl-4 h-8">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-slate-200">Online</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {}
        <div className="w-[340px] bg-white border-r border-slate-200 flex flex-col z-10 shrink-0 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] relative">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
            <h2 className="font-semibold text-slate-800 text-xs tracking-wider flex items-center gap-2 uppercase">
              <Users size={14} className="text-blue-600" /> Inbox
            </h2>
            <div className="flex gap-2">
              <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-100 shadow-none border border-blue-200/50 text-[10px] py-0">{activeTickets.length} Active</Badge>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col p-3 gap-2 bg-slate-50/50">
            <div className="mb-3">
              <Input
                value={ticketSearch}
                onChange={e => setTicketSearch(e.target.value)}
                placeholder="Search tickets..."
                className="w-full text-sm"
              />
            </div>
            {tickets.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                  <CheckCircle size={24} className="text-slate-400" />
                </div>
                Inbox Zero!
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                  <CheckCircle size={24} className="text-slate-400" />
                </div>
                No tickets match your search.
              </div>
            ) : (
              filteredTickets.map(ticket => {
                const isResolved = ticket.status === 'resolved';
                return (
                  <button
                    key={ticket.id}
                    onClick={() => {
                      setSelectedTicketId(ticket.id);
                      setActiveTab('queue');
                    }}
                    className={`w-full p-4 rounded-xl text-left transition-all duration-200 flex flex-col gap-2 border ${
                      selectedTicketId === ticket.id 
                        ? 'bg-blue-50/50 border-blue-200 shadow-sm ring-1 ring-blue-100' 
                        : isResolved 
                          ? 'bg-white/50 opacity-60 hover:opacity-100 hover:bg-white border-transparent hover:border-slate-200' 
                          : 'bg-white hover:border-slate-300 border-slate-200 shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-start w-full">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`font-semibold text-sm ${isResolved ? 'text-slate-500' : 'text-slate-900'} ${selectedTicketId === ticket.id ? 'text-blue-900' : ''}`}>
                          {ticket.customerName}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isResolved ? (
                            <Badge variant="secondary" className="text-[9px] py-0 h-4 bg-slate-100 text-slate-500 border-0">Closed</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[9px] py-0 h-4 bg-emerald-50 text-emerald-700 border border-emerald-200/50">Open</Badge>
                          )}
                          {ticket.tag && <Badge variant="outline" className="text-[9px] py-0 h-4 text-slate-500 bg-white border-slate-200">{ticket.tag}</Badge>}
                        </div>
                      </div>
                      <span className="text-xs font-medium text-slate-400 shrink-0">
                        {new Date(ticket.escalatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className={`text-xs w-full truncate block mt-1 ${isResolved ? 'text-slate-400' : 'text-slate-500'}`}>
                      {ticket.messages[ticket.messages.length - 1]?.text || "No text content"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {}
        <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto">
          {activeTab === 'analytics' ? (
            <div className="p-8 max-w-5xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
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
            <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-4 animate-in fade-in duration-700 bg-slate-50">
              <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 shadow-sm">
                <MessageSquare size={28} className="text-slate-400" />
              </div>
              <p className="font-medium text-slate-500">Select a ticket to join the conversation.</p>
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 relative">
                {}
                <div className="flex flex-col shrink-0 bg-white/95 backdrop-blur-sm border-b border-slate-200 z-10 sticky top-0 shadow-sm">
                  <div className="h-[72px] px-8 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-sm border border-blue-200/50">
                        {selectedTicket.customerName.charAt(0)}
                      </div>
                      {selectedTicket.customerName}
                      {selectedTicket.tag && <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">{selectedTicket.tag}</Badge>}
                    </h2>
                  </div>
                  {selectedTicket.status === 'active' && (
                    <Button variant="outline" onClick={handleResolve} className="gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:border-emerald-400 transition-colors font-semibold rounded-lg shadow-sm">
                      <CheckCircle2 size={16} /> Mark as Resolved
                    </Button>
                  )}
                </div>
                {selectedTicket.summary && (
                  <div className="px-8 pb-4 pt-0">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 items-start">
                      <div className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                        <Sparkles className="text-slate-600" size={16} />
                      </div>
                      <div className="text-sm text-slate-700 leading-relaxed pt-0.5">
                        <span className="font-semibold text-slate-900 mr-2">AI Context:</span>
                        {selectedTicket.summary}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {}
              <div className="flex-1 p-8 overflow-y-auto" ref={scrollRef}>
                <div className="max-w-3xl mx-auto space-y-6 pb-4">
                  {selectedTicket.messages.map((msg, idx) => {
                    const isAgent = msg.sender === 'agent';
                    const isBot = msg.sender === 'bot';
                    
                    return (
                      <div key={msg.id} className={`flex w-full animate-in slide-in-from-bottom-2 fade-in duration-300 ${isAgent ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-4 rounded-2xl relative group shadow-sm ${
                          isAgent 
                            ? (msg.isInternal 
                                ? 'bg-amber-50 text-amber-900 rounded-tr-sm border border-amber-200/50' 
                                : 'bg-blue-600 text-white rounded-tr-sm border border-blue-700/50') 
                            : isBot 
                              ? 'bg-white text-slate-700 rounded-tl-sm border border-slate-200'
                              : 'bg-white text-slate-900 border border-slate-200 rounded-tl-sm'
                        }`}>
                          {msg.isInternal && (
                            <div className="absolute -top-3 right-4 flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-amber-200 uppercase tracking-wider shadow-sm">
                              <EyeOff size={10} /> Internal Note
                            </div>
                          )}
                          <div className={`text-xs mb-1.5 font-bold tracking-wide ${isAgent ? (msg.isInternal ? 'text-amber-600' : 'text-blue-200') : 'text-slate-400'}`}>
                            {isAgent ? 'You' : isBot ? 'AI Assistant' : selectedTicket.customerName}
                          </div>
                          {msg.text && <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</div>}
                          {msg.attachment && (
                            <img 
                              src={msg.attachment} 
                              alt="Attachment" 
                              className="mt-3 rounded-xl max-w-full max-h-64 object-cover cursor-zoom-in hover:opacity-90 transition-all border border-slate-200 shadow-sm" 
                              onClick={() => setZoomedImage(msg.attachment!)}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {selectedTicketId && typingIndicators[selectedTicketId]?.user && selectedTicket.status === 'active' && (
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
                <div className="p-6 bg-white border-t border-slate-200 flex flex-col gap-4 relative z-20 shadow-[0_-4px_24px_rgba(0,0,0,0.02)]">
                  {isGeneratingReplies ? (
                    <div className="flex items-center gap-2 text-xs text-blue-600 font-medium px-2 animate-pulse">
                      <Loader2 size={14} className="animate-spin text-blue-500" />
                      Crafting suggestions...
                    </div>
                  ) : smartReplies.length > 0 ? (
                    <div className="flex flex-wrap gap-2 animate-in slide-in-from-bottom-2">
                      {smartReplies.map((suggestion, idx) => (
                        <button 
                          key={idx}
                          onClick={() => setReply(suggestion)}
                          className="px-4 py-2 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-lg text-sm font-medium transition-all border border-slate-200 shadow-sm"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {attachment && (
                    <div className="mb-2 relative inline-block self-start animate-in zoom-in-95">
                      <img src={attachment} alt="Preview" className="h-20 w-20 object-cover rounded-lg border border-slate-200 shadow-md ring-2 ring-white" />
                      <button 
                        type="button"
                        onClick={() => setAttachment(null)}
                        className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1.5 shadow-md hover:bg-rose-600 transition-colors"
                      >
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleSend} className="max-w-4xl mx-auto w-full flex gap-3 items-end">
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
                      className={`shrink-0 h-12 w-12 rounded-xl transition-all ${attachment ? 'text-blue-600 border-blue-300 bg-blue-50 ring-2 ring-blue-100' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700 border-slate-200'}`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip size={20} />
                    </Button>
                    <div className="flex-1 relative group">
                      <Input 
                        value={reply}
                        onChange={handleInputChange}
                        placeholder="Type a message..."
                        className="w-full h-12 pl-4 pr-4 rounded-xl bg-slate-50 border-slate-200 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 transition-all text-base focus:bg-white"
                      />
                    </div>
                    <div className="flex items-center gap-2 shrink-0 bg-slate-50 p-1 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setIsInternal(!isInternal)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
                          isInternal ? 'bg-amber-100 text-amber-900 shadow-sm border border-amber-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <EyeOff size={16} className={isInternal ? "" : "opacity-50"} />
                        Internal Note
                      </button>
                    </div>
                    <Button type="submit" disabled={!reply.trim() && !attachment} className={`h-12 px-6 rounded-xl font-bold transition-all shadow-sm ${isInternal ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
                      <Send size={18} className="mr-2" /> {isInternal ? 'Save' : 'Send'}
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="p-6 bg-slate-50 border-t border-slate-200 text-center flex flex-col items-center justify-center gap-2 relative z-20">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-sm">Ticket Closed</span>
                  <span className="text-slate-400 text-xs">This session is read-only.</span>
                </div>
              )}
              </div>

              {}

            </div>
          )}
        </div>
      </main>
    </div>
    </>
  );
}
