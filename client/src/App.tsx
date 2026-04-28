import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CustomerView from './pages/CustomerView';
import AgentDashboard from './pages/AgentDashboard';
import { TicketProvider } from './context/TicketContext';

function App() {
  return (
    <TicketProvider>
      <Router>
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans antialiased text-zinc-900 dark:text-zinc-50">
          <Routes>
            <Route path="/" element={<CustomerView />} />
            <Route path="/agent" element={<AgentDashboard />} />
          </Routes>
        </div>
      </Router>
    </TicketProvider>
  );
}

export default App;
