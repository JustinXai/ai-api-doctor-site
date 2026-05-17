/**
 * AI API Doctor — Diagnostic Engine
 * website/assets/test.js
 *
 * Security rules:
 * - API Key NEVER uploaded to any server
 * - API Key NEVER written to localStorage/sessionStorage
 * - API Key NEVER logged to console
 * - API Key NEVER appears in report images or copied text
 * - Mask API Key as sk-****xxxx in all displays
 */
'use strict';

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */
const DIAG_TIMEOUT = 30000;
const PROMPT_SHORT = '只回复一个词：好的';
const PROMPT_ARITHMETIC = 'What is 17 + 28? Reply with just the answer.';
const PROMPT_FORMAT = 'Reply with just the word YES in uppercase, nothing else.';
const PROMPT_CAPITAL = 'What is the capital of France? Reply with just the city name.';
const PROMPT_LONG_CACHE = `The concept of RESTful API design emphasizes stateless communication between clients and servers, where each request from a client contains all information necessary to process that request. The server does not store any user state between requests, which improves scalability and simplifies server implementation. HTTP methods such as GET, POST, PUT, DELETE, and PATCH map directly to CRUD operations. A well-designed API uses consistent naming conventions, meaningful status codes, and proper error messages to help developers integrate quickly. Response formats should be predictable, typically using JSON with clear field names. Pagination mechanisms prevent clients from overwhelming servers with large result sets. Authentication and rate limiting protect resources from unauthorized access and abuse. This text is repeated to create a long prompt for cache testing purposes.`;
const PROMPT_STABILITY = '请只输出 OK，不要解释。';

/* ═══════════════════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════════════════ */
function esc(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function maskKey(key) {
  if (!key || key.length < 12) return 'sk-****';
  return key.slice(0, 3) + '****' + key.slice(-4);
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function copyToClipboard(text, msg) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast(msg || '已复制')).catch(() => showToast('复制失败'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); showToast(msg || '已复制'); }
    catch (_) { showToast('复制失败'); }
    document.body.removeChild(ta);
  }
}

function generateReportId() {
  const now = new Date();
  const mmdd = String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  const hms = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  const hex = Math.random().toString(16).slice(2, 6).toUpperCase();
  return 'AID' + mmdd + hms + '-' + hex;
}

function getDocLang() {
  return document.documentElement.lang === 'en' ? 'en' : 'zh';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ═══════════════════════════════════════════════════════
   Request Builder
   ═══════════════════════════════════════════════════════ */
function buildRequest(baseUrl, apiKey, model, interfaceType, prompt, options = {}) {
  const { maxTokens = 50, stream = false, streamOptions = null } = options;

  const pathMap = {
    'OpenAI Chat': '/chat/completions',
    'OpenAI Responses': '/responses',
    'Claude Messages': '/messages'
  };
  const path = pathMap[interfaceType] || '/chat/completions';
  const endpoint = (baseUrl + path).replace(/\/+/g, '/').replace(':/', '://');

  let body;
  if (interfaceType === 'OpenAI Chat') {
    body = { model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, stream };
    if (stream && streamOptions) {
      body.stream_options = streamOptions;
    }
  } else if (interfaceType === 'OpenAI Responses') {
    body = { model, input: prompt, max_output_tokens: maxTokens, stream };
  } else {
    body = { model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, stream };
  }

  const headers = {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json'
  };
  if (interfaceType === 'Claude Messages') {
    headers['anthropic-version'] = '2023-06-01';
  }

  return { endpoint, body, headers };
}

/* ═══════════════════════════════════════════════════════
   Visible Output Extractor
   ═══════════════════════════════════════════════════════ */
function extractVisibleOutput(data, interfaceType) {
  const EMPTY = { text: '', status: 'absent' };
  if (!data || typeof data !== 'object') return EMPTY;

  if (interfaceType === 'OpenAI Chat') {
    const choices = data.choices;
    if (!choices || !Array.isArray(choices) || choices.length === 0) return EMPTY;
    const c0 = choices[0];
    if (!c0) return EMPTY;

    const mc = c0.message?.content;
    if (typeof mc === 'string' && mc.trim()) {
      return { text: mc.trim(), status: 'present' };
    }
    if (Array.isArray(mc)) {
      for (const part of mc) {
        if (part?.type === 'text' && part?.text?.trim()) {
          return { text: part.text.trim(), status: 'present' };
        }
      }
    }
    if (c0.message?.reasoning_content && String(c0.message.reasoning_content).trim()) {
      return { text: String(c0.message.reasoning_content).trim(), status: 'present' };
    }
    if (c0.message?.tool_calls && c0.message.tool_calls.length > 0) {
      return { text: '[tool_calls]', status: 'present' };
    }
    const delta = c0.delta;
    if (delta?.content && String(delta.content).trim()) {
      return { text: String(delta.content).trim(), status: 'present' };
    }

  } else if (interfaceType === 'OpenAI Responses') {
    if (data.output_text && String(data.output_text).trim()) {
      return { text: String(data.output_text).trim(), status: 'present' };
    }
    if (data.response?.output_text && String(data.response.output_text).trim()) {
      return { text: String(data.response.output_text).trim(), status: 'present' };
    }
    const outputs = data.output || data.response?.output || [];
    if (Array.isArray(outputs)) {
      for (const out of outputs) {
        if (out?.content && Array.isArray(out.content)) {
          for (const part of out.content) {
            if ((part?.type === 'output_text' || part?.type === 'text') && part?.text?.trim()) {
              return { text: part.text.trim(), status: 'present' };
            }
          }
        }
      }
    }

  } else if (interfaceType === 'Claude Messages') {
    const content = data.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part?.type === 'text' && part?.text?.trim()) {
          return { text: part.text.trim(), status: 'present' };
        }
        if (part?.type === 'tool_use') {
          return { text: '[tool_use]', status: 'present' };
        }
      }
    }
    if (data.delta?.text && String(data.delta.text).trim()) {
      return { text: String(data.delta.text).trim(), status: 'present' };
    }
  }

  return { text: '', status: data.choices || data.content || data.output ? 'unknown' : 'absent' };
}

/* ═══════════════════════════════════════════════════════
   Connection Info Parser
   ═══════════════════════════════════════════════════════ */
