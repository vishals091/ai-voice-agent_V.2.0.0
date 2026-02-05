import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from './api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Login
      login: async (email, password) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await api.post('/auth/login', { email, password });
          const { token, user } = response.data;
          
          // Set token in API defaults
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });
          
          return { success: true };
        } catch (err) {
          const message = err.response?.data?.error || 'Login failed. Please try again.';
          set({ isLoading: false, error: message });
          return { success: false, error: message };
        }
      },

      // Register
      register: async (name, email, password) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await api.post('/auth/register', { name, email, password });
          const { token, user } = response.data;
          
          // Set token in API defaults
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });
          
          return { success: true };
        } catch (err) {
          const message = err.response?.data?.error || 'Registration failed. Please try again.';
          set({ isLoading: false, error: message });
          return { success: false, error: message };
        }
      },

      // Logout
      logout: () => {
        delete api.defaults.headers.common['Authorization'];
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null
        });
      },

      // Check auth status on app load
      checkAuth: async () => {
        const { token } = get();
        
        if (!token) {
          set({ isAuthenticated: false });
          return;
        }

        // Set token in API defaults
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        try {
          const response = await api.get('/auth/me');
          set({ user: response.data.user, isAuthenticated: true });
        } catch (err) {
          // Token invalid, clear auth
          get().logout();
        }
      },

      // Update user profile
      updateProfile: async (data) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await api.put('/auth/profile', data);
          set({ user: response.data.user, isLoading: false });
          return { success: true };
        } catch (err) {
          const message = err.response?.data?.error || 'Update failed.';
          set({ isLoading: false, error: message });
          return { success: false, error: message };
        }
      },

      // Change password
      changePassword: async (currentPassword, newPassword) => {
        set({ isLoading: true, error: null });
        
        try {
          await api.put('/auth/password', { currentPassword, newPassword });
          set({ isLoading: false });
          return { success: true };
        } catch (err) {
          const message = err.response?.data?.error || 'Password change failed.';
          set({ isLoading: false, error: message });
          return { success: false, error: message };
        }
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user })
    }
  )
);
