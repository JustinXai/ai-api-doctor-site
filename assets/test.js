/**
 * AI API Doctor — Diagnostic Engine v2
 * website/assets/test.js
 *
 * Architecture:
 * 1. Pre-flight checks (parallel): reachability, auth, model list
 * 2. Sequential diagnostic checks: target model call + stability
 * 3. Raw score → cap rules → final score → grade
 *
 * Security: API Key NEVER in localStorage/console/URL/report images/copy text
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
const PROMPT_STABILITY = 'Reply with exactly: OK';

/* ═══════════════════════════════════════════════════════
   Score weights (total = 100)
   ═══════════════════════════════════════════════════════ */
const WEIGHT = {
  reachability:   12,   // Base URL reachable
  auth:           14,   // API Key valid
  modelList:      12,   // /models or /v1/models accessible
  autoModel:      10,   // Auto-detected a recommended model
  targetCall:     22,   // Target model responds correctly
  stability:      18,   // Stability sampling (5 sub-metrics)
  usageAudit:      6,   // Usage/token data present
  clientConfig:    6,   // Client config export friendly
};
// Derived
WEIGHT.total = Object.values(WEIGHT).reduce((a, b) => a + b, 0); // 100

/* ═══════════════════════════════════════════════════════
   Grade table
   ═══════════════════════════════════════════════════════ */
const GRADES = [
  { min: 95, grade: 'A', label: 'Excellent', labelZh: '优秀', color: '#16a34a', bg: '#dcfce7', desc: '兼容性和稳定性表现优秀', descZh: '兼容性和稳定性表现优秀' },
  { min: 90, grade: 'B', label: 'Good',      labelZh: '良好', color: '#3b82f6', bg: '#eff6ff', desc: '可正常使用，但仍有少量限制', descZh: '可正常使用，但仍有少量限制' },
  { min: 80, grade: 'C', label: 'Fair',     labelZh: '一般', color: '#f59e0b', bg: '#fef9c3', desc: '可以使用，但部分检测项需要注意', descZh: '可以使用，但部分检测项需要注意' },
  { min: 65, grade: 'D', label: 'Limited',  labelZh: '受限', color: '#f97316', bg: '#ffedd5', desc: '部分兼容，可能影响实际使用', descZh: '部分兼容，可能影响实际使用' },
  { min: 40, grade: 'E', label: 'Poor',     labelZh: '较差', color: '#dc2626', bg: '#fee2e2', desc: '存在明显兼容性问题', descZh: '存在明显兼容性问题' },
  { min: 0,  grade: 'F', label: 'Failed',   labelZh: '失败', color: '#dc2626', bg: '#fee2e2', desc: '当前配置不可用', descZh: '当前配置不可用' },
];

function getGrade(score) {
  for (const g of GRADES) {
    if (score >= g.min) return g;
  }
  return GRADES[GRADES.length - 1];
}

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

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3500);
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
    if (stream && streamOptions) body.stream_options = streamOptions;
  } else if (interfaceType === 'OpenAI Responses') {
    body = { model, input: prompt, max_output_tokens: maxTokens, stream };
  } else {
    body = { model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, stream };
  }

  const headers = { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' };
  if (interfaceType === 'Claude Messages') headers['anthropic-version'] = '2023-06-01';

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
    if (typeof mc === 'string' && mc.trim()) return { text: mc.trim(), status: 'present' };
    if (Array.isArray(mc)) {
      for (const part of mc) {
        if (part?.type === 'text' && part?.text?.trim()) return { text: part.text.trim(), status: 'present' };
      }
    }
    if (c0.message?.reasoning_content && String(c0.message.reasoning_content).trim()) {
      return { text: String(c0.message.reasoning_content).trim(), status: 'present' };
    }
    if (c0.message?.tool_calls && c0.message.tool_calls.length > 0) return { text: '[tool_calls]', status: 'present' };
    const delta = c0.delta;
    if (delta?.content && String(delta.content).trim()) return { text: String(delta.content).trim(), status: 'present' };

  } else if (interfaceType === 'OpenAI Responses') {
    if (data.output_text && String(data.output_text).trim()) return { text: String(data.output_text).trim(), status: 'present' };
    if (data.response?.output_text && String(data.response.output_text).trim()) return { text: String(data.response.output_text).trim(), status: 'present' };
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
        if (part?.type === 'text' && part?.text?.trim()) return { text: part.text.trim(), status: 'present' };
        if (part?.type === 'tool_use') return { text: '[tool_use]', status: 'present' };
      }
    }
    if (data.delta?.text && String(data.delta.text).trim()) return { text: String(data.delta.text).trim(), status: 'present' };
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

  if (/^https?:\/\//.test(text)) return { baseUrl: text.replace(/\/$/, ''), apiKey: '', model: '' };
  if (/^sk-/.test(text)) return { baseUrl: '', apiKey: text, model: '' };
  return {};
}

/* ═══════════════════════════════════════════════════════
   STEP 1: Pre-flight Checks (run in parallel)
   ═══════════════════════════════════════════════════════ */

/**
 * Check A: Base URL Reachability (12 pts)
 * Simple HEAD/GET request to base URL to see if it responds.
 */
async function checkA_Reachability(baseUrl, apiKey, signal) {
  const start = Date.now();
  try {
    const url = baseUrl.replace(/\/$/, '');
    const resp = await fetch(url, { method: 'HEAD', signal, keepalive: false });
    const elapsed = Date.now() - start;
    const zhFn = getDocLang() !== 'en';
    if (resp.ok) {
      return { state: 'pass', pts: WEIGHT.reachability, ptsEarned: WEIGHT.reachability, detail: `${zhFn ? '可达' : 'Reachable'} (${elapsed}ms)`, reason: '' };
    }
    // Server responded but returned non-2xx — still reachable
    return { state: 'pass', pts: WEIGHT.reachability, ptsEarned: WEIGHT.reachability, detail: `${zhFn ? '可达' : 'Reachable'} (${resp.status}, ${elapsed}ms)`, reason: resp.status === 404 ? (zhFn ? '根路径返回404，对部分API正常' : 'Root path 404 — normal for some OpenAI-compatible APIs') : '' };
  } catch (err) {
    if (err.name === 'AbortError') return { state: 'fail', pts: WEIGHT.reachability, ptsEarned: 0, detail: '超时', reason: 'Base URL request timed out' };
    return { state: 'fail', pts: WEIGHT.reachability, ptsEarned: 0, detail: '网络错误', reason: 'Base URL not reachable: ' + err.message };
  }
}

/**
 * Check B: API Key Authentication (14 pts)
 * Try to call /models with the key to see if it auths correctly.
 */
