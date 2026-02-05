/**
 * STT (Speech-to-Text) Service with Factory Pattern
 * 
 * Supports:
 * - Deepgram (Real-time streaming, best for low latency)
 * - OpenAI Whisper (Batch processing, high accuracy)
 * - Google Speech-to-Text
 * 
 * Easily switchable without rewriting core logic
 */

const WebSocket = require('ws');
const { EventEmitter } = require('events');

// ============================================
// BASE STT INTERFACE
// ============================================

class BaseSTT extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.isStreaming = false;
  }
  
  async startStream(options) {
    throw new Error('startStream() must be implemented');
  }
  
  async streamAudio(audioBuffer) {
    throw new Error('streamAudio() must be implemented');
  }
  
  async transcribe(audioBuffer) {
    throw new Error('transcribe() must be implemented');
  }
  
  async close() {
    throw new Error('close() must be implemented');
  }
  
  calculateCost(durationSeconds) {
    throw new Error('calculateCost() must be implemented');
  }
}

// ============================================
// DEEPGRAM PROVIDER (Best for real-time)
// ============================================

class DeepgramSTT extends BaseSTT {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.DEEPGRAM_API_KEY;
    this.ws = null;
    this.onTranscript = null;
    
    // Pricing: $0.0043/minute for Nova-2
    this.pricePerMinute = 0.0043;
  }
  
  async startStream(options) {
    const {
      sampleRate = 16000,
      encoding = 'linear16',
      language = 'hi-IN',
      onTranscript
    } = options;
    
    this.onTranscript = onTranscript;
    
    // Build WebSocket URL with parameters
    const params = new URLSearchParams({
      model: 'nova-2',
      language: language,
      punctuate: 'true',
      interim_results: 'true',
      endpointing: '300', // 300ms silence to end utterance
      vad_events: 'true',
      encoding: encoding,
      sample_rate: sampleRate.toString(),
      channels: '1'
    });
    
    const url = `wss://api.deepgram.com/v1/listen?${params}`;
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Token ${this.apiKey}`
        }
      });
      
      this.ws.on('open', () => {
        console.log('🎙️ Deepgram STT stream opened');
        this.isStreaming = true;
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          
          if (response.type === 'Results') {
            const transcript = response.channel?.alternatives?.[0]?.transcript;
            const isFinal = response.is_final;
            
            if (transcript && this.onTranscript) {
              this.onTranscript(transcript, isFinal);
            }
          } else if (response.type === 'SpeechStarted') {
            this.emit('speech_start');
          } else if (response.type === 'UtteranceEnd') {
            this.emit('utterance_end');
          }
        } catch (error) {
          console.error('Deepgram parse error:', error);
        }
      });
      
      this.ws.on('error', (error) => {
        console.error('Deepgram WebSocket error:', error);
        this.isStreaming = false;
        reject(error);
      });
      
      this.ws.on('close', () => {
        console.log('🎙️ Deepgram STT stream closed');
        this.isStreaming = false;
      });
    });
  }
  
  async streamAudio(audioBuffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(audioBuffer);
    }
  }
  
  async transcribe(audioBuffer) {
    // Batch transcription
    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=hi-IN', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'audio/wav'
      },
      body: audioBuffer
    });
    
    if (!response.ok) {
      throw new Error(`Deepgram API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  }
  
  async close() {
    if (this.ws) {
      // Send close frame
      this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      this.ws.close();
      this.ws = null;
    }
    this.isStreaming = false;
  }
  
  calculateCost(durationSeconds) {
    return (durationSeconds / 60) * this.pricePerMinute;
  }
}

// ============================================
// OPENAI WHISPER PROVIDER
// ============================================

class WhisperSTT extends BaseSTT {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.audioBuffer = [];
    this.onTranscript = null;
    this.silenceThreshold = 500; // ms
    this.lastAudioTime = 0;
    this.processingInterval = null;
    