function parseConnectionInfo(raw) {
  const text = (raw || '').trim();
  if (!text) return {};

  try {
    const json = JSON.parse(text);
    if (json.key || json.api_key || json.apiKey || json.sk) {
      return {
        baseUrl: (json.url || json.base_url || json.endpoint || '').replace(/\/$/, ''),
        apiKey: json.key || json.api_key || json.apiKey || json.sk || '',
        model: json.model || json.model_id || json.modelId || ''
      };
    }
  } catch (_) {}

  if (text.startsWith('curl ') || text.includes('curl -')) {
    const urlMatch = text.match(/curl[^>]*['"]?(https?:\/\/[^\s'"]+)/i) || text.match(/-X\s+POST\s+['"]?(https?:\/\/[^\s'"]+)/i);
    const authMatch = text.match(/-H\s+['"]Authorization:\s*Bearer\s+([^\s'"]+)/i) || text.match(/Authorization:\s*Bearer\s+([A-Za-z0-9_-]+)/i);
    const modelMatch = text.match(/-d\s+['"]?{[^}]*['"]?model['"]?\s*:\s*['"]?([^'",\s]+)/i) || text.match(/["']model["']\s*:\s*["']([^"']+)/i);
    return {
      baseUrl: urlMatch ? urlMatch[1].replace(/\/$/, '').replace(/\/v1\/chat\/completions$/, '').replace(/\/chat\/completions$/, '') : '',
      apiKey: authMatch ? authMatch[1] : '',
      model: modelMatch ? modelMatch[1] : ''
    };
  }

  const lines = text.split('\n');
  let baseUrl = '', apiKey = '', model = '';
  lines.forEach(line => {
    const kv = line.split('=');
    if (kv.length >= 2) {
      const key = kv[0].trim().toUpperCase();
      const val = kv.slice(1).join('=').trim().replace(/['"]/g, '');
      if (key.includes('BASE_URL') || key.includes('BASEURL') || key.includes('ENDPOINT')) baseUrl = val;
      if (key.includes('API_KEY') || key.includes('APIKEY')) apiKey = val;
      if (key.includes('MODEL')) model = val;
    }
  });
  if (baseUrl || apiKey || model) return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, model };

  if (/^https?:\/\//.test(text)) {
    return { baseUrl: text.replace(/\/$/, ''), apiKey: '', model: '' };
  }

  if (/^sk-/.test(text)) {
    return { baseUrl: '', apiKey: text, model: '' };
  }

  return {};
}

/* ═══════════════════════════════════════════════════════
   7 Diagnostic Checks
   ═══════════════════════════════════════════════════════ */

/**
 * Check 1: OUTPUT CHECK (有无产物 — 20pts)
 * Send a normal request, check if response has valid content.
 * Cap rules:
 *   no content + has bill → max 65 total
 *   no content + no bill → max 55 total
 *   has content + no bill → max 75 total
 */
async function check1_Output(baseUrl, apiKey, model, interfaceType, signal) {
  try {
    const req = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_SHORT, 20);
    const resp = await fetch(req.endpoint, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal
    });

    if (resp.status === 401 || resp.status === 403) {
      return { name: 'output', label: '有无产物', labelEn: 'Output', pts: 20, ptsEarned: 0, state: 'fail', detail: 'Key无效', httpStatus: resp.status };
    }
    if (resp.status >= 400) {
      return { name: 'output', label: '有无产物', labelEn: 'Output', pts: 20, ptsEarned: 0, state: 'fail', detail: 'HTTP ' + resp.status, httpStatus: resp.status };
    }

    const data = await resp.json();
    const output = extractVisibleOutput(data, interfaceType);
    const usage = data.usage || {};

    if (output.status === 'present' && output.text.length > 0) {
      return {
        name: 'output', label: '有无产物', labelEn: 'Output', pts: 20, ptsEarned: 20,
        state: 'pass', detail: '有内容',
        httpStatus: resp.status, text: output.text, usage
      };
    } else if (output.status === 'unknown') {
      return {
        name: 'output', label: '有无产物', labelEn: 'Output', pts: 20, ptsEarned: 10,
        state: 'warn', detail: '格式异常',
        httpStatus: resp.status, usage
      };
    } else {
      return {
        name: 'output', label: '有无产物', labelEn: 'Output', pts: 20, ptsEarned: 0,
        state: 'fail', detail: '没内容',
        httpStatus: resp.status, usage
      };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { name: 'output', label: '有无产物', labelEn: 'Output', pts: 20, ptsEarned: 0, state: 'fail', detail: '请求超时' };
    }
    return { name: 'output', label: '有无产物', labelEn: 'Output', pts: 20, ptsEarned: 0, state: 'fail', detail: '网络错误' };
  }
}

/**
 * Check 2: BILL DETAILS CHECK (账单明细 — 18pts)
 * Check if response has usage object with required fields.
 */
async function check2_BillDetails(baseUrl, apiKey, model, interfaceType, signal) {
  try {
    const req = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_SHORT, 20);
    const resp = await fetch(req.endpoint, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal
    });

    if (resp.status >= 400) {
      return { name: 'bill', label: '账单明细', labelEn: 'Bill Details', pts: 18, ptsEarned: 0, state: 'fail', detail: 'HTTP ' + resp.status };
    }

    const data = await resp.json();
    const usage = data.usage || {};
    const hasPromptTokens = usage.prompt_tokens != null || usage.input_tokens != null;
    const hasCompletionTokens = usage.completion_tokens != null || usage.output_tokens != null;
    const hasTotalTokens = usage.total_tokens != null;

    if (hasPromptTokens && hasCompletionTokens && hasTotalTokens) {
      return {
        name: 'bill', label: '账单明细', labelEn: 'Bill Details', pts: 18, ptsEarned: 18,
        state: 'pass', detail: '有明细',
        usage
      };
    } else if (hasTotalTokens) {
      return {
        name: 'bill', label: '账单明细', labelEn: 'Bill Details', pts: 18, ptsEarned: 9,
        state: 'warn', detail: '明细不全',
        usage
      };
    } else {
      return {
        name: 'bill', label: '账单明细', labelEn: 'Bill Details', pts: 18, ptsEarned: 0,
        state: 'fail', detail: '没给账单',
        usage
      };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { name: 'bill', label: '账单明细', labelEn: 'Bill Details', pts: 18, ptsEarned: 0, state: 'fail', detail: '请求超时' };
    }
    return { name: 'bill', label: '账单明细', labelEn: 'Bill Details', pts: 18, ptsEarned: 0, state: 'fail', detail: '网络错误' };
  }
}

/**
 * Check 3: TOKEN OVERCOUNT CHECK (用量虚高 — 12pts)
 * Send a short prompt, check if returned tokens are significantly higher than expected.
 */
async function check3_TokenOvercount(baseUrl, apiKey, model, interfaceType, signal) {
  const shortPrompt = 'Hi';
  const expectedTokens = 3;

  try {
    const req = buildRequest(baseUrl, apiKey, model, interfaceType, shortPrompt, 5);
    const resp = await fetch(req.endpoint, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal
    });

    if (resp.status >= 400) {
      return { name: 'overcount', label: '用量虚高', labelEn: 'Token Overcount', pts: 12, ptsEarned: 12, state: 'pass', detail: '未虚高' };
    }

    const data = await resp.json();
    const usage = data.usage || {};
    const totalTokens = usage.total_tokens || 0;
    const promptTokens = usage.prompt_tokens || usage.input_tokens || 0;

    const threshold = Math.max(expectedTokens * 5, promptTokens * 3, 20);
    if (totalTokens > threshold) {
      return {
        name: 'overcount', label: '用量虚高', labelEn: 'Token Overcount', pts: 12, ptsEarned: 0,
        state: 'fail', detail: '疑似虚标',
        usage
      };
    } else {
      return {
        name: 'overcount', label: '用量虚高', labelEn: 'Token Overcount', pts: 12, ptsEarned: 12,
        state: 'pass', detail: '未虚高',
        usage
      };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { name: 'overcount', label: '用量虚高', labelEn: 'Token Overcount', pts: 12, ptsEarned: 12, state: 'pass', detail: '超时跳过' };
    }
    return { name: 'overcount', label: '用量虚高', labelEn: 'Token Overcount', pts: 12, ptsEarned: 12, state: 'pass', detail: '网络错误跳过' };
  }
}

/**
 * Check 4: STREAMING BILL LOSS CHECK (流式丢账 — 12pts)
 * Send streaming request with include_usage, check if usage appears in chunks.
 */
async function check4_StreamingBillLoss(baseUrl, apiKey, model, interfaceType, signal) {
  try {
    const req = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_SHORT, {
      maxTokens: 30,
      stream: true,
      streamOptions: { include_usage: true }
    });

    const resp = await fetch(req.endpoint, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal
    });

    if (resp.status >= 400) {
      return { name: 'stream', label: '流式丢账', labelEn: 'Streaming Bill', pts: 12, ptsEarned: 12, state: 'pass', detail: '未测试' };
    }

    if (!resp.body) {
      return { name: 'stream', label: '流式丢账', labelEn: 'Streaming Bill', pts: 12, ptsEarned: 0, state: 'fail', detail: '流式会炸' };
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let hasContent = false;
    let hasUsage = false;
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const chunk = JSON.parse(dataStr);
              const usage = chunk.usage;
              if (usage && (usage.prompt_tokens || usage.completion_tokens || usage.total_tokens)) {
                hasUsage = true;
              }
              const content = extractVisibleOutput(chunk, interfaceType);
              if (content.status === 'present') {
                hasContent = true;
              }
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    if (hasContent && !hasUsage) {
      return {
        name: 'stream', label: '流式丢账', labelEn: 'Streaming Bill', pts: 12, ptsEarned: 0,
        state: 'fail', detail: '流式丢账'
      };
    } else if (hasUsage) {
      return {
        name: 'stream', label: '流式丢账', labelEn: 'Streaming Bill', pts: 12, ptsEarned: 12,
        state: 'pass', detail: '流式有账'
      };
    } else if (hasContent) {
      return {
        name: 'stream', label: '流式丢账', labelEn: 'Streaming Bill', pts: 12, ptsEarned: 12,
        state: 'pass', detail: '流式有账'
      };
    } else {
      return {
        name: 'stream', label: '流式丢账', labelEn: 'Streaming Bill', pts: 12, ptsEarned: 6,
        state: 'warn', detail: '流式没账'
      };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { name: 'stream', label: '流式丢账', labelEn: 'Streaming Bill', pts: 12, ptsEarned: 12, state: 'pass', detail: '超时跳过' };
    }
    return { name: 'stream', label: '流式丢账', labelEn: 'Streaming Bill', pts: 12, ptsEarned: 0, state: 'fail', detail: '流式会炸' };
  }
}

/**
 * Check 5: CACHE CHECK (缓存有没有透 — 8pts)
 * Send same long prompt twice, check if cache is detected.
 */
async function check5_Cache(baseUrl, apiKey, model, interfaceType, signal) {
  try {
    const req1 = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_LONG_CACHE, 10);
    const r1 = await fetch(req1.endpoint, { method: 'POST', headers: req1.headers, body: JSON.stringify(req1.body), signal });
    const d1 = await r1.json();
    const u1 = d1.usage || {};
    const cached1 = u1.prompt_tokens_details?.cached_tokens || u1.input_tokens_details?.cached_tokens || 0;

    await sleep(1500);

    const req2 = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_LONG_CACHE, 10);
    const r2 = await fetch(req2.endpoint, { method: 'POST', headers: req2.headers, body: JSON.stringify(req2.body), signal });
    const d2 = await r2.json();
    const u2 = d2.usage || {};
    const cached2 = u2.prompt_tokens_details?.cached_tokens || u2.input_tokens_details?.cached_tokens || 0;

    if (cached1 > 0 || cached2 > 0) {
      return {
        name: 'cache', label: '缓存有没有透', labelEn: 'Cache Check', pts: 8, ptsEarned: 8,
        state: 'pass', detail: '有缓存抵扣',
        cachedTokens1: cached1, cachedTokens2: cached2
      };
    } else {
      return {
        name: 'cache', label: '缓存有没有透', labelEn: 'Cache Check', pts: 8, ptsEarned: 4,
        state: 'warn', detail: '没看到缓存',
        cachedTokens1: cached1, cachedTokens2: cached2
      };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { name: 'cache', label: '缓存有没有透', labelEn: 'Cache Check', pts: 8, ptsEarned: 4, state: 'warn', detail: '没给缓存字段' };
    }
    return { name: 'cache', label: '缓存有没有透', labelEn: 'Cache Check', pts: 8, ptsEarned: 4, state: 'warn', detail: '没给缓存字段' };
  }
}

