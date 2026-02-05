/**
 * Exotel Routes - Webhook handlers for Exotel telephony
 * Handles incoming calls, status updates, recordings, transfers
 */

const express = require('express');
const router = express.Router();
const { scopedQuery, pool } = require('../services/database');
const redis = require('../services/redis');

// Simple API key authentication middleware (inline to avoid import issues)
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (!apiKey) {
      // For Exotel webhooks, we might not have API key - check for Exotel signature instead
      const exotelSignature = req.headers['x-exotel-signature'];
      if (exotelSignature) {
        // TODO: Verify Exotel signature if needed
        return next();
      }
      return res.status(401).json({ error: 'API key required' });
    }
    
    // Hash the key and look it up
    const crypto = require('crypto');
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    const result = await pool.query(
      'SELECT ak.*, o.id as org_id, o.status as org_status FROM api_keys ak JOIN organizations o ON ak.org_id = o.id WHERE ak.key_hash = $1 AND ak.status = $2',
      [keyHash, 'active']
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    const key = result.rows[0];
    
    if (key.org_status !== 'active') {
      return res.status(403).json({ error: 'Organization inactive' });
    }
    
    // Update last used
    await pool.query('UPDATE api_keys SET last_used = NOW() WHERE id = $1', [key.id]);
    
    req.orgId = key.org_id;
    next();
  } catch (error) {
    console.error('API key auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * POST /api/exotel/incoming
 * Called when a new call comes in - returns App ID for AgentStream
 */
router.post('/incoming', async (req, res) => {
  try {
    const { 
      CallSid, 
      From, 
      To, 
      Direction,
      CallType 
    } = req.body;
    
    console.log('[Exotel] Incoming call:', { CallSid, From, To, Direction });
    
    // Get org from the Exotel number (To)
    // In production, map Exotel numbers to org_ids
    const orgResult = await pool.query(
      'SELECT id FROM organizations WHERE status = $1 LIMIT 1',
      ['active']
    );
    
    if (orgResult.rows.length === 0) {
      console.error('[Exotel] No active organization found');
      return res.status(400).send('No active organization');
    }
    
    const orgId = orgResult.rows[0].id;
    
    // Create call record
    await pool.query(
      `INSERT INTO calls (org_id, exotel_call_sid, caller_number, direction, status, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [orgId, CallSid, From, Direction || 'inbound', 'initiated']
    );
    
    // Initialize Redis session for this call
    await redis.setCallSession(CallSid, {
      orgId,
      callerNumber: From,
      startedAt: Date.now(),
      transcript: [],
      status: 'active'
    });
    
    // Return Exotel App ID to connect to AgentStream
    const appId = process.env.EXOTEL_APP_ID || 'voiceai-agent';
    
    res.set('Content-Type', 'text/plain');
    res.send(appId);
    
  } catch (error) {
    console.error('[Exotel] Incoming call error:', error);
    res.status(500).send('Error processing call');
  }
});

/**
 * POST /api/exotel/status
 * Call status updates (ringing, in-progress, completed, failed)
 */
router.post('/status', async (req, res) => {
  try {
    const {
      CallSid,
      Status,
      Duration,
      RecordingUrl,
      Direction
    } = req.body;
    
    console.log('[Exotel] Status update:', { CallSid, Status, Duration });
    
    // Map Exotel status to our status
    const statusMap = {
      'ringing': 'ringing',
      'in-progress': 'active',
      'completed': 'completed',
      'busy': 'failed',
      'no-answer': 'failed',
      'failed': 'failed',
      'canceled': 'canceled'
    };
    
    const mappedStatus = statusMap[Status] || Status;
    
    // Update call record
    const updateFields = ['status = $1', 'updated_at = NOW()'];
    const updateValues = [mappedStatus];
    let paramIndex = 2;
    
    if (Duration) {
      updateFields.push(`duration_seconds = $${paramIndex}`);
      updateValues.push(parseInt(Duration));
      paramIndex++;
    }
    
    if (RecordingUrl) {
      updateFields.push(`recording_url = $${paramIndex}`);
      updateValues.push(RecordingUrl);
      paramIndex++;
    }
    
    if (['completed', 'failed', 'canceled'].includes(mappedStatus)) {
      updateFields.push(`ended_at = NOW()`);
    }
    
    updateValues.push(CallSid);
    
    await pool.query(
      `UPDATE calls SET ${updateFields.join(', ')} WHERE exotel_call_sid = $${paramIndex}`,
      updateValues
    );
    
    // Clean up Redis session if call ended
    if (['completed', 'failed', 'canceled'].includes(mappedStatus)) {
      await redis.deleteCallSession(CallSid);
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('[Exotel] Status update error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

/**
 * POST /api/exotel/recording
 * Recording URL callback
 */
router.post('/recording', async (req, res) => {
  try {
    const { CallSid, RecordingUrl } = req.body;
    
    console.log('[Exotel] Recording ready:', { CallSid, RecordingUrl });
    
    await pool.query(
      'UPDATE calls SET recording_url = $1, updated_at = NOW() WHERE exotel_call_sid = $2',
      [RecordingUrl, CallSid]
    );
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('[Exotel] Recording callback error:', error);
    res.status(500).json({ error: 'Failed to save recording' });
  }
});

/**
 * POST /api/exotel/transfer
 * Escalation/transfer status tracking
 */
router.post('/transfer', async (req, res) => {
  try {
    const {
      CallSid,
      TransferTo,
      TransferStatus,
      WhisperPlayed
    } = req.body;
    
    console.log('[Exotel] Transfer update:', { CallSid, TransferTo, TransferStatus });
    
    // Get call info
    const callResult = await pool.query(
      'SELECT id, org_id FROM calls WHERE exotel_call_sid = $1',
      [CallSid]
    );
    
    if (callResult.rows.length > 0) {
      const call = callResult.rows[0];
      
      // Log the escalation
      await pool.query(
        `INSERT INTO escalation_logs (org_id, call_id, transferred_to, transfer_status, whisper_played)
         VALUES ($1, $2, $3, $4, $5)`,
        [call.org_id, call.id, TransferTo, TransferStatus, WhisperPlayed === 'true']
      );
      
      // Update call record
      await pool.query(
        `UPDATE calls SET was_escalated = true, transferred_to = $1, updated_at = NOW()
         WHERE id = $2`,
        [TransferTo, call.id]
      );
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('[Exotel] Transfer update error:', error);
    res.status(500).json({ error: 'Failed to update transfer' });
  }
});

/**
 * POST /api/exotel/dtmf
 * Handle keypad input during calls
 */
router.post('/dtmf', async (req, res) => {
  try {
    const { CallSid, Digits } = req.body;
    
    console.log('[Exotel] DTMF input:', { CallSid, Digits });
    
    // Get session and add DTMF to context
    const session = await redis.getCallSession(CallSid);
    if (session) {
      session.lastDtmf = Digits;
      session.dtmfHistory = session.dtmfHistory || [];
      session.dtmfHistory.push({ digits: Digits, timestamp: Date.now() });
      await redis.setCallSession(CallSid, session);
    }
    
    res.json({ success: true, digits: Digits });
    
  } catch (error) {
    console.error('[Exotel] DTMF error:', error);
    res.status(500).json({ error: 'Failed to process DTMF' });
  }
});

/**
 * GET /api/exotel/health
 * Health check endpoint for webhook monitoring
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'exotel-webhooks',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/exotel/context/:callSid
 * Debug endpoint to check call session (protected)
 */
router.get('/context/:callSid', authenticateApiKey, async (req, res) => {
  try {
    const { callSid } = req.params;
    
    // Get from Redis
    const session = await redis.getCallSession(callSid);
    
    // Get from DB
    const dbResult = await pool.query(
      'SELECT * FROM calls WHERE exotel_call_sid = $1',
      [callSid]
    );
    
    res.json({
      redis: session,
      database: dbResult.rows[0] || null
    });
    
  } catch (error) {
    console.error('[Exotel] Context fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch context' });
  }
});

module.exports = router;