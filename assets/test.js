/**
 * AI API Doctor — Diagnostic Engine v3 (Fine-Grained Scoring + Unified Grades)
 * website/assets/test.js
 *
 * Core principles:
 * 1. No simple pass=full / fail=0 scoring — every check has multiple sub-items
 * 2. finalTestModelId is determined once and used for ALL core tests
 * 3. modelSource tracks how the model was selected: user_input | auto_detected
 * 4. All model comparisons use normalizeModelId() for case-insensitive matching
 * 5. getScoreGrade() is the single source of truth for all grade/color/tier lookups
 * 6. getCheckStatus() determines individual check status from score ratios
 * 7. Reports explain WHY a score was given, not just WHAT the score is
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
  reachability:   12,   // API server reachability
  auth:           14,   // Auth / API Key validity
  modelList:      12,   // Model list retrieval
  autoModel:      10,   // Model identification & selection
  targetCall:     22,   // Target model call quality
  stability:      18,   // Stability sampling (3 pings)
  usageAudit:      6,   // Usage auditing
  clientConfig:    6,   // Client config exportability
};
WEIGHT.total = Object.values(WEIGHT).reduce((a, b) => a + b, 0); // 100

/* ═══════════════════════════════════════════════════════
   Model ID Normalization
   All model comparisons MUST use this function.
   ═══════════════════════════════════════════════════════ */
function normalizeModelId(id) {
  if (!id) return '';
  return String(id).trim().toLowerCase();
}

/* ═══════════════════════════════════════════════════════
   Grade table (6 levels) — unified for all components
   ═══════════════════════════════════════════════════════ */
const GRADES = [
  { min: 95, grade: 'A', label: 'Excellent', labelZh: '优秀',   color: '#16a34a', bg: '#dcfce7',
    desc: 'Compatibility, stability and usage audit are all excellent',
    descZh: '兼容性、稳定性和用量审计表现优秀' },
  { min: 90, grade: 'B', label: 'Good',      labelZh: '良好',   color: '#0891b2', bg: '#ecfeff',
    desc: 'Core functions available with minor limitations',
    descZh: '核心功能可用，存在少量限制' },
  { min: 80, grade: 'C', label: 'Fair',     labelZh: '可用',   color: '#d97706', bg: '#fef9c3',
    desc: 'Usable, but some items need attention',
    descZh: '可用，但部分项目需要注意' },
  { min: 65, grade: 'D', label: 'Limited',  labelZh: '受限',   color: '#ea580c', bg: '#ffedd5',
    desc: 'Partial compatibility with significant limitations',
    descZh: '部分兼容，存在明显限制' },
  { min: 40, grade: 'E', label: 'Poor',     labelZh: '较差',   color: '#dc2626', bg: '#fee2e2',
    desc: 'Serious compatibility issues',
    descZh: '存在严重兼容问题' },
  { min: 0,  grade: 'F', label: 'Failed',   labelZh: '失败',   color: '#dc2626', bg: '#fee2e2',
    desc: 'Current configuration is not usable',
    descZh: '当前配置不可用' },
];

/**
 * Unified grade lookup — used by ALL components (report card, badge, copy text, image export)
 * @param {number} score
 * @returns {object} grade object
 */
function getScoreGrade(score) {
  for (const g of GRADES) {
    if (score >= g.min) return g;
  }
  return GRADES[GRADES.length - 1];
}

// Backward-compatible alias
const getGrade = getScoreGrade;

/* ═══════════════════════════════════════════════════════
   Status helpers
   ═══════════════════════════════════════════════════════ */
const STATUS_CONFIG = {
  excellent: { zh: '优秀',   en: 'Excellent',    color: '#16a34a', bg: '#dcfce7', pill: 'pass' },
  good:      { zh: '良好',   en: 'Good',          color: '#3b82f6', bg: '#eff6ff', pill: 'pass' },
  warning:   { zh: '注意',   en: 'Warning',       color: '#f59e0b', bg: '#fef9c3', pill: 'warn' },
  failed:    { zh: '失败',   en: 'Failed',        color: '#dc2626', bg: '#fee2e2', pill: 'fail' },
  skipped:   { zh: '未验证', en: 'Not verified',  color: '#94a3b8', bg: '#f1f5f9', pill: 'warn' },
  inconsistent:{ zh: '矛盾', en: 'Inconsistent',  color: '#7c3aed', bg: '#ede9fe', pill: 'warn' },
};

/**
 * Unified check status based on score ratio.
 * @param {number} earned
 * @param {number} maxScore
 * @param {string|null} forced
 * @returns {string} status
 */
function getCheckStatus(earned, maxScore, forced) {
  if (forced) return forced;
  const ratio = maxScore > 0 ? earned / maxScore : 0;
  if (ratio >= 0.95) return 'excellent';
  if (ratio >= 0.80) return 'good';
  if (ratio >= 0.50) return 'warning';
  if (ratio > 0)     return 'poor';   // partial credit but below warning threshold
  return 'failed';
}

// Backward-compatible alias
const computeCheckStatus = getCheckStatus;

function statusLabel(status, zh) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.warning;
  return zh ? cfg.zh : cfg.en;
}

function statusColor(status) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.warning;
  return { color: cfg.color, bg: cfg.bg, pill: cfg.pill };
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
   Unified check data factory
   Every check returns this shape so the report builder is uniform.
   ═══════════════════════════════════════════════════════ */
function mkCheck(cfg) {
  return {
    id:          cfg.id          || 'unknown',
    label:       cfg.label       || { zh: '', en: '' },
    maxScore:    cfg.maxScore    || 0,
    score:       cfg.score       || 0,
    status:      cfg.status      || 'failed',
    summary:     cfg.summary     || '',
    details:     cfg.details     || [],
    deductions:  cfg.deductions  || [],
    evidence:    cfg.evidence    || {},
  };
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
   Shared model candidates extraction
   Returns normalized model list from any response shape.
   ═══════════════════════════════════════════════════════ */
function extractModels(data) {
  if (!data) return [];
  if (Array.isArray(data.data)) return data.data.map(m => m.id || '').filter(Boolean);
  if (Array.isArray(data.models)) return data.models.map(m => typeof m === 'string' ? m : m.id || '').filter(Boolean);
  if (Array.isArray(data)) return data.map(m => typeof m === 'string' ? m : m.id || '').filter(Boolean);
  return [];
}

/* ═══════════════════════════════════════════════════════
   Helper: normalize a URL to base (strip trailing /v1/...)
   ═══════════════════════════════════════════════════════ */
function baseOrigin(url) {
  try {
    return new URL(url.replace(/\/$/, '')).origin;
  } catch (_) {
    return (url || '').replace(/\/$/, '');
  }
}

/* ═══════════════════════════════════════════════════════
   DETECT finalTestModelId + modelSource
   modelSource: 'user_input' | 'auto_detected' | 'models_fallback'
   Returns { finalTestModelId, userModel, autoModel, modelFromList,
             allModels, modelSource, isFinalModelInModelList }
   ═══════════════════════════════════════════════════════ */
function determineFinalTestModelId(userModel, modelListResult) {
  const userModelTrim = (userModel || '').trim();
  const allModels = extractModels(modelListResult?.data);
  const normalizedModels = allModels.map(normalizeModelId);

  let autoModel = '';
  let modelFromList = '';
  let modelSource = 'auto_detected';

  if (userModelTrim) {
    // User manually filled in — treat as user_input
    autoModel = userModelTrim;
    modelFromList = userModelTrim;
    modelSource = 'user_input';
  } else if (allModels.length > 0) {
    // Prefer chat/completions-capable lightweight models
    const chatModels = allModels.filter(m => !/(embedding|embed|vision|audio|tts|speech|whisper|dalle|image)/i.test(m));
    autoModel = chatModels[0] || allModels[0];
    modelFromList = autoModel;
    modelSource = 'auto_detected';
  }

  // isFinalModelInModelList: normalized comparison
  const normalizedFinal = normalizeModelId(autoModel);
  const isFinalModelInModelList = normalizedFinal !== '' && normalizedModels.includes(normalizedFinal);

  return {
    finalTestModelId: autoModel || '',
    userModel: userModelTrim,
    autoModel: autoModel,
    modelFromList: modelFromList,
    allModels,
    modelSource,               // 'user_input' | 'auto_detected' | 'models_fallback'
    isFinalModelInModelList,   // true if finalTestModelId is in normalized model list
  };
}

/* ═══════════════════════════════════════════════════════
   STEP 1: API Server Reachability — 12 pts (6 sub-items)
   Sub-items:
     R1: Network connectivity (3 pts)
     R2: TLS/HTTPS (2 pts)
     R3: Response time (2 pts)
     R4: Content type (2 pts)
     R5: OpenAI-compatible path (2 pts)
     R6: Error explainability (1 pt)
   ═══════════════════════════════════════════════════════ */
async function checkA_Reachability(baseUrl, apiKey, signal) {
  const start = Date.now();
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';

  let r1 = 3, r2 = 2, r3 = 2, r4 = 2, r5 = 2, r6 = 1;
  let summary = '';
  let status = 'excellent';

  // Probe 3 paths in parallel
  const candidates = [
    (baseUrl.replace(/\/$/, '') + '/models').replace(/\/+/g, '/').replace(':/', '://'),
    (baseUrl.replace(/\/$/, '') + '/v1/models').replace(/\/+/g, '/').replace(':/', '://'),
    baseUrl.replace(/\/$/, ''),
  ];

  let best = null;
  let allFailed = true;

  for (const url of candidates) {
    try {
      const t0 = Date.now();
      const resp = await fetch(url, { method: 'HEAD', signal, cache: 'no-cache' });
      const elapsed = Date.now() - t0;
      allFailed = false;
      evidence.httpStatus = resp.status;
      evidence.httpStatusRoot = resp.status;
      evidence.elapsedMs = elapsed;

      best = { url, status: resp.status, elapsed, headers: Object.fromEntries(resp.headers.entries()) };
      break;
    } catch (_) {}
  }

  // Fallback: GET if HEAD failed
  if (!best) {
    try {
      const t0 = Date.now();
      const resp = await fetch(candidates[2], { method: 'GET', signal, cache: 'no-cache' });
      const elapsed = Date.now() - t0;
      allFailed = false;
      best = { url: candidates[2], status: resp.status, elapsed, headers: {} };
      evidence.httpStatus = resp.status;
      evidence.elapsedMs = elapsed;
    } catch (err) {
      evidence.netError = err.message;
    }
  }

  // R1: Network connectivity (3 pts)
  if (allFailed || !best) {
    r1 = 0;
    deductions.push(zh ? '网络无法连接（DNS失败/超时）' : 'Network unreachable (DNS failure or timeout)');
    details.push(zh ? '无法连接到该服务器' : 'Cannot reach this server at all');
    status = 'failed';
  } else if (best.status >= 500) {
    r1 = 1.5;
    deductions.push(zh ? '偶发连接失败（HTTP 5xx）' : 'Occasional connection failures (HTTP 5xx)');
    status = 'warning';
  } else {
    r1 = 3;
  }

  // R2: TLS/HTTPS (2 pts)
  if (best && baseUrl.startsWith('https')) {
    const ct = best.headers['content-type'] || '';
    if (ct.includes('text/html') || best.status === 403 || best.status === 401) {
      // Suspicious TLS behavior
    }
    r2 = 2;
  } else if (best && baseUrl.startsWith('http:')) {
    r2 = 1;
    deductions.push(zh ? '使用 HTTP 而非 HTTPS' : 'Using HTTP instead of HTTPS');
  } else if (!best) {
    r2 = 0;
    deductions.push(zh ? 'TLS 证书无法验证' : 'TLS certificate cannot be verified');
  }

  // R3: Response time (2 pts)
  const elapsed = best ? best.elapsed : 99999;
  evidence.latency = elapsed;
  if (elapsed < 1000) {
    r3 = 2;
  } else if (elapsed < 3000) {
    r3 = 1.5;
    details.push(zh ? `响应时间 ${elapsed}ms（可接受）` : `Response time ${elapsed}ms (acceptable)`);
  } else if (elapsed < 8000) {
    r3 = 1;
    deductions.push(zh ? `响应时间较长：${elapsed}ms` : `High response time: ${elapsed}ms`);
    if (status !== 'failed') status = 'warning';
  } else if (elapsed < 30000) {
    r3 = 0.5;
    deductions.push(zh ? `响应超时：${elapsed}ms` : `Slow response: ${elapsed}ms`);
    if (status !== 'failed') status = 'warning';
  } else {
    r3 = 0;
    deductions.push(zh ? '请求完全超时' : 'Request timed out completely');
    status = 'failed';
  }

  // R4: Content type (2 pts) — now try a real GET on the model endpoint
  let gotModels = false;
  let htmlPage = false;
  try {
    const modelResp = await fetch(candidates[0], {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      signal
    });
    evidence.modelEndpointStatus = modelResp.status;
    evidence.modelEndpointOk = modelResp.ok;
    const ct = modelResp.headers.get('content-type') || '';
    evidence.contentType = ct;

    if (ct.includes('text/html') || ct.includes('text/plain')) {
      const text = await modelResp.text().catch(() => '');
      if (/<html|<\/html>|<body|<login|signin|cf-challenge|cloudflare/i.test(text)) {
        htmlPage = true;
        r4 = 0;
        deductions.push(zh ? '返回 HTML 登录页 / Cloudflare / WAF' : 'Returns HTML login page / Cloudflare / WAF');
        status = 'failed';
      }
    } else if (ct.includes('application/json')) {
      r4 = 2;
      gotModels = true;
    } else if (!modelResp.ok) {
      r4 = 1;
      details.push(zh ? `HTTP ${modelResp.status}，但内容类型可解释` : `HTTP ${modelResp.status}, but content type explainable`);
    }
  } catch (err) {
    evidence.modelEndpointError = err.message;
    r4 = 0;
    details.push(zh ? '模型接口无法访问' : 'Model endpoint not accessible');
  }

  // R5: OpenAI-compatible path (2 pts)
  if (gotModels) {
    r5 = 2;
  } else if (best && best.status !== 404) {
    r5 = 1;
    details.push(zh ? '兼容路径部分可访问' : 'Some compatible paths accessible');
  } else {
    r5 = 0;
    deductions.push(zh ? '兼容路径不可识别' : 'OpenAI-compatible paths not recognized');
  }

  // R6: Error explainability (1 pt)
  if (best && best.status >= 400) {
    const isExplainable = [401, 403, 404, 422, 429, 500, 502, 503].includes(best.status);
    if (isExplainable) {
      r6 = 1;
    } else {
      r6 = 0;
      deductions.push(zh ? '错误响应无法解释' : 'Error response not explainable');
    }
  } else {
    r6 = 1;
  }

  const score = r1 + r2 + r3 + r4 + r5 + r6;

  // Special: root 404 is NOT a major failure if /models works
  if (best && best.status === 404 && gotModels) {
    details.push(zh ? '根路径返回 HTTP 404，但对部分 OpenAI-compatible API 正常' : 'Root path returned HTTP 404 — normal for some OpenAI-compatible APIs');
  }

  // Overall status
  if (status !== 'failed') {
    const ratio = score / 12;
    if (ratio >= 0.95) status = 'excellent';
    else if (ratio >= 0.80) status = 'good';
    else if (ratio >= 0.50) status = 'warning';
    else status = 'failed';
  }

  summary = score < 12
    ? (zh ? `12项中得 ${score} 分，部分项目未达标` : `Scored ${score}/12, some items below standard`)
    : (zh ? '完全达标' : 'Fully compliant');

  return mkCheck({
    id: 'reachability',
    label: { zh: 'API 服务器可达性', en: 'API Server Reachability' },
    maxScore: 12,
    score,
    status,
    summary,
    details,
    deductions,
    evidence,
  });
}

/* ═══════════════════════════════════════════════════════
   STEP 2: Auth / API Key Validity — 14 pts (6 sub-items)
   Sub-items:
     A1: Authorization Header accepted (3 pts)
     A2: Key format basic check (2 pts)
     A3: Not 401 Unauthorized (3 pts)
     A4: Not 403 Forbidden (3 pts)
     A5: Error message explainable (1 pt)
     A6: Auth consistency (2 pts)
   ═══════════════════════════════════════════════════════ */
async function checkB_Auth(baseUrl, apiKey, signal) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';

  let a1 = 3, a2 = 2, a3 = 3, a4 = 3, a5 = 1, a6 = 2;
  let status = 'excellent';
  let summary = '';

  // A2: Key format
  if (!apiKey || !apiKey.trim()) {
    a2 = 0; a1 = 0; a3 = 0; a4 = 0; a5 = 0; a6 = 0;
    deductions.push(zh ? 'API Key 为空' : 'API Key is empty');
    status = 'failed';
    return mkCheck({
      id: 'auth',
      label: { zh: '鉴权 / API Key 有效性', en: 'Auth / API Key Validity' },
      maxScore: 14, score: 0, status,
      summary: zh ? 'API Key 为空' : 'API Key is empty',
      details: [zh ? '未提供 API Key' : 'No API Key provided'],
      deductions,
      evidence,
    });
  }

  if (!/^sk-/.test(apiKey) && !/^api-/.test(apiKey) && !/^[A-Za-z0-9_-]{16,}$/.test(apiKey)) {
    a2 = 1;
    details.push(zh ? 'Key 格式异常（非标准前缀）' : 'Key format unusual (non-standard prefix)');
    if (status !== 'failed') status = 'warning';
  } else {
    a2 = 2;
  }

  // Test /models endpoint
  let modelsStatus = 0;
  let modelsResp = null;
  try {
    const url = (baseUrl.replace(/\/$/, '') + '/models').replace(/\/+/g, '/').replace(':/', '://');
    modelsResp = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      signal
    });
    modelsStatus = modelsResp.status;
    evidence.modelsStatus = modelsStatus;
  } catch (err) {
    evidence.modelsFetchError = err.message;
    modelsStatus = 0;
  }

  // Test /chat/completions endpoint
  let chatStatus = 0;
  let chatResp = null;
  try {
    const req = buildRequest(baseUrl, apiKey, 'test-model-for-auth', 'OpenAI Chat', 'hi', { maxTokens: 5 });
    chatResp = await fetch(req.endpoint, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal
    });
    chatStatus = chatResp.status;
    evidence.chatStatus = chatStatus;
  } catch (err) {
    evidence.chatFetchError = err.message;
    chatStatus = 0;
  }

  // A3: Not 401 Unauthorized
  if (modelsStatus === 401 || chatStatus === 401) {
    a3 = 0;
    deductions.push(zh ? '收到 401 Unauthorized' : 'Received 401 Unauthorized');
    status = 'failed';
  } else if (modelsStatus > 0 || chatStatus > 0) {
    const bothOk = modelsStatus >= 200 && modelsStatus < 400 && chatStatus >= 200 && chatStatus < 400;
    const anyOk = (modelsStatus >= 200 && modelsStatus < 400) || (chatStatus >= 200 && chatStatus < 400);
    if (bothOk) {
      a3 = 3;
    } else if (anyOk) {
      a3 = 1.5;
      details.push(zh ? '部分接口鉴权成功' : 'Some endpoints authenticated successfully');
    }
  }

  // A4: Not 403 Forbidden
  if (modelsStatus === 403 || chatStatus === 403) {
    a4 = 0;
    deductions.push(zh ? '收到 403 Forbidden / 权限拒绝' : 'Received 403 Forbidden / Permission denied');
    if (status !== 'failed') status = 'failed';
  } else if (modelsStatus === 429 || chatStatus === 429) {
    a4 = 1.5;
    details.push(zh ? '收到 429 限流' : 'Received 429 rate limit');
    if (status !== 'failed') status = 'warning';
  }

  // A5: Error explainability
  if (modelsStatus >= 400 || chatStatus >= 400) {
    let errMsg = '';
    if (chatResp) {
      try {
        const errData = await chatResp.json();
        errMsg = errData.error?.message || errData.error?.type || '';
      } catch (_) {}
    }
    if (errMsg) {
      a5 = 1;
      evidence.errorMessage = errMsg;
    } else {
      a5 = 0;
      deductions.push(zh ? '错误信息不可读' : 'Error message not readable');
    }
  }

  // A6: Auth consistency — ONLY when there's a genuine auth conflict
  // /models returns 401/403 but chat/completions succeeds, OR vice versa
  // NOT: one returns 404, the other returns 200 — that's an API compatibility issue, not auth inconsistency
  const authModelsFail = modelsStatus === 401 || modelsStatus === 403;
  const authChatFail = chatStatus === 401 || chatStatus === 403;
  const modelsOk = modelsStatus >= 200 && modelsStatus < 400;
  const chatOk = chatStatus >= 200 && chatStatus < 400;
  if (modelsOk && chatOk) {
    a6 = 2;
    // Both pass — no inconsistency
  } else if (authModelsFail && chatOk) {
    a6 = 1;
    details.push(zh ? '/models 返回 401/403，但 chat/completions 鉴权通过' : '/models returned 401/403 but /chat/completions authenticated successfully');
    if (status !== 'failed') status = 'warning';
  } else if (modelsOk && authChatFail) {
    a6 = 1;
    details.push(zh ? 'chat/completions 返回 401/403，但 /models 鉴权通过' : '/chat/completions returned 401/403 but /models authenticated successfully');
    if (status !== 'failed') status = 'warning';
  } else if (modelsOk !== chatOk) {
    // One worked, one didn't — but NOT due to auth failures specifically
    // This is more of an API compatibility / path issue
    a6 = 1.5;
    details.push(zh ? '部分接口响应状态不一致，可能为路径兼容性问题' : 'Some endpoints have inconsistent response status — may be an API path compatibility issue');
    if (status !== 'failed') status = 'warning';
  } else {
    a6 = 0.5;
    deductions.push(zh ? '鉴权失败' : 'Auth failed');
  }

  // A1: Authorization Header accepted (3 pts)
  // Inferred: if we got any non-401 response, the header was accepted
  if (authModelsFail && authChatFail) {
    a1 = 0;
    deductions.push(zh ? 'Authorization Header 未被识别' : 'Authorization Header not recognized');
  } else if (modelsStatus === 0 && chatStatus === 0) {
    a1 = 0;
    details.push(zh ? '无法发送授权请求' : 'Cannot send authorization request');
  } else {
    a1 = 3;
  }

  // A5: Error explainability — only when we received error response bodies
  // NOT: just because one endpoint returned a non-200 status
  let gotExplainedError = false;
  if (chatResp) {
    try {
      const errData = await chatResp.json();
      const errMsg = errData.error?.message || errData.error?.type || '';
      if (errMsg) {
        a5 = 1;
        evidence.errorMessage = errMsg;
        gotExplainedError = true;
      }
    } catch (_) {}
  }
  if (!gotExplainedError && (chatStatus >= 400 || modelsStatus >= 400)) {
    // Only penalize if we got an error status AND couldn't parse an explanation
    a5 = 0;
    deductions.push(zh ? '错误信息不可读' : 'Error message not readable');
  } else if (gotExplainedError) {
    a5 = 1;
  } else {
    a5 = 1; // No errors encountered — full credit
  }

  const score = a1 + a2 + a3 + a4 + a5 + a6;

  if (status !== 'failed') {
    const ratio = score / 14;
    if (ratio >= 0.95) status = 'excellent';
    else if (ratio >= 0.80) status = 'good';
    else if (ratio >= 0.50) status = 'warning';
    else status = 'failed';
  }

  summary = score >= 13
    ? (zh ? '核心接口鉴权通过' : 'Core endpoints authenticated successfully')
    : score >= 11
    ? (zh ? '鉴权基本通过，存在轻微差异' : 'Auth mostly passed with minor differences')
    : (zh ? '鉴权存在明显问题' : 'Auth has significant issues');

  return mkCheck({
    id: 'auth',
    label: { zh: '鉴权 / API Key 有效性', en: 'Auth / API Key Validity' },
    maxScore: 14,
    score,
    status,
    summary,
    details,
    deductions,
    evidence,
  });
}

