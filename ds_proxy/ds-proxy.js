const http = require('http');
const https = require('https');

const PORT = Number(process.env.DS_PROXY_PORT || 15722);
const HOST = process.env.DS_PROXY_HOST || '127.0.0.1';
const DEEPSEEK_HOST = process.env.DEEPSEEK_HOST || 'api.deepseek.com';
const ANTHROPIC_UPSTREAM_PATH = process.env.DS_PROXY_ANTHROPIC_PATH || '/anthropic/v1/messages';
const CHAT_UPSTREAM_PATH = process.env.DS_PROXY_CHAT_PATH || '/chat/completions';
const PASS_REASONING_MODE = process.env.DS_PROXY_PASS_REASONING || 'tool_calls';

const reasoningCache = new Map();

function getSessionId(req) {
  return req.headers['x-session-id'] || req.headers['x-request-id'] || 'default-session';
}

function getSessionCache(sessionId) {
  if (!reasoningCache.has(sessionId)) {
    reasoningCache.set(sessionId, {
      bySignature: new Map(),
      byToolCallId: new Map(),
      anthropicBlocksBySignature: new Map(),
      anthropicBlocksByToolUseId: new Map(),
      last: '',
    });
  }
  return reasoningCache.get(sessionId);
}

function getToolCallIds(toolCalls) {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.map((toolCall) => toolCall && toolCall.id).filter(Boolean);
}

function getAnthropicToolUseIds(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block && block.type === 'tool_use' && block.id)
    .map((block) => block.id);
}

function getMessageSignature(message) {
  const anthropicToolUseIds = getAnthropicToolUseIds(message.content);
  if (anthropicToolUseIds.length > 0) {
    return `anthropic-tool:${anthropicToolUseIds.join('|')}`;
  }

  const toolCallIds = getToolCallIds(message.tool_calls);
  if (toolCallIds.length > 0) {
    return `tool:${toolCallIds.join('|')}`;
  }

  const content = typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content || '');
  return `content:${content}`;
}

function shouldPassReasoning(message) {
  if (PASS_REASONING_MODE === 'always') return true;
  if (PASS_REASONING_MODE === 'never') return false;
  return Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
}

function shouldPassAnthropicThinking(message) {
  if (PASS_REASONING_MODE === 'always') return true;
  if (PASS_REASONING_MODE === 'never') return false;
  return Boolean(message && message.role === 'assistant');
}

function extractTextAndReasoning(content) {
  if (!Array.isArray(content)) {
    return { content, reasoningContent: undefined };
  }

  let text = '';
  let reasoningContent = '';
  const passthrough = [];

  for (const block of content) {
    if (!block || typeof block !== 'object') {
      passthrough.push(block);
      continue;
    }

    if (block.type === 'thinking' || block.type === 'reasoning') {
      reasoningContent += block.thinking || block.reasoning || block.text || '';
      continue;
    }

    if (block.type === 'text') {
      text += block.text || '';
      continue;
    }

    passthrough.push(block);
  }

  return {
    content: passthrough.length > 0 ? content : text,
    reasoningContent: reasoningContent || undefined,
  };
}


