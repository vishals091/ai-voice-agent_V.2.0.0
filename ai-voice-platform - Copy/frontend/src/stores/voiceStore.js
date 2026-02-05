/**
 * Voice Store - Real-time Voice Session Management
 * Handles WebSocket connection, audio streaming, and conversation state
 */

import { create } from 'zustand';
import { createVoiceWebSocket } from '../services/api';
import toast from 'react-hot-toast';

const useVoiceStore = create((set, get) => ({
  // Connection State
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  websocket: null,
  
  // Session State
  sessionId: null,
  isListening: false,
  isSpeaking: false,
  isProcessing: false,
  
  // Audio State
  audioContext: null,
  mediaStream: null,
  audioWorklet: null,
  
  // Conversation
  messages: [],
  currentTranscript: '',
  currentResponse: '',
  
  // Metrics
  latency: null,
  tokensUsed: 0,
  
  // Connect to WebSocket
  connect: async () => {
    const { websocket } = get();
    
    if (websocket?.readyState === WebSocket.OPEN) {
      return true;
    }
    
    set({ isConnecting: true, connectionError: null });
    
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Not authenticated');
      }
      
      const ws = createVoiceWebSocket(token);
      
      return new Promise((resolve, reject) => {
        ws.onopen = () => {
          set({ 
            isConnected: true, 
            isConnecting: false, 
            websocket: ws,
            connectionError: null,
          });
          resolve(true);
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          set({ 
            isConnecting: false, 
            connectionError: 'Connection failed' 
          });
          reject(error);
        };
        
        ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          set({ 
            isConnected: false, 
            websocket: null,
            isListening: false,
            isSpeaking: false,
          });
          
          if (event.code !== 1000) {
            toast.error('Voice connection lost');
          }
        };
        
        ws.onmessage = (event) => {
          get().handleMessage(event);
        };
      });
    } catch (error) {
      set({ 
        isConnecting: false, 
        connectionError: error.message 
      });
      throw error;
    }
  },
  
  // Disconnect
  disconnect: () => {
    const { websocket, mediaStream, audioContext } = get();
    
    if (websocket) {
      websocket.close(1000, 'User disconnected');
    }
    
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
    }
    
    if (audioContext) {
      audioContext.close();
    }
    
    set({
      isConnected: false,
      websocket: null,
      mediaStream: null,
      audioContext: null,
      isListening: false,
      isSpeaking: false,
    });
  },
  
  // Handle incoming WebSocket message
  handleMessage: (event) => {
    // Check if binary audio data
    if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
      get().handleAudioData(event.data);
      return;
    }
    
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'session_start':
          set({ sessionId: data.sessionId });
          break;
          
        case 'transcript':
          // Real-time transcript from STT
          set({ 
            currentTranscript: data.text,
            isProcessing: data.is_final ? true : false,
          });
          
          if (data.is_final) {
            get().addMessage('user', data.text);
            set({ currentTranscript: '' });
          }
          break;
          
        case 'response_start':
          set({ isSpeaking: true, currentResponse: '' });
          break;
          
        case 'response_token':
          // Streaming LLM response
          set((state) => ({ 
            currentResponse: state.currentResponse + data.token 
          }));
          break;
          
        case 'response_end':
          const { currentResponse } = get();
          get().addMessage('assistant', currentResponse);
          set({ 
            currentResponse: '', 
            isSpeaking: false,
            isProcessing: false,
            latency: data.latency_ms,
            tokensUsed: (get().tokensUsed || 0) + (data.tokens || 0),
          });
          break;
          
        case 'audio':
          // Base64 audio chunk
          if (data.audio) {
            get().playAudioChunk(data.audio);
          }
          break;
          
        case 'error':
          console.error('Voice error:', data.message);
          toast.error(data.message || 'Voice processing error');
          set({ isProcessing: false, isSpeaking: false });
          break;
          
        case 'pong':
          // Heartbeat response
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  },
  
  // Handle binary audio data
  handleAudioData: async (data) => {
    const { audioContext } = get();
    
    if (!audioContext) return;
    
    try {
      const arrayBuffer = data instanceof Blob 
        ? await data.arrayBuffer() 
        : data;
        
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  },
  
  // Play base64 audio chunk
  playAudioChunk: (base64Audio) => {
    try {
      const audioData = atob(base64Audio);
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const view = new Uint8Array(arrayBuffer);
      
      for (let i = 0; i < audioData.length; i++) {
        view[i] = audioData.charCodeAt(i);
      }
      
      get().handleAudioData(arrayBuffer);
    } catch (error) {
      console.error('Failed to decode audio chunk:', error);
    }
  },
  
  // Start listening (microphone)
  startListening: async () => {
    const { websocket, isConnected } = get();
    
    if (!isConnected || !websocket) {
      await get().connect();
    }
    
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      });
      
      // Create audio context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });
      
      // Create audio worklet for processing
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        const { websocket, isListening } = get();
        
        if (!websocket || websocket.readyState !== WebSocket.OPEN || !isListening) {
          return;
        }
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert to 16-bit PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Send audio data
        websocket.send(pcmData.buffer);
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      set({ 
        isListening: true, 
        mediaStream: stream,
        audioContext,
      });
      
      // Send start command
      websocket.send(JSON.stringify({ type: 'start_listening' }));
      
    } catch (error) {
      console.error('Failed to start listening:', error);
      toast.error('Could not access microphone');
      throw error;
    }
  },
  
  // Stop listening
  stopListening: () => {
    const { websocket, mediaStream, audioContext } = get();
    
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
    }
    
    if (websocket?.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({ type: 'stop_listening' }));
    }
    
    set({ 
      isListening: false,
      mediaStream: null,
    });
  },
  
  // Add message to conversation
  addMessage: (role, content) => {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: Date.now(),
          role,
          content,
          timestamp: new Date().toISOString(),
        }
      ]
    }));
  },
  
  // Clear conversation
  clearConversation: () => {
    const { websocket } = get();
    
    if (websocket?.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({ type: 'clear_history' }));
    }
    
    set({ 
      messages: [],
      currentTranscript: '',
      currentResponse: '',
      tokensUsed: 0,
    });
  },
  
  // Send text message (for testing without mic)
  sendTextMessage: (text) => {
    const { websocket, isConnected } = get();
    
    if (!isConnected || !websocket) {
      toast.error('Not connected');
      return;
    }
    
    websocket.send(JSON.stringify({ 
      type: 'text_message',
      text 
    }));
    
    get().addMessage('user', text);
    set({ isProcessing: true });
  },
  
  // Interrupt AI (barge-in)
  interrupt: () => {
    const { websocket } = get();
    
    if (websocket?.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({ type: 'interrupt' }));
    }
    
    set({ 
      isSpeaking: false,
      currentResponse: '',
    });
  },
}));

export default useVoiceStore;
