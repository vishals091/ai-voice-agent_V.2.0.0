/**
 * Dashboard Page - Command Center
 * Real-time monitoring, live calls, and cost savings widget
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Phone,
  PhoneIncoming,
  PhoneOff,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  Smile,
  Frown,
  Meh,
  Users,
  Zap,
  ArrowRight,
  Mic,
  BookOpen,
  Settings,
  ExternalLink,
  Activity,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import useAnalyticsStore from '../stores/analyticsStore';
import useAuthStore from '../stores/authStore';

// Sentiment Icon Component
const SentimentIcon = ({ sentiment }) => {
  const icons = {
    positive: <Smile className="w-4 h-4 text-emerald-400" />,
    negative: <Frown className="w-4 h-4 text-rose-400" />,
    neutral: <Meh className="w-4 h-4 text-amber-400" />,
  };
  return icons[sentiment] || icons.neutral;
};

// Live Call Card Component
const LiveCallCard = ({ call }) => {
  const [duration, setDuration] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      if (call.started_at) {
        const elapsed = Math.floor((Date.now() - new Date(call.started_at).getTime()) / 1000);
        setDuration(elapsed);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [call.started_at]);
  
  const formatDuration = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card p-4 relative overflow-hidden"
    >
      {/* Live pulse indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="text-xs text-emerald-400 font-medium">Live</span>
      </div>
      
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center">
          <Phone className="w-5 h-5 text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {call.caller_number || 'Unknown Caller'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatDuration(duration)}
          </p>
        </div>
        <SentimentIcon sentiment={call.live_sentiment} />
      </div>
      
      {call.current_topic && (
        <div className="mt-3 px-2 py-1 bg-white/5 rounded-lg">
          <p className="text-xs text-slate-400 truncate">
            Topic: {call.current_topic}
          </p>
        </div>
      )}
    </motion.div>
  );
};

// Empty State for First-time Users
const EmptyState = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="glass-card p-8 text-center max-w-lg mx-auto"
  >
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4">
      <PhoneIncoming className="w-8 h-8 text-primary-400" />
    </div>
    <h3 className="text-xl font-display font-bold text-white mb-2">
      Welcome to VoiceAI!
    </h3>
    <p className="text-slate-400 mb-6">
      Get started by connecting your Exotel number and training your AI agent with your knowledge base.
    </p>
    
    <div className="space-y-3">
      <Link to="/settings" className="btn-primary w-full flex items-center justify-center gap-2">
        <Settings className="w-4 h-4" />
        Connect Exotel Number
      </Link>
      <Link to="/knowledge" className="btn-secondary w-full flex items-center justify-center gap-2">
        <BookOpen className="w-4 h-4" />
        Add Knowledge Base
      </Link>
    </div>
    
    <div className="mt-6 pt-6 border-t border-white/10">
      <a 
        href="https://exotel.com" 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-sm text-primary-400 hover:text-primary-300 inline-flex items-center gap-1"
      >
        Don't have an Exotel account? Get one here
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  </motion.div>
);

// Cost Savings Widget
const CostSavingsWidget = ({ savings }) => {
  const formatLargeNumber = (num) => {
    if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
    if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
    return `₹${num.toFixed(0)}`;
  };
  
  // Convert USD to INR (approximate)
  const inrSavings = (savings?.total_savings_usd || 0) * 83;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6 relative overflow-hidden"
    >
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10" />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-sm font-medium text-slate-400">Cost Saved</span>
          </div>
          <span className="badge-success">
            {savings?.savings_percentage || 0}% saved
          </span>
        </div>
        
        <div className="mb-4">
          <p className="text-4xl font-display font-bold text-white">
            {formatLargeNumber(inrSavings)}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            vs. human agent cost this month
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
          <div>
            <p className="text-xs text-slate-500">AI Cost</p>
            <p className="text-lg font-semibold text-white">
              ₹{((savings?.ai_cost_usd || 0) * 83).toFixed(0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Human Equivalent</p>
            <p className="text-lg font-semibold text-slate-400">
              ₹{((savings?.human_cost_usd || 0) * 83).toFixed(0)}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Stat Card Component
const StatCard = ({ icon: Icon, label, value, change, trend }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="glass-card p-6"
  >
    <div className="flex items-center justify-between mb-4">
      <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary-400" />
      </div>
      {change !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-medium ${
          trend === 'up' ? 'text-emerald-400' : 'text-rose-400'
        }`}>
          {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {change}%
        </div>
      )}
    </div>
    <p className="text-2xl font-display font-bold text-white">{value}</p>
    <p className="text-sm text-slate-500 mt-1">{label}</p>
  </motion.div>
);

const Dashboard = () => {
  const { organization } = useAuthStore();
  const { 
    overview, 
    dailyData, 
    liveCalls,
    costSavings,
    fetchOverview, 
    fetchDailyData,
    fetchLiveCalls,
    fetchCostSavings,
    startLivePolling,
    stopLivePolling,
    isLoadingOverview,
  } = useAnalyticsStore();
  
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  
  useEffect(() => {
    fetchOverview(selectedPeriod);
    fetchCostSavings(selectedPeriod);
    
    // Fetch daily data for last 30 days
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    fetchDailyData(startDate, endDate);
    
    // Start polling for live calls
    startLivePolling(10000);
    
    return () => stopLivePolling();
  }, [selectedPeriod]);
  
  const hasData = overview?.total_calls > 0;
  
  // Format chart data
  const chartData = dailyData.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    calls: d.total_calls,
    cost: d.total_cost_usd,
  }));
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">
            Command Center
          </h1>
          <p className="text-slate-400 mt-1">
            Real-time overview of your AI voice operations
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {['7d', '30d', '90d'].map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === period
                  ? 'bg-primary-500 text-white'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              {period === '7d' ? '7 Days' : period === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>
      
      {!hasData && !isLoadingOverview ? (
        <EmptyState />
      ) : (
        <>
          {/* Live Calls Section */}
          {liveCalls.length > 0 && (
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">
                    Live Calls ({liveCalls.length})
                  </h2>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {liveCalls.map((call) => (
                  <LiveCallCard key={call.id} call={call} />
                ))}
              </div>
            </div>
          )}
          
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Phone}
              label="Total Calls"
              value={overview?.total_calls?.toLocaleString() || '0'}
              change={overview?.calls_change_percent}
              trend={overview?.calls_change_percent >= 0 ? 'up' : 'down'}
            />
            <StatCard
              icon={Clock}
              label="Avg Duration"
              value={`${Math.floor((overview?.avg_duration_seconds || 0) / 60)}:${String(Math.floor((overview?.avg_duration_seconds || 0) % 60)).padStart(2, '0')}`}
            />
            <StatCard
              icon={PhoneOff}
              label="Escalated"
              value={overview?.escalated_calls?.toLocaleString() || '0'}
            />
            <StatCard
              icon={Users}
              label="Unique Callers"
              value={overview?.unique_callers?.toLocaleString() || '0'}
            />
          </div>
          
          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart */}
            <div className="lg:col-span-2 glass-card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Call Volume</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#64748B" 
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#64748B" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1E1B4B', 
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                      }}
                      labelStyle={{ color: '#94A3B8' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="calls" 
                      stroke="#6366F1" 
                      fillOpacity={1} 
                      fill="url(#colorCalls)" 
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Cost Savings Widget */}
            <CostSavingsWidget savings={costSavings} />
          </div>
          
          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link to="/voice" className="glass-card-hover p-6 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center">
                  <Mic className="w-6 h-6 text-primary-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Test Voice Agent</h3>
                  <p className="text-sm text-slate-500">Try your AI assistant</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-primary-400 group-hover:translate-x-1 transition-all" />
            </Link>
            
            <Link to="/knowledge" className="glass-card-hover p-6 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Knowledge Base</h3>
                  <p className="text-sm text-slate-500">Train your AI</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
            </Link>
            
            <Link to="/analytics" className="glass-card-hover p-6 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">View Analytics</h3>
                  <p className="text-sm text-slate-500">Deep dive into data</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