function contentToSystemText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content);

  return content
    .map((block) => {
      if (typeof block === 'string') return block;
      if (!block || typeof block !== 'object') return '';
      if (typeof block.text === 'string') return block.text;
      if (typeof block.content === 'string') return block.content;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function appendSystemContent(data, content) {
  const nextSystem = contentToSystemText(content);
  if (!nextSystem) return;

  const currentSystem = contentToSystemText(data.system);
  data.system = currentSystem ? `${currentSystem}\n\n${nextSystem}` : nextSystem;
}

function moveSystemMessagesToTopLevel(data) {
  if (!Array.isArray(data.messages)) return;

  const messages = [];
  for (const message of data.messages) {
    if (message && message.role === 'system') {
      appendSystemContent(data, message.content);
      continue;
    }
    messages.push(message);
  }
  data.messages = messages;
}

function normalizeRequest(data, sessionId) {
  const cache = getSessionCache(sessionId);

  if (!data.model) {
    data.model = process.env.DS_PROXY_MODEL || 'deepseek-v4-pro';
  } else if (data.model === 'deepseek-reasoner') {
    data.model = process.env.DS_PROXY_MODEL || 'deepseek-v4-pro';
  }

  if (!data.thinking) {
    data.thinking = { type: 'enabled' };
  }

  if (data.thinking.type !== 'disabled' && !data.reasoning_effort) {
    data.reasoning_effort = process.env.DS_PROXY_REASONING_EFFORT || 'high';
  }

  if (!Array.isArray(data.messages)) {
    return data;
  }

  data.messages = data.messages.map((message) => {
    if (!message || message.role !== 'assistant') {
      return message;
    }

    const normalized = { ...message };
    const extracted = extractTextAndReasoning(normalized.content);

    normalized.content = extracted.content;
    if (!normalized.reasoning_content && extracted.reasoningContent) {
      normalized.reasoning_content = extracted.reasoningContent;
    }

    if (!normalized.reasoning_content && shouldPassReasoning(normalized)) {
      const signature = getMessageSignature(normalized);
      const cachedBySignature = cache.bySignature.get(signature);
      const cachedByToolCall = getToolCallIds(normalized.tool_calls)
        .map((id) => cache.byToolCallId.get(id))
        .find(Boolean);

      const restored = cachedBySignature || cachedByToolCall || '';
      if (restored) {
        normalized.reasoning_content = restored;
      }
    }

    if (!shouldPassReasoning(normalized)) {
      delete normalized.reasoning_content;
    }

    return normalized;
  });

  return data;
}

function normalizeAnthropicRequest(data, sessionId) {
  const cache = getSessionCache(sessionId);

  if (!data.model) {
    data.model = process.env.DS_PROXY_MODEL || 'deepseek-v4-pro';
  } else if (data.model === 'deepseek-reasoner') {
    data.model = process.env.DS_PROXY_MODEL || 'deepseek-v4-pro';
  }

  if (!data.thinking) {
    data.thinking = {
      type: 'enabled',
      budget_tokens: Number(process.env.DS_PROXY_THINKING_BUDGET || 8192),
    };
  }

  if (data.thinking && data.thinking.budgetTokens && !data.thinking.budget_tokens) {
    data.thinking.budget_tokens = data.thinking.budgetTokens;
    delete data.thinking.budgetTokens;
  }

  moveSystemMessagesToTopLevel(data);

  if (!Array.isArray(data.messages)) {
    return data;
  }

  data.messages = data.messages.map((message) => {
    if (!message || message.role !== 'assistant') {
      return message;
    }

    const normalized = { ...message };
    if (typeof normalized.content === 'string') {
      const restored = cache.last || '';
      normalized.content = [
        { type: 'thinking', thinking: restored },
        { type: 'text', text: normalized.content },
      ];
      return normalized;
    }

    if (!Array.isArray(normalized.content)) {
      return normalized;
    }

    let content = normalized.content.filter((block) => block && block.type !== 'redacted_thinking');
    const thinkingIndex = content.findIndex((block) => block && block.type === 'thinking');
    const toolUseIds = getAnthropicToolUseIds(content);
    const signature = getMessageSignature({ ...normalized, content });
    const cachedBlocksBySignature = cache.anthropicBlocksBySignature.get(signature);
    const cachedBlocksByToolUse = toolUseIds
      .map((id) => cache.anthropicBlocksByToolUseId.get(id))
      .find(Boolean);
    const cachedBlocks = cachedBlocksBySignature || cachedBlocksByToolUse || [];
    const cachedBySignature = cache.bySignature.get(signature);
    const cachedByToolUse = toolUseIds.map((id) => cache.byToolCallId.get(id)).find(Boolean);
    const restored = cachedBySignature || cachedByToolUse || '';

    if (thinkingIndex === -1 && shouldPassAnthropicThinking({ ...normalized, content })) {
      const blocksToInsert = cachedBlocks.length > 0
        ? cachedBlocks.map((block) => ({ ...block }))
        : [{ type: 'thinking', thinking: restored }];
      content = [...blocksToInsert, ...content];
    } else if (thinkingIndex !== -1 && restored && !content[thinkingIndex].thinking) {
      content[thinkingIndex] = cachedBlocks[0]
        ? { ...cachedBlocks[0] }
        : { ...content[thinkingIndex], thinking: restored };
    }

    normalized.content = content;
    return normalized;
  });

  return data;
}

function cacheAssistantMessage(sessionId, message) {
  if (!message || !message.reasoning_content) return;

  const cache = getSessionCache(sessionId);
  const signature = getMessageSignature(message);
  cache.bySignature.set(signature, message.reasoning_content);
  cache.last = message.reasoning_content;

  for (const toolCallId of getToolCallIds(message.tool_calls)) {
    cache.byToolCallId.set(toolCallId, message.reasoning_content);
  }

  console.log(
    `[ds-proxy] cached reasoning_content session=${sessionId} chars=${message.reasoning_content.length}`
  );
}

function cacheAnthropicMessage(sessionId, message) {
  if (!message || !Array.isArray(message.content)) return;

  const thinkingBlocks = message.content
    .filter((block) => block && block.type === 'thinking' && block.thinking)
    .map((block) => ({ ...block }));

  const thinking = thinkingBlocks
    .filter((block) => block && block.type === 'thinking' && block.thinking)
    .map((block) => block.thinking)
    .join('');

  if (!thinking) return;

  const cache = getSessionCache(sessionId);
  const signature = getMessageSignature(message);
  cache.bySignature.set(signature, thinking);
  cache.anthropicBlocksBySignature.set(signature, thinkingBlocks);
  cache.last = thinking;

  for (const toolUseId of getAnthropicToolUseIds(message.content)) {
    cache.byToolCallId.set(toolUseId, thinking);
    cache.anthropicBlocksByToolUseId.set(toolUseId, thinkingBlocks);
  }

  console.log(`[ds-proxy] cached content[].thinking session=${sessionId} chars=${thinking.length}`);
}

function mergeToolCallDelta(toolCalls, deltaToolCalls) {
  if (!Array.isArray(deltaToolCalls)) return;

  for (const delta of deltaToolCalls) {
    const index = Number.isInteger(delta.index) ? delta.index : toolCalls.length;
    if (!toolCalls[index]) {
      toolCalls[index] = {
        id: delta.id,
        type: delta.type || 'function',
        function: { name: '', arguments: '' },
      };
    }

    if (delta.id) toolCalls[index].id = delta.id;
    if (delta.type) toolCalls[index].type = delta.type;

    if (delta.function) {
      toolCalls[index].function = toolCalls[index].function || { name: '', arguments: '' };
      if (delta.function.name) {
        toolCalls[index].function.name += delta.function.name;
      }
      if (delta.function.arguments) {
        toolCalls[index].function.arguments += delta.function.arguments;
      }
    }
  }
}

function parseSseData(buffer, onData) {
  let nextBuffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let eventEnd = nextBuffer.indexOf('\n\n');

  while (eventEnd !== -1) {
    const event = nextBuffer.slice(0, eventEnd);
    nextBuffer = nextBuffer.slice(eventEnd + 2);

    const dataLines = event
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length > 0) {
      onData(dataLines.join('\n'));
    }

    eventEnd = nextBuffer.indexOf('\n\n');
  }

  return nextBuffer;
}

function cacheStreamingResponse(sessionId, proxyRes, res) {
  const assembled = {
    role: 'assistant',
    content: '',
    reasoning_content: '',
    tool_calls: [],
  };
  let sseBuffer = '';
  const handleDataLine = (dataLine) => {
    if (dataLine === '[DONE]') return;

    try {
      const payload = JSON.parse(dataLine);
      const choice = payload.choices && payload.choices[0];
      const delta = choice && choice.delta;
      if (!delta) return;

      if (delta.reasoning_content) {
        assembled.reasoning_content += delta.reasoning_content;
      }
      if (delta.content) {
        assembled.content += delta.content;
      }
      mergeToolCallDelta(assembled.tool_calls, delta.tool_calls);
    } catch (error) {
      console.warn('[ds-proxy] failed to parse SSE chunk:', error.message);
    }
  };

  res.writeHead(proxyRes.statusCode, proxyRes.headers);

  proxyRes.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    sseBuffer = parseSseData(sseBuffer + text, handleDataLine);

    res.write(chunk);
  });

  proxyRes.on('end', () => {
    if (sseBuffer.trim()) {
      parseSseData(`${sseBuffer}\n\n`, handleDataLine);
    }

    assembled.tool_calls = assembled.tool_calls.filter(Boolean);
    if (assembled.tool_calls.length === 0) {
      delete assembled.tool_calls;
    }
    cacheAssistantMessage(sessionId, assembled);
    res.end();
  });
}

