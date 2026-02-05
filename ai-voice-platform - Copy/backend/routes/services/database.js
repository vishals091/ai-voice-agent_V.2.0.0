/**
 * Database Service
 * Neon PostgreSQL with pgvector for vector similarity search
 */

const { Pool } = require('pg');

let pool = null;

/**
 * Get database connection pool
 */
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
    
    pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
    });
  }
  return pool;
}

/**
 * Initialize database tables and extensions
 */
async function initDatabase() {
  const pool = getPool();
  
  try {
    // Enable pgvector extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    
    // Knowledge base table with vector embeddings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(100) DEFAULT 'general',
        metadata JSONB DEFAULT '{}',
        embedding vector(1536), -- OpenAI text-embedding-3-small dimension
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Create index for vector similarity search
    await pool.query(`
      CREATE INDEX IF NOT EXISTS knowledge_embedding_idx 
      ON knowledge_base 
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);
    
    // Conversations table for logging
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(100) NOT NULL,
        user_message TEXT,
        ai_response TEXT,
        knowledge_used BOOLEAN DEFAULT false,
        response_time_ms INTEGER,
        token_count INTEGER,
        model VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Create index for session lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS conversations_session_idx 
      ON conversations (session_id)
    `);
    
    // Session metrics table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS session_metrics (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(100) UNIQUE NOT NULL,
        total_duration_ms INTEGER,
        total_tokens INTEGER,
        total_audio_duration_ms INTEGER,
        response_count INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Users table for authentication (optional)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      )
    `);
    
    // API keys table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        key_hash VARCHAR(255) NOT NULL,
        name VARCHAR(100),
        permissions JSONB DEFAULT '{}',
        last_used TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      )
    `);
    
    // Insert default settings if not exists
    await insertDefaultSettings();
    
    console.log('✅ Database tables initialized');
    return true;
    
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

/**
 * Insert default settings
 */
async function insertDefaultSettings() {
  const pool = getPool();
  
  const defaultSettings = [
    {
      key: 'llm',
      value: {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 500
      }
    },
    {
      key: 'stt',
      value: {
        model: 'nova-2',
        language: 'en-IN'
      }
    },
    {
      key: 'tts',
      value: {
        model: 'tts-1',
        voice: 'alloy',
        speed: 1.0
      }
    },
    {
      key: 'system_prompt',
      value: {
        prompt: `You are a helpful, friendly, and professional AI customer support agent. 

Key behaviors:
- Be concise and natural in your responses (this is a voice conversation)
- Keep responses brief (1-3 sentences typically) unless more detail is specifically needed
- Be warm and empathetic
- If you don't know something, say so honestly
- For complex issues, offer to explain step by step

Remember: This is a voice conversation, so keep your responses conversational and easy to understand when spoken aloud.`
      }
    }
  ];
  
  for (const setting of defaultSettings) {
    await pool.query(`
      INSERT INTO settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO NOTHING
    `, [setting.key, JSON.stringify(setting.value)]);
  }
}

/**
 * Execute a query
 */
async function query(sql, params = []) {
  const pool = getPool();
  try {
    const result = await pool.query(sql, params);
    return result;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
}

/**
 * Close database connection
 */
async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Health check
 */
async function healthCheck() {
  const pool = getPool();
  try {
    const result = await pool.query('SELECT NOW()');
    return {
      status: 'healthy',
      timestamp: result.rows[0].now
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

module.exports = {
  getPool,
  initDatabase,
  query,
  closeDatabase,
  healthCheck
};
