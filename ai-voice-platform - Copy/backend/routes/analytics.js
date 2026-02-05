/**
 * Analytics Routes
 * Dashboard metrics, reporting, and call analytics
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../services/database');
const { AnalyticsService } = require('../services/analytics');
const { tenantResolver, requireRole } = require('../middleware');

// Apply tenant resolver to all routes
router.use(tenantResolver);

/**
 * GET /api/analytics/overview
 * Get high-level metrics overview
 */
router.get('/overview', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const analytics = new AnalyticsService(req.orgId);
    const overview = await analytics.getOverview(period);

    res.json(overview);

  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/analytics/daily
 * Get daily breakdown of metrics
 */
router.get('/daily', async (req, res) => {
  try {
    const { 
      startDate, 
      endDate,
      days = 30 
    } = req.query;

    let start, end;
    
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - parseInt(days));
    }

    const result = await pool.query(
      `SELECT date, total_calls, completed_calls, escalated_calls,
              avg_duration_seconds, total_cost_usd, estimated_human_cost_usd,
              avg_satisfaction_score
       FROM analytics_daily
       WHERE org_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date ASC`,
      [req.orgId, start, end]
    );

    // Calculate totals
    const totals = result.rows.reduce((acc, row) => {
      acc.totalCalls += row.total_calls;
      acc.completedCalls += row.completed_calls;
      acc.escalatedCalls += row.escalated_calls;
      acc.totalCost += parseFloat(row.total_cost_usd);
      acc.humanCost += parseFloat(row.estimated_human_cost_usd);
      return acc;
    }, { 
      totalCalls: 0, 
      completedCalls: 0, 
      escalatedCalls: 0, 
      totalCost: 0, 
      humanCost: 0 
    });

    res.json({
      daily: result.rows,
      totals,
      savings: totals.humanCost - totals.totalCost,
      savingsPercentage: totals.humanCost > 0 
        ? ((totals.humanCost - totals.totalCost) / totals.humanCost * 100).toFixed(1)
        : 0,
      period: { start, end }
    });

  } catch (error) {
    console.error('Daily analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch daily analytics' });
  }
});

/**
 * GET /api/analytics/calls
 * Get recent calls with details
 */
