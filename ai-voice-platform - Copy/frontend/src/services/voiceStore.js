import { create } from 'zustand';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:5000/ws/voice';

export const useVoiceStore = create((set, get) => ({
  // Connection state
  isConnected: false,
  socket: null,
  sessionId: null,
  
  // Voice state
  isListening: false,
  isProcessing: false,
  isSpeaking: false,
  
  // Messages
  messages: [],
  transcript: '',
  error: null,
  
  // Audio handling
  mediaRecorder: null,
  audioContext: null,
  audioQueue: [],
  isPlaying: false,

  // Connect to WebSocket
  connect: () => {
    const { socket } = get();
    if (socket?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      set({ isConnected: true, error: null });
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      set({ isConnected: false, socket: null, sessionId: null });
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      set({ error: 'Connection error. Please try again.' });
    };

    ws.onmessage = (event) => {
      try {
        // Check if it's binary audio data
        if (event.data instanceof Blob) {
          get().handleAudioChunk(event.data);
          return;
        }

        const data = JSON.parse(event.data);
        get().handleMessage(data);
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };

    set({ socket: ws });
  },

  // Disconnect from WebSocket
  disconnect: () => {
    const { socket, mediaRecorder } = get();
    
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop();
    }
    
    if (socket) {
      socket.close();
    }
    
    set({
      isConnected: false,
      socket: null,
      sessionId: null,
      isListening: false,
      isProcessing: false,
      isSpeaking: false,
      mediaRecorder: null
    });
  },

  // Handle incoming messages
  handleMessage: (data) => {
    const { type, payload } = data;

    switch (type) {
      case 'session_start':
        set({ sessionId: payload.sessionId });
        break;

      case 'transcript_interim':
        set({ transcript: payload.text });
        break;

      case 'transcript_final':
        set((state) => ({
          transcript: '',
          messages: [...state.messages, {
            role: 'user',
            text: payload.text,
            timestamp: new Date().toISOString()
          }]
        }));
        break;

      case 'llm_start':
        set({ isProcessing: true });
        break;

      case 'llm_chunk':
        // Update last AI message with streaming text
        set((state) => {
          const messages = [...state.messages];
          const lastMsg = messages[messages.length - 1];
          
          if (lastMsg?.role === 'assistant' && lastMsg.streaming) {
            lastMsg.text += payload.text;
          } else {
            messages.push({
              role: 'assistant',
              text: payload.text,
              timestamp: new Date().toISOString(),
              streaming: true
            });
          }
          
          return { messages };
        });
        break;

      case 'llm_complete':
        set((state) => {
          const messages = [...state.messages];
          const lastMsg = messages[messages.length - 1];
          if (lastMsg?.role === 'assistant') {
            lastMsg.streaming = false;
          }
          return { messages, isProcessing: false };
        });
        break;

      case 'tts_start':
        set({ isSpeaking: true });
        break;

      case 'tts_complete':
        set({ isSpeaking: false });
        break;

      case 'error':
        set({ error: payload.message, isProcessing: false, isSpeaking: false });
        break;

      default:
        console.log('Unknown message type:', type);
    }
  },

  // Handle incoming audio chunks
  handleAudioChunk: async (blob) => {
    const { audioQueue, isPlaying } = get();
    audioQueue.push(blob);
    
    if (!isPlaying) {
      get().playAudioQueue();
    }
  },

  // Play queued audio
  playAudioQueue: async () => {
    const { audioQueue } = get();
    
    if (audioQueue.length === 0) {
      set({ isPlaying: false });
      return;
    }

    set({ isPlaying: true });

    try {
      let audioContext = get().audioContext;
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        set({ audioContext });
      }

      // Resume if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const blob = audioQueue.shift();
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      source.onended = () => {
        get().playAudioQueue();
      };
      
      source.start(0);
    } catch (err) {
      console.error('Audio playback error:', err);
      set({ isPlaying: false });
      // Try next chunk
      get().playAudioQueue();
    }
  },

  // Start listening (microphone)
  startListening: async () => {
    const { socket, isConnected } = get();
    
    if (!isConnected || !socket) {
      set({ error: 'Not connected to server' });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Create AudioContext for resampling
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (get().isListening && socket.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Convert Float32 to Int16
          const int16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          socket.send(int16Data.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // Send start signal
      socket.send(JSON.stringify({ type: 'start_listening' }));

      set({
        isListening: true,
        mediaRecorder: { stream, audioContext, processor, source },
        error: null
      });
    } catch (err) {
      console.error('Microphone error:', err);
      set({ 
        error: err.name === 'NotAllowedError' 
          ? 'Microphone access denied. Please allow microphone access.'
          : 'Could not access microphone. Please check your settings.'
      });
    }
  },

  // Stop listening
  stopListening: () => {
    const { socket, mediaRecorder } = get();
    
    if (mediaRecorder) {
      const { stream, audioContext, processor, source } = mediaRecorder;
      
      source?.disconnect();
      processor?.disconnect();
      audioContext?.close();
      stream?.getTracks().forEach(track => track.stop());
    }

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'stop_listening' }));
    }

    set({ isListening: false, mediaRecorder: null });
  },

  // Clear messages
  clearMessages: () => {
    set({ messages: [], transcript: '', error: null });
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  }
}));
