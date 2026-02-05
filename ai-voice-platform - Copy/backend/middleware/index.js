/**
 * Middleware Index
 * Exports all middleware for easy importing
 */


const { 
  tenantResolver, 
  requireRole, 
  checkCallLimit,
  incrementCallCount,
  resetMonthlyCallCounts,
  clearOrgCache,
  getOrganization
} = require('./tenantResolver');

const { 
  checkBusinessHours,
  businessHoursMiddleware,
  checkCallBusinessHours,
  generateAfterHoursMessage,
  getDefaultAfterHoursMessage,
  getVoicemailPrompt,
  isWithinBusinessHours,
  getNextBusinessTime,
  DEFAULT_BUSINESS_HOURS
} = require('./businessHours');

const {
  rateLimitMiddleware,
  apiRateLimiter,
  callRateLimiter,
  ipRateLimiter,
  WebSocketRateLimiter,
  trackCallStart,
  trackCallEnd,
  checkConcurrentCalls,
  getLimitsForPlan,
  cleanupRateLimitKeys,
  RATE_LIMITS
} = require('./rateLimiter');

module.exports = {
  // Tenant/Auth
  tenantResolver,
  requireRole,
  checkCallLimit,
  incrementCallCount,
  resetMonthlyCallCounts,
  clearOrgCache,
  getOrganization,

  // Business Hours
  checkBusinessHours,
  businessHoursMiddleware,
  checkCallBusinessHours,
  generateAfterHoursMessage,
  getDefaultAfterHoursMessage,
  getVoicemailPrompt,
  isWithinBusinessHours,
  getNextBusinessTime,
  DEFAULT_BUSINESS_HOURS,

  // Rate Limiting
  rateLimitMiddleware,
  apiRateLimiter,
  callRateLimiter,
  ipRateLimiter,
  WebSocketRateLimiter,
  trackCallStart,
  trackCallEnd,
  checkConcurrentCalls,
  getLimitsForPlan,
  cleanupRateLimitKeys,
  RATE_LIMITS
};
