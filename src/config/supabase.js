import { createClient } from '@supabase/supabase-js'

// Supabase configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate environment variables
if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL environment variable. Please check your .env file.')
}

if (!supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY environment variable. Please check your .env file.')
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database service functions
export const DatabaseService = {
  // Player management
  async createOrUpdatePlayer(pubnubUuid, playerName) {
    try {
      const { data, error } = await supabase
        .from('players')
        .upsert({
          pubnub_uuid: pubnubUuid,
          name: playerName,
          last_seen: new Date().toISOString()
        }, {
          onConflict: 'pubnub_uuid'
        })
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error creating/updating player:', error)
      throw error
    }
  },

  // Game management
  async createGame(pubnubQuizId, questionCount) {
    try {
      const { data, error } = await supabase
        .from('games')
        .insert({
          pubnub_quiz_id: pubnubQuizId,
          question_count: questionCount,
          status: 'in_progress',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          total_players: 0,
          questions_asked: 0,
          rounds_count: questionCount
        })
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error creating game:', error)
      throw error
    }
  },

  async getGameByQuizId(pubnubQuizId) {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('pubnub_quiz_id', pubnubQuizId)
        .single()

      if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows returned
      return data
    } catch (error) {
      console.error('Error getting game:', error)
      throw error
    }
  },

  async addGameParticipant(gameId, playerId) {
    try {
      const { data, error } = await supabase
        .from('game_participants')
        .insert({
          game_id: gameId,
          player_id: playerId
        })
        .select()

      if (error && error.code !== '23505') throw error // 23505 = unique violation (player already in game)
      return data
    } catch (error) {
      console.error('Error adding game participant:', error)
      throw error
    }
  },

  async recordQuestionResult(gameId, playerId, questionNumber, questionId, answerIndex, isCorrect, responseTime, pointsEarned) {
    try {
      const { data, error } = await supabase
        .from('question_results')
        .insert({
          game_id: gameId,
          player_id: playerId,
          question_number: questionNumber,
          question_id: questionId,
          answer_index: answerIndex,
          is_correct: isCorrect,
          response_time: responseTime,
          points_earned: pointsEarned
        })
        .select()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error recording question result:', error)
      throw error
    }
  },

  async completeGame(gameId, winnerId, totalPlayers, questionsAsked, finalResults) {
    try {
      // Update game status
      const { error: gameError } = await supabase
        .from('games')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          winner_id: winnerId,
          total_players: totalPlayers,
          questions_asked: questionsAsked
        })
        .eq('id', gameId)

      if (gameError) throw gameError

      // Update participant final scores
      for (const result of finalResults) {
        const { error: participantError } = await supabase
          .from('game_participants')
          .update({
            total_points: result.totalPoints,
            questions_answered: result.questionsAnswered,
            final_rank: result.rank
          })
          .eq('game_id', gameId)
          .eq('player_id', result.playerId)

        if (participantError) throw participantError

        // Update player statistics
        // Get current player stats first
        const { data: currentPlayer } = await supabase
          .from('players')
          .select('total_games, total_wins, total_points')
          .eq('id', result.playerId)
          .single()

        const { error: playerError } = await supabase
          .from('players')
          .update({
            total_games: (currentPlayer?.total_games || 0) + 1,
            total_wins: (currentPlayer?.total_wins || 0) + (result.rank === 1 ? 1 : 0),
            total_points: (currentPlayer?.total_points || 0) + result.totalPoints
          })
          .eq('id', result.playerId)

        if (playerError) throw playerError
      }

      return true
    } catch (error) {
      console.error('Error completing game:', error)
      throw error
    }
  },

  // Admin queries
  async getRecentGames(limit = 20) {
    try {
      const { data, error } = await supabase
        .from('games')
        .select(`
          *,
          winner:players!winner_id(name),
          participants:game_participants(count)
        `)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error getting recent games:', error)
      throw error
    }
  },

  async getGameDetails(gameId) {
    try {
      const { data, error } = await supabase
        .from('games')
        .select(`
          *,
          winner:players!winner_id(name),
          participants:game_participants(
            total_points,
            questions_answered,
            final_rank,
            player:players(name)
          ),
          question_results(*)
        `)
        .eq('id', gameId)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error getting game details:', error)
      throw error
    }
  },

  async getTopPlayers(limit = 10) {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('name, total_wins, total_games, total_points')
        .order('total_wins', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error getting top players:', error)
      throw error
    }
  }
}
