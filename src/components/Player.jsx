import { useState, useEffect, useRef } from 'react';
import { usePubNub } from '../context/PubNubContext';

const Player = () => {
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
    isUsingDemoKeys,
    userUuid
  } = pubNubContext || {};

  // All hooks must be called before any conditional returns
  const [hasJoined, setHasJoined] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [answerResult, setAnswerResult] = useState(null);
  const [gameStats, setGameStats] = useState({
    questionsAnswered: 0,
    totalPoints: 0
  });
  const [currentQuiz, setCurrentQuiz] = useState(null);
  const [quizResults, setQuizResults] = useState(null);
  const [processedQuestions, setProcessedQuestions] = useState(new Set());
  const processedInThisEffect = useRef(new Set());
  const [joinedMidQuiz, setJoinedMidQuiz] = useState(false);

  // All useEffect hooks must be called before conditional returns
  useEffect(() => {
    // Only subscribe after PubNub is initialized
    if (!isInitialized) return;
    
    // Always subscribe to lobby to establish PubNub connection
    // Subscribe to questions, answers (for feedback), and game control channels when joined
    const channelsToSubscribe = hasJoined 
      ? [channels.LOBBY, channels.QUESTIONS, channels.ANSWERS, channels.GAME_CONTROL]
      : [channels.LOBBY];
    
    subscribeToChannels(channelsToSubscribe);

    return () => {
      unsubscribeFromChannels(channelsToSubscribe);
    };
  }, [hasJoined, isInitialized]);

  useEffect(() => {
    // Listen for questions and game control messages
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage) return;

    const { channel, message } = latestMessage;

    if (channel === channels.QUESTIONS && message.type === messageTypes.QUESTION_ASKED) {
      // Check if this message is targeted at this specific player or if it's a broadcast
      if (!message.targetPlayer || message.targetPlayer === userUuid) {
        setCurrentQuestion({
          ...message.question,
          askedAt: Date.now(),
          questionNumber: message.questionNumber,
          totalQuestions: message.totalQuestions
        });
        setSelectedAnswer(null);
        setHasAnswered(false);
        setAnswerResult(null);
      }
    }

    if (channel === channels.GAME_CONTROL) {
      if (message.type === messageTypes.QUIZ_CONFIGURED) {
        // Check if this message is targeted at this specific player or if it's a broadcast
        if (!message.targetPlayer || message.targetPlayer === userUuid) {
          setCurrentQuiz(message.quizConfig);
          setQuizResults(null);
          setGameStats({ questionsAnswered: 0, totalPoints: 0 });
          setProcessedQuestions(new Set()); // Reset processed questions for new quiz
          processedInThisEffect.current = new Set(); // Reset ref as well
          
          // If this is a targeted message, player joined mid-quiz
          if (message.targetPlayer === userUuid) {
            setJoinedMidQuiz(true);
          }
        }
      }
      
      if (message.type === messageTypes.QUIZ_STARTED) {
        setCurrentQuestion(null);
        setHasAnswered(false);
        setAnswerResult(null);
        setQuizResults(null);
      }
      
      if (message.type === messageTypes.QUIZ_RESULTS) {
        setQuizResults(message);
        setCurrentQuestion(null);
        setHasAnswered(false);
        setAnswerResult(null);
        setProcessedQuestions(new Set()); // Reset for next quiz
        processedInThisEffect.current = new Set(); // Reset ref as well
      }
      
      if (message.type === messageTypes.GAME_END) {
        setCurrentQuestion(null);
        setHasAnswered(false);
        setAnswerResult(null);
      }
    }

    // Listen for answer feedback from games master
    if (channel === channels.ANSWERS && message.type === messageTypes.ANSWER_RESULT && message.playerUuid === userUuid) {
      console.log('Received answer feedback:', message);
      console.log('Explanation received:', message.explanation);
      
      // Create unique key for this question
      const questionKey = `q${message.questionId}`;
      
      setAnswerResult({
        isCorrect: message.isCorrect,
        submitted: true,
        answerIndex: selectedAnswer,
        submittedAt: Date.now(),
        feedback: message.feedback,
        explanation: message.explanation,
        responseTime: message.responseTime,
        wasFastest: message.wasFastest,
        correctAnswerIndex: message.correctAnswerIndex,
        correctAnswerText: message.correctAnswerText,
        waitingForFeedback: false  // Stop showing "waiting" state
      });

      // Check both the state and the ref to prevent duplicates
      if (processedQuestions.has(questionKey) || processedInThisEffect.current.has(questionKey)) {
        console.log('Question already processed, skipping points update:', questionKey);
        return;
      }
      
      // Mark as processed immediately in ref to prevent duplicates in same effect cycle
      processedInThisEffect.current.add(questionKey);
      
      // This is a new question, calculate and add points
      let pointsEarned = 0;
      if (message.isCorrect) {
        if (message.wasFastest) {
          pointsEarned = 3; // First correct answer
        } else {
          pointsEarned = 1; // Correct but not first
        }
      }
      // Wrong answers or no answer = 0 points (already initialized)
      
      console.log('Processing new question:', questionKey, 'Points earned:', pointsEarned);
      
      setGameStats(prevStats => ({
        ...prevStats,
        totalPoints: (prevStats.totalPoints || 0) + pointsEarned
      }));
      
      // Also update the state for future checks
      setProcessedQuestions(prev => {
        const newSet = new Set(prev);
        newSet.add(questionKey);
        return newSet;
      });
    }
  }, [messages]);

  // Add defensive check for context readiness AFTER all hooks
  if (!pubNubContext || !channels || !messageTypes || !isInitialized) {
    return (
      <div className="loading-state">
        <h2>Loading...</h2>
        <p>Initializing game connection...</p>
      </div>
    );
  }

  const joinGame = async () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }

    try {
      await publishMessage(channels.LOBBY, {
        type: messageTypes.PLAYER_JOIN,
        playerUuid: userUuid,
        playerName: playerName.trim(),
        joinedAt: Date.now()
      });

      setHasJoined(true);
      
      // Request current quiz state in case quiz is already in progress
      await publishMessage(channels.GAME_CONTROL, {
        type: 'REQUEST_QUIZ_STATE',
        playerUuid: userUuid,
        playerName: playerName.trim()
      });

    } catch (error) {
      console.error('Error joining game:', error);
      alert('Failed to join game. Please try again.');
    }
  };

  const leaveGame = async () => {
    await publishMessage(channels.LOBBY, {
      type: messageTypes.PLAYER_LEAVE,
      playerUuid: userUuid,
      playerName: playerName
    });

    setHasJoined(false);
    setCurrentQuestion(null);
    setHasAnswered(false);
    setAnswerResult(null);
    setGameStats({ questionsAnswered: 0, totalPoints: 0 });
    setProcessedQuestions(new Set()); // Reset processed questions when leaving
    processedInThisEffect.current = new Set(); // Reset ref as well
  };

  const selectAnswer = async (answerIndex) => {
    if (hasAnswered) return;
    
    setSelectedAnswer(answerIndex);
    setHasAnswered(true);

    // Auto-submit the answer immediately
    const answerData = {
      type: messageTypes.ANSWER_SUBMITTED,
      playerUuid: userUuid,
      playerName: playerName,
      questionId: currentQuestion.id,
      answerIndex: answerIndex,
      answeredAt: Date.now(),
      questionAskedAt: currentQuestion.askedAt,
      responseTime: (Date.now() - currentQuestion.askedAt) / 1000
    };

    await publishMessage(channels.ANSWERS, answerData);
    
    // Update local stats
    setGameStats(prev => ({
      ...prev,
      questionsAnswered: prev.questionsAnswered + 1
    }));

    // Set initial result state - waiting for feedback from games master
    setAnswerResult({
      isCorrect: null,
      submitted: true,
      answerIndex: answerIndex,
      submittedAt: Date.now(),
      waitingForFeedback: true
    });
  };

  const checkAnswer = (answerIndex) => {
    // This is a simplified check - in a real game, 
    // the games master would send back the results
    // For now, we'll assume we don't know the correct answer
    setAnswerResult({
      isCorrect: null, // We don't know yet
      submitted: true,
      answerIndex: answerIndex,
      submittedAt: Date.now()
    });
  };



  if (!hasJoined) {
    return (
      <div className="player-join">
        <div className="join-form">
          <h2>Join the Trivia Game</h2>
          <div className="connection-status">
            <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? `🟢 ${connectionStatus}` : `🔴 ${connectionStatus}`}
            </div>
            {isUsingDemoKeys && (
              <div className="demo-keys-warning">
                ⚠️ Using demo keys - add your keys to .env for better performance
              </div>
            )}
          </div>
          
          <div className="name-input">
            <label htmlFor="playerName">Your Name:</label>
            <input
              id="playerName"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              onKeyPress={(e) => e.key === 'Enter' && joinGame()}
            />
          </div>
          
          <button 
            onClick={joinGame}
            disabled={!isConnected || !playerName.trim()}
            className="join-btn"
          >
            Join Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="player">
      <div className="player-header">
        <div className="player-info">
          <h2>Welcome, {playerName}!</h2>
          <div className="connection-status">
            <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
          </div>
        </div>
        
        <div className="player-stats">
          <div className="stat">
            <span className="stat-label">Questions Answered:</span>
            <span className="stat-value">{gameStats.questionsAnswered}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Total Points:</span>
            <span className="stat-value">{gameStats.totalPoints || 0}</span>
          </div>
        </div>

        <button onClick={leaveGame} className="leave-btn">
          Leave Game
        </button>
      </div>

      {quizResults ? (
        <div className="quiz-results">
          <h3>🎉 Quiz Complete!</h3>
          
          {quizResults.winner && (
            <div className="winner-announcement">
              <h4>{quizResults.winner.message}</h4>
            </div>
          )}
          
          <div className="quiz-summary">
            <p><strong>Total Questions:</strong> {quizResults.quizSummary.totalQuestions}</p>
            <p><strong>Completed:</strong> {new Date(quizResults.quizSummary.completedAt).toLocaleTimeString()}</p>
          </div>
          
          <h4>Final Results:</h4>
          <div className="results-table">
            {quizResults.results.map((player, index) => (
              <div 
                key={player.playerUuid} 
                className={`result-row ${player.playerUuid === userUuid ? 'own-result' : ''} ${index === 0 ? 'winner-row' : ''}`}
              >
                <div className="rank">#{index + 1}</div>
                <div className="player-name">{player.playerName}</div>
                <div className="points"><strong>{player.totalPoints} pts</strong></div>
                <div className="questions-answered">{player.questionsAnswered} answered</div>
              </div>
            ))}
          </div>
          
          {quizResults.results.find(p => p.playerUuid === userUuid) && (
            <div className="personal-stats">
              <h4>Your Performance:</h4>
              {(() => {
                const myResult = quizResults.results.find(p => p.playerUuid === userUuid);
                const myRank = quizResults.results.findIndex(p => p.playerUuid === userUuid) + 1;
                return (
                  <div className="stats-summary">
                    <p><strong>Final Rank:</strong> #{myRank} out of {quizResults.results.length}</p>
                    <p><strong>Total Points:</strong> {myResult.totalPoints} points</p>
                    <p><strong>Questions Answered:</strong> {myResult.questionsAnswered} out of {quizResults.quizSummary.totalQuestions}</p>
                    
                    {myResult.questionBreakdown && (
                      <div className="question-breakdown">
                        <h5>Question by Question:</h5>
                        {myResult.questionBreakdown.map((q, i) => (
                          <div key={i} className={`question-result ${q.status.toLowerCase().replace(' ', '-')}`}>
                            <span>Q{q.questionNumber}: </span>
                            <span className="points">{q.points} pts</span>
                            <span className="status">({q.status})</span>
                            {q.responseTime && <span className="time">{q.responseTime}s</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          
          <div className="scoring-info">
            <h5>Scoring System:</h5>
            <p><strong>3 pts:</strong> First correct answer | <strong>1 pt:</strong> Correct (not first) | <strong>0 pts:</strong> Wrong/No answer</p>
          </div>
        </div>
      ) : !currentQuestion ? (
        <div className="waiting-room">
          {currentQuiz ? (
            <>
              {joinedMidQuiz ? (
                <>
                  <h3>🔄 Joined ongoing quiz!</h3>
                  <p>You've successfully joined a quiz in progress.</p>
                  <p><strong>Questions:</strong> {currentQuiz.questionCount} total</p>
                  <p>You'll be able to participate in the remaining questions.</p>
                  <div className="waiting-indicator">⏳</div>
                </>
              ) : (
                <>
                  <h3>Quiz Ready!</h3>
                  <p><strong>Questions:</strong> {currentQuiz.questionCount}</p>
                  <p>Waiting for the games master to start the quiz...</p>
                  <div className="waiting-indicator">⏳</div>
                </>
              )}
            </>
          ) : (
            <>
              <h3>Waiting for quiz configuration...</h3>
              <p>The games master is setting up the quiz.</p>
              <div className="waiting-indicator">⏳</div>
            </>
          )}
        </div>
      ) : (
        <div className="question-area">
          <div className="question-header">
            <div className="question-progress">
              Question {currentQuestion.questionNumber} of {currentQuestion.totalQuestions}
            </div>
          </div>

          <div className="question-content">
            <h3 className="question-text">{currentQuestion.question}</h3>
            
            <div className="answer-options">
              {currentQuestion.options.map((option, index) => (
                <button
                  key={index}
                  className={`option-btn ${selectedAnswer === index ? 'selected' : ''} ${hasAnswered ? 'disabled' : ''}`}
                  onClick={() => selectAnswer(index)}
                  disabled={hasAnswered}
                >
                  <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                  <span className="option-text">{option}</span>
                </button>
              ))}
            </div>

            {answerResult && (
              <div className="answer-result">
                {answerResult.timeUp ? (
                  <div className="result time-up">
                    ⏰ Time's up! You didn't submit an answer.
                  </div>
                ) : answerResult.waitingForFeedback ? (
                  <div className="result submitted">
                    ✅ Answer submitted! Waiting for results...
                    <p>You answered: <strong>{String.fromCharCode(65 + answerResult.answerIndex)} - {currentQuestion.options[answerResult.answerIndex]}</strong></p>
                  </div>
                ) : answerResult.feedback ? (
                  <div className={`result feedback ${answerResult.feedback === 'No answer submitted' ? 'no-answer' : (answerResult.isCorrect ? 'correct' : 'incorrect')}`}>
                    <div className="feedback-header">
                      {answerResult.feedback === 'No answer submitted' ? (
                        <span className="feedback-title">⏰ Question closed - No answer submitted</span>
                      ) : answerResult.isCorrect ? (
                        answerResult.wasFastest ? (
                          <span className="feedback-title">🎉 Right, and fastest!</span>
                        ) : (
                          <span className="feedback-title">✅ Right, but not fastest</span>
                        )
                      ) : (
                        <span className="feedback-title">❌ Wrong</span>
                      )}
                      {answerResult.feedback !== 'No answer submitted' && (
                        <span className="response-time">Your time: {answerResult.responseTime}s</span>
                      )}
                    </div>
                    <div className="answer-info">
                      {answerResult.feedback === 'No answer submitted' ? (
                        <p><strong>You did not answer in time.</strong></p>
                      ) : (
                        <p><strong>You answered:</strong> {String.fromCharCode(65 + answerResult.answerIndex)} - {currentQuestion.options[answerResult.answerIndex]}</p>
                      )}
                      {(!answerResult.isCorrect || answerResult.feedback === 'No answer submitted') && answerResult.correctAnswerIndex !== undefined && (
                        <p><strong>Correct answer:</strong> {String.fromCharCode(65 + answerResult.correctAnswerIndex)} - {answerResult.correctAnswerText}</p>
                      )}
                    </div>
                    {answerResult.explanation && (
                      <div className="explanation">
                        <strong>Explanation:</strong> {answerResult.explanation}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="result no-answer">
                    ❌ No answer submitted
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Player;

