import React from 'react';
import ChatWidget from '../components/chat/ChatWidget';
import Header from '../components/layout/Header';

export default function CustomerView() {
  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col">
      {/* Mock SaaS Header */}
      <Header />

      {/* Mock SaaS Main Content */}
      <main className="flex-1 p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome back, Alice.</h1>
          <p className="text-muted-foreground">Here's what's happening with your projects today.</p>
          
          <div className="grid grid-cols-3 gap-6 mt-8">
            <div className="bg-card text-card-foreground p-6 rounded-xl border border-border shadow-sm">
              <h3 className="text-sm font-medium text-muted-foreground">Active Users</h3>
              <p className="text-3xl font-bold mt-2 text-card-foreground">12,400</p>
            </div>
            <div className="bg-card text-card-foreground p-6 rounded-xl border border-border shadow-sm">
              <h3 className="text-sm font-medium text-muted-foreground">Revenue</h3>
              <p className="text-3xl font-bold mt-2 text-card-foreground">$42,000</p>
            </div>
            <div className="bg-card text-card-foreground p-6 rounded-xl border border-border shadow-sm">
              <h3 className="text-sm font-medium text-muted-foreground">Open Issues</h3>
              <p className="text-3xl font-bold mt-2 text-card-foreground">3</p>
            </div>
          </div>

          <div className="bg-card text-card-foreground h-96 rounded-xl border border-border shadow-sm mt-6 flex items-center justify-center text-muted-foreground">
            [Analytics Chart Placeholder]
          </div>
        </div>
      </main>

      {/* The AI Frontline Chat Widget */}
      <ChatWidget />
    </div>
  );
}