async function checkB_Auth(baseUrl, apiKey, signal) {
  try {
    const url = (baseUrl.replace(/\/$/, '') + '/models').replace(/\/+/g, '/').replace(':/', '://');
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      signal
    });
    if (resp.status === 401 || resp.status === 403) {
      return { state: 'fail', pts: WEIGHT.auth, ptsEarned: 0, detail: 'Key无效', reason: 'API Key returned 401/403 — invalid or expired' };
    }
    if (resp.status >= 400) {
      return { state: 'fail', pts: WEIGHT.auth, ptsEarned: 0, detail: `HTTP ${resp.status}`, reason: 'Auth request failed with HTTP ' + resp.status };
    }
    return { state: 'pass', pts: WEIGHT.auth, ptsEarned: WEIGHT.auth, detail: '鉴权通过', reason: '' };
  } catch (err) {
    if (err.name === 'AbortError') return { state: 'fail', pts: WEIGHT.auth, ptsEarned: 0, detail: '超时', reason: 'Auth check timed out' };
    return { state: 'fail', pts: WEIGHT.auth, ptsEarned: 0, detail: '网络错误', reason: 'Auth check failed: ' + err.message };
  }
}

/**
 * Check C: Model List Discovery (12 pts)
 * Fetch /models or /v1/models to get available models.
 */
async function checkC_ModelList(baseUrl, apiKey, signal) {
  const candidates = [
    (baseUrl.replace(/\/$/, '') + '/models').replace(/\/+/g, '/').replace(':/', '://'),
    (baseUrl.replace(/\/$/, '') + '/v1/models').replace(/\/+/g, '/').replace(':/', '://'),
  ];
  let lastErr = '无法获取模型列表';
  let data = null;

  for (const url of candidates) {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        signal
      });
      if (resp.status === 401 || resp.status === 403) {
        lastErr = '鉴权失败';
        break;
      }
      if (!resp.ok) { lastErr = 'HTTP ' + resp.status; continue; }
      data = await resp.json();
      break;
    } catch (err) {
      if (err.name === 'AbortError') { lastErr = '超时'; break; }
      lastErr = '请求失败';
    }
  }

  if (!data) return { state: 'fail', pts: WEIGHT.modelList, ptsEarned: 0, detail: lastErr, reason: 'Model list endpoint not accessible', models: [] };

  let models = [];
  if (Array.isArray(data.data)) {
    models = data.data.map(m => m.id || '').filter(Boolean);
  } else if (Array.isArray(data.models)) {
    models = data.models.map(m => typeof m === 'string' ? m : m.id || '').filter(Boolean);
  } else if (Array.isArray(data)) {
    models = data.map(m => typeof m === 'string' ? m : m.id || '').filter(Boolean);
  }

  if (models.length === 0) {
    return { state: 'fail', pts: WEIGHT.modelList, ptsEarned: 0, detail: '模型列表为空', reason: 'Model list endpoint returned empty array', models: [] };
  }
  return { state: 'pass', pts: WEIGHT.modelList, ptsEarned: WEIGHT.modelList, detail: `${models.length}个模型`, reason: '', models };
}

/**
 * Check D: Auto-detect Recommended Model (10 pts)
 * Pick the first recommended model from the list or use user-provided one.
 */
function checkD_AutoModel(userModel, modelListResult) {
  const models = modelListResult?.models || [];
  // Prefer user-provided model if it exists
  if (userModel && userModel.trim()) {
    const found = models.some(m => m.toLowerCase().includes(userModel.toLowerCase())) || models.length === 0;
    return {
      state: 'pass', pts: WEIGHT.autoModel, ptsEarned: WEIGHT.autoModel,
      detail: userModel,
      reason: found ? '' : 'User provided model not in list',
      recommendedModel: userModel.trim()
    };
  }
  // Pick first available
  if (models.length > 0) {
    return {
      state: 'pass', pts: WEIGHT.autoModel, ptsEarned: WEIGHT.autoModel,
      detail: models[0],
      reason: '',
      recommendedModel: models[0]
    };
  }
  return {
    state: 'fail', pts: WEIGHT.autoModel, ptsEarned: 0,
    detail: '无可用模型',
    reason: 'No model available — user did not provide one and model list is empty',
    recommendedModel: ''
  };
}

/* ═══════════════════════════════════════════════════════
   STEP 2: Target Model Calls (22 pts)
   Sub-checks: output + bill + overcount + stream
   ═══════════════════════════════════════════════════════ */

/**
 * Target model chat completion (22 pts total)
 * - Has content: 10
 * - Has bill: 7
 * - No token overcount: 5
 */
async function checkE_TargetCall(baseUrl, apiKey, model, interfaceType, signal) {
  const sub = {};

  // E1: Output (10 pts)
  try {
    const req = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_SHORT, 20);
    const resp = await fetch(req.endpoint, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal
    });

    if (resp.status === 401 || resp.status === 403) {
      sub.output = { state: 'fail', pts: 10, ptsEarned: 0, detail: 'Key无效', reason: 'API Key invalid (401/403)' };
      sub.bill = { state: 'fail', pts: 7, ptsEarned: 0, detail: '无法验证', reason: 'Request blocked by auth error' };
      sub.overcount = { state: 'fail', pts: 5, ptsEarned: 0, detail: '无法验证', reason: 'Cannot test due to auth error' };
      return { ...sub, httpStatus: resp.status };
    }
    if (resp.status >= 400) {
      sub.output = { state: 'fail', pts: 10, ptsEarned: 0, detail: `HTTP ${resp.status}`, reason: 'Request returned HTTP ' + resp.status };
      sub.bill = { state: 'fail', pts: 7, ptsEarned: 0, detail: 'HTTP ' + resp.status, reason: 'Request failed' };
      sub.overcount = { state: 'fail', pts: 5, ptsEarned: 0, detail: 'HTTP ' + resp.status, reason: 'Request failed' };
      return { ...sub, httpStatus: resp.status };
    }

    const data = await resp.json();
    const output = extractVisibleOutput(data, interfaceType);
    const usage = data.usage || {};

    if (output.status === 'present' && output.text.length > 0) {
      sub.output = { state: 'pass', pts: 10, ptsEarned: 10, detail: '有内容', reason: '' };
    } else if (output.status === 'unknown') {
      sub.output = { state: 'warn', pts: 10, ptsEarned: 5, detail: '格式异常', reason: 'Response format not recognized' };
    } else {
      sub.output = { state: 'fail', pts: 10, ptsEarned: 0, detail: '没内容', reason: 'No valid content in response' };
    }

    // E2: Bill (7 pts)
    const hasPromptTokens = usage.prompt_tokens != null || usage.input_tokens != null;
    const hasCompletionTokens = usage.completion_tokens != null || usage.output_tokens != null;
    const hasTotalTokens = usage.total_tokens != null;
    if (hasPromptTokens && hasCompletionTokens && hasTotalTokens) {
      sub.bill = { state: 'pass', pts: 7, ptsEarned: 7, detail: '有明细', reason: '' };
    } else if (hasTotalTokens) {
      sub.bill = { state: 'warn', pts: 7, ptsEarned: 3, detail: '明细不全', reason: 'Incomplete usage data — some token fields missing' };
    } else {
      sub.bill = { state: 'fail', pts: 7, ptsEarned: 0, detail: '没给账单', reason: 'No usage data returned — cannot audit token consumption' };
    }

    // E3: Token overcount (5 pts)
    const shortPrompt = 'Hi';
    const totalTokens = usage.total_tokens || 0;
    const promptTokens = usage.prompt_tokens || usage.input_tokens || 0;
    const threshold = Math.max(3 * 5, promptTokens * 3, 20);
    if (totalTokens > threshold) {
      sub.overcount = { state: 'fail', pts: 5, ptsEarned: 0, detail: '疑似虚标', reason: `Token count (${totalTokens}) far exceeds expected (~${threshold}) for short prompt` };
    } else {
      sub.overcount = { state: 'pass', pts: 5, ptsEarned: 5, detail: '未虚标', reason: '' };
    }

    return { ...sub, httpStatus: resp.status, usage };

  } catch (err) {
    if (err.name === 'AbortError') {
      sub.output = { state: 'fail', pts: 10, ptsEarned: 0, detail: '超时', reason: 'Request timed out' };
    } else {
      sub.output = { state: 'fail', pts: 10, ptsEarned: 0, detail: '网络错误', reason: 'Network error: ' + err.message };
    }
    sub.bill = { state: 'fail', pts: 7, ptsEarned: 0, detail: '网络错误', reason: 'Network error' };
    sub.overcount = { state: 'fail', pts: 5, ptsEarned: 0, detail: '网络错误', reason: 'Network error' };
    return sub;
  }
}

