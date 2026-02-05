/**
 * VoiceChat Page - Web-based Voice Agent Testing
 * Real-time voice interaction with AI agent
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  Send,
  Trash2,
  Settings,
  Loader2,
  MessageSquare,
  Bot,
  User,
  AlertCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import useVoiceStore from '../stores/voiceStore';
import toast from 'react-hot-toast';

// Message Bubble Component
const MessageBubble = ({ message }) => {
  const isUser = message.role === 'user';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser 
          ? 'bg-primary-500' 
          : 'bg-gradient-to-br from-emerald-500 to-cyan-500'
      }`}>
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>
      <div className={`max-w-[70%] ${isUser ? 'text-right' : ''}`}>
        <div className={`px-4 py-3 rounded-2xl ${
          isUser 
            ? 'bg-primary-500 text-white rounded-tr-sm' 
            : 'bg-white/10 text-white rounded-tl-sm'
        }`}>
          <p className="text-sm leading-relaxed">{message.content}</p>
        </div>
        <p className="text-xs text-slate-500 mt-1 px-2">
          {new Date(message.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </p>
      </div>
    </motion.div>
  );
};

// Sound Wave Visualizer
const SoundWave = ({ active }) => (
  <div className="flex items-center gap-1 h-8">
    {[...Array(5)].map((_, i) => (
      <motion.div
        key={i}
        animate={active ? {
          height: [8, 24, 8],
        } : { height: 8 }}
        transition={{
          duration: 0.5,
          repeat: active ? Infinity : 0,
          delay: i * 0.1,
        }}
        className="w-1 bg-primary-500 rounded-full"
      />
    ))}
  </div>
);

// Connection Status Badge
const ConnectionStatus = ({ isConnected, isConnecting }) => (
  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
    isConnected 
      ? 'bg-emerald-500/20 text-emerald-400' 
      : isConnecting
        ? 'bg-amber-500/20 text-amber-400'
        : 'bg-slate-500/20 text-slate-400'
  }`}>
    {isConnected ? (
      <>
        <Wifi className="w-3 h-3" />
        Connected
      </>
    ) : isConnecting ? (
      <>
        <Loader2 className="w-3 h-3 animate-spin" />
        Connecting...
      </>
    ) : (
      <>
        <WifiOff className="w-3 h-3" />
        Disconnected
      </>
    )}
  </div>
);

const VoiceChat = () => {
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const messagesEndRef = useRef(null);
  
  const {
    isConnected,
    isConnecting,
    isListening,
    isSpeaking,
    isProcessing,
    messages,
    currentTranscript,
    currentResponse,
    latency,
    tokensUsed,
    connect,
    disconnect,
    startListening,
    stopListening,
    sendTextMessage,
    clearConversation,
    interrupt,
    connectionError,
  } = useVoiceStore();
  
  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentTranscript, currentResponse]);
  
  // Handle connect/disconnect
  const handleToggleConnection = async () => {
    if (isConnected) {
      disconnect();
      toast.success('Disconnected from voice agent');
    } else {
      try {
        await connect();
        toast.success('Connected to voice agent');
      } catch (error) {
        toast.error('Failed to connect');
      }
    }
  };
  
  // Handle microphone toggle
  const handleToggleMic = async () => {
    if (isListening) {
      stopListening();
    } else {
      try {
        await startListening();
      } catch (error) {
        toast.error('Could not access microphone');
      }
    }
  };
  
  // Handle text message send
  const handleSendText = (e) => {
    e.preventDefault();
    if (!textInput.trim() || !isConnected) return;
    
    sendTextMessage(textInput);
    setTextInput('');
  };
  
  // Handle clear conversation
  const handleClear = () => {
    clearConversation();
    toast.success('Conversation cleared');
  };
  
  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Voice Agent</h1>
          <p className="text-slate-400 mt-1">Test your AI assistant in real-time</p>
        </div>
        
        <div className="flex items-center gap-3">
          <ConnectionStatus isConnected={isConnected} isConnecting={isConnecting} />
          
          <button
            onClick={handleClear}
            disabled={messages.length === 0}
            className="btn-ghost p-2"
            title="Clear conversation"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Main Chat Area */}
      <div className="flex-1 glass-card flex flex-col overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && !currentTranscript && !currentResponse ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4">
                  <Mic className="w-10 h-10 text-primary-400" />
                </div>
                <h3 className="text-xl font-display font-bold text-white mb-2">
                  Ready to Talk
                </h3>
                <p className="text-slate-400 mb-6">
                  Connect to start a conversation with your AI voice agent. 
                  You can speak or type your messages.
                </p>
                
                {connectionError && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl mb-4">
                    <div className="flex items-center gap-2 text-rose-400">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm">{connectionError}</span>
                    </div>
                  </div>
                )}
                
                <button
                  onClick={handleToggleConnection}
                  disabled={isConnecting}
                  className="btn-primary"
                >
                  {isConnecting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Phone className="w-5 h-5 mr-2" />
                      Connect
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              
              {/* Current transcript (user speaking) */}
              {currentTranscript && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-3 flex-row-reverse"
                >
                  <div className="w-8 h-8 rounded-full bg-primary-500/50 flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div className="max-w-[70%] text-right">
                    <div className="px-4 py-3 rounded-2xl bg-primary-500/50 text-white/80 rounded-tr-sm">
                      <p className="text-sm italic">{currentTranscript}...</p>
                    </div>
                  </div>
                </motion.div>
              )}
              
              {/* Current response (AI speaking) */}
              {currentResponse && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/50 to-cyan-500/50 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="max-w-[70%]">
                    <div className="px-4 py-3 rounded-2xl bg-white/5 text-white/80 rounded-tl-sm">
                      <p className="text-sm">{currentResponse}</p>
                      <SoundWave active={isSpeaking} />
                    </div>
                  </div>
                </motion.div>
              )}
              
              {/* Processing indicator */}
              {isProcessing && !currentResponse && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl bg-white/10 rounded-tl-sm">
                    <div className="flex gap-1">
                      {[...Array(3)].map((_, i) => (
                        <motion.div
                          key={i}
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                          className="w-2 h-2 bg-slate-400 rounded-full"
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
        
        {/* Controls */}
        <div className="border-t border-white/10 p-4">
          {/* Stats */}
          {isConnected && (latency || tokensUsed > 0) && (
            <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
              {latency && (
                <span>Latency: {latency}ms</span>
              )}
              {tokensUsed > 0 && (
                <span>Tokens: {tokensUsed}</span>
              )}
            </div>
          )}
          
          {/* Text input (toggle) */}
          <AnimatePresence>
            {showTextInput && isConnected && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleSendText}
                className="mb-4"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type a message..."
                    className="input-field flex-1"
                    disabled={!isConnected}
                  />
                  <button
                    type="submit"
                    disabled={!textInput.trim() || !isConnected}
                    className="btn-primary px-4"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
          
          {/* Main controls */}
          <div className="flex items-center justify-center gap-4">
            {/* Text toggle */}
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              disabled={!isConnected}
              className={`p-3 rounded-xl transition-all ${
                showTextInput 
                  ? 'bg-primary-500 text-white' 
                  : 'bg-white/10 text-slate-400 hover:bg-white/20'
              } disabled:opacity-50`}
              title="Toggle text input"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            
            {/* Mic button */}
            <button
              onClick={handleToggleMic}
              disabled={!isConnected}
              className={`relative p-6 rounded-full transition-all ${
                isListening 
                  ? 'bg-rose-500 text-white animate-pulse' 
                  : 'bg-primary-500 text-white hover:bg-primary-400'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isListening && (
                <motion.div
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute inset-0 rounded-full bg-rose-500"
                />
              )}
              {isListening ? (
                <MicOff className="w-8 h-8 relative z-10" />
              ) : (
                <Mic className="w-8 h-8 relative z-10" />
              )}
            </button>
            
            {/* Interrupt button (when AI is speaking) */}
            {isSpeaking && (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                onClick={interrupt}
                className="p-3 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                title="Interrupt AI"
              >
                <VolumeX className="w-5 h-5" />
              </motion.button>
            )}
            
            {/* Disconnect button */}
            {isConnected && (
              <button
                onClick={handleToggleConnection}
                className="p-3 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
                title="Disconnect"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            )}
          </div>
          
          {/* Instructions */}
          <p className="text-center text-xs text-slate-500 mt-4">
            {isConnected 
              ? isListening 
                ? 'Listening... Speak now or click to stop'
                : 'Click the microphone to start speaking'
              : 'Connect to start talking with your AI agent'
            }
          </p>
        </div>
      </div>
    </div>
  );
};

export default VoiceChat;
