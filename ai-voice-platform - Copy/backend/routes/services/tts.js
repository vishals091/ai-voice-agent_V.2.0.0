/**
 * Text-to-Speech Service
 * Supports OpenAI TTS and ElevenLabs for voice synthesis
 * Includes streaming for real-time audio delivery
 */

const OpenAI = require('openai');
const axios = require('axios');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Stream TTS audio using OpenAI
 * @param {Object} options - TTS configuration
 */
async function streamTTS(options) {
  const {
    text,
    voice = 'alloy',
    model = 'tts-1',
    speed = 1.0,
    onAudioChunk,
    onComplete,
    provider = 'openai'
  } = options;
  
  if (!text || text.trim().length === 0) {
    if (onComplete) onComplete(0);
    return;
  }
  
  try {
    if (provider === 'elevenlabs' && process.env.ELEVENLABS_API_KEY) {
      await streamElevenLabsTTS(options);
    } else {
      await streamOpenAITTS(options);
    }
  } catch (error) {
    console.error('TTS error:', error);
    throw error;
  }
}

/**
 * Stream TTS using OpenAI
 */
async function streamOpenAITTS(options) {
  const {
    text,
    voice = 'alloy',
    model = 'tts-1',
    speed = 1.0,
    onAudioChunk,
    onComplete
  } = options;
  
  const startTime = Date.now();
  
  try {
    // OpenAI TTS returns a Response object with streaming body
    const response = await openai.audio.speech.create({
      model,
      voice,
      input: text,
      speed,
      response_format: 'mp3' // mp3 for browser compatibility
    });
    
    // Get the audio as a buffer
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    
    // For streaming, we'll chunk the buffer
    const chunkSize = 4096; // 4KB chunks for smooth streaming
    let offset = 0;
    
    while (offset < audioBuffer.length) {
      const chunk = audioBuffer.slice(offset, offset + chunkSize);
      if (onAudioChunk) {
        onAudioChunk(chunk);
      }
      offset += chunkSize;
      
      // Small delay to prevent overwhelming the WebSocket
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    const duration = (Date.now() - startTime) / 1000;
    if (onComplete) {
      onComplete(duration);
    }
    
  } catch (error) {
    console.error('OpenAI TTS error:', error);
    throw error;
  }
}

/**
 * Stream TTS using ElevenLabs
 * Better voice quality and more natural for Indian English
 */
async function streamElevenLabsTTS(options) {
  const {
    text,
    voice = 'pNInz6obpgDQGcFmaJgB', // Adam - default voice
    onAudioChunk,
    onComplete
  } = options;
  
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is required');
  }
  
  const startTime = Date.now();
  
  try {
    const response = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`,
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      data: {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true
        }
      },
      responseType: 'stream'
    });
    
    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        if (onAudioChunk) {
          onAudioChunk(chunk);
        }
      });
      
      response.data.on('end', () => {
        const duration = (Date.now() - startTime) / 1000;
        if (onComplete) {
          onComplete(duration);
        }
        resolve();
      });
      
      response.data.on('error', (error) => {
        reject(error);
      });
    });
    
  } catch (error) {
    console.error('ElevenLabs TTS error:', error);
    throw error;
  }
}

/**
 * Get audio buffer (non-streaming) - useful for pre-generating audio
 */
async function generateAudioBuffer(text, options = {}) {
  const {
    voice = 'alloy',
    model = 'tts-1',
    speed = 1.0
  } = options;
  
  try {
    const response = await openai.audio.speech.create({
      model,
      voice,
      input: text,
      speed,
      response_format: 'mp3'
    });
    
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error('Audio generation error:', error);
    throw error;
  }
}

/**
 * Get available voices
 */
function getAvailableVoices() {
  return {
    openai: [
      { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
      { id: 'echo', name: 'Echo', description: 'Warm and clear' },
      { id: 'fable', name: 'Fable', description: 'British accent' },
      { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
      { id: 'nova', name: 'Nova', description: 'Friendly and conversational' },
      { id: 'shimmer', name: 'Shimmer', description: 'Soft and gentle' }
    ],
    elevenlabs: [
      { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', description: 'Male, American' },
      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', description: 'Female, American' },
      { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', description: 'Male, American' },
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: 'Female, American' },
      { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', description: 'Female, American' },
      { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', description: 'Female, American' }
    ]
  };
}

/**
 * Get TTS models
 */
function getTTSModels() {
  return {
    openai: [
      { id: 'tts-1', name: 'TTS-1', description: 'Standard quality, low latency' },
      { id: 'tts-1-hd', name: 'TTS-1 HD', description: 'High quality, higher latency' }
    ]
  };
}

/**
 * Estimate audio duration from text
 * Useful for UI feedback
 */
function estimateAudioDuration(text, wordsPerMinute = 150) {
  const words = text.split(/\s+/).length;
  return (words / wordsPerMinute) * 60; // Returns seconds
}

module.exports = {
  streamTTS,
  generateAudioBuffer,
  getAvailableVoices,
  getTTSModels,
  estimateAudioDuration
};
