
import { CitizenPage } from './pages/CitizenPage';
import { AgentPage } from './pages/AgentPage';
import { HistoryPage } from './pages/HistoryPage';
import './App.css';

function App() {
  const path = window.location.pathname;
  if (path.startsWith('/agent/history')) return <HistoryPage />;
  if (path.startsWith('/agent')) return <AgentPage />;
  return <CitizenPage />;
}

export default App;