router.get('/calls', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      escalated,
      startDate,
      endDate,
      search
    } = req.query;

    const offset = (page - 1) * limit;
    const params = [req.orgId];
    let whereClause = 'WHERE org_id = $1';
    let paramIndex = 2;

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (escalated !== undefined) {
      whereClause += ` AND was_escalated = $${paramIndex}`;
      params.push(escalated === 'true');
      paramIndex++;
    }

    if (startDate) {
      whereClause += ` AND created_at >= $${paramIndex}`;
      params.push(new Date(startDate));
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND created_at <= $${paramIndex}`;
      params.push(new Date(endDate));
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (caller_number ILIKE $${paramIndex} OR summary ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM calls ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated calls
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT id, exotel_call_sid, caller_number, status, 
              duration_seconds, total_tokens, 
              llm_cost_usd, stt_cost_usd, tts_cost_usd,
              summary, sentiment, was_escalated, escalated_to,
              recording_url, created_at
       FROM calls
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    res.json({
      calls: result.rows.map(call => ({
        ...call,
        totalCost: (
          parseFloat(call.llm_cost_usd || 0) + 
          parseFloat(call.stt_cost_usd || 0) + 
          parseFloat(call.tts_cost_usd || 0)
        ).toFixed(4)
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get calls error:', error);
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

/**
 * GET /api/analytics/calls/:id
 * Get single call details with transcript
 */
router.get('/calls/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, exotel_call_sid, caller_number, status,
              duration_seconds, total_tokens,
              llm_cost_usd, stt_cost_usd, tts_cost_usd,
              transcript, summary, sentiment,
              was_escalated, escalated_to, escalation_reason,
              recording_url, created_at, ended_at
       FROM calls
       WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const call = result.rows[0];

    res.json({
      ...call,
      totalCost: (
        parseFloat(call.llm_cost_usd || 0) + 
        parseFloat(call.stt_cost_usd || 0) + 
        parseFloat(call.tts_cost_usd || 0)
      ).toFixed(4),
      durationFormatted: formatDuration(call.duration_seconds)
    });

  } catch (error) {
    console.error('Get call detail error:', error);
    res.status(500).json({ error: 'Failed to fetch call details' });
  }
});

/**
 * GET /api/analytics/cost-savings
 * Get detailed cost savings analysis
 */
router.get('/cost-savings', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const analytics = new AnalyticsService(req.orgId);
    const savings = await analytics.getCostSavings(period);

    res.json(savings);

  } catch (error) {
    console.error('Cost savings error:', error);
    res.status(500).json({ error: 'Failed to calculate cost savings' });
  }
});

/**
 * GET /api/analytics/escalations
 * Get escalation analytics
 */
router.get('/escalations', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get escalation stats
    const statsResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE was_escalated = true) as escalated_count,
        COUNT(*) as total_count,
        array_agg(DISTINCT escalation_reason) FILTER (WHERE escalation_reason IS NOT NULL) as reasons
       FROM calls
       WHERE org_id = $1 AND created_at >= $2`,
      [req.orgId, startDate]
    );

    // Get escalation reasons breakdown
    const reasonsResult = await pool.query(
      `SELECT escalation_reason, COUNT(*) as count
       FROM calls
       WHERE org_id = $1 AND created_at >= $2 AND was_escalated = true
       GROUP BY escalation_reason
       ORDER BY count DESC`,
      [req.orgId, startDate]
    );

    // Get daily escalation trend
    const trendResult = await pool.query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) FILTER (WHERE was_escalated = true) as escalated,
        COUNT(*) as total
       FROM calls
       WHERE org_id = $1 AND created_at >= $2
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [req.orgId, startDate]
    );

    const stats = statsResult.rows[0];
    const escalationRate = stats.total_count > 0 
      ? (stats.escalated_count / stats.total_count * 100).toFixed(1)
      : 0;

    res.json({
      summary: {
        escalatedCalls: parseInt(stats.escalated_count),
        totalCalls: parseInt(stats.total_count),
        escalationRate: parseFloat(escalationRate)
      },
      byReason: reasonsResult.rows,
      dailyTrend: trendResult.rows.map(row => ({
        date: row.date,
        escalated: parseInt(row.escalated),
        total: parseInt(row.total),
        rate: row.total > 0 ? (row.escalated / row.total * 100).toFixed(1) : 0
      }))
    });

  } catch (error) {
    console.error('Escalations analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch escalation analytics' });
  }
});

/**
 * GET /api/analytics/sentiment
 * Get sentiment analysis breakdown
 */
router.get('/sentiment', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const result = await pool.query(
      `SELECT 
        sentiment,
        COUNT(*) as count,
        AVG(duration_seconds) as avg_duration
       FROM calls
       WHERE org_id = $1 AND created_at >= $2 AND sentiment IS NOT NULL
       GROUP BY sentiment
       ORDER BY count DESC`,
      [req.orgId, startDate]
    );

    const total = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);

    res.json({
      distribution: result.rows.map(row => ({
        sentiment: row.sentiment,
        count: parseInt(row.count),
        percentage: total > 0 ? (row.count / total * 100).toFixed(1) : 0,
        avgDuration: Math.round(row.avg_duration)
      })),
      total
    });

  } catch (error) {
    console.error('Sentiment analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch sentiment analytics' });
  }
});

/**
 * GET /api/analytics/hourly
 * Get call distribution by hour
 */
router.get('/hourly', async (req, res) => {
  try {
    const { days = 30, timezone = 'Asia/Kolkata' } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const result = await pool.query(
      `SELECT 
        EXTRACT(HOUR FROM created_at AT TIME ZONE $3) as hour,
        COUNT(*) as count,
        AVG(duration_seconds) as avg_duration
       FROM calls
       WHERE org_id = $1 AND created_at >= $2
       GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE $3)
       ORDER BY hour`,
      [req.orgId, startDate, timezone]
    );

    // Fill in missing hours with 0
    const hourlyData = Array.from({ length: 24 }, (_, i) => {
      const existing = result.rows.find(r => parseInt(r.hour) === i);
      return {
        hour: i,
        label: `${i.toString().padStart(2, '0')}:00`,
        count: existing ? parseInt(existing.count) : 0,
        avgDuration: existing ? Math.round(existing.avg_duration) : 0
      };
    });

    // Find peak hours
    const peakHour = hourlyData.reduce((max, h) => h.count > max.count ? h : max, hourlyData[0]);

    res.json({
      hourly: hourlyData,
      peakHour: {
        hour: peakHour.hour,
        label: peakHour.label,
        count: peakHour.count
      },
      timezone
    });

  } catch (error) {
    console.error('Hourly analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch hourly analytics' });
  }
});

