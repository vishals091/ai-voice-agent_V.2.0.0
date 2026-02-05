/**
 * Multi-Tenant Database Service
 * All operations scoped by org_id with Row-Level Security concepts
 */

const { Pool } = require('pg');

// Connection pool optimized for Neon serverless
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  maxUses: 7500 // Close connections after N queries (helps with serverless)
});

// Track pool events
pool.on('connect', () => console.log('📦 New database connection established'));
pool.on('error', (err) => console.error('❌ Database pool error:', err));

/**
 * Execute query with automatic org_id scoping
 * This ensures tenant isolation at the application level
 */
async function scopedQuery(orgId, query, params = []) {
  if (!orgId) {
    throw new Error('org_id is required for scoped queries');
  }
  
  const client = await pool.connect();
  try {
    // Set the org_id context for this session (RLS concept)
    await client.query('SET app.current_org_id = $1', [orgId]);
    
    const result = await client.query(query, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Execute raw query without org scoping (for auth, system operations)
 */
async function rawQuery(query, params = []) {
  return pool.query(query, params);
}

/**
 * Initialize database with multi-tenant schema
 */
async function initDatabase() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Enable required extensions
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "vector";
      CREATE EXTENSION IF NOT EXISTS "pg_trgm";
    `);
    
    // ============================================
    // ORGANIZATIONS TABLE (Tenant Management)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        plan VARCHAR(50) DEFAULT 'starter',
        status VARCHAR(50) DEFAULT 'active',
        
        -- Contact info
        email VARCHAR(255),
        phone VARCHAR(50),
        
        -- Billing
        stripe_customer_id VARCHAR(255),
        subscription_id VARCHAR(255),
        
        -- Limits
        monthly_call_limit INTEGER DEFAULT 1000,
        monthly_calls_used INTEGER DEFAULT 0,
        
        -- Metadata
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT valid_plan CHECK (plan IN ('starter', 'growth', 'enterprise', 'custom')),
        CONSTRAINT valid_status CHECK (status IN ('active', 'suspended', 'cancelled'))
      )
    `);
    
    // ============================================
    // USERS TABLE (Multi-tenant)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'member',
        
        -- Auth
        email_verified BOOLEAN DEFAULT false,
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMP,
        
        -- Metadata
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(org_id, email),
        CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
      )
    `);
    
    // ============================================
    // SETTINGS TABLE (Multi-tenant, per-org config)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        
        -- AI Configuration
        llm_provider VARCHAR(50) DEFAULT 'openai',
        llm_model VARCHAR(100) DEFAULT 'gpt-4o-mini',
        tts_provider VARCHAR(50) DEFAULT 'openai',
        tts_voice VARCHAR(100) DEFAULT 'alloy',
        stt_provider VARCHAR(50) DEFAULT 'deepgram',
        
        -- Voice Agent Identity
        agent_name VARCHAR(100) DEFAULT 'AI Assistant',
        owner_name VARCHAR(100),
        owner_title VARCHAR(100) DEFAULT 'Manager',
        company_name VARCHAR(255),
        
        -- System Prompt (Hinglish optimized default)
        system_prompt TEXT DEFAULT 'Aap ek helpful AI customer support agent hain. Aap Hindi aur English dono mein naturally baat kar sakte hain (Hinglish). Customer ki madad karna aapka main goal hai. Professional rehein, lekin friendly bhi. Agar koi question samajh na aaye, politely clarify karein.',
        
        -- Escalation Settings
        transfer_number VARCHAR(50),
        escalation_keywords TEXT[] DEFAULT ARRAY['manager', 'human', 'speak to someone', 'real person', 'supervisor'],
        
        -- Business Hours (JSON: {mon: {start: "09:00", end: "18:00"}, ...})
        business_hours JSONB DEFAULT '{"mon":{"start":"09:00","end":"18:00"},"tue":{"start":"09:00","end":"18:00"},"wed":{"start":"09:00","end":"18:00"},"thu":{"start":"09:00","end":"18:00"},"fri":{"start":"09:00","end":"18:00"},"sat":{"start":"10:00","end":"14:00"},"sun":null}',
        timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
        after_hours_message TEXT DEFAULT 'Namaste! Hamari team abhi available nahi hai. Humara working hours hain Monday se Friday, 9 AM se 6 PM tak. Kya aap voicemail chhod sakte hain ya hamare knowledge base mein kuch search kar sakte hain?',
        
        -- Holding Persona (for transfer queue)
        holding_persona TEXT DEFAULT 'Main samajh sakta hoon aap kisi se baat karna chahte hain. Abhi humari team member ek doosri call par hain. Kya aap thoda wait kar sakte hain? Main aapko entertain karta hoon tab tak. Aapka din kaisa ja raha hai?',
        
        -- Custom Variables (for template injection)
        custom_variables JSONB DEFAULT '{}',
        
        -- Limits
        max_conversation_turns INTEGER DEFAULT 50,
        response_timeout_ms INTEGER DEFAULT 30000,
        
        -- Metadata
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(org_id)
      )
    `);
    
    // ============================================
    // KNOWLEDGE BASE TABLE (Multi-tenant with vectors)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        
        title VARCHAR(500) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(100),
        tags TEXT[],
        
        -- Vector embedding for semantic search
        embedding vector(1536),
        
        -- Metadata
        source VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create vector index for fast similarity search
    await client.query(`
      CREATE INDEX IF NOT EXISTS knowledge_embedding_idx 
      ON knowledge_base 
      USING ivfflat (embedding vector_cosine_ops) 
      WITH (lists = 100)
    `);
    
    // Create trigram index for fuzzy text search
    await client.query(`
      CREATE INDEX IF NOT EXISTS knowledge_content_trgm_idx 
      ON knowledge_base 
      USING gin (content gin_trgm_ops)
    `);
    
    // ============================================
    // CALLS TABLE (Call Sessions)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS calls (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        
        -- Exotel Integration
        exotel_call_sid VARCHAR(255) UNIQUE,
        exotel_recording_url TEXT,
        
        -- Call Info
        caller_number VARCHAR(50),
        direction VARCHAR(20) DEFAULT 'inbound',
        status VARCHAR(50) DEFAULT 'initiated',
        
        -- Timing
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        answered_at TIMESTAMP,
        ended_at TIMESTAMP,
        duration_seconds INTEGER,
        
        -- AI Metrics
        total_tokens INTEGER DEFAULT 0,
        llm_cost_usd DECIMAL(10, 6) DEFAULT 0,
        stt_cost_usd DECIMAL(10, 6) DEFAULT 0,
        tts_cost_usd DECIMAL(10, 6) DEFAULT 0,
        
        -- Conversation
        transcript JSONB DEFAULT '[]',
        summary TEXT,
        sentiment VARCHAR(50),
        
        -- Escalation
        was_escalated BOOLEAN DEFAULT false,
        escalated_to VARCHAR(255),
        escalation_reason TEXT,
        
        -- Metadata
        metadata JSONB DEFAULT '{}',
        
        CONSTRAINT valid_direction CHECK (direction IN ('inbound', 'outbound')),
        CONSTRAINT valid_status CHECK (status IN ('initiated', 'ringing', 'in_progress', 'completed', 'failed', 'busy', 'no_answer', 'transferred'))
      )
    `);
    
    // ============================================
    // ANALYTICS TABLE (Daily Aggregates)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_daily (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        
        -- Call metrics
        total_calls INTEGER DEFAULT 0,
        completed_calls INTEGER DEFAULT 0,
        escalated_calls INTEGER DEFAULT 0,
        avg_duration_seconds DECIMAL(10, 2),
        
        -- Cost metrics
        total_cost_usd DECIMAL(10, 4) DEFAULT 0,
        llm_cost_usd DECIMAL(10, 4) DEFAULT 0,
        voice_cost_usd DECIMAL(10, 4) DEFAULT 0,
        
        -- Token metrics
        total_tokens INTEGER DEFAULT 0,
        
        -- Estimated savings (vs human agent)
        estimated_human_cost_usd DECIMAL(10, 4) DEFAULT 0,
        
        UNIQUE(org_id, date)
      )
    `);
    
    // ============================================
    // SEMANTIC CACHE TABLE (for 0ms responses)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS semantic_cache (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        
        -- Input (normalized)
        input_hash VARCHAR(64) NOT NULL,
        input_text TEXT NOT NULL,
        input_embedding vector(1536),
        
        -- Cached response
        response_text TEXT NOT NULL,
        response_audio_url TEXT,
        
        -- Stats
        hit_count INTEGER DEFAULT 0,
        last_hit_at TIMESTAMP,
        
        -- Metadata
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        
        UNIQUE(org_id, input_hash)
      )
    `);
    
    // ============================================
    // ERROR LOGS TABLE
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
        
        error_type VARCHAR(100),
        error_message TEXT,
        error_stack TEXT,
        context JSONB,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // ============================================
    // Create indexes for performance
    // ============================================
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_knowledge_org_id ON knowledge_base(org_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_base(org_id, category);
      CREATE INDEX IF NOT EXISTS idx_calls_org_id ON calls(org_id);
      CREATE INDEX IF NOT EXISTS idx_calls_exotel_sid ON calls(exotel_call_sid);
      CREATE INDEX IF NOT EXISTS idx_calls_started_at ON calls(org_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_analytics_org_date ON analytics_daily(org_id, date DESC);
      CREATE INDEX IF NOT EXISTS idx_semantic_cache_hash ON semantic_cache(org_id, input_hash);
    `);
    
    await client.query('COMMIT');
    console.log('✅ Multi-tenant database schema created successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Helper: Get organization by ID
 */
async function getOrganization(orgId) {
  const result = await rawQuery(
    'SELECT * FROM organizations WHERE id = $1',
    [orgId]
  );
  return result.rows[0];
}

/**
 * Helper: Get settings for organization
 */
async function getSettings(orgId) {
  const result = await rawQuery(
    'SELECT * FROM settings WHERE org_id = $1',
    [orgId]
  );
  return result.rows[0];
}

/**
 * Helper: Update settings for organization
 */
async function updateSettings(orgId, updates) {
  const allowedFields = [
    'llm_provider', 'llm_model', 'tts_provider', 'tts_voice', 'stt_provider',
    'agent_name', 'owner_name', 'owner_title', 'company_name', 'system_prompt',
    'transfer_number', 'escalation_keywords', 'business_hours', 'timezone',
    'after_hours_message', 'holding_persona', 'custom_variables',
    'max_conversation_turns', 'response_timeout_ms'
  ];
  
  const fields = [];
  const values = [];
  let paramCount = 1;
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    }
  }
  
  if (fields.length === 0) return null;
  
  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(orgId);
  
  const result = await rawQuery(
    `UPDATE settings SET ${fields.join(', ')} WHERE org_id = $${paramCount} RETURNING *`,
    values
  );
  
  return result.rows[0];
}

/**
 * Transaction helper
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  rawQuery,
  scopedQuery,
  initDatabase,
  getOrganization,
  getSettings,
  updateSettings,
  withTransaction
};