/* ═══════════════════════════════════════════════════════
   STEP 3: Model List Retrieval — 12 pts (7 sub-items)
   Sub-items:
     L1: /models request success (3 pts)
     L2: Response format correct (2 pts)
     L3: Model count (2 pts)
     L4: Model ID readability (1 pt)
     L5: Contains user model (2 pts)
     L6: List stability (1 pt)
     L7: Error/limit explainable (1 pt)
   ═══════════════════════════════════════════════════════ */
async function checkC_ModelList(baseUrl, apiKey, signal, userModel) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';

  let l1 = 3, l2 = 2, l3 = 2, l4 = 1, l5 = 2, l6 = 1, l7 = 1;
  let status = 'excellent';
  let summary = '';
  let models = [];
  let lastErr = '';

  const candidates = [
    (baseUrl.replace(/\/$/, '') + '/models').replace(/\/+/g, '/').replace(':/', '://'),
    (baseUrl.replace(/\/$/, '') + '/v1/models').replace(/\/+/g, '/').replace(':/', '://'),
  ];

  let resp = null;
  let respData = null;
  let fetchErr = '';

  for (const url of candidates) {
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        signal
      });
      evidence.httpStatus = resp.status;

      if (resp.status === 401 || resp.status === 403) {
        lastErr = zh ? '鉴权失败' : 'Auth failed';
        break;
      }
      if (!resp.ok) {
        lastErr = 'HTTP ' + resp.status;
        evidence.httpError = resp.status;
        continue;
      }

      const ct = resp.headers.get('content-type') || '';
      evidence.contentType = ct;

      const text = await resp.text();
      evidence.rawResponseLength = text.length;

      try {
        respData = JSON.parse(text);
      } catch (_) {
        evidence.parseError = true;
        lastErr = zh ? '响应不是 JSON' : 'Response is not JSON';
        continue;
      }

      models = extractModels(respData);
      evidence.modelCount = models.length;
      evidence.firstModel = models[0] || '';
      break;
    } catch (err) {
      if (err.name === 'AbortError') {
        lastErr = zh ? '超时' : 'Timeout';
      } else {
        lastErr = err.message;
        fetchErr = err.message;
      }
    }
  }

  // L1: Request success
  if (!resp || !resp.ok) {
    l1 = 0;
    deductions.push(zh ? `/models 请求失败：${lastErr}` : `/models request failed: ${lastErr}`);
    status = 'failed';
  } else {
    l1 = 3;
  }

  // L2: Format
  if (respData && typeof respData === 'object') {
    if (respData.data && Array.isArray(respData.data)) {
      l2 = 2;
    } else if (respData.models || Array.isArray(respData)) {
      l2 = 1;
      details.push(zh ? '响应结构非标准但可解析' : 'Response structure non-standard but parseable');
    } else {
      l2 = 1;
      details.push(zh ? '响应结构不完整' : 'Response structure incomplete');
    }
  } else if (respData && typeof respData === 'string') {
    l2 = 0;
    deductions.push(zh ? '响应非 JSON' : 'Response is not JSON');
    if (status !== 'failed') status = 'warning';
  } else {
    l2 = 0;
    details.push(zh ? '无法解析响应' : 'Cannot parse response');
  }

  // L3: Model count
  if (models.length === 0) {
    l3 = 0;
    if (l1 > 0) {
      deductions.push(zh ? '模型列表为空' : 'Model list is empty');
      if (status !== 'failed') status = 'warning';
    }
  } else if (models.length <= 2) {
    l3 = 1;
    details.push(zh ? `仅 ${models.length} 个模型` : `Only ${models.length} models available`);
  } else {
    l3 = 2;
  }

  // L4: Model ID readability
  const readableCount = models.filter(m => m && m.length > 2 && /[a-zA-Z]/.test(m)).length;
  if (readableCount === 0) {
    l4 = 0;
    deductions.push(zh ? '模型 ID 混乱或为空' : 'Model IDs messy or empty');
  } else {
    l4 = 1;
  }

  // L5: Contains user model
  // Only penalize if user manually filled in AND it's not in the list
  const userTrim = (userModel || '').trim();
  const normalizedModels = models.map(normalizeModelId);
  const normalizedUser = normalizeModelId(userTrim);
  if (userTrim) {
    const found = normalizedModels.includes(normalizedUser);
    const fuzzyFound = normalizedModels.some(m => m.includes(normalizedUser) || normalizedUser.includes(m));
    if (found) {
      l5 = 2;
    } else if (fuzzyFound) {
      l5 = 1;
      details.push(zh ? '用户模型疑似匹配别名' : 'User model fuzzy-matched to alias');
    } else {
      l5 = 0;
      details.push(zh ? `用户填写模型 ${userTrim} 不在模型列表` : `User model ${userTrim} not in list`);
    }
  } else {
    // No user model specified — full credit
    l5 = 2;
  }

  // L6: List stability (we only do one request here, so assume stable if successful)
  if (l1 > 0) {
    l6 = 1;
  } else {
    l6 = 0;
  }

  // L7: Error explainability
  if (l1 > 0) {
    l7 = 1;
  } else {
    l7 = 0;
    if (!lastErr) {
      deductions.push(zh ? '获取失败且错误不可解释' : 'Failed with no explainable error');
    }
  }

  const score = l1 + l2 + l3 + l4 + l5 + l6 + l7;

  if (status !== 'failed') {
    const ratio = score / 12;
    if (ratio >= 0.95) status = 'excellent';
    else if (ratio >= 0.80) status = 'good';
    else if (ratio >= 0.50) status = 'warning';
    else status = 'failed';
  }

  summary = l1 === 0
    ? (zh ? '模型列表不可用' : 'Model list unavailable')
    : (zh ? `${models.length} 个模型，已解析` : `${models.length} models parsed`);

  return mkCheck({
    id: 'modelList',
    label: { zh: '模型列表获取', en: 'Model List Retrieval' },
    maxScore: 12,
    score,
    status,
    summary,
    details,
    deductions,
    evidence: { ...evidence, models, userModel: userTrim },
  });
}

/* ═══════════════════════════════════════════════════════
   STEP 4: Model Identification & Selection — 10 pts (5 sub-items)
   Sub-items:
     M1: Can generate candidate models (2 pts)
     M2: Recommendation explainable (2 pts)
     M3: User input vs recommendation match (2 pts)
     M4: Recommended model actually callable (3 pts)
     M5: Risk prompt present (1 pt)
   ═══════════════════════════════════════════════════════ */
async function checkD_AutoModel(baseUrl, apiKey, modelIdInfo, authResult, signal, interfaceType) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';

  const { userModel, autoModel, modelFromList, allModels, modelSource, isFinalModelInModelList } = modelIdInfo;
  const normalizedAllModels = allModels.map(normalizeModelId);
  const normalizedAuto = normalizeModelId(autoModel);
  const normalizedUser = normalizeModelId(userModel);

  let m1 = 2, m2 = 2, m3 = 2, m4 = 3, m5 = 1;
  let status = 'excellent';

  // M1: Can generate candidate models
  if (!autoModel) {
    m1 = 0;
    deductions.push(zh ? '无候选模型' : 'No candidate model');
    status = 'failed';
  } else if (allModels.length === 0) {
    m1 = 1;
    details.push(zh ? '有候选但无列表支持' : 'Candidate exists but no list support');
  } else {
    m1 = 2;
    evidence.candidateModel = autoModel;
  }

  // M2: Recommendation explainable
  if (!autoModel) {
    m2 = 0;
  } else if (normalizedUser && normalizedUser === normalizedAuto) {
    m2 = 2;
    details.push(zh ? '使用用户填写模型' : 'Using user-provided model');
  } else if (autoModel) {
    const isChatModel = !/(embedding|embed|vision|audio|tts|speech|whisper|dalle|image)/i.test(autoModel);
    const isFirst = normalizedAuto === normalizeModelId(allModels[0]);
    if (isChatModel) {
      m2 = 2;
      details.push(zh ? `自动识别推荐：${autoModel}（chat 模型优先）` : `Auto-detected: ${autoModel} (chat model prioritized)`);
    } else if (isFirst) {
      m2 = 1.5;
      details.push(zh ? `自动选择第一个模型：${autoModel}` : `Auto-selected first model: ${autoModel}`);
    } else {
      m2 = 1;
      details.push(zh ? `推荐模型：${autoModel}（无明确优先级说明）` : `Recommended: ${autoModel} (no clear priority)`);
    }
  }

  // M3: User input vs recommendation match
  if (!userModel && !autoModel) {
    m3 = 0;
    deductions.push(zh ? '用户未填且无自动推荐' : 'No user input and no auto-recommendation');
  } else if (!userModel && autoModel) {
    m3 = 2;
    details.push(zh ? '用户未填写，自动使用推荐模型' : 'User did not fill in model — using auto-recommended');
  } else if (userModel && !autoModel) {
    m3 = 0;
    deductions.push(zh ? '用户填写模型不存在' : 'User-provided model does not exist');
  } else if (normalizedUser === normalizedAuto) {
    m3 = 2;
  } else if (normalizedAllModels.includes(normalizedAuto) && !normalizedAllModels.includes(normalizedUser)) {
    m3 = 1;
    details.push(zh ? `用户模型与推荐不一致：填 ${userModel}，用 ${autoModel}` : `User model mismatch: filled ${userModel}, used ${autoModel}`);
  } else {
    m3 = 2;
  }

  // M4: Recommended model actually callable (3 pts)
  // This is the REAL test — actually call the recommended model
  if (autoModel) {
    try {
      const req = buildRequest(baseUrl, apiKey, autoModel, interfaceType, PROMPT_SHORT, { maxTokens: 10 });
      const resp = await fetch(req.endpoint, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal
      });
      evidence.callableStatus = resp.status;
      if (resp.status === 401 || resp.status === 403) {
        m4 = 0;
        deductions.push(zh ? `推荐模型 ${autoModel} 调用失败（权限）` : `Recommended model ${autoModel} call failed (permission)`);
        if (status !== 'failed') status = 'failed';
      } else if (resp.status >= 400) {
        m4 = 1.5;
        details.push(zh ? `推荐模型 ${autoModel} 返回 HTTP ${resp.status}` : `Recommended model ${autoModel} returned HTTP ${resp.status}`);
        if (status !== 'failed') status = 'warning';
      } else {
        const data = await resp.json().catch(() => ({}));
        const out = extractVisibleOutput(data, interfaceType);
        evidence.hasOutput = out.status === 'present';
        if (out.status === 'present') {
          m4 = 3;
        } else {
          m4 = 1.5;
          details.push(zh ? '推荐模型可调用但无有效输出' : 'Recommended model callable but no valid output');
        }
      }
    } catch (err) {
      m4 = 0;
      evidence.callableError = err.message;
      deductions.push(zh ? `推荐模型调用出错：${err.message}` : `Recommended model call error: ${err.message}`);
      if (status !== 'failed') status = 'warning';
    }
  } else {
    m4 = 0;
  }

  // M5: Risk prompt
  if (userModel && normalizeModelId(userModel) !== normalizeModelId(autoModel)) {
    m5 = 1;
    details.push(zh ? '推荐模型仅代表可测模型，不代表所有模型' : 'Recommended model is for testing only, not representative of all models');
  } else if (!userModel && autoModel) {
    m5 = 1;
    details.push(zh ? '未填写模型，自动识别仅代表可测模型' : 'Model not filled — auto-detect only represents testable models');
  } else {
    m5 = 1;
  }

  const score = m1 + m2 + m3 + m4 + m5;

  if (status !== 'failed') {
    const ratio = score / 10;
    if (ratio >= 0.95) status = 'excellent';
    else if (ratio >= 0.80) status = 'good';
    else if (ratio >= 0.50) status = 'warning';
    else status = 'failed';
  }

  return mkCheck({
    id: 'autoModel',
    label: { zh: '模型识别与选择', en: 'Model Identification & Selection' },
    maxScore: 10,
    score,
    status,
    summary: autoModel ? (zh ? `使用：${autoModel}` : `Using: ${autoModel}`) : (zh ? '无可用模型' : 'No model available'),
    details,
    deductions,
    evidence: {
      ...evidence,
      modelSource,                   // 'user_input' | 'auto_detected'
      isFinalModelInModelList,       // normalized comparison result
      normalizedAutoModel: normalizedAuto,
    },
  });
}