function cacheJsonResponse(sessionId, proxyRes, res) {
  let responseBody = '';

  proxyRes.on('data', (chunk) => {
    responseBody += chunk.toString('utf8');
  });

  proxyRes.on('end', () => {
    try {
      const payload = JSON.parse(responseBody);
      const choice = payload.choices && payload.choices[0];
      cacheAssistantMessage(sessionId, choice && choice.message);
    } catch (error) {
      console.warn('[ds-proxy] failed to parse JSON response:', error.message);
    }

    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    res.end(responseBody);
  });
}

function cacheAnthropicStreamingResponse(sessionId, proxyRes, res) {
  const content = [];
  let sseBuffer = '';
  const handleDataLine = (dataLine) => {
    try {
      const event = JSON.parse(dataLine);
      if (event.type === 'content_block_start' && event.content_block) {
        content[event.index] = { ...event.content_block };
        return;
      }

      if (event.type !== 'content_block_delta' || !event.delta || !content[event.index]) {
        return;
      }

      const block = content[event.index];
      if (event.delta.type === 'thinking_delta') {
        block.thinking = (block.thinking || '') + (event.delta.thinking || '');
      } else if (event.delta.type === 'text_delta') {
        block.text = (block.text || '') + (event.delta.text || '');
      } else if (event.delta.type === 'input_json_delta') {
        block.input_json = (block.input_json || '') + (event.delta.partial_json || '');
      }
    } catch (error) {
      console.warn('[ds-proxy] failed to parse Anthropic SSE chunk:', error.message);
    }
  };

  res.writeHead(proxyRes.statusCode, proxyRes.headers);

  proxyRes.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    sseBuffer = parseSseData(sseBuffer + text, handleDataLine);
    res.write(chunk);
  });

  proxyRes.on('end', () => {
    if (sseBuffer.trim()) {
      parseSseData(`${sseBuffer}\n\n`, handleDataLine);
    }

    cacheAnthropicMessage(sessionId, {
      role: 'assistant',
      content: content.filter(Boolean),
    });
    res.end();
  });
}

