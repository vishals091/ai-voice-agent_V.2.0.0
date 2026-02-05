/**
 * Exotel AgentStream WebSocket Handler
 * 
 * Handles bidirectional binary audio streaming from Exotel's AgentStream API
 * Implements parallel/interleaved latency pipeline with barge-in support
 * 
 * Flow:
 * 1. Exotel sends binary audio (mulaw 8kHz)
 * 2. STT streams partial transcripts → LLM starts thinking immediately
 * 3. LLM streams tokens → TTS starts generating audio after first 5 tokens
 * 4. Audio chunks stream back to Exotel
 * 5. Barge-in: If user speaks, clear TTS buffer and truncate LLM memory
 */

const { createHash } = require('crypto');
const { rawQuery } = require('../services/database');
const RedisService = require('../services/redis');
const STTFactory = require('../services/stt');
const LLMFactory = require('../services/llm');
const TTSFactory = require('../services/tts');
const RAGService = require('../services/rag');
const AnalyticsService = require('../services/analytics');

// Constants
const BARGE_IN_THRESHOLD_MS = 200; // Time speaking before triggering barge-in
const TOKEN_BUFFER_SIZE = 5; // Start TTS after this many LLM tokens
const AUDIO_SAMPLE_RATE = 8000; // Exotel uses 8kHz mulaw

class ExotelSession {
  constructor(ws, callSid, orgId, settings) {
    this.ws = ws;
    this.callSid = callSid;
    this.orgId = orgId;
    this.settings = settings;
    
    // Initialize services via Factory pattern
    this.stt = STTFactory.create(settings.stt_provider);
    this.llm = LLMFactory.create(settings.llm_provider);
    this.tts = TTSFactory.create(settings.tts_provider);
    
    // State
    this.isActive = true;
    this.isSpeaking = false; // Is the AI currently speaking?
    this.isUserSpeaking = false;
    this.userSpeakingStartTime = null;
    this.currentLLMStream = null;
    this.ttsTokenBuffer = [];
    this.lastInterruptionTime = 0;
    
    // Metrics
    this.metrics = {
      startTime: Date.now(),
      totalTokens: 0,
      llmCost: 0,
      sttCost: 0,
      ttsCost: 0
    };
    
    // Build system prompt with variable injection
    this.systemPrompt = this.buildSystemPrompt();
  }

  /**
   * Build system prompt with variable injection
   */
  buildSystemPrompt() {
    let prompt = this.settings.system_prompt || '';
    
    // Inject custom variables
    const variables = this.settings.custom_variables || {};
    variables.owner_name = this.settings.owner_name || 'Manager';
    variables.owner_title = this.settings.owner_title || 'Manager';
    variables.company_name = this.settings.company_name || 'Our Company';
    variables.agent_name = this.settings.agent_name || 'AI Assistant';
    
    // Replace {{variable}} patterns
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
      prompt = prompt.replace(regex, value);
    }
    
    // Add escalation context
    if (this.settings.transfer_number) {
      prompt += `\n\nAgar customer ${this.settings.owner_title} se baat karna chahe, toh unhe batao ki aap unhe connect kar sakte ho.`;
    }
    
