import { useState, useEffect } from 'react';
import { usePubNub } from '../context/PubNubContext';
import triviaData from '../data/triviaQuestions.json';
import { DatabaseService } from '../config/supabase';
import AdminDashboard from './AdminDashboard';

const GamesMaster = () => {
  const pubNubContext = usePubNub();
  
  const { 
    publishMessage, 
    subscribeToChannels, 
    unsubscribeFromChannels, 
    messages, 
    channels, 
    messageTypes,
    isConnected,
    isInitialized,
    connectionStatus,
    isUsingDemoKeys
  } = pubNubContext || {};

  // All hooks must be called before any conditional returns  
  const [connectedPlayers, setConnectedPlayers] = useState([]);
  const [gameActive, setGameActive] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [playerAnswers, setPlayerAnswers] = useState([]);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [quizConfig, setQuizConfig] = useState({
    questionCount: 5,
    quizId: null,
    isConfigured: false,
    isStarted: false
  });
  const [allPlayerResults, setAllPlayerResults] = useState([]);
  const [detailedResults, setDetailedResults] = useState(null);

  // Database integration state
  const [currentGameId, setCurrentGameId] = useState(null);
  const [playerIdMap, setPlayerIdMap] = useState(new Map()); // Maps PubNub UUID to database player ID

  // UI state
  const [activeView, setActiveView] = useState('quiz'); // 'quiz' or 'dashboard'

  // Used for random question selection without repeats
  const [usedQuestionIds, setUsedQuestionIds] = useState(new Set());
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // All useEffect hooks must also be called before conditional returns
  useEffect(() => {
    // Only subscribe after PubNub is initialized
    if (!isInitialized) return;
    
    // Subscribe to answer channel to receive player responses
    subscribeToChannels([channels.ANSWERS, channels.LOBBY]);

    return () => {
      unsubscribeFromChannels([channels.ANSWERS, channels.LOBBY]);
    };
  }, [isInitialized]);

  useEffect(() => {
    // Listen for player answers and lobby messages
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage) return;

    const { channel, message } = latestMessage;

    if (channel === channels.ANSWERS && message.type === messageTypes.ANSWER_SUBMITTED) {
      setPlayerAnswers(prev => {
        // Prevent duplicate answers from same player
        const existingAnswerIndex = prev.findIndex(
          answer => answer.playerUuid === message.playerUuid && answer.questionId === message.questionId
        );
        
        let newAnswers;
        if (existingAnswerIndex >= 0) {
          // Update existing answer
          newAnswers = [...prev];
          newAnswers[existingAnswerIndex] = {
            ...message,
            receivedAt: Date.now()
          };
        } else {
          // Add new answer
          newAnswers = [...prev, {
            ...message,
            receivedAt: Date.now()
          }];
        }

        // Send immediate feedback for this player
        if (currentQuestion) {
          console.log('About to send feedback for question:', {
            questionId: currentQuestion.id,
            correctAnswer: currentQuestion.correctAnswer,
            explanation: currentQuestion.explanation?.substring(0, 50) + '...'
          });
          sendImmediateFeedback(message, newAnswers, currentQuestion.correctAnswer, currentQuestion.explanation);
          
          // Track results for final quiz summary
          const isCorrect = message.answerIndex === currentQuestion.correctAnswer;
          const newResult = {
            playerUuid: message.playerUuid,
            playerName: message.playerName,
            questionId: message.questionId, // Keep original ID for reference
            questionNumber: currentQuestionNumber, // Use sequential question number (1, 2, 3...)
            answerIndex: message.answerIndex,
            isCorrect,
            responseTime: message.responseTime,
            answeredAt: message.answeredAt
          };
          setAllPlayerResults(prev => [...prev, newResult]);

          // Record result in database
          const pointsEarned = isCorrect ? (newAnswers.filter(a => 
            a.questionId === message.questionId && 
            a.answerIndex === currentQuestion.correctAnswer
          ).length === 1 ? 3 : 1) : 0;
          
          handleQuestionResultDatabase(
            message.playerUuid,
            currentQuestionNumber,
            message.questionId,
            message.answerIndex,
            isCorrect,
            message.responseTime,
            pointsEarned
          );
        }

        return newAnswers;
      });
    }

    if (channel === channels.LOBBY && message.type === messageTypes.PLAYER_JOIN) {
      setConnectedPlayers(prev => {
        if (!prev.find(p => p.uuid === message.playerUuid)) {
          // Add database integration for player join
          handlePlayerJoinDatabase(message.playerUuid, message.playerName);
          return [...prev, { uuid: message.playerUuid, name: message.playerName }];
        }
        return prev;
      });
    }

    if (channel === channels.LOBBY && message.type === messageTypes.PLAYER_LEAVE) {
      setConnectedPlayers(prev => prev.filter(p => p.uuid !== message.playerUuid));
    }

    // Handle requests for current quiz state from newly joined players
    if (channel === channels.GAME_CONTROL && message.type === 'REQUEST_QUIZ_STATE') {
      // Send current quiz state to the requesting player if quiz is active
      if (quizConfig.isConfigured && quizConfig.isStarted) {
        publishMessage(channels.GAME_CONTROL, {
          type: messageTypes.QUIZ_CONFIGURED,
          quizConfig: quizConfig,
          targetPlayer: message.playerUuid
        });

        // If there's a current question, send it to the new player
        if (currentQuestion && gameActive) {
          publishMessage(channels.QUESTIONS, {
            type: messageTypes.QUESTION_ASKED,
            question: {
              id: currentQuestion.id,
              question: currentQuestion.question,
              options: currentQuestion.options
            },
            quizId: quizConfig.quizId,
            questionNumber: currentQuestionNumber, // This should be correct since it's already been incremented
            totalQuestions: quizConfig.questionCount,
            targetPlayer: message.playerUuid
          });
        }
      }
    }
  }, [messages, quizConfig, currentQuestion, gameActive, currentQuestionNumber, publishMessage]);

  // Note: Individual feedback is now sent immediately in sendImmediateFeedback
  // This effect is kept for any edge cases but should rarely trigger
  useEffect(() => {
    if (!currentQuestion || !gameActive || feedbackSent || playerAnswers.length === 0) return;

    const uniquePlayerAnswers = playerAnswers.filter((answer, index, self) => 
      index === self.findIndex(a => a.playerUuid === answer.playerUuid)
    );

    // Mark feedback as sent when all players have answered (for UI state management)
    if (uniquePlayerAnswers.length >= connectedPlayers.length) {
      setFeedbackSent(true);
    }
  }, [playerAnswers, connectedPlayers, currentQuestion, gameActive, feedbackSent]);

  // Add defensive check for context readiness AFTER all hooks
  if (!pubNubContext || !channels || !messageTypes || !isInitialized) {
    return (
      <div className="loading-state">
        <h2>Loading...</h2>
        <p>Initializing Games Master connection...</p>
      </div>
    );
  }

  const sendImmediateFeedback = async (playerAnswer, allAnswers, correctAnswerIndex, explanation) => {
    const isCorrect = playerAnswer.answerIndex === correctAnswerIndex;
    
    // Find the fastest correct answer so far
    const correctAnswers = allAnswers.filter(answer => answer.answerIndex === correctAnswerIndex);
    const fastestCorrectTime = correctAnswers.length > 0 
      ? Math.min(...correctAnswers.map(answer => answer.responseTime))
      : null;
    
    const wasFastest = isCorrect && playerAnswer.responseTime === fastestCorrectTime;

    let feedback;
    if (isCorrect) {
      feedback = wasFastest ? "Right, and fastest!" : "Right, but not fastest";
    } else {
      feedback = "Wrong";
    }

    const feedbackMessage = {
      type: messageTypes.ANSWER_RESULT,
      playerUuid: playerAnswer.playerUuid,
      isCorrect,
      wasFastest,
      feedback,
      explanation,
      responseTime: playerAnswer.responseTime.toFixed(2),
      questionId: playerAnswer.questionId,
      correctAnswerIndex: correctAnswerIndex,
      correctAnswerText: currentQuestion ? currentQuestion.options[correctAnswerIndex] : null
    };

    console.log('Sending immediate feedback:', feedbackMessage);
    console.log('Question explanation being sent:', explanation);
    console.log('Current question data:', {
      id: currentQuestion?.id,
      correctAnswer: currentQuestion?.correctAnswer,
      hasExplanation: !!currentQuestion?.explanation
    });
    await publishMessage(channels.ANSWERS, feedbackMessage);
  };

  const sendFeedbackToPlayers = async (answers, correctAnswerIndex, explanation) => {
    if (answers.length === 0) return;

    // Find the fastest correct answer
    const correctAnswers = answers.filter(answer => answer.answerIndex === correctAnswerIndex);
    const fastestCorrectTime = correctAnswers.length > 0 
      ? Math.min(...correctAnswers.map(answer => answer.responseTime))
      : null;

    // Send feedback to each player
    for (const answer of answers) {
      const isCorrect = answer.answerIndex === correctAnswerIndex;
      const wasFastest = isCorrect && answer.responseTime === fastestCorrectTime;

      let feedback;
      if (isCorrect) {
        feedback = wasFastest ? "Right, and fastest!" : "Right, but not fastest";
      } else {
        feedback = "Wrong";
      }

      await publishMessage(channels.ANSWERS, {
        type: messageTypes.ANSWER_RESULT,
        playerUuid: answer.playerUuid,
        isCorrect,
        wasFastest,
        feedback,
        explanation,
        responseTime: answer.responseTime.toFixed(2),
        questionId: answer.questionId
      });
    }
  };

  // Database helper functions
  const handlePlayerJoinDatabase = async (pubnubUuid, playerName) => {
    try {
      const player = await DatabaseService.createOrUpdatePlayer(pubnubUuid, playerName);
      setPlayerIdMap(prev => new Map(prev).set(pubnubUuid, player.id));
      
      // If there's an active game, add player as participant
      if (currentGameId) {
        await DatabaseService.addGameParticipant(currentGameId, player.id);
      }
    } catch (error) {
      console.error('Database error on player join:', error);
      // Continue without database - don't break the game flow
    }
  };

  const handleQuestionResultDatabase = async (playerUuid, questionNumber, questionId, answerIndex, isCorrect, responseTime, pointsEarned) => {
    try {
      const playerId = playerIdMap.get(playerUuid);
      if (currentGameId && playerId) {
        await DatabaseService.recordQuestionResult(
          currentGameId,
          playerId,
          questionNumber,
          questionId,
          answerIndex,
          isCorrect,
          responseTime,
          pointsEarned
        );
      }
    } catch (error) {
      console.error('Database error recording question result:', error);
      // Continue without database - don't break the game flow
    }
  };

  const configureQuiz = async (questionCount) => {
    const newQuizId = `quiz-${Date.now()}`;
    const config = {
      questionCount,
      quizId: newQuizId,
      timeLimit: 30,
      isConfigured: true,
      isStarted: true
    };

    // Reset quiz state for new quiz
    setUsedQuestionIds(new Set());
    setCurrentQuestionNumber(0);
    setCurrentQuestionIndex(0);
    setAllPlayerResults([]);

    // Create database game record
    try {
      const game = await DatabaseService.createGame(newQuizId, questionCount);
      setCurrentGameId(game.id);
      
      // Add existing players as participants
      for (const player of connectedPlayers) {
        const playerId = playerIdMap.get(player.uuid);
        if (playerId) {
          await DatabaseService.addGameParticipant(game.id, playerId);
        }
      }
    } catch (error) {
      console.error('Database error creating game:', error);
      // Continue without database - don't break the game flow
    }

    // Broadcast quiz configuration and immediate start
    await publishMessage(channels.GAME_CONTROL, {
      type: messageTypes.QUIZ_CONFIGURED,
      quizConfig: config
    });

    await publishMessage(channels.GAME_CONTROL, {
      type: messageTypes.QUIZ_STARTED,
      quizId: newQuizId,
      questionCount: questionCount,
      startTime: Date.now()
    });

    setQuizConfig(config);
  };

  const getRandomUnusedQuestion = () => {
    // Get all available questions that haven't been used
    const availableQuestions = triviaData.questions.filter(
      question => !usedQuestionIds.has(question.id)
    );
    
    // If no questions left, return null (shouldn't happen in normal flow)
    if (availableQuestions.length === 0) {
      return null;
    }
    
    // Select random question from available ones
    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
    return availableQuestions[randomIndex];
  };

  const askQuestion = async () => {
    if (currentQuestionNumber >= quizConfig.questionCount) {
      await endQuiz();
      return;
    }

    // Get a random unused question
    const question = getRandomUnusedQuestion();
    if (!question) {
      console.error('No available questions left');
      await endQuiz();
      return;
    }

    // Mark this question as used and increment question number
    setUsedQuestionIds(prev => new Set([...prev, question.id]));
    const nextQuestionNumber = currentQuestionNumber + 1;
    setCurrentQuestionNumber(nextQuestionNumber);
    
    setCurrentQuestion(question);
    setPlayerAnswers([]); // Clear previous answers
    setGameActive(true);
    setFeedbackSent(false);

    // Publish the question to all players
    await publishMessage(channels.QUESTIONS, {
      type: messageTypes.QUESTION_ASKED,
      question: {
        id: question.id,
        question: question.question,
        options: question.options
      },
      quizId: quizConfig.quizId,
      questionNumber: nextQuestionNumber, // Use the incremented number
      totalQuestions: quizConfig.questionCount
    });
  };

  const closeQuestion = async () => {
    if (!currentQuestion) return;

    // Find players who didn't answer
    const playersWhoAnswered = playerAnswers.map(answer => answer.playerUuid);
    const playersWhoDidntAnswer = connectedPlayers.filter(
      player => !playersWhoAnswered.includes(player.uuid)
    );

    // Send the correct answer to players who didn't respond
    for (const player of playersWhoDidntAnswer) {
      const feedbackMessage = {
        type: messageTypes.ANSWER_RESULT,
        playerUuid: player.uuid,
        isCorrect: false,
        wasFastest: false,
        feedback: "No answer submitted",
        explanation: currentQuestion.explanation,
        responseTime: "0.00",
        questionId: currentQuestion.id,
        correctAnswerIndex: currentQuestion.correctAnswer,
        correctAnswerText: currentQuestion.options[currentQuestion.correctAnswer]
      };

      await publishMessage(channels.ANSWERS, feedbackMessage);
    }

    // Mark question as closed
    setGameActive(false);
  };

  const nextQuestion = () => {
    // No need to increment index since we're using random selection
    setCurrentQuestion(null);
    setPlayerAnswers([]);
    setGameActive(false);
    setFeedbackSent(false);
  };

  const endQuiz = async () => {
    // Group results by question to calculate points
    const questionResults = {};
    
    // Initialize question results structure
    for (let i = 0; i < quizConfig.questionCount; i++) {
      questionResults[i] = {
        questionNumber: i + 1,
        players: []
      };
    }

    // Process all player results and group by question
    allPlayerResults.forEach(result => {
      const questionIndex = result.questionNumber - 1; // Convert sequential question number to 0-based index
      if (questionResults[questionIndex]) {
        questionResults[questionIndex].players.push({
          playerUuid: result.playerUuid,
          playerName: result.playerName,
          isCorrect: result.isCorrect,
          responseTime: result.responseTime,
          answeredAt: result.answeredAt
        });
      }
    });

    // Calculate points for each player
    const playerStats = connectedPlayers.map(player => {
      let totalPoints = 0;
      const questionBreakdown = [];

      // Only create breakdown for questions that were actually asked
      const actualQuestionsAsked = Math.min(currentQuestionNumber, quizConfig.questionCount);
      
      for (let i = 0; i < actualQuestionsAsked; i++) {
        const questionResult = questionResults[i];
        const playerAnswer = questionResult.players.find(p => p.playerUuid === player.uuid);
        
        let points = 0;
        let status = "No Answer";
        
        if (playerAnswer) {
          if (playerAnswer.isCorrect) {
            // Find fastest correct answer for this question
            const correctAnswers = questionResult.players
              .filter(p => p.isCorrect)
              .sort((a, b) => a.responseTime - b.responseTime);
            
            if (correctAnswers.length > 0 && correctAnswers[0].playerUuid === player.uuid) {
              points = 3; // First correct answer
              status = "First Correct";
            } else {
              points = 1; // Correct but not first
              status = "Correct";
            }
          } else {
            points = 0;
            status = "Wrong";
          }
        }
        
        totalPoints += points;
        questionBreakdown.push({
          questionNumber: i + 1,
          points,
          status,
          responseTime: playerAnswer?.responseTime || null
        });
      }

      return {
        playerUuid: player.uuid,
        playerName: player.name,
        totalPoints,
        questionBreakdown,
        questionsAnswered: new Set(allPlayerResults.filter(r => r.playerUuid === player.uuid).map(r => r.questionNumber)).size
      };
    });

    // Sort by total points (descending), then by questions answered (descending)
    const sortedResults = playerStats.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return b.questionsAnswered - a.questionsAnswered;
    });

    // Determine winner
    const winner = sortedResults.length > 0 ? sortedResults[0] : null;
    
    // Set detailed results for Games Master table
    setDetailedResults({
      questionResults,
      playerStats: sortedResults,
      winner
    });

    // Complete game in database
    try {
      if (currentGameId) {
        const winnerId = winner ? playerIdMap.get(winner.playerUuid) : null;
        const finalResults = sortedResults.map((player, index) => ({
          playerId: playerIdMap.get(player.playerUuid),
          totalPoints: player.totalPoints,
          questionsAnswered: player.questionsAnswered,
          rank: index + 1
        })).filter(result => result.playerId); // Only include players with database IDs

        await DatabaseService.completeGame(
          currentGameId,
          winnerId,
          connectedPlayers.length,
          Math.min(currentQuestionNumber, quizConfig.questionCount),
          finalResults
        );
      }
    } catch (error) {
      console.error('Database error completing game:', error);
      // Continue without database - don't break the game flow
    }

    // Broadcast final results to all players
    await publishMessage(channels.GAME_CONTROL, {
      type: messageTypes.QUIZ_RESULTS,
      quizId: quizConfig.quizId,
      results: sortedResults,
      quizSummary: {
        totalQuestions: quizConfig.questionCount,
        completedAt: Date.now()
      },
      winner: winner ? {
        playerName: winner.playerName,
        totalPoints: winner.totalPoints,
        message: `🏆 Congratulations ${winner.playerName}! You won with ${winner.totalPoints} points!`
      } : null
    });

    // Update local state
    setGameActive(false);
    setCurrentQuestion(null);
    setPlayerAnswers([]);
    setAllPlayerResults([]);
    setCurrentQuestionNumber(0);
    setUsedQuestionIds(new Set());
    setQuizConfig({ questionCount: 5, quizId: null, isConfigured: false, isStarted: false });
    setCurrentGameId(null);
    setPlayerIdMap(new Map());
  };

  const endGame = async () => {
    await publishMessage(channels.GAME_CONTROL, {
      type: messageTypes.GAME_END
    });
    setGameActive(false);
    setCurrentQuestion(null);
    setPlayerAnswers([]);
  };

  const getAnswerText = (optionIndex) => {
    if (!currentQuestion || !currentQuestion.options[optionIndex]) {
      return 'Invalid Option';
    }
    return currentQuestion.options[optionIndex];
  };

  const isCorrectAnswer = (playerAnswer) => {
    return currentQuestion && playerAnswer.answerIndex === currentQuestion.correctAnswer;
  };

  const calculateResponseTime = (answer) => {
    if (!currentQuestion || !answer.answeredAt || !answer.questionAskedAt) {
      return 'Unknown';
    }
    const responseTime = (answer.answeredAt - answer.questionAskedAt) / 1000;
    return `${responseTime.toFixed(2)}s`;
  };

  return (
    <div className="games-master">
      <div className="connection-status">
        <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? `🟢 ${connectionStatus}` : `🔴 ${connectionStatus}`}
        </div>
        <div className="players-count">
          Players Connected: {connectedPlayers.length}
        </div>
        {isUsingDemoKeys && (
          <div className="demo-keys-warning">
            ⚠️ Using demo keys - add your keys to .env for better performance
          </div>
        )}
      </div>

      {/* View Switching */}
      <div className="view-switcher">
        <button 
          className={`view-btn ${activeView === 'quiz' ? 'active' : ''}`}
          onClick={() => setActiveView('quiz')}
        >
          🎮 Quiz Management
        </button>
        <button 
          className={`view-btn ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveView('dashboard')}
        >
          📊 Admin Dashboard
        </button>
      </div>

      {activeView === 'quiz' && (
        <div className="game-controls">
          <h2>Games Master Control Panel</h2>
        
        {!quizConfig.isConfigured ? (
          <div className="quiz-config">
            <h3>Configure New Quiz</h3>
            <div className="question-count-selector">
              <label>Number of Questions:</label>
              <button 
                onClick={() => configureQuiz(3)}
                className="config-btn"
              >
                3 Questions
              </button>
              <button 
                onClick={() => configureQuiz(5)}
                className="config-btn"
              >
                5 Questions
              </button>
              <button 
                onClick={() => configureQuiz(10)}
                className="config-btn"
              >
                10 Questions
              </button>
            </div>
          </div>
        ) : (
          <div className="question-controls">
            <button 
              onClick={askQuestion}
              disabled={!isConnected || gameActive}
              className="ask-question-btn"
            >
              Ask Question {currentQuestionNumber + 1}
            </button>
            
            {gameActive && (
              <>
                <button 
                  onClick={closeQuestion}
                  className="close-question-btn"
                >
                  Close Question
                </button>
                <button 
                  onClick={nextQuestion}
                  className="next-question-btn"
                >
                  Next Question
                </button>
              </>
            )}
            
            <button 
              onClick={endQuiz}
              disabled={!quizConfig.isStarted}
              className="end-quiz-btn"
            >
              Stop Quiz
            </button>
          </div>
        )}

        {quizConfig.isConfigured && quizConfig.isStarted && currentQuestionNumber > 0 && (
          <div className="question-info">
            <p>Question {currentQuestionNumber} of {quizConfig.questionCount}</p>
          </div>
        )}

        {currentQuestion && (
        <div className="current-question">
          <h3>Current Question:</h3>
          <div className="question-content">
            <p className="question-text">{currentQuestion.question}</p>
            <div className="options">
              {currentQuestion.options.map((option, index) => (
                <div 
                  key={index} 
                  className={`option ${index === currentQuestion.correctAnswer ? 'correct' : ''}`}
                >
                  <span className="option-letter">{String.fromCharCode(65 + index)}:</span>
                  <span className="option-text">{option}</span>
                  {index === currentQuestion.correctAnswer && <span className="correct-indicator">✓ Correct</span>}
                </div>
              ))}
            </div>
            {currentQuestion.explanation && (
              <div className="explanation">
                <strong>Explanation:</strong> {currentQuestion.explanation}
              </div>
            )}
          </div>
        </div>
      )}

      {playerAnswers.length > 0 && (
        <div className="player-answers">
          <h3>Player Answers ({playerAnswers.length}):</h3>
          <div className="answers-list">
            {playerAnswers.map((answer, index) => (
              <div 
                key={index} 
                className={`answer-item ${isCorrectAnswer(answer) ? 'correct' : 'incorrect'}`}
              >
                <div className="player-info">
                  <strong>Player:</strong> {answer.playerName || answer.playerUuid.slice(-8)}
                </div>
                <div className="answer-details">
                  <span className="answer-text">
                    <strong>Answer:</strong> {String.fromCharCode(65 + answer.answerIndex)} - {getAnswerText(answer.answerIndex)}
                  </span>
                  <span className="result-indicator">
                    {isCorrectAnswer(answer) ? '✅ Correct' : '❌ Incorrect'}
                  </span>
                  <span className="response-time">
                    Response Time: {calculateResponseTime(answer)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {detailedResults && (
        <div className="detailed-results">
          <h3>🏆 Final Quiz Results</h3>
          
          {detailedResults.winner && (
            <div className="winner-announcement">
              <h4>🎉 Winner: {detailedResults.winner.playerName} with {detailedResults.winner.totalPoints} points!</h4>
            </div>
          )}
          
          <div className="final-leaderboard">
            <h4>Final Standings:</h4>
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Total Points</th>
                  <th>Questions Answered</th>
                </tr>
              </thead>
              <tbody>
                {detailedResults.playerStats.map((player, index) => (
                  <tr key={player.playerUuid} className={index === 0 ? 'winner-row' : ''}>
                    <td>#{index + 1}</td>
                    <td>{player.playerName}</td>
                    <td><strong>{player.totalPoints}</strong></td>
                    <td>{player.questionsAnswered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="detailed-breakdown">
            <h4>Question-by-Question Breakdown:</h4>
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th>Question</th>
                  {detailedResults.playerStats.map(player => (
                    <th key={player.playerUuid}>{player.playerName}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.min(currentQuestionNumber, quizConfig.questionCount) }, (_, i) => (
                  <tr key={i}>
                    <td><strong>Q{i + 1}</strong></td>
                    {detailedResults.playerStats.map(player => {
                      const questionResult = player.questionBreakdown[i];
                      // Defensive check for early quiz termination
                      if (!questionResult) {
                        return (
                          <td key={player.playerUuid} className="result-cell not-asked">
                            <div className="points">-</div>
                            <div className="status">Not Asked</div>
                          </td>
                        );
                      }
                      return (
                        <td key={player.playerUuid} className={`result-cell ${questionResult.status.toLowerCase().replace(' ', '-')}`}>
                          <div className="points">{questionResult.points} pts</div>
                          <div className="status">{questionResult.status}</div>
                          {questionResult.responseTime && (
                            <div className="time">{questionResult.responseTime}s</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="scoring-legend">
            <h5>Scoring System:</h5>
            <ul>
              <li><strong>3 points:</strong> First correct answer</li>
              <li><strong>1 point:</strong> Correct answer (not first)</li>
              <li><strong>0 points:</strong> Wrong answer or no answer</li>
            </ul>
          </div>
        </div>
      )}

      <div className="connected-players">
        <h3>Connected Players:</h3>
        {connectedPlayers.length === 0 ? (
          <p>No players connected</p>
        ) : (
          <ul>
            {connectedPlayers.map(player => (
              <li key={player.uuid}>
                {player.name || `Player ${player.uuid.slice(-8)}`}
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
      )}

      {activeView === 'dashboard' && (
        <AdminDashboard />
      )}
    </div>
  );
};

export default GamesMaster;

