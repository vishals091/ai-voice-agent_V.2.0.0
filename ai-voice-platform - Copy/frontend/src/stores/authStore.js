/**
 * Auth Store - Multi-Tenant Authentication
 * Handles JWT tokens, user session, and org context
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authAPI } from '../services/api';

// Decode JWT token (without verification - server handles that)
const decodeToken = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(window.atob(base64));
    return payload;
  } catch {
    return null;
  }
};

// Check if token is expired
const isTokenExpired = (token) => {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return true;
  return Date.now() >= decoded.exp * 1000;
};

const useAuthStore = create(
  persist(
    (set, get) => ({
      // State
      user: null,
      organization: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      
      // Initialize auth state from stored token
      initialize: async () => {
        const token = localStorage.getItem('auth_token');
        
        if (!token || isTokenExpired(token)) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('org_id');
          set({ 
            isLoading: false, 
            isAuthenticated: false,
            user: null,
            organization: null,
            token: null 
          });
          return false;
        }
        
        try {
          // Verify token with server and get fresh user data
          const { data } = await authAPI.me();
          
          set({
            user: data.user,
            organization: data.organization,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          
          // Store org_id for API requests
          localStorage.setItem('org_id', data.organization.id);
          
          return true;
        } catch (error) {
          // Token invalid
          localStorage.removeItem('auth_token');
          localStorage.removeItem('org_id');
          
          set({
            user: null,
            organization: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
          
          return false;
        }
      },
      
      // Login
      login: async (email, password) => {
        set({ isLoading: true, error: null });
        
        try {
          const { data } = await authAPI.login(email, password);
          
          // Store token
          localStorage.setItem('auth_token', data.token);
          localStorage.setItem('org_id', data.organization.id);
          
          set({
            user: data.user,
            organization: data.organization,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          
          return { success: true };
        } catch (error) {
          const message = error.response?.data?.error || 'Login failed';
          set({ isLoading: false, error: message });
          return { success: false, error: message };
        }
      },
      
      // Register (creates new organization)
      register: async (data) => {
        set({ isLoading: true, error: null });
        
        try {
          const { data: response } = await authAPI.register(data);
          
          // Auto-login after registration
          localStorage.setItem('auth_token', response.token);
          localStorage.setItem('org_id', response.organization.id);
          
          set({
            user: response.user,
            organization: response.organization,
            token: response.token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          
          return { success: true };
        } catch (error) {
          const message = error.response?.data?.error || 'Registration failed';
          set({ isLoading: false, error: message });
          return { success: false, error: message };
        }
      },
      
      // Logout
      logout: () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('org_id');
        
        set({
          user: null,
          organization: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      },
      
      // Forgot Password
      forgotPassword: async (email) => {
        set({ isLoading: true, error: null });
        
        try {
          await authAPI.forgotPassword(email);
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          const message = error.response?.data?.error || 'Failed to send reset email';
          set({ isLoading: false, error: message });
          return { success: false, error: message };
        }
      },
      
      // Reset Password
      resetPassword: async (token, password) => {
        set({ isLoading: true, error: null });
        
        try {
          await authAPI.resetPassword(token, password);
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          const message = error.response?.data?.error || 'Failed to reset password';
          set({ isLoading: false, error: message });
          return { success: false, error: message };
        }
      },
      
      // Update user profile
      updateProfile: async (data) => {
        try {
          const { data: response } = await authAPI.updateProfile(data);
          set({ user: response.user });
          return { success: true };
        } catch (error) {
          return { success: false, error: error.response?.data?.error };
        }
      },
      
      // Update organization info locally (after settings change)
      updateOrganization: (updates) => {
        set((state) => ({
          organization: { ...state.organization, ...updates }
        }));
      },
      
      // Check if user has specific role
      hasRole: (...roles) => {
        const { user } = get();
        return user && roles.includes(user.role);
      },
      
      // Check if user is owner or admin
      isAdmin: () => {
        const { user } = get();
        return user && ['owner', 'admin'].includes(user.role);
      },
      
      // Clear error
      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // Only persist these fields
        user: state.user,
        organization: state.organization,
      }),
    }
  )
);

export default useAuthStore;