    return prompt;
  }

  /**
   * Handle incoming audio chunk from Exotel
   */
  async handleAudioInput(audioBuffer) {
    if (!this.isActive) return;
    
    // Detect if user started speaking
    const hasVoiceActivity = this.detectVoiceActivity(audioBuffer);
    
    if (hasVoiceActivity && !this.isUserSpeaking) {
      this.isUserSpeaking = true;
      this.userSpeakingStartTime = Date.now();
      
      // Check for barge-in
      if (this.isSpeaking) {
        await this.handleBargeIn();
      }
    } else if (!hasVoiceActivity && this.isUserSpeaking) {
      // User stopped speaking - check if it's a real stop
      const speakingDuration = Date.now() - this.userSpeakingStartTime;
      if (speakingDuration > BARGE_IN_THRESHOLD_MS) {
        this.isUserSpeaking = false;
      }
    }
    
    // Stream audio to STT
    await this.stt.streamAudio(audioBuffer);
  }

  /**
   * Simple Voice Activity Detection (VAD)
   */
  detectVoiceActivity(audioBuffer) {
    // Calculate RMS of audio samples
    let sum = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
      const sample = audioBuffer[i] - 128; // mulaw offset
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / audioBuffer.length);
    
    // Threshold for voice activity (adjust based on testing)
    return rms > 15;
  }

  /**
   * Handle barge-in (user interruption)
   */
  async handleBargeIn() {
    console.log(`🛑 [${this.callSid}] Barge-in detected!`);
    
    this.isSpeaking = false;
    this.lastInterruptionTime = Date.now();
    
    // Cancel current LLM stream
    if (this.currentLLMStream) {
      this.currentLLMStream.cancel();
      this.currentLLMStream = null;
    }
    
    // Clear TTS buffer
    this.ttsTokenBuffer = [];
    await RedisService.clearTTSBuffer(this.callSid);
    
    // Send clear buffer command to Exotel
    this.sendCommand('clear');
    
    // Truncate conversation history in Redis
    await RedisService.truncateConversation(this.callSid, this.lastInterruptionTime);
    
    // Log barge-in event
    await AnalyticsService.logEvent(this.orgId, this.callSid, 'barge_in');
  }

  /**
   * Handle STT transcript (partial or final)
   */
  async handleTranscript(transcript, isFinal) {
    if (!this.isActive || !transcript.trim()) return;
    
    console.log(`📝 [${this.callSid}] ${isFinal ? 'Final' : 'Partial'}: "${transcript}"`);
    
    if (isFinal) {
      // Check semantic cache first
      const cachedResponse = await this.checkSemanticCache(transcript);
      if (cachedResponse) {
        console.log(`⚡ [${this.callSid}] Cache hit! 0ms response`);
        await this.streamCachedResponse(cachedResponse);
        return;
      }
      
      // Check for escalation triggers
      if (this.shouldEscalate(transcript)) {
        await this.handleEscalation(transcript);
        return;
      }
      
      // Save to conversation history
      await RedisService.appendToConversation(this.callSid, 'user', transcript);
      
      // Start parallel LLM processing
      await this.processWithLLM(transcript);
    } else {
      // Partial transcript - could pre-warm LLM context here
      // For now, just update metrics
    }
  }

  /**
   * Check semantic cache for common phrases
   */
  async checkSemanticCache(transcript) {
    const normalizedInput = transcript.toLowerCase().trim();
    const inputHash = createHash('sha256').update(normalizedInput).digest('hex').slice(0, 16);
    
    return await RedisService.getCachedResponse(this.orgId, inputHash);
  }

  /**
   * Stream cached response (0ms latency)
   */
  async streamCachedResponse(cached) {
    this.isSpeaking = true;
    
    // Save to conversation
    await RedisService.appendToConversation(this.callSid, 'assistant', cached.text);
    
    // If we have pre-generated audio, stream it directly
    if (cached.audioBase64) {
      const audioBuffer = Buffer.from(cached.audioBase64, 'base64');
      this.sendAudio(audioBuffer);
    } else {
      // Generate TTS on the fly
      const audio = await this.tts.synthesize(cached.text, {
        voice: this.settings.tts_voice,
        format: 'mulaw',
        sampleRate: AUDIO_SAMPLE_RATE
      });
      this.sendAudio(audio);
    }
    
    this.isSpeaking = false;
  }

  /**
   * Check if user wants to escalate
   */
  shouldEscalate(transcript) {
    const keywords = this.settings.escalation_keywords || [];
    const normalized = transcript.toLowerCase();
    
    return keywords.some(kw => normalized.includes(kw.toLowerCase()));
  }

  /**
   * Handle escalation request
   */
  async handleEscalation(transcript) {
    console.log(`📞 [${this.callSid}] Escalation requested`);
    
    const transferNumber = this.settings.transfer_number;
    
    if (!transferNumber) {
      // No transfer number configured
      const response = "Main samajhta hoon aap kisi se baat karna chahte hain, lekin abhi humari team available nahi hai. Kya main aapki kisi aur tarah se madad kar sakta hoon?";
      await this.speak(response);
      return;
    }
    
    // Check if transfer line is busy
    const isBusy = await RedisService.isTransferBusy(transferNumber);
    
    if (isBusy) {
      // Enter holding persona
      await this.enterHoldingMode();
    } else {
      // Initiate warm transfer
      await this.initiateWarmTransfer();
    }
  }

  /**
   * Enter holding mode (transfer line is busy)
   */
  async enterHoldingMode() {
    console.log(`⏳ [${this.callSid}] Entering holding mode`);
    
    // Add to transfer queue
    await RedisService.addToTransferQueue(this.settings.transfer_number, this.callSid);
    
    // Update call state
    await RedisService.updateCallSessionField(this.callSid, 'status', 'holding');
    
    // Speak holding persona
    await this.speak(this.settings.holding_persona);
    
    // Continue conversation in holding mode
    // The system prompt is modified to keep user engaged
  }

  /**
   * Initiate warm transfer with whisper
   */
  async initiateWarmTransfer() {
    console.log(`🔗 [${this.callSid}] Initiating warm transfer`);
    
    // Mark transfer line as busy
    await RedisService.setTransferStatus(this.settings.transfer_number, 'busy');
    
    // Get conversation summary for whisper
    const session = await RedisService.getCallSession(this.callSid);
    const summary = await this.generateCallSummary(session.conversationHistory || []);
    
    // Inform user
    await this.speak(`Main aapko ${this.settings.owner_title} se connect kar raha hoon. Ek moment please.`);
    
    // Send transfer command with whisper
    this.sendCommand('transfer', {
      number: this.settings.transfer_number,
      whisper: summary, // 2-second summary for the agent
      warmTransfer: true
    });
    
    // Log escalation
    await AnalyticsService.logEscalation(this.orgId, this.callSid, {
      reason: 'user_requested',
      transferTo: this.settings.transfer_number
    });
  }

  /**
   * Generate 2-second call summary for warm transfer whisper
   */
  async generateCallSummary(conversationHistory) {
    if (conversationHistory.length === 0) {
      return "New call, no conversation yet.";
    }
    
    // Get last few exchanges
    const recent = conversationHistory.slice(-4);
    const context = recent.map(m => `${m.role}: ${m.content}`).join('\n');
    
    // Quick summary via LLM
    const summary = await this.llm.complete({
      model: 'gpt-4o-mini', // Fast model for summary
      messages: [
        {
          role: 'system',
          content: 'Generate a 2-second whisper summary for agent handoff. Be extremely brief. Hindi/English mix is fine.'
        },
        {
          role: 'user',
          content: `Conversation:\n${context}\n\nGenerate 1-line summary:`
        }
      ],
      maxTokens: 50
    });
    
    return summary;
  }

  /**
   * Process user input with LLM (streaming)
   */
  async processWithLLM(userMessage) {
    this.isSpeaking = true;
    this.ttsTokenBuffer = [];
    
    try {
      // Get conversation history
      const session = await RedisService.getCallSession(this.callSid);
      const history = session?.conversationHistory || [];
      
      // Perform RAG search
      const ragContext = await RAGService.search(this.orgId, userMessage, 3);
      
      // Build messages array
      const messages = [
        { role: 'system', content: this.systemPrompt }
      ];
      
      // Add RAG context if available
      if (ragContext && ragContext.length > 0) {
        const contextText = ragContext.map(r => r.content).join('\n\n');
        messages.push({
          role: 'system',
          content: `Relevant knowledge:\n${contextText}`
        });
      }
      
      // Add conversation history (limit to last 10 exchanges)
      const recentHistory = history.slice(-20);
      messages.push(...recentHistory.map(m => ({
        role: m.role,
        content: m.content
      })));
      
      // Add current user message
      messages.push({ role: 'user', content: userMessage });
      
      // Stream LLM response
      let fullResponse = '';
      let tokenCount = 0;
      
      this.currentLLMStream = await this.llm.streamComplete({
        model: this.settings.llm_model,
        messages,
        maxTokens: 500,
        temperature: 0.7,
        onToken: async (token) => {
          // Check for barge-in
          if (!this.isActive || !this.isSpeaking) {
            return false; // Cancel stream
          }
          
          fullResponse += token;
          tokenCount++;
          this.ttsTokenBuffer.push(token);
          
          // Start TTS after TOKEN_BUFFER_SIZE tokens
          if (this.ttsTokenBuffer.length >= TOKEN_BUFFER_SIZE) {
            const textChunk = this.ttsTokenBuffer.join('');
            this.ttsTokenBuffer = [];
            
            // Don't await - let it run in parallel
            this.streamTTSChunk(textChunk).catch(console.error);
          }
          
          return true; // Continue stream
        }
      });
      
      // Process any remaining tokens
      if (this.ttsTokenBuffer.length > 0) {
        const remaining = this.ttsTokenBuffer.join('');
        await this.streamTTSChunk(remaining);
      }
      
      // Save assistant response to history
      await RedisService.appendToConversation(this.callSid, 'assistant', fullResponse);
      
      // Update metrics
      this.metrics.totalTokens += tokenCount;
      this.metrics.llmCost += this.llm.calculateCost(tokenCount);
      
      // Cache common responses
      await this.maybeCache(userMessage, fullResponse);
      
    } catch (error) {
      console.error(`❌ [${this.callSid}] LLM error:`, error);
      await this.speak("Maaf kijiye, ek technical issue aa gaya. Kya aap phir se bol sakte hain?");
    } finally {
      this.isSpeaking = false;
      this.currentLLMStream = null;
    }
  }

  /**
   * Stream TTS chunk to Exotel
   */
  async streamTTSChunk(text) {
    if (!this.isActive || !this.isSpeaking) return;
    
    try {
      const audioBuffer = await this.tts.synthesize(text, {
        voice: this.settings.tts_voice,
        format: 'mulaw',
        sampleRate: AUDIO_SAMPLE_RATE,
        streaming: true
      });
      
      this.sendAudio(audioBuffer);
      
      // Update TTS cost
      this.metrics.ttsCost += this.tts.calculateCost(text.length);
      
    } catch (error) {
      console.error(`❌ [${this.callSid}] TTS error:`, error);
    }
  }

  /**
   * Speak a complete message
   */
  async speak(text) {
    this.isSpeaking = true;
    
    try {
      const audioBuffer = await this.tts.synthesize(text, {
        voice: this.settings.tts_voice,
        format: 'mulaw',
        sampleRate: AUDIO_SAMPLE_RATE
      });
      
      this.sendAudio(audioBuffer);
      await RedisService.appendToConversation(this.callSid, 'assistant', text);
      
    } catch (error) {
      console.error(`❌ [${this.callSid}] Speak error:`, error);
    } finally {
      this.isSpeaking = false;
    }
  }

  /**
   * Cache response if it's a common phrase
   */
  async maybeCache(userMessage, response) {
    const commonPhrases = [
      'hello', 'hi', 'hey', 'namaste', 'who are you', 'kaun ho',
      'help', 'madad', 'thank you', 'thanks', 'dhanyavad', 'shukriya',
      'bye', 'goodbye', 'alvida'
    ];
    
    const normalized = userMessage.toLowerCase().trim();
    
    if (commonPhrases.some(p => normalized.includes(p))) {
      const inputHash = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
      
      // Generate audio for cache
      const audioBuffer = await this.tts.synthesize(response, {
        voice: this.settings.tts_voice,
        format: 'mulaw',
        sampleRate: AUDIO_SAMPLE_RATE
      });
      
      await RedisService.setCachedResponse(
        this.orgId,
        inputHash,
        normalized,
        response,
        audioBuffer.toString('base64')
      );
    }
  }

  /**
   * Send audio data to Exotel
   */
  sendAudio(audioBuffer) {
    if (this.ws.readyState === 1) { // OPEN
      // Exotel expects binary audio frames
      this.ws.send(audioBuffer);
    }
  }

  /**
   * Send control command to Exotel
   */
  sendCommand(command, data = {}) {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({
        type: 'command',
        command,
        ...data
      }));
    }
  }

  /**
   * End the session
   */
  async end(reason = 'normal') {
    console.log(`📴 [${this.callSid}] Session ending: ${reason}`);
    this.isActive = false;
    
    // Cancel any ongoing processes
    if (this.currentLLMStream) {
      this.currentLLMStream.cancel();
    }
    
    // Close STT stream
    await this.stt.close();
    
    // Calculate final duration
    const duration = Math.floor((Date.now() - this.metrics.startTime) / 1000);
    
    // Get final conversation
    const session = await RedisService.getCallSession(this.callSid);
    
    // Save to database
    await AnalyticsService.saveCallRecord(this.orgId, {
      callSid: this.callSid,
      duration,
      transcript: session?.conversationHistory || [],
      metrics: this.metrics,
      endReason: reason
    });
    
    // Clean up Redis
    await RedisService.deleteCallSession(this.callSid);
    
    // Release transfer queue if holding
    if (this.settings.transfer_number) {
      await RedisService.removeFromQueue(this.settings.transfer_number, this.callSid);
    }
  }
}

