import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { PubNubProvider } from './context/PubNubContext';
import GamesMaster from './components/GamesMaster';
import Player from './components/Player';
import './App.css';

function AppContent() {
  const location = useLocation();
  const isAdmin = location.pathname === '/admin';

  return (
    <div className="app">
      <header className="app-header">
        <h1>Multi-Choice Quiz</h1>
        <p>Real-time Trivia Game powered by PubNub</p>
        <div className="nav-links">
          <Link 
            to="/" 
            className={`nav-link ${!isAdmin ? 'active' : ''}`}
          >
            🧠 Player
          </Link>
          <Link 
            to="/admin" 
            className={`nav-link ${isAdmin ? 'active' : ''}`}
          >
            🎮 Games Master
          </Link>
        </div>
      </header>

      <div className="game-area">
        <div className="role-indicator">
          <span>Role: {isAdmin ? '🎮 Games Master' : '🧠 Player'}</span>
        </div>
        
        <Routes>
          <Route path="/" element={<Player />} />
          <Route path="/admin" element={<GamesMaster />} />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <PubNubProvider>
      <Router>
        <AppContent />
      </Router>
    </PubNubProvider>
  );
}

export default App;