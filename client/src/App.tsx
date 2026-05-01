import React from 'react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Button, Input, Badge } from '@/components/ui'
import { Search } from 'lucide-react'

export default function App() {
  return (
    <DashboardLayout>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
            <p className="text-slate-500 font-medium">Welcome back to the new SmartTicket.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="sm">Export Report</Button>
            <Button size="sm">Create Ticket</Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
              <Input label="Search Knowledge Base" placeholder="Search for answers..." icon={<Search size={16} />} />
            </div>
            
            <div className="bg-white p-12 rounded-[2rem] border border-slate-200 shadow-sm h-80 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300">
                <Search size={32} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">No active tickets selected</p>
                <p className="text-slate-400 max-w-xs mx-auto">Select a ticket from the sidebar or search to start helping customers.</p>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <h2 className="font-bold text-slate-900 mb-6 text-lg">Live Insights</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Tickets</span>
                  <Badge variant="info">12</Badge>
                </div>
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Urgent Priority</span>
                  <Badge variant="danger">2</Badge>
                </div>
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Response</span>
                  <span className="text-sm font-bold text-slate-900">4.2m</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
