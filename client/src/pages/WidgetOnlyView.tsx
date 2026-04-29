import React, { useEffect } from 'react';
import Box from '@mui/material/Box';
import ChatWidget from '../components/chat/ChatWidget';

export default function WidgetOnlyView() {
  // We make the body background transparent so the iframe blends into the host website
  // Also we must reset color-scheme otherwise browsers paint a solid dark canvas in dark mode
  useEffect(() => {
    document.documentElement.style.setProperty('color-scheme', 'light', 'important');
    document.documentElement.style.setProperty('--background', 'transparent');
    document.documentElement.style.setProperty('background', 'transparent', 'important');
    document.body.style.setProperty('background', 'transparent', 'important');
    const root = document.getElementById('root');
    if (root) {
      root.style.setProperty('background-color', 'transparent', 'important');
      root.style.setProperty('background', 'transparent', 'important');
    }
    
    return () => {
      document.documentElement.style.removeProperty('color-scheme');
      document.body.style.removeProperty('background-color');
      document.body.style.removeProperty('background');
      document.documentElement.style.removeProperty('background-color');
      document.documentElement.style.removeProperty('background');
      if (root) {
        root.style.removeProperty('background-color');
        root.style.removeProperty('background');
      }
    };
  }, []);

  return (
    <Box sx={{ position: 'relative', minHeight: '100vh', backgroundColor: 'transparent !important', background: 'transparent !important' }}>
      <ChatWidget isEmbedded={true} />
    </Box>
  );
}