/**
 * Check F: Streaming + Usage (stability of streaming endpoint)
 * Only runs if streaming is supported.
 */
async function checkF_Streaming(baseUrl, apiKey, model, interfaceType, signal) {
  try {
    const req = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_SHORT, {
      maxTokens: 30, stream: true, streamOptions: { include_usage: true }
    });
    const resp = await fetch(req.endpoint, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal
    });

    if (resp.status >= 400) {
      return { state: 'pass', pts: 0, ptsEarned: 0, detail: '流式不支持', reason: 'Streaming returned error — might not be supported' };
    }
    if (!resp.body) {
      return { state: 'warn', pts: 0, ptsEarned: 0, detail: '流式无响应体', reason: 'Streaming returned no readable body' };
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let hasContent = false, hasUsage = false, buffer = '';

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
              if (usage && (usage.prompt_tokens || usage.completion_tokens || usage.total_tokens)) hasUsage = true;
              if (extractVisibleOutput(chunk, interfaceType).status === 'present') hasContent = true;
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    if (hasContent && !hasUsage) {
      return { state: 'fail', pts: 0, ptsEarned: 0, detail: '流式丢账', reason: 'Streaming returns content but drops usage data — potential billing issue' };
    }
    if (hasUsage) {
      return { state: 'pass', pts: 0, ptsEarned: 0, detail: '流式有账', reason: '' };
    }
    return { state: 'warn', pts: 0, ptsEarned: 0, detail: '流式无数据', reason: 'Streaming returned no parseable data' };
  } catch (err) {
    if (err.name === 'AbortError') return { state: 'pass', pts: 0, ptsEarned: 0, detail: '超时跳过', reason: '' };
    return { state: 'warn', pts: 0, ptsEarned: 0, detail: '流式异常', reason: 'Streaming test error: ' + err.message };
  }
}

/* ═══════════════════════════════════════════════════════
   STEP 3: Stability Sampling (18 pts)
   Sub-metrics:
     success_rate   (8 pts): 3/3=8, 2/3=5, 1/3=2, 0/3=0
     avg_latency    (4 pts): <2000=4, <5000=3, <10000=2, >=10000=0
     latency_jitter (3 pts): small=3, medium=2, large=1, calc_fail=0
     consistency    (2 pts): all_ok=2, partial=1, none=0
     err_explain    (1 pt):  clear=1, unclear=0
   ═══════════════════════════════════════════════════════ */
async function checkG_Stability(baseUrl, apiKey, model, interfaceType, signal) {
  const TOTAL = 3;

  async function onePing(abortController) {
    const start = Date.now();
    let ok = false, status = 0, hasContent = false, errMsg = '', errExplain = 0;
    let latency = 0;
    try {
      const req = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_STABILITY, 5);
      const resp = await fetch(req.endpoint, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: abortController.signal,
        keepalive: false
      });
      latency = Date.now() - start;
      status = resp.status;
      ok = resp.ok;

      if (ok) {
        try {
          const data = await resp.json();
          const out = extractVisibleOutput(data, interfaceType);
          hasContent = out.status === 'present' && out.text.length > 0;
          // Check if response looks like OK
          const text = out.text.trim().toUpperCase();
          if (text === 'OK') errExplain = 1;
          else if (text.length > 0) errExplain = 0;
          else errExplain = 1;
        } catch (_) {
          errMsg = 'JSON解析失败';
          errExplain = 0;
        }
      } else {
        try {
          const errData = await resp.json();
          errMsg = errData.error?.message || errData.error?.type || errData.message || '';
        } catch (_) {
          errMsg = resp.statusText || 'HTTP ' + status;
        }
        if (!errMsg) errExplain = 0;
        else errExplain = 1;
      }
    } catch (err) {
      latency = Date.now() - start;
      ok = false;
      errMsg = err.name === 'AbortError' ? '超时' : err.message;
      errExplain = errMsg ? 1 : 0;
    }
    return { latency, ok, status, hasContent, errMsg, errExplain };
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
    if (i < TOTAL - 1) await sleep(1000);
  }

  // Sub-metric 1: Success rate (8 pts)
  const successCount = samples.filter(s => s.ok && s.hasContent).length;
  const successPts = successCount === 3 ? 8 : successCount === 2 ? 5 : successCount === 1 ? 2 : 0;

  // Sub-metric 2: Avg latency (4 pts)
  const okSamples = samples.filter(s => s.ok);
  const avgLat = okSamples.length > 0 ? okSamples.reduce((a, s) => a + s.latency, 0) / okSamples.length : 99999;
  let latencyPts = 4;
  if (avgLat >= 10000) latencyPts = 0;
  else if (avgLat >= 5000) latencyPts = 2;
  else if (avgLat >= 2000) latencyPts = 3;

  // Sub-metric 3: Latency jitter (3 pts) — CV-based
  let jitterPts = 0;
  if (okSamples.length >= 2) {
    const times = okSamples.map(s => s.latency);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const stddev = Math.sqrt(times.reduce((a, t) => a + Math.pow(t - mean, 2), 0) / times.length);
    const cv = mean > 0 ? (stddev / mean) * 100 : 0;
    if (cv < 20) jitterPts = 3;
    else if (cv < 40) jitterPts = 2;
    else jitterPts = 1;
  }

  // Sub-metric 4: Consistency — all return OK (2 pts)
  const consistencyPts = successCount === 3 ? 2 : successCount >= 1 ? 1 : 0;

  // Sub-metric 5: Error explainability (1 pt)
  const errExplainSum = samples.reduce((a, s) => a + s.errExplain, 0);
  const explainPts = errExplainSum >= TOTAL ? 1 : errExplainSum > 0 ? 1 : 0;

  const totalPts = successPts + latencyPts + jitterPts + consistencyPts + explainPts;

  // State
  let state = 'pass';
  if (successCount === 3 && avgLat < 2000) state = 'pass';
  else if (successCount >= 2 && avgLat < 5000) state = 'pass';
  else if (successCount >= 1) state = 'warn';
  else state = 'fail';

  // Detail
  const detail = `${successCount}/3成功,均${Math.round(avgLat)}ms`;

  return {
    state, pts: WEIGHT.stability, ptsEarned: totalPts,
    detail,
    sub: {
      success: { pts: 8, ptsEarned: successPts, detail: `${successCount}/3成功` },
      latency: { pts: 4, ptsEarned: latencyPts, detail: avgLat < 99999 ? `均${Math.round(avgLat)}ms` : 'N/A' },
      jitter: { pts: 3, ptsEarned: jitterPts, detail: jitterPts === 3 ? '稳定' : jitterPts === 2 ? '波动一般' : jitterPts === 1 ? '波动较大' : '无法计算' },
      consistency: { pts: 2, ptsEarned: consistencyPts, detail: successCount === 3 ? '一致' : successCount >= 1 ? '部分一致' : '不一致' },
      explain: { pts: 1, ptsEarned: explainPts, detail: explainPts ? '错误可读' : '错误不可读' },
    },
    samples,
    reason: totalPts < WEIGHT.stability ? `稳定性得分 ${totalPts}/${WEIGHT.stability}` : ''
  };
}

