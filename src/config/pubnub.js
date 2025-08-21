// PubNub Configuration
// Add your keys to .env file (see pubnub-config-template.md)
// Get keys from https://admin.pubnub.com

const publishKey = import.meta.env.VITE_PUBNUB_PUBLISH_KEY || 'demo';
const subscribeKey = import.meta.env.VITE_PUBNUB_SUBSCRIBE_KEY || 'demo';
const customUserId = import.meta.env.VITE_PUBNUB_USER_ID;

// Generate a unique user ID
const generateUserId = () => {
  if (customUserId) return customUserId;
  return `quiz-user-${Math.random().toString(36).substr(2, 9)}`;
};

export const PUBNUB_CONFIG = {
  publishKey,
  subscribeKey,
  uuid: generateUserId(),
  // Additional PubNub configuration options
  autoNetworkDetection: true,
  restore: true,
  heartbeatInterval: 10
};

// Helper to check if using demo keys
export const isUsingDemoKeys = () => {
  return publishKey === 'demo' || subscribeKey === 'demo';
};

// Log configuration status (for debugging)
if (import.meta.env.DEV) {
  console.log('PubNub Config:', {
    publishKey: publishKey.slice(0, 10) + '...',
    subscribeKey: subscribeKey.slice(0, 10) + '...',
    hasPublishKey: publishKey !== 'demo',
    hasSubscribeKey: subscribeKey !== 'demo',
    userId: PUBNUB_CONFIG.uuid
  });
}

// Channel names for different aspects of the game
export const CHANNELS = {
  LOBBY: 'trivia-lobby',
  QUESTIONS: 'trivia-questions', 
  ANSWERS: 'trivia-answers',
  GAME_CONTROL: 'trivia-game-control'
};

// Quiz configuration constants
export const QUIZ_CONFIGS = {
  QUESTION_COUNTS: [3, 5, 10],
  DEFAULT_TIME_LIMIT: 30,
  MAX_PLAYERS: 50
};

// Message types for structured communication
export const MESSAGE_TYPES = {
  PLAYER_JOIN: 'player_join',
  PLAYER_LEAVE: 'player_leave',
  QUESTION_ASKED: 'question_asked',
  ANSWER_SUBMITTED: 'answer_submitted',
  ANSWER_RESULT: 'answer_result',
  QUIZ_CONFIGURED: 'quiz_configured',
  QUIZ_STARTED: 'quiz_started',
  QUIZ_RESULTS: 'quiz_results',
  GAME_START: 'game_start',
  GAME_END: 'game_end',
  NEW_ROUND: 'new_round'
};

