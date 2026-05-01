import React from 'react';
import { useTickets } from '@/context/TicketContext';
import { Button, Input, Badge } from '@/components/ui';
import { ArrowLeft, Send, User, Bot, CheckCircle, Mail, Building, ShieldCheck, Sparkles, Search, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export const TicketDetail = () => {
  const { activeTicket, setActiveTicket } = useTickets();
  const [message, setMessage] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeTicket?.messages]);

  if (!activeTicket) return null;

  return (
    <div className="flex gap-8 h-[calc(100vh-120px)] animate-in fade-in slide-in-from-right-8 duration-700">
      {/* Main Conversation Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setActiveTicket(null)} className="rounded-2xl hover:bg-slate-100">
              <ArrowLeft size={20} />
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{activeTicket.customerName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={activeTicket.priority === 'urgent' ? 'danger' : 'info'}>{activeTicket.priority}</Badge>
                <div className="w-1 h-1 bg-slate-300 rounded-full" />
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">{activeTicket.id}</span>
              </div>
            </div>
          </div>
          <Button variant="outline" className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 rounded-2xl font-bold text-xs" leftIcon={<CheckCircle size={16} />}>
            Resolve
          </Button>
        </header>

        <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30">
            {activeTicket.messages.map((msg, i) => {
              const isBot = msg.sender === 'bot';
              const isUser = msg.sender === 'user';
              const isInternal = msg.isInternal;

              if (isInternal || (isBot && msg.text.includes('Handing off'))) {
                return (
                  <div key={i} className="flex justify-center">
                    <div className="bg-amber-50 text-amber-700 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border border-amber-100 flex items-center gap-2">
                      <ShieldCheck size={12} /> {msg.text}
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} className={cn('flex flex-col', isUser ? 'items-start' : 'items-end')}>
                  <div className={cn('flex gap-3 max-w-[75%]', isUser ? 'flex-row' : 'flex-row-reverse')}>
                    <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1', isUser ? 'bg-slate-200 text-slate-500' : 'bg-blue-600 text-white')}>
                      {isUser ? <User size={14} /> : <Bot size={14} />}
                    </div>
                    <div className={cn('p-4 rounded-2xl text-sm leading-relaxed font-medium', isUser ? 'bg-white text-slate-900 border border-slate-100 rounded-tl-none shadow-sm' : 'bg-blue-600 text-white rounded-tr-none shadow-lg shadow-blue-600/10')}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-6 bg-white border-t border-slate-100">
            <div className="relative group">
              <textarea 
                placeholder="Type your message..." 
                className="w-full bg-slate-50 border-none rounded-3xl px-6 py-4 pr-16 text-sm font-medium focus:ring-2 focus:ring-blue-600/10 transition-all resize-none min-h-[56px] max-h-32 shadow-inner"
                rows={1}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <button disabled={!message.trim()} className="absolute right-3 bottom-3 p-2 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 disabled:opacity-30 disabled:hover:bg-blue-600 transition-all shadow-lg shadow-blue-600/20">
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Intelligence Sidebar */}
      <div className="w-80 space-y-6 animate-in slide-in-from-right-8 duration-1000 delay-150">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Contextual KB</h3>
            <div className="space-y-4">
              <div className="relative">
                <Input 
                  placeholder={`Search ${activeTicket.userProfile?.company || 'FlowMint'} docs...`}
                  icon={<Search size={14} />}
                  className="bg-slate-50 border-none h-10 text-xs"
                />
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
                <BookOpen size={16} className="text-blue-600 mt-1 shrink-0" />
                <div>
                  <p className="text-[11px] font-bold text-slate-900">Recommended Guide</p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Troubleshooting password resets for {activeTicket.userProfile?.company || 'FlowMint'} customers.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-50">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Customer Info</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-slate-600">
                <Mail size={16} className="text-slate-400" />
                <span className="text-sm font-bold truncate">{activeTicket.userProfile?.email || 'customer@example.com'}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600">
                <Building size={16} className="text-slate-400" />
                <span className="text-sm font-bold">{activeTicket.userProfile?.company || 'FlowMint'}</span>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-50">
            <div className="flex items-center gap-2 mb-4 text-blue-600">
              <Sparkles size={16} />
              <h3 className="text-xs font-bold uppercase tracking-widest">AI Summary</h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-500 font-medium bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50">
              {activeTicket.summary || 'Analyzing the conversation history to provide a concise summary...'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