/**
 * GET /api/analytics/export
 * Export analytics data as CSV
 */
router.get('/export',
  requireRole('owner', 'admin'),
  async (req, res) => {
    try {
      const { startDate, endDate, type = 'calls' } = req.query;

      let result;
      let filename;

      if (type === 'calls') {
        result = await pool.query(
          `SELECT 
            exotel_call_sid as call_id,
            caller_number,
            status,
            duration_seconds,
            total_tokens,
            (llm_cost_usd + stt_cost_usd + tts_cost_usd) as total_cost_usd,
            sentiment,
            was_escalated,
            escalated_to,
            summary,
            created_at
           FROM calls
           WHERE org_id = $1 
             AND ($2::date IS NULL OR created_at >= $2)
             AND ($3::date IS NULL OR created_at <= $3)
           ORDER BY created_at DESC`,
          [req.orgId, startDate || null, endDate || null]
        );
        filename = `calls-export-${Date.now()}.csv`;
      } else if (type === 'daily') {
        result = await pool.query(
          `SELECT 
            date,
            total_calls,
            completed_calls,
            escalated_calls,
            avg_duration_seconds,
            total_cost_usd,
            estimated_human_cost_usd,
            (estimated_human_cost_usd - total_cost_usd) as savings_usd
           FROM analytics_daily
           WHERE org_id = $1
             AND ($2::date IS NULL OR date >= $2)
             AND ($3::date IS NULL OR date <= $3)
           ORDER BY date DESC`,
          [req.orgId, startDate || null, endDate || null]
        );
        filename = `daily-analytics-${Date.now()}.csv`;
      } else {
        return res.status(400).json({ error: 'Invalid export type' });
      }

      // Convert to CSV
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No data to export' });
      }

      const headers = Object.keys(result.rows[0]);
      const csv = [
        headers.join(','),
        ...result.rows.map(row => 
          headers.map(h => {
            const val = row[h];
            if (val === null) return '';
            if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
            if (val instanceof Date) return val.toISOString();
            return val;
          }).join(',')
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);

    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ error: 'Export failed' });
    }
  }
);

/**
 * GET /api/analytics/realtime
 * Get real-time metrics (active calls, queue status)
 */
router.get('/realtime', async (req, res) => {
  try {
    const { redis } = require('../services/redis');

    // Get active calls
    const activeCalls = await redis.scard(`concurrent:${req.orgId}`);
    
    // Get calls in transfer queue
    const transferQueue = await redis.llen(`transfer_queue:${req.orgId}`);

    // Get today's stats
    const today = new Date().toISOString().split('T')[0];
    const todayStats = await pool.query(
      `SELECT 
        COUNT(*) as calls_today,
        SUM(duration_seconds) as total_duration,
        AVG(duration_seconds) as avg_duration,
        COUNT(*) FILTER (WHERE was_escalated = true) as escalated_today
       FROM calls
       WHERE org_id = $1 AND DATE(created_at) = $2`,
      [req.orgId, today]
    );

    const stats = todayStats.rows[0];

    res.json({
      activeCalls: parseInt(activeCalls),
      transferQueue: parseInt(transferQueue),
      today: {
        totalCalls: parseInt(stats.calls_today),
        totalDuration: parseInt(stats.total_duration) || 0,
        avgDuration: Math.round(stats.avg_duration) || 0,
        escalated: parseInt(stats.escalated_today)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Realtime analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch realtime data' });
  }
});

/**
 * Format duration in human readable form
 */
function formatDuration(seconds) {
  if (!seconds) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

module.exports = router;
