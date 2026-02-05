/**
 * Analytics Service
 * Conversation logging, metrics tracking, and reporting
 */

const { getPool } = require('./database');

/**
 * Log a conversation turn
 */
async function logConversation(data) {
  const {
    sessionId,
    userMessage,
    aiResponse,
    knowledgeUsed = false,
    responseTime,
    tokenCount = 0,
    model = 'unknown'
  } = data;
  
  const pool = getPool();
  
  try {
    await pool.query(`
      INSERT INTO conversations (
        session_id, user_message, ai_response, 
        knowledge_used, response_time_ms, token_count, model
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      sessionId, 
      userMessage, 
      aiResponse, 
      knowledgeUsed, 
      responseTime, 
      tokenCount, 
      model
    ]);
    
    return true;
  } catch (error) {
    console.error('Log conversation error:', error);
    return false;
  }
}

/**
 * Update session metrics when session ends
 */
async function updateConversationMetrics(sessionId, metrics) {
  const {
    totalDuration,
    totalTokens,
    totalAudioDuration,
    responseCount
  } = metrics;
  
  const pool = getPool();
  
  try {
    await pool.query(`
      INSERT INTO session_metrics (
        session_id, total_duration_ms, total_tokens, 
        total_audio_duration_ms, response_count
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (session_id) 
      DO UPDATE SET
        total_duration_ms = $2,
        total_tokens = $3,
        total_audio_duration_ms = $4,
        response_count = $5,
        updated_at = NOW()
    `, [
      sessionId,
      totalDuration,
      totalTokens,
      totalAudioDuration * 1000, // Convert to ms
      responseCount
    ]);
    
    return true;
  } catch (error) {
    console.error('Update metrics error:', error);
    return false;
  }
}

/**
 * Get analytics overview
 */
async function getAnalyticsOverview(timeRange = '24h') {
  const pool = getPool();
  
  // Calculate time filter
  const timeFilter = getTimeFilter(timeRange);
  
  try {
    // Total conversations
    const totalConvos = await pool.query(`
      SELECT COUNT(DISTINCT session_id) as count
      FROM conversations
      WHERE created_at >= $1
    `, [timeFilter]);
    
    // Total messages
    const totalMessages = await pool.query(`
      SELECT COUNT(*) as count
      FROM conversations
      WHERE created_at >= $1
    `, [timeFilter]);
    
    // Average response time
    const avgResponseTime = await pool.query(`
      SELECT AVG(response_time_ms) as avg_time
      FROM conversations
      WHERE created_at >= $1 AND response_time_ms IS NOT NULL
    `, [timeFilter]);
    
    // Total tokens used
    const totalTokens = await pool.query(`
      SELECT SUM(token_count) as total
      FROM conversations
      WHERE created_at >= $1
    `, [timeFilter]);
    
    // Knowledge base usage
    const kbUsage = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE knowledge_used = true) as used,
        COUNT(*) as total
      FROM conversations
      WHERE created_at >= $1
    `, [timeFilter]);
    
    // Model distribution
    const modelDist = await pool.query(`
      SELECT model, COUNT(*) as count
      FROM conversations
      WHERE created_at >= $1
      GROUP BY model
      ORDER BY count DESC
    `, [timeFilter]);
    
    return {
      timeRange,
      totalConversations: parseInt(totalConvos.rows[0].count) || 0,
      totalMessages: parseInt(totalMessages.rows[0].count) || 0,
      avgResponseTimeMs: Math.round(parseFloat(avgResponseTime.rows[0].avg_time) || 0),
      totalTokens: parseInt(totalTokens.rows[0].total) || 0,
      knowledgeBaseUsage: {
        used: parseInt(kbUsage.rows[0].used) || 0,
        total: parseInt(kbUsage.rows[0].total) || 0,
        percentage: kbUsage.rows[0].total > 0 
          ? Math.round((kbUsage.rows[0].used / kbUsage.rows[0].total) * 100) 
          : 0
      },
      modelDistribution: modelDist.rows
    };
  } catch (error) {
    console.error('Get analytics overview error:', error);
    throw error;
  }
}

/**
 * Get conversation history
 */
async function getConversationHistory(options = {}) {
  const {
    sessionId,
    page = 1,
    limit = 50,
    startDate,
    endDate
  } = options;
  
  const pool = getPool();
  const offset = (page - 1) * limit;
  
  try {
    let sql = `
      SELECT * FROM conversations
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (sessionId) {
      sql += ` AND session_id = $${paramIndex}`;
      params.push(sessionId);
      paramIndex++;
    }
    
    if (startDate) {
      sql += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      sql += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(sql, params);
    
    return {
      conversations: result.rows,
      page,
      limit
    };
  } catch (error) {
    console.error('Get conversation history error:', error);
    throw error;
  }
}

/**
 * Get session details
 */
async function getSessionDetails(sessionId) {
  const pool = getPool();
  
  try {
    // Get session metrics
    const metrics = await pool.query(`
      SELECT * FROM session_metrics
      WHERE session_id = $1
    `, [sessionId]);
    
    // Get conversation history
    const conversations = await pool.query(`
      SELECT * FROM conversations
      WHERE session_id = $1
      ORDER BY created_at ASC
    `, [sessionId]);
    
    return {
      sessionId,
      metrics: metrics.rows[0] || null,
      conversations: conversations.rows
    };
  } catch (error) {
    console.error('Get session details error:', error);
    throw error;
  }
}

/**
 * Get hourly statistics for charts
 */
async function getHourlyStats(days = 7) {
  const pool = getPool();
  
  try {
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(DISTINCT session_id) as sessions,
        COUNT(*) as messages,
        AVG(response_time_ms) as avg_response_time,
        SUM(token_count) as tokens
      FROM conversations
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY hour ASC
    `);
    
    return result.rows.map(row => ({
      hour: row.hour,
      sessions: parseInt(row.sessions),
      messages: parseInt(row.messages),
      avgResponseTime: Math.round(parseFloat(row.avg_response_time) || 0),
      tokens: parseInt(row.tokens) || 0
    }));
  } catch (error) {
    console.error('Get hourly stats error:', error);
    throw error;
  }
}

