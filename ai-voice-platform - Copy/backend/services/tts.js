/**
 * TTS (Text-to-Speech) Service with Factory Pattern
 * 
 * Supports:
 * - OpenAI TTS (alloy, echo, fable, onyx, nova, shimmer)
 * - ElevenLabs (High quality, multilingual)
 * - Google Cloud TTS
 * 
 * Easily switchable without rewriting core logic
 */

const { EventEmitter } = require('events');

// ============================================
// BASE TTS INTERFACE
// ============================================

class BaseTTS extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
  }
  
  async synthesize(text, options) {
    throw new Error('synthesize() must be implemented');
  }
  
  calculateCost(characterCount) {
    throw new Error('calculateCost() must be implemented');
  }
}

// ============================================
// OPENAI TTS PROVIDER
// ============================================

class OpenAITTS extends BaseTTS {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    
    // Available voices
    this.voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    
    // Pricing: $15/1M characters (tts-1), $30/1M characters (tts-1-hd)
    this.pricePerMillion = {
      'tts-1': 15,
      'tts-1-hd': 30
    };
  }
  
  async synthesize(text, options = {}) {
    const {
      voice = 'alloy',
      format = 'mp3',
      sampleRate = 24000,
      model = 'tts-1'
    } = options;
    
    // Map format to OpenAI response format
    const responseFormat = this.mapFormat(format);
    
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        response_format: responseFormat
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI TTS error: ${error.error?.message || response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  
  mapFormat(format) {
    const formatMap = {
      'mp3': 'mp3',
      'opus': 'opus',
      'aac': 'aac',
      'flac': 'flac',
      'wav': 'wav',
      'pcm': 'pcm',
      'mulaw': 'pcm' // Convert mulaw separately
    };
    return formatMap[format] || 'mp3';
  }
  
  calculateCost(characterCount, model = 'tts-1') {
    const pricePerMillion = this.pricePerMillion[model] || 15;
    return (characterCount / 1000000) * pricePerMillion;
  }
}

// ============================================
// ELEVENLABS TTS PROVIDER
// ============================================

class ElevenLabsTTS extends BaseTTS {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    
    // Default voice (Rachel - conversational)
    this.defaultVoice = '21m00Tcm4TlvDq8ikWAM';
    
    // Voice presets for Indian English/Hindi
    this.voicePresets = {
      'rachel': '21m00Tcm4TlvDq8ikWAM',
      'josh': 'TxGEqnHWrfWFTfGW9XjX',
      'arnold': 'VR6AewLTigWG4xSOukaG',
      'adam': 'pNInz6obpgDQGcFmaJgB',
      'sam': 'yoZ06aMxZJJ28mfd3POQ'
    };
    
    // Pricing: ~$0.30 per 1000 characters (varies by plan)
    this.pricePerThousand = 0.30;
  }
  
  async synthesize(text, options = {}) {
    const {
      voice = 'rachel',
      format = 'mp3',
      sampleRate = 24000,
      streaming = false
    } = options;
    
    const voiceId = this.voicePresets[voice] || voice;
    
    // Map format to output format
    const outputFormat = this.mapFormat(format, sampleRate);
    
    const endpoint = streaming 
      ? `/text-to-speech/${voiceId}/stream`
      : `/text-to-speech/${voiceId}`;
    
    const response = await fetch(`${this.baseUrl}${endpoint}?output_format=${outputFormat}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': this.apiKey
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`ElevenLabs TTS error: ${error.detail?.message || response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  
  mapFormat(format, sampleRate) {
    // ElevenLabs format string: mp3_44100_128, pcm_16000, etc.
    const formatMap = {
      'mp3': `mp3_${sampleRate}_128`,
      'pcm': `pcm_${sampleRate}`,
      'wav': `pcm_${sampleRate}`,
      'mulaw': 'ulaw_8000',
      'opus': 'opus_16000'
    };
    return formatMap[format] || 'mp3_22050_128';
  }
  
  async getVoices() {
    const response = await fetch(`${this.baseUrl}/voices`, {
      headers: {
        'xi-api-key': this.apiKey
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch voices');
    }
    
    const data = await response.json();
    return data.voices;
  }
  
  calculateCost(characterCount) {
    return (characterCount / 1000) * this.pricePerThousand;
  }
}

// ============================================
// GOOGLE CLOUD TTS PROVIDER
// ============================================

class GoogleTTS extends BaseTTS {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY;
    
    // Hindi voices
    this.voices = {
      'hi-IN-Standard-A': { gender: 'FEMALE', type: 'Standard' },
      'hi-IN-Standard-B': { gender: 'MALE', type: 'Standard' },
      'hi-IN-Standard-C': { gender: 'FEMALE', type: 'Standard' },
      'hi-IN-Standard-D': { gender: 'MALE', type: 'Standard' },
      'hi-IN-Wavenet-A': { gender: 'FEMALE', type: 'WaveNet' },
      'hi-IN-Wavenet-B': { gender: 'MALE', type: 'WaveNet' },
      'hi-IN-Wavenet-C': { gender: 'FEMALE', type: 'WaveNet' },
      'hi-IN-Wavenet-D': { gender: 'MALE', type: 'WaveNet' },
      'en-IN-Standard-A': { gender: 'FEMALE', type: 'Standard' },
      'en-IN-Standard-B': { gender: 'MALE', type: 'Standard' },
      'en-IN-Wavenet-A': { gender: 'FEMALE', type: 'WaveNet' },
      'en-IN-Wavenet-B': { gender: 'MALE', type: 'WaveNet' }
    };
    
    // Pricing per 1M characters
    this.pricing = {
      'Standard': 4.00,
      'WaveNet': 16.00,
      'Neural2': 16.00
    };
  }
  
  async synthesize(text, options = {}) {
    const {
      voice = 'hi-IN-Wavenet-A',
      format = 'mp3',
      sampleRate = 24000
    } = options;
    
    // Determine language code from voice name
    const languageCode = voice.split('-').slice(0, 2).join('-');
    
    // Map format to Google encoding
    const audioEncoding = this.mapFormat(format);
    
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode,
            name: voice
          },
          audioConfig: {
            audioEncoding,
            sampleRateHertz: sampleRate,
            speakingRate: 1.0,
            pitch: 0.0
          }
        })
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google TTS error: ${error.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    return Buffer.from(data.audioContent, 'base64');
  }
  
  mapFormat(format) {
    const formatMap = {
      'mp3': 'MP3',
      'wav': 'LINEAR16',
      'pcm': 'LINEAR16',
      'opus': 'OGG_OPUS',
      'mulaw': 'MULAW',
      'alaw': 'ALAW'
    };
    return formatMap[format] || 'MP3';
  }
  
  calculateCost(characterCount, voiceType = 'WaveNet') {
    const pricePerMillion = this.pricing[voiceType] || 16.00;
    return (characterCount / 1000000) * pricePerMillion;
  }
}

// ============================================
// MULAW CONVERTER (for Exotel compatibility)
// ============================================

class MuLawConverter {
  static pcmToMulaw(pcmBuffer) {
    // Convert 16-bit PCM to 8-bit μ-law
    const samples = new Int16Array(pcmBuffer.buffer);
    const mulaw = new Uint8Array(samples.length);
    
    for (let i = 0; i < samples.length; i++) {
      mulaw[i] = this.linearToMulaw(samples[i]);
    }
    
    return Buffer.from(mulaw);
  }
  
  static mulawToPcm(mulawBuffer) {
    // Convert 8-bit μ-law to 16-bit PCM
    const pcm = new Int16Array(mulawBuffer.length);
    
    for (let i = 0; i < mulawBuffer.length; i++) {
      pcm[i] = this.mulawToLinear(mulawBuffer[i]);
    }
    
    return Buffer.from(pcm.buffer);
  }
  
  static linearToMulaw(sample) {
    const BIAS = 0x84;
    const CLIP = 32635;
    const MULAW_MAX = 0x1FFF;
    
    const sign = (sample >> 8) & 0x80;
    if (sign !== 0) sample = -sample;
    if (sample > CLIP) sample = CLIP;
    sample = sample + BIAS;
    
    let exponent = 7;
    for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--, mask >>= 1);
    
    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    const mulaw = ~(sign | (exponent << 4) | mantissa);
    
    return mulaw & 0xFF;
  }
  
  static mulawToLinear(mulaw) {
    const BIAS = 0x84;
    
    mulaw = ~mulaw;
    const sign = mulaw & 0x80;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0F;
    
    let sample = ((mantissa << 3) + BIAS) << exponent;
    sample -= BIAS;
    
    return sign !== 0 ? -sample : sample;
  }
}

// ============================================
// FACTORY
// ============================================

class TTSFactory {
  static providers = {
    openai: OpenAITTS,
    elevenlabs: ElevenLabsTTS,
    google: GoogleTTS
  };
  
  static create(provider, config = {}) {
    const Provider = this.providers[provider?.toLowerCase()];
    
    if (!Provider) {
      console.warn(`Unknown TTS provider: ${provider}, defaulting to OpenAI`);
      return new OpenAITTS(config);
    }
    
    return new Provider(config);
  }
  
  static register(name, ProviderClass) {
    this.providers[name.toLowerCase()] = ProviderClass;
  }
  
  // Export MuLaw converter for Exotel compatibility
  static MuLawConverter = MuLawConverter;
}

module.exports = TTSFactory;
