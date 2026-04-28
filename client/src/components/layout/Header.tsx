import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';

const brandIcon = new URL('../../assets/icon-logo.svg', import.meta.url).href;

export default function Header() {
  const { pathname } = useLocation();
  const activeTab = pathname === '/settings' ? '/settings' : '/';

  return (
    <AppBar
      position="static"
      color="transparent"
      elevation={0}
      sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
    >
      <Toolbar sx={{ minHeight: 64, px: 3, justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            component="img"
            src={brandIcon}
            alt="SmartTicket logo"
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              objectFit: 'contain',
            }}
          />
          <Typography variant="subtitle1" fontWeight={600}>
            AcmeCorp Dashboard
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <Tabs
            value={activeTab}
            textColor="primary"
            indicatorColor="primary"
            sx={{
              minHeight: 36,
              '& .MuiTab-root': {
                minHeight: 36,
                px: 1.25,
                py: 0.25,
                minWidth: 'auto',
                fontSize: '0.8rem',
                fontWeight: 600,
                textTransform: 'none',
                color: 'text.secondary',
              },
            }}
          >
            <Tab value="/" label="Overview" component={NavLink} to="/" />
            <Tab value="integrations" label="Integrations" disabled />
            <Tab value="/settings" label="Settings" component={NavLink} to="/settings" />
          </Tabs>
          <Avatar sx={{ width: 32, height: 32 }} />
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
