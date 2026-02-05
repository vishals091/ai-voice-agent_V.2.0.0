/**
 * Tenant Resolver Middleware
 * Resolves organization context from JWT token or API key
 * Enforces multi-tenant isolation for all database operations
 */

const jwt = require('jsonwebtoken');
const { pool } = require('../services/database');

// Cache organization data to reduce DB lookups
const orgCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Clear cached organization data
 */
function clearOrgCache(orgId) {
  if (orgId) {
    orgCache.delete(orgId);
  } else {
    orgCache.clear();
  }
}

/**
 * Get organization from cache or database
 */
async function getOrganization(orgId) {
  const cached = orgCache.get(orgId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const result = await pool.query(
    `SELECT id, name, slug, plan, status, monthly_call_limit, 
            current_month_calls, stripe_customer_id, created_at
     FROM organizations 
     WHERE id = $1 AND status = 'active'`,
    [orgId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const org = result.rows[0];
  orgCache.set(orgId, { data: org, timestamp: Date.now() });
  return org;
}

/**
 * Main tenant resolver middleware
 * Extracts org_id from JWT token and attaches to request
 */
async function tenantResolver(req, res, next) {
  try {
    // Skip for public routes
    const publicPaths = [
      '/auth/login',
      '/api/auth/register',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
      '/api/health',
      '/api/exotel/webhook'
    ];

    if (publicPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Check for API key in header (for programmatic access)
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      const org = await resolveByApiKey(apiKey);
      if (org) {
        req.org = org;
        req.orgId = org.id;
        req.authMethod = 'api_key';
        return next();
      }
    }

    // Check for JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const token = authHeader.substring(7);
    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    // Get organization data
    const org = await getOrganization(decoded.org_id);
    if (!org) {
      return res.status(403).json({
        error: 'Organization not found or inactive',
        code: 'ORG_INACTIVE'
      });
    }

    // Check if organization has exceeded call limit
    if (org.current_month_calls >= org.monthly_call_limit) {
      req.orgLimitExceeded = true;
    }

    // Attach tenant context to request
    req.org = org;
    req.orgId = org.id;
    req.userId = decoded.user_id;
    req.userRole = decoded.role;
    req.authMethod = 'jwt';

    next();
  } catch (error) {
    console.error('Tenant resolver error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Resolve organization by API key
 */
async function resolveByApiKey(apiKey) {
  try {
    // API keys are stored hashed, but for simplicity we'll use plain comparison
    // In production, use bcrypt to hash API keys
    const result = await pool.query(
      `SELECT o.* FROM organizations o
       JOIN api_keys ak ON ak.org_id = o.id
       WHERE ak.key_hash = $1 AND ak.status = 'active' AND o.status = 'active'`,
      [apiKey] // In production: hash the key first
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('API key resolution error:', error);
    return null;
  }
}

/**
 * Role-based access control middleware
 * Use after tenantResolver
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required: allowedRoles,
        current: req.userRole
      });
    }

    next();
  };
}

/**
 * Check if organization can make calls (within limit)
 */
function checkCallLimit(req, res, next) {
  if (req.orgLimitExceeded) {
    return res.status(429).json({
      error: 'Monthly call limit exceeded',
      code: 'CALL_LIMIT_EXCEEDED',
      limit: req.org.monthly_call_limit,
      current: req.org.current_month_calls
    });
  }
  next();
}

/**
 * Increment call counter for organization
 */
async function incrementCallCount(orgId) {
  try {
    await pool.query(
      `UPDATE organizations 
       SET current_month_calls = current_month_calls + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [orgId]
    );
    clearOrgCache(orgId);
  } catch (error) {
    console.error('Failed to increment call count:', error);
  }
}

/**
 * Reset monthly call counts (run via cron job on 1st of each month)
 */
async function resetMonthlyCallCounts() {
  try {
    await pool.query(
      `UPDATE organizations 
       SET current_month_calls = 0,
           updated_at = CURRENT_TIMESTAMP`
    );
    clearOrgCache();
    console.log('Monthly call counts reset');
  } catch (error) {
    console.error('Failed to reset monthly call counts:', error);
  }
}

module.exports = {
  tenantResolver,
  resolveTenent: tenantResolver,
  requireRole,
  checkCallLimit,
  incrementCallCount,
  resetMonthlyCallCounts,
  clearOrgCache,
  getOrganization
};
