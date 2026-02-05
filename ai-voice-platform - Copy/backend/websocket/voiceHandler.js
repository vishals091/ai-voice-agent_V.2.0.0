/**
 * Dashboard Voice Handler
 * 
 * Handles WebSocket connections from browser-based dashboard
 * Similar to Exotel handler but uses browser audio formats (opus/pcm)
 */

const { createHash } = require('crypto');
const { URL } = require('url');
const jwt = require('jsonwebtoken');
const { rawQuery, getSettings } = require('../services/database');
const RedisService = require('../services/redis');
const STTFactory = require('../services/stt');
const LLMFactory = require('../services/llm');
const TTSFactory = require('../services/tts');
const RAGService = require('../services/rag');
const AnalyticsService = require('../services/analytics');

const TOKEN_BUFFER_SIZE = 5;
const BROWSER_SAMPLE_RATE = 16000;

class DashboardSession {
  constructor(ws, sessionId, orgId, userId, settings) {
    this.ws = ws;
    this.sessionId = sessionId;
    this.orgId = orgId;
    this.userId = userId;
    this.settings = settings;
    
    // Initialize services via Factory pattern
    this.stt = STTFactory.create(settings.stt_provider);
    this.llm = LLMFactory.create(settings.llm_provider);
    this.tts = TTSFactory.create(settings.tts_provider);
    
    // State
    this.isActive = true;
    this.isSpeaking = false;
    this.isUserSpeaking = false;
    this.currentLLMStream = null;
    this.ttsTokenBuffer = [];
    
    // Metrics
    this.metrics = {
      startTime: Date.now(),
      totalTokens: 0,
      llmCost: 0,
      sttCost: 0,
      ttsCost: 0
    };
    
    // Build system prompt
    this.systemPrompt = this.buildSystemPrompt();
    
    // Conversation history (in-memory for dashboard sessions)
    this.conversationHistory = [];
  }

  buildSystemPrompt() {
    let prompt = this.settings.system_prompt || '';
    
    // Inject variables
    const variables = this.settings.custom_variables || {};
    variables.owner_name = this.settings.owner_name || 'Manager';
    variables.owner_title = this.settings.owner_title || 'Manager';
    variables.company_name = this.settings.company_name || 'Our Company';
    variables.agent_name = this.settings.agent_name || 'AI Assistant';
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
      prompt = prompt.replace(regex, value);
    }
    