function cacheAnthropicJsonResponse(sessionId, proxyRes, res) {
  let responseBody = '';

  proxyRes.on('data', (chunk) => {
    responseBody += chunk.toString('utf8');
  });

  proxyRes.on('end', () => {
    try {
      const payload = JSON.parse(responseBody);
      cacheAnthropicMessage(sessionId, {
        role: 'assistant',
        content: payload.content,
      });
    } catch (error) {
      console.warn('[ds-proxy] failed to parse Anthropic JSON response:', error.message);
    }

    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    res.end(responseBody);
  });
}

function createDeepSeekHeaders(req, requestBody) {
  const authorization = req.headers.authorization ||
    (process.env.DEEPSEEK_API_KEY ? `Bearer ${process.env.DEEPSEEK_API_KEY}` : '');

  return {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestBody),
    Accept: req.headers.accept || 'application/json',
    'Accept-Encoding': 'identity',
    ...(authorization ? { Authorization: authorization } : {}),
  };
}

function createAnthropicHeaders(req, requestBody) {
  const apiKey = req.headers['x-api-key'] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
    process.env.DEEPSEEK_API_KEY ||
    '';

  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestBody),
    Accept: req.headers.accept || 'application/json',
    'Accept-Encoding': 'identity',
    'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
  };

  if (req.headers['anthropic-beta']) {
    headers['anthropic-beta'] = req.headers['anthropic-beta'];
  }
  if (apiKey) {
    headers['x-api-key'] = apiKey;
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-ID, X-Request-ID');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const isChatCompletion =
    req.method === 'POST' &&
    (url.pathname === '/v1/chat/completions' || url.pathname === '/chat/completions');

  const isAnthropicMessages =
    req.method === 'POST' &&
    (url.pathname === '/v1/messages' ||
      url.pathname === '/messages' ||
      url.pathname === '/anthropic/v1/messages');

  if (!isChatCompletion && !isAnthropicMessages) {
    sendJson(res, 404, { error: 'Not Found' });
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });

  req.on('end', () => {
    let data;
    try {
      data = JSON.parse(body);
    } catch (error) {
      sendJson(res, 400, { error: 'Invalid JSON', message: error.message });
      return;
    }

    const sessionId = getSessionId(req);
    const normalizedData = isAnthropicMessages
      ? normalizeAnthropicRequest(data, sessionId)
      : normalizeRequest(data, sessionId);
    const requestBody = JSON.stringify(normalizedData);

    const options = {
      hostname: DEEPSEEK_HOST,
      port: 443,
      path: isAnthropicMessages ? ANTHROPIC_UPSTREAM_PATH : CHAT_UPSTREAM_PATH,
      method: 'POST',
      headers: isAnthropicMessages
        ? createAnthropicHeaders(req, requestBody)
        : createDeepSeekHeaders(req, requestBody),
    };

    const proxyReq = https.request(options, (proxyRes) => {
      const contentType = proxyRes.headers['content-type'] || '';

      if (isAnthropicMessages && contentType.includes('text/event-stream')) {
        cacheAnthropicStreamingResponse(sessionId, proxyRes, res);
        return;
      }

      if (isAnthropicMessages && contentType.includes('application/json')) {
        cacheAnthropicJsonResponse(sessionId, proxyRes, res);
        return;
      }

      if (contentType.includes('text/event-stream')) {
        cacheStreamingResponse(sessionId, proxyRes, res);
        return;
      }

      if (contentType.includes('application/json')) {
        cacheJsonResponse(sessionId, proxyRes, res);
        return;
      }

      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (error) => {
      console.error('[ds-proxy] upstream request failed:', error);
      sendJson(res, 502, { error: 'Bad Gateway', message: error.message });
    });

    proxyReq.write(requestBody);
    proxyReq.end();
  });

  req.on('error', (error) => {
    console.error('[ds-proxy] incoming request failed:', error);
    sendJson(res, 400, { error: 'Request Error', message: error.message });
  });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`[ds-proxy] DeepSeek proxy listening at http://${HOST}:${PORT}`);
    console.log(`[ds-proxy] upstream host: ${DEEPSEEK_HOST}`);
    console.log(`[ds-proxy] anthropic upstream path: ${ANTHROPIC_UPSTREAM_PATH}`);
    console.log('[ds-proxy] thinking mode uses reasoning_content and reasoning_effort');
    console.log(`[ds-proxy] pass reasoning mode: ${PASS_REASONING_MODE}`);
  });
}

module.exports = {
  cacheAnthropicMessage,
  cacheAssistantMessage,
  getSessionCache,
  moveSystemMessagesToTopLevel,
  normalizeAnthropicRequest,
  normalizeRequest,
  parseSseData,
  server,
};
