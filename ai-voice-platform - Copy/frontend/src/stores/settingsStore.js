/**
 * Settings Store - Enterprise Configuration Management
 * Handles AI providers, business hours, agent persona, and more
 */

import { create } from 'zustand';
import { settingsAPI } from '../services/api';
import toast from 'react-hot-toast';

const defaultSettings = {
  // AI Providers
  llm_provider: 'openai',
  llm_model: 'gpt-4o-mini',
  stt_provider: 'deepgram',
  stt_model: 'nova-2',
  tts_provider: 'openai',
  tts_voice: 'alloy',
  
  // Agent Persona
  agent_name: 'AI Assistant',
  owner_name: '',
  owner_title: '',
  company_name: '',
  
  // System Prompt
  system_prompt: 'Aap ek helpful AI assistant hain jo customers ki madad karte hain. Professional aur friendly rahein.',
  
  // Escalation
  transfer_number: '',
  escalation_keywords: ['manager', 'supervisor', 'human', 'agent', 'transfer'],
  holding_persona: 'Please hold, I am connecting you to our team.',
  
  // Business Hours
  business_hours: {
    monday: { start: '09:00', end: '18:00', enabled: true },
    tuesday: { start: '09:00', end: '18:00', enabled: true },
    wednesday: { start: '09:00', end: '18:00', enabled: true },
    thursday: { start: '09:00', end: '18:00', enabled: true },
    friday: { start: '09:00', end: '18:00', enabled: true },
    saturday: { start: '10:00', end: '14:00', enabled: true },
    sunday: { start: '10:00', end: '14:00', enabled: false },
  },
  timezone: 'Asia/Kolkata',
  after_hours_message: 'Humari business hours Monday to Saturday 9 AM to 6 PM hain.',
  
  // Features
  enable_semantic_cache: true,
  enable_barge_in: true,
  auto_transcribe: true,
  
  // Custom Variables
  custom_variables: {},
};

const useSettingsStore = create((set, get) => ({
  // State
  settings: defaultSettings,
  providers: null,
  isLoading: false,
  isSaving: false,
  hasChanges: false,
  lastSaved: null,
  error: null,
  
  // Fetch settings from server
  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const { data } = await settingsAPI.get();
      
      // Merge with defaults to ensure all fields exist
      const mergedSettings = {
        ...defaultSettings,
        ...data.settings,
        business_hours: {
          ...defaultSettings.business_hours,
          ...(data.settings?.business_hours || {}),
        },
      };
      
      set({ 
        settings: mergedSettings, 
        isLoading: false,
        hasChanges: false,
        lastSaved: new Date(),
      });
      
      return mergedSettings;
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error.response?.data?.error || 'Failed to load settings' 
      });
      throw error;
    }
  },
  
  // Fetch available AI providers
  fetchProviders: async () => {
    try {
      const { data } = await settingsAPI.getProviders();
      set({ providers: data.providers });
      return data.providers;
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    }
  },
  
  // Update local settings (optimistic)
  updateSettings: (updates) => {
    set((state) => ({
      settings: { ...state.settings, ...updates },
      hasChanges: true,
    }));
  },
  
  // Update nested settings (like business_hours)
  updateNestedSettings: (key, updates) => {
    set((state) => ({
      settings: {
        ...state.settings,
        [key]: { ...state.settings[key], ...updates },
      },
      hasChanges: true,
    }));
  },
  
  // Save settings to server
  saveSettings: async () => {
    const { settings } = get();
    set({ isSaving: true, error: null });
    
    try {
      await settingsAPI.update(settings);
      
      set({ 
        isSaving: false, 
        hasChanges: false,
        lastSaved: new Date(),
      });
      
      toast.success('Settings saved successfully');
      return { success: true };
    } catch (error) {
      set({ 
        isSaving: false, 
        error: error.response?.data?.error || 'Failed to save settings' 
      });
      toast.error('Failed to save settings');
      return { success: false, error: error.response?.data?.error };
    }
  },
  
  // Update and save specific field (for auto-save)
  updateAndSave: async (updates) => {
    const { settings } = get();
    const newSettings = { ...settings, ...updates };
    
    set({ settings: newSettings, isSaving: true });
    
    try {
      await settingsAPI.update(updates);
      set({ isSaving: false, hasChanges: false, lastSaved: new Date() });
      return { success: true };
    } catch (error) {
      // Rollback
      set({ settings, isSaving: false });
      toast.error('Failed to save');
      return { success: false };
    }
  },
  
  // Update business hours for specific day
  updateBusinessHours: (day, updates) => {
    set((state) => ({
      settings: {
        ...state.settings,
        business_hours: {
          ...state.settings.business_hours,
          [day]: { ...state.settings.business_hours[day], ...updates },
        },
      },
      hasChanges: true,
    }));
  },
  
  // Toggle day enabled/disabled
  toggleDayEnabled: (day) => {
    set((state) => ({
      settings: {
        ...state.settings,
        business_hours: {
          ...state.settings.business_hours,
          [day]: {
            ...state.settings.business_hours[day],
            enabled: !state.settings.business_hours[day]?.enabled,
          },
        },
      },
      hasChanges: true,
    }));
  },
  
  // Update escalation keywords
  updateEscalationKeywords: (keywords) => {
    set((state) => ({
      settings: {
        ...state.settings,
        escalation_keywords: keywords,
      },
      hasChanges: true,
    }));
  },
  
  // Add escalation keyword
  addEscalationKeyword: (keyword) => {
    set((state) => ({
      settings: {
        ...state.settings,
        escalation_keywords: [...state.settings.escalation_keywords, keyword],
      },
      hasChanges: true,
    }));
  },
  
  // Remove escalation keyword
  removeEscalationKeyword: (keyword) => {
    set((state) => ({
      settings: {
        ...state.settings,
        escalation_keywords: state.settings.escalation_keywords.filter(k => k !== keyword),
      },
      hasChanges: true,
    }));
  },
  
  // Test TTS voice
  testVoice: async (text) => {
    const { settings } = get();
    
    try {
      const response = await settingsAPI.testVoice(
        text || 'Namaste! Main aapki AI assistant hoon.',
        settings.tts_provider,
        settings.tts_voice
      );
      
      // Play audio
      const audioUrl = URL.createObjectURL(response.data);
      const audio = new Audio(audioUrl);
      await audio.play();
      
      return { success: true };
    } catch (error) {
      toast.error('Failed to test voice');
      return { success: false };
    }
  },
  
  // Reset to defaults
  resetToDefaults: () => {
    set({ settings: defaultSettings, hasChanges: true });
  },
  
  // Clear error
  clearError: () => set({ error: null }),
}));

export default useSettingsStore;
