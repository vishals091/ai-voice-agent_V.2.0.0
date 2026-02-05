/**
 * Redis Service for Real-time Call Session Management
 * 
 * Uses Exotel CallSid as unique key for call state
 * Handles semantic caching for 0ms responses
 */

class RedisService {
  constructor() {
    this.redis = null;
    this.CALL_SESSION_TTL = 3600; // 1 hour
    this.CACHE_TTL = 86400; // 24 hours
    this.RATE_LIMIT_WINDOW = 60; // 1 minute
  }

  init(redis) {
    this.redis = redis;
  }

  // ============================================
  // CALL SESSION MANAGEMENT
  // ============================================

  /**
   * Create or update call session state
   * Key format: call:{CallSid}
   */
  async setCallSession(callSid, sessionData) {
    const key = `call:${callSid}`;
    await this.redis.hmset(key, {
      ...sessionData,
      updatedAt: Date.now()
    });
    await this.redis.expire(key, this.CALL_SESSION_TTL);
  }

  /**
   * Get call session state
   */
  async getCallSession(callSid) {
    const key = `call:${callSid}`;
    const data = await this.redis.hgetall(key);
    if (Object.keys(data).length === 0) return null;
    
    // Parse JSON fields
    if (data.conversationHistory) {
      try {
        data.conversationHistory = JSON.parse(data.conversationHistory);
      } catch (e) {
        data.conversationHistory = [];
      }
    }
    if (data.metadata) {
      try {
        data.metadata = JSON.parse(data.metadata);
      } catch (e) {
        data.metadata = {};
      }
    }
    
    return data;
  }

  /**
   * Update specific field in call session
   */
  async updateCallSessionField(callSid, field, value) {
    const key = `call:${callSid}`;
    if (typeof value === 'object') {
      value = JSON.stringify(value);
    }
    await this.redis.hset(key, field, value);
    await this.redis.hset(key, 'updatedAt', Date.now());
  }

  /**
   * Append message to conversation history
   */
  async appendToConversation(callSid, role, content) {
    const key = `call:${callSid}`;
    const history = await this.redis.hget(key, 'conversationHistory');
    let messages = [];
    
    try {
      messages = history ? JSON.parse(history) : [];
    } catch (e) {
      messages = [];
    }
    
    messages.push({
      role,
      content,
      timestamp: Date.now()
    });
    
    await this.redis.hset(key, 'conversationHistory', JSON.stringify(messages));
  }

  /**
   * Truncate conversation history (for barge-in)
   * Removes messages after the specified timestamp
   */
  async truncateConversation(callSid, afterTimestamp) {
    const key = `call:${callSid}`;
    const history = await this.redis.hget(key, 'conversationHistory');
    
    if (!history) return;
    
    let messages = [];
    try {
      messages = JSON.parse(history);
    } catch (e) {
      return;
    }
    
    // Keep only messages before the interruption
    const truncated = messages.filter(m => m.timestamp < afterTimestamp);
    await this.redis.hset(key, 'conversationHistory', JSON.stringify(truncated));
  }

  /**
   * Delete call session
   */
  async deleteCallSession(callSid) {
    const key = `call:${callSid}`;
    await this.redis.del(key);
  }

  /**
   * Get all active calls for an organization
   */
  async getActiveCalls(orgId) {
    const pattern = 'voiceai:call:*';
    const keys = await this.redis.keys(pattern);
    const activeCalls = [];
    
    for (const key of keys) {
      const data = await this.redis.hgetall(key);
      if (data.orgId === orgId && data.status === 'in_progress') {
        activeCalls.push({
          callSid: key.replace('voiceai:call:', ''),
          ...data
        });
      }
    }
    
    return activeCalls;
  }

  // ============================================
  // TTS AUDIO BUFFER MANAGEMENT
  // ============================================

  /**
   * Store TTS audio buffer for streaming
   */
  async setTTSBuffer(callSid, audioChunks) {
    const key = `tts:${callSid}`;
    await this.redis.rpush(key, ...audioChunks);
    await this.redis.expire(key, 300); // 5 minute TTL
  }

