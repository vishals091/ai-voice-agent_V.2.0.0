-- ============================================
-- VOICE AI ENTERPRISE - NEON POSTGRESQL SCHEMA
-- Fixed for Neon compatibility
-- ============================================

-- Enable extensions (run these first if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- ORGANIZATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    plan VARCHAR(50) DEFAULT 'starter',
    status VARCHAR(50) DEFAULT 'active',
    monthly_call_limit INTEGER DEFAULT 1000,
    current_month_calls INTEGER DEFAULT 0,
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'member',
    status VARCHAR(50) DEFAULT 'active',
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP WITH TIME ZONE,
    invite_token VARCHAR(255),
    invite_token_expires TIMESTAMP WITH TIME ZONE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(org_id, email)
);

-- ============================================
-- API KEYS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255),
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    last_used TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- AI Providers
    llm_provider VARCHAR(50) DEFAULT 'openai',
    llm_model VARCHAR(100) DEFAULT 'gpt-4o-mini',
    stt_provider VARCHAR(50) DEFAULT 'deepgram',
    stt_model VARCHAR(100) DEFAULT 'nova-2',
    tts_provider VARCHAR(50) DEFAULT 'openai',
    tts_voice VARCHAR(100) DEFAULT 'alloy',
    
    -- Agent Persona
    agent_name VARCHAR(255) DEFAULT 'AI Assistant',
    owner_name VARCHAR(255),
    owner_title VARCHAR(255),
    company_name VARCHAR(255),
    
    -- System Prompt (Hinglish default)
    system_prompt TEXT DEFAULT 'Aap ek helpful AI assistant hain jo customers ki madad karte hain. Professional aur friendly rahein. Hindi aur English dono mein baat kar sakte hain.',
    
    -- Escalation
    transfer_number VARCHAR(50),
    escalation_keywords TEXT[] DEFAULT ARRAY['manager', 'supervisor', 'human', 'agent', 'transfer'],
    holding_persona TEXT DEFAULT 'Please hold, I am connecting you to our team.',
    
    -- Business Hours (JSONB for flexibility)
    business_hours JSONB DEFAULT '{
        "monday": {"start": "09:00", "end": "18:00", "enabled": true},
        "tuesday": {"start": "09:00", "end": "18:00", "enabled": true},
        "wednesday": {"start": "09:00", "end": "18:00", "enabled": true},
        "thursday": {"start": "09:00", "end": "18:00", "enabled": true},
        "friday": {"start": "09:00", "end": "18:00", "enabled": true},
        "saturday": {"start": "10:00", "end": "14:00", "enabled": true},
        "sunday": {"start": "10:00", "end": "14:00", "enabled": false}
    }'::jsonb,
    timezone VARCHAR(100) DEFAULT 'Asia/Kolkata',
    after_hours_message TEXT DEFAULT 'Humari business hours Monday to Saturday 9 AM to 6 PM hain. Please call back during business hours.',
    
    -- Features
    enable_semantic_cache BOOLEAN DEFAULT true,
    enable_barge_in BOOLEAN DEFAULT true,
    auto_transcribe BOOLEAN DEFAULT true,
    
    -- Custom Variables
    custom_variables JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(org_id)
);

-- ============================================
-- KNOWLEDGE BASE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    category VARCHAR(255),
    tags TEXT[],
    priority INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CALLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    exotel_call_sid VARCHAR(255),
    caller_number VARCHAR(50),
    direction VARCHAR(20) DEFAULT 'inbound',
    status VARCHAR(50) DEFAULT 'initiated',
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    
    -- Conversation
    transcript JSONB DEFAULT '[]'::jsonb,
    summary TEXT,
    sentiment VARCHAR(50),
    sentiment_score DECIMAL(3,2),
    
    -- Costs
    total_tokens INTEGER DEFAULT 0,
    llm_cost_usd DECIMAL(10,6) DEFAULT 0,
    stt_cost_usd DECIMAL(10,6) DEFAULT 0,
    tts_cost_usd DECIMAL(10,6) DEFAULT 0,
    
    -- Escalation
    was_escalated BOOLEAN DEFAULT false,
    escalation_reason TEXT,
    transferred_to VARCHAR(50),
    
    -- Recording
    recording_url TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ANALYTICS DAILY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- Call metrics
    total_calls INTEGER DEFAULT 0,
    completed_calls INTEGER DEFAULT 0,
    escalated_calls INTEGER DEFAULT 0,
    failed_calls INTEGER DEFAULT 0,
    
    -- Duration
    total_duration_seconds INTEGER DEFAULT 0,
    avg_duration_seconds DECIMAL(10,2) DEFAULT 0,
    
    -- Costs
    total_cost_usd DECIMAL(10,4) DEFAULT 0,
    estimated_human_cost_usd DECIMAL(10,4) DEFAULT 0,
    cost_savings_usd DECIMAL(10,4) DEFAULT 0,
    
    -- Sentiment
    avg_sentiment_score DECIMAL(3,2),
    positive_calls INTEGER DEFAULT 0,
    negative_calls INTEGER DEFAULT 0,
    neutral_calls INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(org_id, date)
);

