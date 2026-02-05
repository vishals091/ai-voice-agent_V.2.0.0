/**
 * Analytics Store - Dashboard Metrics & Real-time Monitoring
 * Handles call analytics, cost tracking, and live call monitoring
 */

import { create } from 'zustand';
import { analyticsAPI } from '../services/api';

const useAnalyticsStore = create((set, get) => ({
  // Overview metrics
  overview: null,
  isLoadingOverview: false,
  
  // Daily breakdown
  dailyData: [],
  isLoadingDaily: false,
  
  // Recent calls
  recentCalls: [],
  isLoadingCalls: false,
  totalCalls: 0,
  
  // Cost savings
  costSavings: null,
  
  // Live calls (for Command Center)
  liveCalls: [],
  isLoadingLive: false,
  
  // Selected call detail
  selectedCall: null,
  
  // Polling interval for live data
  pollingInterval: null,
  
  // Fetch overview metrics
  fetchOverview: async (period = '30d') => {
    set({ isLoadingOverview: true });
    
    try {
      const { data } = await analyticsAPI.getOverview(period);
      set({ 
        overview: data,
        isLoadingOverview: false,
      });
      return data;
    } catch (error) {
      set({ isLoadingOverview: false });
      console.error('Failed to fetch overview:', error);
      throw error;
    }
  },
  
  // Fetch daily breakdown
  fetchDailyData: async (startDate, endDate) => {
    set({ isLoadingDaily: true });
    
    try {
      const { data } = await analyticsAPI.getDaily(startDate, endDate);
      set({ 
        dailyData: data.daily || [],
        isLoadingDaily: false,
      });
      return data.daily;
    } catch (error) {
      set({ isLoadingDaily: false });
      console.error('Failed to fetch daily data:', error);
      throw error;
    }
  },
  
  // Fetch recent calls
  fetchRecentCalls: async (params = {}) => {
    set({ isLoadingCalls: true });
    
    try {
      const { data } = await analyticsAPI.getCalls({
        limit: 20,
        offset: 0,
        ...params,
      });
      
      set({ 
        recentCalls: data.calls || [],
        totalCalls: data.total || 0,
        isLoadingCalls: false,
      });
      
      return data;
    } catch (error) {
      set({ isLoadingCalls: false });
      console.error('Failed to fetch calls:', error);
      throw error;
    }
  },
  
  // Load more calls (pagination)
  loadMoreCalls: async () => {
    const { recentCalls, totalCalls } = get();
    
    if (recentCalls.length >= totalCalls) return;
    
    try {
      const { data } = await analyticsAPI.getCalls({
        limit: 20,
        offset: recentCalls.length,
      });
      
      set({ 
        recentCalls: [...recentCalls, ...(data.calls || [])],
      });
    } catch (error) {
      console.error('Failed to load more calls:', error);
    }
  },
  
  // Fetch single call details
  fetchCallDetails: async (callId) => {
    try {
      const { data } = await analyticsAPI.getCall(callId);
      set({ selectedCall: data });
      return data;
    } catch (error) {
      console.error('Failed to fetch call details:', error);
      throw error;
    }
  },
  
  // Fetch cost savings data
  fetchCostSavings: async (period = '30d') => {
    try {
      const { data } = await analyticsAPI.getCostSavings(period);
      set({ costSavings: data });
      return data;
    } catch (error) {
      console.error('Failed to fetch cost savings:', error);
      throw error;
    }
  },
  
  // Fetch live calls
  fetchLiveCalls: async () => {
    set({ isLoadingLive: true });
    
    try {
      const { data } = await analyticsAPI.getLiveCalls();
      set({ 
        liveCalls: data.calls || [],
        isLoadingLive: false,
      });
      return data.calls;
    } catch (error) {
      set({ isLoadingLive: false });
      console.error('Failed to fetch live calls:', error);
      return [];
    }
  },
  
  // Start polling for live calls
  startLivePolling: (intervalMs = 5000) => {
    const { pollingInterval } = get();
    
    // Clear existing interval
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    
    // Initial fetch
    get().fetchLiveCalls();
    
    // Start polling
    const interval = setInterval(() => {
      get().fetchLiveCalls();
    }, intervalMs);
    
    set({ pollingInterval: interval });
  },
  
  // Stop polling
  stopLivePolling: () => {
    const { pollingInterval } = get();
    
    if (pollingInterval) {
      clearInterval(pollingInterval);
      set({ pollingInterval: null });
    }
  },
  
  // Clear selected call
  clearSelectedCall: () => set({ selectedCall: null }),
  
  // Calculate formatted metrics
  getFormattedMetrics: () => {
    const { overview, costSavings } = get();
    
    if (!overview) return null;
    
    return {
      totalCalls: overview.total_calls || 0,
      completedCalls: overview.completed_calls || 0,
      escalatedCalls: overview.escalated_calls || 0,
      avgDuration: formatDuration(overview.avg_duration_seconds),
      totalCost: formatCurrency(overview.total_cost_usd),
      costSaved: formatCurrency(costSavings?.total_savings_usd || 0),
      savingsPercentage: costSavings?.savings_percentage || 0,
      successRate: overview.total_calls 
        ? Math.round((overview.completed_calls / overview.total_calls) * 100)
        : 0,
    };
  },
}));

// Helper functions
function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatCurrency(amount) {
  if (typeof amount !== 'number') return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export default useAnalyticsStore;