/**
 * Calculate cost savings estimate
 */
async function getCostSavings(timeRange = '30d') {
  const pool = getPool();
  const timeFilter = getTimeFilter(timeRange);
  
  // Assumptions for cost calculation
  const HUMAN_AGENT_HOURLY_COST = 500; // ₹500/hour for India
  const AVG_HUMAN_RESPONSE_TIME_SECONDS = 60; // 1 minute per response
  const TOKEN_COST_PER_1K = 0.015; // $0.015 per 1K tokens (GPT-4o-mini)
  const USD_TO_INR = 83;
  
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_responses,
        SUM(token_count) as total_tokens,
        SUM(response_time_ms) as total_ai_time_ms
      FROM conversations
      WHERE created_at >= $1
    `, [timeFilter]);
    
    const totalResponses = parseInt(result.rows[0].total_responses) || 0;
    const totalTokens = parseInt(result.rows[0].total_tokens) || 0;
    
    // Human agent cost estimate
    const humanTimeHours = (totalResponses * AVG_HUMAN_RESPONSE_TIME_SECONDS) / 3600;
    const humanCostINR = humanTimeHours * HUMAN_AGENT_HOURLY_COST;
    
    // AI cost
    const aiCostUSD = (totalTokens / 1000) * TOKEN_COST_PER_1K;
    const aiCostINR = aiCostUSD * USD_TO_INR;
    
    // Savings
    const savingsINR = humanCostINR - aiCostINR;
    const savingsPercentage = humanCostINR > 0 
      ? ((savingsINR / humanCostINR) * 100).toFixed(1)
      : 0;
    
    return {
      timeRange,
      totalResponses,
      humanCostEstimate: Math.round(humanCostINR),
      aiCost: Math.round(aiCostINR),
      savings: Math.round(savingsINR),
      savingsPercentage: parseFloat(savingsPercentage),
      currency: 'INR'
    };
  } catch (error) {
    console.error('Get cost savings error:', error);
    throw error;
  }
}

/**
 * Export conversations to CSV format
 */
async function exportConversations(options = {}) {
  const {
    startDate,
    endDate,
    format = 'csv'
  } = options;
  
  const pool = getPool();
  
  try {
    let sql = `
      SELECT 
        c.session_id,
        c.user_message,
        c.ai_response,
        c.knowledge_used,
        c.response_time_ms,
        c.token_count,
        c.model,
        c.created_at
      FROM conversations c
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (startDate) {
      sql += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      sql += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const result = await pool.query(sql, params);
    
    if (format === 'csv') {
      return convertToCSV(result.rows);
    }
    
    return result.rows;
  } catch (error) {
    console.error('Export conversations error:', error);
    throw error;
  }
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      // Escape quotes and wrap in quotes
      if (typeof value === 'string') {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value ?? '';
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

/**
 * Get time filter from time range string
 */
function getTimeFilter(timeRange) {
  const now = new Date();
  
  switch (timeRange) {
    case '1h':
      return new Date(now - 60 * 60 * 1000);
    case '24h':
      return new Date(now - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now - 90 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now - 24 * 60 * 60 * 1000);
  }
}

module.exports = {
  logConversation,
  updateConversationMetrics,
  getAnalyticsOverview,
  getConversationHistory,
  getSessionDetails,
  getHourlyStats,
  getCostSavings,
  exportConversations
};
