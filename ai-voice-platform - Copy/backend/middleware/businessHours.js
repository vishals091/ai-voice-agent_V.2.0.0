/**
 * Business Hours Middleware
 * Handles call routing based on organization business hours
 * Provides after-hours messaging and voicemail options
 */

const { getSettings } = require('../services/database');

/**
 * Default business hours (IST - Indian Standard Time)
 * Monday-Saturday: 9:00 AM - 6:00 PM
 */
const DEFAULT_BUSINESS_HOURS = {
  monday: { open: '09:00', close: '18:00', enabled: true },
  tuesday: { open: '09:00', close: '18:00', enabled: true },
  wednesday: { open: '09:00', close: '18:00', enabled: true },
  thursday: { open: '09:00', close: '18:00', enabled: true },
  friday: { open: '09:00', close: '18:00', enabled: true },
  saturday: { open: '09:00', close: '14:00', enabled: true },
  sunday: { open: '00:00', close: '00:00', enabled: false }
};

/**
 * Check if current time is within business hours
 * @param {object} businessHours - Hours configuration from settings
 * @param {string} timezone - IANA timezone (e.g., 'Asia/Kolkata')
 * @returns {object} { isOpen, nextOpenTime, message }
 */
function checkBusinessHours(businessHours, timezone = 'Asia/Kolkata') {
  const hours = businessHours || DEFAULT_BUSINESS_HOURS;
  
  // Get current time in organization's timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const dayName = parts.find(p => p.type === 'weekday').value.toLowerCase();
  const hour = parseInt(parts.find(p => p.type === 'hour').value);
  const minute = parseInt(parts.find(p => p.type === 'minute').value);
  const currentTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

  const todayHours = hours[dayName];

  // Check if business is open today
  if (!todayHours || !todayHours.enabled) {
    return {
      isOpen: false,
      reason: 'closed_today',
      nextOpenTime: findNextOpenTime(hours, dayName, timezone),
      currentDay: dayName,
      currentTime
    };
  }

  // Check if within operating hours
  const openTime = todayHours.open;
  const closeTime = todayHours.close;

  if (currentTime >= openTime && currentTime < closeTime) {
    return {
      isOpen: true,
      closesAt: closeTime,
      currentDay: dayName,
      currentTime
    };
  }

  // Before opening
  if (currentTime < openTime) {
    return {
      isOpen: false,
      reason: 'before_hours',
      opensAt: openTime,
      nextOpenTime: `Today at ${formatTime12h(openTime)}`,
      currentDay: dayName,
      currentTime
    };
  }

  // After closing
  return {
    isOpen: false,
    reason: 'after_hours',
    closedAt: closeTime,
    nextOpenTime: findNextOpenTime(hours, dayName, timezone),
    currentDay: dayName,
    currentTime
  };
}

/**
 * Find the next time business will be open
 */
function findNextOpenTime(hours, currentDay, timezone) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDayIndex = days.indexOf(currentDay);

  for (let i = 1; i <= 7; i++) {
    const nextDayIndex = (currentDayIndex + i) % 7;
    const nextDay = days[nextDayIndex];
    const nextDayHours = hours[nextDay];

    if (nextDayHours && nextDayHours.enabled) {
      const dayLabel = i === 1 ? 'Tomorrow' : capitalizeFirst(nextDay);
      return `${dayLabel} at ${formatTime12h(nextDayHours.open)}`;
    }
  }

  return 'Unknown';
}

/**
 * Format 24h time to 12h format
 */
function formatTime12h(time24) {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate after-hours message with variable substitution
 */
function generateAfterHoursMessage(template, variables) {
  const defaults = {
    company_name: 'our company',
    next_open_time: 'tomorrow',
    support_email: 'support@company.com',
    emergency_number: ''
  };

  const vars = { ...defaults, ...variables };
  let message = template || getDefaultAfterHoursMessage();

  // Replace all {{variable}} patterns
  Object.keys(vars).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    message = message.replace(regex, vars[key]);
  });

  return message;
}

/**
 * Default after-hours message (Hinglish optimized)
 */
function getDefaultAfterHoursMessage() {
  return `Namaste! Aap {{company_name}} ke automated assistant se baat kar rahe hain. 
Abhi humari office band hai. Hum {{next_open_time}} ko khulenge. 
Agar aapko urgent help chahiye, toh please ek voicemail chhod dijiye 
aur hum aapko jaldi se jaldi call back karenge. 
Aap hume email bhi kar sakte hain: {{support_email}}. 
Dhanyavaad aur aapka din shubh ho!`;
}

/**
 * Default voicemail prompt
 */
function getVoicemailPrompt() {
  return `Beep ke baad apna message record karein. 
Apna naam, phone number, aur message zaroor batayein. 
Recording khatam karne ke liye hash key (#) dabayein.`;
}