/* ═══════════════════════════════════════════════════════
   STEP 5: Target Model Call Quality — 22 pts (9 sub-items)
   Sub-items:
     T1: Request sent (2 pts)
     T2: HTTP status (3 pts)
     T3: Response is valid JSON (3 pts)
     T4: OpenAI-compatible format (4 pts)
     T5: Content non-empty (3 pts)
     T6: finish_reason normal (2 pts)
     T7: usage field quality (2 pts)
     T8: Latency quality (2 pts)
     T9: Error explainability (1 pt)
   ═══════════════════════════════════════════════════════ */
async function checkE_TargetCall(baseUrl, apiKey, model, interfaceType, signal) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';

  let t1 = 2, t2 = 3, t3 = 3, t4 = 4, t5 = 3, t6 = 2, t7 = 2, t8 = 2, t9 = 1;
  let status = 'excellent';
  let httpStatus = 0;
  let usage = {};

  const start = Date.now();

  try {
    const req = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_SHORT, { maxTokens: 20 });
    evidence.endpoint = req.endpoint;
    evidence.requestBody = { model: req.body.model, messages: req.body.messages };

    const resp = await fetch(req.endpoint, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal
    });

    const latency = Date.now() - start;
    httpStatus = resp.status;
    evidence.httpStatus = httpStatus;
    evidence.latencyMs = latency;

    // T1: Request sent
    t1 = 2;

    // T2: HTTP status
    if (httpStatus >= 200 && httpStatus < 300) {
      t2 = 3;
    } else if (httpStatus === 400 || httpStatus === 404) {
      t2 = 1.5;
      details.push(zh ? `HTTP ${httpStatus}，但错误可解释` : `HTTP ${httpStatus}, but error explainable`);
    } else if (httpStatus === 401 || httpStatus === 403) {
      t2 = 0;
      deductions.push(zh ? '鉴权失败（401/403）' : 'Auth failed (401/403)');
      status = 'failed';
    } else if (httpStatus === 429) {
      t2 = 1;
      deductions.push(zh ? '收到 429 限流' : 'Hit 429 rate limit');
      evidence.rateLimit = true;
      if (status !== 'failed') status = 'warning';
    } else if (httpStatus >= 500) {
      t2 = 0.5;
      deductions.push(zh ? `服务器错误 HTTP ${httpStatus}` : `Server error HTTP ${httpStatus}`);
      if (status !== 'failed') status = 'warning';
    } else {
      t2 = 0;
      details.push(zh ? `HTTP ${httpStatus}，状态异常` : `HTTP ${httpStatus}, unusual status`);
    }

    // T3: Valid JSON
    let data = null;
    try {
      data = await resp.json();
      evidence.responseParsed = true;
      t3 = 3;
    } catch (_) {
      t3 = 0;
      deductions.push(zh ? '响应不是合法 JSON' : 'Response is not valid JSON');
      if (status !== 'failed') status = 'warning';
    }

    if (!data) {
      t4 = 0; t5 = 0; t6 = 0; t7 = 0;
      return mkCheck({
        id: 'targetCall',
        label: { zh: '目标模型调用质量', en: 'Target Model Call Quality' },
        maxScore: 22, score: t1 + t2 + t3, status,
        summary: zh ? '响应无法解析' : 'Response unparseable',
        details, deductions, evidence,
      });
    }

    evidence.rawResponse = data;

    // T4: OpenAI-compatible format (4 pts)
    let formatScore = 0;
    if (interfaceType === 'OpenAI Chat') {
      const choices = data.choices;
      const hasChoice = choices && Array.isArray(choices) && choices.length > 0;
      const hasMsg = hasChoice && (choices[0].message?.content !== undefined || choices[0].delta?.content !== undefined);
      if (hasChoice && hasMsg) formatScore = 4;
      else if (hasChoice) formatScore = 2;
      else formatScore = 0;
      evidence.formatChoices = !!choices;
      evidence.formatMessage = hasMsg;
    } else if (interfaceType === 'OpenAI Responses') {
      if (data.output_text || (data.response?.output_text)) formatScore = 4;
      else if (data.output || data.response) formatScore = 2;
      else formatScore = 0;
    } else {
      const content = data.content;
      if (Array.isArray(content) && content.some(c => c.type === 'text')) formatScore = 4;
      else if (content || data.delta) formatScore = 2;
      else formatScore = 0;
    }
    t4 = formatScore;
    if (formatScore < 2) {
      deductions.push(zh ? '响应格式与 OpenAI 不兼容' : 'Response format not OpenAI-compatible');
      if (status !== 'failed') status = 'warning';
    }

    // T5: Content non-empty (3 pts)
    const output = extractVisibleOutput(data, interfaceType);
    evidence.output = output;
    if (output.status === 'present' && output.text.length > 0) {
      t5 = 3;
    } else if (output.status === 'unknown' || (output.status === 'present' && output.text.length < 3)) {
      t5 = 1.5;
      details.push(zh ? '内容异常或很短' : 'Content abnormal or very short');
    } else {
      t5 = 0;
      deductions.push(zh ? '返回内容为空' : 'Returned content is empty');
      if (status !== 'failed') status = 'warning';
    }

    // T6: finish_reason normal (2 pts)
    if (interfaceType === 'OpenAI Chat') {
      const fr = data.choices?.[0]?.finish_reason;
      evidence.finishReason = fr;
      if (!fr) {
        t6 = 0.5;
        details.push(zh ? 'finish_reason 缺失' : 'finish_reason missing');
      } else if (['stop', 'length', 'content_filter', 'tool_calls'].includes(fr)) {
        t6 = 2;
      } else {
        t6 = 1;
        details.push(zh ? `finish_reason 异常：${fr}` : `finish_reason unusual: ${fr}`);
      }
    } else {
      t6 = 2; // Claude / Responses don't have finish_reason in the same way
    }

    // T7: usage field quality (2 pts)
    usage = data.usage || {};
    evidence.usage = usage;
    const hasPromptTokens = usage.prompt_tokens != null || usage.input_tokens != null;
    const hasCompletionTokens = usage.completion_tokens != null || usage.output_tokens != null;
    const hasTotalTokens = usage.total_tokens != null;

    if (hasPromptTokens && hasCompletionTokens && hasTotalTokens) {
      t7 = 2;
    } else if (hasTotalTokens) {
      t7 = 1;
      details.push(zh ? 'usage 部分字段缺失' : 'usage has some fields missing');
    } else {
      t7 = 0;
      details.push(zh ? 'usage 字段不完整' : 'usage field incomplete');
    }

    // T8: Latency quality (2 pts)
    if (latency < 2000) t8 = 2;
    else if (latency < 5000) t8 = 1.5;
    else if (latency < 10000) t8 = 1;
    else { t8 = 0.5; details.push(zh ? `延迟较高：${latency}ms` : `High latency: ${latency}ms`); }

    // T9: Error explainability (1 pt)
    if (httpStatus >= 400) {
      const errMsg = data.error?.message || data.error?.type || '';
      if (errMsg) { t9 = 1; evidence.errorMsg = errMsg; }
      else { t9 = 0; deductions.push(zh ? '失败但错误不可读' : 'Failed but error not readable'); }
    } else {
      t9 = 1;
    }

  } catch (err) {
    t1 = 0; t2 = 0; t3 = 0; t4 = 0; t5 = 0; t6 = 0; t7 = 0; t8 = 0;
    evidence.error = err.message;
    evidence.networkError = true; // flag for cap rule
    if (err.name === 'AbortError') {
      t9 = 0;
      deductions.push(zh ? '请求超时' : 'Request timed out');
    } else {
      t9 = 0;
      deductions.push(zh ? `网络错误：${err.message}` : `Network error: ${err.message}`);
    }
    status = 'failed';
  }

  const score = t1 + t2 + t3 + t4 + t5 + t6 + t7 + t8 + t9;

  // Forced status based on score range
  if (status !== 'failed') {
    if (score < 11) { status = 'failed'; deductions.push(zh ? '得分过低（< 11/22）' : 'Score too low (< 11/22)'); }
    else if (score <= 16) { status = 'warning'; }
    else if (score <= 20) { status = 'good'; }
    else { status = 'excellent'; }
  }

  return mkCheck({
    id: 'targetCall',
    label: { zh: '目标模型调用质量', en: 'Target Model Call Quality' },
    maxScore: 22,
    score,
    status,
    summary: score >= 21 ? (zh ? '调用质量优秀' : 'Excellent call quality')
             : score >= 17 ? (zh ? '调用质量良好' : 'Good call quality')
             : score >= 11 ? (zh ? '调用质量一般' : 'Average call quality')
             : (zh ? '调用质量差' : 'Poor call quality'),
    details,
    deductions,
    evidence: { ...evidence, httpStatus, usage },
  });
}

/* ═══════════════════════════════════════════════════════
   STEP 6: Stability Sampling — 18 pts (7 sub-items)
   Uses finalTestModelId. Skipped/penalized if target call failed.
   Sub-items:
     S1: Success rate (6 pts): 3/3=6, 2/3=4, 1/3=2, 0/3=0
     S2: HTTP status consistency (2 pts)
     S3: Average latency (3 pts): <2000=3, <5000=2, <10000=1, >=10000=0
     S4: Latency jitter (3 pts): <1000ms=3, <3000=2, <8000=1, >=8000=0
     S5: Return consistency (2 pts): all OK=2, 1 mismatch=1, 2+=0
     S6: Error explainability (1 pt)
     S7: Rate limit / risk control (1 pt)
   ═══════════════════════════════════════════════════════ */
async function checkG_Stability(baseUrl, apiKey, model, interfaceType, signal, targetCallResult) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';

  let s1 = 6, s2 = 2, s3 = 3, s4 = 3, s5 = 2, s6 = 1, s7 = 1;
  let status = 'excellent';

  // If target call completely failed, cap at 3/18 and mark skipped
  const targetFailed = targetCallResult && targetCallResult.status === 'failed' && targetCallResult.score < 11;
  if (targetFailed) {
    details.push(zh ? '目标模型调用失败，稳定性采样受限' : 'Target model call failed — stability sampling limited');
  }

  const TOTAL = 3;

  async function onePing(abortController) {
    const start = Date.now();
    let ok = false, status = 0, hasContent = false;
    let errMsg = '', errExplain = 0;
    let latency = 0;
    let responseText = '';
    try {
      const req = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_STABILITY, { maxTokens: 5 });
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
          responseText = out.text.trim().toUpperCase();
          if (responseText === 'OK') errExplain = 1;
          else errExplain = 0;
        } catch (_) {
          errMsg = zh ? 'JSON解析失败' : 'JSON parse failed';
          errExplain = 0;
        }
      } else {
        try {
          const errData = await resp.json().catch(() => ({}));
          errMsg = errData.error?.message || errData.error?.type || errData.message || '';
          if (!errMsg) errMsg = resp.statusText || 'HTTP ' + status;
          errExplain = errMsg ? 1 : 0;
        } catch (_) {
          errMsg = resp.statusText || 'HTTP ' + status;
          errExplain = errMsg ? 1 : 0;
        }
        // Check for rate limit
        if (status === 429 || /rate.?limit|quota|too.?many/i.test(errMsg)) {
          evidence.rateLimitDetected = true;
        }
      }
    } catch (err) {
      latency = Date.now() - start;
      ok = false;
      errMsg = err.name === 'AbortError' ? (zh ? '超时' : 'Timeout') : err.message;
      errExplain = errMsg ? 1 : 0;
    }
    return { latency, ok, status, hasContent, errMsg, errExplain, responseText };
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
  evidence.samples = samples;

  // S1: Success rate (6 pts)
  const successCount = samples.filter(s => s.ok && s.hasContent).length;
  if (targetFailed) {
    // Limited: can only get partial credit
    s1 = successCount * 2; // max 6 if 3/3, but with warning
    if (successCount < 3) details.push(zh ? `目标调用失败，稳定性仅 ${successCount}/3 成功` : `Target call failed, stability only ${successCount}/3 success`);
  } else if (successCount === 3) {
    s1 = 6;
  } else if (successCount === 2) {
    s1 = 4;
    deductions.push(zh ? '稳定性采样 2/3 成功' : 'Stability sampling 2/3 success');
    if (status !== 'failed') status = 'warning';
  } else if (successCount === 1) {
    s1 = 2;
    deductions.push(zh ? '稳定性采样 1/3 成功' : 'Stability sampling 1/3 success');
    if (status !== 'failed') status = 'warning';
  } else {
    s1 = 0;
    deductions.push(zh ? '稳定性采样 0/3 成功' : 'Stability sampling 0/3 success');
    status = 'failed';
  }

  // S2: HTTP status consistency (2 pts)
  const statuses = samples.map(s => s.status);
  const uniqueStatuses = [...new Set(statuses)].filter(s => s > 0);
  if (uniqueStatuses.length === 1 && samples.every(s => s.ok)) {
    s2 = 2;
  } else if (uniqueStatuses.length === 1 && samples.every(s => s.status >= 200 && s.status < 400)) {
    s2 = 1;
  } else if (uniqueStatuses.length > 1) {
    s2 = 1;
    details.push(zh ? `HTTP 状态不一致：${statuses.join(', ')}` : `HTTP status inconsistent: ${statuses.join(', ')}`);
  } else {
    s2 = 0;
    deductions.push(zh ? 'HTTP 状态异常' : 'HTTP status abnormal');
  }

  // S3: Average latency (3 pts)
  const okSamples = samples.filter(s => s.ok);
  const avgLat = okSamples.length > 0 ? okSamples.reduce((a, s) => a + s.latency, 0) / okSamples.length : 99999;
  evidence.avgLatency = avgLat;
  if (avgLat < 2000) {
    s3 = 3;
  } else if (avgLat < 5000) {
    s3 = 2;
    details.push(zh ? `平均延迟 ${Math.round(avgLat)}ms（可接受）` : `Avg latency ${Math.round(avgLat)}ms (acceptable)`);
  } else if (avgLat < 10000) {
    s3 = 1;
    deductions.push(zh ? `平均延迟较高：${Math.round(avgLat)}ms` : `High avg latency: ${Math.round(avgLat)}ms`);
    if (status !== 'failed') status = 'warning';
  } else {
    s3 = 0;
    deductions.push(zh ? `平均延迟过高：${Math.round(avgLat)}ms` : `Excessive avg latency: ${Math.round(avgLat)}ms`);
    if (status !== 'failed') status = 'warning';
  }

  // S4: Latency jitter (3 pts) — using max-min
  if (okSamples.length >= 2) {
    const lats = okSamples.map(s => s.latency);
    const jitter = Math.max(...lats) - Math.min(...lats);
    evidence.latencyJitter = jitter;
    if (jitter < 1000) s4 = 3;
    else if (jitter < 3000) s4 = 2;
    else if (jitter < 8000) s4 = 1;
    else {
      s4 = 0;
      deductions.push(zh ? `延迟波动大：${jitter}ms` : `Large latency jitter: ${jitter}ms`);
      if (status !== 'failed') status = 'warning';
    }
  } else {
    s4 = 0;
  }

  // S5: Return consistency (2 pts)
  const okResponses = samples.filter(s => s.ok && s.responseText);
  const allOK = okResponses.every(s => s.responseText === 'OK');
  const inconsistentCount = okResponses.filter(s => s.responseText !== 'OK').length;
  if (inconsistentCount === 0 && okResponses.length === successCount) {
    s5 = 2;
  } else if (inconsistentCount === 1) {
    s5 = 1;
    details.push(zh ? '一次响应不一致' : 'One inconsistent response');
  } else {
    s5 = 0;
    deductions.push(zh ? '多次响应不一致' : 'Multiple inconsistent responses');
  }

  // S6: Error explainability (1 pt)
  const failedSamples = samples.filter(s => !s.ok);
  if (failedSamples.length === 0) {
    s6 = 1;
  } else {
    const explainableCount = failedSamples.filter(s => s.errExplain > 0).length;
    if (explainableCount === failedSamples.length) {
      s6 = 1;
    } else if (explainableCount > 0) {
      s6 = 0.5;
      details.push(zh ? '部分错误不可解释' : 'Some errors not explainable');
    } else {
      s6 = 0;
      deductions.push(zh ? '失败无可读错误' : 'Failures have no readable error');
    }
  }

  // S7: Rate limit / risk control (1 pt)
  if (evidence.rateLimitDetected || samples.some(s => s.status === 429)) {
    s7 = 0;
    deductions.push(zh ? '触发限流/风控' : 'Rate limit / risk control triggered');
    if (status !== 'failed') status = 'warning';
  } else {
    s7 = 1;
  }

  const score = s1 + s2 + s3 + s4 + s5 + s6 + s7;

  // CRITICAL: target call failed but stability success → inconsistent
  if (targetFailed && successCount >= 2) {
    status = 'inconsistent';
    deductions.push(zh ? '检测结果不一致：目标调用失败但稳定性采样成功' : 'Inconsistent: target call failed but stability sampling succeeded');
  }

  if (targetFailed && status !== 'inconsistent') {
    status = 'skipped';
  }

  return mkCheck({
    id: 'stability',
    label: { zh: '稳定性采样', en: 'Stability Sampling' },
    maxScore: 18,
    score,
    status,
    summary: `${successCount}/3 ${zh ? '成功' : 'success'}`,
    details,
    deductions,
    evidence,
  });
}

