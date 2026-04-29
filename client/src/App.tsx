import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Box from '@mui/material/Box';
import CustomerView from './pages/CustomerView';
import AgentDashboard from './pages/AgentDashboard';
import Settings from './pages/Settings.tsx';
import WidgetOnlyView from './pages/WidgetOnlyView';
import { TicketProvider } from './context/TicketContext';

function App() {
  // If the user connects via port 5174, show the Agent Dashboard
  const isAgentPort = window.location.port === '5174';
  const isWidgetRoute = window.location.pathname.includes('/widget');

  return (
    <TicketProvider>
      <Router>
        <Box
          sx={{
            minHeight: isWidgetRoute ? 'auto' : '100vh',
            bgcolor: isWidgetRoute ? 'transparent' : 'background.default',
            color: 'text.primary',
            typography: 'body1',
          }}
        >
          <Routes>
            {isAgentPort ? (
              // Port 5174: Agent Only
              <>
                <Route path="/" element={<AgentDashboard />} />
                <Route path="*" element={<AgentDashboard />} />
              </>
            ) : (
              // Port 5173: Customer Only
              <>
                <Route path="/" element={<CustomerView />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/widget" element={<WidgetOnlyView />} />
                <Route path="*" element={<CustomerView />} />
              </>
            )}
          </Routes>
        </Box>
      </Router>
    </TicketProvider>
  );
}

export default App;
