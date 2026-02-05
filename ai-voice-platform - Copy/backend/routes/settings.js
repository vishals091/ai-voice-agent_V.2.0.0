/**
 * Settings Routes
 * Organization settings, AI configuration, business hours
 */

const express = require('express');
const router = express.Router();
const { pool, getSettings, updateSettings } = require('../services/database');
const { tenantResolver, requireRole, clearOrgCache } = require('../middleware');

// Apply tenant resolver to all routes
router.use(tenantResolver);

/**
 * GET /api/settings
 * Get all settings for organization
 */
router.get('/', async (req, res) => {
  try {
    const settings = await getSettings(req.orgId);
    
    // Remove sensitive fields
    const safeSettings = { ...settings };
    delete safeSettings.id;
    delete safeSettings.org_id;

    res.json(safeSettings);

  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * PUT /api/settings
 * Update organization settings
 */
router.put('/',
  requireRole('owner', 'admin'),
  async (req, res) => {
    try {
      const allowedFields = [
        'agent_name',
        'owner_name',
        'owner_title',
        'company_name',
        'support_email',
        'system_prompt',
        'llm_provider',
        'llm_model',
        'tts_provider',
        'tts_voice',
        'stt_provider',
        'stt_model',
        'language',
        'transfer_number',
        'escalation_keywords',
        'enforce_business_hours',
        'business_hours',
        'timezone',
        'after_hours_message',
        'enable_voicemail',
        'holding_persona',
        'max_call_duration',
        'silence_timeout',
        'custom_variables',
        'greeting_message',
        'farewell_message'
      ];

      // Filter to only allowed fields
      const updates = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      // Validate certain fields
      if (updates.llm_provider) {
        const validProviders = ['openai', 'anthropic', 'google', 'xai'];
        if (!validProviders.includes(updates.llm_provider)) {
          return res.status(400).json({ 
            error: 'Invalid LLM provider',
            valid: validProviders 
          });
        }
      }

      if (updates.tts_provider) {
        const validProviders = ['openai', 'elevenlabs', 'google'];
        if (!validProviders.includes(updates.tts_provider)) {
          return res.status(400).json({ 
            error: 'Invalid TTS provider',
            valid: validProviders 
          });
        }
      }

      if (updates.stt_provider) {
        const validProviders = ['deepgram', 'openai', 'google'];
        if (!validProviders.includes(updates.stt_provider)) {
          return res.status(400).json({ 
            error: 'Invalid STT provider',
            valid: validProviders 
          });
        }
      }

      if (updates.max_call_duration && (updates.max_call_duration < 60 || updates.max_call_duration > 3600)) {
        return res.status(400).json({ 
          error: 'max_call_duration must be between 60 and 3600 seconds' 
        });
      }

      const result = await updateSettings(req.orgId, updates);
      clearOrgCache(req.orgId);

      res.json({
        message: 'Settings updated',
        settings: result
      });

    } catch (error) {
      console.error('Update settings error:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  }
);

/**
 * GET /api/settings/ai
 * Get AI-specific settings (LLM, TTS, STT)
 */
router.get('/ai', async (req, res) => {
  try {
    const settings = await getSettings(req.orgId);

    res.json({
      llm: {
        provider: settings.llm_provider,
        model: settings.llm_model
      },
      tts: {
        provider: settings.tts_provider,
        voice: settings.tts_voice
      },
      stt: {
        provider: settings.stt_provider,
        model: settings.stt_model,
        language: settings.language
      }
    });

  } catch (error) {
    console.error('Get AI settings error:', error);
    res.status(500).json({ error: 'Failed to fetch AI settings' });
  }
});

/**
 * PUT /api/settings/ai
 * Update AI configuration
 */
router.put('/ai',
  requireRole('owner', 'admin'),
  async (req, res) => {
    try {
      const { llm, tts, stt } = req.body;
      const updates = {};

      if (llm) {
        if (llm.provider) updates.llm_provider = llm.provider;
        if (llm.model) updates.llm_model = llm.model;
      }

      if (tts) {
        if (tts.provider) updates.tts_provider = tts.provider;
        if (tts.voice) updates.tts_voice = tts.voice;
      }

      if (stt) {
        if (stt.provider) updates.stt_provider = stt.provider;
        if (stt.model) updates.stt_model = stt.model;
        if (stt.language) updates.language = stt.language;
      }

      const result = await updateSettings(req.orgId, updates);

      res.json({
        message: 'AI settings updated',
        ai: {
          llm: {
            provider: result.llm_provider,
            model: result.llm_model
          },
          tts: {
            provider: result.tts_provider,
            voice: result.tts_voice
          },
          stt: {
            provider: result.stt_provider,
            model: result.stt_model,
            language: result.language
          }
        }
      });

    } catch (error) {
      console.error('Update AI settings error:', error);
      res.status(500).json({ error: 'Failed to update AI settings' });
    }
  }
);

/**
 * GET /api/settings/business-hours
 * Get business hours configuration
 */
router.get('/business-hours', async (req, res) => {
  try {
    const settings = await getSettings(req.orgId);

    res.json({
      enabled: settings.enforce_business_hours,
      timezone: settings.timezone,
      hours: settings.business_hours,
      afterHoursMessage: settings.after_hours_message,
      enableVoicemail: settings.enable_voicemail
    });

  } catch (error) {
    console.error('Get business hours error:', error);
    res.status(500).json({ error: 'Failed to fetch business hours' });
  }
});

/**
 * PUT /api/settings/business-hours
 * Update business hours
 */
router.put('/business-hours',
  requireRole('owner', 'admin'),
  async (req, res) => {
    try {
      const { 
        enabled, 
        timezone, 
        hours, 
        afterHoursMessage,
        enableVoicemail 
      } = req.body;

      const updates = {};

      if (enabled !== undefined) updates.enforce_business_hours = enabled;
      if (timezone) updates.timezone = timezone;
      if (hours) {
        // Validate hours structure
        const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        for (const day of validDays) {
          if (hours[day] && typeof hours[day] !== 'object') {
            return res.status(400).json({ 
              error: `Invalid hours format for ${day}` 
            });
          }
        }
        updates.business_hours = hours;
      }
      if (afterHoursMessage) updates.after_hours_message = afterHoursMessage;
      if (enableVoicemail !== undefined) updates.enable_voicemail = enableVoicemail;

      const result = await updateSettings(req.orgId, updates);

      res.json({
        message: 'Business hours updated',
        businessHours: {
          enabled: result.enforce_business_hours,
          timezone: result.timezone,
          hours: result.business_hours,
          afterHoursMessage: result.after_hours_message,
          enableVoicemail: result.enable_voicemail
        }
      });

    } catch (error) {
      console.error('Update business hours error:', error);
      res.status(500).json({ error: 'Failed to update business hours' });
    }
  }
);

/**
 * GET /api/settings/escalation
 * Get escalation settings
 */
router.get('/escalation', async (req, res) => {
  try {
    const settings = await getSettings(req.orgId);

    res.json({
      transferNumber: settings.transfer_number,
      keywords: settings.escalation_keywords,
      holdingPersona: settings.holding_persona
    });

  } catch (error) {
    console.error('Get escalation settings error:', error);
    res.status(500).json({ error: 'Failed to fetch escalation settings' });
  }
});

/**
 * PUT /api/settings/escalation
 * Update escalation configuration
 */
router.put('/escalation',
  requireRole('owner', 'admin'),
  async (req, res) => {
    try {
      const { transferNumber, keywords, holdingPersona } = req.body;
      const updates = {};

      if (transferNumber !== undefined) updates.transfer_number = transferNumber;
      if (keywords !== undefined) {
        if (!Array.isArray(keywords)) {
          return res.status(400).json({ 
            error: 'keywords must be an array' 
          });
        }
        updates.escalation_keywords = keywords;
      }
      if (holdingPersona !== undefined) updates.holding_persona = holdingPersona;

      const result = await updateSettings(req.orgId, updates);

      res.json({
        message: 'Escalation settings updated',
        escalation: {
          transferNumber: result.transfer_number,
          keywords: result.escalation_keywords,
          holdingPersona: result.holding_persona
        }
      });

    } catch (error) {
      console.error('Update escalation settings error:', error);
      res.status(500).json({ error: 'Failed to update escalation settings' });
    }
  }
);

/**
 * GET /api/settings/prompts
 * Get all prompt configurations
 */
router.get('/prompts', async (req, res) => {
  try {
    const settings = await getSettings(req.orgId);

    res.json({
      systemPrompt: settings.system_prompt,
      greetingMessage: settings.greeting_message,
      farewellMessage: settings.farewell_message,
      holdingPersona: settings.holding_persona,
      afterHoursMessage: settings.after_hours_message,
      customVariables: settings.custom_variables
    });

  } catch (error) {
    console.error('Get prompts error:', error);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

/**
 * PUT /api/settings/prompts
 * Update prompt configurations
 */
router.put('/prompts',
  requireRole('owner', 'admin'),
  async (req, res) => {
    try {
      const { 
        systemPrompt, 
        greetingMessage, 
        farewellMessage,
        holdingPersona,
        afterHoursMessage,
        customVariables 
      } = req.body;

      const updates = {};

      if (systemPrompt !== undefined) updates.system_prompt = systemPrompt;
      if (greetingMessage !== undefined) updates.greeting_message = greetingMessage;
      if (farewellMessage !== undefined) updates.farewell_message = farewellMessage;
      if (holdingPersona !== undefined) updates.holding_persona = holdingPersona;
      if (afterHoursMessage !== undefined) updates.after_hours_message = afterHoursMessage;
      if (customVariables !== undefined) {
        if (typeof customVariables !== 'object') {
          return res.status(400).json({ 
            error: 'customVariables must be an object' 
          });
        }
        updates.custom_variables = customVariables;
      }

      const result = await updateSettings(req.orgId, updates);

      res.json({
        message: 'Prompts updated',
        prompts: {
          systemPrompt: result.system_prompt,
          greetingMessage: result.greeting_message,
          farewellMessage: result.farewell_message,
          holdingPersona: result.holding_persona,
          afterHoursMessage: result.after_hours_message,
          customVariables: result.custom_variables
        }
      });

    } catch (error) {
      console.error('Update prompts error:', error);
      res.status(500).json({ error: 'Failed to update prompts' });
    }
  }
);

/**
 * POST /api/settings/test-prompt
 * Test system prompt with variable substitution
 */
router.post('/test-prompt', async (req, res) => {
  try {
    const { prompt, variables } = req.body;
    const settings = await getSettings(req.orgId);

    // Merge default variables with custom
    const allVariables = {
      agent_name: settings.agent_name,
      owner_name: settings.owner_name,
      owner_title: settings.owner_title,
      company_name: settings.company_name || req.org?.name,
      support_email: settings.support_email,
      ...settings.custom_variables,
      ...variables
    };

    // Substitute variables
    let processedPrompt = prompt || settings.system_prompt;
    Object.keys(allVariables).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processedPrompt = processedPrompt.replace(regex, allVariables[key] || '');
    });

    // Find unsubstituted variables
    const unsubstituted = processedPrompt.match(/{{[^}]+}}/g) || [];

    res.json({
      original: prompt || settings.system_prompt,
      processed: processedPrompt,
      variables: allVariables,
      unsubstituted
    });

  } catch (error) {
    console.error('Test prompt error:', error);
    res.status(500).json({ error: 'Failed to test prompt' });
  }
});

/**
 * GET /api/settings/providers
 * Get available AI providers and their options
 */
router.get('/providers', async (req, res) => {
  try {
    res.json({
      llm: {
        openai: {
          name: 'OpenAI',
          models: [
            { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast & affordable' }
          ]
        },
        anthropic: {
          name: 'Anthropic',
          models: [
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Best balance' },
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most capable' }
          ]
        },
        google: {
          name: 'Google',
          models: [
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Most capable' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast' }
          ]
        },
        xai: {
          name: 'xAI',
          models: [
            { id: 'grok-beta', name: 'Grok Beta', description: 'Real-time knowledge' }
          ]
        }
      },
      tts: {
        openai: {
          name: 'OpenAI',
          voices: [
            { id: 'alloy', name: 'Alloy', description: 'Neutral' },
            { id: 'echo', name: 'Echo', description: 'Male' },
            { id: 'fable', name: 'Fable', description: 'Expressive' },
            { id: 'onyx', name: 'Onyx', description: 'Deep male' },
            { id: 'nova', name: 'Nova', description: 'Female' },
            { id: 'shimmer', name: 'Shimmer', description: 'Soft female' }
          ]
        },
        elevenlabs: {
          name: 'ElevenLabs',
          voices: [
            { id: 'rachel', name: 'Rachel', description: 'Calm female' },
            { id: 'drew', name: 'Drew', description: 'Well-rounded male' },
            { id: 'clyde', name: 'Clyde', description: 'Middle-aged male' },
            { id: 'paul', name: 'Paul', description: 'Ground male news' }
          ]
        },
        google: {
          name: 'Google',
          voices: [
            { id: 'hi-IN-Wavenet-A', name: 'Hindi Female A', description: 'Hindi female' },
            { id: 'hi-IN-Wavenet-B', name: 'Hindi Male B', description: 'Hindi male' },
            { id: 'hi-IN-Wavenet-C', name: 'Hindi Male C', description: 'Hindi male alt' },
            { id: 'hi-IN-Wavenet-D', name: 'Hindi Female D', description: 'Hindi female alt' }
          ]
        }
      },
      stt: {
        deepgram: {
          name: 'Deepgram',
          models: [
            { id: 'nova-2', name: 'Nova 2', description: 'Best accuracy, low latency' },
            { id: 'nova', name: 'Nova', description: 'Good balance' },
            { id: 'enhanced', name: 'Enhanced', description: 'High accuracy' }
          ]
        },
        openai: {
          name: 'OpenAI Whisper',
          models: [
            { id: 'whisper-1', name: 'Whisper', description: 'High accuracy, batch' }
          ]
        },
        google: {
          name: 'Google Cloud',
          models: [
            { id: 'latest_long', name: 'Long', description: 'Best for long audio' },
            { id: 'latest_short', name: 'Short', description: 'Best for short audio' }
          ]
        }
      }
    });

  } catch (error) {
    console.error('Get providers error:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

module.exports = router;
