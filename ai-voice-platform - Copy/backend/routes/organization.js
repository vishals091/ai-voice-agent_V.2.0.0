/**
 * Organization Management Routes
 * 
 * Handles org settings, team management, billing, API keys
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { pool } = require('../services/database');
const { tenantResolver, requireRole } = require('../middleware/tenantResolver');

// Apply tenant resolution to all routes
router.use(tenantResolver);

// ============================================
// GET ORGANIZATION DETAILS
// ============================================

/**
 * GET /api/organization
 * 
 * Get current organization details
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        plan,
        status,
        monthly_call_limit,
        current_month_calls,
        created_at,
        stripe_customer_id IS NOT NULL as has_billing
      FROM organizations
      WHERE id = $1
    `, [req.orgId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // Get team count
    const teamCount = await pool.query(`
      SELECT COUNT(*) as count FROM users WHERE org_id = $1 AND status = 'active'
    `, [req.orgId]);
    
    // Get usage stats for current month
    const usageStats = await pool.query(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(duration_seconds) as total_duration,
        SUM(llm_cost_usd + stt_cost_usd + tts_cost_usd) as total_cost
      FROM calls
      WHERE org_id = $1 
        AND created_at >= date_trunc('month', CURRENT_DATE)
    `, [req.orgId]);
    
    res.json({
      organization: result.rows[0],
      teamSize: parseInt(teamCount.rows[0].count),
      currentMonthUsage: {
        calls: parseInt(usageStats.rows[0].total_calls) || 0,
        durationMinutes: Math.round((usageStats.rows[0].total_duration || 0) / 60),
        costUsd: parseFloat(usageStats.rows[0].total_cost) || 0
      }
    });
    
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ error: 'Failed to get organization' });
  }
});

// ============================================
// UPDATE ORGANIZATION
// ============================================

/**
 * PUT /api/organization
 * 
 * Update organization details (owner/admin only)
 */
router.put('/', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Organization name must be at least 2 characters' });
    }
    
    await pool.query(`
      UPDATE organizations
      SET name = $1, updated_at = NOW()
      WHERE id = $2
    `, [name.trim(), req.orgId]);
    
    res.json({ success: true, message: 'Organization updated' });
    
  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// ============================================
// TEAM MANAGEMENT
// ============================================

/**
 * GET /api/organization/team
 * 
 * Get all team members
 */