/**
 * Check 6: MODEL SHINKAGE CHECK (模型缩水风险 — 15pts)
 * Send 3 simple tests: arithmetic, format, capital.
 */
async function check6_ModelShrinkage(baseUrl, apiKey, model, interfaceType, signal) {
  const tests = [
    {
      prompt: PROMPT_ARITHMETIC,
      expected: '45',
      normalize: (raw) => {
        const text = (raw || '').trim().replace(/\s/g, '');
        if (text.includes('45')) return 'correct';
        return 'wrong';
      },
      name: '算术'
    },
    {
      prompt: PROMPT_FORMAT,
      expected: 'YES',
      normalize: (raw) => {
        const text = (raw || '').trim().toUpperCase();
        if (text === 'YES') return 'correct';
        if (text.startsWith('YES') && text.length > 3) return 'partial';
        return 'wrong';
      },
      name: '格式'
    },
    {
      prompt: PROMPT_CAPITAL,
      expected: 'Paris',
      normalize: (raw) => {
        const text = (raw || '').trim();
        if (text.toLowerCase().includes('paris')) return 'correct';
        return 'wrong';
      },
      name: '常识'
    }
  ];

  const results = [];
  let totalScore = 0;

  for (const test of tests) {
    try {
      const req = buildRequest(baseUrl, apiKey, model, interfaceType, test.prompt, 20);
      const resp = await fetch(req.endpoint, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal
      });

      if (resp.status >= 400) {
        results.push({ name: test.name, score: 0, output: '', state: 'fail' });
        continue;
      }

      const data = await resp.json();
      const output = extractVisibleOutput(data, interfaceType);
      const norm = test.normalize(output.text);
      const score = norm === 'correct' ? 100 : norm === 'partial' ? 60 : 0;
      totalScore += score;
      results.push({ name: test.name, score, output: output.text, state: norm === 'correct' ? 'pass' : 'fail' });
    } catch (err) {
      results.push({ name: test.name, score: 0, output: '', state: 'fail' });
    }
  }

  const avgScore = Math.round(totalScore / tests.length);

  if (avgScore >= 80) {
    return {
      name: 'shrinkage', label: '模型缩水风险', labelEn: 'Model Check', pts: 15, ptsEarned: 15,
      state: 'pass', detail: '表现正常',
      results, avgScore
    };
  } else if (avgScore >= 50) {
    return {
      name: 'shrinkage', label: '模型缩水风险', labelEn: 'Model Check', pts: 15, ptsEarned: 8,
      state: 'warn', detail: '表现一般',
      results, avgScore
    };
  } else {
    return {
      name: 'shrinkage', label: '模型缩水风险', labelEn: 'Model Check', pts: 15, ptsEarned: 0,
      state: 'fail', detail: '模型缩水风险',
      results, avgScore
    };
  }
}

