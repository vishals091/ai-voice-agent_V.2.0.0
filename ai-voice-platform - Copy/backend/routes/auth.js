/**
 * Authentication Routes
 * Handles user registration, login, password reset, and session management
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../services/database');
const { tenantResolver, ipRateLimiter } = require('../middleware');

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = '7d';
const RESET_TOKEN_EXPIRY = 3600000; // 1 hour in ms

/**
 * POST /api/auth/register
 * Register a new organization and admin user
 */
router.post('/register', ipRateLimiter(10, 3600000), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { 
      email, 
      password, 
      name, 
      organization_name,
      phone 
    } = req.body;

    // Validation
    if (!email || !password || !name || !organization_name) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['email', 'password', 'name', 'organization_name']
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters'
      });
    }

    // Check if email already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'Email already registered',
        code: 'EMAIL_EXISTS'
      });
    }

    await client.query('BEGIN');

    // Create organization
    const orgSlug = organization_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + 
      '-' + crypto.randomBytes(4).toString('hex');

    const orgResult = await client.query(
      `INSERT INTO organizations (name, slug, plan, status, monthly_call_limit)
       VALUES ($1, $2, 'free', 'active', 50)
       RETURNING id, name, slug, plan`,
      [organization_name, orgSlug]
    );

    const org = orgResult.rows[0];

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create admin user
    const userResult = await client.query(
      `INSERT INTO users (org_id, email, password_hash, name, phone, role)
       VALUES ($1, $2, $3, $4, $5, 'owner')
       RETURNING id, email, name, role`,
      [org.id, email.toLowerCase(), passwordHash, name, phone]
    );

    const user = userResult.rows[0];

    // Create default settings for organization
    await client.query(
      `INSERT INTO settings (org_id, agent_name, system_prompt)
       VALUES ($1, 'AI Assistant', $2)`,
      [org.id, getDefaultSystemPrompt()]
    );

    await client.query('COMMIT');

    // Generate JWT
    const token = jwt.sign(
      {
        user_id: user.id,
        org_id: org.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and return JWT
 */
router.post('/login', ipRateLimiter(20, 60000), async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password required'
      });
    }

    // Find user with organization
    const result = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.name, u.role, u.org_id,
              o.name as org_name, o.slug as org_slug, o.plan, o.status
       FROM users u
       JOIN organizations o ON u.org_id = o.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const user = result.rows[0];

    // Check organization status
    if (user.status !== 'active') {
      return res.status(403).json({
        error: 'Organization is inactive',
        code: 'ORG_INACTIVE'
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Generate JWT
    const token = jwt.sign(
      {
        user_id: user.id,
        org_id: user.org_id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      organization: {
        id: user.org_id,
        name: user.org_name,
        slug: user.org_slug,
        plan: user.plan
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Initiate password reset flow
 */
router.post('/forgot-password', ipRateLimiter(5, 3600000), async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Always return success to prevent email enumeration
    const successResponse = {
      message: 'If an account exists with this email, a reset link has been sent'
    };

    // Find user
    const result = await pool.query(
      'SELECT id, email, name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.json(successResponse);
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Store hashed token
    await pool.query(
      `UPDATE users 
       SET reset_token = $1, 
           reset_token_expires = $2
       WHERE id = $3`,
      [resetTokenHash, new Date(Date.now() + RESET_TOKEN_EXPIRY), user.id]
    );

    // Build reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    // Send email (placeholder - integrate with email service)
    console.log('Password reset requested:', {
      email: user.email,
      name: user.name,
      resetUrl
    });

    // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
    // await sendEmail({
    //   to: user.email,
    //   subject: 'Password Reset Request',
    //   template: 'password-reset',
    //   data: { name: user.name, resetUrl }
    // });

    res.json(successResponse);

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Request failed' });
  }
});

/**
 * POST /api/auth/reset-password
 * Complete password reset with token
 */
router.post('/reset-password', ipRateLimiter(10, 3600000), async (req, res) => {
  try {
    const { email, token, password } = req.body;

    if (!email || !token || !password) {
      return res.status(400).json({
        error: 'Email, token, and new password required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters'
      });
    }

    // Hash the provided token
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const result = await pool.query(
      `SELECT id, email 
       FROM users 
       WHERE email = $1 
         AND reset_token = $2 
         AND reset_token_expires > CURRENT_TIMESTAMP`,
      [email.toLowerCase(), tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid or expired reset token',
        code: 'INVALID_TOKEN'
      });
    }

    const user = result.rows[0];

    // Hash new password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Update password and clear reset token
    await pool.query(
      `UPDATE users 
       SET password_hash = $1, 
           reset_token = NULL, 
           reset_token_expires = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    res.json({ message: 'Password reset successful' });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
router.post('/refresh', tenantResolver, async (req, res) => {
  try {
    // tenantResolver already validates the token
    const token = jwt.sign(
      {
        user_id: req.userId,
        org_id: req.orgId,
        email: req.userEmail,
        role: req.userRole
      },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({ token });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', tenantResolver, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.last_login,
              o.id as org_id, o.name as org_name, o.slug as org_slug, 
              o.plan, o.monthly_call_limit, o.current_month_calls
       FROM users u
       JOIN organizations o ON u.org_id = o.id
       WHERE u.id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        lastLogin: user.last_login
      },
      organization: {
        id: user.org_id,
        name: user.org_name,
        slug: user.org_slug,
        plan: user.plan,
        monthlyCallLimit: user.monthly_call_limit,
        currentMonthCalls: user.current_month_calls
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * PUT /api/auth/password
 * Change password (authenticated)
 */
router.put('/password', tenantResolver, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Current and new password required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'New password must be at least 8 characters'
      });
    }

    // Get current password hash
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(
      currentPassword, 
      result.rows[0].password_hash
    );

    if (!validPassword) {
      return res.status(401).json({
        error: 'Current password is incorrect',
        code: 'INVALID_PASSWORD'
      });
    }

    // Hash and save new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query(
      `UPDATE users 
       SET password_hash = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [newPasswordHash, req.userId]
    );

    res.json({ message: 'Password updated successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Password change failed' });
  }
});

/**
 * POST /api/auth/logout
 * Logout (client-side token removal, optional server-side blacklist)
 */
router.post('/logout', tenantResolver, async (req, res) => {
  // For stateless JWT, logout is handled client-side
  // Optionally implement token blacklist in Redis
  res.json({ message: 'Logged out successfully' });
});

/**
 * Default system prompt for new organizations
 */
function getDefaultSystemPrompt() {
  return `Aap {{company_name}} ke AI assistant hain. Aapka naam {{agent_name}} hai.

Aap customers ki madad karne ke liye yahan hain. Hinglish mein naturally baat karein (Hindi + English mix).

Guidelines:
- Friendly aur professional tone rakhein
- Short, clear responses dein
- Agar koi question ka jawab nahi pata, honestly bol dein
- Complex issues ke liye human agent ko transfer kar dein

Company Details:
- Owner: {{owner_name}}
- Contact: {{support_email}}`;
}

module.exports = router;
