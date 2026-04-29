import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTickets, Ticket } from '../context/TicketContext';
import { User, Send, CheckCircle2, BarChart3, MessageSquare, Bot, Users, CheckCircle, Paperclip, Star, Sparkles, Loader2, X, Database, EyeOff, Save, Volume2, VolumeX, FileText, UploadCloud, Trash2, ArrowRightLeft } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

const API_URL = 'http://localhost:5001';

function formatMsgTime(createdAt?: string): string {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

function escalationReasonLabel(reason?: Ticket['escalationReason']): string {
  switch (reason) {
    case 'missing_kb_info': return 'KB Gap';
    case 'sensitive_account_action': return 'Sensitive Action';
    case 'user_requested_human': return 'User Requested Human';
    case 'frustration_detected': return 'Frustration Detected';
    case 'low_confidence': return 'Low Confidence';
    default: return 'No Escalation Signal';
  }
}

function confidenceBadgeClass(label?: Ticket['lastAiConfidenceLabel']): string {
  if (label === 'high') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (label === 'medium') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (label === 'low') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-100 text-slate-500 border-slate-200';
}

interface FeedbackAnalytics {
  totalFeedback: number;
  helpfulCount: number;
  unhelpfulCount: number;
  helpfulRate: number;
  lowConfidenceSampleSize: number;
  lowConfidenceHelpfulRate: number;
  topNegativeReasons: Array<{ reason: string; count: number }>;
  kbImprovementSuggestions: Array<{ reason: string; count: number; suggestion: string }>;
}

// SLA thresholds: < 30 min = ok, 30–60 min = approaching, > 60 min = breached
function SlaTimer({ escalatedAt }: { escalatedAt: Date | string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const ms = Date.now() - new Date(escalatedAt).getTime();
  const mins = Math.floor(ms / 60_000);
  const label = mins < 1 ? 'just now' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  const level: 'ok' | 'approaching' | 'breached' =
    mins >= 60 ? 'breached' : mins >= 30 ? 'approaching' : 'ok';

  if (level === 'breached') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md border bg-rose-100 text-rose-700 border-rose-300 animate-pulse">
        ✕ SLA {label}
      </span>
    );
  }
  if (level === 'approaching') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-300">
        ⚠ {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md border bg-emerald-50 text-emerald-600 border-emerald-200">
      ⏱ {label}
    </span>
  );
}

