import React, { useState } from 'react';
import Header from '../components/layout/Header';
import ChatWidget from '../components/chat/ChatWidget';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

type CustomerSettings = {
  displayName: string;
  email: string;
  theme: 'system' | 'light' | 'dark';
};

const DEFAULT_SETTINGS: CustomerSettings = {
  displayName: 'Alice',
  email: 'alice@acmecorp.com',
  theme: 'system',
};

const SETTINGS_KEY = 'customer_settings';
const THEME_CHANGE_EVENT = 'app-theme-change';

const loadInitialSettings = (): CustomerSettings => {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(raw) as Partial<CustomerSettings>;
    return {
      displayName: parsed.displayName ?? DEFAULT_SETTINGS.displayName,
      email: parsed.email ?? DEFAULT_SETTINGS.email,
      theme: parsed.theme ?? DEFAULT_SETTINGS.theme,
    };
  } catch {
    localStorage.removeItem(SETTINGS_KEY);
    return DEFAULT_SETTINGS;
  }
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<CustomerSettings>(loadInitialSettings);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  const update = <K extends keyof CustomerSettings>(key: K, value: CustomerSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'theme') {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
      }
      return next;
    });
    setSaveState('idle');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    setSaveState('saved');
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col">
      <Header />

      <main className="flex-1 p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
            <p className="text-muted-foreground mt-1">Manage your profile and interface preferences.</p>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <section className="bg-card text-card-foreground p-6 rounded-xl border border-border shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-card-foreground">Profile</h2>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="displayName" className="text-sm font-medium text-card-foreground">Display name</label>
                  <Input
                    id="displayName"
                    value={settings.displayName}
                    onChange={e => update('displayName', e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="email" className="text-sm font-medium text-card-foreground">Email address</label>
                  <Input
                    id="email"
                    type="email"
                    value={settings.email}
                    onChange={e => update('email', e.target.value)}
                    placeholder="name@company.com"
                  />
                </div>
              </div>
            </section>

            <section className="bg-card text-card-foreground p-6 rounded-xl border border-border shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-card-foreground">Appearance</h2>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label htmlFor="theme" className="text-sm font-medium text-card-foreground">Theme</label>
                  <select
                    id="theme"
                    value={settings.theme}
                    onChange={e => update('theme', e.target.value as CustomerSettings['theme'])}
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
              </div>
            </section>

            <div className="flex items-center justify-end gap-3">
              {saveState === 'saved' && (
                <span className="text-sm text-emerald-600 font-medium">Settings saved</span>
              )}
              <Button type="submit" className="px-5">
                Save changes
              </Button>
            </div>
          </form>
        </div>
      </main>

      <ChatWidget />
    </div>
  );
}
