# AI Voice Customer Support Platform 🎙️

A real-time AI voice customer support platform built for the Indian market with support for Hindi, Hinglish, and multiple regional languages. Compete with Retell.ai and Vapi.ai with your own self-hosted solution.

## ✨ Features

- **Real-time Voice Chat**: WebSocket-based bidirectional audio streaming - speak and hear responses in real-time
- **Multi-language Support**: Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi + English
- **Multiple AI Providers**: OpenAI GPT-4o, Anthropic Claude, Google Gemini, xAI Grok
- **RAG Knowledge Base**: pgvector semantic search with OpenAI embeddings
- **Analytics Dashboard**: Track conversations, response times, and cost savings vs human agents
- **Customizable Settings**: Configure AI personality, voices, languages, and behavior

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  React Frontend │────▶│  Node.js        │────▶│  Neon           │
│  (Dashboard)    │     │  Backend        │     │  PostgreSQL     │
│                 │◀────│  (WebSocket)    │◀────│  (pgvector)     │
│                 │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
              ┌─────▼─────┐ ┌────▼────┐ ┌────▼────┐
              │ Deepgram  │ │ OpenAI  │ │ OpenAI  │
              │ STT       │ │ LLM     │ │ TTS     │
              │ (Realtime)│ │ GPT-4o  │ │         │
              └───────────┘ └─────────┘ └─────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Neon PostgreSQL account (free tier works)
- API Keys: OpenAI, Deepgram

### 1. Clone & Install

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your API keys
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure Environment

Edit `backend/.env`:

```env
DATABASE_URL=postgresql://...@neon.tech/neondb
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
JWT_SECRET=your-secure-secret
```

### 3. Start the Application

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm start
```

### 4. First Time Setup

1. Open http://localhost:3000
2. Create an account at `/login`
3. Add knowledge base entries at `/knowledge`
4. Start talking at the Voice Chat page!

## 📁 Project Structure

```
ai-voice-platform/
├── backend/
│   ├── server.js           # Express + WebSocket server
│   ├── routes/             # REST API routes
│   │   ├── auth.js         # Authentication
│   │   ├── knowledge.js    # Knowledge base CRUD
│   │   ├── analytics.js    # Analytics & reporting
│   │   └── settings.js     # Configuration
│   ├── services/
│   │   ├── stt.js          # Speech-to-Text (Deepgram/Whisper)
│   │   ├── tts.js          # Text-to-Speech (OpenAI/ElevenLabs)
│   │   ├── llm.js          # LLM orchestration
│   │   ├── rag.js          # RAG with pgvector
│   │   ├── database.js     # PostgreSQL connection
│   │   ├── analytics.js    # Metrics & logging
│   │   └── settings.js     # Config management
│   └── websocket/
│       └── voiceHandler.js # Real-time voice session
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── Layout.js   # Dashboard layout
│   │   ├── pages/
│   │   │   ├── VoiceChat.js    # Main voice interface
│   │   │   ├── KnowledgeBase.js # KB management
│   │   │   ├── Analytics.js    # Reports & charts
│   │   │   ├── Settings.js     # Configuration
│   │   │   └── Login.js        # Auth
│   │   └── services/
│   │       ├── api.js          # Axios instance
│   │       ├── authStore.js    # Auth state (Zustand)
│   │       └── voiceStore.js   # Voice state (Zustand)
│   └── public/
│       └── index.html
│
└── README.md
```

## 🔧 Configuration

### LLM Providers

| Provider | Models | Best For |
|----------|--------|----------|
| OpenAI | GPT-4o, GPT-4o-mini | General purpose, best quality |
| Anthropic | Claude 3.5 Sonnet, Haiku | Complex reasoning, safety |
| Google | Gemini 1.5 Pro, Flash | Multimodal, long context |
| xAI | Grok-2, Grok-2-mini | Unique personality, humor |

### STT Providers

| Provider | Best For |
|----------|----------|
| Deepgram | Real-time streaming, Indian languages |
| Whisper | Batch processing, accuracy |

### TTS Providers

| Provider | Voices |
|----------|--------|
| OpenAI | Nova, Alloy, Echo, Fable, Onyx, Shimmer |
| ElevenLabs | Premium voices with emotion |

## 💰 Cost Estimation

| Service | Cost |
|---------|------|
| Deepgram STT | $0.0043/min |
| OpenAI GPT-4o-mini | $0.15/1M input tokens |
| OpenAI TTS | $0.015/1K chars |
| **Human Agent** | **₹500/hr** (~$6/hr) |

Average AI cost per conversation: **₹2-5** vs Human: **₹40-50**
**95% cost reduction** 📉

## 📊 Analytics

Track:
- Total conversations & messages
- Average response time
- Token usage
- Cost savings vs human agents
- Hourly traffic patterns

## 🔐 Security

- JWT authentication
- Password hashing with bcrypt
- Helmet.js security headers
- CORS protection
- Rate limiting (add in production)

## 🚢 Production Deployment

### Backend (Railway/Render)

```bash
# Build
npm install

# Start
npm start
```

Environment variables to set in production:
- `NODE_ENV=production`
- `DATABASE_URL`
- All API keys

### Frontend (Vercel/Netlify)

```bash
npm run build
```

Environment variables:
- `REACT_APP_API_URL=https://your-backend.com/api`
- `REACT_APP_WS_URL=wss://your-backend.com/ws/voice`

## 🎯 Roadmap

- [ ] Phone call integration (Twilio/Exotel)
- [ ] Voice cloning
- [ ] Sentiment analysis
- [ ] Agent handoff
- [ ] Multi-tenant support
- [ ] WhatsApp integration
- [ ] Hindi TTS with Indian accents

## 📝 License

MIT

## 🤝 Contributing

PRs welcome! Please read our contributing guidelines.

---

Built with ❤️ for India 🇮🇳
