import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PubNubProvider } from './context/PubNubContext';
import GamesMaster from './components/GamesMaster';
import Player from './components/Player';
import './App.css';

function AppContent() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Multi-Choice Quiz</h1>
        <p>Real-time Trivia Game powered by PubNub</p>
      </header>

      <div className="game-area">
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