/**
 * Settings Service
 * Manage application configuration
 */

const { getPool } = require('./database');

// Cache settings in memory
let settingsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Get all settings (with caching)
 */
async function getSettings() {
  const now = Date.now();
  
  // Return cached settings if still valid
  if (settingsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return settingsCache;
  }
  
  const pool = getPool();
  
  try {
    const result = await pool.query('SELECT key, value FROM settings');
    
    // Build settings object
    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    
    // Flatten common settings for easier access
    const flatSettings = {
      // LLM settings
      llmModel: settings.llm?.model || 'gpt-4o-mini',
      llmTemperature: settings.llm?.temperature || 0.7,
      llmMaxTokens: settings.llm?.maxTokens || 500,
      
      // STT settings
      sttModel: settings.stt?.model || 'nova-2',
      language: settings.stt?.language || 'en-IN',
      
      // TTS settings
      ttsModel: settings.tts?.model || 'tts-1',
      ttsVoice: settings.tts?.voice || 'alloy',
      ttsSpeed: settings.tts?.speed || 1.0,
      ttsProvider: settings.tts?.provider || 'openai',
      
      // System prompt
      systemPrompt: settings.system_prompt?.prompt || getDefaultSystemPrompt(),
      
      // Raw settings for full access
      raw: settings
    };
    
    // Update cache
    settingsCache = flatSettings;
    cacheTimestamp = now;
    
    return flatSettings;
  } catch (error) {
    console.error('Get settings error:', error);
    throw error;
  }
}

/**
 * Update a setting
 */
async function updateSetting(key, value) {
  const pool = getPool();
  
  try {
    await pool.query(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) 
      DO UPDATE SET value = $2, updated_at = NOW()
    `, [key, JSON.stringify(value)]);
    
    // Invalidate cache
    settingsCache = null;
    
    return true;
  } catch (error) {
    console.error('Update setting error:', error);
    throw error;
  }
}

/**
 * Update multiple settings at once
 */
async function updateSettings(settings) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const [key, value] of Object.entries(settings)) {
      await client.query(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) 
        DO UPDATE SET value = $2, updated_at = NOW()
      `, [key, JSON.stringify(value)]);
    }
    
    await client.query('COMMIT');
    
    // Invalidate cache
    settingsCache = null;
    
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update settings error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get a specific setting
 */
async function getSetting(key) {
  const pool = getPool();
  
  try {
    const result = await pool.query(
      'SELECT value FROM settings WHERE key = $1',
      [key]
    );
    
    return result.rows[0]?.value || null;
  } catch (error) {
    console.error('Get setting error:', error);
    throw error;
  }
}

/**
 * Delete a setting
 */
async function deleteSetting(key) {
  const pool = getPool();
  
  try {
    const result = await pool.query(
      'DELETE FROM settings WHERE key = $1 RETURNING key',
      [key]
    );
    
    // Invalidate cache
    settingsCache = null;
    
    return result.rowCount > 0;
  } catch (error) {
    console.error('Delete setting error:', error);
    throw error;
  }
}

/**
 * Reset settings to defaults
 */
async function resetSettings() {
  const pool = getPool();
  
  try {
    // Clear all settings
    await pool.query('DELETE FROM settings');
    
    // Insert defaults
    const defaults = getDefaultSettings();
    for (const [key, value] of Object.entries(defaults)) {
      await pool.query(`
        INSERT INTO settings (key, value)
        VALUES ($1, $2)
      `, [key, JSON.stringify(value)]);
    }
    
    // Invalidate cache
    settingsCache = null;
    
    return true;
  } catch (error) {
    console.error('Reset settings error:', error);
    throw error;
  }
}

/**
 * Get default settings
 */
function getDefaultSettings() {
  return {
    llm: {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 500
    },
    stt: {
      model: 'nova-2',
      language: 'en-IN'
    },
    tts: {
      model: 'tts-1',
      voice: 'alloy',
      speed: 1.0,
      provider: 'openai'
    },
    system_prompt: {
      prompt: getDefaultSystemPrompt()
    }
  };
}

/**
 * Get default system prompt
 */
function getDefaultSystemPrompt() {
  return `You are a helpful, friendly, and professional AI customer support agent. 

Key behaviors:
- Be concise and natural in your responses (this is a voice conversation)
- Keep responses brief (1-3 sentences typically) unless more detail is specifically needed
- Be warm and empathetic
- If you don't know something, say so honestly
- For complex issues, offer to explain step by step

Remember: This is a voice conversation, so keep your responses conversational and easy to understand when spoken aloud.`;
}

/**
 * Validate settings structure
 */
function validateSettings(settings) {
  const errors = [];
  
  if (settings.llm) {
    if (settings.llm.temperature !== undefined) {
      const temp = parseFloat(settings.llm.temperature);
      if (isNaN(temp) || temp < 0 || temp > 2) {
        errors.push('LLM temperature must be between 0 and 2');
      }
    }
    if (settings.llm.maxTokens !== undefined) {
      const tokens = parseInt(settings.llm.maxTokens);
      if (isNaN(tokens) || tokens < 1 || tokens > 4096) {
        errors.push('LLM maxTokens must be between 1 and 4096');
      }
    }
  }
  
  if (settings.tts) {
    if (settings.tts.speed !== undefined) {
      const speed = parseFloat(settings.tts.speed);
      if (isNaN(speed) || speed < 0.25 || speed > 4.0) {
        errors.push('TTS speed must be between 0.25 and 4.0');
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  getSettings,
  updateSetting,
  updateSettings,
  getSetting,
  deleteSetting,
  resetSettings,
  getDefaultSettings,
  validateSettings
};
