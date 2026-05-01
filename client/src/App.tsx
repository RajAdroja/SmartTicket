import React from 'react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Button, Input, Badge } from '@/components/ui'
import { Search } from 'lucide-react'
import { TicketProvider, useTickets } from '@/context/TicketContext'
import { TicketList } from '@/components/tickets/TicketList'
import { TicketDetail } from '@/components/tickets/TicketDetail'

function Dashboard() {
  const { metrics, tickets, activeTicket } = useTickets();
  const urgentCount = tickets.filter(t => t.priority === 'urgent').length;

  if (activeTicket) {
    return <TicketDetail />;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 font-medium font-['Inter']">Managing support across all companies.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm">Export Report</Button>
          <Button size="sm">Create Ticket</Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            {/* CHANGED: Now a Universal Ticket Search */}
            <Input 
              label="Find Ticket or Customer" 
              placeholder="Search by ID, Name, or Company..." 
              icon={<Search size={16} />} 
            />
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-lg font-bold text-slate-900">Active Queue</h2>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{tickets.length} Total</span>
            </div>
            <TicketList />
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <h2 className="font-bold text-slate-900 mb-6 text-lg">Live Insights</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Tickets</span>
                <Badge variant="info">{metrics?.activeTickets ?? 0}</Badge>
              </div>
              <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Urgent Priority</span>
                <Badge variant="danger">{urgentCount}</Badge>
              </div>
              <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Response</span>
                <span className="text-sm font-bold text-slate-900">
                  {metrics ? (metrics.avgResolutionTimeMs / 60000).toFixed(1) : '0.0'}m
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <TicketProvider>
      <DashboardLayout>
        <Dashboard />
      </DashboardLayout>
    </TicketProvider>
  )
}
