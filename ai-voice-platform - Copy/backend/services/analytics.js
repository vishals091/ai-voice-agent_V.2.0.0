/**
 * Analytics Service
 * 
 * Handles:
 * - Post-call sync (recording URL, token usage)
 * - Call summaries
 * - Daily aggregates
 * - Cost savings calculations
 * - Error logging
 */

const { rawQuery, withTransaction } = require('./database');
const LLMFactory = require('./llm');

class AnalyticsService {
  constructor() {
    // Human agent cost per hour (Indian market average)
    this.humanCostPerHour = 3.00; // USD
    this.humanCostPerMinute = this.humanCostPerHour / 60;
  }

  // ============================================
  // CALL RECORDING & SYNC
  // ============================================

  /**
   * Save call record after call ends
   */
  async saveCallRecord(orgId, callData) {
    const {
      callSid,
      duration,
      transcript,
      metrics,
      endReason
    } = callData;
    
    // Calculate total cost
    const totalCost = (metrics.llmCost || 0) + (metrics.sttCost || 0) + (metrics.ttsCost || 0);
    
    // Generate call summary
    const summary = await this.generateCallSummary(transcript);
    
    // Analyze sentiment
    const sentiment = await this.analyzeSentiment(transcript);
    
    // Update call record
    const result = await rawQuery(`
      UPDATE calls SET
        status = 'completed',
        ended_at = CURRENT_TIMESTAMP,
        duration_seconds = $1,
        total_tokens = $2,
        llm_cost_usd = $3,
        stt_cost_usd = $4,
        tts_cost_usd = $5,
        transcript = $6,
        summary = $7,
        sentiment = $8,
        metadata = metadata || $9::jsonb
      WHERE exotel_call_sid = $10 AND org_id = $11
      RETURNING *
    `, [
      duration,
      metrics.totalTokens || 0,
      metrics.llmCost || 0,
      metrics.sttCost || 0,
      metrics.ttsCost || 0,
      JSON.stringify(transcript),
      summary,
      sentiment,
      JSON.stringify({ endReason }),
      callSid,
      orgId
    ]);
    
    // Update daily aggregates
    await this.updateDailyAggregates(orgId, {
      duration,
      totalCost,
      tokens: metrics.totalTokens || 0,
      completed: true
    });
    
    return result.rows[0];
  }

  /**
   * Sync Exotel recording URL after call
   */
  async syncRecordingUrl(orgId, callSid, recordingUrl) {
    await rawQuery(`
      UPDATE calls 
      SET exotel_recording_url = $1
      WHERE exotel_call_sid = $2 AND org_id = $3
    `, [recordingUrl, callSid, orgId]);
  }

  /**
   * Generate call summary using LLM
   */
  async generateCallSummary(transcript) {
    if (!transcript || transcript.length === 0) {
      return 'No conversation recorded';
    }
    
    try {
      const llm = LLMFactory.create('openai');
      
      const conversationText = transcript
        .map(m => `${m.role === 'user' ? 'Customer' : 'AI'}: ${m.content}`)
        .join('\n');
      
      const summary = await llm.complete({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Generate a brief 2-3 sentence summary of this customer support call. Include the main topic and resolution. Use English.'
          },
          {
            role: 'user',
            content: conversationText
          }
        ],
        maxTokens: 100
      });
      
