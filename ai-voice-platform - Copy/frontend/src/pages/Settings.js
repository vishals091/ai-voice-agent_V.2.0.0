/**
 * Settings Page - Enterprise Configuration
 * AI Providers, Office Hours Scheduler, Telephony Integration
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings as SettingsIcon,
  Bot,
  Phone,
  Clock,
  MessageSquare,
  Save,
  Loader2,
  ChevronDown,
  Play,
  Volume2,
  X,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import useSettingsStore from '../stores/settingsStore';
import toast from 'react-hot-toast';

// Tab definitions
const tabs = [
  { id: 'ai', label: 'AI Agent', icon: Bot },
  { id: 'telephony', label: 'Telephony', icon: Phone },
  { id: 'hours', label: 'Office Hours', icon: Clock },
  { id: 'escalation', label: 'Escalation', icon: MessageSquare },
];

// LLM Provider options
const llmProviders = [
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { id: 'anthropic', name: 'Anthropic', models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'] },
  { id: 'google', name: 'Google', models: ['gemini-1.5-pro', 'gemini-1.5-flash'] },
  { id: 'xai', name: 'xAI', models: ['grok-beta'] },
];

// TTS Voice options
const ttsVoices = {
  openai: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
  elevenlabs: ['rachel', 'josh', 'arnold', 'adam', 'sam'],
  google: ['hi-IN-Wavenet-A', 'hi-IN-Wavenet-B', 'hi-IN-Wavenet-C', 'hi-IN-Wavenet-D'],
};

// Owner title options
const ownerTitles = [
  { value: 'Manager', label: 'Manager' },
  { value: 'Boss', label: 'Boss' },
  { value: 'Owner', label: 'Owner' },
  { value: 'Director', label: 'Director' },
  { value: 'CEO', label: 'CEO' },
  { value: 'custom', label: 'Custom Name...' },
];

// Day names for scheduler
const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Office Hours Scheduler Component
const OfficeHoursScheduler = ({ businessHours, onChange, onToggleDay }) => {
  return (
    <div className="space-y-4">
      {dayNames.map((day, index) => {
        const hours = businessHours[day] || { start: '09:00', end: '18:00', enabled: false };
        
        return (
          <div 
            key={day} 
            className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
              hours.enabled ? 'bg-white/5' : 'bg-white/[0.02] opacity-60'
            }`}
          >
            {/* Day toggle */}
            <button
              onClick={() => onToggleDay(day)}
              className={`w-12 h-12 rounded-xl flex items-center justify-center font-semibold transition-all ${
                hours.enabled 
                  ? 'bg-primary-500 text-white' 
                  : 'bg-white/10 text-slate-500'
              }`}
            >
              {dayLabels[index]}
            </button>
            
            {/* Status */}
            <div className="flex-1 min-w-0">
              {hours.enabled ? (
                <div className="flex items-center gap-3">
                  <input
                    type="time"
                    value={hours.start || '09:00'}
                    onChange={(e) => onChange(day, { ...hours, start: e.target.value })}
                    className="input-field w-32 text-center"
                  />
                  <span className="text-slate-500">to</span>
                  <input
                    type="time"
                    value={hours.end || '18:00'}
                    onChange={(e) => onChange(day, { ...hours, end: e.target.value })}
                    className="input-field w-32 text-center"
                  />
                </div>
              ) : (
                <span className="text-slate-500">Closed</span>
              )}
            </div>
            
            {/* Visual indicator */}
            <div className="hidden sm:block w-32">
              {hours.enabled && (
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary-500 to-purple-500"
                    style={{
                      marginLeft: `${(parseInt(hours.start?.split(':')[0] || 9) / 24) * 100}%`,
                      width: `${((parseInt(hours.end?.split(':')[0] || 18) - parseInt(hours.start?.split(':')[0] || 9)) / 24) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Keyword Tags Component
const KeywordTags = ({ keywords, onAdd, onRemove }) => {
  const [input, setInput] = useState('');
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      onAdd(input.trim().toLowerCase());
      setInput('');
    }
  };
  
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {keywords.map((keyword) => (
          <span
            key={keyword}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-500/20 text-primary-300 rounded-lg text-sm"
          >
            {keyword}
            <button
              onClick={() => onRemove(keyword)}
              className="p-0.5 hover:bg-white/10 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type keyword and press Enter"
          className="input-field pr-10"
        />
        <Plus className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
      </div>
    </div>
  );
};

const Settings = () => {
  const [activeTab, setActiveTab] = useState('ai');
  const [customTitle, setCustomTitle] = useState('');
  const [showCustomTitle, setShowCustomTitle] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);
  
  const {
    settings,
    fetchSettings,
    updateSettings,
    updateBusinessHours,
    toggleDayEnabled,
    addEscalationKeyword,
    removeEscalationKeyword,
    saveSettings,
    testVoice,
    isLoading,
    isSaving,
    hasChanges,
  } = useSettingsStore();
  
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);
  
  const handleSave = async () => {
    const result = await saveSettings();
    if (result.success) {
      toast.success('Settings saved successfully!');
    }
  };
  
  const handleTestVoice = async () => {
    setTestingVoice(true);
    await testVoice();
    setTestingVoice(false);
  };
  
  const handleTitleChange = (value) => {
    if (value === 'custom') {
      setShowCustomTitle(true);
    } else {
      setShowCustomTitle(false);
      updateSettings({ owner_title: value });
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Settings</h1>
          <p className="text-slate-400 mt-1">Configure your AI voice agent</p>
        </div>
        
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={`btn-primary flex items-center gap-2 ${
            !hasChanges ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Changes
        </button>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-primary-500 text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="glass-card p-6"
        >
          {/* AI Agent Tab */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Agent Identity</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Agent Name</label>
                    <input
                      type="text"
                      value={settings.agent_name || ''}
                      onChange={(e) => updateSettings({ agent_name: e.target.value })}
                      className="input-field"
                      placeholder="AI Assistant"
                    />
                  </div>
                  <div>
                    <label className="label">Company Name</label>
                    <input
                      type="text"
                      value={settings.company_name || ''}
                      onChange={(e) => updateSettings({ company_name: e.target.value })}
                      className="input-field"
                      placeholder="Your Company"
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">AI Provider</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">LLM Provider</label>
                    <select
                      value={settings.llm_provider || 'openai'}
                      onChange={(e) => updateSettings({ llm_provider: e.target.value })}
                      className="select-field"
                    >
                      {llmProviders.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Model</label>
                    <select
                      value={settings.llm_model || 'gpt-4o-mini'}
                      onChange={(e) => updateSettings({ llm_model: e.target.value })}
                      className="select-field"
                    >
                      {(llmProviders.find(p => p.id === settings.llm_provider)?.models || []).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Voice Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">TTS Provider</label>
                    <select
                      value={settings.tts_provider || 'openai'}
                      onChange={(e) => updateSettings({ tts_provider: e.target.value })}
                      className="select-field"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="elevenlabs">ElevenLabs</option>
                      <option value="google">Google (Hindi voices)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Voice</label>
                    <div className="flex gap-2">
                      <select
                        value={settings.tts_voice || 'alloy'}
                        onChange={(e) => updateSettings({ tts_voice: e.target.value })}
                        className="select-field flex-1"
                      >
                        {(ttsVoices[settings.tts_provider] || ttsVoices.openai).map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleTestVoice}
                        disabled={testingVoice}
                        className="btn-secondary px-4"
                      >
                        {testingVoice ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="label">System Prompt (Hinglish Optimized)</label>
                <textarea
                  value={settings.system_prompt || ''}
                  onChange={(e) => updateSettings({ system_prompt: e.target.value })}
                  rows={4}
                  className="input-field resize-none"
                  placeholder="Aap ek helpful AI assistant hain..."
                />
                <p className="text-xs text-slate-500 mt-2">
                  Use {'{{owner_name}}'}, {'{{company_name}}'} as variables
                </p>
              </div>
            </div>
          )}
          
          {/* Telephony Tab */}
          {activeTab === 'telephony' && (
            <div className="space-y-6">
              <div className="flex items-start gap-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-300">Exotel Integration Required</h4>
                  <p className="text-sm text-amber-200/70 mt-1">
                    Configure your Exotel credentials in the backend .env file to enable telephony features.
                  </p>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Transfer Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="label">Transfer Number</label>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-xl">
                        <span className="text-lg">🇮🇳</span>
                        <span className="text-slate-400">+91</span>
                      </div>
                      <input
                        type="tel"
                        value={settings.transfer_number?.replace('+91', '') || ''}
                        onChange={(e) => updateSettings({ transfer_number: '+91' + e.target.value.replace(/\D/g, '') })}
                        className="input-field flex-1"
                        placeholder="9876543210"
                        maxLength={10}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Calls will be transferred to this number when escalated
                    </p>
                  </div>
                  
                  <div>
                    <label className="label">Owner Title (for introductions)</label>
                    <select
                      value={showCustomTitle ? 'custom' : (settings.owner_title || 'Manager')}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      className="select-field"
                    >
                      {ownerTitles.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    
                    <AnimatePresence>
                      {showCustomTitle && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3"
                        >
                          <input
                            type="text"
                            value={customTitle}
                            onChange={(e) => {
                              setCustomTitle(e.target.value);
                              updateSettings({ owner_title: e.target.value });
                            }}
                            className="input-field"
                            placeholder="Enter custom title (e.g., Pranay)"
                            autoFocus
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  <div>
                    <label className="label">Owner Name</label>
                    <input
                      type="text"
                      value={settings.owner_name || ''}
                      onChange={(e) => updateSettings({ owner_name: e.target.value })}
                      className="input-field"
                      placeholder="The name your AI will use for the owner"
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <label className="label">Holding Message</label>
                <textarea
                  value={settings.holding_persona || ''}
                  onChange={(e) => updateSettings({ holding_persona: e.target.value })}
                  rows={3}
                  className="input-field resize-none"
                  placeholder="Please hold, I am connecting you to our team..."
                />
              </div>
            </div>
          )}
          
          {/* Office Hours Tab */}
          {activeTab === 'hours' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">Business Hours</h3>
                  <p className="text-sm text-slate-400 mt-1">Set when your AI agent is available</p>
                </div>
                <div>
                  <label className="label mb-0">Timezone</label>
                  <select
                    value={settings.timezone || 'Asia/Kolkata'}
                    onChange={(e) => updateSettings({ timezone: e.target.value })}
                    className="select-field"
                  >
                    <option value="Asia/Kolkata">India (IST)</option>
                    <option value="Asia/Dubai">Dubai (GST)</option>
                    <option value="Asia/Singapore">Singapore (SGT)</option>
                    <option value="America/New_York">New York (EST)</option>
                    <option value="Europe/London">London (GMT)</option>
                  </select>
                </div>
              </div>
              
              <OfficeHoursScheduler
                businessHours={settings.business_hours || {}}
                onChange={(day, hours) => updateBusinessHours(day, hours)}
                onToggleDay={toggleDayEnabled}
              />
              
              <div>
                <label className="label">After-Hours Message</label>
                <textarea
                  value={settings.after_hours_message || ''}
                  onChange={(e) => updateSettings({ after_hours_message: e.target.value })}
                  rows={3}
                  className="input-field resize-none"
                  placeholder="Humari business hours Monday to Saturday 9 AM to 6 PM hain..."
                />
              </div>
            </div>
          )}
          
          {/* Escalation Tab */}
          {activeTab === 'escalation' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Escalation Keywords</h3>
                <p className="text-sm text-slate-400 mb-4">
                  When callers say these words, the AI will offer to transfer them to a human
                </p>
                <KeywordTags
                  keywords={settings.escalation_keywords || []}
                  onAdd={addEscalationKeyword}
                  onRemove={removeEscalationKeyword}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-white mb-2">Enable Features</h4>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.enable_barge_in !== false}
                        onChange={(e) => updateSettings({ enable_barge_in: e.target.checked })}
                        className="w-4 h-4 rounded border-white/20 bg-white/5 text-primary-500"
                      />
                      <span className="text-slate-300">Enable Barge-in (interrupt AI)</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.enable_semantic_cache !== false}
                        onChange={(e) => updateSettings({ enable_semantic_cache: e.target.checked })}
                        className="w-4 h-4 rounded border-white/20 bg-white/5 text-primary-500"
                      />
                      <span className="text-slate-300">Enable Semantic Caching</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.auto_transcribe !== false}
                        onChange={(e) => updateSettings({ auto_transcribe: e.target.checked })}
                        className="w-4 h-4 rounded border-white/20 bg-white/5 text-primary-500"
                      />
                      <span className="text-slate-300">Auto-transcribe recordings</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default Settings;