    // Pricing: $0.006/minute
    this.pricePerMinute = 0.006;
  }
  
  async startStream(options) {
    const { onTranscript } = options;
    this.onTranscript = onTranscript;
    this.isStreaming = true;
    this.audioBuffer = [];
    
    // Process accumulated audio periodically
    this.processingInterval = setInterval(async () => {
      if (this.audioBuffer.length > 0 && Date.now() - this.lastAudioTime > this.silenceThreshold) {
        await this.processBuffer();
      }
    }, 200);
  }
  
  async streamAudio(audioBuffer) {
    this.audioBuffer.push(audioBuffer);
    this.lastAudioTime = Date.now();
  }
  
  async processBuffer() {
    if (this.audioBuffer.length === 0) return;
    
    const combinedBuffer = Buffer.concat(this.audioBuffer);
    this.audioBuffer = [];
    
    try {
      const transcript = await this.transcribe(combinedBuffer);
      if (transcript && this.onTranscript) {
        this.onTranscript(transcript, true);
      }
    } catch (error) {
      console.error('Whisper transcription error:', error);
    }
  }
  
  async transcribe(audioBuffer) {
    // Create form data with audio file
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    
    form.append('file', audioBuffer, {
      filename: 'audio.wav',
      contentType: 'audio/wav'
    });
    form.append('model', 'whisper-1');
    form.append('language', 'hi');
    form.append('response_format', 'text');
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        ...form.getHeaders()
      },
      body: form
    });
    
    if (!response.ok) {
      throw new Error(`Whisper API error: ${response.statusText}`);
    }
    
    return await response.text();
  }
  
  async close() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    
    // Process any remaining audio
    if (this.audioBuffer.length > 0) {
      await this.processBuffer();
    }
    
    this.isStreaming = false;
  }
  
  calculateCost(durationSeconds) {
    return (durationSeconds / 60) * this.pricePerMinute;
  }
}

// ============================================
// GOOGLE SPEECH-TO-TEXT PROVIDER
// ============================================

class GoogleSTT extends BaseSTT {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY;
    this.audioBuffer = [];
    this.onTranscript = null;
    
    // Pricing: $0.006/15 seconds
    this.pricePerMinute = 0.024;
  }
  
  async startStream(options) {
    const { onTranscript, sampleRate = 16000, language = 'hi-IN' } = options;
    this.onTranscript = onTranscript;
    this.sampleRate = sampleRate;
    this.language = language;
    this.isStreaming = true;
    this.audioBuffer = [];
    
    // Note: For production, use @google-cloud/speech with streaming
    // This is a simplified batch-based implementation
    this.processingInterval = setInterval(async () => {
      if (this.audioBuffer.length > 0) {
        await this.processBuffer();
      }
    }, 500);
  }
  
  async streamAudio(audioBuffer) {
    this.audioBuffer.push(audioBuffer);
  }
  
  async processBuffer() {
    if (this.audioBuffer.length === 0) return;
    
    const combinedBuffer = Buffer.concat(this.audioBuffer);
    this.audioBuffer = [];
    
    try {
      const transcript = await this.transcribe(combinedBuffer);
      if (transcript && this.onTranscript) {
        this.onTranscript(transcript, true);
      }
    } catch (error) {
      console.error('Google STT error:', error);
    }
  }
  
  async transcribe(audioBuffer) {
    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: this.sampleRate,
            languageCode: this.language,
            enableAutomaticPunctuation: true,
            model: 'default'
          },
          audio: {
            content: audioBuffer.toString('base64')
          }
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Google STT API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.results?.[0]?.alternatives?.[0]?.transcript || '';
  }
  
  async close() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    
    if (this.audioBuffer.length > 0) {
      await this.processBuffer();
    }
    
    this.isStreaming = false;
  }
  
  calculateCost(durationSeconds) {
    return (durationSeconds / 60) * this.pricePerMinute;
  }
}

// ============================================
// FACTORY
// ============================================

class STTFactory {
  static providers = {
    deepgram: DeepgramSTT,
    whisper: WhisperSTT,
    openai: WhisperSTT,
    google: GoogleSTT
  };
  
  static create(provider, config = {}) {
    const Provider = this.providers[provider?.toLowerCase()];
    
    if (!Provider) {
      console.warn(`Unknown STT provider: ${provider}, defaulting to Deepgram`);
      return new DeepgramSTT(config);
    }
    
    return new Provider(config);
  }
  
  static register(name, ProviderClass) {
    this.providers[name.toLowerCase()] = ProviderClass;
  }
}

module.exports = STTFactory;