/* ═══════════════════════════════════════════════════════
   STEP 7: Usage Audit — 6 pts (6 sub-items)
   Sub-items:
     U1: usage field exists (1.5 pts)
     U2: prompt_tokens exists (1 pt)
     U3: completion_tokens exists (1 pt)
     U4: total_tokens exists and reasonable (1 pt)
     U5: usage matches request result (0.75 pts)
     U6: Consumption explanation clear (0.75 pts)
   ═══════════════════════════════════════════════════════ */
async function checkH_UsageAudit(baseUrl, apiKey, model, interfaceType, signal, targetCallResult) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';

  let u1 = 1.5, u2 = 1, u3 = 1, u4 = 1, u5 = 0.75, u6 = 0.75;
  let status = 'excellent';

  const targetFailed = targetCallResult && targetCallResult.status === 'failed' && targetCallResult.score < 11;
  if (targetFailed) {
    details.push(zh ? '目标模型调用失败，用量审计受限' : 'Target model call failed — usage audit limited');
    u2 = 0; u3 = 0; u4 = 0; u5 = 0; u6 = 0;
    u1 = 1;
    status = 'skipped';
  } else {
    // Use usage from the target call result if available
    const usage = targetCallResult?.evidence?.usage || {};
    evidence.usage = usage;

    const hasPromptTokens = usage.prompt_tokens != null || usage.input_tokens != null;
    const hasCompletionTokens = usage.completion_tokens != null || usage.output_tokens != null;
    const hasTotalTokens = usage.total_tokens != null;

    // U1
    u1 = hasTotalTokens || hasPromptTokens ? 1.5 : 0;
    if (!u1) deductions.push(zh ? 'usage 字段不存在' : 'usage field does not exist');

    // U2
    u2 = hasPromptTokens ? 1 : 0;

    // U3
    u3 = hasCompletionTokens ? 1 : 0;

    // U4
    if (hasTotalTokens) {
      const total = usage.total_tokens;
      const prompt = usage.prompt_tokens || usage.input_tokens || 0;
      const completion = usage.completion_tokens || usage.output_tokens || 0;
      // Reasonable if total ≈ prompt + completion
      const diff = Math.abs(total - prompt - completion);
      if (diff <= Math.max(prompt, completion) * 0.5) {
        u4 = 1;
      } else {
        u4 = 0.5;
        details.push(zh ? `total_tokens 与 prompt+completion 之和差异较大（${diff}）` : `total_tokens differs significantly from prompt+completion (${diff})`);
      }
    } else {
      u4 = 0;
    }

    // U5: usage matches request result
    if (hasTotalTokens && hasPromptTokens) {
      u5 = 0.75;
    } else if (hasTotalTokens || (hasPromptTokens && hasCompletionTokens)) {
      u5 = 0.375;
    } else {
      u5 = 0;
    }

    // U6: consumption explanation
    if (hasPromptTokens && hasCompletionTokens && hasTotalTokens) {
      u6 = 0.75;
    } else if (hasTotalTokens) {
      u6 = 0.375;
      details.push(zh ? '消耗说明不完整' : 'Consumption explanation incomplete');
    } else {
      u6 = 0;
    }
  }

  const score = u1 + u2 + u3 + u4 + u5 + u6;

  if (status !== 'skipped' && status !== 'failed') {
    const ratio = score / 6;
    if (ratio >= 0.95) status = 'excellent';
    else if (ratio >= 0.80) status = 'good';
    else if (ratio >= 0.50) status = 'warning';
    else status = 'failed';
  }

  if (targetFailed && status === 'skipped' && score > 1) {
    // Keep as skipped, don't mark failed
  }

  return mkCheck({
    id: 'usageAudit',
    label: { zh: '用量审计', en: 'Usage Audit' },
    maxScore: 6,
    score,
    status,
    summary: score >= 5.5 ? (zh ? '明细完整' : 'Details complete')
             : score >= 4 ? (zh ? '明细基本可用' : 'Details mostly available')
             : score >= 2 ? (zh ? '明细不完整' : 'Details incomplete')
             : (zh ? '无法审计' : 'Cannot audit'),
    details,
    deductions,
    evidence,
  });
}

/* ═══════════════════════════════════════════════════════
   STEP 8: Client Config Exportability — 6 pts (6 sub-items)
   Sub-items:
     C1: Base URL format correct (1 pt)
     C2: API Key masked (1 pt)
     C3: Model ID present (1 pt)
     C4: Cline config generatable (1 pt)
     C5: Continue config generatable (1 pt)
     C6: Verified by target call (1 pt)
   ═══════════════════════════════════════════════════════ */
function checkI_ClientConfig(baseUrl, apiKey, model, modelListResult, targetCallResult) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';

  let c1 = 1, c2 = 1, c3 = 1, c4 = 1, c5 = 1, c6 = 1;
  let status = 'excellent';

  // C1: Base URL format
  try {
    const url = new URL(baseUrl);
    c1 = 1;
    evidence.baseUrlOrigin = url.origin;
    if (!baseUrl.startsWith('https')) {
      details.push(zh ? 'Base URL 未使用 HTTPS' : 'Base URL not using HTTPS');
    }
  } catch (_) {
    c1 = 0;
    deductions.push(zh ? 'Base URL 格式异常' : 'Base URL format abnormal');
    status = 'warning';
  }

  // C2: API Key masked
  if (apiKey && apiKey.length >= 8) {
    c2 = 1;
    evidence.keyMasked = maskKey(apiKey);
  } else {
    c2 = 0;
    details.push(zh ? 'API Key 格式异常，无法脱敏' : 'API Key format abnormal, cannot mask');
  }

  // C3: Model ID present
  if (model && model.trim()) {
    c3 = 1;
    evidence.modelId = model;
  } else {
    c3 = 0;
    details.push(zh ? 'Model ID 为空' : 'Model ID is empty');
  }

  // C4: Cline config
  if (baseUrl && apiKey && model) {
    c4 = 1;
    evidence.clineReady = true;
  } else {
    c4 = 0;
  }

  // C5: Continue config
  if (baseUrl && apiKey && model) {
    c5 = 1;
    evidence.continueReady = true;
  } else {
    c5 = 0;
  }

  // C6: Verified by target call
  const targetFailed = targetCallResult && targetCallResult.status === 'failed' && targetCallResult.score < 11;
  if (targetFailed) {
    c6 = 0;
    details.push(zh ? '目标模型调用失败，配置未验证' : 'Target model call failed — config not verified');
    status = 'warning';
  } else if (targetCallResult?.evidence?.httpStatus >= 200 && targetCallResult?.evidence?.httpStatus < 300) {
    c6 = 1;
  } else if (targetCallResult?.evidence?.httpStatus) {
    c6 = 0.5;
    details.push(zh ? '配置可生成，但未完全验证' : 'Config can be generated but not fully verified');
  } else {
    c6 = 0;
    details.push(zh ? '配置可生成，但未验证可用' : 'Config can be generated but not verified');
  }

  const score = c1 + c2 + c3 + c4 + c5 + c6;

  if (status !== 'failed') {
    const ratio = score / 6;
    if (ratio >= 0.95) status = 'excellent';
    else if (ratio >= 0.80) status = 'good';
    else if (ratio >= 0.50) status = 'warning';
    else status = 'failed';
  }

  return mkCheck({
    id: 'clientConfig',
    label: { zh: '客户端配置可用性', en: 'Client Config Exportability' },
    maxScore: 6,
    score,
    status,
    summary: score >= 5 ? (zh ? '配置完整可导出' : 'Config complete and exportable')
             : score >= 3 ? (zh ? '配置基本完整' : 'Config mostly complete')
             : (zh ? '配置缺失' : 'Config incomplete'),
    details,
    deductions,
    evidence,
  });
}

/* ═══════════════════════════════════════════════════════
   Score Calculator
   ═══════════════════════════════════════════════════════ */
function calcRawScore(checks) {
  let raw = 0;
  for (const key of Object.keys(checks)) {
    const c = checks[key];
    raw += c?.score || 0;
  }
  return raw;
}

/* ═══════════════════════════════════════════════════════
   Soft Penalty & Risk Classification
   These are NOT hard caps — they describe the risk type
   and control suggestion text and deduction reasons.
   ═══════════════════════════════════════════════════════ */
/**
 * Classify model visibility risk level based on actual results.
 * Returns { riskType, softDeduction, reasonZh, reasonEn }
 * riskType: null | 'model_visibility_risk' | 'model_selection_risk' | 'model_unavailable'
 */
function classifyModelRisk(modelIdInfo, checks) {
  const { modelSource, isFinalModelInModelList, userModel, allModels } = modelIdInfo || {};
  const normalizedAll = (allModels || []).map(normalizeModelId);
  const modelNotInList = userModel &&
    !normalizedAll.includes(normalizeModelId(userModel));
  const modelListSucceeded = (checks.modelList?.score || 0) >= 3 && (checks.modelList?.evidence?.modelCount || 0) > 0;
  const targetScore = checks.targetCall?.score || 0;
  const targetWorks = targetScore >= 11;
  const usageScore = checks.usageAudit?.score || 0;
  const stabilityScore = checks.stability?.score || 0;

  // Only relevant when modelSource === 'user_input' and model not in list
  if (modelSource !== 'user_input' || !modelNotInList || !modelListSucceeded) {
    return { riskType: null, softDeduction: 0, reasonZh: '', reasonEn: '' };
  }

  // model_unavailable: not in list AND target call failed
  if (!targetWorks) {
    return {
      riskType: 'model_unavailable',
      softDeduction: 0,
      reasonZh: `当前 Model ID ${userModel} 未出现在模型列表中，且目标模型调用失败`,
      reasonEn: `Model ID ${userModel} not found in /models list and target call failed`
    };
  }

  // model_selection_risk: not in list, target works but usage or format issues
  if (targetWorks && (targetScore < 17 || usageScore < 1)) {
    return {
      riskType: 'model_selection_risk',
      softDeduction: 4,
      reasonZh: `当前 Model ID 未出现在模型列表中，且响应格式或用量数据异常`,
      reasonEn: `Model ID not in /models list and response format or usage data is abnormal`
    };
  }

  // model_visibility_risk: not in list but target works well
  if (targetWorks && targetScore >= 20 && stabilityScore >= 16 && usageScore >= 6) {
    return {
      riskType: 'model_visibility_risk',
      softDeduction: 2,
      reasonZh: `当前 Model ID 未出现在 /models 列表中，但实际调用已通过，可能是别名模型、隐藏模型或供应商未完整暴露模型列表`,
      reasonEn: `Model ID not in /models list but actual call passed — may be an alias, hidden model, or incomplete model list`
    };
  }

  // Fallback: not in list, target works but other issues
  return {
    riskType: 'model_selection_risk',
    softDeduction: 3,
    reasonZh: `当前 Model ID 未出现在模型列表中，实际调用部分成功`,
    reasonEn: `Model ID not in /models list; actual call partially succeeded`
  };
}

/* ═══════════════════════════════════════════════════════
   Hard Cap Rules
   Each cap is the ABSOLUTE MAXIMUM score given the failure mode.
   Soft penalties are applied separately via classifyModelRisk.
   ═══════════════════════════════════════════════════════ */
function applyCaps(rawScore, checks, modelIdInfo) {
  let cap = 100;
  let floor = 0;
  const zh = getDocLang() !== 'en';

  // R1: Base URL completely unreachable → 0-25
  if (checks.reachability?.score < 3) {
    cap = Math.min(cap, 25);
    floor = Math.max(floor, 0);
  }

  // R2: Auth failed / 401 → 25-40
  const has401 = checks.auth?.evidence?.modelsStatus === 401 || checks.auth?.evidence?.chatStatus === 401;
  if (has401) {
    cap = Math.min(cap, 40);
    floor = Math.max(floor, 25);
  }

  // R3: 403 or no permissions → 35-45
  const has403 = checks.auth?.evidence?.modelsStatus === 403 || checks.auth?.evidence?.chatStatus === 403;
  if (has403) {
    cap = Math.min(cap, 45);
    floor = Math.max(floor, 35);
  }

  // R4: No models available AND server essentially unusable → 35-55
  const modelsAvailable = (checks.modelList?.evidence?.models?.length || 0) > 0;
  const reachabilityBarelyWorking = (checks.reachability?.score || 0) < 5;
  const targetWorks = (checks.targetCall?.score || 0) >= 11;
  if (!modelsAvailable && reachabilityBarelyWorking && !targetWorks) {
    cap = Math.min(cap, 55);
    floor = Math.max(floor, 35);
  }

  // R5: Target model call truly failed (network error) → 45-68
  const targetNetworkFail = (checks.targetCall?.evidence?.networkError === true);
  if (targetNetworkFail) {
    cap = Math.min(cap, 68);
    floor = Math.max(floor, 45);
  }

  // R6: Target call failed but stability sampling succeeded → 50-72
  const targetFailed = (checks.targetCall?.score || 0) < 11;
  const stabilitySuccess = (checks.stability?.score || 0) >= 14;
  if (targetFailed && stabilitySuccess) {
    cap = Math.min(cap, 72);
    floor = Math.max(floor, 50);
    if (checks.stability) {
      checks.stability.status = 'inconsistent';
      checks.stability.deductions.push(
        zh ? '检测结果不一致：目标调用失败但稳定性采样成功' : 'Inconsistent: target call failed but stability sampling succeeded'
      );
    }
  }

  // R7: /models unavailable but manual model works → 65-82
  const modelListUnavailable = (checks.modelList?.score || 0) < 3;
  if (modelListUnavailable && targetWorks) {
    cap = Math.min(cap, 82);
    floor = Math.max(floor, 65);
  }

  // R8: REMOVED — model not in list but works → NO HARD CAP
  // Handled as soft penalty via classifyModelRisk() instead.
  // High-quality sites should NOT be capped at 88 for this reason alone.

  // R9: Stability not 3/3 → 70-88
  const stabilityWasSkipped = (checks.stability?.status === 'skipped');
  const successSamples = (checks.stability?.evidence?.samples?.filter(s => s.ok && s.hasContent).length) || 0;
  if (successSamples < 3 && targetWorks && !stabilityWasSkipped) {
    cap = Math.min(cap, 88);
    floor = Math.max(floor, 70);
  }

  // R10: Average latency > 8000ms → 75-90
  const avgLat = checks.stability?.evidence?.avgLatency || 0;
  if (avgLat > 8000 && avgLat < 99999) {
    cap = Math.min(cap, 90);
    floor = Math.max(floor, 75);
  }

  // R11: usage completely missing (only when target call worked AND not skipped)
  if (!targetNetworkFail && (checks.usageAudit?.score || 0) < 1 && !stabilityWasSkipped) {
    cap = Math.min(cap, 94);
    floor = Math.max(floor, 75);
  }

  // R12: Inconsistent results detected → 50-72
  const hasInconsistent = Object.values(checks).some(c => c?.status === 'inconsistent');
  if (hasInconsistent) {
    cap = Math.min(cap, 72);
    floor = Math.max(floor, 50);
  }

  // R13: HTML login page / Cloudflare / WAF → 40-60
  const reachDeds = checks.reachability?.deductions || [];
  const htmlPage = reachDeds.some(d => /html|cloudflare|waf|login|signin/i.test(d));
  if (htmlPage) {
    cap = Math.min(cap, 60);
    floor = Math.max(floor, 40);
  }

  // R14: 429 rate limit detected → 70-86
  const rateLimit = checks.stability?.evidence?.rateLimitDetected ||
                    checks.auth?.evidence?.chatStatus === 429 ||
                    checks.auth?.evidence?.modelsStatus === 429;
  if (rateLimit) {
    cap = Math.min(cap, 86);
    floor = Math.max(floor, 70);
  }

  // R15: Empty content but HTTP success → 55-70
  const emptyContent = checks.targetCall?.evidence?.output?.status === 'absent' &&
                        (checks.targetCall?.evidence?.httpStatus || 0) >= 200 &&
                        (checks.targetCall?.evidence?.httpStatus || 0) < 400;
  if (emptyContent) {
    cap = Math.min(cap, 70);
    floor = Math.max(floor, 55);
  }

  return Math.min(Math.max(rawScore, floor), cap);
}

/* ═══════════════════════════════════════════════════════
   Judgment & Finding
   ═══════════════════════════════════════════════════════ */
/**
 * Judgment text (zh/en) — uses unified grade tiers.
 * Kept for backward compatibility; prefers getScoreGrade().labelZh
 */
function getJudgment(score, checks) {
  return getScoreGrade(score).labelZh;
}

/**
 * One-line finding text — uses unified grade tiers.
 */
function getOneLineFinding(score, checks) {
  return getScoreGrade(score).descZh;
}

/* ═══════════════════════════════════════════════════════
   Suggestions Generator
   Generates suggestions based on deductions and failed/warning/inconsistent items.
   Priority-ordered from most severe to least.
   modelRisk: from classifyModelRisk() — layered model visibility messages.
   ═══════════════════════════════════════════════════════ */