  /**
   * Get and remove TTS audio chunk (FIFO)
   */
  async popTTSChunk(callSid) {
    const key = `tts:${callSid}`;
    return await this.redis.lpop(key);
  }

  /**
   * Clear TTS buffer (for barge-in)
   */
  async clearTTSBuffer(callSid) {
    const key = `tts:${callSid}`;
    await this.redis.del(key);
  }

  // ============================================
  // SEMANTIC CACHING (0ms responses)
  // ============================================

  /**
   * Get cached response for input
   */
  async getCachedResponse(orgId, inputHash) {
    const key = `cache:${orgId}:${inputHash}`;
    const data = await this.redis.hgetall(key);
    
    if (Object.keys(data).length === 0) return null;
    
    // Increment hit count
    await this.redis.hincrby(key, 'hitCount', 1);
    await this.redis.hset(key, 'lastHit', Date.now());
    
    return {
      text: data.text,
      audioBase64: data.audioBase64
    };
  }

  /**
   * Set cached response
   */
  async setCachedResponse(orgId, inputHash, inputText, responseText, audioBase64 = null) {
    const key = `cache:${orgId}:${inputHash}`;
    
    const data = {
      inputText,
      text: responseText,
      hitCount: 0,
      createdAt: Date.now()
    };
    
    if (audioBase64) {
      data.audioBase64 = audioBase64;
    }
    
    await this.redis.hmset(key, data);
    await this.redis.expire(key, this.CACHE_TTL);
  }

  // ============================================
  // TRANSFER QUEUE MANAGEMENT
  // ============================================

  /**
   * Check if transfer number is busy
   */
  async isTransferBusy(transferNumber) {
    const key = `transfer:${transferNumber}`;
    const status = await this.redis.get(key);
    return status === 'busy';
  }

  /**
   * Set transfer number status
   */
  async setTransferStatus(transferNumber, status) {
    const key = `transfer:${transferNumber}`;
    if (status === 'busy') {
      await this.redis.set(key, 'busy', 'EX', 3600); // 1 hour max
    } else {
      await this.redis.del(key);
    }
  }

  /**
   * Add to transfer queue
   */
  async addToTransferQueue(transferNumber, callSid, priority = 0) {
    const key = `queue:${transferNumber}`;
    // ZADD with score = timestamp for FIFO, or negative priority for priority queue
    const score = priority === 0 ? Date.now() : -priority;
    await this.redis.zadd(key, score, callSid);
  }

  /**
   * Get next in transfer queue
   */
  async getNextInQueue(transferNumber) {
    const key = `queue:${transferNumber}`;
    // Get lowest score (oldest or highest priority)
    const result = await this.redis.zrange(key, 0, 0);
    return result[0] || null;
  }

  /**
   * Remove from transfer queue
   */
  async removeFromQueue(transferNumber, callSid) {
    const key = `queue:${transferNumber}`;
    await this.redis.zrem(key, callSid);
  }

  // ============================================
  // RATE LIMITING
  // ============================================

  /**
   * Check and increment rate limit
   */
  async checkRateLimit(identifier, limit = 60) {
    const key = `ratelimit:${identifier}`;
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, this.RATE_LIMIT_WINDOW);
    }
    
    return {
      allowed: current <= limit,
      current,
      limit,
      remaining: Math.max(0, limit - current)
    };
  }

  // ============================================
  // PUBSUB FOR REAL-TIME EVENTS
  // ============================================

  /**
   * Publish event (for dashboard updates)
   */
  async publishEvent(channel, event) {
    await this.redis.publish(channel, JSON.stringify(event));
  }

  /**
   * Subscribe to events
   */
  async subscribe(channel, callback) {
    const subscriber = this.redis.duplicate();
    await subscriber.subscribe(channel);
    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        try {
          callback(JSON.parse(message));
        } catch (e) {
          callback(message);
        }
      }
    });
    return subscriber;
  }
}

module.exports = new RedisService();
