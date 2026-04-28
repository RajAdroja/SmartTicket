import React, { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Header from '../components/layout/Header';
import ChatWidget from '../components/chat/ChatWidget';

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

export default function Settings() {
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
    <Box
      sx={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Header />

      <Box component="main" sx={{ flex: 1, p: { xs: 3, md: 4 } }}>
        <Box sx={{ maxWidth: 820, mx: 'auto' }}>
          <Typography variant="h3">Settings</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Manage your profile and interface preferences.
          </Typography>

          <Box component="form" onSubmit={handleSave} sx={{ mt: 3, display: 'grid', gap: 3 }}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 2 }}>
                Profile
              </Typography>
              <Stack spacing={2}>
                <TextField
                  id="displayName"
                  label="Display name"
                  value={settings.displayName}
                  onChange={(e) => update('displayName', e.target.value)}
                  placeholder="Your name"
                  fullWidth
                />
                <TextField
                  id="email"
                  label="Email address"
                  type="email"
                  value={settings.email}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder="name@company.com"
                  fullWidth
                />
              </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 2 }}>
                Appearance
              </Typography>
              <FormControl fullWidth>
                <InputLabel id="theme-label">Theme</InputLabel>
                <Select
                  labelId="theme-label"
                  id="theme"
                  value={settings.theme}
                  label="Theme"
                  onChange={(e) => update('theme', e.target.value as CustomerSettings['theme'])}
                >
                  <MenuItem value="system">System</MenuItem>
                  <MenuItem value="light">Light</MenuItem>
                  <MenuItem value="dark">Dark</MenuItem>
                </Select>
              </FormControl>
            </Paper>

            <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
              {saveState === 'saved' && <Alert severity="success">Settings saved</Alert>}
              <Button type="submit" variant="contained">
                Save changes
              </Button>
            </Stack>
          </Box>
        </Box>
      </Box>

      <ChatWidget />
    </Box>
  );
}
