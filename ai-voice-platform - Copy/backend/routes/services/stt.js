/**
 * Speech-to-Text Service
 * Uses Deepgram for real-time streaming transcription
 * Also supports OpenAI Whisper for batch transcription
 */

const WebSocket = require('ws');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Create Deepgram real-time STT connection
 * @param {Object} options - Configuration options
 * @returns {WebSocket} Deepgram WebSocket connection
 */
async function createDeepgramSTT(options) {
  const {
    language = 'en-IN',
    model = 'nova-2',
    onInterimTranscript,
    onFinalTranscript,
    onError
  } = options;
  
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  
  if (!deepgramApiKey) {
    throw new Error('DEEPGRAM_API_KEY is required for real-time transcription');
  }
  
  // Deepgram WebSocket URL with parameters
  const wsUrl = new URL('wss://api.deepgram.com/v1/listen');
  
  // Set query parameters
  wsUrl.searchParams.set('model', model);
  wsUrl.searchParams.set('language', language);
  wsUrl.searchParams.set('punctuate', 'true');
  wsUrl.searchParams.set('interim_results', 'true');
  wsUrl.searchParams.set('endpointing', '300'); // 300ms silence = end of utterance
  wsUrl.searchParams.set('vad_events', 'true');
  wsUrl.searchParams.set('encoding', 'linear16');
  wsUrl.searchParams.set('sample_rate', '16000');
  wsUrl.searchParams.set('channels', '1');
  
  // For Hindi/Hinglish support
  if (language === 'hi' || language === 'hi-IN') {
    wsUrl.searchParams.set('model', 'nova-2');
    wsUrl.searchParams.set('language', 'hi');
  }
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl.toString(), {
      headers: {
        Authorization: `Token ${deepgramApiKey}`
      }
    });
    
    ws.on('open', () => {
      console.log('🎙️ Deepgram connection established');
      resolve(ws);
    });
    
    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        
        // Handle different response types
        if (response.type === 'Results') {
          const transcript = response.channel?.alternatives?.[0]?.transcript || '';
          
          if (transcript) {
            if (response.is_final) {
              // Final transcript - utterance complete
              if (onFinalTranscript) {
                onFinalTranscript(transcript);
              }
            } else {
              // Interim transcript - still speaking
              if (onInterimTranscript) {
                onInterimTranscript(transcript);
              }
            }
          }
        } else if (response.type === 'SpeechStarted') {
          console.log('Speech started detected');
        } else if (response.type === 'UtteranceEnd') {
          console.log('Utterance end detected');
        }
      } catch (error) {
        console.error('Error parsing Deepgram response:', error);
      }
    });
    
    ws.on('error', (error) => {
      console.error('Deepgram WebSocket error:', error);
      if (onError) onError(error);
      reject(error);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`Deepgram connection closed: ${code} - ${reason}`);
    });
  });
}

/**
 * Close Deepgram connection gracefully
 */
function closeDeepgramConnection(ws) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    // Send close frame to Deepgram
    ws.send(JSON.stringify({ type: 'CloseStream' }));
    ws.close();
  }
}

/**
 * Batch transcription using OpenAI Whisper
 * For processing recorded audio files
 */
async function transcribeWithWhisper(audioBuffer, options = {}) {
  const {
    language,
    prompt,
    responseFormat = 'json'
  } = options;
  
  try {
    // Create a File object from buffer
    const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });
    
    const response = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language,
      prompt,
      response_format: responseFormat
    });
    
    return {
      text: response.text || response,
      language: response.language
    };
  } catch (error) {
    console.error('Whisper transcription error:', error);
    throw error;
  }
}

/**
 * Detect language from audio sample
 */
async function detectLanguage(audioBuffer) {
  try {
    const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });
    
    const response = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json'
    });
    
    return response.language;
  } catch (error) {
    console.error('Language detection error:', error);
    return 'en';
  }
}

/**
 * Get supported languages
 */
function getSupportedLanguages() {
  return {
    deepgram: [
      { code: 'en', name: 'English' },
      { code: 'en-IN', name: 'English (India)' },
      { code: 'en-US', name: 'English (US)' },
      { code: 'en-GB', name: 'English (UK)' },
      { code: 'hi', name: 'Hindi' },
      { code: 'ta', name: 'Tamil' },
      { code: 'te', name: 'Telugu' },
      { code: 'bn', name: 'Bengali' },
      { code: 'mr', name: 'Marathi' },
      { code: 'gu', name: 'Gujarati' },
      { code: 'kn', name: 'Kannada' },
      { code: 'ml', name: 'Malayalam' },
      { code: 'pa', name: 'Punjabi' }
    ],
    whisper: [
      { code: 'en', name: 'English' },
      { code: 'hi', name: 'Hindi' },
      { code: 'ta', name: 'Tamil' },
      { code: 'te', name: 'Telugu' },
      { code: 'bn', name: 'Bengali' },
      { code: 'mr', name: 'Marathi' },
      { code: 'gu', name: 'Gujarati' }
    ]
  };
}

module.exports = {
  createDeepgramSTT,
  closeDeepgramConnection,
  transcribeWithWhisper,
  detectLanguage,
  getSupportedLanguages
};
