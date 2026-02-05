/**
 * LLM Service with Factory Pattern
 * 
 * Supports multiple providers:
 * - OpenAI (GPT-4o, GPT-4o-mini)
 * - Anthropic (Claude 3.5 Sonnet, Claude 3 Opus)
 * - Google (Gemini 1.5 Pro, Gemini 1.5 Flash)
 * - xAI (Grok)
 * 
 * Easily switchable without rewriting core logic
 */

const { EventEmitter } = require('events');

// ============================================
// BASE LLM INTERFACE
// ============================================

class BaseLLM {
  constructor(config = {}) {
    this.config = config;
  }
  
  async complete(options) {
    throw new Error('complete() must be implemented');
  }
  
  async streamComplete(options) {
    throw new Error('streamComplete() must be implemented');
  }
  
  calculateCost(tokens) {
    throw new Error('calculateCost() must be implemented');
  }
}

// ============================================
// OPENAI PROVIDER
// ============================================

class OpenAILLM extends BaseLLM {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    
    // Pricing per 1M tokens (as of 2024)
    this.pricing = {
      'gpt-4o': { input: 5.00, output: 15.00 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'gpt-4-turbo': { input: 10.00, output: 30.00 },
      'gpt-3.5-turbo': { input: 0.50, output: 1.50 }
    };
  }
  
  async complete(options) {
    const { model = 'gpt-4o-mini', messages, maxTokens = 1000, temperature = 0.7 } = options;
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }
  
  async streamComplete(options) {
    const { model = 'gpt-4o-mini', messages, maxTokens = 1000, temperature = 0.7, onToken } = options;
    
    let cancelled = false;
    
    const streamObj = {
      cancel: () => { cancelled = true; }
    };
    
    // Start streaming in background
    (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream: true
          })
        });
        
        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.statusText}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                const token = parsed.choices[0]?.delta?.content;
                if (token && onToken) {
                  const shouldContinue = await onToken(token);
                  if (shouldContinue === false) {
                    cancelled = true;
                    break;
                  }
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
        
        reader.cancel();
      } catch (error) {
        console.error('OpenAI stream error:', error);
      }
    })();
    
    return streamObj;
  }
  
  calculateCost(tokens, model = 'gpt-4o-mini') {
    const pricing = this.pricing[model] || this.pricing['gpt-4o-mini'];
    // Estimate 70% output tokens
    const inputTokens = tokens * 0.3;
    const outputTokens = tokens * 0.7;
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000000;
  }
}

// ============================================
// ANTHROPIC PROVIDER
// ============================================

class AnthropicLLM extends BaseLLM {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
    
