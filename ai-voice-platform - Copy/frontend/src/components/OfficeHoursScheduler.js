/**
 * OfficeHoursScheduler Component
 * Visual weekly scheduler for business hours
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Sun, Moon, Copy, Check } from 'lucide-react';

// Day configuration
const DAYS = [
  { key: 'monday', label: 'Mon', fullLabel: 'Monday' },
  { key: 'tuesday', label: 'Tue', fullLabel: 'Tuesday' },
  { key: 'wednesday', label: 'Wed', fullLabel: 'Wednesday' },
  { key: 'thursday', label: 'Thu', fullLabel: 'Thursday' },
  { key: 'friday', label: 'Fri', fullLabel: 'Friday' },
  { key: 'saturday', label: 'Sat', fullLabel: 'Saturday' },
  { key: 'sunday', label: 'Sun', fullLabel: 'Sunday' },
];

// Time presets
const TIME_PRESETS = [
  { label: '9-5', start: '09:00', end: '17:00' },
  { label: '9-6', start: '09:00', end: '18:00' },
  { label: '10-7', start: '10:00', end: '19:00' },
  { label: '24/7', start: '00:00', end: '23:59' },
];

// Day Row Component
const DayRow = ({ day, hours, onToggle, onChange, onCopy }) => {
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);
  
  const handleCopy = () => {
    onCopy(day.key);
    setShowCopyConfirm(true);
    setTimeout(() => setShowCopyConfirm(false), 2000);
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
        hours.enabled 
          ? 'bg-white/5 border border-white/10' 
          : 'bg-white/[0.02] opacity-60'
      }`}
    >
      {/* Day toggle button */}
      <button
        onClick={() => onToggle(day.key)}
        className={`w-14 h-14 rounded-xl font-semibold text-sm transition-all ${
          hours.enabled
            ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25'
            : 'bg-white/10 text-slate-500 hover:bg-white/20'
        }`}
      >
        {day.label}
      </button>
      
      {/* Time inputs or Closed label */}
      <div className="flex-1">
        {hours.enabled ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-400" />
              <input
                type="time"
                value={hours.start || '09:00'}
                onChange={(e) => onChange(day.key, { start: e.target.value })}
                className="input-field w-32 text-center py-2"
              />
            </div>
            <span className="text-slate-500">to</span>
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-indigo-400" />
              <input
                type="time"
                value={hours.end || '18:00'}
                onChange={(e) => onChange(day.key, { end: e.target.value })}
                className="input-field w-32 text-center py-2"
              />
            </div>
            
            {/* Copy to other days button */}
            <button
              onClick={handleCopy}
              className="ml-auto p-2 rounded-lg hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
              title="Copy to other days"
            >
              {showCopyConfirm ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        ) : (
          <span className="text-slate-500 flex items-center gap-2">
            <Moon className="w-4 h-4" />
            Closed
          </span>
        )}
      </div>
      
      {/* Visual time bar */}
      {hours.enabled && (
        <div className="hidden lg:block w-32">
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-purple-500 transition-all"
              style={{
                marginLeft: `${(parseInt(hours.start?.split(':')[0] || 9) / 24) * 100}%`,
                width: `${Math.max(0, ((parseInt(hours.end?.split(':')[0] || 18) - parseInt(hours.start?.split(':')[0] || 9)) / 24) * 100)}%`,
              }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1 text-center">
            {hours.start || '09:00'} - {hours.end || '18:00'}
          </p>
        </div>
      )}
    </motion.div>
  );
};

// Main Component
const OfficeHoursScheduler = ({ 
  businessHours = {}, 
  timezone = 'Asia/Kolkata',
  onUpdateHours,
  onToggleDay,
  onTimezoneChange,
}) => {
  const [activePreset, setActivePreset] = useState(null);
  
  // Apply preset to all enabled days
  const applyPreset = (preset) => {
    setActivePreset(preset.label);
    DAYS.forEach(day => {
      if (businessHours[day.key]?.enabled) {
        onUpdateHours(day.key, { start: preset.start, end: preset.end });
      }
    });
    setTimeout(() => setActivePreset(null), 1000);
  };
  
  // Copy hours to other days
  const copyToOtherDays = (sourceDay) => {
    const sourceHours = businessHours[sourceDay];
    if (!sourceHours) return;
    
    DAYS.forEach(day => {
      if (day.key !== sourceDay) {
        onUpdateHours(day.key, { 
          start: sourceHours.start, 
          end: sourceHours.end,
          enabled: sourceHours.enabled 
        });
      }
    });
  };
  
  // Count open days
  const openDays = DAYS.filter(d => businessHours[d.key]?.enabled).length;
  
  return (
    <div className="space-y-6">
      {/* Header with timezone and presets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-400" />
            Business Hours
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            {openDays} day{openDays !== 1 ? 's' : ''} open per week
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Timezone selector */}
          <select
            value={timezone}
            onChange={(e) => onTimezoneChange?.(e.target.value)}
            className="select-field text-sm py-2"
          >
            <option value="Asia/Kolkata">India (IST)</option>
            <option value="Asia/Dubai">Dubai (GST)</option>
            <option value="Asia/Singapore">Singapore (SGT)</option>
            <option value="America/New_York">New York (EST)</option>
            <option value="Europe/London">London (GMT)</option>
            <option value="America/Los_Angeles">Los Angeles (PST)</option>
          </select>
        </div>
      </div>
      
      {/* Quick presets */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-slate-500 py-1.5">Quick set:</span>
        {TIME_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => applyPreset(preset)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activePreset === preset.label
                ? 'bg-primary-500 text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      
      {/* Days list */}
      <div className="space-y-3">
        {DAYS.map((day) => (
          <DayRow
            key={day.key}
            day={day}
            hours={businessHours[day.key] || { start: '09:00', end: '18:00', enabled: false }}
            onToggle={onToggleDay}
            onChange={(dayKey, updates) => {
              onUpdateHours(dayKey, { ...businessHours[dayKey], ...updates });
            }}
            onCopy={copyToOtherDays}
          />
        ))}
      </div>
      
      {/* Visual week overview */}
      <div className="glass-card p-4">
        <p className="text-xs text-slate-500 mb-3">Weekly Overview</p>
        <div className="flex gap-1">
          {DAYS.map((day) => {
            const hours = businessHours[day.key];
            return (
              <div
                key={day.key}
                className="flex-1 text-center"
              >
                <div
                  className={`h-8 rounded-lg flex items-center justify-center text-xs font-medium ${
                    hours?.enabled
                      ? 'bg-gradient-to-b from-primary-500/30 to-primary-500/10 text-primary-300'
                      : 'bg-white/5 text-slate-600'
                  }`}
                >
                  {day.label}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Time scale */}
        <div className="flex justify-between text-xs text-slate-600 mt-2 px-1">
          <span>12am</span>
          <span>6am</span>
          <span>12pm</span>
          <span>6pm</span>
          <span>12am</span>
        </div>
      </div>
    </div>
  );
};

export default OfficeHoursScheduler;
