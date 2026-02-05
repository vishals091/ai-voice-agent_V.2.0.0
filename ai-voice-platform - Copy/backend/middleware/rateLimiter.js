/**
 * Rate Limiter Middleware
 * Redis-backed sliding window rate limiting
 * Supports multiple tiers based on organization plan
 */

const { redis, rateLimiter: redisRateLimiter } = require('../services/redis');

/**
 * Rate limit configurations by plan
 */
const RATE_LIMITS = {
  free: {
    requests_per_minute: 30,
    requests_per_hour: 500,
    concurrent_calls: 1,
    daily_calls: 50
  },
  starter: {
    requests_per_minute: 60,
    requests_per_hour: 2000,
    concurrent_calls: 3,
    daily_calls: 500
  },
  professional: {
    requests_per_minute: 120,
    requests_per_hour: 5000,
    concurrent_calls: 10,
    daily_calls: 2000
  },
  enterprise: {
    requests_per_minute: 300,
    requests_per_hour: 20000,
    concurrent_calls: 50,
    daily_calls: 10000
  }
};

/**
 * Sliding window rate limiter using Redis sorted sets
 * More accurate than fixed window, prevents burst at window boundaries
 */
async function slidingWindowRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;

  const multi = redis.multi();
  
  // Remove old entries outside the window
  multi.zremrangebyscore(key, 0, windowStart);
  
  // Count entries in current window
  multi.zcard(key);
  
  // Add current request
  multi.zadd(key, now, `${now}-${Math.random()}`);
  
  // Set expiry on the key
  multi.expire(key, Math.ceil(windowMs / 1000) + 1);

  const results = await multi.exec();
  const currentCount = results[1][1];

  return {
    allowed: currentCount < limit,
    current: currentCount,
    limit,
    remaining: Math.max(0, limit - currentCount - 1),
    resetMs: windowMs
  };
}

/**
 * Fixed window rate limiter (simpler, less accurate)
 */
async function fixedWindowRateLimit(key, limit, windowSeconds) {
  const current = await redis.incr(key);
  
  if (current === 1) {
    await redis.expire(key, windowSeconds);
  }

  const ttl = await redis.ttl(key);

  return {
    allowed: current <= limit,
    current,
    limit,
    remaining: Math.max(0, limit - current),
    resetMs: ttl * 1000
  };
}

/**
 * Check concurrent calls limit
 */
async function checkConcurrentCalls(orgId, limit) {
  const key = `concurrent:${orgId}`;
  const current = await redis.scard(key);
  
  return {
    allowed: current < limit,
    current,
    limit,
    remaining: Math.max(0, limit - current)
  };
}

/**
 * Track active call (add to concurrent set)
 */
async function trackCallStart(orgId, callSid) {
  const key = `concurrent:${orgId}`;
  await redis.sadd(key, callSid);
  await redis.expire(key, 3600); // 1 hour TTL as safety net
}

/**
 * Remove call from tracking (on call end)
 */
async function trackCallEnd(orgId, callSid) {
  const key = `concurrent:${orgId}`;
  await redis.srem(key, callSid);
}

/**
 * Get rate limits for organization plan
 */
function getLimitsForPlan(plan) {
  return RATE_LIMITS[plan] || RATE_LIMITS.free;
}

/**
 * Main rate limiting middleware
 * Applies request rate limiting based on organization plan
 */
function rateLimitMiddleware(options = {}) {
  const {
    windowMs = 60000, // 1 minute default
    keyPrefix = 'ratelimit',
    skipPaths = ['/api/health', '/api/auth/login'],
    useSlidingWindow = true
  } = options;

  return async (req, res, next) => {
    try {
      // Skip for specified paths
      if (skipPaths.some(path => req.path.startsWith(path))) {
        return next();
      }

      // Get organization context
      const orgId = req.orgId;
      const plan = req.org?.plan || 'free';
      const limits = getLimitsForPlan(plan);

      // Build rate limit key
      const key = `${keyPrefix}:${orgId || req.ip}:${Math.floor(Date.now() / windowMs)}`;
      const slidingKey = `${keyPrefix}:sliding:${orgId || req.ip}`;

      let result;
      if (useSlidingWindow) {
        result = await slidingWindowRateLimit(slidingKey, limits.requests_per_minute, windowMs);
      } else {
        result = await fixedWindowRateLimit(key, limits.requests_per_minute, windowMs / 1000);
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Date.now() + result.resetMs);

      if (!result.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          limit: result.limit,
          remaining: 0,
          retryAfter: Math.ceil(result.resetMs / 1000),
          plan,
          upgradeUrl: '/settings/billing'
        });
      }

      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      // Fail open - allow request if rate limiter has issues
      next();
    }
  };
}

/**
 * API-specific rate limiting (stricter for expensive operations)
 */