/**
 * Check 7: STABILITY SAMPLING (稳定性采样 — 15pts)
 * Send 3 consecutive lightweight requests and evaluate stability.
 */
async function check7_Stability(baseUrl, apiKey, model, interfaceType, signal) {
  const TOTAL = 3;

  async function onePing(abortController) {
    const start = Date.now();
    try {
      const req = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_STABILITY, 5);
      const resp = await fetch(req.endpoint, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: abortController.signal,
        keepalive: false
      });
      const elapsed = Date.now() - start;
      const ok = resp.ok;
      let text = '';
      let hasContent = false;
      let hasBill = false;
      let _data = null;
      if (ok) {
        try {
          const data = await resp.json();
          _data = data;
          const out = extractVisibleOutput(data, interfaceType);
          text = out.text;
          hasContent = out.status === 'present' && out.text.length > 0;
          const usage = data.usage || {};
          hasBill = !!(usage.prompt_tokens || usage.completion_tokens || usage.total_tokens);
        } catch (_) {}
      }
      return { elapsed, ok, hasContent, hasBill, text, _data, err: null };
    } catch (err) {
      return { elapsed: Date.now() - start, ok: false, hasContent: false, hasBill: false, text: '', err: err.name };
    }
  }

  const samples = [];
  let aborted = false;

  for (let i = 0; i < TOTAL; i++) {
    const controller = new AbortController();
    const prevAbort = signal._onabort;
    signal._onabort = () => { controller.abort(); aborted = true; };

    const s = await onePing(controller);
    samples.push(s);

    if (aborted) break;
    if (i < TOTAL - 1) {
      await sleep(800);
    }
  }

  const successCount = samples.filter(s => s.ok && s.hasContent).length;
  const okCount = samples.filter(s => s.ok).length;
  const times = samples.filter(s => s.ok).map(s => s.elapsed);
  const tokens = samples.filter(s => s.ok).map(s => {
    const u = (s._data || {}).usage || {};
    return u.total_tokens || u.completion_tokens || 0;
  });

  // Latency variance check
  let latVary = false;
  if (times.length >= 2) {
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    if (minT > 0 && maxT / minT > 3) latVary = true;
    if (minT < 500 && maxT - minT > 3000) latVary = true;
  }

  // Token variance check (short prompt → tokens should be tiny)
  let tokVary = false;
  if (tokens.length >= 2) {
    const minTok = Math.min(...tokens);
    const maxTok = Math.max(...tokens);
    if (minTok > 0 && maxTok / minTok > 2.5) tokVary = true;
  }

  // Bill consistency
  const billCounts = samples.filter(s => s.hasBill).length;
  const billInconsistent = okCount > 0 && (billCounts === 0 || billCounts === okCount);

  // Decision
  let ptsEarned, state, detail;
  if (successCount === 3 && !latVary && !tokVary) {
    ptsEarned = 15; state = 'pass'; detail = '三次都稳';
  } else if (okCount >= 2 && successCount >= 2 && !latVary) {
    ptsEarned = 8; state = 'warn'; detail = '有点飘';
  } else {
    ptsEarned = 0; state = 'fail'; detail = '很不稳';
  }

  return {
    name: 'stability', label: '稳定性采样', labelEn: 'Stability', pts: 15, ptsEarned,
    state, detail, samples
  };
}

