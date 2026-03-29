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
- `DATABASE_URL` - neon ke liye hai
- `REDIS_HOST`, `REDIS_PORT` - Redis connection
- `OPENAI_API_KEY` - For llm, tts or maybe embeddings 
- `DEEPGRAM_API_KEY` - For stt
- `JWT_SECRET` - 32+ character 

### 4. Start Server

```bash
# Development
npm run dev

# Production
npm start
```

Server will start on `http://localhost:5000`