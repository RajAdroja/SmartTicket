import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ChatWidget from '../components/chat/ChatWidget';
import Header from '../components/layout/Header';

export default function CustomerView() {
  const stats = [
    { label: 'Active Users', value: '12,400' },
    { label: 'Revenue', value: '$42,000' },
    { label: 'Open Issues', value: '3' },
  ];

  return (
    <Box sx={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <Box component="main" sx={{ flex: 1, p: { xs: 3, md: 4 } }}>
        <Box sx={{ maxWidth: 960, mx: 'auto' }}>
          <Typography variant="h3" sx={{ mb: 1 }}>
            Welcome back, Alice.
          </Typography>
          <Typography color="text.secondary">
            Here&apos;s what&apos;s happening with your projects today.
          </Typography>

          <Box
            sx={{
              mt: 4,
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
            }}
          >
            {stats.map((stat) => (
              <Paper key={stat.label} sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  {stat.label}
                </Typography>
                <Typography variant="h3" sx={{ mt: 1 }}>
                  {stat.value}
                </Typography>
              </Paper>
            ))}
          </Box>

          <Paper
            sx={{
              mt: 3,
              height: 384,
              display: 'grid',
              placeItems: 'center',
              color: 'text.secondary',
            }}
          >
            [Analytics Chart Placeholder]
          </Paper>
        </Box>
      </Box>

      <ChatWidget />
    </Box>
  );
}