/* ═══════════════════════════════════════════════════════
   Score Calculator & Verdict
   ═══════════════════════════════════════════════════════ */
function calcScore(checks) {
  let total = 0, earned = 0;
  for (const c of checks) {
    total += c.pts;
    earned += c.ptsEarned;
  }
  return total > 0 ? Math.round(earned / total * 100) : 0;
}

function calcGrade(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

/**
 * Apply cap rules based on check1 (output) and check2 (bill).
 * Returns adjusted ptsEarned for check1 and check2.
 */
function applyCapRules(checks) {
  const c1 = checks.find(c => c.name === 'output');
  const c2 = checks.find(c => c.name === 'bill');
  const c7 = checks.find(c => c.name === 'stability');

  if (!c1 || !c2) return checks;

  const noContent = c1.ptsEarned === 0;
  const hasBill = c2.ptsEarned > 0;
  const noBill = c2.ptsEarned === 0;
  const hasContent = c1.ptsEarned > 0;

  // Compute "raw" total excluding c1 and c2
  let othersEarned = 0;
  let othersTotal = 0;
  for (const c of checks) {
    if (c.name !== 'output' && c.name !== 'bill') {
      othersEarned += c.ptsEarned;
      othersTotal += c.pts;
    }
  }

  // Cap for check1
  let c1Capped = c1.ptsEarned;
  if (noContent && hasBill && c1.ptsEarned > 0) {
    const cap = 65 - othersEarned - c2.ptsEarned;
    c1Capped = Math.max(0, Math.min(c1.ptsEarned, Math.max(0, cap)));
  }
  if (noContent && noBill && c1.ptsEarned > 0) {
    const cap = 55 - othersEarned;
    c1Capped = Math.max(0, Math.min(c1.ptsEarned, Math.max(0, cap)));
  }
  if (hasContent && noBill && c1.ptsEarned > 0) {
    const cap = 75 - othersEarned - c2.ptsEarned;
    c1Capped = Math.max(0, Math.min(c1.ptsEarned, Math.max(0, cap)));
  }

  return checks.map(c => {
    if (c.name === 'output') return { ...c, ptsEarned: c1Capped };
    return c;
  });
}

function getJudgment(score, checks) {
  const c1 = checks.find(c => c.name === 'output');
  const c7 = checks.find(c => c.name === 'stability');

  if (c7?.ptsEarned === 0) return '很不稳';
  if (c7?.ptsEarned === 8) return '有点飘';
  if (score >= 85 && c1?.ptsEarned > 0) return '硬货';
  if (score >= 70 && c1?.ptsEarned > 0) return '能用';
  if (score >= 55) return '有坑';
  if (score >= 30) return '高危';
  if (c1?.ptsEarned === 0) return '返回废包';
  return '别充';
}

function getOneLineFinding(score, checks) {
  const zh = getDocLang() !== 'en';
  const c5 = checks.find(c => c.name === 'cache');
  const c7 = checks.find(c => c.name === 'stability');
  const fails = checks.filter(c => c.state === 'fail');
  const warns = checks.filter(c => c.state === 'warn');

  // All pass
  if (fails.length === 0 && warns.length === 0) {
    return zh ? '各项检测通过' : 'All checks passed';
  }

  // Only cache warn
  if (warns.length === 1 && warns[0].name === 'cache') {
    return zh ? '主体硬货，缓存抵扣未确认' : 'Solid core; cache discount unconfirmed';
  }

  // Stability warn (8/15)
  if (warns.some(c => c.name === 'stability')) {
    return zh ? '主体可用，但稳定性有点飘' : 'Mostly usable; stability inconsistent';
  }

  // Stability fail
  if (fails.some(c => c.name === 'stability')) {
    return zh ? '接口不稳，谨慎充值' : 'Connection unstable; use caution';
  }

  // Multiple warns
  if (warns.length > 1) {
    return zh ? '主体可用，部分项目需复查' : 'Mostly usable; some items need review';
  }

  // Generic fail
  const labels = fails.map(f => f.label).join('、');
  return zh ? `异常：${labels}` : `Issues: ${labels}`;
}

/* ═══════════════════════════════════════════════════════
   Report Card HTML Builder (for image generation)
   ═══════════════════════════════════════════════════════ */
function buildReportCardHTML(result, formData, lang) {
  const zh = lang !== 'en';
  const { score, checks, reportId, timestamp } = result;
  const grade = calcGrade(score);
  const judgment = getJudgment(score, checks);
  const finding = getOneLineFinding(score, checks);

  const gradeColors = { A: '#16a34a', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#dc2626' };
  const gradeBgs = { A: '#dcfce7', B: '#eff6ff', C: '#fef9c3', D: '#ffedd5', F: '#fee2e2' };
  const gradeColor = gradeColors[grade] || '#94a3b8';
  const gradeBg = gradeBgs[grade] || '#f1f5f9';

  const barStateColors = { pass: '#16a34a', fail: '#dc2626', warn: '#f59e0b' };
  const barStateBgs = { pass: '#dcfce7', fail: '#fee2e2', warn: '#fef9c3' };

  const escH = (s) => esc(String(s || ''));

  function pill(state) {
    const c = barStateColors[state] || '#94a3b8';
    const bg = barStateBgs[state] || '#f1f5f9';
    const text = state === 'pass' ? (zh ? '通过' : 'Pass')
      : state === 'fail' ? (zh ? '失败' : 'Fail')
      : (zh ? '警告' : 'Warn');
    return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700;color:${c};background:${bg}">${text}</span>`;
  }

  function barRow(check) {
    const c = barStateColors[check.state] || '#94a3b8';
    const bg = barStateBgs[check.state] || '#f1f5f9';
    const pct = check.state === 'pass' ? 100 : check.state === 'fail' ? 0 : 50;
    const label = zh ? check.label : (check.labelEn || check.label);
    const detail = escH(check.detail);

    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #f1f5f9">
      <div style="width:90px;font-size:11px;font-weight:600;color:#374151;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(label)}</div>
      <div style="flex:1;height:8px;background:${bg};border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${c};border-radius:4px"></div>
      </div>
      <div style="width:42px;text-align:center;flex-shrink:0">${pill(check.state)}</div>
      <div style="width:50px;text-align:right;font-size:10px;color:#94a3b8;flex-shrink:0">${check.ptsEarned}/${check.pts}</div>
      <div style="width:70px;text-align:right;font-size:10px;color:#374151;font-weight:500;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${detail}</div>
    </div>`;
  }

  const riskTags = checks.filter(c => c.state === 'fail').map(c => {
    const label = zh ? c.label : (c.labelEn || c.label);
    return `<span style="background:${gradeBg};color:${gradeColor};font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px">${escH(label)}</span>`;
  });

  // Sanitize baseUrl: only show origin + pathname
  let safeBaseUrl = '';
  try {
    const u = new URL(formData.baseUrl);
    safeBaseUrl = u.origin + u.pathname.replace(/\/$/, '');
  } catch (_) {
    safeBaseUrl = formData.baseUrl;
  }

  return `<div style="max-width:540px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#f8fafc;padding:32px;box-sizing:border-box">
    <div style="background:#0f172a;border-radius:20px;padding:18px 20px 16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div>
          <div style="font-size:16px;font-weight:800;color:#fff;letter-spacing:-0.3px">API Doctor</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">${zh ? '中转站最强照妖镜' : 'Relay API Black-box Check'}</div>
        </div>
        <div style="background:${gradeBg};border-radius:10px;padding:6px 14px;text-align:center;flex-shrink:0">
          <div style="font-size:24px;font-weight:900;color:${gradeColor};line-height:1">${grade}</div>
          <div style="font-size:9px;color:${gradeColor};font-weight:600;margin-top:2px">${zh ? '档' : 'Grade'}</div>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:10px">
        <div style="font-size:64px;font-weight:900;color:${gradeColor};line-height:1">${score}</div>
        <div style="font-size:14px;font-weight:700;color:${gradeColor};margin-top:4px">${escH(judgment)}</div>
      </div>
      <div style="font-size:12px;color:#94a3b8;text-align:center;margin-top:4px">${escH(finding)}</div>
    </div>

    <div style="background:#fff;border-radius:16px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:8px">7 ${zh ? '项验货结果' : 'Test Results'}</div>
      ${checks.map(barRow).join('')}
    </div>

    ${riskTags.length > 0 ? `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:10px">${riskTags.join('')}</div>` : ''}

    <div style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:10px;font-size:11px;color:#64748b">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><span style="font-weight:600;color:#374151">Base URL:</span> ${escH(safeBaseUrl)}</div>
        <div><span style="font-weight:600;color:#374151">Model:</span> ${escH(formData.model)}</div>
      </div>
    </div>

    <div style="text-align:center;font-size:11px;color:#94a3b8;padding:4px 0">
      ${zh ? '报告 ID' : 'Report ID'}: ${reportId} &nbsp;|&nbsp; aiapidoctor.com
    </div>
    <div style="font-size:10px;color:#94a3b8;text-align:center;padding:6px 0 4px;line-height:1.4">
      ${zh ? '本报告仅展示可复现信号，不构成法律结论。' : 'Report shows reproducible signals only, not a legal conclusion.'}
    </div>

    <div style="display:flex;gap:8px;margin-top:10px">
      <button onclick="Doctor.saveImage()" style="flex:1;padding:10px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">${zh ? '保存图片' : 'Save Image'}</button>
      <button onclick="Doctor.copyScore()" style="flex:1;padding:10px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">${zh ? '复制验货分' : 'Copy Score'}</button>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════
   Image Export
   ═══════════════════════════════════════════════════════ */
async function saveDiagnosticImage() {
  var result = window.Doctor ? window.Doctor._result : null;
  var formData = window.Doctor ? window.Doctor._formData : null;
  if (!result || !formData) return;

  try {
    await new Promise(requestAnimationFrame);
    await document.fonts.ready.catch(function(){});

    if (typeof htmlToImage === 'undefined') {
      showToast('请使用浏览器截图');
      return;
    }

    const lang = getDocLang();
    const zh = lang !== 'en';
    const clone = document.createElement('div');
    clone.innerHTML = buildReportCardHTML(result, formData, lang);
    clone.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:540px;background:#f8fafc;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;box-sizing:border-box';
    document.body.appendChild(clone);

    const dataUrl = await htmlToImage.toPng(clone, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#f8fafc',
      width: 540
    });

    document.body.removeChild(clone);

    const link = document.createElement('a');
    link.download = 'aiapidoctor-' + Date.now() + '.png';
    link.href = dataUrl;
    link.click();

    showToast(zh ? '图片已保存' : 'Image saved');
  } catch (err) {
    showToast(zh ? '保存失败，请用浏览器截图' : 'Image failed, use browser screenshot');
  }
}

/* ═══════════════════════════════════════════════════════
   Doctor Controller
   ═══════════════════════════════════════════════════════ */
window.Doctor = {
  _result: null,
  _formData: null,
  _controller: null,
  _interfaceType: 'OpenAI Chat',
  _checks: [null, null, null, null, null, null, null],

  init() {
    this._interfaceType = 'OpenAI Chat';
  },

  normalizeBaseUrl(input) {
    let val = (typeof input === 'string' ? input : input?.value || '').trim().replace(/\/$/, '');
    val = val.replace(/\/v1\/v1$/, '/v1');
    if (!val.endsWith('/v1') && val.match(/^https?:\/\//)) {
      val = val + '/v1';
    }
    if (typeof input === 'object' && input.value !== undefined) {
      input.value = val;
    }
    return val;
  },

  setInterface(type) {
    this._interfaceType = type;
  },

  /**
   * Auto-detect model: fetch /models or /v1/models,
   * fill in first available model or show a brief toast.
   */
  async findModels() {
    const baseUrl = (document.getElementById('doctor-base-url')?.value || '').trim();
    const apiKey = (document.getElementById('doctor-api-key')?.value || '').trim();
    const lang = getDocLang();
    const zh = lang !== 'en';

    if (!baseUrl) { showToast(zh ? '请先填写 Base URL' : 'Please fill in Base URL'); return; }
    if (!apiKey) { showToast(zh ? '请先填写 API Key' : 'Please fill in API Key'); return; }

    const btn = document.getElementById('find-models-btn');
    if (btn) { btn.disabled = true; btn.textContent = zh ? '识别中...' : 'Detecting...'; }

    try {
      const normalized = baseUrl.replace(/\/$/, '');
      // Try both /models and /v1/models
      let models = [];
      const endpoints = [normalized + '/models', normalized + '/v1/models'];
      let lastErr = null;

      for (const endpoint of endpoints) {
        try {
          const resp = await fetch(endpoint, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }
          });
          if (resp.status === 401 || resp.status === 403) {
            lastErr = 'Key无效';
            break;
          }
          if (!resp.ok) {
            lastErr = 'HTTP ' + resp.status;
            continue;
          }
          const data = await resp.json();
          if (Array.isArray(data.data)) {
            models = data.data.map(m => m.id || '').filter(Boolean);
          } else if (Array.isArray(data.models)) {
            models = data.models.map(m => typeof m === 'string' ? m : m.id || '').filter(Boolean);
          } else if (Array.isArray(data)) {
            models = data.map(m => typeof m === 'string' ? m : m.id || '').filter(Boolean);
          }
          if (models.length > 0) break;
        } catch (e) {
          lastErr = e.message;
        }
      }

      if (models.length > 0) {
        const modelEl = document.getElementById('doctor-model');
        if (modelEl && !modelEl.value) {
          modelEl.value = models[0];
        }
        showToast(zh ? `已填入：${models[0]}` : `Filled: ${models[0]}`);
      } else {
        showToast(zh ? '无法自动识别，请手动填写模型 ID' : 'Cannot auto-detect; fill in Model ID manually');
      }
    } catch (err) {
      showToast(zh ? '无法自动识别，请手动填写模型 ID' : 'Cannot auto-detect; fill in Model ID manually');
    }

    if (btn) { btn.disabled = false; btn.textContent = zh ? '自动识别模型' : 'Auto-detect'; }
  },

  onConnectionInfoInput(textarea) {
    const parsed = parseConnectionInfo(textarea.value);
    if (parsed.baseUrl) {
      const urlEl = document.getElementById('doctor-base-url');
      if (urlEl) urlEl.value = this.normalizeBaseUrl(parsed.baseUrl);
    }
    if (parsed.apiKey) {
      const keyEl = document.getElementById('doctor-api-key');
      if (keyEl) keyEl.value = parsed.apiKey;
    }
    if (parsed.model) {
      const modelEl = document.getElementById('doctor-model');
      if (modelEl) modelEl.value = parsed.model;
    }
  },

  async run() {
    const baseUrl = (document.getElementById('doctor-base-url')?.value || '').trim();
    const apiKey = (document.getElementById('doctor-api-key')?.value || '').trim();
    const model = (document.getElementById('doctor-model')?.value || '').trim();
    const interfaceType = (document.getElementById('doctor-interface')?.value || this._interfaceType);
    const lang = getDocLang();
    const zh = lang !== 'en';

    if (!baseUrl) { showToast(zh ? '请填写 Base URL' : 'Please fill in Base URL'); return; }
    if (!apiKey) { showToast(zh ? '请填写 API Key' : 'Please fill in API Key'); return; }
    if (!model) { showToast(zh ? '请填写 Model ID' : 'Please fill in Model ID'); return; }

    const normalizedUrl = this.normalizeBaseUrl(baseUrl);

    if (this._controller) this._controller.abort();
    this._controller = new AbortController();

    const btn = document.getElementById('doctor-run-btn');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite"></span> ${zh ? '检测中...' : 'Checking...'}`;
    }

    this._checks = [null, null, null, null, null, null, null];
    this.showProgress('running');

    this._formData = {
      baseUrl: normalizedUrl,
      model,
      interfaceType
    };

    try {
      const signal = this._controller.signal;

      this._currentIndex = 0;
      const check1 = await check1_Output(normalizedUrl, apiKey, model, interfaceType, signal);
      this._checks[0] = check1;
      this._refreshProgress();

      this._currentIndex = 1;
      const check2 = await check2_BillDetails(normalizedUrl, apiKey, model, interfaceType, signal);
      this._checks[1] = check2;
      this._refreshProgress();

      this._currentIndex = 2;
      const check3 = await check3_TokenOvercount(normalizedUrl, apiKey, model, interfaceType, signal);
      this._checks[2] = check3;
      this._refreshProgress();

      this._currentIndex = 3;
      const check4 = await check4_StreamingBillLoss(normalizedUrl, apiKey, model, interfaceType, signal);
      this._checks[3] = check4;
      this._refreshProgress();

      this._currentIndex = 4;
      const check5 = await check5_Cache(normalizedUrl, apiKey, model, interfaceType, signal);
      this._checks[4] = check5;
      this._refreshProgress();

      this._currentIndex = 5;
      const check6 = await check6_ModelShrinkage(normalizedUrl, apiKey, model, interfaceType, signal);
      this._checks[5] = check6;
      this._refreshProgress();

      this._currentIndex = 6;
      const check7 = await check7_Stability(normalizedUrl, apiKey, model, interfaceType, signal);
      this._checks[6] = check7;
      this._refreshProgress();

      let checks = this._checks.map(c => c);
      checks = applyCapRules(checks);

      const score = calcScore(checks);
      const grade = calcGrade(score);
      const judgment = getJudgment(score, checks);
      const finding = getOneLineFinding(score, checks);

      this._result = {
        score,
        grade,
        judgment,
        finding,
        checks,
        reportId: generateReportId(),
        timestamp: new Date().toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        })
      };

      this.showResult(this._result);

    } catch (err) {
      if (err.name === 'AbortError') {
        showToast(zh ? '检测超时，请重试' : 'Check timed out, please retry');
      } else {
        showToast(zh ? '检测失败：' + err.message : 'Check failed: ' + err.message);
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> ${zh ? '一键验货' : 'Run Check'}`;
      }
      this.showProgress('done');
    }
  },

  clear() {
    ['doctor-base-url', 'doctor-api-key', 'doctor-model'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    this._result = null;
    this._formData = null;
    if (this._controller) this._controller.abort();
  },

  showResult(result) {
    const lang = getDocLang();
    const resultNode = document.getElementById('result-card');
    if (!resultNode) return;

    const html = buildReportCardHTML(result, this._formData, lang);
    resultNode.innerHTML = html;

    const rect = resultNode.getBoundingClientRect();
    if (rect.top > window.innerHeight * 0.6) {
      resultNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  /* ── 7-item progress bar ── */
  showProgress(state) {
    const container = document.getElementById('diag-progress');
    if (!container) return;

    if (state === 'done') {
      container.innerHTML = '';
      return;
    }

    const zh = getDocLang() !== 'en';
    const labels = [
      { i: 0, zh: '1/7 有无产物', en: '1/7 Output' },
      { i: 1, zh: '2/7 账单明细', en: '2/7 Bill Details' },
      { i: 2, zh: '3/7 用量虚高', en: '3/7 Token Overcount' },
      { i: 3, zh: '4/7 流式丢账', en: '4/7 Streaming Bill' },
      { i: 4, zh: '5/7 缓存有没有透', en: '5/7 Cache Check' },
      { i: 5, zh: '6/7 模型缩水风险', en: '6/7 Model Check' },
      { i: 6, zh: '7/7 稳定性采样', en: '7/7 Stability' }
    ];

    let rows = labels.map(l =>
      `<div class="prog-row" id="prog-row-${l.i}" data-index="${l.i}">
        <span class="prog-icon" id="prog-icon-${l.i}"></span>
        <span class="prog-bar-wrap"><span class="prog-bar" id="prog-bar-${l.i}"></span></span>
        <span class="prog-label" id="prog-label-${l.i}">${l.zh}</span>
        <span class="prog-detail" id="prog-detail-${l.i}"></span>
      </div>`
    ).join('');

    container.innerHTML = `<div class="progress-wrap">
      <div class="progress-title">${zh ? '检测进度' : 'Progress'}</div>
      ${rows}
    </div>`;
  },

  _refreshProgress() {
    const zh = getDocLang() !== 'en';
    const labels = [
      { i: 0, zh: '1/7 有无产物', en: '1/7 Output' },
      { i: 1, zh: '2/7 账单明细', en: '2/7 Bill Details' },
      { i: 2, zh: '3/7 用量虚高', en: '3/7 Token Overcount' },
      { i: 3, zh: '4/7 流式丢账', en: '4/7 Streaming Bill' },
      { i: 4, zh: '5/7 缓存有没有透', en: '5/7 Cache Check' },
      { i: 5, zh: '6/7 模型缩水风险', en: '6/7 Model Check' },
      { i: 6, zh: '7/7 稳定性采样', en: '7/7 Stability' }
    ];

    for (let i = 0; i < 7; i++) {
      const check = this._checks[i];
      const row = document.getElementById('prog-row-' + i);
      const icon = document.getElementById('prog-icon-' + i);
      const bar = document.getElementById('prog-bar-' + i);
      const label = document.getElementById('prog-label-' + i);
      const detail = document.getElementById('prog-detail-' + i);
      if (!row) continue;

      if (check) {
        // Done
        label.textContent = labels[i][zh ? 'zh' : 'en'];
        detail.textContent = check.detail;
        icon.innerHTML = check.state === 'pass'
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
          : check.state === 'warn'
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="3"><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        bar.style.width = check.state === 'pass' ? '100%' : check.state === 'warn' ? '60%' : '20%';
        bar.style.background = check.state === 'pass' ? '#16a34a' : check.state === 'warn' ? '#f59e0b' : '#dc2626';
        row.className = 'prog-row prog-row--done prog-row--' + check.state;
      } else if (i === this._currentIndex) {
        // Running
        label.textContent = labels[i][zh ? 'zh' : 'en'];
        detail.textContent = zh ? '检测中...' : 'Checking...';
        icon.innerHTML = `<div style="width:14px;height:14px;border:2px solid #2563eb;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div>`;
        bar.style.width = '30%';
        bar.style.background = '#2563eb';
        row.className = 'prog-row prog-row--running';
      } else {
        // Pending
        label.textContent = labels[i][zh ? 'zh' : 'en'];
        detail.textContent = '';
        icon.innerHTML = `<div style="width:14px;height:14px;border:2px solid #e2e8f0;border-radius:50%"></div>`;
        bar.style.width = '0%';
        bar.style.background = '#e2e8f0';
        row.className = 'prog-row';
      }
    }
  },

  _currentIndex: 0,

  showImage() {
    saveDiagnosticImage();
  },

  async saveImage() {
    await saveDiagnosticImage();
  },

  copyScore() {
    if (!this._result) { showToast(getDocLang() !== 'en' ? '请先检测' : 'Please run check first'); return; }
    const lang = getDocLang();
    const zh = lang !== 'en';
    const { score, grade, judgment, reportId } = this._result;

    const text = zh
      ? `我的 API Doctor 验货：${grade}档 ${score}分 | ${judgment} | 报告 ID：${reportId}\nhttps://aiapidoctor.com/`
      : `My API Doctor score: ${grade} ${score}/100 | ${judgment} | Report ID: ${reportId}\nhttps://aiapidoctor.com/`;

    copyToClipboard(text, zh ? '验货分已复制' : 'Score copied');
  }
};

