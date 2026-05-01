import React from 'react';
import { useTickets } from '@/context/TicketContext';
import { Button, Input, Badge } from '@/components/ui';
import { ArrowLeft, Send, User, Bot, CheckCircle } from 'lucide-react';

export const TicketDetail = () => {
  const { activeTicket, setActiveTicket } = useTickets();
  const [message, setMessage] = React.useState('');

  if (!activeTicket) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] animate-in slide-in-from-right-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setActiveTicket(null)}
            className="rounded-2xl"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{activeTicket.customerName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="info">{activeTicket.status}</Badge>
              <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">ID: {activeTicket.id}</span>
            </div>
          </div>
        </div>
        <Button variant="outline" className="border-emerald-100 text-emerald-600 hover:bg-emerald-50 rounded-2xl" leftIcon={<CheckCircle size={18} />}>
          Resolve Ticket
        </Button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {activeTicket.messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className={`flex gap-3 max-w-[80%] ${msg.sender === 'user' ? 'flex-row' : 'flex-row-reverse'}`}>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  msg.sender === 'user' ? 'bg-slate-100 text-slate-500' : 'bg-blue-600 text-white'
                }`}>
                  {msg.sender === 'user' ? <User size={18} /> : <Bot size={18} />}
                </div>
                <div className={`p-4 rounded-[1.5rem] text-sm font-medium leading-relaxed ${
                  msg.sender === 'user' 
                    ? 'bg-slate-50 text-slate-900 rounded-tl-none' 
                    : 'bg-blue-600 text-white rounded-tr-none shadow-lg shadow-blue-600/10'
                }`}>
                  {msg.text}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Input 
                placeholder="Type your reply..." 
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="bg-white border-none shadow-sm focus:ring-blue-600/20"
              />
            </div>
            <Button 
              className="rounded-2xl h-[42px] px-6" 
              rightIcon={<Send size={18} />}
              disabled={!message.trim()}
            >
              Reply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