/* ═══════════════════════════════════════════════════════
   STEP 4: Usage Audit (6 pts)
   Does the API return sufficient usage data for auditing?
   ═══════════════════════════════════════════════════════ */
async function checkH_UsageAudit(baseUrl, apiKey, model, interfaceType, signal) {
  try {
    const req = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_SHORT, 20);
    const resp = await fetch(req.endpoint, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal
    });
    if (resp.status >= 400) {
      return { state: 'fail', pts: WEIGHT.usageAudit, ptsEarned: 0, detail: '请求失败', reason: 'Request failed' };
    }
    const data = await resp.json();
    const usage = data.usage || {};

    const hasPrompt = usage.prompt_tokens != null || usage.input_tokens != null;
    const hasCompletion = usage.completion_tokens != null || usage.output_tokens != null;
    const hasTotal = usage.total_tokens != null;
    const hasCached = !!(usage.prompt_tokens_details?.cached_tokens || usage.input_tokens_details?.cached_tokens);

    if (hasPrompt && hasCompletion && hasTotal) {
      return {
        state: 'pass', pts: WEIGHT.usageAudit, ptsEarned: WEIGHT.usageAudit,
        detail: '明细完整', reason: '',
        sub: { prompt: hasPrompt, completion: hasCompletion, total: hasTotal, cached: hasCached }
      };
    } else if (hasTotal) {
      return {
        state: 'warn', pts: WEIGHT.usageAudit, ptsEarned: Math.round(WEIGHT.usageAudit / 2),
        detail: '明细不全', reason: 'Partial usage data — cannot fully audit token consumption',
        sub: { prompt: hasPrompt, completion: hasCompletion, total: hasTotal, cached: hasCached }
      };
    } else {
      return {
        state: 'fail', pts: WEIGHT.usageAudit, ptsEarned: 0,
        detail: '无明细', reason: 'No usage data returned — cannot audit token consumption at all',
        sub: { prompt: hasPrompt, completion: hasCompletion, total: hasTotal, cached: hasCached }
      };
    }
  } catch (err) {
    if (err.name === 'AbortError') return { state: 'fail', pts: WEIGHT.usageAudit, ptsEarned: 0, detail: '超时', reason: 'Request timed out' };
    return { state: 'fail', pts: WEIGHT.usageAudit, ptsEarned: 0, detail: '网络错误', reason: 'Network error: ' + err.message };
  }
}

/* ═══════════════════════════════════════════════════════
   STEP 5: Client Config Export (6 pts)
   Can we construct a working client config from the info?
   ═══════════════════════════════════════════════════════ */
function checkI_ClientConfig(baseUrl, apiKey, model, modelListResult) {
  const hasUrl = !!(baseUrl && baseUrl.startsWith('http'));
  const hasKey = !!(apiKey && apiKey.startsWith('sk-'));
  const hasModel = !!(model && model.trim());
  const hasModelList = !!(modelListResult?.models?.length > 0);

  const score = [hasUrl, hasKey, hasModel, hasModelList].filter(Boolean).length;
  // 4/4 = 6, 3/4 = 5, 2/4 = 3, 1/4 = 1, 0/4 = 0
  const ptsMap = [0, 1, 3, 5, 6];
  const ptsEarned = ptsMap[Math.min(score, 4)];

  if (score >= 3) return { state: 'pass', pts: WEIGHT.clientConfig, ptsEarned, detail: '配置完整', reason: '' };
  if (score >= 2) return { state: 'warn', pts: WEIGHT.clientConfig, ptsEarned, detail: '配置不全', reason: 'Some client config fields missing' };
  return { state: 'fail', pts: WEIGHT.clientConfig, ptsEarned, detail: '配置缺失', reason: 'Missing critical client config fields' };
}

/* ═══════════════════════════════════════════════════════
   Score Calculator
   ═══════════════════════════════════════════════════════ */
function calcScore(result) {
  let raw = 0;
  for (const key of Object.keys(result.checks)) {
    const c = result.checks[key];
    raw += c.ptsEarned || 0;
  }
  return raw;
}

/**
 * Apply hard cap rules to the raw score.
 * Each cap is the ABSOLUTE MAXIMUM score achievable given the failure.
 */
function applyCaps(rawScore, result) {
  const { checks } = result;
  const reachFail = checks.reachability?.state === 'fail';
  const authFail = checks.auth?.state === 'fail';
  const modelListFail = checks.modelList?.state === 'fail';
  const autoModelFail = checks.autoModel?.state === 'fail';
  const targetOutputFail = checks.target?.sub?.output?.state === 'fail';
  const targetOutputWarn = checks.target?.sub?.output?.state === 'warn';
  const stabilityFail = checks.stability?.state === 'fail';
  const stabilityWarn = checks.stability?.state === 'warn';
  const stabilityFull = checks.stability?.sub?.success?.ptsEarned === 8;
  const avgLatHigh = (checks.stability?.sub?.latency?.ptsEarned || 0) <= 2;
  const usageFail = checks.usage?.state === 'fail';
  const usageWarn = checks.usage?.state === 'warn';
  const clientFail = checks.client?.state === 'fail';
  const http4xx = checks.target?.httpStatus >= 400;

  let cap = 100;

  if (reachFail) cap = Math.min(cap, 25);
  else if (authFail) cap = Math.min(cap, 40);
  else if (modelListFail) cap = Math.min(cap, 55);
  else if (autoModelFail) cap = Math.min(cap, 70);

  if (http4xx) cap = Math.min(cap, 40);

  if (targetOutputFail) cap = Math.min(cap, 60);
  else if (targetOutputWarn) cap = Math.min(cap, 75);

  if (!stabilityFull) cap = Math.min(cap, 88);
  if (stabilityFail) cap = Math.min(cap, 60);
  if (avgLatHigh) cap = Math.min(cap, 90);

  if (usageFail) cap = Math.min(cap, 94);
  else if (usageWarn) cap = Math.min(cap, 97);

  if (clientFail) cap = Math.min(cap, 94);

  // Additional: 3/3 stability but usage missing → 88-94
  if (stabilityFull && usageFail) cap = Math.min(cap, 94);
  if (stabilityFull && !usageFail && !usageWarn && !clientFail) cap = 100;

  return Math.min(rawScore, cap);
}

