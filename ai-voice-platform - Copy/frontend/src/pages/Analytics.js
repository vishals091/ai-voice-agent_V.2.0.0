/**
 * Analytics Page - Call Analytics & Insights
 * Detailed metrics, call history, and cost analysis
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Phone,
  Clock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  PhoneOff,
  Download,
  Calendar,
  Filter,
  ChevronDown,
  Play,
  Smile,
  Frown,
  Meh,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import useAnalyticsStore from '../stores/analyticsStore';
import { analyticsAPI } from '../services/api';
import toast from 'react-hot-toast';

// Sentiment mapping
const sentimentConfig = {
  positive: { icon: Smile, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  neutral: { icon: Meh, color: 'text-amber-400', bg: 'bg-amber-500/20' },
  negative: { icon: Frown, color: 'text-rose-400', bg: 'bg-rose-500/20' },
};

// Stat Card Component
const StatCard = ({ icon: Icon, label, value, change, trend, prefix = '', suffix = '' }) => (
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
          trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-rose-400' : 'text-slate-400'
        }`}>
          {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : 
           trend === 'down' ? <ArrowDownRight className="w-3 h-3" /> : null}
          {Math.abs(change)}%
        </div>
      )}
    </div>
    <p className="text-2xl font-display font-bold text-white">
      {prefix}{value}{suffix}
    </p>
    <p className="text-sm text-slate-500 mt-1">{label}</p>
  </motion.div>
);

// Call Row Component
const CallRow = ({ call, onSelect }) => {
  const sentiment = sentimentConfig[call.sentiment] || sentimentConfig.neutral;
  const SentimentIcon = sentiment.icon;
  
  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="table-row cursor-pointer"
      onClick={() => onSelect(call)}
    >
      <td className="table-cell">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center">
            <Phone className="w-4 h-4 text-primary-400" />
          </div>
          <div>
            <p className="font-medium text-white">{call.caller_number || 'Unknown'}</p>
            <p className="text-xs text-slate-500">
              {new Date(call.created_at).toLocaleString()}
            </p>
          </div>
        </div>
      </td>
      <td className="table-cell">
        <span className="text-slate-300">{formatDuration(call.duration_seconds)}</span>
      </td>
      <td className="table-cell">
        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${sentiment.bg}`}>
          <SentimentIcon className={`w-3 h-3 ${sentiment.color}`} />
          <span className={`text-xs font-medium ${sentiment.color}`}>
            {call.sentiment || 'neutral'}
          </span>
        </div>
      </td>
      <td className="table-cell">
        {call.was_escalated ? (
          <span className="badge-warning">Escalated</span>
        ) : (
          <span className="badge-success">Resolved</span>
        )}
      </td>
      <td className="table-cell text-right">
        <span className="text-slate-400">${(call.total_cost_usd || 0).toFixed(3)}</span>
      </td>
    </motion.tr>
  );
};

// Call Detail Modal
const CallDetailModal = ({ call, onClose }) => {
  if (!call) return null;
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-display font-bold text-white">Call Details</h2>
              <p className="text-sm text-slate-400">
                {call.caller_number} • {new Date(call.created_at).toLocaleString()}
              </p>
            </div>
            <button onClick={onClose} className="btn-ghost">Close</button>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">
                {Math.floor((call.duration_seconds || 0) / 60)}:{String(Math.floor((call.duration_seconds || 0) % 60)).padStart(2, '0')}
              </p>
              <p className="text-sm text-slate-500">Duration</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{call.total_tokens || 0}</p>
              <p className="text-sm text-slate-500">Tokens</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">${(call.total_cost_usd || 0).toFixed(3)}</p>
              <p className="text-sm text-slate-500">Cost</p>
            </div>
          </div>
          
          {/* Summary */}
          {call.summary && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2">AI Summary</h3>
              <p className="text-slate-300 p-4 bg-white/5 rounded-xl">{call.summary}</p>
            </div>
          )}
          
          {/* Transcript */}
          {call.transcript && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2">Transcript</h3>
              <div className="space-y-3 max-h-64 overflow-y-auto p-4 bg-white/5 rounded-xl">
                {call.transcript.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                      msg.role === 'user' 
                        ? 'bg-primary-500/20 text-white' 
                        : 'bg-white/10 text-slate-300'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Recording */}
          {call.recording_url && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2">Recording</h3>
              <audio controls className="w-full" src={call.recording_url}>
                Your browser does not support audio playback.
              </audio>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// Colors for pie chart
const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#F43F5E'];

const Analytics = () => {
  const {
    overview,
    dailyData,
    recentCalls,
    costSavings,
    fetchOverview,
    fetchDailyData,
    fetchRecentCalls,
    fetchCostSavings,
    isLoadingOverview,
    isLoadingCalls,
  } = useAnalyticsStore();
  
  const [period, setPeriod] = useState('30d');
  const [selectedCall, setSelectedCall] = useState(null);
  const [exporting, setExporting] = useState(false);
  
  useEffect(() => {
    fetchOverview(period);
    fetchCostSavings(period);
    fetchRecentCalls();
    
    // Calculate date range
    const endDate = new Date().toISOString().split('T')[0];
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    fetchDailyData(startDate, endDate);
  }, [period]);
  
  // Export report
  const handleExport = async (format) => {
    setExporting(true);
    try {
      const response = await analyticsAPI.exportReport(format, { period });
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-report-${period}.${format}`;
      a.click();
      toast.success('Report downloaded');
    } catch (error) {
      toast.error('Failed to export report');
    } finally {
      setExporting(false);
    }
  };
  
  // Prepare chart data
  const chartData = dailyData.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    calls: d.total_calls,
    cost: d.total_cost_usd,
    savings: d.cost_savings_usd,
  }));
  
  // Pie chart data for call outcomes
  const outcomeData = [
    { name: 'Resolved', value: (overview?.completed_calls || 0) - (overview?.escalated_calls || 0) },
    { name: 'Escalated', value: overview?.escalated_calls || 0 },
  ];
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Analytics</h1>
          <p className="text-slate-400 mt-1">Monitor your AI voice agent performance</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex bg-white/5 rounded-lg p-1">
            {['7d', '30d', '90d'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  period === p
                    ? 'bg-primary-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {p === '7d' ? '7D' : p === '30d' ? '30D' : '90D'}
              </button>
            ))}
          </div>
          
          {/* Export */}
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="btn-secondary"
          >
            {exporting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" />
                Export
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Stats Grid */}
      {isLoadingOverview ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card p-6 animate-pulse">
              <div className="h-10 w-10 bg-white/10 rounded-xl mb-4" />
              <div className="h-8 w-24 bg-white/10 rounded mb-2" />
              <div className="h-4 w-20 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      ) : (
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
            icon={DollarSign}
            label="Total Cost"
            value={(overview?.total_cost_usd || 0).toFixed(2)}
            prefix="$"
          />
          <StatCard
            icon={TrendingUp}
            label="Cost Saved"
            value={(costSavings?.total_savings_usd || 0).toFixed(0)}
            prefix="$"
            change={costSavings?.savings_percentage}
            trend="up"
          />
        </div>
      )}
      
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call Volume Chart */}
        <div className="lg:col-span-2 glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Call Volume & Costs</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="date" stroke="#64748B" fontSize={12} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E1B4B',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                  }}
                  labelStyle={{ color: '#94A3B8' }}
                />
                <Area
                  type="monotone"
                  dataKey="calls"
                  stroke="#6366F1"
                  fillOpacity={1}
                  fill="url(#colorCalls)"
                  strokeWidth={2}
                  name="Calls"
                />
                <Area
                  type="monotone"
                  dataKey="savings"
                  stroke="#10B981"
                  fillOpacity={1}
                  fill="url(#colorSavings)"
                  strokeWidth={2}
                  name="Savings ($)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Outcomes Pie Chart */}
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Call Outcomes</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={outcomeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {outcomeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className="text-slate-400 text-sm">{value}</span>}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E1B4B',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          {/* Success rate */}
          <div className="text-center mt-4 pt-4 border-t border-white/10">
            <p className="text-3xl font-display font-bold text-white">
              {overview?.total_calls 
                ? Math.round(((overview.completed_calls - overview.escalated_calls) / overview.total_calls) * 100)
                : 0}%
            </p>
            <p className="text-sm text-slate-500">Resolution Rate</p>
          </div>
        </div>
      </div>
      
      {/* Recent Calls Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <h3 className="text-lg font-semibold text-white">Recent Calls</h3>
        </div>
        
        {isLoadingCalls ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto" />
          </div>
        ) : recentCalls.length === 0 ? (
          <div className="p-12 text-center">
            <Phone className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No calls yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="table-cell text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Caller
                  </th>
                  <th className="table-cell text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="table-cell text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Sentiment
                  </th>
                  <th className="table-cell text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="table-cell text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((call) => (
                  <CallRow key={call.id} call={call} onSelect={setSelectedCall} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Call Detail Modal */}
      {selectedCall && (
        <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />
      )}
    </div>
  );
};

export default Analytics;