/**
 * Main WebSocket connection handler
 */
async function handleExotelConnection(ws, req, redis) {
  let session = null;
  
  ws.on('message', async (message) => {
    try {
      // Check if binary audio or JSON control message
      if (Buffer.isBuffer(message)) {
        // Binary audio data
        if (session) {
          await session.handleAudioInput(message);
        }
      } else {
        // JSON control message
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case 'start':
            // New call session
            console.log(`📞 Starting Exotel session: ${data.callSid}`);
            
            // Get org settings from database
            const { rows } = await rawQuery(
              `SELECT s.*, o.id as org_id 
               FROM settings s 
               JOIN organizations o ON s.org_id = o.id 
               WHERE o.id = $1`,
              [data.orgId]
            );
            
            if (rows.length === 0) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid organization' }));
              ws.close();
              return;
            }
            
            const settings = rows[0];
            
            // Create session
            session = new ExotelSession(ws, data.callSid, data.orgId, settings);
            
            // Initialize call in Redis
            await RedisService.setCallSession(data.callSid, {
              orgId: data.orgId,
              status: 'in_progress',
              callerNumber: data.from,
              startedAt: Date.now(),
              conversationHistory: JSON.stringify([])
            });
            
            // Save to database
            await rawQuery(
              `INSERT INTO calls (org_id, exotel_call_sid, caller_number, status, direction)
               VALUES ($1, $2, $3, 'in_progress', $4)`,
              [data.orgId, data.callSid, data.from, data.direction || 'inbound']
            );
            
            // Initialize STT stream
            await session.stt.startStream({
              sampleRate: AUDIO_SAMPLE_RATE,
              encoding: 'mulaw',
              language: 'hi-IN', // Hindi primary for Indian market
              onTranscript: (transcript, isFinal) => {
                session.handleTranscript(transcript, isFinal);
              }
            });
            
            // Send greeting
            const greeting = settings.agent_name 
              ? `Namaste! Main ${settings.agent_name} hoon. Aaj main aapki kaise madad kar sakta hoon?`
              : "Namaste! Main aapki kaise madad kar sakta hoon?";
            
            await session.speak(greeting);
            
            // Confirm session started
            ws.send(JSON.stringify({ type: 'started', callSid: data.callSid }));
            break;
            
          case 'transcript':
            // External transcript (if STT is done externally)
            if (session) {
              await session.handleTranscript(data.text, data.isFinal);
            }
            break;
            
          case 'end':
            // Call ended
            if (session) {
              await session.end(data.reason || 'normal');
            }
            break;
            
          case 'ping':
            // Heartbeat
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
            
          default:
            console.log(`Unknown message type: ${data.type}`);
        }
      }
    } catch (error) {
      console.error('Exotel handler error:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });
  
  ws.on('close', async () => {
    console.log('📴 Exotel WebSocket closed');
    if (session) {
      await session.end('disconnected');
    }
  });
  
  ws.on('error', async (error) => {
    console.error('Exotel WebSocket error:', error);
    if (session) {
      await session.end('error');
    }
  });
}

module.exports = { handleExotelConnection };