function apiRateLimiter(operation) {
  const operationLimits = {
    knowledge_upload: { limit: 10, windowMs: 60000 },
    bulk_import: { limit: 5, windowMs: 300000 },
    export: { limit: 10, windowMs: 300000 },
    llm_completion: { limit: 100, windowMs: 60000 },
    tts_synthesis: { limit: 200, windowMs: 60000 },
    embedding: { limit: 500, windowMs: 60000 }
  };

  const config = operationLimits[operation] || { limit: 60, windowMs: 60000 };

  return async (req, res, next) => {
    try {
      const orgId = req.orgId;
      const key = `api:${operation}:${orgId}`;
      
      const result = await slidingWindowRateLimit(key, config.limit, config.windowMs);

      if (!result.allowed) {
        return res.status(429).json({
          error: `Rate limit exceeded for ${operation}`,
          code: 'API_RATE_LIMIT',
          operation,
          limit: result.limit,
          retryAfter: Math.ceil(config.windowMs / 1000)
        });
      }

      next();
    } catch (error) {
      console.error(`API rate limiter error (${operation}):`, error);
      next();
    }
  };
}

/**
 * Call rate limiting middleware
 * Checks both concurrent and daily call limits
 */
async function callRateLimiter(req, res, next) {
  try {
    const orgId = req.orgId;
    const plan = req.org?.plan || 'free';
    const limits = getLimitsForPlan(plan);

    // Check concurrent calls
    const concurrent = await checkConcurrentCalls(orgId, limits.concurrent_calls);
    if (!concurrent.allowed) {
      return res.status(429).json({
        error: 'Concurrent call limit reached',
        code: 'CONCURRENT_LIMIT',
        limit: concurrent.limit,
        current: concurrent.current,
        message: `Your ${plan} plan allows ${limits.concurrent_calls} concurrent calls`
      });
    }

    // Check daily calls
    const dailyKey = `daily:calls:${orgId}:${new Date().toISOString().split('T')[0]}`;
    const dailyResult = await fixedWindowRateLimit(dailyKey, limits.daily_calls, 86400);
    
    if (!dailyResult.allowed) {
      return res.status(429).json({
        error: 'Daily call limit reached',
        code: 'DAILY_LIMIT',
        limit: dailyResult.limit,
        current: dailyResult.current,
        resetsAt: new Date(Date.now() + dailyResult.resetMs).toISOString()
      });
    }

    // Attach remaining limits to request for tracking
    req.rateLimits = {
      concurrent: concurrent.remaining,
      daily: dailyResult.remaining
    };

    next();
  } catch (error) {
    console.error('Call rate limiter error:', error);
    next();
  }
}

/**
 * WebSocket rate limiter for voice connections
 */
class WebSocketRateLimiter {
  constructor(orgId, plan = 'free') {
    this.orgId = orgId;
    this.limits = getLimitsForPlan(plan);
    this.messageCount = 0;
    this.lastReset = Date.now();
    this.windowMs = 1000; // 1 second window for WS messages
    this.maxMessagesPerSecond = 100; // Prevent message flooding
  }

  async checkLimit() {
    const now = Date.now();
    
    // Reset counter if window has passed
    if (now - this.lastReset >= this.windowMs) {
      this.messageCount = 0;
      this.lastReset = now;
    }

    this.messageCount++;
    return this.messageCount <= this.maxMessagesPerSecond;
  }

  async checkConcurrent() {
    return checkConcurrentCalls(this.orgId, this.limits.concurrent_calls);
  }

  async trackStart(callSid) {
    return trackCallStart(this.orgId, callSid);
  }

  async trackEnd(callSid) {
    return trackCallEnd(this.orgId, callSid);
  }
}

/**
 * IP-based rate limiting (for unauthenticated endpoints)
 */
function ipRateLimiter(limit = 30, windowMs = 60000) {
  return async (req, res, next) => {
    try {
      const ip = req.ip || req.connection.remoteAddress;
      const key = `ip:${ip}`;
      
      const result = await slidingWindowRateLimit(key, limit, windowMs);

      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);

      if (!result.allowed) {
        return res.status(429).json({
          error: 'Too many requests',
          code: 'IP_RATE_LIMIT',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }

      next();
    } catch (error) {
      console.error('IP rate limiter error:', error);
      next();
    }
  };
}

/**
 * Cleanup expired rate limit keys (run periodically)
 */
async function cleanupRateLimitKeys() {
  try {
    const pattern = 'ratelimit:*';
    let cursor = '0';
    let cleaned = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;

      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1) {
          // Key has no expiry, set one
          await redis.expire(key, 3600);
          cleaned++;
        }
      }
    } while (cursor !== '0');

    console.log(`Cleaned up ${cleaned} rate limit keys`);
  } catch (error) {
    console.error('Rate limit cleanup error:', error);
  }
}

module.exports = {
  rateLimitMiddleware,
  apiRateLimiter,
  callRateLimiter,
  ipRateLimiter,
  WebSocketRateLimiter,
  trackCallStart,
  trackCallEnd,
  checkConcurrentCalls,
  getLimitsForPlan,
  cleanupRateLimitKeys,
  RATE_LIMITS
};