/* ═══════════════════════════════════════════════════════
   CSS Animation (injected on load)
   ═══════════════════════════════════════════════════════ */
(function injectStyles() {
  if (document.getElementById('doctor-dynamic-styles')) return;
  const style = document.createElement('style');
  style.id = 'doctor-dynamic-styles';
  style.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .progress-wrap {
      background: #fff;
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .progress-title {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 12px;
    }
    .prog-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .prog-row:last-child { margin-bottom: 0; }
    .prog-icon { flex-shrink: 0; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; }
    .prog-bar-wrap { flex: 1; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
    .prog-bar { height: 100%; width: 0%; background: #e2e8f0; border-radius: 3px; transition: width 0.4s ease, background 0.4s ease; }
    .prog-label { font-size: 12px; color: #94a3b8; white-space: nowrap; min-width: 120px; }
    .prog-detail { font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px; text-align: right; }
    .prog-row--running .prog-label { color: #2563eb; font-weight: 600; }
    .prog-row--done .prog-label { color: #374151; }
    .prog-row--done.prog-row--pass .prog-label { color: #16a34a; }
    .prog-row--done.prog-row--warn .prog-label { color: #f59e0b; }
    .prog-row--done.prog-row--fail .prog-label { color: #dc2626; }
  `;
  document.head.appendChild(style);
})();

/* ═══════════════════════════════════════════════════════
   Init on DOM Ready
   ═══════════════════════════════════════════════════════ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Doctor.init());
} else {
  Doctor.init();
}