router.get('/team', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        email,
        name,
        role,
        status,
        last_login_at,
        created_at
      FROM users
      WHERE org_id = $1
      ORDER BY 
        CASE role 
          WHEN 'owner' THEN 1 
          WHEN 'admin' THEN 2 
          WHEN 'member' THEN 3 
          ELSE 4 
        END,
        created_at ASC
    `, [req.orgId]);
    
    res.json({ team: result.rows });
    
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Failed to get team members' });
  }
});

/**
 * POST /api/organization/team/invite
 * 
 * Invite new team member (owner/admin only)
 */
router.post('/team/invite', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { email, role = 'member', name } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    
    // Check if already exists in org
    const existing = await pool.query(`
      SELECT id FROM users WHERE email = $1 AND org_id = $2
    `, [email.toLowerCase(), req.orgId]);
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User already in organization' });
    }
    
    // Check if email exists in another org
    const existingOther = await pool.query(`
      SELECT id FROM users WHERE email = $1
    `, [email.toLowerCase()]);
    
    if (existingOther.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered with another organization' });
    }
    
    // Validate role (non-owners can't invite owners/admins)
    const allowedRoles = req.user.role === 'owner' 
      ? ['admin', 'member', 'viewer'] 
      : ['member', 'viewer'];
    
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: `Cannot invite with role: ${role}` });
    }
    
    // Generate invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    // Create pending user
    const result = await pool.query(`
      INSERT INTO users (org_id, email, name, role, status, invite_token, invite_expires_at)
      VALUES ($1, $2, $3, $4, 'pending', $5, $6)
      RETURNING id, email, role
    `, [req.orgId, email.toLowerCase(), name || null, role, inviteToken, inviteExpiry]);
    
    // TODO: Send invite email
    // await sendInviteEmail(email, inviteToken, req.org.name);
    
    res.json({
      success: true,
      message: 'Invitation sent',
      user: result.rows[0],
      // Include token in dev mode for testing
      ...(process.env.NODE_ENV === 'development' && { inviteToken })
    });
    
  } catch (error) {
    console.error('Invite team member error:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

/**
 * POST /api/organization/team/accept-invite
 * 
 * Accept team invitation (public endpoint)
 */
router.post('/team/accept-invite', async (req, res) => {
  try {
    const { token, password, name } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password required' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    // Find pending user with valid token
    const result = await pool.query(`
      SELECT id, email, org_id, role
      FROM users
      WHERE invite_token = $1 
        AND invite_expires_at > NOW()
        AND status = 'pending'
    `, [token]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired invitation' });
    }
    
    const user = result.rows[0];
    
    // Hash password and activate user
    const passwordHash = await bcrypt.hash(password, 12);
    
    await pool.query(`
      UPDATE users
      SET 
        password_hash = $1,
        name = COALESCE($2, name),
        status = 'active',
        invite_token = NULL,
        invite_expires_at = NULL,
        updated_at = NOW()
      WHERE id = $3
    `, [passwordHash, name, user.id]);
    
    res.json({
      success: true,
      message: 'Account activated',
      email: user.email
    });
    
  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

/**
 * PUT /api/organization/team/:userId/role
 * 
 * Update team member role (owner only for admin changes)
 */
router.put('/team/:userId/role', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    const validRoles = ['admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    // Get target user
    const targetUser = await pool.query(`
      SELECT id, role, org_id FROM users WHERE id = $1 AND org_id = $2
    `, [userId, req.orgId]);
    
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Can't change owner role
    if (targetUser.rows[0].role === 'owner') {
      return res.status(403).json({ error: 'Cannot change owner role' });
    }
    
    // Only owners can set admin role
    if (role === 'admin' && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can assign admin role' });
    }
    
    await pool.query(`
      UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2
    `, [role, userId]);
    
    res.json({ success: true, message: 'Role updated' });
    
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

/**
 * DELETE /api/organization/team/:userId
 * 
 * Remove team member (owner/admin only)
 */
router.delete('/team/:userId', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Can't remove yourself
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself' });
    }
    
    // Get target user
    const targetUser = await pool.query(`
      SELECT id, role, org_id FROM users WHERE id = $1 AND org_id = $2
    `, [userId, req.orgId]);
    
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Can't remove owner
    if (targetUser.rows[0].role === 'owner') {
      return res.status(403).json({ error: 'Cannot remove owner' });
    }
    
    // Admins can't remove other admins
    if (targetUser.rows[0].role === 'admin' && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can remove admins' });
    }
    
    // Soft delete
    await pool.query(`
      UPDATE users SET status = 'removed', updated_at = NOW() WHERE id = $1
    `, [userId]);
    
    res.json({ success: true, message: 'Team member removed' });
    
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// ============================================
// API KEY MANAGEMENT
// ============================================

/**
 * GET /api/organization/api-keys
 * 
 * Get API keys (owner/admin only)
 */
router.get('/api-keys', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        key_prefix,
        last_used_at,
        created_at,
        created_by_user_id
      FROM api_keys
      WHERE org_id = $1 AND status = 'active'
      ORDER BY created_at DESC
    `, [req.orgId]);
    
    res.json({ apiKeys: result.rows });
    
  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({ error: 'Failed to get API keys' });
  }
});

/**
 * POST /api/organization/api-keys
 * 
 * Create new API key (owner/admin only)
 */