export default function AgentDashboard() {
  const { tickets, sendAgentReply, resolveTicket, updateTicketStatus, joinAgentRoom, metrics, typingIndicators, sendTypingStatus, agentId, agentName, onlineAgents, transferTicket, transferNotification, clearTransferNotification, agentStatus, setAgentStatus, assignTicket } = useTickets();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [reply, setReply] = useState('');
  const [activeTab, setActiveTab] = useState<'queue' | 'analytics' | 'knowledge' | 'setup'>('queue');
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
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'all' | 'open' | 'pending' | 'on-hold' | 'resolved'>('all');
  const [ticketOwnerFilter, setTicketOwnerFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [ticketCategoryFilter, setTicketCategoryFilter] = useState<string>('all');
  const [ticketEscalationFilter, setTicketEscalationFilter] = useState<'all' | 'low_confidence' | 'sensitive_account_action' | 'user_requested_human'>('all');
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [selectedKbCompany, setSelectedKbCompany] = useState('');
  const [feedbackAnalytics, setFeedbackAnalytics] = useState<FeedbackAnalytics | null>(null);
  const [analyticsCompanyFilter, setAnalyticsCompanyFilter] = useState<string>('all');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('agent_sound') !== 'false');
  const [timeseriesMetrics, setTimeseriesMetrics] = useState<any[]>([]);
  const [timeseriesDays, setTimeseriesDays] = useState(30);
  const [setupCompanyName, setSetupCompanyName] = useState('');
  const [setupSnippet, setSetupSnippet] = useState('');
  const [isGeneratingSnippet, setIsGeneratingSnippet] = useState(false);
  const prevTicketCountRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Canned Responses state
  const [showTemplates, setShowTemplates] = useState(false);
  const [cannedResponses, setCannedResponses] = useState<any[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateCategory, setTemplateCategory] = useState('all');
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateCategoryInput, setTemplateCategoryInput] = useState('General');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Brief skeleton on ticket switch
  useEffect(() => {
    if (!selectedTicketId) return;
    setIsLoadingMessages(true);
    const t = setTimeout(() => setIsLoadingMessages(false), 350);
    return () => clearTimeout(t);
  }, [selectedTicketId]);

  // Transfer modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferNote, setTransferNote] = useState('');

  // Incoming transfer toast
  const [incomingTransfer, setIncomingTransfer] = useState<{ ticketId: string; fromAgentName: string; note: string } | null>(null);

  // Outgoing transfer success toast
  const [transferSuccess, setTransferSuccess] = useState<{ toAgentName: string } | null>(null);

  // Close shared AudioContext on unmount
  useEffect(() => {
    return () => { audioCtxRef.current?.close(); };
  }, []);

  // Fetch canned responses when templates panel opens
  useEffect(() => {
    if (showTemplates) {
      setIsLoadingTemplates(true);
      fetch(`${API_URL}/api/canned-responses?agentId=${agentId}`)
        .then(res => res.json())
        .then(data => setCannedResponses(data || []))
        .catch(err => console.error('Failed to fetch templates:', err))
        .finally(() => setIsLoadingTemplates(false));
    }
  }, [showTemplates, agentId]);

  // Unread counts per ticket — track last-viewed message count
  const lastViewedRef = useRef<Record<string, number>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const next: Record<string, number> = {};
    tickets.forEach(ticket => {
      if (ticket.id === selectedTicketId) {
        // Currently viewing — mark all as read
        lastViewedRef.current[ticket.id] = ticket.messages.length;
        next[ticket.id] = 0;
      } else {
        const lastSeen = lastViewedRef.current[ticket.id] ?? ticket.messages.length;
        const newMsgs = ticket.messages.slice(lastSeen).filter(m => m.sender !== 'agent' && !m.isInternal);
        next[ticket.id] = newMsgs.length;
      }
    });
    setUnreadCounts(next);
  }, [tickets, selectedTicketId]);

  useEffect(() => {
    localStorage.setItem('agent_sound', String(soundEnabled));
  }, [soundEnabled]);

  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
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

  const activeTickets = tickets.filter(t => t.status !== 'resolved');
  const uniqueCategories = Array.from(new Set(tickets.map(t => t.tag).filter(Boolean)));
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
  const normalizeStatus = (status: Ticket['status']): 'open' | 'pending' | 'on-hold' | 'resolved' => {
    if (status === 'active') return 'open';
    return status;
  };

  const statusLabel = (status: Ticket['status']) => {
    const normalized = normalizeStatus(status);
    switch (normalized) {
      case 'open': return 'Open';
      case 'pending': return 'Pending';
      case 'on-hold': return 'On Hold';
      case 'resolved': return 'Resolved';
    }
  };

  const statusBadgeClass = (status: Ticket['status']) => {
    switch (normalizeStatus(status)) {
      case 'open':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/70';
      case 'pending':
        return 'bg-amber-50 text-amber-700 border-amber-200/70';
      case 'on-hold':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'resolved':
        return 'bg-slate-100 text-slate-500 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };


  const filteredTickets = [...tickets].reverse().filter(ticket => {
    const normalized = normalizeStatus(ticket.status);
    if (ticketStatusFilter !== 'all' && normalized !== ticketStatusFilter) {
      return false;
    }

    if (ticketOwnerFilter === 'mine' && ticket.assignedAgentId !== agentId) {
      return false;
    }
    if (ticketOwnerFilter === 'unassigned' && ticket.assignedAgentId) {
      return false;
    }

    if (ticketCategoryFilter !== 'all' && ticket.tag !== ticketCategoryFilter) {
      return false;
    }

    if (ticketEscalationFilter !== 'all' && ticket.escalationReason !== ticketEscalationFilter) {
      return false;
    }

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
        const controller = new AbortController();
        setIsGeneratingReplies(true);
        setSmartReplies([]);
        fetch(`${API_URL}/api/suggest-replies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: selectedTicketId }),
          signal: controller.signal,
        })
          .then(res => res.json())
          .then(data => setSmartReplies(data.suggestions || []))
          .catch(err => { if (err.name !== 'AbortError') setSmartReplies([]); })
          .finally(() => setIsGeneratingReplies(false));
        return () => controller.abort();
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

  useEffect(() => {
    if (activeTab !== 'analytics') return;
    fetch(`${API_URL}/api/metrics/feedback`)
      .then(res => res.json())
      .then(data => setFeedbackAnalytics(data))
      .catch(() => setFeedbackAnalytics(null));
    
    // Fetch time-series metrics
    fetch(`${API_URL}/api/metrics/timeseries?days=${timeseriesDays}`)
      .then(res => res.json())
      .then(data => setTimeseriesMetrics(data || []))
      .catch(() => setTimeseriesMetrics([]));
  }, [activeTab, timeseriesDays]);

  // Auto-select first available company for KB editor when tickets load
  useEffect(() => {
    if (selectedKbCompany) return; // already selected
    const first = Array.from(new Set(tickets.map(t => t.userProfile?.company).filter(Boolean)))[0];
    if (first) setSelectedKbCompany(first);
  }, [tickets]);

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

  const handleGenerateSnippet = () => {
    if (!setupCompanyName.trim()) return;
    setIsGeneratingSnippet(true);
    fetch(`${API_URL}/api/company/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: setupCompanyName.trim() })
    })
      .then(res => res.json())
      .then(data => {
        const publicUrl = API_URL.replace('5001', '5173');
        setSetupSnippet(`<script src="${publicUrl}/widget.js" data-company="${data.company}" data-token="${data.token}"></script>`);
      })
      .catch(() => setSetupSnippet('Error generating snippet...'))
      .finally(() => setIsGeneratingSnippet(false));
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
      isInternal,
      createdAt: new Date().toISOString(),
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

  // Watch for incoming transfer notifications from context
  useEffect(() => {
    if (transferNotification) {
      setIncomingTransfer(transferNotification);
      clearTransferNotification();
      // Auto-dismiss after 8 seconds
      const t = setTimeout(() => setIncomingTransfer(null), 8000);
      return () => clearTimeout(t);
    }
  }, [transferNotification, clearTransferNotification]);

  const handleTransferSubmit = () => {
    if (!selectedTicketId || !transferTargetId) return;
    const selected = tickets.find(t => t.id === selectedTicketId);
    const targetAgent = onlineAgents.find(a => a.agentId === transferTargetId);
    const contextBits = [
      selected?.lastAiConfidenceLabel ? `AI confidence: ${selected.lastAiConfidenceLabel}` : '',
      selected?.escalationReason && selected.escalationReason !== 'none' ? `Escalation reason: ${escalationReasonLabel(selected.escalationReason)}` : '',
      selected?.summary ? `Handoff summary: ${selected.summary}` : '',
    ].filter(Boolean);
    const contextNote = contextBits.length ? `[Context] ${contextBits.join(' | ')}` : '';
    const finalNote = [transferNote.trim(), contextNote].filter(Boolean).join('\n');
    transferTicket(selectedTicketId, transferTargetId, finalNote);
    setShowTransferModal(false);
    setTransferTargetId('');
    setTransferNote('');
    setSelectedTicketId(null);
    setTransferSuccess({ toAgentName: targetAgent?.name ?? 'the agent' });
    setTimeout(() => setTransferSuccess(null), 5000);
  };

  const insertEscalationContext = () => {
    if (!selectedTicket) return;
    const contextBits = [
      selectedTicket.lastAiConfidenceLabel ? `AI confidence: ${selectedTicket.lastAiConfidenceLabel}` : '',
      selectedTicket.escalationReason && selectedTicket.escalationReason !== 'none' ? `Escalation reason: ${escalationReasonLabel(selectedTicket.escalationReason)}` : '',
      selectedTicket.summary ? `Summary: ${selectedTicket.summary}` : '',
    ].filter(Boolean);
    if (!contextBits.length) return;
    const contextLine = `[Context] ${contextBits.join(' | ')}`;
    setReply(prev => prev ? `${prev}\n${contextLine}` : contextLine);
    setIsInternal(true);
  };

  const insertTemplate = (template: any) => {
    setReply(prev => prev ? `${prev}\n${template.content}` : template.content);
    setShowTemplates(false);
    // Increment usage count
    fetch(`${API_URL}/api/canned-responses/${template._id}/use`, { method: 'POST' }).catch(() => {});
  };

  const handleSaveTemplate = async () => {
    if (!templateTitle.trim() || !reply.trim()) return;
    
    setIsSavingTemplate(true);
    try {
      const res = await fetch(`${API_URL}/api/canned-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          title: templateTitle.trim(),
          content: reply.trim(),
          category: templateCategoryInput || 'General',
        }),
      });
      
      if (res.ok) {
        // Refresh templates list
        const templatesRes = await fetch(`${API_URL}/api/canned-responses?agentId=${agentId}`);
        const templates = await templatesRes.json();
        setCannedResponses(templates);
        
        // Reset modal
        setShowSaveTemplateModal(false);
        setTemplateTitle('');
        setTemplateCategoryInput('General');
      }
    } catch (err) {
      console.error('Failed to save template:', err);
    } finally {
      setIsSavingTemplate(false);
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

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ArrowRightLeft size={18} className="text-blue-600" /> Reassign Ticket
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">Reassign this conversation to another online agent.</p>
              </div>
              <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Transfer To</label>
              {onlineAgents.filter(a => a.agentId !== agentId).length === 0 ? (
                <div className="text-sm text-slate-400 bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                  No other agents are currently online.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {onlineAgents.filter(a => a.agentId !== agentId).map(agent => (
                    <button
                      key={agent.agentId}
                      onClick={() => setTransferTargetId(agent.agentId)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all bg-white ${
                        transferTargetId === agent.agentId
                          ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold border border-blue-200/50">
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800">{agent.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                            agent.status === 'available' ? 'bg-emerald-500' :
                            agent.status === 'busy' ? 'bg-amber-500' :
                            'bg-slate-400'
                          }`}></span>
                          <span className={`text-xs font-medium ${
                            agent.status === 'available' ? 'text-emerald-600' :
                            agent.status === 'busy' ? 'text-amber-600' :
                            'text-slate-500'
                          }`}>
                            {agent.status === 'available' ? 'Available' : agent.status === 'busy' ? 'Busy' : 'Away'}
                          </span>
                          {agent.ticketCount !== undefined && (
                            <span className="text-xs text-slate-400 ml-auto">
                              {agent.ticketCount} ticket{agent.ticketCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      {transferTargetId === agent.agentId && (
                        <CheckCircle size={16} className="text-blue-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Handoff Note <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
              <textarea
                value={transferNote}
                onChange={e => setTransferNote(e.target.value)}
                placeholder="e.g. Customer needs billing specialist, already verified account..."
                rows={3}
                className="w-full p-3 rounded-xl border border-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 bg-white placeholder:text-slate-400"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setShowTransferModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleTransferSubmit}
                disabled={!transferTargetId}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2 disabled:opacity-50"
              >
                <ArrowRightLeft size={15} /> Reassign Ticket
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming Transfer Toast */}
      {incomingTransfer && (
        <div className="fixed bottom-6 right-6 z-[120] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="bg-white border border-blue-200 rounded-2xl shadow-2xl p-4 flex gap-3 items-start max-w-sm ring-1 ring-blue-100">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <ArrowRightLeft size={18} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900">Ticket Transferred to You</p>
              <p className="text-xs text-slate-500 mt-0.5">From <span className="font-semibold text-slate-700">{incomingTransfer.fromAgentName}</span></p>
              {incomingTransfer.note && (
                <p className="text-xs text-slate-600 mt-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 italic">"{incomingTransfer.note}"</p>
              )}
              <button
                onClick={() => {
                  setSelectedTicketId(incomingTransfer.ticketId);
                  setActiveTab('queue');
                  setIncomingTransfer(null);
                }}
                className="mt-2.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
              >
                Open Ticket →
              </button>
            </div>
            <button onClick={() => setIncomingTransfer(null)} className="text-slate-400 hover:text-slate-600 shrink-0 p-0.5">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Transfer success toast */}
      {transferSuccess && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl px-5 py-3.5 flex items-center gap-3 min-w-[260px]">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 size={15} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Ticket transferred</p>
              <p className="text-xs text-slate-400 mt-0.5">Handed off to <span className="text-slate-200 font-medium">{transferSuccess.toAgentName}</span></p>
            </div>
            <button onClick={() => setTransferSuccess(null)} className="text-slate-500 hover:text-slate-300 transition-colors p-0.5">
              <X size={14} />
            </button>
          </div>
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
            <button 
              onClick={() => setActiveTab('setup')}
              className={`px-4 py-1.5 text-sm rounded-md transition-all duration-200 font-medium ${activeTab === 'setup' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
            >
              Widget Setup
            </button>
          </div>
          <div className="flex items-center gap-3 text-sm font-medium">
            {/* Status pill — custom styled dropdown */}
            <div className="relative">
              <select
                value={agentStatus}
                onChange={(e) => setAgentStatus(e.target.value as 'available' | 'busy' | 'away')}
                className="appearance-none pl-7 pr-7 py-1.5 rounded-full text-xs font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-900 border transition-colors duration-200 bg-transparent
                  focus:ring-blue-500
                "
                style={{
                  borderColor: agentStatus === 'available' ? '#34d399' : agentStatus === 'busy' ? '#fbbf24' : '#f87171',
                  color:       agentStatus === 'available' ? '#34d399' : agentStatus === 'busy' ? '#fbbf24' : '#f87171',
                }}
              >
                <option value="available" className="bg-slate-900 text-white">Available</option>
                <option value="busy"      className="bg-slate-900 text-white">Busy</option>
                <option value="away"      className="bg-slate-900 text-white">Away</option>
              </select>
              {/* Status dot — left */}
              <span className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${
                agentStatus === 'available' ? 'bg-emerald-400' :
                agentStatus === 'busy'      ? 'bg-amber-400' :
                                              'bg-red-400'
              }`} />
              {/* Chevron — right */}
              <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-60" style={{ color: agentStatus === 'available' ? '#34d399' : agentStatus === 'busy' ? '#fbbf24' : '#f87171' }} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>

            <button
              onClick={() => setSoundEnabled(p => !p)}
              className="text-slate-400 hover:text-white transition-colors p-2 rounded-full hover:bg-slate-800"
              title={soundEnabled ? 'Mute notifications' : 'Enable notifications'}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {}
        <div className="w-[340px] bg-white border-r border-slate-200 flex flex-col z-10 shrink-0 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] relative">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
            <h2 className="font-semibold text-slate-800 text-xs tracking-wider flex items-center gap-2 uppercase">
              <Users size={14} className="text-blue-600" /> Inbox
            </h2>
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-100 shadow-none border border-blue-200/50 text-[10px] py-0">{activeTickets.length} Active</Badge>
              {/* Agent's own status — visible while working the queue */}
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                agentStatus === 'available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                agentStatus === 'busy'      ? 'bg-amber-50  text-amber-700  border-amber-200'  :
                                              'bg-red-50    text-red-600    border-red-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  agentStatus === 'available' ? 'bg-emerald-500' :
                  agentStatus === 'busy'      ? 'bg-amber-500' :
                                                'bg-red-500'
                }`} />
                {agentStatus === 'available' ? 'Available' : agentStatus === 'busy' ? 'Busy' : 'Away'}
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col p-3 gap-2 bg-slate-50/50">
            <div className="space-y-3 mb-3">
              <div className="flex gap-2 flex-wrap items-center">
                <Input
                  value={ticketSearch}
                  onChange={e => setTicketSearch(e.target.value)}
                  placeholder="Search tickets..."
                  className="flex-1 min-w-[220px] text-sm"
                />
                <div className="flex gap-2 flex-wrap">
                  {['all', 'mine', 'unassigned'].map((ownerFilter) => (
                    <button
                      key={ownerFilter}
                      type="button"
                      onClick={() => setTicketOwnerFilter(ownerFilter as 'all' | 'mine' | 'unassigned')}
                      className={`text-xs font-semibold rounded-xl py-2 px-3 transition-all ${ticketOwnerFilter === ownerFilter ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700'}`}
                    >
                      {ownerFilter === 'all' ? 'All' : ownerFilter === 'mine' ? 'My tickets' : 'Unassigned'}
                    </button>
                  ))}
                </div>
                <select
                  value={ticketCategoryFilter}
                  onChange={e => setTicketCategoryFilter(e.target.value)}
                  className="w-[110px] text-xs border border-slate-200 rounded-md bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Categories</option>
                  {uniqueCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <select
                  value={ticketEscalationFilter}
                  onChange={e => setTicketEscalationFilter(e.target.value as 'all' | 'low_confidence' | 'sensitive_account_action' | 'user_requested_human')}
                  className="w-[130px] text-xs border border-slate-200 rounded-md bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Escalations</option>
                  <option value="low_confidence">Low Confidence</option>
                  <option value="sensitive_account_action">Sensitive Action</option>
                  <option value="user_requested_human">User Requested</option>
                </select>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {['all', 'open', 'pending', 'on-hold', 'resolved'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setTicketStatusFilter(status as 'all' | 'open' | 'pending' | 'on-hold' | 'resolved')}
                    className={`text-xs font-semibold rounded-xl py-2 transition-all ${ticketStatusFilter === status ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700'}`}
                  >
                    {status === 'all' ? 'All' : status === 'on-hold' ? 'On Hold' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {tickets.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="relative mb-5">
                  <div className="w-20 h-20 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shadow-sm">
                    <CheckCircle2 size={36} className="text-emerald-500" />
                  </div>
                  <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-emerald-400 border-2 border-white flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">0</span>
                  </div>
                </div>
                <p className="font-semibold text-slate-700 text-sm">You're all caught up!</p>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed max-w-[180px]">
                  No open tickets right now. New escalations will appear here automatically.
                </p>
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-4 shadow-sm">
                  <MessageSquare size={28} className="text-slate-400" />
                </div>
                <p className="font-semibold text-slate-600 text-sm">No matches found</p>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed max-w-[180px]">
                  Try adjusting your search or filter to find what you're looking for.
                </p>
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
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold text-sm ${isResolved ? 'text-slate-500' : 'text-slate-900'} ${selectedTicketId === ticket.id ? 'text-blue-900' : ''}`}>
                            {ticket.customerName}
                          </span>
                          {/* Unread badge */}
                          {!isResolved && (unreadCounts[ticket.id] ?? 0) > 0 && (
                            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold shrink-0">
                              {unreadCounts[ticket.id]}
                            </span>
                          )}
                        </div>
                        {/* Company source badge */}
                        {ticket.userProfile?.company && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block shrink-0"></span>
                            {ticket.userProfile.company}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="secondary" className={`text-[9px] py-0 h-4 border ${statusBadgeClass(ticket.status)}`}>
                            {statusLabel(ticket.status)}
                          </Badge>
                          {ticket.tag && <Badge variant="outline" className="text-[9px] py-0 h-4 text-slate-500 bg-white border-slate-200">{ticket.tag}</Badge>}
                          {ticket.lastAiConfidenceLabel && (
                            <Badge variant="outline" className={`text-[9px] py-0 h-4 border ${confidenceBadgeClass(ticket.lastAiConfidenceLabel)}`}>
                              AI {ticket.lastAiConfidenceLabel}
                            </Badge>
                          )}
                          {ticket.escalationReason && ticket.escalationReason !== 'none' && (
                            <Badge variant="outline" className="text-[9px] py-0 h-4 text-violet-700 bg-violet-50 border-violet-200">
                              {escalationReasonLabel(ticket.escalationReason)}
                            </Badge>
                          )}
                          {ticket.autoAssignedAt && (
                            <Badge variant="outline" className="text-[9px] py-0 h-4 text-blue-700 bg-blue-50 border-blue-200">
                              Auto-assigned
                            </Badge>
                          )}
                          {ticket.assignedAgentName ? (
                            <Badge variant="outline" className="text-[9px] py-0 h-4 text-slate-600 bg-slate-50 border-slate-200">
                              Assigned to {ticket.assignedAgentName}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] py-0 h-4 text-slate-500 bg-slate-100 border-slate-200">
                              Unassigned
                            </Badge>
                          )}
                          {/* SLA timer — only on active tickets */}
                          {!isResolved && <SlaTimer escalatedAt={ticket.escalatedAt} />}
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
              {/* Header */}
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-zinc-900">Platform Analytics</h1>
                  <p className="text-zinc-500">Real-time metrics for your SmartTicket deployment.</p>
                </div>
                {/* Company filter */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Filter by Company</label>
                  <select
                    value={analyticsCompanyFilter}
                    onChange={e => setAnalyticsCompanyFilter(e.target.value)}
                    className="text-sm border border-zinc-200 rounded-lg px-3 py-1.5 bg-white text-zinc-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Companies</option>
                    {Array.from(new Set(tickets.map(t => t.userProfile?.company).filter(Boolean))).sort().map(c => (
                      <option key={c} value={c!}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Company breakdown bar chart */}
              {(() => {
                const companyMap: Record<string, { total: number; escalated: number; resolved: number }> = {};
                tickets.forEach(t => {
                  const co = t.userProfile?.company || 'Direct / Unknown';
                  if (!companyMap[co]) companyMap[co] = { total: 0, escalated: 0, resolved: 0 };
                  companyMap[co].total++;
                  if (t.status === 'resolved') companyMap[co].resolved++;
                  else companyMap[co].escalated++;
                });
                const companies = Object.entries(companyMap).sort((a, b) => b[1].total - a[1].total);
                const maxTotal = Math.max(...companies.map(([, v]) => v.total), 1);
                return companies.length > 0 ? (
                  <div className="mb-6 bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
                    <h2 className="text-base font-semibold text-zinc-900 mb-4">Tickets by Company</h2>
                    <div className="space-y-3">
                      {companies.map(([co, stats]) => (
                        <div key={co}
                          className={`cursor-pointer rounded-lg px-1 py-0.5 transition-colors ${
                            analyticsCompanyFilter === co ? 'ring-2 ring-blue-400' : 'hover:bg-zinc-50'
                          }`}
                          onClick={() => setAnalyticsCompanyFilter(analyticsCompanyFilter === co ? 'all' : co)}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-teal-500 inline-block"></span>
                              <span className="text-sm font-medium text-zinc-800">{co}</span>
                            </div>
                            <span className="text-xs font-semibold text-zinc-500">{stats.total} ticket{stats.total !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="w-full bg-zinc-100 rounded-full h-2 flex overflow-hidden">
                            <div
                              className="bg-teal-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${(stats.total / maxTotal) * 100}%` }}
                            />
                          </div>
                          <div className="flex gap-3 mt-1">
                            <span className="text-[10px] text-zinc-400">{stats.resolved} resolved</span>
                            <span className="text-[10px] text-zinc-400">{stats.escalated} escalated</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Filtered metrics — respects analyticsCompanyFilter */}
              {(() => {
                const filtered = analyticsCompanyFilter === 'all'
                  ? tickets
                  : tickets.filter(t => (t.userProfile?.company || 'Direct / Unknown') === analyticsCompanyFilter);
                const filteredAiResolved = analyticsCompanyFilter === 'all' ? metrics.aiResolved : filtered.filter(t => t.status === 'resolved' && !t.escalationReason).length;
                const filteredEscalated = analyticsCompanyFilter === 'all' ? metrics.escalated : filtered.filter(t => t.escalationReason && t.escalationReason !== 'none').length;
                const filteredHumanResolved = analyticsCompanyFilter === 'all' ? metrics.humanResolved : filtered.filter(t => t.status === 'resolved' && t.escalationReason && t.escalationReason !== 'none').length;
                const totalFiltered = analyticsCompanyFilter === 'all' ? (metrics.aiResolved + metrics.escalated) : filtered.length;

                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
                        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center mb-4">
                          <MessageSquare className="text-indigo-600" size={20} />
                        </div>
                        <span className="text-zinc-500 text-sm font-medium">Total Interactions</span>
                        <span className="text-3xl font-bold text-zinc-900 mt-1">{totalFiltered}</span>
                      </div>

                      <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center mb-4">
                          <Bot className="text-emerald-600" size={20} />
                        </div>
                        <span className="text-zinc-500 text-sm font-medium">Resolved by AI Only</span>
                        <span className="text-3xl font-bold text-zinc-900 mt-1">{filteredAiResolved}</span>
                        <span className="text-xs text-emerald-600 font-medium mt-2 bg-emerald-50 px-2 py-1 rounded-md self-start">
                          {totalFiltered > 0 ? Math.round((filteredAiResolved / totalFiltered) * 100) : 0}% Deflection Rate
                        </span>
                      </div>

                      <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
                        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center mb-4">
                          <Users className="text-amber-600" size={20} />
                        </div>
                        <span className="text-zinc-500 text-sm font-medium">Escalated to Human</span>
                        <span className="text-3xl font-bold text-zinc-900 mt-1">{filteredEscalated}</span>
                      </div>

                      <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                          <CheckCircle className="text-blue-600" size={20} />
                        </div>
                        <span className="text-zinc-500 text-sm font-medium">Resolved by Human</span>
                        <span className="text-3xl font-bold text-zinc-900 mt-1">{filteredHumanResolved}</span>
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

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Helpful Rate</p>
                        <p className="text-2xl font-bold text-zinc-900 mt-2">
                          {feedbackAnalytics ? `${Math.round(feedbackAnalytics.helpfulRate * 100)}%` : 'N/A'}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {feedbackAnalytics ? `${feedbackAnalytics.helpfulCount}/${feedbackAnalytics.totalFeedback} marked helpful` : 'No feedback submitted yet'}
                        </p>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Low Confidence Helpful Rate</p>
                        <p className="text-2xl font-bold text-zinc-900 mt-2">
                          {feedbackAnalytics ? `${Math.round(feedbackAnalytics.lowConfidenceHelpfulRate * 100)}%` : 'N/A'}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {feedbackAnalytics ? `Sample size: ${feedbackAnalytics.lowConfidenceSampleSize}` : 'No low-confidence samples yet'}
                        </p>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Top Negative Signals</p>
                        <p className="text-2xl font-bold text-zinc-900 mt-2">
                          {feedbackAnalytics ? feedbackAnalytics.topNegativeReasons.length : 0}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {feedbackAnalytics?.topNegativeReasons?.[0]
                            ? `${feedbackAnalytics.topNegativeReasons[0].reason.replaceAll('_', ' ')} (${feedbackAnalytics.topNegativeReasons[0].count})`
                            : 'No negative signals yet'}
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}

              <div className="mt-6 bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
                <h2 className="text-lg font-semibold text-zinc-900">KB Improvement Suggestions</h2>
                <p className="text-sm text-zinc-500 mt-1">Suggestions generated from top negative feedback reasons.</p>
                {feedbackAnalytics?.kbImprovementSuggestions?.length ? (
                  <div className="mt-4 space-y-3">
                    {feedbackAnalytics.kbImprovementSuggestions.map(item => (
                      <div key={item.reason} className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
                        <p className="text-sm font-semibold text-zinc-800">
                          {item.reason.replaceAll('_', ' ')} <span className="text-zinc-400 font-normal">({item.count})</span>
                        </p>
                        <p className="text-sm text-zinc-600 mt-1">{item.suggestion}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400 mt-4">No KB suggestions yet. Collect more AI feedback to generate recommendations.</p>
                )}
              </div>

              {/* Time-Series Metrics Chart */}
              <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-zinc-900">Metrics Trends</h2>
                    <p className="text-sm text-zinc-500 mt-1">Performance over the last {timeseriesDays} days</p>
                  </div>
                  <select
                    value={timeseriesDays}
                    onChange={(e) => setTimeseriesDays(parseInt(e.target.value))}
                    className="text-sm border border-zinc-200 rounded-lg px-3 py-1.5 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                  </select>
                </div>

                {timeseriesMetrics.length > 0 ? (
                  <div className="space-y-4">
                    {/* Tickets Resolved Trend */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-zinc-700">Daily Resolutions</span>
                        <span className="text-xs text-zinc-400">
                          {timeseriesMetrics[timeseriesMetrics.length - 1]?.humanResolved || 0} today
                        </span>
                      </div>
                      <div className="flex items-end gap-1 h-16 bg-zinc-50 p-2 rounded-lg">
                        {timeseriesMetrics.map((m, i) => {
                          const max = Math.max(...timeseriesMetrics.map(x => x.humanResolved || 0), 1);
                          const height = ((m.humanResolved || 0) / max) * 100;
                          return (
                            <div
                              key={i}
                              className="flex-1 bg-emerald-500 rounded-sm hover:bg-emerald-600 transition-colors"
                              style={{ height: `${Math.max(height, 5)}%` }}
                              title={`${m.humanResolved || 0} resolved on ${new Date(m.date).toLocaleDateString()}`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Escalations Trend */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-zinc-700">Daily Escalations</span>
                        <span className="text-xs text-zinc-400">
                          {timeseriesMetrics[timeseriesMetrics.length - 1]?.escalated || 0} today
                        </span>
                      </div>
                      <div className="flex items-end gap-1 h-16 bg-zinc-50 p-2 rounded-lg">
                        {timeseriesMetrics.map((m, i) => {
                          const max = Math.max(...timeseriesMetrics.map(x => x.escalated || 0), 1);
                          const height = ((m.escalated || 0) / max) * 100;
                          return (
                            <div
                              key={i}
                              className="flex-1 bg-amber-500 rounded-sm hover:bg-amber-600 transition-colors"
                              style={{ height: `${Math.max(height, 5)}%` }}
                              title={`${m.escalated || 0} escalated on ${new Date(m.date).toLocaleDateString()}`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* CSAT Trend */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-zinc-700">Daily Avg CSAT</span>
                        <span className="text-xs text-zinc-400">
                          {timeseriesMetrics[timeseriesMetrics.length - 1]?.csatCount ? 
                            (timeseriesMetrics[timeseriesMetrics.length - 1].totalCsatScore / timeseriesMetrics[timeseriesMetrics.length - 1].csatCount).toFixed(1) 
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-end gap-1 h-16 bg-zinc-50 p-2 rounded-lg">
                        {timeseriesMetrics.map((m, i) => {
                          const score = m.csatCount ? m.totalCsatScore / m.csatCount : 0;
                          const height = (score / 5) * 100;
                          return (
                            <div
                              key={i}
                              className="flex-1 bg-blue-500 rounded-sm hover:bg-blue-600 transition-colors"
                              style={{ height: `${Math.max(height, 5)}%` }}
                              title={`${score.toFixed(1)}/5 on ${new Date(m.date).toLocaleDateString()}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400 text-center py-8">No historical data yet. Check back tomorrow!</p>
                )}
              </div>
            </div>
          ) : activeTab === 'setup' ? (
            <div className="p-8 max-w-4xl mx-auto w-full animate-in fade-in flex flex-col h-full gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                    <Sparkles className="text-blue-600" /> Widget Embed Setup
                  </h1>
                  <p className="text-zinc-500 mt-1">Generate a secure embed code for your company website.</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm flex flex-col gap-5">
                <div>
                  <label className="block text-sm font-semibold text-zinc-800 mb-1.5">Your Company Name</label>
                  <p className="text-xs text-zinc-500 mb-3">This name will be matched with the Knowledge Base you create.</p>
                  <div className="flex gap-3">
                    <Input 
                      value={setupCompanyName} 
                      onChange={e => setSetupCompanyName(e.target.value)} 
                      placeholder="e.g. Stark Industries" 
                      className="max-w-sm border-zinc-200 focus-visible:ring-blue-500 text-sm" 
                    />
                    <Button 
                      onClick={handleGenerateSnippet} 
                      disabled={isGeneratingSnippet || !setupCompanyName.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {isGeneratingSnippet ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                      Generate Embed Snippet
                    </Button>
                  </div>
                </div>

                <div className="mt-2">
                  <label className="block text-sm font-semibold text-zinc-800 mb-2 flex justify-between items-center">
                    <span>Generated Code Snippet</span>
                    {setupSnippet && (
                      <button 
                        onClick={() => navigator.clipboard.writeText(setupSnippet)}
                        className="text-blue-600 text-xs font-bold hover:text-blue-800"
                      >
                        Copy to Clipboard
                      </button>
                    )}
                  </label>
                  <textarea 
                    readOnly 
                    value={setupSnippet}
                    className="w-full text-xs font-mono p-4 rounded-xl border border-zinc-200 bg-slate-800 text-blue-100 h-28 resize-none shadow-inner focus:outline-none placeholder:text-slate-600" 
                    placeholder="Click 'Generate Embed Snippet' to get your code snippet..."
                  />
                  <p className="text-xs text-zinc-500 mt-3 flex items-start gap-1.5 bg-zinc-50 p-2.5 rounded-lg border border-zinc-100">
                    <span className="text-blue-600 mt-0.5"><Database size={14} /></span>
                    Place this script tag securely inside the <code>&lt;body&gt;</code> of your website index. It dynamically loads the SmartTicket chatbot pinned to the bottom right corner.
                  </p>
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
                      {Array.from(new Set(tickets.map(t => t.userProfile?.company).filter(Boolean))).sort().map(c => (
                        <option key={c} value={c!}>{c}</option>
                      ))}
                      {tickets.filter(t => t.userProfile?.company).length === 0 && (
                        <option value="" disabled>No companies yet — embed the widget to get started</option>
                      )}
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
                  {kbText ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-400">{kbText.length.toLocaleString()} characters</span>
                      <button onClick={() => setKbText('')} className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700">
                        <Trash2 size={12} /> Clear all
                      </button>
                    </div>
                  ) : null}
                </div>

                {!kbText && (
                  <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4 flex gap-3">
                    <div className="shrink-0 mt-0.5">
                      <Sparkles size={16} className="text-indigo-500" />
                    </div>
                    <div className="text-xs text-indigo-700 space-y-2 leading-relaxed">
                      <p className="font-semibold text-indigo-800">How the AI uses this</p>
                      <p>Anything you write here is injected into every AI chat as background context. The AI uses it to answer product questions, pricing, policies, and FAQs without escalating.</p>
                      <p className="font-medium text-indigo-800 mt-1">Suggested format:</p>
                      <ul className="list-disc list-inside space-y-1 text-indigo-600">
                        <li>Company name and what your product does</li>
                        <li>Pricing tiers and plan limits</li>
                        <li>Common troubleshooting steps</li>
                        <li>Support hours and escalation policy</li>
                        <li>FAQs — one question + answer per paragraph</li>
                      </ul>
                    </div>
                  </div>
                )}

                <textarea
                  value={kbText}
                  onChange={e => setKbText(e.target.value)}
                  placeholder={`Example:\n\nAcmeCorp is a B2B SaaS project management tool.\n\nPricing:\n- Starter: Free, up to 3 users\n- Pro: $10/mo, unlimited users\n- Enterprise: $50/mo, SSO + priority support\n\nSupport hours: Mon–Fri, 9AM–5PM EST.\nFor billing issues, always escalate to a human agent.`}
                  className="flex-1 w-full p-4 rounded-xl border border-zinc-200 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-mono text-sm min-h-[200px] bg-white text-zinc-800 placeholder:text-zinc-300"
                />
              </div>
            </div>
          ) : !selectedTicket ? (
            <div className="flex-1 flex items-center justify-center bg-slate-50 animate-in fade-in duration-500">
              <div className="flex flex-col items-center text-center max-w-sm px-8">
                {/* Illustration */}
                <div className="relative mb-6">
                  <div className="w-24 h-24 rounded-3xl bg-white border border-slate-200 shadow-md flex items-center justify-center">
                    <MessageSquare size={36} className="text-blue-400" />
                  </div>
                  {/* decorative bubbles */}
                  <div className="absolute -top-2 -right-3 w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shadow-sm">
                    <Bot size={14} className="text-blue-400" />
                  </div>
                  <div className="absolute -bottom-2 -left-3 w-7 h-7 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shadow-sm">
                    <CheckCircle2 size={13} className="text-emerald-400" />
                  </div>
                </div>
                <p className="font-semibold text-slate-700 text-base">No conversation open</p>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                  Select a ticket from the inbox to view the full conversation and reply to the customer.
                </p>
                {tickets.length > 0 && (
                  <div className="mt-5 flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-600 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                    {tickets.filter(t => t.status !== 'resolved').length} ticket{tickets.filter(t => t.status !== 'resolved').length !== 1 ? 's' : ''} waiting in queue
                  </div>
                )}
              </div>
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
                      <Badge variant="secondary" className={`text-[11px] py-1 h-6 rounded-full ${statusBadgeClass(selectedTicket.status)} ml-2`}>{statusLabel(selectedTicket.status)}</Badge>
                      {selectedTicket.lastAiConfidenceLabel && (
                        <Badge variant="outline" className={`text-[11px] py-1 h-6 rounded-full border ${confidenceBadgeClass(selectedTicket.lastAiConfidenceLabel)}`}>
                          AI {selectedTicket.lastAiConfidenceLabel}
                          {typeof selectedTicket.lastAiConfidenceScore === 'number' ? ` (${selectedTicket.lastAiConfidenceScore})` : ''}
                        </Badge>
                      )}
                      {selectedTicket.escalationReason && selectedTicket.escalationReason !== 'none' && (
                        <Badge variant="outline" className="text-[11px] py-1 h-6 rounded-full text-violet-700 bg-violet-50 border-violet-200">
                          {escalationReasonLabel(selectedTicket.escalationReason)}
                        </Badge>
                      )}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-slate-500">
                        Assigned to {selectedTicket.assignedAgentName ?? 'no one yet'}
                      </span>
                      {!selectedTicket.assignedAgentName && normalizeStatus(selectedTicket.status) !== 'resolved' && (
                        <Button
                          variant="secondary"
                          onClick={() => assignTicket(selectedTicket.id, agentId, agentName)}
                          className="text-xs font-semibold px-3 py-1 rounded-lg"
                        >
                          Claim ticket
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {normalizeStatus(selectedTicket.status) !== 'resolved' && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => { setShowTransferModal(true); setTransferTargetId(''); setTransferNote(''); }}
                          className="gap-2 text-blue-700 border-blue-300 hover:bg-blue-50 hover:border-blue-400 transition-colors font-semibold rounded-lg shadow-sm"
                        >
                          <ArrowRightLeft size={16} /> Transfer
                        </Button>
                        <Button variant="outline" onClick={handleResolve} className="gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:border-emerald-400 transition-colors font-semibold rounded-lg shadow-sm">
                          <CheckCircle2 size={16} /> Mark as Resolved
                        </Button>
                        {(['open', 'pending', 'on-hold'] as const).map(statusOption => {
                          if (normalizeStatus(selectedTicket.status) === statusOption) return null;
                          const statusStyles: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
                            open: {
                              label: 'Set Open',
                              cls: 'bg-indigo-500 hover:bg-indigo-600 text-white border-indigo-500 shadow-sm',
                              icon: <span className="w-2 h-2 rounded-full bg-white opacity-90 inline-block" />,
                            },
                            pending: {
                              label: 'Set Pending',
                              cls: 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-sm',
                              icon: <span className="w-2 h-2 rounded-full bg-white opacity-90 inline-block" />,
                            },
                            'on-hold': {
                              label: 'Set On Hold',
                              cls: 'bg-rose-500 hover:bg-rose-600 text-white border-rose-500 shadow-sm',
                              icon: <span className="w-2 h-2 rounded-full bg-white opacity-90 inline-block" />,
                            },
                          };
                          const s = statusStyles[statusOption];
                          return (
                            <Button
                              key={statusOption}
                              onClick={() => updateTicketStatus(selectedTicket.id, statusOption)}
                              className={`gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150 ${s.cls}`}
                            >
                              {s.icon}
                              {s.label}
                            </Button>
                          );
                        })}
                      </>
                    )}
                  </div>
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
                        {selectedTicket.escalationReason && selectedTicket.escalationReason !== 'none' && (
                          <span className="block text-xs mt-1.5 text-violet-700">
                            Escalation reason: {escalationReasonLabel(selectedTicket.escalationReason)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {}
              <div className="flex-1 p-8 overflow-y-auto" ref={scrollRef}>
                <div className="max-w-3xl mx-auto space-y-6 pb-4">
                  {isLoadingMessages ? (
                    // Skeleton bubbles — alternating left/right to mimic a real conversation
                    <>
                      {[
                        { align: 'start', widths: ['w-48', 'w-32'] },
                        { align: 'end',   widths: ['w-56'] },
                        { align: 'start', widths: ['w-64', 'w-40', 'w-52'] },
                        { align: 'end',   widths: ['w-44', 'w-36'] },
                        { align: 'start', widths: ['w-52'] },
                      ].map((row, i) => (
                        <div key={i} className={`flex w-full ${row.align === 'end' ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-[70%] p-4 rounded-2xl bg-slate-100 border border-slate-200 space-y-2 animate-pulse">
                            <div className="h-2.5 w-16 bg-slate-200 rounded-full" />
                            {row.widths.map((w, j) => (
                              <div key={j} className={`h-3 ${w} bg-slate-200 rounded-full`} />
                            ))}
                            <div className="h-2 w-10 bg-slate-200 rounded-full mt-1" />
                          </div>
                        </div>
                      ))}
                    </>
                  ) : null}
                  {!isLoadingMessages && selectedTicket.messages.map((msg) => {
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
                          {formatMsgTime(msg.createdAt) && (
                            <div className={`text-[10px] mt-1.5 ${isAgent ? (msg.isInternal ? 'text-amber-500' : 'text-blue-200') : 'text-slate-400'}`}>
                              {formatMsgTime(msg.createdAt)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {selectedTicketId && typingIndicators[selectedTicketId]?.user && normalizeStatus(selectedTicket.status) !== 'resolved' && (
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
              {normalizeStatus(selectedTicket.status) !== 'resolved' ? (
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
                        onClick={() => setShowTemplates(!showTemplates)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
                          showTemplates ? 'bg-blue-100 text-blue-900 shadow-sm border border-blue-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <FileText size={16} className={showTemplates ? "" : "opacity-50"} />
                        Templates
                      </button>
                      {reply.trim() && (
                        <button
                          type="button"
                          onClick={() => setShowSaveTemplateModal(true)}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold text-emerald-700 hover:bg-emerald-50 transition-all"
                          title="Save this reply as a template"
                        >
                          <Save size={16} />
                          Save
                        </button>
                      )}
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
                      <button
                        type="button"
                        onClick={insertEscalationContext}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-violet-700 hover:bg-violet-50 transition-all"
                        title="Insert AI confidence and escalation context"
                      >
                        + AI Context
                      </button>
                    </div>
                    <Button type="submit" disabled={!reply.trim() && !attachment} className={`h-12 px-6 rounded-xl font-bold transition-all shadow-sm ${isInternal ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
                      <Send size={18} className="mr-2" /> {isInternal ? 'Save' : 'Send'}
                    </Button>
                  </form>

                  {/* Templates Panel */}
                  {showTemplates && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-96 overflow-hidden flex flex-col">
                      <div className="p-3 border-b border-slate-200 bg-white flex flex-col gap-2">
                        <input
                          type="text"
                          placeholder="Search templates..."
                          value={templateSearch}
                          onChange={(e) => setTemplateSearch(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                          value={templateCategory}
                          onChange={(e) => setTemplateCategory(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="all">All Categories</option>
                          {Array.from(new Set(cannedResponses.map(r => r.category))).map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                      <div className="overflow-y-auto flex-1">
                        {isLoadingTemplates ? (
                          <div className="p-4 text-center text-slate-500 text-sm">Loading templates...</div>
                        ) : cannedResponses.length === 0 ? (
                          <div className="p-4 text-center text-slate-500 text-sm">No templates yet. Save your first response!</div>
                        ) : (
                          cannedResponses
                            .filter(r => (templateCategory === 'all' || r.category === templateCategory) && r.title.toLowerCase().includes(templateSearch.toLowerCase()))
                            .map(response => (
                              <button
                                key={response._id}
                                type="button"
                                onClick={() => insertTemplate(response)}
                                className="w-full px-4 py-3 text-left border-b border-slate-100 hover:bg-blue-50 transition-colors last:border-b-0"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm text-slate-900">{response.title}</div>
                                    <div className="text-xs text-slate-500 mt-0.5 truncate">{response.content.substring(0, 50)}...</div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="outline" className="text-[10px] px-1.5 h-4 bg-slate-50 text-slate-600 border-slate-200">{response.category}</Badge>
                                      {response.usageCount > 0 && (
                                        <span className="text-[10px] text-slate-400">Used {response.usageCount}x</span>
                                      )}
                                    </div>
                                  </div>
                                  {response.isFavorite && (
                                    <Star size={14} className="text-amber-500 fill-amber-500 shrink-0 mt-1" />
                                  )}
                                </div>
                              </button>
                            ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Save Template Modal */}
                  {showSaveTemplateModal && (
                    <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-150">
                      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Save size={18} className="text-emerald-600" /> Save as Template
                          </h3>
                          <button onClick={() => setShowSaveTemplateModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                            <X size={20} />
                          </button>
                        </div>

                        <div className="flex flex-col gap-3">
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Template Title</label>
                            <input
                              type="text"
                              value={templateTitle}
                              onChange={(e) => setTemplateTitle(e.target.value)}
                              placeholder="e.g., Password Reset Instructions"
                              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                              autoFocus
                            />
                          </div>

                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Category</label>
                            <select
                              value={templateCategoryInput}
                              onChange={(e) => setTemplateCategoryInput(e.target.value)}
                              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                            >
                              <option value="General">General</option>
                              <option value="Billing">Billing</option>
                              <option value="Technical">Technical</option>
                              <option value="Sales">Sales</option>
                              <option value="Account">Account</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Preview</label>
                            <div className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 max-h-24 overflow-y-auto">
                              {reply.substring(0, 200)}{reply.length > 200 ? '...' : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                          <button
                            onClick={() => setShowSaveTemplateModal(false)}
                            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors text-sm"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveTemplate}
                            disabled={!templateTitle.trim() || isSavingTemplate}
                            className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 flex items-center justify-center disabled:opacity-50 transition-colors text-sm"
                          >
                            {isSavingTemplate ? (
                              <>
                                <Loader2 size={15} className="animate-spin" /> Saving...
                              </>
                            ) : (
                              <>
                                <Save size={15} /> Save Template
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
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