function generateSuggestions(checks, score, modelIdInfo, modelRisk) {
  const zh = getDocLang() !== 'en';
  const suggestions = [];
  const addedKeys = new Set();

  function add(key, textZh, textEn) {
    if (!addedKeys.has(key)) {
      suggestions.push(zh ? textZh : textEn);
      addedKeys.add(key);
    }
  }

  // 1. Inconsistent (highest priority)
  const hasInconsistent = Object.values(checks).some(c => c?.status === 'inconsistent');
  if (hasInconsistent) {
    add('inconsistent',
      '检测结果存在不一致：部分检测项之间结果冲突，请检查是否使用了不同模型或评分字段未同步。',
      'Detection results are inconsistent: some checks conflict with each other. Check if different models were used or scoring fields were not synchronized.'
    );
  }

  // 2. Target model call failed
  if (checks.targetCall?.score < 11) {
    add('target_failed',
      '目标模型调用失败，请检查 Model ID 是否真实可用，或确认该模型是否支持 chat/completions。',
      'Target model call failed. Check if the Model ID is actually available, or confirm the model supports chat/completions.'
    );
  }

  // 3. Model visibility risk — use layered modelRisk from classifyModelRisk()
  if (modelRisk && modelRisk.riskType === 'model_visibility_risk') {
    add('model_visibility_risk',
      '当前 Model ID 未出现在 /models 列表中，但实际调用已通过，可能是别名模型、隐藏模型或供应商未完整暴露模型列表。',
      'Model ID not in /models list but actual call passed — may be an alias, hidden model, or incomplete model list.'
    );
  } else if (modelRisk && modelRisk.riskType === 'model_selection_risk') {
    add('model_selection_risk',
      '当前 Model ID 未出现在 /models 列表中，且响应格式或用量数据异常，建议确认模型 ID 是否正确。',
      'Model ID not in /models list and response format or usage data is abnormal. Confirm if the Model ID is correct.'
    );
  } else if (modelRisk && modelRisk.riskType === 'model_unavailable') {
    add('model_unavailable',
      '当前 Model ID 未出现在 /models 列表中，且实际调用失败，请检查模型 ID 是否填写正确或是否有权限。',
      'Model ID not in /models list and actual call failed. Check if the Model ID is correct or if you have permission.'
    );
  }

  // 3b. modelSource === 'auto_detected' — no model-not-found message
  if (modelSource === 'auto_detected' && isFinalModelInModelList) {
    add('auto_detected_ok',
      '系统已从模型列表中自动选择可测试模型。',
      'System auto-selected a testable model from the model list.'
    );
  }

  // 4. Stability not 3/3
  const successSamples = (checks.stability?.evidence?.samples?.filter(s => s.ok && s.hasContent).length) || 0;
  if (successSamples < 3) {
    add('stability_partial',
      '稳定性采样未全部成功，建议在真实客户端中继续观察。',
      'Stability sampling not all successful. Recommend observing in a real client environment.'
    );
  }

  // 5. High average latency (> 8000ms — serious; 5000-8000ms — mild)
  const avgLat = checks.stability?.evidence?.avgLatency || 0;
  if (avgLat > 8000) {
    add('high_latency',
      `平均响应延迟较高（${Math.round(avgLat)}ms），可能影响 Cline、Continue 等客户端体验。`,
      `Average response latency is high (${Math.round(avgLat)}ms), which may affect Cline, Continue and other client experiences.`
    );
  }

  // 5b. High latency jitter
  const jitter = checks.stability?.evidence?.latencyJitter || 0;
  if (jitter > 8000) {
    add('latency_jitter',
      '延迟波动较大，建议在真实客户端中继续观察稳定性。',
      'Latency jitter is high. Recommend observing stability in a real client environment.'
    );
  }

  // 6. No usage
  if (checks.usageAudit?.score < 1) {
    add('no_usage',
      '模型可调用，但未返回 token usage，无法准确审计消耗。',
      'Model is callable but returns no token usage. Cannot accurately audit consumption.'
    );
  }

  // 7. /models unavailable
  if (checks.modelList?.score < 3) {
    add('no_model_list',
      '模型列表接口不可用，但手动模型可调用，建议确认该站是否完整兼容 OpenAI API。',
      'Model list endpoint is unavailable but manual model call works. Confirm if this provider fully supports OpenAI API.'
    );
  }

  // 8. 429 rate limit
  if (checks.stability?.evidence?.rateLimitDetected || checks.auth?.evidence?.chatStatus === 429) {
    add('rate_limit',
      '检测中触发了限流，建议降低请求频率或升级套餐。',
      'Rate limit triggered during detection. Consider reducing request frequency or upgrading the plan.'
    );
  }

  // 9. Base URL unreachable
  if (checks.reachability?.score < 3) {
    add('unreachable',
      'Base URL 无法连接，请检查地址是否正确、端口是否开放、服务器是否运行中。',
      'Base URL is unreachable. Check if the address is correct, the port is open, and the server is running.'
    );
  }

  // 10. Auth failed
  if (checks.auth?.score < 5) {
    add('auth_failed',
      '鉴权失败，请确认 API Key 有效且未过期，或检查是否对该端点有权限。',
      'Auth failed. Confirm the API Key is valid and not expired, or check if it has permission for this endpoint.'
    );
  }

  // Fallback: all good
  if (suggestions.length === 0) {
    suggestions.push(
      zh ? '各项核心检测通过，建议持续观察。' : 'All core checks passed. Recommend ongoing monitoring.'
    );
  }

  return suggestions;
}

/* ═══════════════════════════════════════════════════════
   Report Card HTML Builder
   Default collapsed, expandable details.
   ═══════════════════════════════════════════════════════ */