router.post('/api-keys', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Key name required' });
    }
    
    // Generate API key
    const apiKey = `vsk_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = apiKey.substring(0, 12);
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    const result = await pool.query(`
      INSERT INTO api_keys (org_id, name, key_hash, key_prefix, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, key_prefix, created_at
    `, [req.orgId, name.trim(), keyHash, keyPrefix, req.user.id]);
    
    // Also update the main org API key if this is the first one
    await pool.query(`
      UPDATE organizations 
      SET api_key = COALESCE(api_key, $1), updated_at = NOW()
      WHERE id = $2
    `, [apiKey, req.orgId]);
    
    res.json({
      success: true,
      apiKey: {
        ...result.rows[0],
        key: apiKey // Only shown once!
      },
      message: 'Save this key now - it won\'t be shown again'
    });
    
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

/**
 * DELETE /api/organization/api-keys/:keyId
 * 
 * Revoke API key (owner/admin only)
 */
router.delete('/api-keys/:keyId', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { keyId } = req.params;
    
    const result = await pool.query(`
      UPDATE api_keys 
      SET status = 'revoked', updated_at = NOW()
      WHERE id = $1 AND org_id = $2
      RETURNING id
    `, [keyId, req.orgId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    res.json({ success: true, message: 'API key revoked' });
    
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// ============================================
// BILLING & SUBSCRIPTION
// ============================================

/**
 * GET /api/organization/billing
 * 
 * Get billing information (owner only)
 */
router.get('/billing', requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        plan,
        monthly_call_limit,
        stripe_customer_id,
        stripe_subscription_id,
        current_period_end,
        cancel_at_period_end
      FROM organizations
      WHERE id = $1
    `, [req.orgId]);
    
    const org = result.rows[0];
    
    // Get invoices if Stripe connected
    let invoices = [];
    if (org.stripe_customer_id) {
      // TODO: Fetch from Stripe API
      // invoices = await stripe.invoices.list({ customer: org.stripe_customer_id, limit: 10 });
    }
    
    // Get current month usage
    const usage = await pool.query(`
      SELECT 
        COUNT(*) as calls,
        SUM(llm_cost_usd + stt_cost_usd + tts_cost_usd) as cost
      FROM calls
      WHERE org_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE)
    `, [req.orgId]);
    
    res.json({
      plan: org.plan,
      monthlyCallLimit: org.monthly_call_limit,
      hasPaymentMethod: !!org.stripe_customer_id,
      subscription: org.stripe_subscription_id ? {
        currentPeriodEnd: org.current_period_end,
        cancelAtPeriodEnd: org.cancel_at_period_end
      } : null,
      currentMonthUsage: {
        calls: parseInt(usage.rows[0].calls) || 0,
        cost: parseFloat(usage.rows[0].cost) || 0
      },
      invoices
    });
    
  } catch (error) {
    console.error('Get billing error:', error);
    res.status(500).json({ error: 'Failed to get billing info' });
  }
});

/**
 * POST /api/organization/billing/upgrade
 * 
 * Upgrade plan (owner only)
 */
router.post('/billing/upgrade', requireRole('owner'), async (req, res) => {
  try {
    const { plan } = req.body;
    
    const validPlans = ['starter', 'growth', 'enterprise'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }
    
    const planLimits = {
      starter: 1000,
      growth: 10000,
      enterprise: 100000
    };
    
    // For demo, just update the plan directly
    // In production, integrate with Stripe
    await pool.query(`
      UPDATE organizations
      SET 
        plan = $1,
        monthly_call_limit = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [plan, planLimits[plan], req.orgId]);
    
    res.json({
      success: true,
      message: `Upgraded to ${plan} plan`,
      newLimit: planLimits[plan]
    });
    
  } catch (error) {
    console.error('Upgrade plan error:', error);
    res.status(500).json({ error: 'Failed to upgrade plan' });
  }
});

// ============================================
// USAGE LIMITS CHECK
// ============================================

/**
 * GET /api/organization/usage-check
 * 
 * Quick check if org can make more calls
 */
router.get('/usage-check', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        monthly_call_limit,
        current_month_calls,
        (monthly_call_limit - current_month_calls) as remaining
      FROM organizations
      WHERE id = $1
    `, [req.orgId]);
    
    const org = result.rows[0];
    const canMakeCalls = org.remaining > 0;
    
    res.json({
      canMakeCalls,
      remaining: Math.max(0, org.remaining),
      limit: org.monthly_call_limit,
      used: org.current_month_calls
    });
    
  } catch (error) {
    console.error('Usage check error:', error);
    res.status(500).json({ error: 'Failed to check usage' });
  }
});

module.exports = router;