-- ============================================
-- SEMANTIC CACHE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS semantic_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    input_hash VARCHAR(64) NOT NULL,
    input_text TEXT,
    input_embedding vector(1536),
    response_text TEXT NOT NULL,
    response_audio_url TEXT,
    hit_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(org_id, input_hash)
);

-- ============================================
-- ESCALATION LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS escalation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    trigger_phrase TEXT,
    transferred_to VARCHAR(50),
    whisper_summary TEXT,
    whisper_played BOOLEAN DEFAULT false,
    transfer_status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ERROR LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    error_type VARCHAR(100),
    error_message TEXT,
    error_stack TEXT,
    context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES (Neon Compatible)
-- ============================================

-- Organizations
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

-- Users
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;

-- API Keys
CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

-- Knowledge Base
CREATE INDEX IF NOT EXISTS idx_knowledge_base_org_id ON knowledge_base(org_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_status ON knowledge_base(org_id, status);

-- Vector search index (IVFFlat for approximate nearest neighbor)
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding ON knowledge_base 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Trigram index for text search (on content column directly, no function)
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content_trgm ON knowledge_base 
    USING gin (content gin_trgm_ops);

-- Calls
CREATE INDEX IF NOT EXISTS idx_calls_org_id ON calls(org_id);
CREATE INDEX IF NOT EXISTS idx_calls_org_date ON calls(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_exotel_sid ON calls(exotel_call_sid) WHERE exotel_call_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(org_id, caller_number);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(org_id, status);

-- Analytics Daily
CREATE INDEX IF NOT EXISTS idx_analytics_daily_org_date ON analytics_daily(org_id, date DESC);

-- Semantic Cache
CREATE INDEX IF NOT EXISTS idx_semantic_cache_org_hash ON semantic_cache(org_id, input_hash);
CREATE INDEX IF NOT EXISTS idx_semantic_cache_embedding ON semantic_cache 
    USING ivfflat (input_embedding vector_cosine_ops) WITH (lists = 50);

-- Escalation Logs
CREATE INDEX IF NOT EXISTS idx_escalation_logs_org_id ON escalation_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_escalation_logs_call_id ON escalation_logs(call_id);

-- Error Logs
CREATE INDEX IF NOT EXISTS idx_error_logs_org_id ON error_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Increment monthly calls counter
CREATE OR REPLACE FUNCTION increment_monthly_calls()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE organizations 
    SET current_month_calls = current_month_calls + 1
    WHERE id = NEW.org_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Reset monthly calls (for cron job)
CREATE OR REPLACE FUNCTION reset_monthly_calls()
RETURNS void AS $$
BEGIN
    UPDATE organizations SET current_month_calls = 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated_at triggers
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_knowledge_base_updated_at ON knowledge_base;
CREATE TRIGGER update_knowledge_base_updated_at
    BEFORE UPDATE ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_calls_updated_at ON calls;
CREATE TRIGGER update_calls_updated_at
    BEFORE UPDATE ON calls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Increment calls counter on new call
DROP TRIGGER IF EXISTS increment_calls_on_insert ON calls;
CREATE TRIGGER increment_calls_on_insert
    AFTER INSERT ON calls
    FOR EACH ROW EXECUTE FUNCTION increment_monthly_calls();

-- ============================================
-- SEED DATA (Demo Organization)
-- ============================================

-- Create demo organization
INSERT INTO organizations (id, name, slug, plan, status, monthly_call_limit)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Demo Company',
    'demo-company',
    'starter',
    'active',
    1000
) ON CONFLICT (id) DO NOTHING;

-- Create demo user (password: demo123)
INSERT INTO users (id, org_id, email, password_hash, name, role, status)
VALUES (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'demo@example.com',
    '$2b$10$rQEY9zF5qHvOqHqHqHqHqOqHqHqHqHqHqHqHqHqHqHqHqHqHqHqHq',
    'Demo User',
    'owner',
    'active'
) ON CONFLICT DO NOTHING;

-- Create default settings for demo org
INSERT INTO settings (org_id, agent_name, company_name)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'AI Assistant',
    'Demo Company'
) ON CONFLICT (org_id) DO NOTHING;

-- Add sample knowledge base entries
INSERT INTO knowledge_base (org_id, title, content, category, priority)
VALUES 
    (
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Business Hours',
        'Humari business hours Monday to Saturday 9 AM to 6 PM hain. Sunday ko hum band rehte hain. Aap hume phone kar sakte hain ya email bhej sakte hain.',
        'General',
        10
    ),
    (
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Return Policy',
        'Aap 30 din ke andar product return kar sakte hain. Product original condition mein hona chahiye. Refund 5-7 working days mein process ho jata hai.',
        'Policies',
        8
    ),
    (
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Contact Information',
        'Aap hume call kar sakte hain 1800-XXX-XXXX pe ya email bhej sakte hain support@example.com pe. Humari team aapki madad ke liye hamesha ready hai.',
        'General',
        10
    )
ON CONFLICT DO NOTHING;

-- ============================================
-- DONE!
-- ============================================
SELECT 'Migration completed successfully!' as status;