import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CustomerView from './pages/CustomerView';
import AgentDashboard from './pages/AgentDashboard';
import { TicketProvider } from './context/TicketContext';

function App() {
  // If the user connects via port 5174, show the Agent Dashboard
  // Otherwise (port 5173), show the Customer View
  const isAgentPort = window.location.port === '5174';

  return (
    <TicketProvider>
      <Router>
        <div className="min-h-screen bg-zinc-50 font-sans antialiased text-zinc-900">
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
                <Route path="*" element={<CustomerView />} />
              </>
            )}
          </Routes>
        </div>
      </Router>
    </TicketProvider>
  );
}

export default App;