function buildReportCardHTML(result, formData, lang, modelIdInfo, modelRisk) {
  const zh = lang !== 'en';
  const { score, rawScore, checks, reportId } = result;
  const grade = getScoreGrade(score);

  const escH = (s) => esc(String(s || ''));

  // Unified pill by status
  function pillByStatus(status) {
    const cfg = statusColor(status);
    const label = statusLabel(status, zh);
    return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;color:${cfg.color};background:${cfg.bg}">${escH(label)}</span>`;
  }

  // Sub-item row
  function subRow(item, depth = 20) {
    if (!item || item.maxScore === 0) return '';
    const ratio = item.score / item.maxScore;
    const status = computeCheckStatus(item.maxScore, item.score, null);
    const cfg = statusColor(status);
    const icon = status === 'excellent' ? '&#10003;'
               : status === 'good' ? '&#10003;'
               : status === 'warning' ? '&#9888;'
               : status === 'failed' ? '&#10007;'
               : status === 'skipped' ? '&#8212;'
               : '&#9888;';
    return `<div class="rc-sub-row" style="padding-left:${depth}px">
      <span style="color:${cfg.color};font-size:11px;margin-right:4px">${icon}</span>
      <span class="rc-label">${escH(item.label || item.id)}</span>
      <span class="rc-score">${item.score}/${item.maxScore}</span>
      <span style="color:${cfg.color};font-size:10px">${pillByStatus(status)}</span>
      ${item.summary ? `<span class="rc-detail">${escH(item.summary)}</span>` : ''}
    </div>`;
  }

  // Deduction row
  function deductionRow(text, severity) {
    const color = severity === 'warn' ? '#f59e0b' : '#dc2626';
    return `<li style="color:${color};font-size:11px;padding:2px 0 2px 16px;position:relative">
      <span style="position:absolute;left:0;color:${color}">&#8226;</span>${escH(text)}</li>`;
  }

  // Collapsible section for each check
  function collapsibleSection(checkKey, checkData) {
    if (!checkData) return '';

    const label = checkData.label?.[zh ? 'zh' : 'en'] || checkData.label || checkKey;
    const status = checkData.status || 'failed';
    const cfg = statusColor(status);
    const pill = pillByStatus(status);
    const rowId = 'rc-row-' + checkKey + '-' + reportId;
    const contentId = 'rc-content-' + checkKey + '-' + reportId;

    // Determine sub-items based on check type
    let subItemsHtml = '';

    if (checkKey === 'stability' && checkData.evidence?.samples) {
      // Special: stability with sample table
      const samples = checkData.evidence.samples;
      const sampleRows = samples.map((s, i) => {
        const okIcon = s.ok ? '&#10003;' : '&#10007;';
        const okColor = s.ok ? '#16a34a' : '#dc2626';
        return `<tr style="font-size:10px">
          <td style="padding:3px 8px;color:#64748b">#${i + 1}</td>
          <td style="padding:3px 8px;color:${okColor}">${okIcon}</td>
          <td style="padding:3px 8px">${s.status || '-'}</td>
          <td style="padding:3px 8px">${s.latency}ms</td>
          <td style="padding:3px 8px">${escH(s.responseText || s.errMsg || '-')}</td>
        </tr>`;
      }).join('');
      subItemsHtml += `<table style="width:100%;border-collapse:collapse;margin:4px 0 8px 0">
        <tr style="background:#f8fafc;font-size:10px;color:#64748b">
          <th style="padding:3px 8px;text-align:left">Ping</th>
          <th style="padding:3px 8px;text-align:left">OK</th>
          <th style="padding:3px 8px;text-align:left">Status</th>
          <th style="padding:3px 8px;text-align:left">Latency</th>
          <th style="padding:3px 8px;text-align:left">Response/Error</th>
        </tr>
        ${sampleRows}
      </table>`;
    }

    // Sub-items (different per check)
    const subKeys = getSubItems(checkKey, checkData);
    if (subKeys.length > 0) {
      subItemsHtml += subKeys.map(key => {
        const sub = subKeys[key];
        if (!sub) return '';
        return subRow(sub, 16);
      }).join('');
    }

    // Deductions
    let dedHtml = '';
    if (checkData.deductions && checkData.deductions.length > 0) {
      dedHtml = checkData.deductions.map(d => deductionRow(d, 'fail')).join('');
    }
    if (checkData.details && checkData.details.length > 0) {
      dedHtml += checkData.details.map(d => deductionRow(d, 'warn')).join('');
    }

    // Default collapsed summary
    const defaultSummary = checkData.summary || '';

    // For stability, show a compact summary in collapsed mode
    let collapsedDetail = defaultSummary;
    if (checkKey === 'stability') {
      const samples = checkData.evidence?.samples || [];
      const okCount = samples.filter(s => s.ok && s.hasContent).length;
      const avgLat = checkData.evidence?.avgLatency || 0;
      collapsedDetail = `${okCount}/3 ${zh ? '成功' : 'success'}, ${avgLat > 0 ? Math.round(avgLat) + 'ms' : '-'}`;
    }

    return `<div class="rc-check-block">
      <div class="rc-check-header" id="${rowId}" onclick="(function(){
        var c=document.getElementById('${contentId}');
        var t=document.getElementById('${rowId}-toggle');
        var cur=c.style.display;
        c.style.display=cur==='none'?'block':'none';
        t.textContent=cur==='none'?'[${zh?'收起':'Collapse'} ···]':'[${zh?'展开':'Expand'} ···]';
      })()" style="cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f1f5f9">
        <span class="rc-check-label">${escH(label)}</span>
        <span class="rc-check-score">${checkData.score}/${checkData.maxScore}</span>
        <span>${pill}</span>
        <span class="rc-check-summary" style="flex:1;color:#94a3b8;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(collapsedDetail)}</span>
        <span id="${rowId}-toggle" style="color:#2563eb;font-size:11px;white-space:nowrap">[${zh?'展开':'Expand'} ···]</span>
      </div>
      <div id="${contentId}" style="display:none;padding:4px 0 8px 0">
        ${subItemsHtml}
        ${dedHtml ? `<ul style="margin:4px 0 0 0;padding:0;list-style:none">${dedHtml}</ul>` : ''}
      </div>
    </div>`;
  }

  // Generate suggestions (modelRisk passed for layered model visibility messages)
  const suggestions = generateSuggestions(checks, score, modelIdInfo, modelRisk);
  let suggestionHtml = `<div class="rc-section">
    <div class="rc-section-title">${zh ? '建议' : 'Recommendations'}</div>
    <ul style="margin:0;padding:0 0 0 16px;font-size:12px;color:#374151;line-height:1.8">
      ${suggestions.map(s => `<li>${escH(s)}</li>`).join('')}
    </ul>
  </div>`;

  // Deductions section — include model risk as a visible soft item
  const allDeductions = Object.values(checks)
    .filter(c => c?.deductions?.length > 0)
    .flatMap(c => c.deductions.map(d => ({ text: d, check: c.label?.[zh?'zh':'en'] || c.id, severity: 'fail' })));
  // Append model risk as a "warn" severity deduction (not critical red)
  if (modelRisk && modelRisk.riskType && modelRisk.reasonZh) {
    allDeductions.push({
      text: modelRisk.reasonZh,
      check: zh ? '模型可见性' : 'Model Visibility',
      severity: 'warn'
    });
  }
  let deductionsHtml = '';
  if (allDeductions.length > 0) {
    deductionsHtml = `<div class="rc-section">
      <div class="rc-section-title">${zh ? '扣分原因' : 'Deduction Reasons'}</div>
      <ul style="margin:0;padding:0 0 0 16px;font-size:11px;line-height:1.9">
        ${allDeductions.map(d => `<li style="color:${d.severity === 'fail' ? '#dc2626' : '#d97706'};padding:2px 0 2px 16px;position:relative">
      <span style="position:absolute;left:0;color:${d.severity === 'fail' ? '#dc2626' : '#d97706'}">&#8226;</span><span style="color:#64748b;font-size:10px">[${escH(d.check)}]</span> ${escH(d.text)}</li>`).join('')}
      </ul>
    </div>`;
  }

  // Model ID info — show source badge
  const finalModel = modelIdInfo?.finalTestModelId || '';
  const { modelSource, isFinalModelInModelList } = modelIdInfo || {};
  const modelDisplay = [];
  if (modelIdInfo?.userModel) {
    modelDisplay.push(`<div><span style="font-weight:600;color:#374151">${zh ? '用户填写模型' : 'User-filled Model'}:</span> ${escH(modelIdInfo.userModel)}</div>`);
  }
  if (modelIdInfo?.autoModel && normalizeModelId(modelIdInfo.autoModel) !== normalizeModelId(modelIdInfo?.userModel)) {
    modelDisplay.push(`<div><span style="font-weight:600;color:#374151">${zh ? '自动识别模型' : 'Auto-detected Model'}:</span> ${escH(modelIdInfo.autoModel)}</div>`);
  }
  modelDisplay.push(`<div><span style="font-weight:600;color:#374151">${zh ? '实际测试模型' : 'Actual Test Model'}:</span> ${escH(finalModel)}</div>`);
  if (modelSource) {
    const sourceLabel = modelSource === 'user_input'
      ? (zh ? '用户填写' : 'User-filled')
      : modelSource === 'auto_detected'
      ? (zh ? '自动识别' : 'Auto-detected')
      : (zh ? '列表回退' : 'List fallback');
    const sourceColor = modelSource === 'auto_detected' ? '#16a34a' : modelSource === 'user_input' ? '#3b82f6' : '#94a3b8';
    modelDisplay.push(`<div style="font-size:10px;color:${sourceColor}">${zh ? '来源：' : 'Source: '}${sourceLabel}${isFinalModelInModelList ? (zh ? ' ✓' : ' ✓') : (zh ? ' ✗' : ' ✗')}</div>`);
  }

  // Model mismatch warning (normalized comparison)
  let modelMismatchWarning = '';
  if (modelIdInfo?.userModel && modelIdInfo?.autoModel &&
      normalizeModelId(modelIdInfo.userModel) !== normalizeModelId(modelIdInfo.autoModel)) {
    modelMismatchWarning = `<div style="background:#fef9c3;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:11px;color:#92400e">
      ${zh ? '当前实际测试模型与用户填写模型不一致，评分仅代表实际测试模型，不代表用户填写模型。' : 'The actual test model differs from the user-filled model. Scores only represent the actual test model, not the user-filled model.'}
    </div>`;
  }

  // Safe baseUrl
  let safeBaseUrl = '';
  try { safeBaseUrl = new URL(formData.baseUrl).origin + new URL(formData.baseUrl).pathname.replace(/\/$/, ''); }
  catch (_) { safeBaseUrl = formData.baseUrl; }

  // Cap badge if raw !== final
  let capNote = '';
  if (rawScore > score) {
    capNote = `<div style="font-size:10px;color:#94a3b8;text-align:center;margin-top:2px">${zh ? '已应用封顶：' : 'Cap applied: '} ${rawScore} → ${score}</div>`;
  }

  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#f8fafc;padding:28px;box-sizing:border-box">

    <!-- Score card -->
    <div style="background:#0f172a;border-radius:20px;padding:18px 20px 16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-size:15px;font-weight:800;color:#fff;letter-spacing:-0.2px">API Doctor</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">${zh ? '中转站最强照妖镜' : 'Relay API Black-box Check'}</div>
        </div>
        <div style="background:${grade.bg};border-radius:10px;padding:6px 14px;text-align:center;flex-shrink:0">
          <div style="font-size:22px;font-weight:900;color:${grade.color};line-height:1">${grade.grade}</div>
          <div style="font-size:9px;color:${grade.color};font-weight:600;margin-top:2px">${zh ? grade.labelZh : grade.label}</div>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:6px">
        <div style="font-size:60px;font-weight:900;color:${grade.color};line-height:1">${score}</div>
        <div style="font-size:13px;font-weight:700;color:${grade.color};margin-top:4px">${escH(getJudgment(score, checks))}</div>
        ${capNote}
      </div>
      <div style="font-size:11px;color:#94a3b8;text-align:center;margin-top:2px">${escH(getOneLineFinding(score, checks))}</div>
    </div>

    <!-- Model mismatch warning -->
    ${modelMismatchWarning}

    <!-- 8 diagnostic items (collapsible) -->
    <div style="background:#fff;border-radius:16px;padding:12px 16px;margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #f1f5f9">8 ${zh ? '项检测结果（点击展开详情）' : 'Diagnostic Results (click to expand)'}</div>
      ${collapsibleSection('reachability', checks.reachability)}
      ${collapsibleSection('auth', checks.auth)}
      ${collapsibleSection('modelList', checks.modelList)}
      ${collapsibleSection('autoModel', checks.autoModel)}
      ${collapsibleSection('targetCall', checks.targetCall)}
      ${collapsibleSection('stability', checks.stability)}
      ${collapsibleSection('usageAudit', checks.usageAudit)}
      ${collapsibleSection('clientConfig', checks.clientConfig)}
    </div>

    ${deductionsHtml}
    ${suggestionHtml}

    <!-- Test config -->
    <div style="background:#fff;border-radius:12px;padding:10px 14px;margin-bottom:10px;font-size:11px;color:#64748b">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div><span style="font-weight:600;color:#374151">Base URL:</span> ${escH(safeBaseUrl)}</div>
        <div><span style="font-weight:600;color:#374151">Model:</span> ${escH(finalModel)}</div>
      </div>
      ${modelDisplay.join('')}
    </div>

    <!-- Footer -->
    <div style="text-align:center;font-size:11px;color:#94a3b8;padding:2px 0">
      ${zh ? '报告 ID' : 'Report ID'}: ${reportId} &nbsp;|&nbsp; aiapidoctor.com
    </div>
    <div style="font-size:10px;color:#94a3b8;text-align:center;padding:4px 0 2px;line-height:1.4">
      ${zh ? '本报告仅展示可复现信号，不构成法律结论。' : 'Report shows reproducible signals only, not a legal conclusion.'}
    </div>

    <!-- Actions -->
    <div style="display:flex;gap:8px;margin-top:10px">
      <button onclick="Doctor.saveImage()" style="flex:1;padding:10px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">${zh ? '保存图片' : 'Save Image'}</button>
      <button onclick="Doctor.copyScore()" style="flex:1;padding:10px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">${zh ? '复制验货分' : 'Copy Score'}</button>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════
   Sub-items for each check (used by report builder)
   ═══════════════════════════════════════════════════════ */
function getSubItems(checkKey, checkData) {
  const ev = checkData.evidence || {};
  const zh = getDocLang() !== 'en';

  if (checkKey === 'reachability') {
    return {
      [zh ? '网络可连接' : 'Network']:       { score: ev.score >= 9 ? 3 : ev.score >= 6 ? 2 : 1.5, maxScore: 3, label: zh ? '网络可连接' : 'Network', summary: ev.netError ? '失败' : '可达' },
      [zh ? 'TLS/HTTPS' : 'TLS/HTTPS']:      { score: ev.score >= 10 ? 2 : 1, maxScore: 2, label: zh ? 'TLS/HTTPS' : 'TLS/HTTPS', summary: baseUrl => '' },
      [zh ? '响应时间' : 'Response Time']:   { score: ev.latency < 1000 ? 2 : ev.latency < 3000 ? 1.5 : ev.latency < 8000 ? 1 : ev.latency < 30000 ? 0.5 : 0, maxScore: 2, label: zh ? '响应时间' : 'Response Time', summary: ev.latency ? ev.latency + 'ms' : '-' },
      [zh ? '返回内容类型' : 'Content Type']: { score: ev.modelEndpointOk ? 2 : 1, maxScore: 2, label: zh ? '返回内容类型' : 'Content Type', summary: ev.contentType || '-' },
      [zh ? '兼容路径' : 'Compat Path']:      { score: ev.modelEndpointOk ? 2 : 1, maxScore: 2, label: zh ? '兼容路径' : 'Compat Path', summary: ev.modelEndpointOk ? 'OK' : '部分' },
      [zh ? '错误可解释' : 'Error Explain']:  { score: ev.httpStatus >= 400 ? (ev.httpStatus === 401 || ev.httpStatus === 403 || ev.httpStatus === 404 || ev.httpStatus === 429 ? 1 : 0) : 1, maxScore: 1, label: zh ? '错误可解释' : 'Error Explain', summary: ev.httpStatus >= 400 ? ev.httpStatus : '正常' },
    };
  }

  if (checkKey === 'auth') {
    const st = ev.modelsStatus || 0;
    const ct = ev.chatStatus || 0;
    return {
      [zh ? 'Authorization Header' : 'Auth Header']: { score: st === 401 || ct === 401 ? 0 : 3, maxScore: 3, label: zh ? 'Authorization Header' : 'Auth Header', summary: st === 401 || ct === 401 ? '未识别' : '已识别' },
      [zh ? 'Key 格式' : 'Key Format']: { score: 2, maxScore: 2, label: zh ? 'Key 格式' : 'Key Format', summary: ev.keyMasked || 'sk-****' },
      [zh ? '非 401' : 'Not 401']: { score: st === 401 || ct === 401 ? 0 : st > 0 || ct > 0 ? 3 : 0, maxScore: 3, label: zh ? '非 401' : 'Not 401', summary: st === 401 || ct === 401 ? '401' : 'OK' },
      [zh ? '非 403' : 'Not 403']: { score: st === 403 || ct === 403 ? 0 : st === 429 || ct === 429 ? 1.5 : 3, maxScore: 3, label: zh ? '非 403' : 'Not 403', summary: st === 403 || ct === 403 ? '403' : st === 429 || ct === 429 ? '429' : 'OK' },
      [zh ? '错误可读' : 'Error Readable']: { score: ev.errorMessage ? 1 : 0, maxScore: 1, label: zh ? '错误可读' : 'Error Readable', summary: ev.errorMessage ? 'OK' : '-' },
      [zh ? '鉴权一致性' : 'Auth Consistency']: { score: (st >= 200 && st < 400) === (ct >= 200 && ct < 400) ? 2 : 1, maxScore: 2, label: zh ? '鉴权一致性' : 'Auth Consistency', summary: `${st || '-'}/${ct || '-'}` },
    };
  }

  if (checkKey === 'modelList') {
    return {
      [zh ? '/models 请求' : '/models Request']: { score: checkData.score >= 9 ? 3 : checkData.score >= 6 ? 2 : checkData.score >= 3 ? 1 : 0, maxScore: 3, label: zh ? '/models 请求' : '/models Request', summary: `${ev.httpStatus || '-'} ${ev.modelCount || 0} ${zh ? '个' : 'models'}` },
      [zh ? '响应格式' : 'Response Format']: { score: ev.parseError ? 0 : ev.data?.data ? 2 : 1, maxScore: 2, label: zh ? '响应格式' : 'Response Format', summary: ev.parseError ? '非JSON' : 'JSON OK' },
      [zh ? '模型数量' : 'Model Count']: { score: ev.modelCount === 0 ? 0 : ev.modelCount <= 2 ? 1 : 2, maxScore: 2, label: zh ? '模型数量' : 'Model Count', summary: String(ev.modelCount || 0) },
      [zh ? 'ID 可读性' : 'ID Readability']: { score: ev.modelCount > 0 ? 1 : 0, maxScore: 1, label: zh ? 'ID 可读性' : 'ID Readability', summary: ev.firstModel || '-' },
      [zh ? '包含填写模型' : 'Has User Model']: { score: 0, maxScore: 2, label: zh ? '包含填写模型' : 'Has User Model', summary: ev.userModel || (zh ? '未填写' : 'not filled') },
      [zh ? '列表稳定性' : 'List Stability']: { score: checkData.score >= 3 ? 1 : 0, maxScore: 1, label: zh ? '列表稳定性' : 'List Stability', summary: checkData.score >= 3 ? 'OK' : '-' },
      [zh ? '错误可解释' : 'Error Explain']: { score: checkData.score >= 3 ? 1 : 0, maxScore: 1, label: zh ? '错误可解释' : 'Error Explain', summary: checkData.score >= 3 ? 'OK' : '-' },
    };
  }

  if (checkKey === 'targetCall') {
    return {
      [zh ? '请求发出' : 'Request Sent']: { score: ev.error ? 0 : 2, maxScore: 2, label: zh ? '请求发出' : 'Request Sent', summary: ev.error ? ev.error : 'OK' },
      [zh ? 'HTTP 状态' : 'HTTP Status']: { score: ev.httpStatus >= 200 && ev.httpStatus < 300 ? 3 : ev.httpStatus === 401 || ev.httpStatus === 403 ? 0 : ev.httpStatus === 429 ? 1 : ev.httpStatus >= 400 ? 1.5 : 0, maxScore: 3, label: zh ? 'HTTP 状态' : 'HTTP Status', summary: String(ev.httpStatus || '-') },
      [zh ? '合法 JSON' : 'Valid JSON']: { score: ev.responseParsed ? 3 : 0, maxScore: 3, label: zh ? '合法 JSON' : 'Valid JSON', summary: ev.responseParsed ? 'OK' : '失败' },
      [zh ? '兼容格式' : 'Compat Format']: { score: ev.formatChoices && ev.formatMessage ? 4 : ev.formatChoices ? 2 : 0, maxScore: 4, label: zh ? '兼容格式' : 'Compat Format', summary: ev.formatChoices ? 'OK' : '失败' },
      [zh ? '内容非空' : 'Content Non-empty']: { score: ev.output?.status === 'present' ? 3 : ev.output?.status === 'unknown' ? 1.5 : 0, maxScore: 3, label: zh ? '内容非空' : 'Content Non-empty', summary: ev.output?.text?.slice(0, 20) || '-' },
      [zh ? 'finish_reason' : 'finish_reason']: { score: ev.finishReason ? 2 : 0.5, maxScore: 2, label: zh ? 'finish_reason' : 'finish_reason', summary: ev.finishReason || '缺失' },
      [zh ? 'usage 字段' : 'usage Field']: { score: ev.usage ? (ev.usage.total_tokens ? 2 : 1) : 0, maxScore: 2, label: zh ? 'usage 字段' : 'usage Field', summary: ev.usage?.total_tokens ? `total=${ev.usage.total_tokens}` : '无' },
      [zh ? '延迟质量' : 'Latency Quality']: { score: ev.latencyMs < 2000 ? 2 : ev.latencyMs < 5000 ? 1.5 : ev.latencyMs < 10000 ? 1 : 0.5, maxScore: 2, label: zh ? '延迟质量' : 'Latency Quality', summary: ev.latencyMs ? ev.latencyMs + 'ms' : '-' },
      [zh ? '错误可读' : 'Error Readable']: { score: ev.httpStatus < 400 ? 1 : ev.errorMsg ? 1 : 0, maxScore: 1, label: zh ? '错误可读' : 'Error Readable', summary: ev.httpStatus < 400 ? 'OK' : ev.errorMsg || '失败' },
    };
  }

  if (checkKey === 'stability') {
    const samples = ev.samples || [];
    const okCount = samples.filter(s => s.ok && s.hasContent).length;
    const avgLat = ev.avgLatency || 0;
    const jitter = ev.latencyJitter || 0;
    return {
      [zh ? '成功率' : 'Success Rate']: { score: okCount === 3 ? 6 : okCount === 2 ? 4 : okCount === 1 ? 2 : 0, maxScore: 6, label: zh ? '成功率' : 'Success Rate', summary: `${okCount}/3` },
      [zh ? '状态一致性' : 'Status Consistency']: { score: okCount === 3 ? 2 : okCount >= 1 ? 1 : 0, maxScore: 2, label: zh ? '状态一致性' : 'Status Consistency', summary: okCount === 3 ? '一致' : '不一致' },
      [zh ? '平均延迟' : 'Avg Latency']: { score: avgLat < 2000 ? 3 : avgLat < 5000 ? 2 : avgLat < 10000 ? 1 : 0, maxScore: 3, label: zh ? '平均延迟' : 'Avg Latency', summary: avgLat > 0 ? Math.round(avgLat) + 'ms' : '-' },
      [zh ? '延迟波动' : 'Latency Jitter']: { score: jitter < 1000 ? 3 : jitter < 3000 ? 2 : jitter < 8000 ? 1 : 0, maxScore: 3, label: zh ? '延迟波动' : 'Latency Jitter', summary: jitter > 0 ? jitter + 'ms' : '-' },
      [zh ? '返回一致性' : 'Return Consistency']: { score: okCount === 3 ? 2 : okCount >= 1 ? 1 : 0, maxScore: 2, label: zh ? '返回一致性' : 'Return Consistency', summary: okCount === 3 ? 'OK' : '不一致' },
      [zh ? '错误可读' : 'Error Explainable']: { score: checkData.score >= 16 ? 1 : checkData.score >= 8 ? 1 : 0, maxScore: 1, label: zh ? '错误可读' : 'Error Explainable', summary: '—' },
      [zh ? '限流/风控' : 'Rate Limit']: { score: ev.rateLimitDetected ? 0 : 1, maxScore: 1, label: zh ? '限流/风控' : 'Rate Limit', summary: ev.rateLimitDetected ? zh ? '触发' : 'Triggered' : '无' },
    };
  }

  if (checkKey === 'usageAudit') {
    const u = ev.usage || {};
    return {
      [zh ? 'usage 存在' : 'usage Exists']: { score: u.total_tokens || u.prompt_tokens ? 1.5 : 0, maxScore: 1.5, label: zh ? 'usage 存在' : 'usage Exists', summary: u.total_tokens ? 'OK' : '无' },
      [zh ? 'prompt_tokens' : 'prompt_tokens']: { score: u.prompt_tokens != null || u.input_tokens != null ? 1 : 0, maxScore: 1, label: zh ? 'prompt_tokens' : 'prompt_tokens', summary: u.prompt_tokens != null ? String(u.prompt_tokens) : '-' },
      [zh ? 'completion_tokens' : 'completion_tokens']: { score: u.completion_tokens != null || u.output_tokens != null ? 1 : 0, maxScore: 1, label: zh ? 'completion_tokens' : 'completion_tokens', summary: u.completion_tokens != null ? String(u.completion_tokens) : '-' },
      [zh ? 'total_tokens' : 'total_tokens']: { score: u.total_tokens != null ? 1 : 0, maxScore: 1, label: zh ? 'total_tokens' : 'total_tokens', summary: u.total_tokens != null ? String(u.total_tokens) : '-' },
      [zh ? '与结果对应' : 'Matches Result']: { score: u.total_tokens && u.prompt_tokens ? 0.75 : 0, maxScore: 0.75, label: zh ? '与结果对应' : 'Matches Result', summary: u.total_tokens ? 'OK' : '-' },
      [zh ? '消耗说明' : 'Consumption Info']: { score: u.prompt_tokens && u.completion_tokens ? 0.75 : u.total_tokens ? 0.375 : 0, maxScore: 0.75, label: zh ? '消耗说明' : 'Consumption Info', summary: '—' },
    };
  }

  if (checkKey === 'clientConfig') {
    return {
      [zh ? 'Base URL 格式' : 'Base URL Format']: { score: ev.baseUrlOrigin ? 1 : 0, maxScore: 1, label: zh ? 'Base URL 格式' : 'Base URL Format', summary: ev.baseUrlOrigin || '-' },
      [zh ? 'Key 脱敏' : 'Key Masked']: { score: ev.keyMasked ? 1 : 0, maxScore: 1, label: zh ? 'Key 脱敏' : 'Key Masked', summary: ev.keyMasked || '-' },
      [zh ? 'Model ID' : 'Model ID']: { score: ev.modelId ? 1 : 0, maxScore: 1, label: zh ? 'Model ID' : 'Model ID', summary: ev.modelId || '-' },
      [zh ? 'Cline 配置' : 'Cline Config']: { score: ev.clineReady ? 1 : 0, maxScore: 1, label: zh ? 'Cline 配置' : 'Cline Config', summary: ev.clineReady ? 'OK' : '-' },
      [zh ? 'Continue 配置' : 'Continue Config']: { score: ev.continueReady ? 1 : 0, maxScore: 1, label: zh ? 'Continue 配置' : 'Continue Config', summary: ev.continueReady ? 'OK' : '-' },
      [zh ? '已验证' : 'Verified']: { score: c6_score(ev), maxScore: 1, label: zh ? '已验证' : 'Verified', summary: c6_score(ev) > 0 ? 'OK' : '未验证' },
    };
  }

  return {};
}

function c6_score(ev) {
  const status = ev.httpStatus || 0;
  if (status >= 200 && status < 300) return 1;
  if (status >= 400) return 0;
  return 0.5;
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
      const root = baseUrl.replace(/\/$/, '').replace(/\/v1\/[^/]+(\/.*)?$/, '');
      const endpoints = [root + '/v1/models', root + '/models'];

      let models = [];
      for (const endpoint of endpoints) {
        try {
          const resp = await fetch(endpoint, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }
          });
          if (resp.status === 401 || resp.status === 403) { showToast(zh ? 'API Key无效' : 'Invalid API Key'); break; }
          if (resp.status === 404) continue;
          if (!resp.ok) continue;
          const data = await resp.json();
          models = extractModels(data);
          if (models.length > 0) break;
        } catch (_) {}
      }

      if (models.length > 0) {
        const modelEl = document.getElementById('doctor-model');
        if (modelEl && !modelEl.value) modelEl.value = models[0];
        showToast(zh ? `已填入：${models[0]}` : `Filled: ${models[0]}`);
      } else {
        showToast(zh ? '无法自动识别，请手动填写模型 ID' : 'Cannot auto-detect; fill in Model ID manually');
      }
    } catch (_) {
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
      this._refreshProgress(1, 'running');
      this._refreshProgress(2, 'running');
      this._refreshProgress(3, 'running');

      // ── Phase 1: Reachability + Auth (parallel) ──
      const [reachResult, authResult] = await Promise.all([
        checkA_Reachability(normalizedUrl, apiKey, signal),
        checkB_Auth(normalizedUrl, apiKey, signal),
      ]);

      this._refreshProgress(0, reachResult.state, reachResult.summary);
      this._refreshProgress(1, authResult.state, authResult.summary);

      // ── Phase 2: Model list (needed for modelIdInfo) ──
      const modelListResult = await checkC_ModelList(normalizedUrl, apiKey, signal, model);
      this._refreshProgress(2, modelListResult.state, modelListResult.summary);

      // ── Determine finalTestModelId + modelSource ──
      const modelIdInfo = determineFinalTestModelId(model, modelListResult);
      this._modelIdInfo = modelIdInfo;

      // ── Phase 3: Auto-model detection (needs modelIdInfo for modelSource) ──
      const autoModelResult = await checkD_AutoModel(
        normalizedUrl, apiKey, modelIdInfo, authResult, signal, this._interfaceType
      );
      this._refreshProgress(3, autoModelResult.state, autoModelResult.summary);

      // ── Phase 4: Target model call (uses finalTestModelId) ──
      this._refreshProgress(4, 'running');
      const targetCallResult = await checkE_TargetCall(
        normalizedUrl, apiKey, modelIdInfo.finalTestModelId, this._interfaceType, signal
      );
      this._refreshProgress(4, targetCallResult.state, targetCallResult.summary);

      // ── Phase 5: Stability sampling (uses finalTestModelId) ──
      this._refreshProgress(5, 'running');
      const stabilityResult = await checkG_Stability(
        normalizedUrl, apiKey, modelIdInfo.finalTestModelId, this._interfaceType, signal, targetCallResult
      );
      this._refreshProgress(5, stabilityResult.state, stabilityResult.summary);

      // ── Phase 6: Usage audit ──
      this._refreshProgress(6, 'running');
      const usageResult = await checkH_UsageAudit(
        normalizedUrl, apiKey, modelIdInfo.finalTestModelId, this._interfaceType, signal, targetCallResult
      );
      this._refreshProgress(6, usageResult.state, usageResult.summary);

      // ── Phase 7: Client config ──
      const clientResult = checkI_ClientConfig(
        normalizedUrl, apiKey, modelIdInfo.finalTestModelId, modelListResult, targetCallResult
      );

      // ── Assemble result ──
      const checks = {
        reachability: reachResult,
        auth: authResult,
        modelList: modelListResult,
        autoModel: autoModelResult,
        targetCall: targetCallResult,
        stability: stabilityResult,
        usageAudit: usageResult,
        clientConfig: clientResult,
      };

      // Classify model visibility risk (soft penalty, NOT hard cap)
      const modelRisk = classifyModelRisk(modelIdInfo, checks);

      // Raw score
      let rawScore = calcRawScore(checks);

      // Apply soft penalty for model visibility risk (gentle deduction)
      if (modelRisk.softDeduction > 0) {
        rawScore = Math.max(0, rawScore - modelRisk.softDeduction);
      }

      // Apply hard caps
      const finalScore = applyCaps(rawScore, checks, modelIdInfo);
      const grade = getScoreGrade(finalScore);
      const judgment = getJudgment(finalScore, checks);
      const finding = getOneLineFinding(finalScore, checks);

      this._result = {
        score: finalScore,
        rawScore,
        grade,
        judgment,
        finding,
        checks,
        modelRisk,           // { riskType, softDeduction, reasonZh, reasonEn }
        modelIdInfo,         // pass through for suggestions
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
    this._modelIdInfo = null;
    if (this._controller) this._controller.abort();
  },

  showResult(result) {
    const lang = getDocLang();
    const resultNode = document.getElementById('result-card');
    if (!resultNode) return;
    const html = buildReportCardHTML(result, this._formData, lang, this._modelIdInfo, result.modelRisk);
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
      { zh: '1/8 API 服务器可达性', en: '1/8 API Server Reachability' },
      { zh: '2/8 鉴权 / Key 有效性', en: '2/8 Auth / Key Validity' },
      { zh: '3/8 模型列表获取', en: '3/8 Model List Retrieval' },
      { zh: '4/8 模型识别与选择', en: '4/8 Model Identification' },
      { zh: '5/8 目标模型调用质量', en: '5/8 Target Model Call' },
      { zh: '6/8 稳定性采样', en: '6/8 Stability Sampling' },
      { zh: '7/8 用量审计', en: '7/8 Usage Audit' },
      { zh: '8/8 客户端配置可用性', en: '8/8 Client Config' },
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
      { zh: '1/8 API 服务器可达性', en: '1/8 API Server Reachability' },
      { zh: '2/8 鉴权 / Key 有效性', en: '2/8 Auth / Key Validity' },
      { zh: '3/8 模型列表获取', en: '3/8 Model List Retrieval' },
      { zh: '4/8 模型识别与选择', en: '4/8 Model Identification' },
      { zh: '5/8 目标模型调用质量', en: '5/8 Target Model Call' },
      { zh: '6/8 稳定性采样', en: '6/8 Stability Sampling' },
      { zh: '7/8 用量审计', en: '7/8 Usage Audit' },
      { zh: '8/8 客户端配置可用性', en: '8/8 Client Config' },
    ];

    const statusColorMap = {
      excellent: { icon: '#16a34a', bar: '#16a34a', cls: '' },
      good:      { icon: '#3b82f6', bar: '#3b82f6', cls: '' },
      warning:   { icon: '#f59e0b', bar: '#f59e0b', cls: 'prog-row--warn' },
      failed:    { icon: '#dc2626', bar: '#dc2626', cls: 'prog-row--fail' },
      skipped:   { icon: '#94a3b8', bar: '#94a3b8', cls: 'prog-row--warn' },
      inconsistent: { icon: '#7c3aed', bar: '#7c3aed', cls: 'prog-row--warn' },
      pending:   { icon: '#e2e8f0', bar: '#e2e8f0', cls: '' },
      running:   { icon: '#2563eb', bar: '#2563eb', cls: 'prog-row--running' },
    };

    const defaultBarWidth = { excellent: '100%', good: '100%', warning: '65%', failed: '25%', skipped: '40%', inconsistent: '50%', pending: '0%', running: '30%' };
    const defaultDetail = { excellent: zh ? '优秀' : 'Excellent', good: zh ? '良好' : 'Good', warning: zh ? '注意' : 'Warning', failed: zh ? '失败' : 'Failed', skipped: zh ? '未验证' : 'Not verified', inconsistent: zh ? '矛盾' : 'Inconsistent', pending: '', running: zh ? '检测中...' : 'Checking...' };

    const cfg = statusColorMap[state] || statusColorMap.pending;
    const barW = defaultBarWidth[state] || '0%';
    const dtl = detail || defaultDetail[state] || '';

    for (let i = 0; i < 8; i++) {
      const row = document.getElementById('prog-row-' + i);
      const icon = document.getElementById('prog-icon-' + i);
      const bar = document.getElementById('prog-bar-' + i);
      const label = document.getElementById('prog-label-' + i);
      const detailEl = document.getElementById('prog-detail-' + i);
      if (!row) continue;

      if (i < index) {
        label.textContent = steps[i][zh ? 'zh' : 'en'];
        detailEl.textContent = '';
        icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
        bar.style.width = '100%';
        bar.style.background = '#16a34a';
        row.className = 'prog-row prog-row--done';
      } else if (i === index) {
        if (state === 'running') {
          label.textContent = steps[i][zh ? 'zh' : 'en'];
          detailEl.textContent = zh ? '检测中...' : 'Checking...';
          icon.innerHTML = `<div style="width:14px;height:14px;border:2px solid #2563eb;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div>`;
          bar.style.width = '30%';
          bar.style.background = '#2563eb';
          row.className = 'prog-row prog-row--running';
        } else {
          label.textContent = steps[i][zh ? 'zh' : 'en'];
          detailEl.textContent = dtl;
          const checkmark = ['excellent', 'good'].includes(state)
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${cfg.icon}" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
            : state === 'warning'
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${cfg.icon}" stroke-width="3"><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
            : state === 'inconsistent'
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${cfg.icon}" stroke-width="3"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${cfg.icon}" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
          icon.innerHTML = checkmark;
          bar.style.width = barW;
          bar.style.background = cfg.bar;
          row.className = 'prog-row prog-row--done ' + (cfg.cls || '');
        }
      } else {
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

    /* Report card */
    .rc-section { background: #fff; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; }
    .rc-section-title { font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
    .rc-check-block { }
    .rc-check-label { font-size: 12px; font-weight: 600; color: #374151; }
    .rc-check-score { font-size: 12px; font-weight: 700; color: #374151; margin-left: 4px; }
    .rc-check-summary { font-size: 11px; }
    .rc-sub-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 11px; color: #64748b; }
    .rc-label { flex: 1; color: #374151; font-size: 11px; }
    .rc-score { font-weight: 700; color: #374151; font-size: 11px; min-width: 40px; }
    .rc-detail { color: #94a3b8; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; }
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

/* ═══════════════════════════════════════════════════════
   Mock Test Cases (for local testing)
   Uncomment and run in browser console, or include in test page.
   ═══════════════════════════════════════════════════════ */
window.MockCases = {

  // Case A: Base URL completely unreachable
  // Expected: 0-25, Failed
  caseA() {
    const checks = {
      reachability: mkCheck({ id: 'reachability', label: {zh:'API服务器可达性',en:'API Server Reachability'}, maxScore: 12, score: 0, status: 'failed', summary: '网络无法连接', deductions: ['网络无法连接（DNS失败/超时）'], evidence: { netError: 'Failed to fetch' } }),
      auth: mkCheck({ id: 'auth', label: {zh:'鉴权',en:'Auth'}, maxScore: 14, score: 0, status: 'skipped', summary: '前置失败', evidence: {} }),
      modelList: mkCheck({ id: 'modelList', label: {zh:'模型列表',en:'Model List'}, maxScore: 12, score: 0, status: 'skipped', summary: '前置失败', evidence: {} }),
      autoModel: mkCheck({ id: 'autoModel', label: {zh:'模型识别',en:'Auto Model'}, maxScore: 10, score: 0, status: 'skipped', summary: '前置失败', evidence: {} }),
      targetCall: mkCheck({ id: 'targetCall', label: {zh:'目标调用',en:'Target Call'}, maxScore: 22, score: 0, status: 'skipped', summary: '前置失败', evidence: {} }),
      stability: mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 18, score: 0, status: 'skipped', summary: '前置失败', evidence: { samples: [] } }),
      usageAudit: mkCheck({ id: 'usageAudit', label: {zh:'用量审计',en:'Usage Audit'}, maxScore: 6, score: 0, status: 'skipped', summary: '前置失败', evidence: {} }),
      clientConfig: mkCheck({ id: 'clientConfig', label: {zh:'客户端配置',en:'Client Config'}, maxScore: 6, score: 0, status: 'skipped', summary: '前置失败', evidence: {} }),
    };
    const raw = 0;
    const capped = applyCaps(raw, checks, { userModel: 'gpt-4', autoModel: '', allModels: [] });
    return { raw, capped, grade: getGrade(capped), desc: 'Case A: Base URL unreachable → 预期 0-25, Failed，实际 capped=' + capped };
  },

  // Case B: Base URL reachable, Key returns 401
  // Expected: 25-40, Failed or Poor
  // Real auth scoring: A2=2 (format), A4=3 (not 403), A5=1 (error readable)
  // A1=0 (header not recognized), A3=0 (got 401), A6=0.5 (inconsistent) = 6.5/14
  caseB() {
    const checks = {
      reachability: mkCheck({ id: 'reachability', label: {zh:'API服务器可达性',en:'API Server Reachability'}, maxScore: 12, score: 11, status: 'good', summary: '可达', evidence: { latency: 200, modelEndpointOk: true } }),
      auth: mkCheck({ id: 'auth', label: {zh:'鉴权',en:'Auth'}, maxScore: 14, score: 6, status: 'failed', summary: '401 Unauthorized', deductions: ['收到 401 Unauthorized'], evidence: { modelsStatus: 401, chatStatus: 401 } }),
      modelList: mkCheck({ id: 'modelList', label: {zh:'模型列表',en:'Model List'}, maxScore: 12, score: 0, status: 'skipped', summary: '前置失败', evidence: {} }),
      autoModel: mkCheck({ id: 'autoModel', label: {zh:'模型识别',en:'Auto Model'}, maxScore: 10, score: 0, status: 'skipped', summary: '前置失败', evidence: {} }),
      targetCall: mkCheck({ id: 'targetCall', label: {zh:'目标调用',en:'Target Call'}, maxScore: 22, score: 0, status: 'skipped', summary: '前置失败', evidence: {} }),
      stability: mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 18, score: 0, status: 'skipped', summary: '前置失败', evidence: { samples: [] } }),
      usageAudit: mkCheck({ id: 'usageAudit', label: {zh:'用量审计',en:'Usage Audit'}, maxScore: 6, score: 0, status: 'skipped', summary: '前置失败', evidence: {} }),
      clientConfig: mkCheck({ id: 'clientConfig', label: {zh:'客户端配置',en:'Client Config'}, maxScore: 6, score: 5, status: 'good', summary: '配置基本完整', evidence: { baseUrlOrigin: 'https://api.example.com', keyMasked: 'sk-****', modelId: 'gpt-4', clineReady: true, continueReady: true } }),
    };
    // Max possible: reachability(12) + auth(6) + clientConfig(6) = 24 → capped at 40
    const raw = 22;
    const capped = applyCaps(raw, checks, { userModel: 'gpt-4', autoModel: '', allModels: [] });
    return { raw, capped, grade: getGrade(capped), desc: 'Case B: 401 → 预期 25-40，实际 capped=' + capped };
  },

  // Case C: Key normal, /models success, user model not in list, target call fails
  // Expected: 45-60, Poor
  caseC() {
    const checks = {
      reachability: mkCheck({ id: 'reachability', label: {zh:'API服务器可达性',en:'API Server Reachability'}, maxScore: 12, score: 11, status: 'good', summary: '可达', evidence: { latency: 300, modelEndpointOk: true } }),
      auth: mkCheck({ id: 'auth', label: {zh:'鉴权',en:'Auth'}, maxScore: 14, score: 13, status: 'good', summary: '鉴权通过', evidence: { modelsStatus: 200, chatStatus: 200 } }),
      modelList: mkCheck({ id: 'modelList', label: {zh:'模型列表',en:'Model List'}, maxScore: 12, score: 9, status: 'good', summary: '3 models', evidence: { httpStatus: 200, models: ['gpt-3.5', 'gpt-4', 'claude'], modelCount: 3, userModel: 'gpt-4o' } }),
      autoModel: mkCheck({ id: 'autoModel', label: {zh:'模型识别',en:'Auto Model'}, maxScore: 10, score: 6, status: 'warning', summary: '使用gpt-3.5', evidence: { candidateModel: 'gpt-3.5', callableStatus: 200 } }),
      targetCall: mkCheck({ id: 'targetCall', label: {zh:'目标调用',en:'Target Call'}, maxScore: 22, score: 8, status: 'failed', summary: '调用质量差', deductions: ['得分过低（< 11/22）'], evidence: { httpStatus: 400, responseParsed: true, output: { status: 'absent' }, latencyMs: 500, networkError: false } }),
      stability: mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 18, score: 3, status: 'skipped', summary: '目标调用失败', evidence: { samples: [], avgLatency: 0 }, deductions: ['目标模型调用失败，稳定性采样受限'] }),
      usageAudit: mkCheck({ id: 'usageAudit', label: {zh:'用量审计',en:'Usage Audit'}, maxScore: 6, score: 0, status: 'skipped', summary: '前置失败', evidence: {} }),
      clientConfig: mkCheck({ id: 'clientConfig', label: {zh:'客户端配置',en:'Client Config'}, maxScore: 6, score: 5, status: 'good', summary: '配置基本完整', evidence: { baseUrlOrigin: 'https://api.example.com', keyMasked: 'sk-****', modelId: 'gpt-3.5', clineReady: true, continueReady: true } }),
    };
    const raw = 55;
    const capped = applyCaps(raw, checks, { userModel: 'gpt-4o', autoModel: 'gpt-3.5', allModels: ['gpt-3.5', 'gpt-4', 'claude'] });
    return { raw, capped, grade: getGrade(capped), desc: 'Case C: 模型不存在，调用失败 → 预期 45-60，实际 capped=' + capped };
  },

  // Case D: Key normal, /models success, user model not in list but target call succeeds
  // Expected: 78-88, Fair
  caseD() {
    const checks = {
      reachability: mkCheck({ id: 'reachability', label: {zh:'API服务器可达性',en:'API Server Reachability'}, maxScore: 12, score: 11, status: 'good', summary: '可达', evidence: { latency: 300, modelEndpointOk: true } }),
      auth: mkCheck({ id: 'auth', label: {zh:'鉴权',en:'Auth'}, maxScore: 14, score: 13, status: 'good', summary: '鉴权通过', evidence: { modelsStatus: 200, chatStatus: 200 } }),
      modelList: mkCheck({ id: 'modelList', label: {zh:'模型列表',en:'Model List'}, maxScore: 12, score: 8, status: 'warning', summary: '2 models', evidence: { httpStatus: 200, models: ['gpt-3.5', 'gpt-4'], modelCount: 2, userModel: 'gpt-4o' } }),
      autoModel: mkCheck({ id: 'autoModel', label: {zh:'模型识别',en:'Auto Model'}, maxScore: 10, score: 7, status: 'good', summary: '使用gpt-3.5', evidence: { candidateModel: 'gpt-3.5', callableStatus: 200, hasOutput: true } }),
      targetCall: mkCheck({ id: 'targetCall', label: {zh:'目标调用',en:'Target Call'}, maxScore: 22, score: 18, status: 'good', summary: '调用质量良好', evidence: { httpStatus: 200, responseParsed: true, formatChoices: true, formatMessage: true, output: { status: 'present', text: '好的' }, finishReason: 'stop', usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }, latencyMs: 800 } }),
      stability: mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 18, score: 14, status: 'warning', summary: '2/3 success', evidence: { avgLatency: 1200, samples: [{ok:true,status:200,latency:800,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:1200,hasContent:true,responseText:'OK'},{ok:false,status:429,latency:200,hasContent:false,errMsg:'rate limit',responseText:''}] }, deductions: ['稳定性采样 2/3 成功'] }),
      usageAudit: mkCheck({ id: 'usageAudit', label: {zh:'用量审计',en:'Usage Audit'}, maxScore: 6, score: 5.5, status: 'excellent', summary: '明细完整', evidence: { usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } } }),
      clientConfig: mkCheck({ id: 'clientConfig', label: {zh:'客户端配置',en:'Client Config'}, maxScore: 6, score: 6, status: 'excellent', summary: '配置完整可导出', evidence: { baseUrlOrigin: 'https://api.example.com', keyMasked: 'sk-****', modelId: 'gpt-3.5', clineReady: true, continueReady: true, httpStatus: 200 } }),
    };
    const raw = 82.5;
    const capped = applyCaps(raw, checks, { userModel: 'gpt-4o', autoModel: 'gpt-3.5', allModels: ['gpt-3.5', 'gpt-4'] });
    return { raw, capped, grade: getGrade(capped), desc: 'Case D: 用户模型不在列表但调用成功 → 预期 78-88，实际 capped=' + capped };
  },

  // Case E: Target model call succeeds, but no usage
  // Expected: 86-94, Fair or Good, cannot be Excellent
  caseE() {
    const checks = {
      reachability: mkCheck({ id: 'reachability', label: {zh:'API服务器可达性',en:'API Server Reachability'}, maxScore: 12, score: 12, status: 'excellent', summary: '完全达标', evidence: { latency: 150, modelEndpointOk: true } }),
      auth: mkCheck({ id: 'auth', label: {zh:'鉴权',en:'Auth'}, maxScore: 14, score: 14, status: 'excellent', summary: '完全达标', evidence: { modelsStatus: 200, chatStatus: 200 } }),
      modelList: mkCheck({ id: 'modelList', label: {zh:'模型列表',en:'Model List'}, maxScore: 12, score: 11, status: 'excellent', summary: '5 models', evidence: { httpStatus: 200, models: ['gpt-4', 'gpt-3.5', 'claude-3', 'gemini', 'llama'], modelCount: 5 } }),
      autoModel: mkCheck({ id: 'autoModel', label: {zh:'模型识别',en:'Auto Model'}, maxScore: 10, score: 10, status: 'excellent', summary: '使用gpt-4', evidence: { candidateModel: 'gpt-4', callableStatus: 200, hasOutput: true } }),
      targetCall: mkCheck({ id: 'targetCall', label: {zh:'目标调用',en:'Target Call'}, maxScore: 22, score: 21, status: 'excellent', summary: '调用质量优秀', evidence: { httpStatus: 200, responseParsed: true, formatChoices: true, formatMessage: true, output: { status: 'present', text: '好的' }, finishReason: 'stop', usage: {}, latencyMs: 500 } }),
      stability: mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 18, score: 18, status: 'excellent', summary: '3/3 success', evidence: { avgLatency: 600, latencyJitter: 300, samples: [{ok:true,status:200,latency:500,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:600,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:700,hasContent:true,responseText:'OK'}] } }),
      usageAudit: mkCheck({ id: 'usageAudit', label: {zh:'用量审计',en:'Usage Audit'}, maxScore: 6, score: 1.5, status: 'warning', summary: '明细不完整', evidence: { usage: {} }, deductions: ['usage 字段不存在'] }),
      clientConfig: mkCheck({ id: 'clientConfig', label: {zh:'客户端配置',en:'Client Config'}, maxScore: 6, score: 6, status: 'excellent', summary: '配置完整可导出', evidence: { baseUrlOrigin: 'https://api.example.com', keyMasked: 'sk-****', modelId: 'gpt-4', clineReady: true, continueReady: true, httpStatus: 200 } }),
    };
    const raw = 92.5;
    const capped = applyCaps(raw, checks, { userModel: 'gpt-4', autoModel: 'gpt-4', allModels: ['gpt-4', 'gpt-3.5', 'claude-3', 'gemini', 'llama'] });
    return { raw, capped, grade: getGrade(capped), desc: 'Case E: 调用成功但无usage → 预期 86-94，实际 capped=' + capped };
  },

  // Case F: Target model call succeeds, but avg latency 9000ms
  // Expected: 82-90, Fair or Good, cannot be Excellent
  caseF() {
    const checks = {
      reachability: mkCheck({ id: 'reachability', label: {zh:'API服务器可达性',en:'API Server Reachability'}, maxScore: 12, score: 12, status: 'excellent', summary: '完全达标', evidence: { latency: 300, modelEndpointOk: true } }),
      auth: mkCheck({ id: 'auth', label: {zh:'鉴权',en:'Auth'}, maxScore: 14, score: 14, status: 'excellent', summary: '完全达标', evidence: { modelsStatus: 200, chatStatus: 200 } }),
      modelList: mkCheck({ id: 'modelList', label: {zh:'模型列表',en:'Model List'}, maxScore: 12, score: 12, status: 'excellent', summary: '5 models', evidence: { httpStatus: 200, models: ['gpt-4'], modelCount: 5 } }),
      autoModel: mkCheck({ id: 'autoModel', label: {zh:'模型识别',en:'Auto Model'}, maxScore: 10, score: 10, status: 'excellent', summary: '使用gpt-4', evidence: { candidateModel: 'gpt-4', callableStatus: 200, hasOutput: true } }),
      targetCall: mkCheck({ id: 'targetCall', label: {zh:'目标调用',en:'Target Call'}, maxScore: 22, score: 20, status: 'good', summary: '调用质量良好', evidence: { httpStatus: 200, responseParsed: true, formatChoices: true, formatMessage: true, output: { status: 'present', text: 'Paris' }, finishReason: 'stop', usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }, latencyMs: 9000 } }),
      stability: mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 18, score: 12, status: 'warning', summary: '3/3 success, high latency', evidence: { avgLatency: 9200, latencyJitter: 2000, samples: [{ok:true,status:200,latency:8000,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:9000,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:10000,hasContent:true,responseText:'OK'}] }, deductions: ['平均延迟较高：9200ms'] }),
      usageAudit: mkCheck({ id: 'usageAudit', label: {zh:'用量审计',en:'Usage Audit'}, maxScore: 6, score: 6, status: 'excellent', summary: '明细完整', evidence: { usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } } }),
      clientConfig: mkCheck({ id: 'clientConfig', label: {zh:'客户端配置',en:'Client Config'}, maxScore: 6, score: 6, status: 'excellent', summary: '配置完整可导出', evidence: { baseUrlOrigin: 'https://api.example.com', keyMasked: 'sk-****', modelId: 'gpt-4', clineReady: true, continueReady: true, httpStatus: 200 } }),
    };
    const raw = 92;
    const capped = applyCaps(raw, checks, { userModel: 'gpt-4', autoModel: 'gpt-4', allModels: ['gpt-4', 'gpt-3.5'] });
    return { raw, capped, grade: getGrade(capped), desc: 'Case F: 延迟9000ms → 预期 82-90，实际 capped=' + capped };
  },

  // Case G: Target model call succeeds, stability 2/3
  // Expected: 78-88, Fair
  caseG() {
    const checks = {
      reachability: mkCheck({ id: 'reachability', label: {zh:'API服务器可达性',en:'API Server Reachability'}, maxScore: 12, score: 12, status: 'excellent', summary: '完全达标', evidence: { latency: 200, modelEndpointOk: true } }),
      auth: mkCheck({ id: 'auth', label: {zh:'鉴权',en:'Auth'}, maxScore: 14, score: 14, status: 'excellent', summary: '完全达标', evidence: { modelsStatus: 200, chatStatus: 200 } }),
      modelList: mkCheck({ id: 'modelList', label: {zh:'模型列表',en:'Model List'}, maxScore: 12, score: 12, status: 'excellent', summary: '5 models', evidence: { httpStatus: 200, models: ['gpt-4'], modelCount: 5 } }),
      autoModel: mkCheck({ id: 'autoModel', label: {zh:'模型识别',en:'Auto Model'}, maxScore: 10, score: 10, status: 'excellent', summary: '使用gpt-4', evidence: { candidateModel: 'gpt-4', callableStatus: 200, hasOutput: true } }),
      targetCall: mkCheck({ id: 'targetCall', label: {zh:'目标调用',en:'Target Call'}, maxScore: 22, score: 22, status: 'excellent', summary: '调用质量优秀', evidence: { httpStatus: 200, responseParsed: true, formatChoices: true, formatMessage: true, output: { status: 'present', text: 'Paris' }, finishReason: 'stop', usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }, latencyMs: 500 } }),
      stability: mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 18, score: 12, status: 'warning', summary: '2/3 success', evidence: { avgLatency: 800, latencyJitter: 400, samples: [{ok:true,status:200,latency:600,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:800,hasContent:true,responseText:'OK'},{ok:false,status:0,latency:3000,hasContent:false,errMsg:'timeout',responseText:''}] }, deductions: ['稳定性采样 2/3 成功'] }),
      usageAudit: mkCheck({ id: 'usageAudit', label: {zh:'用量审计',en:'Usage Audit'}, maxScore: 6, score: 6, status: 'excellent', summary: '明细完整', evidence: { usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } } }),
      clientConfig: mkCheck({ id: 'clientConfig', label: {zh:'客户端配置',en:'Client Config'}, maxScore: 6, score: 6, status: 'excellent', summary: '配置完整可导出', evidence: { baseUrlOrigin: 'https://api.example.com', keyMasked: 'sk-****', modelId: 'gpt-4', clineReady: true, continueReady: true, httpStatus: 200 } }),
    };
    const raw = 94;
    const capped = applyCaps(raw, checks, { userModel: 'gpt-4', autoModel: 'gpt-4', allModels: ['gpt-4', 'gpt-3.5'] });
    return { raw, capped, grade: getGrade(capped), desc: 'Case G: 稳定性2/3 → 预期 78-88，实际 capped=' + capped };
  },

  // Case H: /models unavailable, but manual model call succeeds, stability 3/3
  // Expected: 75-82, Fair
  caseH() {
    const checks = {
      reachability: mkCheck({ id: 'reachability', label: {zh:'API服务器可达性',en:'API Server Reachability'}, maxScore: 12, score: 11, status: 'good', summary: '可达', evidence: { latency: 400, modelEndpointOk: false } }),
      auth: mkCheck({ id: 'auth', label: {zh:'鉴权',en:'Auth'}, maxScore: 14, score: 14, status: 'excellent', summary: '鉴权通过', evidence: { modelsStatus: 200, chatStatus: 200 } }),
      modelList: mkCheck({ id: 'modelList', label: {zh:'模型列表',en:'Model List'}, maxScore: 12, score: 2, status: 'failed', summary: '模型列表不可用', evidence: { httpError: 404 }, deductions: ['/models 请求失败：HTTP 404'] }),
      autoModel: mkCheck({ id: 'autoModel', label: {zh:'模型识别',en:'Auto Model'}, maxScore: 10, score: 8, status: 'good', summary: '使用用户填写模型', evidence: { candidateModel: 'gpt-4', callableStatus: 200, hasOutput: true } }),
      targetCall: mkCheck({ id: 'targetCall', label: {zh:'目标调用',en:'Target Call'}, maxScore: 22, score: 21, status: 'excellent', summary: '调用质量优秀', evidence: { httpStatus: 200, responseParsed: true, formatChoices: true, formatMessage: true, output: { status: 'present', text: '好的' }, finishReason: 'stop', usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }, latencyMs: 700 } }),
      stability: mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 18, score: 18, status: 'excellent', summary: '3/3 success', evidence: { avgLatency: 750, latencyJitter: 200, samples: [{ok:true,status:200,latency:600,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:800,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:850,hasContent:true,responseText:'OK'}] } }),
      usageAudit: mkCheck({ id: 'usageAudit', label: {zh:'用量审计',en:'Usage Audit'}, maxScore: 6, score: 6, status: 'excellent', summary: '明细完整', evidence: { usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } } }),
      clientConfig: mkCheck({ id: 'clientConfig', label: {zh:'客户端配置',en:'Client Config'}, maxScore: 6, score: 6, status: 'excellent', summary: '配置完整可导出', evidence: { baseUrlOrigin: 'https://api.example.com', keyMasked: 'sk-****', modelId: 'gpt-4', clineReady: true, continueReady: true, httpStatus: 200 } }),
    };
    const raw = 88;
    const capped = applyCaps(raw, checks, { userModel: 'gpt-4', autoModel: 'gpt-4', allModels: [] });
    return { raw, capped, grade: getGrade(capped), desc: 'Case H: /models不可用但手动模型可用 → 预期 75-82，实际 capped=' + capped };
  },

  // Case I: Returns HTML login page / Cloudflare challenge
  // Expected: 40-60, Poor
  caseI() {
    const checks = {
      reachability: mkCheck({ id: 'reachability', label: {zh:'API服务器可达性',en:'API Server Reachability'}, maxScore: 12, score: 4, status: 'warning', summary: '12项中得4分，部分项目未达标', evidence: { latency: 500, modelEndpointOk: false }, deductions: ['返回 HTML 登录页 / Cloudflare / WAF'] }),
      auth: mkCheck({ id: 'auth', label: {zh:'鉴权',en:'Auth'}, maxScore: 14, score: 14, status: 'excellent', summary: '鉴权通过', evidence: { modelsStatus: 200, chatStatus: 200 } }),
      modelList: mkCheck({ id: 'modelList', label: {zh:'模型列表',en:'Model List'}, maxScore: 12, score: 0, status: 'failed', summary: '模型列表不可用', evidence: {}, deductions: ['/models 请求失败'] }),
      autoModel: mkCheck({ id: 'autoModel', label: {zh:'模型识别',en:'Auto Model'}, maxScore: 10, score: 8, status: 'good', summary: '使用用户填写模型', evidence: { candidateModel: 'gpt-4', callableStatus: 200, hasOutput: true } }),
      targetCall: mkCheck({ id: 'targetCall', label: {zh:'目标调用',en:'Target Call'}, maxScore: 22, score: 20, status: 'good', summary: '调用质量良好', evidence: { httpStatus: 200, responseParsed: true, formatChoices: true, formatMessage: true, output: { status: 'present', text: '好的' }, finishReason: 'stop', usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }, latencyMs: 600 } }),
      stability: mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 18, score: 18, status: 'excellent', summary: '3/3 success', evidence: { avgLatency: 650, latencyJitter: 200, samples: [{ok:true,status:200,latency:550,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:700,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:700,hasContent:true,responseText:'OK'}] } }),
      usageAudit: mkCheck({ id: 'usageAudit', label: {zh:'用量审计',en:'Usage Audit'}, maxScore: 6, score: 6, status: 'excellent', summary: '明细完整', evidence: { usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } } }),
      clientConfig: mkCheck({ id: 'clientConfig', label: {zh:'客户端配置',en:'Client Config'}, maxScore: 6, score: 6, status: 'excellent', summary: '配置完整可导出', evidence: { baseUrlOrigin: 'https://api.example.com', keyMasked: 'sk-****', modelId: 'gpt-4', clineReady: true, continueReady: true, httpStatus: 200 } }),
    };
    const raw = 76;
    const capped = applyCaps(raw, checks, { userModel: 'gpt-4', autoModel: 'gpt-4', allModels: [] });
    return { raw, capped, grade: getGrade(capped), desc: 'Case I: HTML登录页/WAF → 预期 40-60，实际 capped=' + capped };
  },

  // Case J: All normal, stability 3/3, usage complete, low latency
  // Expected: 94-98, Excellent
  caseJ() {
    const checks = {
      reachability: mkCheck({ id: 'reachability', label: {zh:'API服务器可达性',en:'API Server Reachability'}, maxScore: 12, score: 12, status: 'excellent', summary: '完全达标', evidence: { latency: 80, modelEndpointOk: true } }),
      auth: mkCheck({ id: 'auth', label: {zh:'鉴权',en:'Auth'}, maxScore: 14, score: 14, status: 'excellent', summary: '完全达标', evidence: { modelsStatus: 200, chatStatus: 200 } }),
      modelList: mkCheck({ id: 'modelList', label: {zh:'模型列表',en:'Model List'}, maxScore: 12, score: 12, status: 'excellent', summary: '8 models', evidence: { httpStatus: 200, models: ['gpt-4', 'gpt-3.5', 'claude-3', 'gemini-pro', 'gemini-flash', 'llama-3', 'mistral', 'command'], modelCount: 8 } }),
      autoModel: mkCheck({ id: 'autoModel', label: {zh:'模型识别',en:'Auto Model'}, maxScore: 10, score: 10, status: 'excellent', summary: '使用gpt-4', evidence: { candidateModel: 'gpt-4', callableStatus: 200, hasOutput: true } }),
      targetCall: mkCheck({ id: 'targetCall', label: {zh:'目标调用',en:'Target Call'}, maxScore: 22, score: 22, status: 'excellent', summary: '调用质量优秀', evidence: { httpStatus: 200, responseParsed: true, formatChoices: true, formatMessage: true, output: { status: 'present', text: '好的' }, finishReason: 'stop', usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }, latencyMs: 350 } }),
      stability: mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 18, score: 18, status: 'excellent', summary: '3/3 success', evidence: { avgLatency: 400, latencyJitter: 150, samples: [{ok:true,status:200,latency:350,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:400,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:450,hasContent:true,responseText:'OK'}] } }),
      usageAudit: mkCheck({ id: 'usageAudit', label: {zh:'用量审计',en:'Usage Audit'}, maxScore: 6, score: 6, status: 'excellent', summary: '明细完整', evidence: { usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } } }),
      clientConfig: mkCheck({ id: 'clientConfig', label: {zh:'客户端配置',en:'Client Config'}, maxScore: 6, score: 6, status: 'excellent', summary: '配置完整可导出', evidence: { baseUrlOrigin: 'https://api.example.com', keyMasked: 'sk-****', modelId: 'gpt-4', clineReady: true, continueReady: true, httpStatus: 200 } }),
    };
    const raw = 100;
    const capped = applyCaps(raw, checks, { userModel: 'gpt-4', autoModel: 'gpt-4', allModels: ['gpt-4', 'gpt-3.5', 'claude-3', 'gemini-pro', 'gemini-flash', 'llama-3', 'mistral', 'command'] });
    return { raw, capped, grade: getGrade(capped), desc: 'Case J: 全部正常 → 预期 94-98，实际 capped=' + capped };
  },
};

/* Run mock cases: copy-paste into browser console
   Object.entries(MockCases).forEach(([k, fn]) => console.log(fn()));
*/