    return prompt;
  }

  /**
   * Handle audio input from browser
   */
  async handleAudioInput(audioBuffer) {
    if (!this.isActive) return;
    
    // Detect voice activity
    const hasVoice = this.detectVoiceActivity(audioBuffer);
    
    if (hasVoice && !this.isUserSpeaking) {
      this.isUserSpeaking = true;
      
      // Barge-in if AI is speaking
      if (this.isSpeaking) {
        await this.handleBargeIn();
      }
    } else if (!hasVoice && this.isUserSpeaking) {
      this.isUserSpeaking = false;
    }
    
    // Stream to STT
    await this.stt.streamAudio(audioBuffer);
  }

  detectVoiceActivity(audioBuffer) {
    // PCM 16-bit audio
    let sum = 0;
    const samples = new Int16Array(audioBuffer.buffer);
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);
    return rms > 500; // Threshold for 16-bit PCM
  }

  async handleBargeIn() {
    console.log(`🛑 [Dashboard:${this.sessionId}] Barge-in!`);
    
    this.isSpeaking = false;
    
    if (this.currentLLMStream) {
      this.currentLLMStream.cancel();
      this.currentLLMStream = null;
    }
    
    this.ttsTokenBuffer = [];
    
    // Notify frontend to stop playback
    this.sendJSON({ type: 'clear_audio' });
    
    // Truncate conversation (remove last partial response)
    if (this.conversationHistory.length > 0) {
      const last = this.conversationHistory[this.conversationHistory.length - 1];
      if (last.role === 'assistant') {
        this.conversationHistory.pop();
      }
    }
  }

  /**
   * Handle transcript from STT
   */
  async handleTranscript(transcript, isFinal) {
    if (!this.isActive || !transcript.trim()) return;
    
    // Send transcript to frontend for display
    this.sendJSON({
      type: 'transcript',
      text: transcript,
      isFinal
    });
    
    if (isFinal) {
      // Check cache
      const cached = await this.checkCache(transcript);
      if (cached) {
        await this.streamCachedResponse(cached);
        return;
      }
      
      // Save to history
      this.conversationHistory.push({
        role: 'user',
        content: transcript,
        timestamp: Date.now()
      });
      
      // Process with LLM
      await this.processWithLLM(transcript);
    }
  }

  async checkCache(transcript) {
    const normalized = transcript.toLowerCase().trim();
    const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
    return await RedisService.getCachedResponse(this.orgId, hash);
  }

  async streamCachedResponse(cached) {
    this.isSpeaking = true;
    
    this.conversationHistory.push({
      role: 'assistant',
      content: cached.text,
      timestamp: Date.now()
    });
    
    // Send text to frontend
    this.sendJSON({
      type: 'response',
      text: cached.text,
      cached: true
    });
    
    // Send audio
    if (cached.audioBase64) {
      this.sendJSON({
        type: 'audio',
        data: cached.audioBase64,
        format: 'mp3'
      });
    } else {
      // Generate TTS
      const audio = await this.tts.synthesize(cached.text, {
        voice: this.settings.tts_voice,
        format: 'mp3'
      });
      this.sendJSON({
        type: 'audio',
        data: audio.toString('base64'),
        format: 'mp3'
      });
    }
    
    this.isSpeaking = false;
  }

  async processWithLLM(userMessage) {
    this.isSpeaking = true;
    this.ttsTokenBuffer = [];
    
    try {
      // RAG search
      const ragContext = await RAGService.search(this.orgId, userMessage, 3);
      
      // Build messages
      const messages = [
        { role: 'system', content: this.systemPrompt }
      ];
      
      if (ragContext && ragContext.length > 0) {
        messages.push({
          role: 'system',
          content: `Relevant knowledge:\n${ragContext.map(r => r.content).join('\n\n')}`
        });
      }
      
      // Add history (last 10 exchanges)
      messages.push(...this.conversationHistory.slice(-20).map(m => ({
        role: m.role,
        content: m.content
      })));
      
      messages.push({ role: 'user', content: userMessage });
      
      let fullResponse = '';
      let tokenCount = 0;
      let sentenceBuffer = '';
      
      // Notify frontend that response is starting
      this.sendJSON({ type: 'response_start' });
      
      this.currentLLMStream = await this.llm.streamComplete({
        model: this.settings.llm_model,
        messages,
        maxTokens: 500,
        temperature: 0.7,
        onToken: async (token) => {
          if (!this.isActive || !this.isSpeaking) {
            return false;
          }
          
          fullResponse += token;
          tokenCount++;
          
          // Send token to frontend for real-time display
          this.sendJSON({
            type: 'token',
            text: token
          });
          
          // Buffer for TTS (sentence-based for better prosody)
          sentenceBuffer += token;
          
          // Check for sentence end
          if (/[.!?।]\s*$/.test(sentenceBuffer) && sentenceBuffer.length > 20) {
            const sentence = sentenceBuffer.trim();
            sentenceBuffer = '';
            
            // Generate TTS for sentence (parallel)
            this.streamTTSChunk(sentence).catch(console.error);
          }
          
          return true;
        }
      });
      
      // Process remaining buffer
      if (sentenceBuffer.trim()) {
        await this.streamTTSChunk(sentenceBuffer.trim());
      }
      
      // Save to history
      this.conversationHistory.push({
        role: 'assistant',
        content: fullResponse,
        timestamp: Date.now()
      });
      
      // Notify frontend that response is complete
      this.sendJSON({ type: 'response_end' });
      
      // Update metrics
      this.metrics.totalTokens += tokenCount;
      this.metrics.llmCost += this.llm.calculateCost(tokenCount);
      
    } catch (error) {
      console.error(`❌ [Dashboard:${this.sessionId}] LLM error:`, error);
      this.sendJSON({
        type: 'error',
        message: 'Sorry, there was an error processing your request.'
      });
    } finally {
      this.isSpeaking = false;
      this.currentLLMStream = null;
    }
  }

  async streamTTSChunk(text) {
    if (!this.isActive || !this.isSpeaking) return;
    
    try {
      const audio = await this.tts.synthesize(text, {
        voice: this.settings.tts_voice,
        format: 'mp3',
        streaming: true
      });
      
      this.sendJSON({
        type: 'audio',
        data: audio.toString('base64'),
        format: 'mp3'
      });
      
      this.metrics.ttsCost += this.tts.calculateCost(text.length);
      
    } catch (error) {
      console.error(`❌ [Dashboard:${this.sessionId}] TTS error:`, error);
    }
  }

  sendJSON(data) {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(data));
    }
  }

  async end() {
    console.log(`📴 [Dashboard:${this.sessionId}] Session ending`);
    this.isActive = false;
    
    if (this.currentLLMStream) {
      this.currentLLMStream.cancel();
    }
    
    await this.stt.close();
    
    // Log session metrics
    const duration = Math.floor((Date.now() - this.metrics.startTime) / 1000);
    
    await AnalyticsService.logDashboardSession(this.orgId, {
      sessionId: this.sessionId,
      userId: this.userId,
      duration,
      metrics: this.metrics,
      messageCount: this.conversationHistory.length
    });
  }
}

