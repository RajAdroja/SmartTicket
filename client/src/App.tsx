import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Box from '@mui/material/Box';
import CustomerView from './pages/CustomerView';
import AgentDashboard from './pages/AgentDashboard';
import Settings from './pages/Settings.tsx';
import { TicketProvider } from './context/TicketContext';

function App() {
  // If the user connects via port 5174, show the Agent Dashboard
  // Otherwise (port 5173), show the Customer View
  const isAgentPort = window.location.port === '5174';

  return (
    <TicketProvider>
      <Router>
        <Box
          sx={{
            minHeight: '100vh',
            bgcolor: 'background.default',
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