      return summary;
    } catch (error) {
      console.error('Summary generation error:', error);
      return 'Summary unavailable';
    }
  }

  /**
   * Analyze call sentiment
   */
  async analyzeSentiment(transcript) {
    if (!transcript || transcript.length === 0) {
      return 'neutral';
    }
    
    try {
      const llm = LLMFactory.create('openai');
      
      const customerMessages = transcript
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join(' ');
      
      const result = await llm.complete({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Analyze the sentiment of these customer messages. Respond with exactly one word: positive, negative, or neutral.'
          },
          {
            role: 'user',
            content: customerMessages
          }
        ],
        maxTokens: 10
      });
      
      const sentiment = result.toLowerCase().trim();
      return ['positive', 'negative', 'neutral'].includes(sentiment) ? sentiment : 'neutral';
    } catch (error) {
      return 'neutral';
    }
  }

  // ============================================
  // DAILY AGGREGATES
  // ============================================

  /**
   * Update daily aggregate metrics
   */
  async updateDailyAggregates(orgId, callData) {
    const { duration, totalCost, tokens, completed, escalated } = callData;
    
    const today = new Date().toISOString().split('T')[0];
    
    // Calculate estimated human cost for this call duration
    const humanCost = (duration / 60) * this.humanCostPerMinute;
    
    await rawQuery(`
      INSERT INTO analytics_daily (org_id, date, total_calls, completed_calls, escalated_calls, 
                                   avg_duration_seconds, total_cost_usd, llm_cost_usd, 
                                   voice_cost_usd, total_tokens, estimated_human_cost_usd)
      VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (org_id, date) DO UPDATE SET
        total_calls = analytics_daily.total_calls + 1,
        completed_calls = analytics_daily.completed_calls + $3,
        escalated_calls = analytics_daily.escalated_calls + $4,
        avg_duration_seconds = (analytics_daily.avg_duration_seconds * analytics_daily.total_calls + $5) / (analytics_daily.total_calls + 1),
        total_cost_usd = analytics_daily.total_cost_usd + $6,
        llm_cost_usd = analytics_daily.llm_cost_usd + $7,
        voice_cost_usd = analytics_daily.voice_cost_usd + $8,
        total_tokens = analytics_daily.total_tokens + $9,
        estimated_human_cost_usd = analytics_daily.estimated_human_cost_usd + $10
    `, [
      orgId,
      today,
      completed ? 1 : 0,
      escalated ? 1 : 0,
      duration,
      totalCost,
      callData.llmCost || totalCost * 0.7,
      callData.voiceCost || totalCost * 0.3,
      tokens,
      humanCost
    ]);
  }

  // ============================================
  // ANALYTICS QUERIES
  // ============================================

  /**
   * Get analytics overview
   */
  async getOverview(orgId, period = 30) {
    const result = await rawQuery(`
      WITH period_stats AS (
        SELECT 
          SUM(total_calls) as total_calls,
          SUM(completed_calls) as completed_calls,
          SUM(escalated_calls) as escalated_calls,
          AVG(avg_duration_seconds) as avg_duration,
          SUM(total_cost_usd) as total_cost,
          SUM(total_tokens) as total_tokens,
          SUM(estimated_human_cost_usd) as human_cost
        FROM analytics_daily
        WHERE org_id = $1 AND date >= CURRENT_DATE - $2::interval
      )
      SELECT 
        *,
        CASE WHEN total_calls > 0 
          THEN ROUND((completed_calls::numeric / total_calls) * 100, 2) 
          ELSE 0 
        END as completion_rate,
        CASE WHEN total_calls > 0 
          THEN ROUND((escalated_calls::numeric / total_calls) * 100, 2) 
          ELSE 0 
        END as escalation_rate,
        ROUND(human_cost - total_cost, 2) as cost_savings
      FROM period_stats
    `, [orgId, `${period} days`]);
    
    return result.rows[0];
  }

  /**
   * Get daily breakdown
   */
  async getDailyBreakdown(orgId, days = 30) {
    const result = await rawQuery(`
      SELECT 
        date,
        total_calls,
        completed_calls,
        escalated_calls,
        avg_duration_seconds,
        total_cost_usd,
        estimated_human_cost_usd,
        estimated_human_cost_usd - total_cost_usd as cost_savings
      FROM analytics_daily
      WHERE org_id = $1 AND date >= CURRENT_DATE - $2::interval
      ORDER BY date DESC
    `, [orgId, `${days} days`]);
    
    return result.rows;
  }

  /**
   * Get cost savings analysis
   */
  async getCostSavings(orgId, period = 30) {
    const result = await rawQuery(`
      SELECT 
        SUM(total_cost_usd) as ai_cost,
        SUM(estimated_human_cost_usd) as human_cost,
        SUM(estimated_human_cost_usd - total_cost_usd) as total_savings,
        CASE WHEN SUM(estimated_human_cost_usd) > 0 
          THEN ROUND(((SUM(estimated_human_cost_usd) - SUM(total_cost_usd)) / SUM(estimated_human_cost_usd)) * 100, 2)
          ELSE 0 
        END as savings_percentage,
        SUM(total_calls) as total_calls,
        SUM(total_tokens) as total_tokens,
        AVG(avg_duration_seconds) as avg_call_duration
      FROM analytics_daily
      WHERE org_id = $1 AND date >= CURRENT_DATE - $2::interval
    `, [orgId, `${period} days`]);
    
    return result.rows[0];
  }

  /**
   * Get recent calls
   */
  async getRecentCalls(orgId, limit = 20, offset = 0) {
    const result = await rawQuery(`
      SELECT 
        id, exotel_call_sid, caller_number, direction, status,
        started_at, ended_at, duration_seconds,
        total_tokens, 
        llm_cost_usd + stt_cost_usd + tts_cost_usd as total_cost,
        summary, sentiment,
        was_escalated, escalated_to
      FROM calls
      WHERE org_id = $1
      ORDER BY started_at DESC
      LIMIT $2 OFFSET $3
    `, [orgId, limit, offset]);
    
    return result.rows;
  }

  /**
   * Get call details
   */
  async getCallDetails(orgId, callId) {
    const result = await rawQuery(`
      SELECT *
      FROM calls
      WHERE id = $1 AND org_id = $2
    `, [callId, orgId]);
    
    return result.rows[0];
  }

  /**
   * Get hourly distribution
   */
  async getHourlyDistribution(orgId, days = 7) {
    const result = await rawQuery(`
      SELECT 
        EXTRACT(HOUR FROM started_at) as hour,
        COUNT(*) as call_count,
        AVG(duration_seconds) as avg_duration
      FROM calls
      WHERE org_id = $1 
        AND started_at >= CURRENT_DATE - $2::interval
        AND status = 'completed'
      GROUP BY EXTRACT(HOUR FROM started_at)
      ORDER BY hour
    `, [orgId, `${days} days`]);
    
    return result.rows;
  }

  // ============================================
  // EVENT LOGGING
  // ============================================

  /**
   * Log escalation event
   */
  async logEscalation(orgId, callSid, data) {
    await rawQuery(`
      UPDATE calls SET
        was_escalated = true,
        escalated_to = $1,
        escalation_reason = $2
      WHERE exotel_call_sid = $3 AND org_id = $4
    `, [data.transferTo, data.reason, callSid, orgId]);
    
    // Update daily aggregate
    await this.updateDailyAggregates(orgId, { escalated: true, duration: 0, totalCost: 0, tokens: 0 });
  }

  /**
   * Log event (barge-in, etc.)
   */
  async logEvent(orgId, callSid, eventType, data = {}) {
    await rawQuery(`
      UPDATE calls SET
        metadata = metadata || $1::jsonb
      WHERE exotel_call_sid = $2 AND org_id = $3
    `, [
      JSON.stringify({ [`event_${eventType}_${Date.now()}`]: data }),
      callSid,
      orgId
    ]);
  }

  /**
   * Log dashboard session
   */
  async logDashboardSession(orgId, sessionData) {
    const { sessionId, userId, duration, metrics, messageCount } = sessionData;
    
    // Store as a special "dashboard" call type
    await rawQuery(`
      INSERT INTO calls (org_id, exotel_call_sid, direction, status, duration_seconds, 
                         total_tokens, llm_cost_usd, stt_cost_usd, tts_cost_usd, metadata)
      VALUES ($1, $2, 'dashboard', 'completed', $3, $4, $5, $6, $7, $8)
    `, [
      orgId,
      sessionId,
      duration,
      metrics.totalTokens || 0,
      metrics.llmCost || 0,
      metrics.sttCost || 0,
      metrics.ttsCost || 0,
      JSON.stringify({ userId, messageCount })
    ]);
  }

  /**
   * Log error
   */
  async logError(orgId, error, context = {}) {
    await rawQuery(`
      INSERT INTO error_logs (org_id, error_type, error_message, error_stack, context)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      orgId,
      error.name || 'Error',
      error.message,
      error.stack,
      JSON.stringify(context)
    ]);
  }
}

module.exports = new AnalyticsService();
