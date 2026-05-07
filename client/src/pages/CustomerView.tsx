import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ChatWidget from '../components/chat/ChatWidget';
import Header from '../components/layout/Header';

const stats = [
  { label: 'Active Users', value: '12,400', trend: '+8%', up: true, color: '#1863dc' },
  { label: 'Revenue',      value: '$42,000', trend: '+12%', up: true, color: '#003c33' },
  { label: 'Open Issues',  value: '3',       trend: '-2',   up: true, color: '#b30000' },
];

function TrendArrow({ up }: { up: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display: 'inline', verticalAlign: 'middle' }}>
      {up
        ? <path d="M6 9V3M6 3L3 6M6 3L9 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M6 3v6M6 9L3 6M6 9L9 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

export default function CustomerView() {
  return (
    <Box sx={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Header />

      <Box component="main" sx={{ flex: 1, p: { xs: 3, md: 4 } }}>
        <Box sx={{ maxWidth: 960, mx: 'auto' }}>
          <Typography variant="h3" sx={{ mb: 0.5, fontWeight: 700 }}>
            Welcome back, Alice.
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 0 }}>
            Here&apos;s what&apos;s happening with your projects today.
          </Typography>

          {/* Stat cards */}
          <Box
            sx={{
              mt: 4,
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
            }}
          >
            {stats.map((stat) => (
              <Paper
                key={stat.label}
                elevation={0}
                sx={{
                  p: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 3,
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'box-shadow 0.2s',
                  '&:hover': { boxShadow: 4 },
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    height: '3px',
                    bgcolor: stat.color,
                    borderRadius: '12px 12px 0 0',
                  },
                }}
              >
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 1 }}>
                  {stat.label}
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 700, lineHeight: 1 }}>
                  {stat.value}
                </Typography>
                <Box sx={{ mt: 1.5, display: 'inline-flex', alignItems: 'center', gap: 0.5,
                  px: 1, py: 0.25, borderRadius: 10,
                  bgcolor: stat.up ? 'rgba(0,100,60,0.07)' : 'rgba(180,0,0,0.07)',
                  color: stat.up ? '#1a7a4a' : '#b30000',
                  fontSize: '0.72rem', fontWeight: 700,
                }}>
                  <TrendArrow up={stat.up} />
                  {stat.trend} this month
                </Box>
              </Paper>
            ))}
          </Box>

          {/* Analytics empty state */}
          <Paper
            elevation={0}
            sx={{
              mt: 3,
              height: 384,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: 3,
              bgcolor: 'background.paper',
              color: 'text.secondary',
            }}
          >
            <Box sx={{
              width: 56, height: 56, borderRadius: '50%',
              bgcolor: 'action.hover',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                Analytics coming soon
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Charts and trends will appear here once your data is ready.
              </Typography>
            </Box>
          </Paper>
        </Box>
      </Box>

      <ChatWidget />
    </Box>
  );
}
