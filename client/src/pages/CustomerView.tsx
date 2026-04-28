import React from 'react';
import ChatWidget from '../components/chat/ChatWidget';
import Header from '../components/layout/Header';

export default function CustomerView() {
  return (
    <div className="relative min-h-screen bg-zinc-50 flex flex-col">
      {/* Mock SaaS Header */}
      <Header />

      {/* Mock SaaS Main Content */}
      <main className="flex-1 p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Welcome back, Alice.</h1>
          <p className="text-zinc-500">Here's what's happening with your projects today.</p>
          
          <div className="grid grid-cols-3 gap-6 mt-8">
            <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
              <h3 className="text-sm font-medium text-zinc-500">Active Users</h3>
              <p className="text-3xl font-bold mt-2 text-zinc-900">12,400</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
              <h3 className="text-sm font-medium text-zinc-500">Revenue</h3>
              <p className="text-3xl font-bold mt-2 text-zinc-900">$42,000</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
              <h3 className="text-sm font-medium text-zinc-500">Open Issues</h3>
              <p className="text-3xl font-bold mt-2 text-zinc-900">3</p>
            </div>
          </div>

          <div className="bg-white h-96 rounded-xl border border-zinc-200 shadow-sm mt-6 flex items-center justify-center text-zinc-400">
            [Analytics Chart Placeholder]
          </div>
        </div>
      </main>

      {/* The AI Frontline Chat Widget */}
      <ChatWidget />
    </div>
  );
}
