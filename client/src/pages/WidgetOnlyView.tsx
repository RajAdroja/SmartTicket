import React, { useEffect } from 'react';
import Box from '@mui/material/Box';
import ChatWidget from '../components/chat/ChatWidget';

export default function WidgetOnlyView() {
  // We make the body background transparent so the iframe blends into the host website
  // Also we must reset color-scheme otherwise browsers paint a solid dark canvas in dark mode
  useEffect(() => {
    document.documentElement.style.setProperty('color-scheme', 'light', 'important');
    document.documentElement.style.setProperty('--background', 'transparent');
    document.body.style.setProperty('background-color', 'transparent', 'important');
    document.documentElement.style.setProperty('background-color', 'transparent', 'important');
    const root = document.getElementById('root');
    if (root) root.style.setProperty('background-color', 'transparent', 'important');
    
    return () => {
      document.documentElement.style.removeProperty('color-scheme');
      document.body.style.removeProperty('background-color');
      document.documentElement.style.removeProperty('background-color');
      if (root) root.style.removeProperty('background-color');
    };
  }, []);

  return (
    <Box sx={{ position: 'relative', minHeight: '100vh', backgroundColor: 'transparent' }}>
      <ChatWidget isEmbedded={true} />
    </Box>
  );
}
