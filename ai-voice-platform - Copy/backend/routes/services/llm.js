/**
 * LLM Service
 * Multi-model support: OpenAI, Claude, Gemini, Grok
 * Includes streaming for real-time responses
 */

const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Grok uses OpenAI-compatible API
const grok = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});

// Gemini configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Process message with LLM
 * @param {Object} options - LLM processing options
 */
async function processWithLLM(options) {
  const {
    messages,
    context,
    model = 'gpt-4o-mini',
    systemPrompt,
    onTextChunk,
    onComplete,
    temperature = 0.7,
    maxTokens = 500
  } = options;
  
  // Determine provider from model name
  const provider = getProviderFromModel(model);
  
  // Build system message with context
  const systemMessage = buildSystemMessage(systemPrompt, context);
  
  try {
    switch (provider) {
      case 'openai':
        await processOpenAI({ ...options, systemMessage });
        break;
      case 'anthropic':
        await processAnthropic({ ...options, systemMessage });
        break;
      case 'gemini':
        await processGemini({ ...options, systemMessage });
        break;
      case 'grok':
        await processGrok({ ...options, systemMessage });
        break;
      default:
        throw new Error(`Unsupported model: ${model}`);
    }
  } catch (error) {
    console.error(`LLM error (${provider}):`, error);
    throw error;
  }
}

/**
 * Process with OpenAI models
 */
async function processOpenAI(options) {
  const {
    messages,
    model,
    systemMessage,
    onTextChunk,
    onComplete,
    temperature = 0.7,
    maxTokens = 500
  } = options;
  
  const formattedMessages = [
    { role: 'system', content: systemMessage },
    ...messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  ];
  
  const stream = await openai.chat.completions.create({
    model,
    messages: formattedMessages,
    temperature,
    max_tokens: maxTokens,
    stream: true
  });
  
  let fullText = '';
  let usage = { total_tokens: 0 };
  
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      fullText += content;
      if (onTextChunk) {
        onTextChunk(content);
      }
    }
    
    // Capture usage if available
    if (chunk.usage) {
      usage = chunk.usage;
    }
  }
  
  // Estimate tokens if not provided
  if (!usage.total_tokens) {
    usage.total_tokens = estimateTokens(formattedMessages) + estimateTokens(fullText);
  }
  
  if (onComplete) {
    onComplete({ text: fullText, usage });
  }
}

/**
 * Process with Anthropic Claude models
 */
async function processAnthropic(options) {
  const {
    messages,
    model,
    systemMessage,
    onTextChunk,
    onComplete,
    temperature = 0.7,
    maxTokens = 500
  } = options;
  
  // Claude uses a different message format
  const formattedMessages = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }));
  
  const stream = await anthropic.messages.stream({
    model: model.replace('claude-', ''), // e.g., 'claude-3-5-sonnet' -> '3-5-sonnet'
    max_tokens: maxTokens,
    system: systemMessage,
    messages: formattedMessages
  });
  
  let fullText = '';
  let usage = { total_tokens: 0 };
  
  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      const content = event.delta?.text || '';
      if (content) {
        fullText += content;
        if (onTextChunk) {
          onTextChunk(content);
        }
      }
    }
    
    if (event.type === 'message_delta' && event.usage) {
      usage.total_tokens = (event.usage.input_tokens || 0) + (event.usage.output_tokens || 0);
    }
  }
  
  if (onComplete) {
    onComplete({ text: fullText, usage });
  }
}

/**
 * Process with Google Gemini models
 */
async function processGemini(options) {
  const {
    messages,
    model,
    systemMessage,
    onTextChunk,
    onComplete,
    temperature = 0.7,
    maxTokens = 500
  } = options;
  
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required');
  }
  
  // Gemini API endpoint
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${GEMINI_API_KEY}`;
  
  // Format messages for Gemini
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  
  // Add system instruction
  const requestBody = {
    contents,
    systemInstruction: {
      parts: [{ text: systemMessage }]
    },
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens
    }
  };
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Parse streamed JSON responses
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) {
              fullText += text;
              if (onTextChunk) {
                onTextChunk(text);
              }
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    }
    
    if (onComplete) {
      onComplete({ 
        text: fullText, 
        usage: { total_tokens: estimateTokens(fullText) } 
      });
    }
    
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}

/**
 * Process with Grok (xAI)
 */
async function processGrok(options) {
  const {
    messages,
    model,
    systemMessage,
    onTextChunk,
    onComplete,
    temperature = 0.7,
    maxTokens = 500
  } = options;
  
  if (!process.env.GROK_API_KEY) {
    throw new Error('GROK_API_KEY is required');
  }
  
  const formattedMessages = [
    { role: 'system', content: systemMessage },
    ...messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  ];
  
  const stream = await grok.chat.completions.create({
    model: model.replace('grok-', ''), // e.g., 'grok-2' -> '2'
    messages: formattedMessages,
    temperature,
    max_tokens: maxTokens,
    stream: true
  });
  
  let fullText = '';
  let usage = { total_tokens: 0 };
  
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      fullText += content;
      if (onTextChunk) {
        onTextChunk(content);
      }
    }
  }
  
  if (onComplete) {
    onComplete({ 
      text: fullText, 
      usage: { total_tokens: estimateTokens(fullText) } 
    });
  }
}

/**
 * Get provider from model name
 */
function getProviderFromModel(model) {
  if (model.startsWith('gpt-') || model.startsWith('o1-')) {
    return 'openai';
  }
  if (model.startsWith('claude-')) {
    return 'anthropic';
  }
  if (model.startsWith('gemini-')) {
    return 'gemini';
  }
  if (model.startsWith('grok-')) {
    return 'grok';
  }
  // Default to OpenAI
  return 'openai';
}

/**
 * Build system message with context
 */
function buildSystemMessage(systemPrompt, context) {
  let message = systemPrompt || getDefaultSystemPrompt();
  
  if (context) {
    message += `\n\n## Relevant Information from Knowledge Base:\n${context}\n\nUse this information to answer the customer's question accurately. If the information doesn't contain the answer, say so honestly.`;
  }
  
  return message;
}

/**
 * Default system prompt
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
 * Estimate token count (rough approximation)
 */
function estimateTokens(input) {
  if (typeof input === 'string') {
    return Math.ceil(input.length / 4);
  }
  if (Array.isArray(input)) {
    return input.reduce((acc, msg) => {
      return acc + Math.ceil((msg.content?.length || 0) / 4);
    }, 0);
  }
  return 0;
}

/**
 * Get available models
 */
function getAvailableModels() {
  return {
    openai: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable, multimodal' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and cost-effective' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Latest GPT-4' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and affordable' }
    ],
    anthropic: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Best for most tasks' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fastest, cost-effective' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most capable' }
    ],
    gemini: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Most capable' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast and efficient' }
    ],
    grok: [
      { id: 'grok-2', name: 'Grok 2', description: 'Latest Grok model' }
    ]
  };
}

module.exports = {
  processWithLLM,
  getAvailableModels,
  getProviderFromModel,
  estimateTokens
};
