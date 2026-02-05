/**
 * API Service - Enterprise Multi-Tenant
 * Handles all HTTP requests with JWT auth and org_id context
 */

import axios from 'axios';
import toast from 'react-hot-toast';

// Base URL - uses proxy in development
const API_BASE = process.env.REACT_APP_API_URL || '';

// Create axios instance
const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add org_id header if available (from decoded token)
    const orgId = localStorage.getItem('org_id');
    if (orgId) {
      config.headers['X-Org-ID'] = orgId;
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const { response } = error;
    
    if (response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('auth_token');
      localStorage.removeItem('org_id');
      localStorage.removeItem('user');
      
      // Redirect to login
      if (window.location.pathname !== '/login') {
        toast.error('Session expired. Please login again.');
        window.location.href = '/login';
      }
    }
    
    if (response?.status === 429) {
      toast.error('Rate limit exceeded. Please slow down.');
    }
    
    if (response?.status === 403) {
      toast.error('You don\'t have permission to perform this action.');
    }
    
    return Promise.reject(error);
  }
);

// ============================================
// AUTH ENDPOINTS
// ============================================

export const authAPI = {
  login: (email, password) => 
    api.post('/auth/login', { email, password }),
  
  register: (data) => 
    api.post('/auth/register', data),
  
  forgotPassword: (email) => 
    api.post('/auth/forgot-password', { email }),
  
  resetPassword: (token, password) => 
    api.post('/auth/reset-password', { token, password }),
  
  me: () => 
    api.get('/auth/me'),
  
  updateProfile: (data) => 
    api.put('/auth/profile', data),
  
  changePassword: (currentPassword, newPassword) => 
    api.put('/auth/password', { currentPassword, newPassword }),
};

// ============================================
// SETTINGS ENDPOINTS
// ============================================

export const settingsAPI = {
  get: () => 
    api.get('/settings'),
  
  update: (settings) => 
    api.put('/settings', settings),
  
  getProviders: () => 
    api.get('/settings/providers'),
  
  testVoice: (text, provider, voice) => 
    api.post('/settings/test-voice', { text, provider, voice }, { responseType: 'blob' }),
  
  testLLM: (prompt, provider, model) => 
    api.post('/settings/test-llm', { prompt, provider, model }),
};

// ============================================
// KNOWLEDGE BASE ENDPOINTS
// ============================================

export const knowledgeAPI = {
  list: (params = {}) => 
    api.get('/knowledge', { params }),
  
  get: (id) => 
    api.get(`/knowledge/${id}`),
  
  create: (data) => 
    api.post('/knowledge', data),
  
  update: (id, data) => 
    api.put(`/knowledge/${id}`, data),
  
  delete: (id) => 
    api.delete(`/knowledge/${id}`),
  
  search: (query, options = {}) => 
    api.post('/knowledge/search', { query, ...options }),
  
  bulkImport: (entries) => 
    api.post('/knowledge/bulk-import', { entries }),
  
  getCategories: () => 
    api.get('/knowledge/categories'),
};

// ============================================
// ANALYTICS ENDPOINTS
// ============================================

export const analyticsAPI = {
  getOverview: (period = '30d') => 
    api.get('/analytics/overview', { params: { period } }),
  
  getDaily: (startDate, endDate) => 
    api.get('/analytics/daily', { params: { startDate, endDate } }),
  
  getCalls: (params = {}) => 
    api.get('/analytics/calls', { params }),
  
  getCall: (id) => 
    api.get(`/analytics/calls/${id}`),
  
  getCostSavings: (period = '30d') => 
    api.get('/analytics/cost-savings', { params: { period } }),
  
  getLiveCalls: () => 
    api.get('/analytics/live'),
  
  exportReport: (format, params) => 
    api.get('/analytics/export', { params: { format, ...params }, responseType: 'blob' }),
};

// ============================================
// ORGANIZATION ENDPOINTS
// ============================================

export const organizationAPI = {
  get: () => 
    api.get('/organization'),
  
  update: (data) => 
    api.put('/organization', data),
  
  // Team
  getTeam: () => 
    api.get('/organization/team'),
  
  inviteMember: (email, role, name) => 
    api.post('/organization/team/invite', { email, role, name }),
  
  updateMemberRole: (userId, role) => 
    api.put(`/organization/team/${userId}/role`, { role }),
  
  removeMember: (userId) => 
    api.delete(`/organization/team/${userId}`),
  
  // API Keys
  getApiKeys: () => 
    api.get('/organization/api-keys'),
  
  createApiKey: (name) => 
    api.post('/organization/api-keys', { name }),
  
  revokeApiKey: (keyId) => 
    api.delete(`/organization/api-keys/${keyId}`),
  
  // Billing
  getBilling: () => 
    api.get('/organization/billing'),
  
  upgradePlan: (plan) => 
    api.post('/organization/billing/upgrade', { plan }),
  
  // Usage
  checkUsage: () => 
    api.get('/organization/usage-check'),
};

// ============================================
// EXOTEL ENDPOINTS
// ============================================

export const exotelAPI = {
  getStatus: () => 
    api.get('/exotel/status'),
  
  testConnection: () => 
    api.post('/exotel/test'),
  
  getCallContext: (callSid) => 
    api.get(`/exotel/context/${callSid}`),
};

// ============================================
// WEBSOCKET HELPERS
// ============================================

export const getWebSocketURL = (path) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = process.env.REACT_APP_WS_HOST || window.location.host;
  return `${protocol}//${host}${path}`;
};

export const createVoiceWebSocket = (token) => {
  const url = `${getWebSocketURL('/ws/voice')}?token=${token}`;
  return new WebSocket(url);
};

// ============================================
// OPTIMISTIC UPDATE HELPER
// ============================================

export const optimisticUpdate = async (
  updateFn, 
  rollbackFn, 
  successMessage = 'Saved successfully',
  errorMessage = 'Failed to save'
) => {
  // Optimistically update UI
  updateFn();
  
  try {
    // Attempt server update
    const result = await updateFn.serverCall?.();
    toast.success(successMessage);
    return result;
  } catch (error) {
    // Rollback on failure
    rollbackFn();
    toast.error(errorMessage);
    throw error;
  }
};

export default api;