/**
 * Express middleware for HTTP routes
 * Checks business hours and returns appropriate response
 */
async function businessHoursMiddleware(req, res, next) {
  try {
    // Skip for certain routes
    const skipPaths = ['/api/auth', '/api/health', '/api/exotel/webhook'];
    if (skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Only check for call-related routes
    const callPaths = ['/api/calls/initiate', '/api/voice'];
    if (!callPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Get organization settings
    const orgId = req.orgId;
    if (!orgId) {
      return next();
    }

    const settings = await getSettings(orgId);
    
    // Check if business hours enforcement is enabled
    if (!settings.enforce_business_hours) {
      return next();
    }

    const status = checkBusinessHours(settings.business_hours, settings.timezone);
    req.businessHours = status;

    if (!status.isOpen) {
      // Attach after-hours context for call handlers
      req.isAfterHours = true;
      req.afterHoursMessage = generateAfterHoursMessage(settings.after_hours_message, {
        company_name: settings.company_name || req.org?.name,
        next_open_time: status.nextOpenTime,
        support_email: settings.support_email,
        emergency_number: settings.emergency_number
      });
    }

    next();
  } catch (error) {
    console.error('Business hours middleware error:', error);
    next(); // Continue even if check fails
  }
}

/**
 * WebSocket connection handler for business hours
 * Used by voice handlers to check hours at call start
 */
async function checkCallBusinessHours(orgId) {
  try {
    const settings = await getSettings(orgId);
    
    if (!settings.enforce_business_hours) {
      return { isOpen: true, enforced: false };
    }

    const status = checkBusinessHours(settings.business_hours, settings.timezone);
    
    if (!status.isOpen) {
      return {
        isOpen: false,
        enforced: true,
        afterHoursMessage: generateAfterHoursMessage(settings.after_hours_message, {
          company_name: settings.company_name,
          next_open_time: status.nextOpenTime,
          support_email: settings.support_email,
          emergency_number: settings.emergency_number
        }),
        voicemailPrompt: settings.enable_voicemail ? getVoicemailPrompt() : null,
        reason: status.reason,
        nextOpenTime: status.nextOpenTime
      };
    }

    return {
      isOpen: true,
      enforced: true,
      closesAt: status.closesAt
    };
  } catch (error) {
    console.error('Business hours check error:', error);
    return { isOpen: true, enforced: false, error: error.message };
  }
}

/**
 * Check if a specific datetime is within business hours
 * Useful for scheduling callbacks
 */
function isWithinBusinessHours(datetime, businessHours, timezone = 'Asia/Kolkata') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(datetime);
  const dayName = parts.find(p => p.type === 'weekday').value.toLowerCase();
  const hour = parseInt(parts.find(p => p.type === 'hour').value);
  const minute = parseInt(parts.find(p => p.type === 'minute').value);
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

  const hours = businessHours || DEFAULT_BUSINESS_HOURS;
  const dayHours = hours[dayName];

  if (!dayHours || !dayHours.enabled) {
    return false;
  }

  return timeStr >= dayHours.open && timeStr < dayHours.close;
}

/**
 * Get next available business time slot
 * @param {Date} fromDate - Starting datetime
 * @param {object} businessHours - Hours configuration
 * @param {string} timezone - IANA timezone
 * @returns {Date} Next available datetime
 */
function getNextBusinessTime(fromDate, businessHours, timezone = 'Asia/Kolkata') {
  const hours = businessHours || DEFAULT_BUSINESS_HOURS;
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  let checkDate = new Date(fromDate);
  
  for (let i = 0; i < 14; i++) { // Check up to 2 weeks
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    const parts = formatter.formatToParts(checkDate);
    const dayName = parts.find(p => p.type === 'weekday').value.toLowerCase();
    const dayHours = hours[dayName];
    
    if (dayHours && dayHours.enabled) {
      // Parse open time
      const [openHour, openMin] = dayHours.open.split(':').map(Number);
      
      // Create datetime in target timezone
      const result = new Date(checkDate);
      result.setHours(openHour, openMin, 0, 0);
      
      if (result > fromDate) {
        return result;
      }
    }
    
    // Move to next day
    checkDate.setDate(checkDate.getDate() + 1);
    checkDate.setHours(0, 0, 0, 0);
  }
  
  return null;
}

module.exports = {
  checkBusinessHours,
  businessHoursMiddleware,
  checkCallBusinessHours,
  generateAfterHoursMessage,
  getDefaultAfterHoursMessage,
  getVoicemailPrompt,
  isWithinBusinessHours,
  getNextBusinessTime,
  DEFAULT_BUSINESS_HOURS
};
