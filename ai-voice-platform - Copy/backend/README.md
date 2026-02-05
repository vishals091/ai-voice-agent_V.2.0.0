# AI Voice Customer Support Platform - Backend

Enterprise SaaS real-time AI voice customer support platform optimized for the Indian market with Hindi/Hinglish support.

## 🚀 Features

### Core Capabilities
- **Real-time Voice AI** - Live streaming voice conversation with <500ms latency
- **Multi-LLM Support** - OpenAI GPT-4o, Anthropic Claude, Google Gemini, xAI Grok
- **Multi-STT Support** - Deepgram (real-time), OpenAI Whisper, Google STT
- **Multi-TTS Support** - OpenAI TTS, ElevenLabs, Google Cloud TTS (Hindi voices)
- **Hybrid RAG** - pgvector semantic + trigram keyword search
- **Semantic Caching** - 0ms responses for common queries

### Enterprise Features
- **Multi-Tenancy** - Full org_id isolation with Row-Level Security
- **Exotel Integration** - AgentStream bidirectional audio WebSocket
- **Barge-In Detection** - Interrupt AI mid-sentence, clear buffers
- **Intelligent Escalation** - Warm transfer with whisper summary
- **Business Hours** - Automatic after-hours handling
- **Team Management** - Roles: owner, admin, member, viewer
- **Usage Analytics** - Cost tracking, call summaries, sentiment analysis

## 📁 Project Structure

```
backend/
├── server.js                 # Main Express + WebSocket server
├── package.json              # Dependencies
├── .env.example              # Environment variables template
│
├── services/
│   ├── database.js           # PostgreSQL + pgvector connection
│   ├── redis.js              # Redis session & cache management
│   ├── llm.js                # LLM Factory (OpenAI, Anthropic, Gemini, Grok)
│   ├── stt.js                # STT Factory (Deepgram, Whisper, Google)
│   ├── tts.js                # TTS Factory (OpenAI, ElevenLabs, Google)
│   ├── rag.js                # Hybrid search (semantic + keyword)
│   └── analytics.js          # Post-call processing & aggregation
│
├── websocket/
│   ├── exotelHandler.js      # Exotel AgentStream handler
│   └── voiceHandler.js       # Dashboard WebSocket handler
│
├── routes/
│   ├── auth.js               # Login, register, forgot password
│   ├── knowledge.js          # Knowledge base CRUD
│   ├── settings.js           # Organization settings
│   ├── analytics.js          # Analytics & reports
│   ├── organization.js       # Team & billing management
│   └── exotel.js             # Exotel webhooks
│
├── middleware/
│   ├── tenantResolver.js     # JWT auth + org context
│   ├── businessHours.js      # After-hours call handling
│   └── rateLimiter.js        # Redis-based rate limiting
│
└── migrations/
    └── 001_initial_schema.sql  # Database schema
```

## 🛠️ Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 15+ with pgvector extension
- Redis 6+
- Neon account (or local PostgreSQL)

### 1. Clone & Install

```bash
cd backend
npm install
```

### 2. Database Setup

```bash
# Connect to your Neon PostgreSQL database
psql $DATABASE_URL

# Run migrations
\i migrations/001_initial_schema.sql
```

### 3. Environment Variables

```bash
cp .env.example .env
# Edit .env with your credentials
```

**Required variables:**
- `DATABASE_URL` - Neon PostgreSQL connection string
- `REDIS_HOST`, `REDIS_PORT` - Redis connection
- `OPENAI_API_KEY` - For LLM, TTS, and embeddings
- `DEEPGRAM_API_KEY` - For real-time STT
- `JWT_SECRET` - 32+ character secret for auth

### 4. Start Server

```bash
# Development
npm run dev

# Production
npm start
```

Server will start on `http://localhost:5000`

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Create account + organization
- `POST /api/auth/login` - Get JWT token
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset with token
- `GET /api/auth/me` - Get current user