function getJudgment(score, result) {
  const g = getGrade(score);
  const zh = getDocLang() !== 'en';
  if (score >= 95) return zh ? '优秀' : 'Excellent';
  if (score >= 90) return zh ? '良好' : 'Good';
  if (score >= 80) return zh ? '一般' : 'Fair';
  if (score >= 65) return zh ? '受限' : 'Limited';
  if (score >= 40) return zh ? '较差' : 'Poor';
  return zh ? '失败' : 'Failed';
}

function getOneLineFinding(score, result) {
  const zh = getDocLang() !== 'en';
  const { checks } = result;
  const fails = Object.values(checks).filter(c => c?.state === 'fail');
  const warns = Object.values(checks).filter(c => c?.state === 'warn');

  // Score-based summary (takes precedence)
  if (score >= 95) return zh ? '所有核心检测表现优秀' : 'All core checks excellent';
  if (score >= 90) return zh ? '核心功能可用，存在少量限制' : 'Core functions available, minor limitations';
  if (score >= 80) return zh ? '可用，但部分项目需要注意' : 'Usable, some items need attention';
  if (score >= 65) return zh ? '部分兼容，存在明显限制' : 'Partial compatibility, significant limitations';
  if (score >= 40) return zh ? '存在严重兼容问题' : 'Serious compatibility issues';
  return zh ? '当前配置不可用' : 'Current config unavailable';
}

/* ═══════════════════════════════════════════════════════
   Report Card HTML Builder
   ═══════════════════════════════════════════════════════ */