    // Pricing per 1M tokens
    this.pricing = {
      'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
      'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
      'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 }
    };
  }
  
  async complete(options) {
    const { model = 'claude-3-5-sonnet-20241022', messages, maxTokens = 1000, temperature = 0.7 } = options;
    
    // Convert messages format (Anthropic uses 'system' differently)
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const otherMessages = messages.filter(m => m.role !== 'system');
    
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemMessage,
        messages: otherMessages,
        temperature
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    return data.content[0]?.text || '';
  }
  
  async streamComplete(options) {
    const { model = 'claude-3-5-sonnet-20241022', messages, maxTokens = 1000, temperature = 0.7, onToken } = options;
    
    let cancelled = false;
    
    const streamObj = {
      cancel: () => { cancelled = true; }
    };
    
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const otherMessages = messages.filter(m => m.role !== 'system');
    
    (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system: systemMessage,
            messages: otherMessages,
            temperature,
            stream: true
          })
        });
        
        if (!response.ok) {
          throw new Error(`Anthropic API error: ${response.statusText}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'content_block_delta') {
                  const token = data.delta?.text;
                  if (token && onToken) {
                    const shouldContinue = await onToken(token);
                    if (shouldContinue === false) {
                      cancelled = true;
                      break;
                    }
                  }
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
        
        reader.cancel();
      } catch (error) {
        console.error('Anthropic stream error:', error);
      }
    })();
    
    return streamObj;
  }
  
  calculateCost(tokens, model = 'claude-3-5-sonnet-20241022') {
    const pricing = this.pricing[model] || this.pricing['claude-3-5-sonnet-20241022'];
    const inputTokens = tokens * 0.3;
    const outputTokens = tokens * 0.7;
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000000;
  }
}

// ============================================
// GOOGLE GEMINI PROVIDER
// ============================================

class GeminiLLM extends BaseLLM {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    
    // Pricing per 1M tokens
    this.pricing = {
      'gemini-1.5-pro': { input: 3.50, output: 10.50 },
      'gemini-1.5-flash': { input: 0.075, output: 0.30 },
      'gemini-pro': { input: 0.50, output: 1.50 }
    };
  }
  
  async complete(options) {
    const { model = 'gemini-1.5-flash', messages, maxTokens = 1000, temperature = 0.7 } = options;
    
    // Convert to Gemini format
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    
    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature
          }
        })
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    return data.candidates[0]?.content?.parts[0]?.text || '';
  }
  
  async streamComplete(options) {
    const { model = 'gemini-1.5-flash', messages, maxTokens = 1000, temperature = 0.7, onToken } = options;
    
    let cancelled = false;
    
    const streamObj = {
      cancel: () => { cancelled = true; }
    };
    
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    
    (async () => {
      try {
        const response = await fetch(
          `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              generationConfig: {
                maxOutputTokens: maxTokens,
                temperature
              }
            })
          }
        );
        
        if (!response.ok) {
          throw new Error(`Gemini API error: ${response.statusText}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                const token = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (token && onToken) {
                  const shouldContinue = await onToken(token);
                  if (shouldContinue === false) {
                    cancelled = true;
                    break;
                  }
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
        
        reader.cancel();
      } catch (error) {
        console.error('Gemini stream error:', error);
      }
    })();
    
    return streamObj;
  }
  
  calculateCost(tokens, model = 'gemini-1.5-flash') {
    const pricing = this.pricing[model] || this.pricing['gemini-1.5-flash'];
    const inputTokens = tokens * 0.3;
    const outputTokens = tokens * 0.7;
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000000;
  }
}

// ============================================
// XAI GROK PROVIDER
// ============================================

class GrokLLM extends BaseLLM {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.XAI_API_KEY;
    this.baseUrl = 'https://api.x.ai/v1';
    
    // Pricing per 1M tokens (estimated)
    this.pricing = {
      'grok-beta': { input: 5.00, output: 15.00 }
    };
  }
  
  async complete(options) {
    const { model = 'grok-beta', messages, maxTokens = 1000, temperature = 0.7 } = options;
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Grok API error: ${error.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }
  
  async streamComplete(options) {
    // Grok streaming follows OpenAI format
    const { model = 'grok-beta', messages, maxTokens = 1000, temperature = 0.7, onToken } = options;
    
    let cancelled = false;
    
    const streamObj = {
      cancel: () => { cancelled = true; }
    };
    
    (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream: true
          })
        });
        
        if (!response.ok) {
          throw new Error(`Grok API error: ${response.statusText}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                const token = parsed.choices[0]?.delta?.content;
                if (token && onToken) {
                  const shouldContinue = await onToken(token);
                  if (shouldContinue === false) {
                    cancelled = true;
                    break;
                  }
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
        
        reader.cancel();
      } catch (error) {
        console.error('Grok stream error:', error);
      }
    })();
    
    return streamObj;
  }
  
  calculateCost(tokens, model = 'grok-beta') {
    const pricing = this.pricing[model] || this.pricing['grok-beta'];
    const inputTokens = tokens * 0.3;
    const outputTokens = tokens * 0.7;
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000000;
  }
}

// ============================================
// FACTORY
// ============================================

class LLMFactory {
  static providers = {
    openai: OpenAILLM,
    anthropic: AnthropicLLM,
    google: GeminiLLM,
    gemini: GeminiLLM,
    xai: GrokLLM,
    grok: GrokLLM
  };
  
  static create(provider, config = {}) {
    const Provider = this.providers[provider?.toLowerCase()];
    
    if (!Provider) {
      console.warn(`Unknown LLM provider: ${provider}, defaulting to OpenAI`);
      return new OpenAILLM(config);
    }
    
    return new Provider(config);
  }
  
  static register(name, ProviderClass) {
    this.providers[name.toLowerCase()] = ProviderClass;
  }
}

module.exports = LLMFactory;