### Knowledge Base
- `GET /api/knowledge` - List knowledge entries
- `POST /api/knowledge` - Add entry (auto-generates embedding)
- `PUT /api/knowledge/:id` - Update entry
- `DELETE /api/knowledge/:id` - Delete entry
- `POST /api/knowledge/search` - Hybrid search
- `POST /api/knowledge/bulk-import` - Bulk upload

### Settings
- `GET /api/settings` - Get org settings
- `PUT /api/settings` - Update settings
- `GET /api/settings/providers` - List available AI providers
- `POST /api/settings/test-voice` - Test TTS configuration

### Analytics
- `GET /api/analytics/overview` - Dashboard metrics
- `GET /api/analytics/daily` - Daily breakdown
- `GET /api/analytics/calls` - Recent calls
- `GET /api/analytics/calls/:id` - Call details with transcript

### Organization
- `GET /api/organization` - Org details
- `GET /api/organization/team` - Team members
- `POST /api/organization/team/invite` - Invite member
- `DELETE /api/organization/team/:userId` - Remove member
- `GET /api/organization/api-keys` - API keys
- `POST /api/organization/api-keys` - Create API key
- `GET /api/organization/billing` - Billing info

### Exotel Webhooks
- `POST /api/exotel/incoming` - Incoming call handler
- `POST /api/exotel/status` - Call status callback
- `POST /api/exotel/recording` - Recording ready callback
- `POST /api/exotel/transfer` - Transfer status callback

## 🎙️ WebSocket Endpoints

### Dashboard Voice (`/ws/voice`)
Browser-based voice streaming for testing/demo.

```javascript
const ws = new WebSocket('ws://localhost:5000/ws/voice?token=JWT_TOKEN');

// Send audio (PCM 16-bit, 16kHz)
ws.send(audioChunk);

// Receive responses
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Types: transcript, response, audio, end
};
```

### Exotel AgentStream (`/ws/exotel`)
Exotel bidirectional audio stream (mulaw 8kHz).

```javascript
// Exotel connects automatically via App configuration
// Audio format: Binary mulaw 8kHz mono
```

## 📊 Architecture

### Call Flow
```
Caller → Exotel → WebSocket → STT (streaming) → LLM + RAG → TTS → WebSocket → Exotel → Caller
                     ↑                              ↓
                Redis Session                 Semantic Cache
                     ↑                              ↓
                PostgreSQL ←─────────────── Analytics
```

### Parallel Pipeline
1. STT streams partial transcripts
2. LLM starts generating after first sentence
3. TTS generates audio after 5 tokens
4. Audio streams back while LLM still generating

### Barge-In Handling
1. Voice activity detected during AI speech
2. Cancel LLM stream immediately
3. Clear TTS buffer
4. Truncate conversation history
5. Send clear command to Exotel
6. Process new user input

## 🔧 Configuration

### Default AI Providers
```json
{
  "llm": "openai/gpt-4o-mini",
  "stt": "deepgram/nova-2",
  "tts": "openai/alloy"
}
```

### Business Hours (Asia/Kolkata)
```json
{
  "monday": {"start": "09:00", "end": "18:00"},
  "friday": {"start": "09:00", "end": "18:00"},
  "saturday": {"start": "10:00", "end": "14:00"},
  "sunday": null
}
```

## 🚀 Deployment

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
```

### Environment
- **Staging**: Use `starter` plan limits
- **Production**: Enable Redis cluster, multiple instances

## 📈 Scaling

- **Horizontal**: Multiple Node.js instances behind load balancer
- **Redis Cluster**: For session persistence across instances
- **Database**: Neon autoscaling or read replicas
- **WebSocket**: Sticky sessions required

## 🔒 Security

- JWT authentication with refresh tokens
- API key authentication for webhooks
- Rate limiting (Redis-based)
- Helmet security headers
- CORS configuration
- Row-Level Security (optional)

## 📝 License

MIT