/**
 * Main handler for dashboard WebSocket connections
 */
async function handleVoiceConnection(ws, req, redis) {
  let session = null;
  
  // Extract auth token from query string
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  
  if (!token) {
    ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
    ws.close();
    return;
  }
  
  // Verify JWT token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
    ws.close();
    return;
  }
  
  const { orgId, userId } = decoded;
  
  ws.on('message', async (message) => {
    try {
      if (Buffer.isBuffer(message)) {
        // Binary audio data
        if (session) {
          await session.handleAudioInput(message);
        }
      } else {
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case 'start':
            // Start new session
            const sessionId = `dash_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            console.log(`🎤 Starting dashboard session: ${sessionId}`);
            
            // Get org settings
            const settings = await getSettings(orgId);
            
            if (!settings) {
              ws.send(JSON.stringify({ type: 'error', message: 'Settings not found' }));
              ws.close();
              return;
            }
            
            session = new DashboardSession(ws, sessionId, orgId, userId, settings);
            
            // Initialize STT
            await session.stt.startStream({
              sampleRate: BROWSER_SAMPLE_RATE,
              encoding: 'linear16',
              language: data.language || 'hi-IN',
              onTranscript: (transcript, isFinal) => {
                session.handleTranscript(transcript, isFinal);
              }
            });
            
            ws.send(JSON.stringify({ 
              type: 'started', 
              sessionId,
              agentName: settings.agent_name 
            }));
            break;
            
          case 'text':
            // Text input (for testing without mic)
            if (session) {
              await session.handleTranscript(data.text, true);
            }
            break;
            
          case 'end':
            if (session) {
              await session.end();
            }
            break;
            
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
        }
      }
    } catch (error) {
      console.error('Dashboard handler error:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });
  
  ws.on('close', async () => {
    if (session) {
      await session.end();
    }
  });
  
  ws.on('error', async (error) => {
    console.error('Dashboard WebSocket error:', error);
    if (session) {
      await session.end();
    }
  });
}

module.exports = { handleVoiceConnection };