function buildReportCardHTML(result, formData, lang) {
  const zh = lang !== 'en';
  const { score, checks, reportId } = result;
  const grade = getGrade(score);

  const escH = (s) => esc(String(s || ''));

  function pillByScore(ptsEarned, pts) {
    if (!pts) return '';
    const ratio = ptsEarned / pts;
    let state;
    if (ratio >= 0.8) state = 'pass';
    else if (ratio >= 0.4) state = 'warn';
    else state = 'fail';
    const colors = { pass: { c: '#16a34a', bg: '#dcfce7' }, warn: { c: '#f59e0b', bg: '#fef9c3' }, fail: { c: '#dc2626', bg: '#fee2e2' } };
    const { c, bg } = colors[state];
    const texts = { pass: zh ? '通过' : 'Pass', warn: zh ? '警告' : 'Warn', fail: zh ? '失败' : 'Fail' };
    return `<span style="display:inline-block;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700;color:${c};background:${bg}">${texts[state]}</span>`;
  }

  // Sub-item labels
  const stabSubLabels = {
    success: { zh: '成功率', en: 'Success Rate' },
    latency: { zh: '平均延迟', en: 'Avg Latency' },
    jitter: { zh: '延迟波动', en: 'Latency Jitter' },
    consistency: { zh: '返回一致性', en: 'Response Consistency' },
    explain: { zh: '错误可读性', en: 'Error Explainability' },
  };

  let stabilityOpen = false;
  function buildStabilitySection(check) {
    if (!check?.sub) return '';
    const subs = Object.entries(check.sub);
    const toggleId = 'stab-toggle-' + reportId;
    const contentId = 'stab-content-' + reportId;
    const subsHtml = subs.map(([k, v]) => {
      const lbl = stabSubLabels[k] ? stabSubLabels[k][zh ? 'zh' : 'en'] : (zh ? k : k);
      return `<div class="report-sub-row" style="padding-left:20px">
        <div class="report-row-label">${escH('  ' + lbl)}</div>
        <div class="report-row-score">${v.ptsEarned}/${v.pts}</div>
        <div class="report-row-pill">${pillByScore(v.ptsEarned, v.pts)}</div>
        <div class="report-row-detail">${escH(v.detail || '')}</div>
      </div>`;
    }).join('');
    return `<div class="report-row">
      <div class="report-row-label">${escH(itemLabels.stability[zh ? 'zh' : 'en'])}</div>
      <div class="report-row-score">${check.ptsEarned}/${check.pts}</div>
      <div class="report-row-pill">${pillByScore(check.ptsEarned, check.pts)}</div>
      <div class="report-row-detail">
        ${escH(check.detail || '')}
        <button onclick="(function(){var t=document.getElementById('${contentId}');var i=document.getElementById('${toggleId}');t.style.display=t.style.display=='none'?'block':'none';i.textContent=t.style.display=='none'?'[${zh?'展开':'Expand'}]':'[${zh?'收起':'Collapse'}]';})()" style="background:none;border:none;cursor:pointer;color:#2563eb;font-size:11px;padding:0 0 0 4px;font-family:inherit" id="${toggleId}">[${zh?'展开':'Expand'}]</button>
      </div>
    </div><div id="${contentId}" style="display:none">${subsHtml}</div>`;
  }

  function itemRow(key, label, check) {
    if (!check) return '';
    return `<div class="report-row">
      <div class="report-row-label">${escH(label)}</div>
      <div class="report-row-score">${check.ptsEarned}/${check.pts}</div>
      <div class="report-row-pill">${pillByScore(check.ptsEarned, check.pts)}</div>
      <div class="report-row-detail">${escH(check.detail || '')}</div>
    </div>`;
  }

  // Build all check rows
  const itemLabels = {
    reachability: { zh: 'Base URL 可达性', en: 'Base URL Reachability' },
    auth: { zh: '鉴权 / Key 有效性', en: 'Auth / Key Validity' },
    modelList: { zh: '模型列表获取', en: 'Model List Discovery' },
    autoModel: { zh: '自动识别推荐模型', en: 'Auto-detect Model' },
    target: { zh: '目标模型调用', en: 'Target Model Call' },
    stability: { zh: '稳定性采样', en: 'Stability Sampling' },
    usage: { zh: '用量审计', en: 'Usage Audit' },
    client: { zh: '客户端配置导出', en: 'Client Config Export' },
  };

  let rows = '';
  rows += itemRow('reachability', itemLabels.reachability[zh ? 'zh' : 'en'], checks.reachability);
  rows += itemRow('auth', itemLabels.auth[zh ? 'zh' : 'en'], checks.auth);
  rows += itemRow('modelList', itemLabels.modelList[zh ? 'zh' : 'en'], checks.modelList);
  rows += itemRow('autoModel', itemLabels.autoModel[zh ? 'zh' : 'en'], checks.autoModel);
  rows += itemRow('target', itemLabels.target[zh ? 'zh' : 'en'], checks.target);
  rows += buildStabilitySection(checks.stability);
  rows += itemRow('usage', itemLabels.usage[zh ? 'zh' : 'en'], checks.usage);
  rows += itemRow('client', itemLabels.client[zh ? 'zh' : 'en'], checks.client);

  // Reason section
  const failReasons = Object.values(checks)
    .filter(c => c?.state === 'fail' && c.reason)
    .map(c => c.reason);
  const warnReasons = Object.values(checks)
    .filter(c => c?.state === 'warn' && c.reason)
    .map(c => c.reason);

  let reasonHtml = '';
  if (failReasons.length > 0 || warnReasons.length > 0) {
    let items = failReasons.map(r => `<li>${escH(r)}</li>`).join('');
    if (warnReasons.length > 0) items += warnReasons.map(r => `<li style="color:#f59e0b">${escH(r)}</li>`).join('');
    reasonHtml = `<div class="report-section">
      <div class="report-section-title">${zh ? '扣分原因' : 'Deduction Reasons'}</div>
      <ul class="report-reason-list">${items}</ul>
    </div>`;
  }

  // Next step suggestions (score-based)
  const suggestions = [];
  const failNames = Object.entries(checks).filter(([, c]) => c?.state === 'fail').map(([k]) => k);
  const warnNames = Object.entries(checks).filter(([, c]) => c?.state === 'warn').map(([k]) => k);

  if (failNames.includes('reachability')) suggestions.push(zh ? '检查 Base URL 是否正确，端口是否开放' : 'Verify Base URL is correct and the port is open');
  if (failNames.includes('auth')) suggestions.push(zh ? '确认 API Key 有效且未过期' : 'Verify API Key is valid and not expired');
  if (failNames.includes('modelList')) suggestions.push(zh ? '该接口不支持模型列表查询，可手动填写模型 ID' : 'Model list not supported — fill in Model ID manually');
  if (failNames.includes('target')) suggestions.push(zh ? '确认填写的模型 ID 与中转站支持模型匹配' : 'Verify the model ID matches what this relay supports');
  if (failNames.includes('stability')) suggestions.push(zh ? '稳定性采样失败或波动较大，建议多次测试观察' : 'Stability issues detected — test multiple times to confirm');
  if (failNames.includes('usage')) suggestions.push(zh ? '该接口不返回用量数据，无法核验真实消耗' : 'No usage data — cannot audit actual token consumption');
  if (failNames.includes('autoModel')) suggestions.push(zh ? '自动识别失败，请手动填写模型 ID' : 'Auto-detect failed — fill in Model ID manually');
  if (suggestions.length === 0 && warnNames.includes('target')) suggestions.push(zh ? '目标模型调用未获得完整得分，请检查模型兼容性' : 'Target model call did not score full points — check model compatibility');
  if (suggestions.length === 0 && (warnNames.includes('stability') || warnNames.includes('usage'))) {
    suggestions.push(zh ? '当前配置部分兼容，建议继续观察实际调用稳定性' : 'Partial compatibility — monitor actual call stability');
  }
  if (suggestions.length === 0 && score >= 90) {
    suggestions.push(zh ? '各项核心检测表现优秀，建议持续观察' : 'All core checks excellent — monitor usage over time');
  } else if (suggestions.length === 0) {
    suggestions.push(zh ? '各项核心检测通过，建议持续观察' : 'All checks passed — monitor usage over time');
  }

  let suggestionHtml = `<div class="report-section">
    <div class="report-section-title">${zh ? '建议' : 'Next Steps'}</div>
    <ul class="report-reason-list">${suggestions.map(s => `<li>${escH(s)}</li>`).join('')}</ul>
  </div>`;

  // Safe baseUrl
  let safeBaseUrl = '';
  try { safeBaseUrl = new URL(formData.baseUrl).origin + new URL(formData.baseUrl).pathname.replace(/\/$/, ''); }
  catch (_) { safeBaseUrl = formData.baseUrl; }

  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#f8fafc;padding:32px;box-sizing:border-box">

    <div style="background:#0f172a;border-radius:20px;padding:18px 20px 16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div>
          <div style="font-size:16px;font-weight:800;color:#fff;letter-spacing:-0.3px">API Doctor</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">${zh ? '中转站最强照妖镜' : 'Relay API Black-box Check'}</div>
        </div>
        <div style="background:${grade.bg};border-radius:10px;padding:6px 14px;text-align:center;flex-shrink:0">
          <div style="font-size:24px;font-weight:900;color:${grade.color};line-height:1">${grade.grade}</div>
          <div style="font-size:9px;color:${grade.color};font-weight:600;margin-top:2px">${zh ? grade.labelZh : grade.label}</div>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:10px">
        <div style="font-size:64px;font-weight:900;color:${grade.color};line-height:1">${score}</div>
        <div style="font-size:14px;font-weight:700;color:${grade.color};margin-top:4px">${escH(getJudgment(score, result))}</div>
      </div>
      <div style="font-size:12px;color:#94a3b8;text-align:center;margin-top:4px">${escH(getOneLineFinding(score, result))}</div>
    </div>

    <div style="background:#fff;border-radius:16px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:10px">8 ${zh ? '项检测结果' : 'Diagnostic Results'}</div>
      ${rows}
    </div>

    ${reasonHtml}
    ${suggestionHtml}

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

  // Safe baseUrl
  let safeBaseUrl = '';
  try { safeBaseUrl = new URL(formData.baseUrl).origin + new URL(formData.baseUrl).pathname.replace(/\/$/, ''); }
  catch (_) { safeBaseUrl = formData.baseUrl; }

  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#f8fafc;padding:32px;box-sizing:border-box">

    <div style="background:#0f172a;border-radius:20px;padding:18px 20px 16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div>
          <div style="font-size:16px;font-weight:800;color:#fff;letter-spacing:-0.3px">API Doctor</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">${zh ? '中转站最强照妖镜' : 'Relay API Black-box Check'}</div>
        </div>
        <div style="background:${grade.bg};border-radius:10px;padding:6px 14px;text-align:center;flex-shrink:0">
          <div style="font-size:24px;font-weight:900;color:${grade.color};line-height:1">${grade.grade}</div>
          <div style="font-size:9px;color:${grade.color};font-weight:600;margin-top:2px">${zh ? grade.labelZh : grade.label}</div>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:10px">
        <div style="font-size:64px;font-weight:900;color:${grade.color};line-height:1">${score}</div>
        <div style="font-size:14px;font-weight:700;color:${grade.color};margin-top:4px">${escH(getJudgment(score, result))}</div>
      </div>
      <div style="font-size:12px;color:#94a3b8;text-align:center;margin-top:4px">${escH(getOneLineFinding(score, result))}</div>
    </div>

    <div style="background:#fff;border-radius:16px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:10px">8 ${zh ? '项检测结果' : 'Diagnostic Results'}</div>
      ${rows}
    </div>

    ${reasonHtml}
    ${suggestionHtml}

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
    if (typeof htmlToImage === 'undefined') { showToast('请使用浏览器截图'); return; }
    const lang = getDocLang();
    const zh = lang !== 'en';

    const sourceEl = document.getElementById('result-card');
    if (!sourceEl) { showToast('报告未生成'); return; }

    const clone = sourceEl.cloneNode(true);
    clone.style.cssText = 'position:fixed;top:0;left:0;display:block;width:560px;background:#f8fafc;padding:0;box-sizing:border-box;pointer-events:none';
    document.body.appendChild(clone);

    const dataUrl = await htmlToImage.toPng(clone, { pixelRatio: 2, cacheBust: true, backgroundColor: '#f8fafc', width: 560 });
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

  init() {
    this._interfaceType = 'OpenAI Chat';
    const btn = document.getElementById('find-models-btn');
    if (btn) btn.addEventListener('click', () => this.findModels());
  },

  normalizeBaseUrl(input) {
    let val = (typeof input === 'string' ? input : input?.value || '').trim().replace(/\/$/, '');
    val = val.replace(/\/v1\/v1$/, '/v1');
    if (!val.endsWith('/v1') && val.match(/^https?:\/\//)) val = val + '/v1';
    if (typeof input === 'object' && input.value !== undefined) input.value = val;
    return val;
  },

  setInterface(type) { this._interfaceType = type; },

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
      // Remove trailing slash, then strip the /v1/xxx path to get the root
      const root = baseUrl.replace(/\/$/, '').replace(/\/v1\/[^/]+(\/.*)?$/, '');
      const endpoints = [
        root + '/v1/models',
        root + '/models',
      ];

      let models = [];
      let lastErr = '';

      for (const endpoint of endpoints) {
        try {
          const resp = await fetch(endpoint, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }
          });

          if (resp.status === 401 || resp.status === 403) {
            lastErr = zh ? 'API Key无效' : 'Invalid API Key';
            break;
          }
          if (resp.status === 404) {
            lastErr = zh ? '接口不存在' : 'Endpoint not found';
            continue;
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
          lastErr = '解析失败';
        }
      }

      if (models.length > 0) {
        const modelEl = document.getElementById('doctor-model');
        if (modelEl && !modelEl.value) modelEl.value = models[0];
        showToast(zh ? `已填入：${models[0]}` : `Filled: ${models[0]}`);
      } else {
        showToast(zh ? '无法自动识别，请手动填写模型 ID' : 'Cannot auto-detect; fill in Model ID manually');
      }
    } catch (err) {
      showToast(zh ? '无法自动识别，请手动填写模型 ID' : 'Cannot auto-detect; fill in Model ID manually');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = zh ? '自动识别模型' : 'Auto-detect model'; }
    }
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

    this._formData = { baseUrl: normalizedUrl, model, interfaceType: this._interfaceType };
    this.showProgress('running');
    this._refreshProgress(0, 'pending');

    try {
      const signal = this._controller.signal;

      // ── Phase 1: Pre-flight checks (parallel) ──
      this._refreshProgress(0, 'running');
      const [reachResult, authResult, modelListResult] = await Promise.all([
        checkA_Reachability(normalizedUrl, apiKey, signal),
        checkB_Auth(normalizedUrl, apiKey, signal),
        checkC_ModelList(normalizedUrl, apiKey, signal),
      ]);
      this._refreshProgress(0, reachResult.state, reachResult.detail);
      this._refreshProgress(1, authResult.state, authResult.detail);
      this._refreshProgress(2, modelListResult.state, modelListResult.detail);

      // ── Phase 2: Auto-model detection ──
      this._refreshProgress(3, 'running');
      const autoModelResult = checkD_AutoModel(model, modelListResult);
      this._refreshProgress(3, autoModelResult.state, autoModelResult.detail);

      // Use recommended model (prefer auto-detected if user didn't provide)
      const targetModel = autoModelResult.recommendedModel || model;

      // ── Phase 3: Target model call ──
      this._refreshProgress(4, 'running');
      const targetResult = await checkE_TargetCall(normalizedUrl, apiKey, targetModel, this._interfaceType, signal);
      const targetState = (targetResult.sub?.output?.state === 'fail') ? 'fail'
        : (targetResult.sub?.output?.state === 'warn') ? 'warn' : 'pass';
      this._refreshProgress(4, targetState, targetResult.sub?.output?.detail || '');

      // ── Phase 4: Streaming check ──
      this._refreshProgress(5, 'running');
      const streamResult = await checkF_Streaming(normalizedUrl, apiKey, targetModel, this._interfaceType, signal);
      this._refreshProgress(5, streamResult.state, streamResult.detail);

      // ── Phase 5: Stability sampling ──
      this._refreshProgress(6, 'running');
      const stabilityResult = await checkG_Stability(normalizedUrl, apiKey, targetModel, this._interfaceType, signal);
      this._refreshProgress(6, stabilityResult.state, stabilityResult.detail);

      // ── Phase 6: Usage audit ──
      this._refreshProgress(7, 'running');
      const usageResult = await checkH_UsageAudit(normalizedUrl, apiKey, targetModel, this._interfaceType, signal);
      this._refreshProgress(7, usageResult.state, usageResult.detail);

      // ── Phase 7: Client config ──
      const clientResult = checkI_ClientConfig(normalizedUrl, apiKey, targetModel, modelListResult);

      // ── Assemble result ──
      const checks = {
        reachability: reachResult,
        auth: authResult,
        modelList: modelListResult,
        autoModel: autoModelResult,
        target: {
          ...targetResult,
          state: targetState,
          pts: 22,
          ptsEarned: (targetResult.sub?.output?.ptsEarned || 0) + (targetResult.sub?.bill?.ptsEarned || 0) + (targetResult.sub?.overcount?.ptsEarned || 0),
        },
        stability: stabilityResult,
        usage: usageResult,
        client: clientResult,
      };

      // Raw score
      let rawScore = calcScore({ checks });

      // Apply caps
      const finalScore = applyCaps(rawScore, { checks });
      const grade = getGrade(finalScore);
      const judgment = getJudgment(finalScore, { checks });
      const finding = getOneLineFinding(finalScore, { checks });

      this._result = {
        score: finalScore,
        rawScore,
        grade,
        judgment,
        finding,
        checks,
        reportId: generateReportId(),
        timestamp: new Date().toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
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

  /* ── 8-step progress bar ── */
  showProgress(state) {
    const container = document.getElementById('diag-progress');
    if (!container) return;
    if (state === 'done') { container.innerHTML = ''; return; }

    const zh = getDocLang() !== 'en';
    const steps = [
      { zh: '1/8 Base URL 可达性', en: '1/8 Base URL Reachability' },
      { zh: '2/8 鉴权有效性', en: '2/8 Auth / Key Validity' },
      { zh: '3/8 模型列表获取', en: '3/8 Model List Discovery' },
      { zh: '4/8 自动识别模型', en: '4/8 Auto-detect Model' },
      { zh: '5/8 目标模型调用', en: '5/8 Target Model Call' },
      { zh: '6/8 稳定性采样', en: '6/8 Stability Sampling' },
      { zh: '7/8 用量审计', en: '7/8 Usage Audit' },
      { zh: '8/8 客户端配置', en: '8/8 Client Config' },
    ];

    const rows = steps.map((s, i) =>
      `<div class="prog-row" id="prog-row-${i}" data-index="${i}">
        <span class="prog-icon" id="prog-icon-${i}"><div style="width:14px;height:14px;border:2px solid #e2e8f0;border-radius:50%"></div></span>
        <span class="prog-bar-wrap"><span class="prog-bar" id="prog-bar-${i}" style="width:0%"></span></span>
        <span class="prog-label" id="prog-label-${i}">${s[zh ? 'zh' : 'en']}</span>
        <span class="prog-detail" id="prog-detail-${i}"></span>
      </div>`
    ).join('');

    container.innerHTML = `<div class="progress-wrap">
      <div class="progress-title">${zh ? '检测进度' : 'Progress'}</div>
      ${rows}
    </div>`;
  },

  _refreshProgress(index, state, detail) {
    const zh = getDocLang() !== 'en';
    const steps = [
      { zh: '1/8 Base URL 可达性', en: '1/8 Base URL Reachability' },
      { zh: '2/8 鉴权有效性', en: '2/8 Auth / Key Validity' },
      { zh: '3/8 模型列表获取', en: '3/8 Model List Discovery' },
      { zh: '4/8 自动识别模型', en: '4/8 Auto-detect Model' },
      { zh: '5/8 目标模型调用', en: '5/8 Target Model Call' },
      { zh: '6/8 稳定性采样', en: '6/8 Stability Sampling' },
      { zh: '7/8 用量审计', en: '7/8 Usage Audit' },
      { zh: '8/8 客户端配置', en: '8/8 Client Config' },
    ];

    for (let i = 0; i < 8; i++) {
      const row = document.getElementById('prog-row-' + i);
      const icon = document.getElementById('prog-icon-' + i);
      const bar = document.getElementById('prog-bar-' + i);
      const label = document.getElementById('prog-label-' + i);
      const detailEl = document.getElementById('prog-detail-' + i);
      if (!row) continue;

      if (i < index) {
        // Already done
        label.textContent = steps[i][zh ? 'zh' : 'en'];
        detailEl.textContent = '';
        icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
        bar.style.width = '100%';
        bar.style.background = '#16a34a';
        row.className = 'prog-row prog-row--done';
      } else if (i === index) {
        if (state === 'pass') {
          label.textContent = steps[i][zh ? 'zh' : 'en'];
          detailEl.textContent = detail || (zh ? '通过' : 'Pass');
          icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
          bar.style.width = '100%';
          bar.style.background = '#16a34a';
          row.className = 'prog-row prog-row--done';
        } else if (state === 'warn') {
          label.textContent = steps[i][zh ? 'zh' : 'en'];
          detailEl.textContent = detail || (zh ? '警告' : 'Warn');
          icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="3"><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
          bar.style.width = '60%';
          bar.style.background = '#f59e0b';
          row.className = 'prog-row prog-row--done prog-row--warn';
        } else if (state === 'fail') {
          label.textContent = steps[i][zh ? 'zh' : 'en'];
          detailEl.textContent = detail || (zh ? '失败' : 'Fail');
          icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
          bar.style.width = '20%';
          bar.style.background = '#dc2626';
          row.className = 'prog-row prog-row--done prog-row--fail';
        } else {
          // Running
          label.textContent = steps[i][zh ? 'zh' : 'en'];
          detailEl.textContent = zh ? '检测中...' : 'Checking...';
          icon.innerHTML = `<div style="width:14px;height:14px;border:2px solid #2563eb;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div>`;
          bar.style.width = '30%';
          bar.style.background = '#2563eb';
          row.className = 'prog-row prog-row--running';
        }
      } else {
        // Pending
        label.textContent = steps[i][zh ? 'zh' : 'en'];
        detailEl.textContent = '';
        icon.innerHTML = `<div style="width:14px;height:14px;border:2px solid #e2e8f0;border-radius:50%"></div>`;
        bar.style.width = '0%';
        bar.style.background = '#e2e8f0';
        row.className = 'prog-row';
      }
    }
  },

  async saveImage() { await saveDiagnosticImage(); },

  copyScore() {
    if (!this._result) { showToast(getDocLang() !== 'en' ? '请先检测' : 'Please run check first'); return; }
    const lang = getDocLang();
    const zh = lang !== 'en';
    const { score, grade, judgment, reportId } = this._result;
    const text = zh
      ? `我的 API Doctor 验货：${grade.grade}档 ${score}分 | ${judgment} | 报告 ID：${reportId}\nhttps://aiapidoctor.com/`
      : `My API Doctor score: ${grade.grade} ${score}/100 | ${judgment} | Report ID: ${reportId}\nhttps://aiapidoctor.com/`;
    copyToClipboard(text, zh ? '验货分已复制' : 'Score copied');
  }
};

/* ═══════════════════════════════════════════════════════
   CSS (injected on load)
   ═══════════════════════════════════════════════════════ */
(function injectStyles() {
  if (document.getElementById('doctor-dynamic-styles')) return;
  const style = document.createElement('style');
  style.id = 'doctor-dynamic-styles';
  style.textContent = `
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .progress-wrap { background: #fff; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .progress-title { font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
    .prog-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .prog-row:last-child { margin-bottom: 0; }
    .prog-icon { flex-shrink: 0; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; }
    .prog-bar-wrap { flex: 1; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
    .prog-bar { height: 100%; width: 0%; background: #e2e8f0; border-radius: 3px; transition: width 0.4s ease, background 0.4s ease; display: block; }
    .prog-label { font-size: 12px; color: #94a3b8; white-space: nowrap; min-width: 130px; }
    .prog-detail { font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px; text-align: right; }
    .prog-row--running .prog-label { color: #2563eb; font-weight: 600; }
    .prog-row--done .prog-label { color: #374151; }
    .prog-row--done.prog-row--warn .prog-label { color: #f59e0b; }
    .prog-row--done.prog-row--fail .prog-label { color: #dc2626; }

    /* Report card rows */
    .report-row { display: grid; grid-template-columns: 2fr 1fr 60px 1.2fr; gap: 6px; align-items: center; padding: 7px 0; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
    .report-row:last-child { border-bottom: none; }
    .report-sub-row { display: grid; grid-template-columns: 2fr 1fr 60px 1.2fr; gap: 6px; align-items: center; padding: 5px 0 5px 16px; border-bottom: 1px solid #f8fafc; font-size: 11px; color: #64748b; }
    .report-sub-row:last-child { border-bottom: none; }
    .report-row-label { font-weight: 600; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .report-row-score { text-align: center; color: #374151; font-weight: 700; }
    .report-row-pill { text-align: center; }
    .report-row-detail { color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }
    .report-section { background: #fff; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; }
    .report-section-title { font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
    .report-reason-list { margin: 0; padding-left: 18px; font-size: 12px; color: #dc2626; line-height: 1.8; }
    .report-reason-list li { color: #374151; }
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
