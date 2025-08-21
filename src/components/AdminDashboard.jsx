import { useState, useEffect } from 'react';
import { DatabaseService } from '../config/supabase';

const AdminDashboard = () => {
  const [recentGames, setRecentGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameDetails, setGameDetails] = useState(null);
  const [topPlayers, setTopPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('games'); // 'games', 'players'

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [games, players] = await Promise.all([
        DatabaseService.getRecentGames(20),
        DatabaseService.getTopPlayers(10)
      ]);
      
      setRecentGames(games || []);
      setTopPlayers(players || []);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Failed to load dashboard data. Please check your database connection.');
    } finally {
      setLoading(false);
    }
  };

  const loadGameDetails = async (gameId) => {
    try {
      setLoading(true);
      const details = await DatabaseService.getGameDetails(gameId);
      setGameDetails(details);
      setSelectedGame(gameId);
    } catch (err) {
      console.error('Error loading game details:', err);
      setError('Failed to load game details.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (startTime, endTime) => {
    if (!endTime) return 'In Progress';
    const duration = new Date(endTime) - new Date(startTime);
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  if (loading && recentGames.length === 0) {
    return (
      <div className="admin-dashboard">
        <h2>📊 Admin Dashboard</h2>
        <div className="loading-state">
          <p>Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-dashboard">
        <h2>📊 Admin Dashboard</h2>
        <div className="error-state">
          <p>{error}</p>
          <button onClick={loadDashboardData} className="retry-btn">
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <h2>📊 Admin Dashboard</h2>
      
      {/* Tab Navigation */}
      <div className="dashboard-tabs">
        <button 
          className={`tab ${activeTab === 'games' ? 'active' : ''}`}
          onClick={() => setActiveTab('games')}
        >
          🎮 Recent Games
        </button>
        <button 
          className={`tab ${activeTab === 'players' ? 'active' : ''}`}
          onClick={() => setActiveTab('players')}
        >
          🏆 Top Players
        </button>
      </div>

      {/* Recent Games Tab */}
      {activeTab === 'games' && (
        <div className="games-section">
          {selectedGame ? (
            // Game Details View
            <div className="game-details">
              <div className="details-header">
                <button 
                  onClick={() => {setSelectedGame(null); setGameDetails(null);}}
                  className="back-btn"
                >
                  ← Back to Games List
                </button>
                <h3>Game Details</h3>
              </div>
              
              {gameDetails && (
                <div className="game-info">
                  <div className="game-summary">
                    <h4>Game Summary</h4>
                    <div className="summary-grid">
                      <div className="summary-item">
                        <span className="label">Quiz ID:</span>
                        <span className="value">{gameDetails.pubnub_quiz_id}</span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Started:</span>
                        <span className="value">{formatDate(gameDetails.created_at)}</span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Duration:</span>
                        <span className="value">{formatDuration(gameDetails.created_at, gameDetails.completed_at)}</span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Questions:</span>
                        <span className="value">{gameDetails.questions_asked} / {gameDetails.question_count}</span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Players:</span>
                        <span className="value">{gameDetails.total_players}</span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Winner:</span>
                        <span className="value">{gameDetails.winner?.name || 'No winner'}</span>
                      </div>
                    </div>
                  </div>

                  {gameDetails.participants && gameDetails.participants.length > 0 && (
                    <div className="participants-table">
                      <h4>Final Results</h4>
                      <table className="results-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Player</th>
                            <th>Points</th>
                            <th>Questions Answered</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gameDetails.participants
                            .sort((a, b) => a.final_rank - b.final_rank)
                            .map((participant, index) => (
                            <tr key={participant.player.name} className={index === 0 ? 'winner' : ''}>
                              <td>
                                {participant.final_rank === 1 ? '🥇' : 
                                 participant.final_rank === 2 ? '🥈' : 
                                 participant.final_rank === 3 ? '🥉' : 
                                 `#${participant.final_rank}`}
                              </td>
                              <td>{participant.player.name}</td>
                              <td>{participant.total_points}</td>
                              <td>{participant.questions_answered}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            // Games List View
            <div className="games-list">
              <div className="section-header">
                <h3>Recent Games</h3>
                <button onClick={loadDashboardData} className="refresh-btn">
                  🔄 Refresh
                </button>
              </div>
              
              {recentGames.length === 0 ? (
                <div className="empty-state">
                  <p>No games have been played yet.</p>
                  <p>Start a quiz to see game history here!</p>
                </div>
              ) : (
                <div className="games-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Started</th>
                        <th>Questions</th>
                        <th>Players</th>
                        <th>Winner</th>
                        <th>Duration</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentGames.map((game) => (
                        <tr key={game.id}>
                          <td>{formatDate(game.created_at)}</td>
                          <td>{game.questions_asked} / {game.question_count}</td>
                          <td>{game.total_players || 0}</td>
                          <td>{game.winner?.name || '-'}</td>
                          <td>{formatDuration(game.created_at, game.completed_at)}</td>
                          <td>
                            <span className={`status ${game.status}`}>
                              {game.status === 'completed' ? '✅ Completed' : 
                               game.status === 'in_progress' ? '⏳ In Progress' : 
                               '❌ Stopped'}
                            </span>
                          </td>
                          <td>
                            <button 
                              onClick={() => loadGameDetails(game.id)}
                              className="details-btn"
                            >
                              📋 Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Top Players Tab */}
      {activeTab === 'players' && (
        <div className="players-section">
          <div className="section-header">
            <h3>Top Players</h3>
            <button onClick={loadDashboardData} className="refresh-btn">
              🔄 Refresh
            </button>
          </div>
          
          {topPlayers.length === 0 ? (
            <div className="empty-state">
              <p>No player statistics available yet.</p>
              <p>Play some games to see leaderboards!</p>
            </div>
          ) : (
            <div className="players-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Wins</th>
                    <th>Games Played</th>
                    <th>Total Points</th>
                    <th>Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {topPlayers.map((player, index) => (
                    <tr key={player.name} className={index < 3 ? 'top-player' : ''}>
                      <td>
                        {index === 0 ? '🥇' : 
                         index === 1 ? '🥈' : 
                         index === 2 ? '🥉' : 
                         `#${index + 1}`}
                      </td>
                      <td>{player.name}</td>
                      <td>{player.total_wins}</td>
                      <td>{player.total_games}</td>
                      <td>{player.total_points}</td>
                      <td>{player.total_games > 0 ? Math.round((player.total_wins / player.total_games) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;




