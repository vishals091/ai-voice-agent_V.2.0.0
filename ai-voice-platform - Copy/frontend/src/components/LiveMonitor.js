/**
 * LiveMonitor Component - Real-time Call Monitoring
 * Shows active calls with live sentiment and status
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone,
  PhoneIncoming,
  PhoneForwarded,
  Smile,
  Frown,
  Meh,
  Activity,
  Clock,
  Volume2,
  User,
} from 'lucide-react';

// Sentiment mapping
const sentimentConfig = {
  positive: { 
    icon: Smile, 
    color: 'text-emerald-400', 
    bg: 'bg-emerald-500/20',
    border: 'border-emerald-500/30',
    label: 'Happy'
  },
  neutral: { 
    icon: Meh, 
    color: 'text-amber-400', 
    bg: 'bg-amber-500/20',
    border: 'border-amber-500/30',
    label: 'Neutral'
  },
  negative: { 
    icon: Frown, 
    color: 'text-rose-400', 
    bg: 'bg-rose-500/20',
    border: 'border-rose-500/30',
    label: 'Frustrated'
  },
};

// Call status mapping
const statusConfig = {
  active: { label: 'Active', color: 'text-emerald-400', bg: 'bg-emerald-500' },
  ringing: { label: 'Ringing', color: 'text-amber-400', bg: 'bg-amber-500' },
  holding: { label: 'On Hold', color: 'text-blue-400', bg: 'bg-blue-500' },
  transferring: { label: 'Transferring', color: 'text-purple-400', bg: 'bg-purple-500' },
};

// Live Call Card
const LiveCallCard = ({ call }) => {
  const [duration, setDuration] = useState(0);
  
  useEffect(() => {
    const startTime = call.started_at ? new Date(call.started_at).getTime() : Date.now();
    
    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [call.started_at]);
  
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const sentiment = sentimentConfig[call.live_sentiment] || sentimentConfig.neutral;
  const status = statusConfig[call.status] || statusConfig.active;
  const SentimentIcon = sentiment.icon;
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -20 }}
      className={`glass-card p-4 border ${sentiment.border} relative overflow-hidden`}
    >
      {/* Live pulse indicator */}
      <div className="absolute top-3 right-3">
        <span className="relative flex h-3 w-3">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${status.bg} opacity-75`} />
          <span className={`relative inline-flex rounded-full h-3 w-3 ${status.bg}`} />
        </span>
      </div>
      
      {/* Caller Info */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center">
          <Phone className="w-5 h-5 text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white truncate">
            {call.caller_number || 'Unknown'}
          </p>
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-3 h-3 text-slate-500" />
            <span className="text-slate-400">{formatDuration(duration)}</span>
          </div>
        </div>
      </div>
      
      {/* Sentiment & Status */}
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center gap-2 px-2 py-1 rounded-full ${sentiment.bg}`}>
          <SentimentIcon className={`w-4 h-4 ${sentiment.color}`} />
          <span className={`text-xs font-medium ${sentiment.color}`}>
            {sentiment.label}
          </span>
        </div>
        <span className={`text-xs font-medium ${status.color}`}>
          {status.label}
        </span>
      </div>
      
      {/* Current Topic */}
      {call.current_topic && (
        <div className="p-2 bg-white/5 rounded-lg">
          <p className="text-xs text-slate-500 mb-1">Current Topic</p>
          <p className="text-sm text-slate-300 truncate">{call.current_topic}</p>
        </div>
      )}
      
      {/* AI Speaking indicator */}
      {call.ai_speaking && (
        <div className="mt-3 flex items-center gap-2 text-xs text-primary-400">
          <Volume2 className="w-3 h-3" />
          <span>AI speaking...</span>
          <div className="flex gap-0.5">
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                animate={{ height: [4, 12, 4] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                className="w-1 bg-primary-500 rounded-full"
              />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

// Empty State
const EmptyState = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="text-center py-8"
  >
    <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
      <PhoneIncoming className="w-8 h-8 text-slate-600" />
    </div>
    <p className="text-slate-500">No active calls</p>
    <p className="text-sm text-slate-600 mt-1">
      Calls will appear here in real-time
    </p>
  </motion.div>
);

// Main Component
const LiveMonitor = ({ calls = [], isLoading = false }) => {
  return (
    <div className="glass-card">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Activity className="w-5 h-5 text-emerald-400" />
              {calls.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
              )}
            </div>
            <h3 className="font-semibold text-white">
              Live Calls
            </h3>
          </div>
          
          {calls.length > 0 && (
            <span className="badge-success">
              {calls.length} active
            </span>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-white/10" />
                  <div className="flex-1">
                    <div className="h-4 w-24 bg-white/10 rounded mb-2" />
                    <div className="h-3 w-16 bg-white/5 rounded" />
                  </div>
                </div>
                <div className="h-8 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        ) : calls.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4">
            <AnimatePresence mode="popLayout">
              {calls.map((call) => (
                <LiveCallCard key={call.id || call.call_sid} call={call} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveMonitor;
