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
            {/* If Mode is 'agent', this site is ONLY the dashboard */}
            {import.meta.env.VITE_APP_MODE === 'agent' ? (
              <>
                <Route path="/" element={<AgentDashboard />} />
                <Route path="*" element={<AgentDashboard />} />
              </>
            ) : (
              /* If Mode is 'customer' (default), this site is the customer view + widget */
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
