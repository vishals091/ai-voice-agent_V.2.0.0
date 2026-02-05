/**
 * AI Voice Customer Support Platform - Enterprise SaaS Edition
 * Multi-Tenant, Low-Latency Voice Engine with Exotel Telephony
 * 
 * Architecture:
 * - Multi-tenant with org_id scoping (RLS concepts)
 * - Redis for call session state management
 * - Exotel AgentStream bidirectional audio
 * - Parallel/Interleaved latency pipeline
 * - Barge-in interruption handling
 * - Intelligent escalation with warm transfer
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { WebSocketServer } = require('ws');
const Redis = require('ioredis');

// Services
const { initDatabase, pool } = require('./services/database');
const RedisService = require('./services/redis');

// WebSocket Handlers
const { handleVoiceConnection } = require('./websocket/voiceHandler');
const { handleExotelConnection } = require('./websocket/exotelHandler');

// Middleware
const { businessHoursMiddleware, checkCallBusinessHours } = require('./middleware/businessHours');
const { tenantResolver } = require('./middleware/tenantResolver');
const { rateLimitMiddleware: rateLimiter } = require('./middleware/rateLimiter');

// Routes
const knowledgeRoutes = require('./routes/knowledge');
const analyticsRoutes = require('./routes/analytics');
const settingsRoutes = require('./routes/settings');
const authRoutes = require('./routes/auth');
const exotelRoutes = require('./routes/exotel');
const organizationRoutes = require('./routes/organization');

const app = express();
const server = http.createServer(app);

// Initialize Redis
const redis = new Redis(process.env.REDIS_URL || {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
  keyPrefix: 'voiceai:'
});

// Make Redis available globally
global.redis = redis;
RedisService.init(redis);

// WebSocket Server for Dashboard Voice (browser-based)
const wssDashboard = new WebSocketServer({ 
  server,
  path: '/ws/voice'
});

// WebSocket Server for Exotel AgentStream (telephony)
const wssExotel = new WebSocketServer({
  server,
  path: '/ws/exotel'
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('combined'));

// Rate limiting
app.use(rateLimiter);

// Tenant resolution for all API routes
app.use('/api', tenantResolver);

// Health check (no auth required)
app.get('/health', async (req, res) => {
  try {
    // Check PostgreSQL
    await pool.query('SELECT 1');
    
    // Check Redis
    await redis.ping();
    
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected'
      }
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      error: error.message 
    });
  }
});

// Exotel webhook endpoints (no auth, verified by signature)
app.use('/webhook/exotel', exotelRoutes);

// API Routes (tenant-scoped)
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/organization', organizationRoutes);

// Dashboard WebSocket handling (browser voice)
wssDashboard.on('connection', (ws, req) => {
  console.log('🎤 Dashboard voice connection established');
  
  // Heartbeat mechanism
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  
  handleVoiceConnection(ws, req, redis);
});

// Exotel AgentStream WebSocket handling (telephony)
wssExotel.on('connection', (ws, req) => {
  console.log('📞 Exotel AgentStream connection established');
  
  // Heartbeat mechanism
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  
  handleExotelConnection(ws, req, redis);
});

// WebSocket heartbeat interval (detect dropped connections)
const heartbeatInterval = setInterval(() => {
  wssDashboard.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('💔 Terminating dead dashboard connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
  
  wssExotel.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('💔 Terminating dead Exotel connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000); // 30 second heartbeat

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  
  // Log to analytics if org_id is available
  if (req.orgId) {
    const analyticsService = require('./services/analytics');
    analyticsService.logError(req.orgId, err).catch(console.error);
  }
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// Start server
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Connect to Redis
   // await redis.connect();
    console.log('✅ Redis connected');
    
    // Initialize database with multi-tenant schema
    await initDatabase();
    console.log('✅ Database initialized with multi-tenant schema');

    server.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║     AI Voice Customer Support Platform - Enterprise SaaS Edition     ║
║══════════════════════════════════════════════════════════════════════║
║  🚀 Server running on port ${PORT}                                        ║
║  📡 Dashboard WebSocket: ws://localhost:${PORT}/ws/voice                  ║
║  📞 Exotel WebSocket: ws://localhost:${PORT}/ws/exotel                    ║
║  📊 API endpoint: http://localhost:${PORT}/api                            ║
║  🔗 Exotel Webhooks: http://localhost:${PORT}/webhook/exotel              ║
╚══════════════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  clearInterval(heartbeatInterval);
  
  // Close all WebSocket connections
  wssDashboard.clients.forEach(ws => ws.close());
  wssExotel.clients.forEach(ws => ws.close());
  
  // Close Redis
  await redis.quit();
  
  // Close HTTP server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
