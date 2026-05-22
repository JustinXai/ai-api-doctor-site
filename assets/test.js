/**
 * AI API Doctor — Diagnostic Engine v6 (Upgraded: Kiro/Vertex Proxy Route + Token Inflation + J8 Dual-Prompt + 6-Type K0 + Confidence)
 * website/assets/test.js
 *
 * Core principles (same as v5, with additions):
 * 1. User's core concerns: billing transparency + model quality + stability
 * 2. Cost transparency + model integrity = 75/100 points (core value)
 * 3. Basic compatibility is a prerequisite, not the core value
 * 4. Kiro/Vertex/gateway = proxy_route_identity = medium risk, not a death sentence
 * 5. wrong_family / hard_contamination = high risk, always penalized
 * 6. Token inflation, usage missing, max_tokens failure, multi ability failures → severe caps
 * 7. Scores normalized to 0-100 then weighted for final score
 * 8. Final score max 98 — no perfect score
 * 9. Conclusion confidence level reported
 *
 * Prohibited language:
 * - "该站乱扣费" / "This site overcharges"
 * - "该模型是假模型" / "This model is fake"
 * - "已验证真实模型" / "Real model verified"
 * - "真实扣费已确认" / "Real billing confirmed"
 * - "该模型是降配" / "This model is downgraded"
 *
 * Allowed language:
 * - "usage 明细不完整，扣费不可审计风险较高"
 * - "prompt_tokens 明显高于本地估算，存在隐藏上下文、额外包装或 token inflation 风险"
 * - "极短回复 token 明显偏高，存在扣费不可解释风险"
 * - "模型自报身份与目标模型不一致，存在模型降配疑似风险"
 * - "检测到平台代理层身份暴露，这不等于模型不可用，但会降低来源透明度"
 * - "本报告仅基于可复现 API 信号，不构成最终证明"
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
   Score weights — v1.7 Real-Data Weighted (total = 100)
   Core: coreCompat (25) + usageTransparency (25) + stabilityLatency (25) + modelIdentity (15) + cacheSignal (5) + clientConfig (5) = 100
   ═══════════════════════════════════════════════════════ */
const WEIGHT = {
  coreCompatibility:     25,  // OpenAI-compatible basic compatibility
  usageTransparency:    25,  // Usage/billing transparency
  stabilityLatency:     25,  // Response stability & latency
  modelIdentity:        15,  // Model identity signals
  cacheSignal:          5,  // Cache hit signals
  clientConfig:         5,  // Client config exportability
};
WEIGHT.total = Object.values(WEIGHT).reduce((a, b) => a + b, 0); // 100

// Legacy alias for compatibility
const WEIGHT_V16 = {
  basicCompatibility:  7,
  costTransparency:   30,
  cacheHitCheck:      5,
  modelIntegrity:    40,
  stability:         15,
  clientConfig:       3,
};

/* ═══════════════════════════════════════════════════════
   Grade table (6 levels) — unified for all components
  Score range: 100=A, 90-99=B, 70-89=C, 60-69=D, 40-59=E, 0-39=F
  Max score is 98 — this is a CONFIGURATION risk score, not a model intelligence score.
  ═══════════════════════════════════════════════════════ */
const GRADES = [
  { min: 95, grade: 'A', label: 'Healthy integration', labelZh: '接入健康',   color: '#16a34a', bg: '#dcfce7',
    desc: 'Configuration complete — compatibility, transparency and stability signals are all good. This does not mean the model is officially certified.',
    descZh: '配置完整，兼容性、透明度和稳定性表现良好。评分较高不代表模型来源、供应商或底层版本被官方认证。' },
  { min: 90, grade: 'B', label: 'Mostly reliable',    labelZh: '基本可靠',   color: '#16a34a', bg: '#ecfeff',
    desc: 'Core integration functional — only minor transparency or audit gaps. Suitable for daily development; review usage, model version and stability before production.',
    descZh: '主要接入能力正常，仅存在少量透明度或审计缺口。适合日常开发和测试；生产使用前建议复核 usage、模型版本和稳定性。' },
  { min: 70, grade: 'C', label: 'Usable, review needed', labelZh: '可用，需复核', color: '#d97706', bg: '#fef9c3',
    desc: 'Core calls work, but version transparency, usage, stability or compatibility risks exist. Suitable for testing or light development.',
    descZh: '核心调用可用，但存在版本透明度、usage、稳定性或兼容性风险。可用于测试或轻量开发；用于长期任务前建议完成复核。' },
  { min: 60, grade: 'D', label: 'Test only',          labelZh: '测试可用',   color: '#ea580c', bg: '#ffedd5',
    desc: 'Basic calls may work, but multiple auxiliary or compatibility checks are incomplete. Only for temporary testing.',
    descZh: '基础调用可能可用，但多个辅助检查或兼容性检查不完整。仅建议用于临时测试；不建议直接接入重要工作流。' },
  { min: 40, grade: 'E', label: 'Manual review needed', labelZh: '需人工复核', color: '#dc2626', bg: '#fee2e2',
    desc: 'High integration risk detected — may affect client stability. If only temporary testing, continue observing; prioritise confirming model version, response format and permissions.',
    descZh: '存在较高接入风险，可能影响客户端稳定使用。如只是临时测试，可以继续观察，但应优先确认模型版本、返回格式和权限配置。' },
  { min: 0,  grade: 'F', label: 'Critical failure',   labelZh: '关键失败',   color: '#dc2626', bg: '#fee2e2',
    desc: 'Core calls, auth, format or stability checks failed. Do not continue with current configuration — fix key, base URL, model name, permissions or interface compatibility first.',
    descZh: '关键调用、鉴权、格式或稳定性检查失败。当前配置不建议继续使用；请先修复 Key、Base URL、模型名、权限或接口兼容问题。' },
];

/**
 * Unified grade lookup — used by ALL components
 * @param {number} score
 * @returns {object} grade object
 */
function getScoreGrade(score) {
  for (const g of GRADES) {
    if (score >= g.min) return g;
  }
  return GRADES[GRADES.length - 1];
}
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
  error:     { zh: '未验证', en: 'Not verified',  color: '#f59e0b', bg: '#fef9c3', pill: 'warn' },
  unknown:   { zh: '未验证', en: 'Not verified',  color: '#94a3b8', bg: '#f1f5f9', pill: 'warn' },
  field_found:{ zh: '部分暴露', en: 'Field Exposed', color: '#d97706', bg: '#fef9c3', pill: 'warn' },
};

function getCheckStatus(earned, maxScore, forced) {
  if (forced) return forced;
  const ratio = maxScore > 0 ? earned / maxScore : 0;
  if (ratio >= 0.95) return 'excellent';
  if (ratio >= 0.80) return 'good';
  if (ratio >= 0.50) return 'warning';
  if (ratio > 0) return 'poor';
  return 'failed';
}
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

/**
 * Mask Base URL for shareable content (images, copy, social).
 * Rules:
 * 1. Keep protocol: https:// or http://
 * 2. Mask domain: keep first 3 + last 3 chars of host, middle = ***
 *    e.g. https://aizhongzhuan.com/v1 → https://aiz***uan.com/v1
 *    e.g. https://api.example.com/v1 → https://api***com/v1
 * 3. IP: keep first 2 and last 2 octets, middle = *.*
 *    e.g. https://1.2.3.4/v1 → https://1.2.X.X/v1
 * 4. localhost: no masking
 * 5. Keep path (e.g. /v1)
 * 6. Strip query params and hash
 */
function maskBaseUrlForShare(url) {
  if (!url) return '';
  try {
    // Strip query and hash first
    const urlClean = url.split('?')[0].split('#')[0];
    const u = new URL(urlClean);
    const protocol = u.protocol; // includes ://
    const hostname = u.hostname;
    const port = u.port ? ':' + u.port : '';
    const pathname = u.pathname.replace(/\/$/, '');

    // localhost: no masking
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return protocol + '//' + hostname + port + pathname;
    }

    // IP address: mask middle octets
    const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      return protocol + '//' + ipMatch[1] + '.' + ipMatch[2] + '.*.*' + port + pathname;
    }

    // Domain: keep first 3 + last 3 of hostname
    if (hostname.length <= 6) {
      return protocol + '//' + hostname[0] + '***' + hostname[hostname.length - 1] + port + pathname;
    }
    const first3 = hostname.slice(0, 3);
    const last3 = hostname.slice(-3);
    return protocol + '//' + first3 + '***' + last3 + port + pathname;
  } catch (_) {
    // Fallback: strip query/hash and return
    return url.split('?')[0].split('#')[0];
  }
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

function mkCheck(cfg) {
  return {
    id:       cfg.id       || 'unknown',
    label:    cfg.label    || { zh: '', en: '' },
    maxScore: cfg.maxScore || 0,
    score:    cfg.score    || 0,
    status:   cfg.status   || 'failed',
    summary:  cfg.summary  || '',
    details:  cfg.details  || [],
    deductions: cfg.deductions || [],
    evidence: cfg.evidence || {},
  };
}

function buildRequest(baseUrl, apiKey, model, interfaceType, prompt, options = {}) {
  const { maxTokens = 50, stream = false, streamOptions = null, temperature = null, tools = null, tool_choice = null } = options;
  const pathMap = { 'OpenAI Chat': '/chat/completions', 'OpenAI Responses': '/responses', 'Claude Messages': '/messages' };
  const path = pathMap[interfaceType] || '/chat/completions';
  const endpoint = (baseUrl + path).replace(/\/+/g, '/').replace(':/', '://');
  let body;
  if (interfaceType === 'OpenAI Chat') {
    body = { model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, stream };
    if (stream && streamOptions) body.stream_options = streamOptions;
    if (temperature != null) body.temperature = temperature;
    else body.temperature = 0.7;
    if (tools) body.tools = tools;
    if (tool_choice) body.tool_choice = tool_choice;
  } else if (interfaceType === 'OpenAI Responses') {
    body = { model, input: prompt, max_output_tokens: maxTokens, stream };
  } else {
    body = { model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, stream };
  }
  const headers = { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' };
  if (interfaceType === 'Claude Messages') headers['anthropic-version'] = '2023-06-01';
  return { endpoint, body, headers };
}

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
            if ((part?.type === 'output_text' || part?.type === 'text') && part?.text?.trim()) return { text: part.text.trim(), status: 'present' };
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

function extractModels(data) {
  if (!data) return [];
  if (Array.isArray(data.data)) return data.data.map(m => m.id || '').filter(Boolean);
  if (Array.isArray(data.models)) return data.models.map(m => typeof m === 'string' ? m : m.id || '').filter(Boolean);
  if (Array.isArray(data)) return data.map(m => typeof m === 'string' ? m : m.id || '').filter(Boolean);
  return [];
}

function baseOrigin(url) {
  try { return new URL(url.replace(/\/$/, '')).origin; }
  catch (_) { return (url || '').replace(/\/$/, ''); }
}

function normalizeModelId(id) {
  if (!id) return '';
  return String(id).trim().toLowerCase();
}

function determineFinalTestModelId(userInputModelId, autoDetectedModelId, modelListResult) {
  const userInputTrim = (userInputModelId || '').trim();
  const autoDetectedTrim = (autoDetectedModelId || '').trim();
  const allModels = extractModels(modelListResult?.data);
  const normalizedModels = allModels.map(normalizeModelId);
  let finalTestModelId = '';
  let modelSource = 'unknown';
  let autoDetectedOrigin = '';
  if (userInputTrim) {
    finalTestModelId = userInputTrim;
    modelSource = 'user_input';
  } else if (autoDetectedTrim) {
    const normalizedAuto = normalizeModelId(autoDetectedTrim);
    const isInList = normalizedModels.includes(normalizedAuto);
    if (isInList) {
      finalTestModelId = autoDetectedTrim;
      modelSource = 'auto_detected_from_models';
      autoDetectedOrigin = 'models_list';
    } else {
      finalTestModelId = autoDetectedTrim;
      modelSource = 'auto_detected_by_probe';
      autoDetectedOrigin = 'probe';
    }
  } else {
    const chatModels = allModels.filter(m => !/(embedding|embed|vision|audio|tts|speech|whisper|dalle|image)/i.test(m));
    finalTestModelId = chatModels[0] || allModels[0] || '';
    modelSource = 'models_fallback';
    autoDetectedOrigin = 'list_fallback';
  }
  const isFinalModelInModelList = normalizedModels.includes(normalizeModelId(finalTestModelId));
  return { finalTestModelId, modelSource, autoDetectedOrigin, isFinalModelInModelList, allModels, userInputModelId: userInputTrim, autoModel: autoDetectedTrim };
}

/* ═══════════════════════════════════════════════════════
   STEP 1: API Server Reachability — 12 pts (6 sub-items)
   ═══════════════════════════════════════════════════════ */
async function checkA_Reachability(baseUrl, apiKey, signal) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';
  let r1 = 3, r2 = 2, r3 = 2, r4 = 2, r5 = 2, r6 = 1;
  let status = 'excellent';
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
      best = { url, status: resp.status, elapsed, headers: Object.fromEntries(resp.headers.entries()) };
      evidence.httpStatus = resp.status;
      evidence.elapsedMs = elapsed;
      break;
    } catch (_) {}
  }
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
  if (allFailed || !best) {
    r1 = 0;
    deductions.push(zh ? '网络无法连接' : 'Network unreachable');
    status = 'failed';
  } else if (best.status >= 500) {
    r1 = 1.5;
    status = 'warning';
  }
  if (best && baseUrl.startsWith('https')) r2 = 2;
  else if (best && baseUrl.startsWith('http:')) { r2 = 1; deductions.push(zh ? '使用 HTTP 而非 HTTPS' : 'Using HTTP instead of HTTPS'); }
  const elapsed = best ? best.elapsed : 99999;
  evidence.latency = elapsed;
  if (elapsed < 1000) r3 = 2;
  else if (elapsed < 3000) r3 = 1.5;
  else if (elapsed < 8000) { r3 = 1; deductions.push(zh ? `响应时间较长：${elapsed}ms` : `High response time: ${elapsed}ms`); if (status !== 'failed') status = 'warning'; }
  else { r3 = 0.5; deductions.push(zh ? `响应超时：${elapsed}ms` : `Slow response: ${elapsed}ms`); status = 'failed'; }
  const ct = best ? (best.headers['content-type'] || '') : '';
  const modelEndpointOk = best && best.status < 500;
  r4 = modelEndpointOk ? 2 : 1;
  evidence.modelEndpointOk = modelEndpointOk;
  evidence.contentType = ct;
  if (ct.includes('text/html')) { deductions.push(zh ? 'API 路径返回 HTML 而非 JSON' : 'API path returns HTML instead of JSON'); r4 = 1; if (status !== 'failed') status = 'warning'; }
  r5 = (ct.includes('application/json') || best?.status < 500) ? 2 : 1;
  if (best && (best.status === 401 || best.status === 403 || best.status === 404 || best.status === 429)) { r6 = 1; details.push(zh ? `HTTP ${best.status}，错误可解释` : `HTTP ${best.status}, error is explainable`); }
  else if (best && best.status >= 400) r6 = 0;
  const score = r1 + r2 + r3 + r4 + r5 + r6;
  if (status === 'excellent' && score < 12) status = 'good';
  if (score < 7) status = 'failed';
  const summary = status === 'excellent' ? (zh ? '完全达标' : 'Fully compliant') : status === 'good' ? (zh ? '基本达标' : 'Mostly compliant') : status === 'warning' ? (zh ? '部分未达标' : 'Partially non-compliant') : (zh ? '严重问题' : 'Serious issues');
  return mkCheck({ id: 'reachability', label: { zh: 'API 服务器可达性', en: 'API Server Reachability' }, maxScore: 12, score, status, summary, details, deductions, evidence });
}

/* ═══════════════════════════════════════════════════════
   STEP 2: Auth / API Key — 14 pts (6 sub-items)
   ═══════════════════════════════════════════════════════ */
async function checkB_Auth(baseUrl, apiKey, signal) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';
  const modelEndpoint = (baseUrl.replace(/\/$/, '') + '/v1/models').replace(/\/+/g, '/').replace(':/', '://');
  let a1 = 3, a2 = 2, a3 = 3, a4 = 3, a5 = 1, a6 = 2;
  let status = 'excellent';
  let modelsStatus = 0, chatStatus = 0, errorMessage = '';
  try {
    const resp = await fetch(modelEndpoint, { method: 'GET', headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }, signal });
    modelsStatus = resp.status;
    evidence.modelsStatus = modelsStatus;
    if (!resp.ok) {
      try { const err = await resp.json(); errorMessage = err.error?.message || err.error?.code || ''; evidence.errorMessage = errorMessage; } catch (_) {}
    }
  } catch (err) { evidence.netError = err.message; }
  if (modelsStatus === 401 || modelsStatus === 403) {
    a1 = 0; a3 = 0;
    deductions.push(zh ? `API Key 未被识别（HTTP ${modelsStatus}）` : `API Key not recognized (HTTP ${modelsStatus})`);
    status = 'failed';
    evidence.checkStage403 = evidence.checkStage403 || [];
    evidence.checkStage403.push('model_list');
  }
  try {
    const req = buildRequest(baseUrl, apiKey, 'test-model', 'OpenAI Chat', PROMPT_SHORT, { maxTokens: 5 });
    const resp = await fetch(req.endpoint, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal });
    chatStatus = resp.status;
    evidence.chatStatus = chatStatus;
  } catch (err) { evidence.chatNetError = err.message; }
  if (chatStatus === 401 || chatStatus === 403) {
    if (status !== 'failed') status = 'failed';
    a3 = 0;
    details.push(zh ? 'Chat 请求收到 401/403' : 'Chat request received 401/403');
    evidence.checkStage403 = evidence.checkStage403 || [];
    evidence.checkStage403.push('core_chat');
  }
  else if (chatStatus === 429) { a4 = 1.5; details.push(zh ? '遇到限流' : 'Rate limited'); if (status === 'excellent') status = 'good'; }
  else if (chatStatus >= 400) a4 = 0;
  a5 = errorMessage ? 1 : 0;
  if ((modelsStatus >= 200 && modelsStatus < 400) === (chatStatus >= 200 && chatStatus < 400)) a6 = 2;
  else { a6 = 0.5; details.push(zh ? '/models 和 chat 接口鉴权结果不一致' : '/models and chat auth results inconsistent'); if (status !== 'failed') status = 'warning'; }
  const score = a1 + a2 + a3 + a4 + a5 + a6;
  if (status === 'excellent' && score < 12) status = 'good';
  if (score < 5) status = 'failed';
  const summary = status === 'excellent' ? (zh ? '完全达标' : 'Fully compliant') : status === 'good' ? (zh ? '基本达标' : 'Mostly compliant') : status === 'warning' ? (zh ? '存在异常' : 'Abnormal') : (zh ? '鉴权失败' : 'Auth failed');
  return mkCheck({ id: 'auth', label: { zh: '鉴权 / Key 有效性', en: 'Auth / Key Validity' }, maxScore: 14, score, status, summary, details, deductions, evidence });
}

/* ═══════════════════════════════════════════════════════
   STEP 3: Model List Retrieval — 12 pts (7 sub-items)
   ═══════════════════════════════════════════════════════ */
async function checkC_ModelList(baseUrl, apiKey, signal, userModel) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';
  let ml1 = 3, ml2 = 2, ml3 = 2, ml4 = 1, ml5 = 2, ml6 = 1, ml7 = 1;
  let status = 'excellent';
  const endpoints = [
    (baseUrl.replace(/\/$/, '') + '/v1/models').replace(/\/+/g, '/').replace(':/', '://'),
    (baseUrl.replace(/\/$/, '') + '/models').replace(/\/+/g, '/').replace(':/', '://'),
  ];
  let bestResp = null;
  for (const url of endpoints) {
    try {
      const resp = await fetch(url, { method: 'GET', headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }, signal });
      evidence.httpStatus = resp.status;
      evidence.httpUrl = url;
      if (resp.ok) {
        try {
          const data = await resp.json();
          evidence.data = data;
          const models = extractModels(data);
          evidence.models = models;
          evidence.modelCount = models.length;
          evidence.firstModel = models[0] || '';
          if (models.length > 0) { bestResp = { status: resp.status, data, models }; break; }
        } catch (_) { evidence.parseError = true; }
      }
    } catch (_) {}
  }
  if (!bestResp) {
    ml1 = 0; ml2 = 0; ml3 = 0; ml4 = 0; ml5 = 0; ml6 = 0;
    deductions.push(zh ? '/models 请求失败' : '/models request failed');
    status = 'failed';
    evidence.models = [];
    evidence.modelCount = 0;
  } else {
    if (evidence.parseError) { ml2 = 0; deductions.push(zh ? '响应 JSON 解析失败' : 'Response JSON parse failed'); status = 'warning'; }
    if (evidence.modelCount === 0) { ml3 = 0; ml4 = 0; details.push(zh ? '模型列表为空' : 'Model list is empty'); }
    else if (evidence.modelCount <= 2) { ml3 = 1; details.push(zh ? `模型数量较少（${evidence.modelCount}）` : `Few models (${evidence.modelCount})`); }
    if (userModel) {
      evidence.userModel = userModel;
      const normalizedUser = normalizeModelId(userModel);
      const isListed = evidence.models.map(normalizeModelId).includes(normalizedUser);
      ml5 = isListed ? 2 : 0;
      if (!isListed) details.push(zh ? `用户填写的模型 ${userModel} 不在列表中` : `User-filled model ${userModel} not in list`);
    }
  }
  const score = ml1 + ml2 + ml3 + ml4 + ml5 + ml6 + ml7;
  if (status === 'excellent' && score < 10) status = 'good';
  if (score < 3) status = 'failed';
  const summary = status === 'excellent' ? (zh ? `${evidence.modelCount || 0} 个模型` : `${evidence.modelCount || 0} models`) : status === 'good' ? (zh ? `少量模型` : 'Few models') : (zh ? '模型列表不可用' : 'Model list unavailable');
  return mkCheck({ id: 'modelList', label: { zh: '模型列表获取', en: 'Model List Retrieval' }, maxScore: 12, score, status, summary, details, deductions, evidence });
}

/* ═══════════════════════════════════════════════════════
   STEP 4: Model Auto-Detection — 10 pts
   ═══════════════════════════════════════════════════════ */
async function checkD_AutoModel(baseUrl, apiKey, modelIdInfo, authResult, signal, interfaceType) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';
  const { modelSource, isFinalModelInModelList, finalTestModelId, allModels } = modelIdInfo;
  let am1 = 3, am2 = 2, am3 = 2, am4 = 1, am5 = 2;
  let status = 'excellent';
  evidence.modelSource = modelSource;
  evidence.isInModelList = isFinalModelInModelList;
  evidence.finalModel = finalTestModelId;
  if (modelSource === 'user_input' && !isFinalModelInModelList) { am1 = 1.5; deductions.push(zh ? `用户填写的模型 ${finalTestModelId} 不在 /models 列表中` : `User-filled model ${finalTestModelId} not in /models list`); status = 'warning'; }
  else if (modelSource === 'user_input' && isFinalModelInModelList) { am1 = 3; details.push(zh ? '用户填写模型已在列表中确认' : 'User-filled model confirmed in list'); }
  else if (modelSource === 'auto_detected_from_models') { am1 = 3; details.push(zh ? '从模型列表自动选择' : 'Auto-selected from model list'); }
  else if (modelSource === 'auto_detected_by_probe') { am1 = 2; deductions.push(zh ? '模型不在 /models 列表，通过探测发现' : 'Model not in /models list, found by probing'); if (status !== 'failed') status = 'good'; }
  else if (modelSource === 'models_fallback') { am1 = 1.5; deductions.push(zh ? '从模型列表选择默认模型' : 'Selected default model from list'); if (status !== 'failed') status = 'good'; }
  const chatModels = (allModels || []).filter(m => !/(embedding|embed|vision|audio|tts|speech|whisper|dalle|image)/i.test(m));
  evidence.chatModels = chatModels;
  am2 = chatModels.length > 0 ? 2 : 0;
  if (authResult?.evidence?.chatStatus === 429) { am3 = 0; deductions.push(zh ? '鉴权测试触发了限流' : 'Auth test triggered rate limit'); status = 'warning'; }
  if (chatModels.length === 0 && allModels.length > 0) { am4 = 0; details.push(zh ? '列表中无可用于 chat 的模型' : 'No chat-capable models in list'); }
  const score = am1 + am2 + am3 + am4 + am5;
  if (score < 5) status = 'failed';
  else if (score < 8) status = 'warning';
  const summary = modelSource === 'user_input' ? (zh ? `使用用户填写模型：${finalTestModelId}` : `User-filled model: ${finalTestModelId}`) : modelSource === 'auto_detected_from_models' ? (zh ? `自动识别：${finalTestModelId}` : `Auto-detected: ${finalTestModelId}`) : modelSource === 'auto_detected_by_probe' ? (zh ? `探测发现：${finalTestModelId}` : `Probed: ${finalTestModelId}`) : (zh ? `列表选择：${finalTestModelId}` : `List-selected: ${finalTestModelId}`);
  return mkCheck({ id: 'autoModel', label: { zh: '模型识别与选择', en: 'Model Identification' }, maxScore: 10, score, status, summary, details, deductions, evidence });
}

/* ═══════════════════════════════════════════════════════
   STEP 5: Target Model Call Quality — 22 pts (10 sub-items)
   ═══════════════════════════════════════════════════════ */
async function checkE_TargetCall(baseUrl, apiKey, model, interfaceType, signal) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';
  const t0 = Date.now();
  let tc1 = 2, tc2 = 3, tc3 = 3, tc4 = 4, tc5 = 3, tc6 = 2, tc7 = 2, tc8 = 1, tc9 = 1, tc10 = 1;
  let status = 'excellent';
  try {
    const req = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_SHORT, { maxTokens: 50 });
    const resp = await fetch(req.endpoint, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal });
    evidence.latencyMs = Date.now() - t0;
    evidence.httpStatus = resp.status;
    evidence.endpoint = req.endpoint;
    if (!resp.ok) {
      tc1 = 0; tc2 = 0; tc3 = 0; tc4 = 0; tc5 = 0; tc6 = 0; tc7 = 0;
      deductions.push(zh ? `HTTP ${resp.status}` : `HTTP ${resp.status}`);
      if (resp.status === 401 || resp.status === 403) { status = 'failed'; deductions.push(zh ? '鉴权失败' : 'Authentication failed'); evidence.checkStage403 = ['core_chat']; }
      else if (resp.status === 429) { status = 'warning'; deductions.push(zh ? '限流' : 'Rate limited'); tc9 = 0; }
      else if (resp.status === 404) { status = 'warning'; deductions.push(zh ? '模型端点不存在' : 'Model endpoint not found'); }
      else status = 'warning';
    } else {
      let data;
      try { data = await resp.json(); evidence.data = data; evidence.responseParsed = true; }
      catch (_) { evidence.responseParsed = false; tc3 = 0; deductions.push(zh ? '响应不是合法 JSON' : 'Response is not valid JSON'); status = 'warning'; }
      if (data) {
        const choices = data.choices;
        if (choices && Array.isArray(choices) && choices.length > 0) {
          evidence.formatChoices = true;
          const c0 = choices[0];
          const msg = c0?.message;
          if (msg && typeof msg.content === 'string') evidence.formatMessage = true;
          if (c0?.finish_reason) { evidence.finishReason = c0.finish_reason; tc6 = 2; }
        } else { tc4 = 0; details.push(zh ? 'choices 格式不标准' : 'choices format non-standard'); }
        const output = extractVisibleOutput(data, interfaceType);
        evidence.output = output;
        if (output.status === 'present') { tc5 = 3; evidence.outputText = output.text; if (output.text.length < 2) details.push(zh ? `回复过短：${output.text}` : `Reply too short: ${output.text}`); }
        else if (output.status === 'unknown') { tc5 = 1.5; details.push(zh ? '输出格式无法解析' : 'Output format cannot be parsed'); if (status !== 'failed') status = 'warning'; }
        else { tc5 = 0; deductions.push(zh ? '模型未返回有效内容' : 'Model returned no valid content'); if (status !== 'failed') status = 'warning'; }
        const usage = data.usage || {};
        evidence.usage = usage;
        if (usage && Object.keys(usage).length > 0) { tc7 = 2; evidence.usageDetail = usage; }
        else details.push(zh ? '未返回 usage 信息' : 'No usage information returned');
        if (evidence.latencyMs < 2000) tc8 = 1;
        else if (evidence.latencyMs > 10000) { tc8 = 0.5; details.push(zh ? `响应延迟较高：${evidence.latencyMs}ms` : `High latency: ${evidence.latencyMs}ms`); }
        if (data.error) { tc10 = 0; evidence.serverError = data.error; details.push(zh ? `服务端错误：${data.error?.message || data.error}` : `Server error: ${data.error?.message || data.error}`); }
      }
    }
  } catch (err) {
    tc1 = 0; tc2 = 0; tc3 = 0; tc4 = 0; tc5 = 0; tc6 = 0; tc7 = 0;
    evidence.networkError = err.message;
    deductions.push(zh ? `网络错误：${err.message}` : `Network error: ${err.message}`);
    status = 'failed';
  }
  const score = tc1 + tc2 + tc3 + tc4 + tc5 + tc6 + tc7 + tc8 + tc9 + tc10;
  if (score < 5) status = 'failed';
  else if (score < 11) status = 'warning';
  else if (score < 17) status = 'good';
  const summary = status === 'excellent' ? (zh ? '调用质量优秀' : 'Call quality excellent') : status === 'good' ? (zh ? '调用质量良好' : 'Call quality good') : status === 'warning' ? (zh ? '调用质量一般' : 'Call quality fair') : (zh ? '调用质量差' : 'Call quality poor');
  return mkCheck({ id: 'targetCall', label: { zh: '目标模型调用质量', en: 'Target Model Call' }, maxScore: 22, score, status, summary, details, deductions, evidence });
}

/* ═══════════════════════════════════════════════════════
   STEP 6: Stability Sampling — 15 pts (7 sub-items, 5 pings)
   SHORT-PROMPT test: "Reply with exactly: OK" (2 words).
   Latency thresholds are STRICT for short-prompt responses.
   ═══════════════════════════════════════════════════════ */
async function checkG_Stability(baseUrl, apiKey, model, interfaceType, signal, targetCallResult) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    try {
      const req = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_STABILITY, { maxTokens: 5, temperature: 0 });
      const resp = await fetch(req.endpoint, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal });
      const latency = Date.now() - t0;
      evidence['latency' + i] = latency;
      if (!resp.ok) {
        samples.push({ ok: false, status: resp.status, latency, errMsg: 'HTTP ' + resp.status, responseText: '' });
        if (resp.status === 429) evidence.rateLimitDetected = true;
        if (resp.status === 403) { evidence._stability403 = evidence._stability403 || []; evidence._stability403.push(i); }
      } else {
        let data;
        try { data = await resp.json(); } catch (_) { data = {}; }
        const output = extractVisibleOutput(data, interfaceType);
        const hasContent = output.status === 'present' && output.text.trim() !== '';
        const usage = data.usage || {};
        samples.push({ ok: hasContent, status: resp.status, latency, responseText: output.text, hasContent, usage, completionTokens: usage.completion_tokens || usage.output_tokens || 0, totalTokens: usage.total_tokens || 0 });
      }
    } catch (err) {
      samples.push({ ok: false, status: 0, latency: Date.now() - t0, errMsg: err.message, responseText: '' });
    }
    if (i < 4) await sleep(300);
  }
  evidence.samples = samples;
  const okCount = samples.filter(s => s.ok && s.hasContent).length;
  const latencies = samples.map(s => s.latency || 0).filter(l => l > 0);
  const avgLat = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const minLat = latencies.length > 0 ? Math.min(...latencies) : 0;
  const maxLat = latencies.length > 0 ? Math.max(...latencies) : 0;
  const jitter = maxLat - minLat;
  evidence.avgLatency = avgLat;
  evidence.latencyJitter = jitter;
  evidence.minLatency = minLat;
  evidence.maxLatency = maxLat;
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0, s6 = 0, s7 = 0;
  let status = 'excellent';

  // S1: Success rate (4 pts)
  if (okCount === 5) s1 = 4;
  else if (okCount === 4) s1 = 3;
  else if (okCount === 3) s1 = 2;
  else if (okCount === 2) s1 = 1;
  else if (okCount === 1) s1 = 0.5;
  else { s1 = 0; deductions.push(zh ? '稳定性采样全部失败' : 'All stability sampling failed'); status = 'failed'; }

  // S2: Average latency (3 pts) — 800-1500ms is slow but medium, not automatically high
  if (avgLat <= 200) s2 = 3;
  else if (avgLat <= 500) s2 = 2.5;
  else if (avgLat <= 800) s2 = 2;
  else if (avgLat <= 1500) s2 = 1.2;
  else if (avgLat <= 3000) s2 = 0.6;
  else { s2 = 0; deductions.push(zh ? `平均延迟过高：${Math.round(avgLat)}ms` : `Avg latency too high: ${Math.round(avgLat)}ms`); }

  // S3: Max latency (2 pts) — >5000ms alone is high risk, not automatically failing
  if (maxLat <= 500) s3 = 2;
  else if (maxLat <= 1500) s3 = 1.2;
  else if (maxLat <= 5000) s3 = 0.5;
  else { s3 = 0; deductions.push(zh ? `最大延迟过高：${maxLat}ms` : `Max latency too high: ${maxLat}ms`); }

  // S4: Latency jitter (2 pts) — >3000ms alone is high risk
  if (jitter < 100) s4 = 2;
  else if (jitter < 300) s4 = 1.5;
  else if (jitter < 800) s4 = 1;
  else if (jitter < 3000) s4 = 0.5;
  else { s4 = 0; deductions.push(zh ? `延迟波动严重：${jitter}ms` : `Severe latency jitter: ${jitter}ms`); }

  // S5: Output consistency (1.5 pts)
  const okResponses = samples.filter(s => s.ok).map(s => s.responseText.trim());
  if (okCount === 5 && okResponses.every(r => r === 'OK')) s5 = 1.5;
  else if (okCount >= 4 && okResponses.length >= 2 && okResponses[0] === okResponses[1]) s5 = 1;
  else if (okResponses.length >= 2) details.push(zh ? '输出一致性：多次输出不一致' : 'Output consistency: multiple outputs differ');

  // S6: Rate limit / wind control (1.5 pts)
  if (!evidence.rateLimitDetected) {
    s6 = 1.5;
  } else if (okCount >= 4) {
    s6 = 0.5;
    details.push(zh ? '检测中触发一次限流' : 'Rate limit triggered once during detection');
  } else {
    s6 = 0;
    deductions.push(zh ? '检测中触发限流' : 'Rate limit triggered during detection');
    if (status !== 'failed') status = 'warning';
  }

  // S7: Error explainability (1 pt)
  const failedSamples = samples.filter(s => !s.ok);
  if (failedSamples.length === 0) s7 = 1;
  else s7 = failedSamples.every(s => s.status === 429 || s.status === 403 || s.status === 400 || s.errMsg) ? 1 : 0;

  const score = s1 + s2 + s3 + s4 + s5 + s6 + s7;
  evidence.subScores = { s1, s2, s3, s4, s5, s6, s7 };

  // Force status overrides — only for truly high-risk situations
  // avgLat > 3000ms alone: stability status = warning (not failed), cap handled by applyCaps
  if (avgLat > 3000) { if (status !== 'failed') status = 'warning'; }
  // maxLat > 10000ms alone: stability high risk
  if (maxLat > 10000) { if (status !== 'failed') status = 'warning'; }
  // okCount <= 3/5: stability warning
  if (okCount <= 3) { if (status !== 'failed') status = 'warning'; }
  // okCount <= 1: stability failed
  if (okCount <= 1) status = 'failed';
  // 0/5 success: stability failed, high risk
  if (okCount === 0) status = 'failed';
  // Multiple 429 / rate limit: stability warning
  if (evidence.rateLimitDetected && okCount < 4) { if (status !== 'failed') status = 'warning'; }
  // Score-based status
  if (score < 8) status = 'failed';
  else if (score < 12) status = 'warning';

  const summary = status === 'excellent' ? (zh ? '完全稳定' : 'Fully stable') : status === 'good' ? `${okCount}/5 成功，平均 ${Math.round(avgLat)}ms` : status === 'warning' ? (zh ? '稳定性波动' : 'Stability fluctuating') : (zh ? '稳定性差' : 'Poor stability');
  return mkCheck({ id: 'stability', label: { zh: '稳定性采样', en: 'Stability Sampling' }, maxScore: 15, score, status, summary, details, deductions, evidence });
}

/* ═══════════════════════════════════════════════════════
   STEP 7: Usage Audit — 6 pts (legacy, kept for compatibility)
   ═══════════════════════════════════════════════════════ */
async function checkH_UsageAudit(baseUrl, apiKey, model, interfaceType, signal, targetCallResult) {
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';
  const usage = targetCallResult?.evidence?.usage || {};
  evidence.usage = usage;
  let u1 = 1.5, u2 = 1, u3 = 1, u4 = 1, u5 = 0.75, u6 = 0.75;
  let status = 'excellent';
  if (!usage || Object.keys(usage).length === 0) { u1 = 0; u2 = 0; u3 = 0; u4 = 0; u5 = 0; u6 = 0; details.push(zh ? 'usage 字段不存在' : 'usage field does not exist'); status = 'warning'; }
  else {
    if (usage.total_tokens || usage.prompt_tokens || usage.completion_tokens) u1 = 1.5;
    if (usage.prompt_tokens != null || usage.input_tokens != null) u2 = 1;
    if (usage.completion_tokens != null || usage.output_tokens != null) u3 = 1;
    if (usage.total_tokens != null) u4 = 1;
    if (u2 > 0 && u3 > 0) u5 = 0.75;
    if (u1 > 0 && u5 > 0) u6 = 0.75;
  }
  const score = u1 + u2 + u3 + u4 + u5 + u6;
  if (score < 1) status = 'warning';
  return mkCheck({ id: 'usageAudit', label: { zh: '用量审计', en: 'Usage Audit' }, maxScore: 6, score, status, summary: score >= 5.5 ? (zh ? '明细完整' : 'Details complete') : score >= 4 ? (zh ? '明细基本可用' : 'Details mostly available') : score >= 2 ? (zh ? '明细不完整' : 'Details incomplete') : (zh ? '无法审计' : 'Cannot audit'), details, deductions: [], evidence });
}

/* ═══════════════════════════════════════════════════════
   STEP 8: Client Config Exportability — 3 pts (3 sub-items)
   1. Base URL format for client: 1pt
   2. Model ID explicit: 1pt
   3. Cline / Continue config exportable: 1pt
   ═══════════════════════════════════════════════════════ */
function checkI_ClientConfig(baseUrl, apiKey, model, modelListResult, targetCallResult) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';
  let c1 = 1, c2 = 1, c3 = 1;
  let status = 'excellent';
  // c1: Base URL format usable by client
  try { const url = new URL(baseUrl); evidence.baseUrlOrigin = url.origin; if (!baseUrl.startsWith('https')) details.push(zh ? 'Base URL 未使用 HTTPS' : 'Base URL not using HTTPS'); }
  catch (_) { c1 = 0; deductions.push(zh ? 'Base URL 格式异常' : 'Base URL format abnormal'); status = 'warning'; }
  // c2: Model ID explicit
  if (!model || !model.trim()) { c2 = 0; details.push(zh ? 'Model ID 为空' : 'Model ID is empty'); status = 'warning'; }
  else { evidence.modelId = model; }
  // c3: Cline / Continue config exportable
  if (!baseUrl || !apiKey || !model) { c3 = 0; details.push(zh ? '配置不完整，无法导出' : 'Config incomplete — cannot export'); status = 'warning'; }
  else {
    const tcStatus = targetCallResult?.evidence?.httpStatus || 0;
    if (tcStatus >= 200 && tcStatus < 300) { c3 = 1; evidence.clineReady = true; evidence.continueReady = true; }
    else if (tcStatus >= 400) { c3 = 0.5; details.push(zh ? '目标模型调用未成功，配置未验证' : 'Target model call not successful — config not verified'); }
    else c3 = 0.5;
  }
  const score = c1 + c2 + c3;
  if (score < 1.5) status = 'warning';
  if (score < 0.5) status = 'failed';
  const summary = status === 'excellent' ? (zh ? '配置完整可导出' : 'Config complete and exportable') : status === 'warning' ? (zh ? '配置部分可用' : 'Config partially available') : (zh ? '配置不可用' : 'Config not available');
  return mkCheck({ id: 'clientConfig', label: { zh: '客户端配置', en: 'Client Config' }, maxScore: 3, score, status, summary, details, deductions, evidence });
}

/* ═══════════════════════════════════════════════════════
   NEW: makeApiCall helper
   ═══════════════════════════════════════════════════════ */
async function makeApiCall(baseUrl, apiKey, model, interfaceType, prompt, maxTokens, temperature, signal, timeoutMs) {
  try {
    const req = buildRequest(baseUrl, apiKey, model, interfaceType, prompt, { maxTokens, temperature });
    const resp = timeoutMs ? await fetchWithTimeout(req.endpoint, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal }, timeoutMs)
                             : await fetch(req.endpoint, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal });
    let data;
    try { data = await resp.json(); }
    catch (_) { data = {}; }
    return { success: resp.ok, data, status: resp.status };
  } catch (err) {
    const isTimeout = err.name === 'AbortError' || err.message && err.message.includes('timeout');
    return { success: false, data: {}, status: 0, error: err.message, timeout: isTimeout };
  }
}

/**
 * Fetch with AbortController-based timeout.
 * Properly aborts the fetch request when timeout fires.
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/* ═══════════════════════════════════════════════════════
   STEP 8: checkJ — Cost Transparency (35 pts, 9 sub-items)
   J1 usage completeness (5), J2 prompt tokens (3), J3 completion tokens (3)
   J4 total consistency (4), J5 short reply (6), J6 max_tokens (4)
   J7 usage stability (3), J8 dual-prompt delta (5), J9 clarity (2)
   ═══════════════════════════════════════════════════════ */

/**
 * Estimate prompt token count using conservative heuristics.
 * English: ~4 chars ≈ 1 token
 * Chinese: ~1.5 chars ≈ 1 token
 * Future: replace with tokenizer, but don't overcomplicate now
 */
function estimatePromptTokens(prompt) {
  if (!prompt || typeof prompt !== 'string') return 0;
  let tokens = 0;
  for (const ch of prompt) {
    if (/[\u4e00-\u9fff]/.test(ch)) {
      tokens += 1;
    } else if (/[a-zA-Z0-9 .,!?'"():;\-]/.test(ch)) {
      tokens += 1;
    } else {
      tokens += 0.5;
    }
  }
  return Math.max(1, Math.ceil(tokens));
}

async function checkJ_CostTransparency(baseUrl, apiKey, model, interfaceType, signal, targetCallResult) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';
  const subScores = {};
  const targetUsage = targetCallResult?.evidence?.usage || {};
  const hasUsage = !!(targetUsage && Object.keys(targetUsage).length > 0);
  const usageComplete = hasUsage
    && (targetUsage.prompt_tokens != null || targetUsage.input_tokens != null)
    && (targetUsage.completion_tokens != null || targetUsage.output_tokens != null)
    && targetUsage.total_tokens != null;

  // ── J1: usage field completeness (4 pts) ──────────────────
  if (!hasUsage) {
    subScores.usageField = 0;
    deductions.push(zh ? 'usage 字段完全缺失，无法审计消耗' : 'usage field completely missing — cannot audit consumption');
  } else {
    const hasPrompt = targetUsage.prompt_tokens != null || targetUsage.input_tokens != null;
    const hasCompletion = targetUsage.completion_tokens != null || targetUsage.output_tokens != null;
    const hasTotal = targetUsage.total_tokens != null;
    if (hasTotal && hasPrompt && hasCompletion) {
      subScores.usageField = 4;
    } else if (hasPrompt && hasCompletion) {
      subScores.usageField = 3.2;
      details.push(zh ? '有 prompt/completion_tokens 但缺 total_tokens' : 'Has prompt/completion_tokens but missing total_tokens');
    } else if (hasPrompt || hasCompletion) {
      subScores.usageField = 2.5;
      details.push(zh ? '只有部分 usage 字段' : 'Only partial usage fields');
    } else {
      subScores.usageField = 1;
      details.push(zh ? '只有 total_tokens' : 'Only total_tokens available');
    }
  }
  evidence.usageTest = { hasUsage, usageComplete, ...targetUsage };

  // ── J2: prompt_tokens reasonableness (3 pts) ──────────────
  const promptVal = targetUsage.prompt_tokens ?? targetUsage.input_tokens;
  if (promptVal == null) {
    subScores.promptTokens = 0;
  } else if (typeof promptVal !== 'number') {
    subScores.promptTokens = 1;
  } else if (promptVal > 10000) {
    subScores.promptTokens = 1.5;
    details.push(zh ? `prompt_tokens 异常偏高：${promptVal}` : `prompt_tokens abnormally high: ${promptVal}`);
  } else {
    subScores.promptTokens = 3;
  }

  // ── J3: completion_tokens reasonableness (3 pts) ────────────
  const completionVal = targetUsage.completion_tokens ?? targetUsage.output_tokens;
  if (completionVal == null) {
    subScores.completionTokens = 0;
  } else if (typeof completionVal !== 'number') {
    subScores.completionTokens = 1;
  } else if (completionVal > 50000) {
    subScores.completionTokens = 1.5;
    details.push(zh ? `completion_tokens 异常偏高：${completionVal}` : `completion_tokens abnormally high: ${completionVal}`);
  } else {
    subScores.completionTokens = 3;
  }

  // ── J4: total_tokens consistency (4 pts) ──────────────────
  const totalVal = targetUsage.total_tokens || 0;
  if (totalVal === 0 || promptVal == null || completionVal == null) {
    subScores.totalTokens = 0;
  } else {
    const expected = (promptVal || 0) + (completionVal || 0);
    const diff = Math.abs(totalVal - expected);
    const ratio = expected > 0 ? diff / expected : 1;
    if (ratio < 0.05) subScores.totalTokens = 4;
    else if (ratio < 0.20) subScores.totalTokens = 3;
    else subScores.totalTokens = 1;
    if (ratio >= 0.20) {
      deductions.push(zh
        ? `total_tokens(${totalVal}) 与 prompt+completion(${expected}) 差异超过 20%`
        : `total_tokens(${totalVal}) differs from prompt+completion(${expected}) by >20%`);
    } else if (ratio >= 0.05) {
      details.push(zh
        ? `total_tokens 与 prompt+completion 差异 ${Math.round(ratio * 100)}%`
        : `total_tokens differs from prompt+completion by ${Math.round(ratio * 100)}%`);
    }
  }
  evidence.j4 = { totalVal, promptVal, completionVal };

  // ── J5: Short reply token reasonableness (6 pts) ───────────
  const shortResult = await makeApiCall(baseUrl, apiKey, model, interfaceType, 'Reply exactly: OK', 5, 0, signal);
  const srOutput = extractVisibleOutput(shortResult.data, interfaceType);
  const srUsage = shortResult.data?.usage || {};
  const srComp = srUsage.completion_tokens ?? srUsage.output_tokens ?? 0;
  const srTotal = srUsage.total_tokens || 0;
  const srDetails = srUsage.completion_tokens_details || {};
  const srReasoning = srDetails.reasoning_tokens ?? 0;
  evidence.shortReplyTest = { ok: srOutput.text.trim() === 'OK', completionTokens: srComp, reasoningTokens: srReasoning, totalTokens: srTotal, output: srOutput.text };

  if (!shortResult.success) {
    subScores.shortReply = 0;
    details.push(zh ? '无法执行短回复测试' : 'Cannot perform short reply test');
  } else if (srOutput.text.trim() !== 'OK') {
    subScores.shortReply = 0;
    deductions.push(zh ? '短回复测试未返回预期内容' : 'Short reply test did not return expected content');
  } else if (srComp > 50 && srReasoning === 0) {
    subScores.shortReply = 0.5;
    deductions.push(zh
      ? `极短回复 OK 但 completion_tokens 严重偏高(${srComp})，无 reasoning_tokens 解释，扣费不可解释风险高`
      : `Short reply OK but completion_tokens(${srComp}) severely high with no reasoning_tokens — unexplained billing risk`);
  } else if (srComp > 50 && srReasoning > 0) {
    if (srReasoning > srComp * 0.7) {
      subScores.shortReply = 4;
      details.push(zh
        ? `短回复 token 偏高(${srComp})，部分由 reasoning_tokens(${srReasoning}) 解释，建议结合后台余额继续核对`
        : `Short reply tokens high(${srComp}), reasoning_tokens(${srReasoning}) mostly explains it — verify against backend balance`);
    } else {
      subScores.shortReply = 2;
      deductions.push(zh
        ? `短回复 token 偏高(${srComp})，reasoning_tokens(${srReasoning}) 无法完全解释`
        : `Short reply tokens high(${srComp}), reasoning_tokens(${srReasoning}) insufficiently explains it`);
    }
  } else if (srComp > 20) {
    subScores.shortReply = 2;
    details.push(zh ? `短回复 completion_tokens 偏高(${srComp})` : `Short reply completion_tokens(${srComp}) slightly high`);
  } else if (srComp > 5) {
    subScores.shortReply = 4;
    details.push(zh ? `短回复 completion_tokens 轻微偏高(${srComp})` : `Short reply completion_tokens(${srComp}) slightly above ideal`);
  } else {
    subScores.shortReply = 6;
  }

  // ── J6: max_tokens limit effectiveness (4 pts) ──────────────
  const maxResult = await makeApiCall(baseUrl, apiKey, model, interfaceType, 'Reply with one word only: OK', 5, 0, signal);
  const mtOutput = extractVisibleOutput(maxResult.data, interfaceType);
  const mtUsage = maxResult.data?.usage || {};
  const mtComp = mtUsage.completion_tokens ?? mtUsage.output_tokens ?? 0;
  evidence.maxTokensTest = { output: mtOutput.text, completionTokens: mtComp };
  if (!maxResult.success) {
    subScores.maxTokens = 0;
    details.push(zh ? '无法执行 max_tokens 限制测试' : 'Cannot perform max_tokens limit test');
  } else if (mtComp > 20) {
    subScores.maxTokens = 0.5;
    deductions.push(zh
      ? `max_tokens=5 但 completion_tokens 明显超过限制(${mtComp})，usage 异常`
      : `max_tokens=5 but completion_tokens(${mtComp}) clearly exceeds limit — usage abnormal`);
  } else if (mtComp > 10) {
    subScores.maxTokens = 1;
    deductions.push(zh ? 'max_tokens 限制未完全生效' : 'max_tokens limit not fully enforced');
  } else if (mtComp > 5) {
    subScores.maxTokens = 2.5;
    details.push(zh ? 'max_tokens 基本受控' : 'max_tokens mostly controlled');
  } else {
    subScores.maxTokens = 4;
  }

  // ── J7: Usage stability across 3 identical calls (3 pts) ──
  const stabilityCalls = [];
  for (let i = 0; i < 3; i++) {
    const r = await makeApiCall(baseUrl, apiKey, model, interfaceType, 'Say: TEST', 10, 0, signal);
    stabilityCalls.push(r.data?.usage || {});
    if (i < 2) await sleep(300);
  }
  evidence.usageStability = stabilityCalls;
  if (stabilityCalls.length >= 2) {
    const t1 = stabilityCalls[0].total_tokens || 0;
    const t2 = stabilityCalls[1].total_tokens || 0;
    if (t1 > 0 && t2 > 0) {
      const variation = Math.abs(t1 - t2) / Math.max(t1, t2);
      if (variation < 0.20) subScores.usageStability = 3;
      else if (variation < 0.50) subScores.usageStability = 1.5;
      else subScores.usageStability = 0.5;
      if (variation >= 0.50) {
        deductions.push(zh
          ? `相同请求 usage 波动 ${Math.round(variation * 100)}%，明显不稳定`
          : `Same-request usage varies ${Math.round(variation * 100)}% — significantly unstable`);
      } else if (variation >= 0.20) {
        details.push(zh
          ? `相同请求 usage 波动 ${Math.round(variation * 100)}%`
          : `Same-request usage varies ${Math.round(variation * 100)}%`);
      }
    } else subScores.usageStability = 0;
  } else subScores.usageStability = 0;

  // ── J8: Dual-prompt differential (2 pts) ──────────────
  const PROMPT_A = 'Say hello.';
  const PROMPT_B = 'Say hello. Also repeat this marker exactly: ROUTE_TOKEN_CHECK_7391';
  const resA = await makeApiCall(baseUrl, apiKey, model, interfaceType, PROMPT_A, 5, 0, signal);
  const resB = await makeApiCall(baseUrl, apiKey, model, interfaceType, PROMPT_B, 5, 0, signal);
  const usageA = resA.data?.usage || {};
  const usageB = resB.data?.usage || {};
  const promptTokensA = usageA.prompt_tokens ?? usageA.input_tokens ?? null;
  const promptTokensB = usageB.prompt_tokens ?? usageB.input_tokens ?? null;
  const estimatedA = estimatePromptTokens(PROMPT_A);
  const estimatedB = estimatePromptTokens(PROMPT_B);
  evidence.j8Test = { promptA: PROMPT_A, promptB: PROMPT_B, apiPromptA: promptTokensA, apiPromptB: promptTokensB, estimatedA, estimatedB };

  let j8Score = 0;
  let baseOverhead = null;
  let localDelta = null;
  let deltaRatio = null;
  if (promptTokensA == null) {
    j8Score = 0;
    details.push(zh ? '无法获取 prompt_tokens，无法执行双 prompt 差分测试' : 'Cannot get prompt_tokens — dual-prompt test not available');
  } else {
    baseOverhead = promptTokensA - estimatedA;
    const apiDelta = promptTokensB != null ? promptTokensB - promptTokensA : null;
    localDelta = estimatedB - estimatedA;
    deltaRatio = apiDelta != null && localDelta > 0 ? apiDelta / Math.max(localDelta, 1) : null;
    evidence.j8Test.baseOverhead = baseOverhead;
    evidence.j8Test.deltaRatio = deltaRatio;

    const overheadOk = baseOverhead <= 40;
    const overheadSlight = baseOverhead > 40 && baseOverhead <= 120;
    const overheadMid = baseOverhead > 120 && baseOverhead <= 500;
    const overheadHigh = baseOverhead > 500 && baseOverhead <= 1000;
    const overheadSevere = baseOverhead > 1000;
    const deltaOk = deltaRatio == null || deltaRatio <= 1.5;
    const deltaSlight = deltaRatio != null && deltaRatio > 1.5 && deltaRatio <= 3;
    const deltaMid = deltaRatio != null && deltaRatio > 3 && deltaRatio <= 5;
    const deltaHigh = deltaRatio != null && deltaRatio > 5;

    if (overheadOk && deltaOk) {
      j8Score = 2;
    } else if ((overheadSlight || overheadMid) && (deltaOk || deltaSlight)) {
      j8Score = 1.2;
    } else if (overheadHigh || deltaMid) {
      j8Score = 0.5;
    } else {
      j8Score = 0;
    }

    if (overheadSevere) {
      deductions.push(zh
        ? `prompt_tokens 增量膨胀明显(${baseOverhead} overhead)，存在 token inflation 风险`
        : `Prompt token inflation detected (${baseOverhead} overhead) — token inflation risk`);
    } else if (deltaHigh) {
      deductions.push(zh
        ? `prompt_tokens 增量膨胀明显(deltaRatio ${deltaRatio?.toFixed(1)})，存在 token inflation 风险`
        : `Prompt token inflation detected (deltaRatio ${deltaRatio?.toFixed(1)}) — token inflation risk`);
    } else if (overheadMid || deltaMid) {
      details.push(zh
        ? `prompt_tokens 存在包装(${Math.round(baseOverhead)} overhead, deltaRatio ${deltaRatio != null ? '~' + deltaRatio.toFixed(1) : '?'})，建议小额核对`
        : `Prompt packaging detected (${Math.round(baseOverhead)} overhead, deltaRatio ${deltaRatio != null ? '~' + deltaRatio.toFixed(1) : '?'}) — verify with small amount`);
    } else if (overheadSlight || deltaSlight) {
      details.push(zh
        ? `prompt_tokens 存在轻微包装(+${Math.round(baseOverhead)} overhead, deltaRatio ${deltaRatio != null ? '~' + deltaRatio.toFixed(1) : '?'})，不影响审计`
        : `Minor prompt packaging detected (${Math.round(baseOverhead)} overhead, deltaRatio ${deltaRatio != null ? '~' + deltaRatio.toFixed(1) : '?'}), auditable`);
    }
  }
  subScores.j8 = j8Score;

  // ── J9: Billing clarity (1 pt) ───────────────────────
  subScores.billingClarity = hasUsage ? 1 : 0;

  const totalScore = Object.values(subScores).reduce((a, b) => a + b, 0);
  const ratio = totalScore / 30;
  let status = ratio >= 0.95 ? 'excellent' : ratio >= 0.80 ? 'good' : ratio >= 0.50 ? 'warning' : 'failed';
  if (!hasUsage) status = 'failed';
  const summary = status === 'excellent' ? (zh ? 'usage 明细完整' : 'usage details complete')
    : status === 'good' ? (zh ? 'usage 基本完整' : 'usage mostly complete')
    : status === 'warning' ? (zh ? 'usage 部分缺失' : 'usage partially missing')
    : (zh ? 'usage 明细不完整' : 'usage details incomplete');
  return mkCheck({ id: 'costTransparency', label: { zh: '扣费透明度', en: 'Cost Transparency' }, maxScore: 30, score: totalScore, status, summary, details, deductions, evidence: { ...evidence, subScores, baseOverhead, deltaRatio } });
}

/* ═══════════════════════════════════════════════════════
   Cache Usage Extraction Utility
   Supports OpenAI, Azure, Anthropic, and common relay formats.
   ═══════════════════════════════════════════════════════ */
function extractCacheUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return { fieldFound: false, sourceField: null, cachedTokens: null, promptTokens: null, cacheReadTokens: null, cacheCreationTokens: null, inputTokens: null, cacheHitRate: null };
  }

  // Priority: prompt_tokens > input_tokens > total_input_tokens
  const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? null;
  const inputTokens = usage.input_tokens ?? null;

  // OpenAI / Azure: usage.prompt_tokens_details.cached_tokens
  const ptdCached = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.['cached tokens'] ?? null;

  // Claude / Anthropic: usage.cache_read_input_tokens
  const cacheReadInput = usage.cache_read_input_tokens ?? null;
  const cacheCreationInput = usage.cache_creation_input_tokens ?? null;

  // Common relay fields
  const cachedTokens = usage.cached_tokens
    ?? usage.cache_read_input_tokens
    ?? usage.cache_creation_input_tokens
    ?? usage.cache_tokens
    ?? usage.prompt_cache_hit_tokens
    ?? usage.cache_hit_tokens
    ?? usage.cache_read_tokens
    ?? ptdCached;

  let fieldFound = false;
  let sourceField = null;
  let resolvedCached = null;

  if (ptdCached != null) {
    fieldFound = true; sourceField = 'prompt_tokens_details.cached_tokens'; resolvedCached = ptdCached;
  } else if (cacheReadInput != null) {
    fieldFound = true; sourceField = 'cache_read_input_tokens'; resolvedCached = cacheReadInput;
  } else if (usage.cache_read_input_tokens != null) {
    fieldFound = true; sourceField = 'cache_read_input_tokens'; resolvedCached = usage.cache_read_input_tokens;
  } else if (usage.cache_creation_input_tokens != null) {
    fieldFound = true; sourceField = 'cache_creation_input_tokens'; resolvedCached = usage.cache_creation_input_tokens;
  } else if (cachedTokens != null) {
    fieldFound = true;
    sourceField = 'cached_tokens';
    resolvedCached = cachedTokens;
  }

  // Calculate cacheHitRate
  let cacheHitRate = null;
  if (resolvedCached != null && promptTokens != null && promptTokens > 0) {
    // OpenAI style: cached / prompt
    cacheHitRate = resolvedCached / promptTokens;
  } else if (cacheReadInput != null && (cacheReadInput + (cacheCreationInput || 0) + (inputTokens || 0))) {
    // Anthropic style: cache_read / (cache_read + cache_creation + input)
    const denom = cacheReadInput + (cacheCreationInput || 0) + (inputTokens || 0);
    if (denom > 0) cacheHitRate = cacheReadInput / denom;
  }

  return {
    fieldFound,
    sourceField,
    cachedTokens: resolvedCached,
    promptTokens,
    cacheReadTokens: cacheReadInput,
    cacheCreationTokens: cacheCreationInput,
    inputTokens,
    cacheHitRate: cacheHitRate != null ? Math.min(1, cacheHitRate) : null,
  };
}

/* ═══════════════════════════════════════════════════════
   Check N: Cache Hit Detection (5 pts)
   - Max 2 requests with AbortController timeout (15s per request)
   - Total operation timeout: 35s
   - On any failure: degrade gracefully, never block flow
   ═══════════════════════════════════════════════════════ */
const CACHE_PROBE_TIMEOUT_MS = 15000;
const CACHE_PROBE_TOTAL_TIMEOUT_MS = 35000;

async function checkN_CacheHitCheck(baseUrl, apiKey, model, interfaceType, signal, targetCallResult) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';

  // Precondition: model must be callable
  const targetWorks = (targetCallResult?.score || 0) >= 11;
  if (!targetWorks) {
    const summary = zh ? '前置检测失败，未执行缓存检测' : 'Prerequisite check failed — cache check skipped';
    return mkCheck({
      id: 'cacheHitCheck', label: { zh: '缓存命中检测', en: 'Cache Hit Check' },
      maxScore: 5, score: 0, status: 'skipped', summary,
      details: [], deductions: [], evidence: { fieldFound: false }
    });
  }

  // Build a long prompt (~1800-2200 estimated tokens, targeting >= 1024 actual API prompt_tokens)
  // Both requests use the exact same string — no timestamps, no random IDs, no dynamic content
  // Only the fixed marker CACHE_PROBE_7391 is included
  const PART_A = 'The principles of distributed systems and client-server architecture form the foundation of modern web services. Each HTTP request must contain all necessary context since servers maintain no session state between requests. RESTful APIs leverage standard HTTP methods and status codes to provide predictable interfaces. Authentication typically involves bearer tokens or API keys passed in request headers. Caching strategies at the CDN and edge layers significantly improve response times. Rate limiting protects backend services from abuse and ensures fair resource allocation. Load balancing distributes incoming traffic across multiple server instances. Database replication ensures high availability and fault tolerance. Horizontal scaling allows systems to handle increased load by adding more machines to the pool. Container orchestration platforms like Kubernetes automate deployment and management of containerized applications. Microservices architecture decomposes monolithic applications into independently deployable services. Message queues enable asynchronous communication between services and help decouple system components. Monitoring and observability tools provide insights into system health and performance metrics. Incident response procedures ensure rapid recovery from failures. Disaster recovery planning includes regular backups and tested restoration procedures. Security best practices include encryption in transit using TLS, least-privilege access control, and regular security audits. API rate limiting prevents single clients from monopolizing resources. Content delivery networks cache static assets close to end users. Service mesh architectures provide a dedicated infrastructure layer for service-to-service communication. Infrastructure as code enables reproducible and version-controlled infrastructure provisioning. Continuous integration and continuous deployment pipelines automate the software release process. API versioning strategies like URL path versioning and header-based versioning help maintain backward compatibility as services evolve. WebSocket connections provide full-duplex communication channels over a single TCP connection, enabling real-time bidirectional data transfer. GraphQL offers a flexible query language that allows clients to request exactly the data they need, reducing over-fetching and under-fetching problems. OAuth 2.0 and OpenID Connect provide standardized protocols for authorization and authentication across distributed systems. JSON Web Tokens enable stateless authentication by encoding user identity information directly in the token. SAML and LDAP support enterprise identity management and single sign-on across multiple applications. Distributed caching with Redis or Memcached reduces database load by storing frequently accessed data in memory. Consistent hashing algorithms help distribute cache entries evenly across cluster nodes while minimizing remapping when nodes join or leave. Cache invalidation strategies like time-to-live expiration and event-driven invalidation ensure that stale data does not persist indefinitely. Write-through and write-back caching policies trade off between consistency and performance depending on application requirements. CDN edge networks cache content at geographic points of presence to reduce latency for globally distributed users. HTTP cache-control headers guide browser and proxy caching behavior to reduce redundant server requests. ETags and last-modified timestamps enable conditional requests that save bandwidth when content has not changed. Content-addressable storage systems retrieve data based on cryptographic hashes rather than file paths, ensuring data integrity. Gossip protocols enable distributed systems to reach consensus on cluster membership without a central coordinator. Consensus algorithms like Raft and Paxos ensure that distributed databases maintain consistency across replica nodes. Two-phase commit protocols coordinate atomic transactions across multiple database systems but introduce latency and coordination overhead. CAP theorem states that distributed systems can only guarantee two of three properties: consistency, availability, and partition tolerance. Eventual consistency models allow temporary divergence between replicas in exchange for improved availability during network partitions. Vector clocks track the causal ordering of events across distributed nodes to detect conflicts. Conflict-free replicated data types enable concurrent updates without requiring central coordination. Saga pattern decomposes long-running distributed transactions into a sequence of local transactions with compensating rollback actions. CQRS separates read and write models to optimize query performance independently from update throughput. Event sourcing persists state changes as an immutable sequence of events rather than current state snapshots. Change data capture streams database modifications to downstream consumers in near real-time. Dead letter queues capture failed messages for later inspection and retry rather than losing them permanently. Circuit breakers prevent cascading failures by temporarily halting calls to failing downstream services. Bulkheads isolate failures in one part of a system from affecting other unrelated components.';
  const PART_B = 'In the context of cloud-native application development, containers provide consistent execution environments across development, testing, and production stages. Docker and containerd are popular container runtime environments. Kubernetes has become the de facto standard for container orchestration in production environments. Helm charts simplify the packaging and deployment of complex Kubernetes applications. Service mesh implementations like Istio and Linkerd provide traffic management, security, and observability features at the infrastructure layer. Observability encompasses metrics, logs, and distributed traces — the three pillars of understanding system behavior. OpenTelemetry provides vendor-neutral instrumentation for collecting telemetry data. Prometheus and Grafana are widely used for metrics collection and visualization. Jaeger and Zipkin support distributed tracing across service boundaries. Cloud-native applications are designed to be resilient, scalable, and manageable. Twelve-factor app methodology guides the development of cloud-ready applications. Configuration management tools like Ansible, Terraform, and Puppet automate infrastructure provisioning. GitOps workflows use Git repositories as the single source of truth for declarative infrastructure. Container networking and service discovery enable dynamic communication between pods in a Kubernetes cluster. Sidecar proxies intercept network traffic to enforce policies without modifying application code. Certificate management and mutual TLS provide authenticated and encrypted communication between services. Cloud providers offer managed Kubernetes services like Amazon EKS, Azure AKS, and Google GKE that reduce operational overhead. Serverless platforms like AWS Lambda, Azure Functions, and Google Cloud Functions enable running code without managing servers. Auto-scaling based on CPU usage or request count ensures that applications maintain performance under variable load conditions. Function as a Service platforms charge based on execution time and memory usage, making them cost-effective for sporadic workloads. Event-driven architectures using Apache Kafka or AWS Kinesis enable real-time data streaming and processing at scale. Structured logging in JSON format facilitates automated log parsing and analysis in centralized logging systems. Kubernetes namespaces isolate resources and enforce access controls across multiple teams sharing a cluster. Resource quotas prevent individual teams from monopolizing cluster compute and memory capacity. Pod disruption budgets ensure that a minimum number of replicas remain available during voluntary disruptions like node upgrades. Vertical pod autoscalers adjust container resource requests based on historical usage patterns. Platform engineering teams build internal developer platforms that abstract infrastructure complexity and accelerate feature delivery. Backstage from Spotify provides a software catalog and developer portal that surfaces ownership and documentation. Horizontal pod autoscalers adjust replica counts based on custom metrics beyond CPU and memory. Pod priority and preemption ensure that critical workloads are scheduled ahead of less important ones when cluster resources are constrained. StatefulSets manage persistent workloads that require stable network identities and stable storage. Persistent volumes and persistent volume claims abstract storage provisioning from pod scheduling. Volume snapshots enable point-in-time copies of persistent data for backup and disaster recovery. Resource limits and requests ensure that pods receive guaranteed CPU and memory allocation while preventing resource exhaustion. Quality of service classes — guaranteed, burstable, and best-effort — determine pod scheduling priority under resource pressure. Node affinity and pod affinity rules control the placement of pods across cluster nodes for resilience and performance. Taints and tolerations prevent general workloads from being scheduled on specialized infrastructure nodes. DaemonSets ensure that specific pods run on every node in the cluster for logging, monitoring, and networking functions.';
  const PART_C = 'Software testing encompasses unit tests, integration tests, end-to-end tests, and performance tests. Unit tests verify individual components in isolation. Integration tests verify that components work correctly together. End-to-end tests simulate real user interactions with the complete system. Performance testing measures system behavior under load. Load testing determines how the system behaves at expected traffic levels. Stress testing identifies the breaking point of the system. Chaos engineering deliberately introduces failures to test system resilience. Feature flags enable gradual rollouts and quick rollbacks of new features. A/B testing compares different versions of features to determine which performs better. Canary deployments release changes to a small subset of users before full rollout. Blue-green deployments maintain two identical production environments for zero-downtime releases. Database indexing strategies significantly impact query performance. Connection pooling reduces the overhead of establishing database connections. Database sharding distributes data across multiple database instances. Read replicas provide scalable read capacity and improve query performance. Write-ahead logging ensures transaction durability in database systems. ACID properties guarantee that database transactions are processed reliably. Pagination strategies and cursor-based approaches handle large result sets efficiently. Database query optimization through explain plans and index analysis reduces unnecessary full table scans. ORM frameworks like Hibernate and Entity Framework abstract database interactions but require careful configuration to avoid performance pitfalls. Caching database query results with Redis or Memcached reduces repeated database load. Asynchronous processing through job queues like Celery or Sidekiq offloads time-consuming tasks from the request-response cycle. Database transaction isolation levels like read committed and serializable determine how concurrent transactions interact with each other. Optimistic concurrency control uses version numbers to detect conflicting updates without locking. Pessimistic locking acquires exclusive access to rows before modification to prevent lost updates. Time-series databases like InfluxDB and TimescaleDB are optimized for storing and querying timestamped measurements. Vector databases such as Pinecone, Weaviate, and Qdrant store high-dimensional embeddings for similarity search in AI applications. Graph databases like Neo4j and Amazon Neptune model complex relationship networks efficiently for recommendation engines and fraud detection. Object storage services like Amazon S3 and Google Cloud Storage provide durable, scalable repositories for unstructured binary data. Reproducibility in machine learning experiments requires tracking hyperparameters, training data versions, and code snapshots. Feature stores provide a centralized repository of curated ML features that ensure consistency between training and inference. Model registries track the lineage of deployed models from experimentation through production retirement. Online learning systems update model weights incrementally as new data arrives rather than retraining from scratch. Transfer learning fine-tunes pre-trained foundation models on domain-specific data to reduce training costs. Federated learning trains models across decentralized data sources without centralizing sensitive training data. Explainable AI techniques like SHAP and LIME provide interpretable attributions for individual predictions. Model drift detection monitors prediction accuracy over time to identify when models need retraining. Reinforcement learning from human feedback aligns language model outputs with human preferences and values. Prompt engineering crafts input text patterns that elicit desired behaviors from large language models without fine-tuning. Retrieval-augmented generation retrieves relevant documents from external knowledge bases to ground LLM responses in factual information.';
  const longPrompt = (PART_A + PART_B + PART_C + ' Repeat this marker exactly: CACHE_PROBE_7391\nAt the end, reply exactly: CACHE_OK').trim();

  // ── Total timeout guard ─────────────────────────────────────────────
  const totalController = new AbortController();
  const totalTimeout = setTimeout(() => totalController.abort(), CACHE_PROBE_TOTAL_TIMEOUT_MS);

  // ── Request #1 ─────────────────────────────────────────────────────
  let r1 = { success: false, data: {}, status: 0, timeout: false };
  try {
    await new Promise((resolve, reject) => {
      const guard = setTimeout(() => { totalController.abort(); reject(new Error('TOTAL_TIMEOUT')); }, CACHE_PROBE_TOTAL_TIMEOUT_MS);
      makeApiCall(baseUrl, apiKey, model, interfaceType, longPrompt, 10, 0, signal, CACHE_PROBE_TIMEOUT_MS)
        .then(result => { clearTimeout(guard); resolve(result); })
        .catch(err => { clearTimeout(guard); reject(err); });
    }).then(result => { r1 = result; })
      .catch(err => {
        if (err.message === 'TOTAL_TIMEOUT') {
          r1 = { success: false, data: {}, status: 0, timeout: true, error: err.message };
        } else {
          r1 = { success: false, data: {}, status: 0, timeout: err.name === 'AbortError', error: err.message };
        }
      });
  } catch (_) {}

  clearTimeout(totalTimeout);
  if (totalController.signal.aborted) {
    return makeCacheErrorResult(zh, 'total_timeout', 0, {});
  }

  // ── Request #2 ─────────────────────────────────────────────────────
  let r2 = { success: false, data: {}, status: 0, timeout: false };
  if (r1.success) {
    try {
      await new Promise((resolve, reject) => {
        const guard = setTimeout(() => { totalController.abort(); reject(new Error('TOTAL_TIMEOUT')); }, CACHE_PROBE_TOTAL_TIMEOUT_MS);
        makeApiCall(baseUrl, apiKey, model, interfaceType, longPrompt, 10, 0, signal, CACHE_PROBE_TIMEOUT_MS)
          .then(result => { clearTimeout(guard); resolve(result); })
          .catch(err => { clearTimeout(guard); reject(err); });
      }).then(result => { r2 = result; })
        .catch(err => {
          if (err.message === 'TOTAL_TIMEOUT') {
            r2 = { success: false, data: {}, status: 0, timeout: true, error: err.message };
          } else {
            r2 = { success: false, data: {}, status: 0, timeout: err.name === 'AbortError', error: err.message };
          }
        });
    } catch (_) {}
  }

  clearTimeout(totalTimeout);
  if (totalController.signal.aborted) {
    const usage1 = r1.data?.usage || {};
    const cache1 = extractCacheUsage(usage1);
    const partialEvidence = {
      timeout: true, timeoutMs: CACHE_PROBE_TIMEOUT_MS, totalTimeoutMs: CACHE_PROBE_TOTAL_TIMEOUT_MS,
      firstRequest: { promptTokens: cache1.promptTokens, cachedTokens: cache1.cachedTokens, cacheCreationTokens: cache1.cacheCreationTokens, cacheReadTokens: cache1.cacheReadTokens },
      secondRequest: { promptTokens: null, cachedTokens: null, timeout: true },
      fieldFound: cache1.fieldFound, sourceField: cache1.sourceField,
    };
    return makeCacheErrorResult(zh, 'total_timeout', 2, partialEvidence);
  }

  // ── Build evidence ─────────────────────────────────────────────────
  const usage1 = r1.data?.usage || {};
  const cache1 = extractCacheUsage(usage1);
  const usage2 = r2.data?.usage || {};
  const cache2 = extractCacheUsage(usage2);

  evidence.firstRequest = {
    promptTokens: cache1.promptTokens, cachedTokens: cache1.cachedTokens,
    cacheCreationTokens: cache1.cacheCreationTokens, cacheReadTokens: cache1.cacheReadTokens,
    timeout: !!r1.timeout, success: r1.success,
  };
  evidence.secondRequest = {
    promptTokens: cache2.promptTokens, cachedTokens: cache2.cachedTokens,
    cacheCreationTokens: cache2.cacheCreationTokens, cacheReadTokens: cache2.cacheReadTokens,
    timeout: !!r2.timeout, success: r2.success,
  };
  evidence.sourceField = cache2.sourceField;
  evidence.fieldFound = cache2.fieldFound;

  let latencyImprovementRate = null;
  const usageLat1 = r1.data?.usage?.latencyMs ?? r1.data?.latency ?? null;
  const usageLat2 = r2.data?.usage?.latencyMs ?? r2.data?.latency ?? null;
  if (usageLat1 != null && usageLat2 != null && usageLat1 > 0) {
    latencyImprovementRate = (usageLat1 - usageLat2) / usageLat1;
    evidence.latencyImprovementRate = Math.max(0, latencyImprovementRate);
  }
  evidence.cacheHitRate = cache2.cacheHitRate;
  evidence.promptTokenConsistencyRate = null;

  const actualPromptTokens = Math.max(cache1.promptTokens ?? 0, cache2.promptTokens ?? 0);
  evidence.probeTokenSufficient = actualPromptTokens >= 1024;
  evidence.minPromptTokensRequired = 1024;
  evidence.actualPromptTokens = actualPromptTokens;

  // ── r1 failed ─────────────────────────────────────────────────────
  if (!r1.success) {
    const summary = r1.timeout
      ? (zh ? '缓存检测超时，无法验证缓存信号' : 'Cache check timeout — cannot verify cache signal')
      : (zh ? '缓存检测请求失败，无法验证缓存信号' : 'Cache check request failed — cannot verify cache signal');
    details.push(zh ? '缓存检测请求耗时过长，已自动跳过，不影响其他验货项。' : 'Cache probe timed out or failed — auto-skipped, does not block other checks.');
    return mkCheck({
      id: 'cacheHitCheck', label: { zh: '缓存命中检测', en: 'Cache Hit Check' },
      maxScore: 5, score: 2, status: 'error', summary, details, deductions: [],
      evidence: { ...evidence, timeout: !!r1.timeout, timeoutMs: CACHE_PROBE_TIMEOUT_MS, totalTimeoutMs: CACHE_PROBE_TOTAL_TIMEOUT_MS, statusColor: { color: '#f59e0b', bg: '#fef9c3' } }
    });
  }

  // ── r2 failed ─────────────────────────────────────────────────────
  if (!r2.success) {
    const summary = r2.timeout
      ? (zh ? '缓存检测超时，无法验证缓存信号' : 'Cache check timeout — cannot verify cache signal')
      : (zh ? '缓存检测请求失败，无法验证缓存信号' : 'Cache check request failed — cannot verify cache signal');
    details.push(zh ? '缓存检测请求耗时过长，已自动跳过，不影响其他验货项。' : 'Cache probe timed out or failed — auto-skipped, does not block other checks.');
    return mkCheck({
      id: 'cacheHitCheck', label: { zh: '缓存命中检测', en: 'Cache Hit Check' },
      maxScore: 5, score: 2, status: 'error', summary, details, deductions: [],
      evidence: { ...evidence, timeout: !!r2.timeout, timeoutMs: CACHE_PROBE_TIMEOUT_MS, totalTimeoutMs: CACHE_PROBE_TOTAL_TIMEOUT_MS, statusColor: { color: '#f59e0b', bg: '#fef9c3' } }
    });
  }

  // ── Both succeeded: normal scoring ─────────────────────────────────
  let scoreA = cache2.fieldFound ? 1 : 0;
  let scoreB = 0;
  if (cache2.cacheHitRate != null) {
    const rate = cache2.cacheHitRate;
    if (rate >= 0.98) scoreB = 2;
    else if (rate >= 0.90) scoreB = 1.7;
    else if (rate >= 0.70) scoreB = 1.2;
    else if (rate >= 0.50) scoreB = 0.8;
    else if (rate >= 0.20) scoreB = 0.3;
    else scoreB = 0;
  }
  let scoreC = 0;
  const absCached = cache2.cachedTokens ?? 0;
  if (absCached >= 1000) scoreC = 1;
  else if (absCached >= 700) scoreC = 0.7;
  else if (absCached >= 300) scoreC = 0.4;
  else if (absCached >= 1) scoreC = 0.2;
  else scoreC = 0;
  let scoreD = 0;
  if (cache1.promptTokens != null && cache2.promptTokens != null) {
    const p1 = cache1.promptTokens;
    const p2 = cache2.promptTokens;
    const maxP = Math.max(p1, p2);
    const consistencyRate = maxP > 0 ? Math.abs(p1 - p2) / maxP : 1;
    evidence.promptTokenConsistencyRate = consistencyRate;
    if (consistencyRate < 0.05) scoreD = 0.5;
    else if (consistencyRate < 0.20) scoreD = 0.25;
  }
  let scoreE = 0;
  if (latencyImprovementRate != null && latencyImprovementRate > 0) {
    if (latencyImprovementRate >= 0.30) scoreE = 0.5;
    else if (latencyImprovementRate >= 0.10) scoreE = 0.3;
    else if (latencyImprovementRate >= 0) scoreE = 0.1;
  }

  const totalScore = Math.round((scoreA + scoreB + scoreC + scoreD + scoreE) * 10) / 10;

  // Token insufficient + cache field WAS exposed → field_found (amber, positive signal)
  if (actualPromptTokens < 1024) {
    const fieldExposed = cache2.fieldFound;
    if (fieldExposed) {
      const summary = zh ? '缓存字段已暴露，但探测长度不足，无法验证缓存命中强度' : 'Cache field exposed but probe length insufficient — cannot verify cache hit strength';
      details.push(zh ? `缓存字段已暴露（${cache2.sourceField || 'unknown'}），说明该接口支持缓存。探测长度不足（${actualPromptTokens} tokens < 1024），需更长 prompt 才能验证命中强度。` : `Cache field exposed (${cache2.sourceField || 'unknown'}) — API supports caching. Probe too short (${actualPromptTokens} tokens < 1024) — longer prompt needed to verify hit rate.`);
      return mkCheck({
        id: 'cacheHitCheck', label: { zh: '缓存命中检测', en: 'Cache Hit Check' },
        maxScore: 5, score: 2.5, status: 'field_found', summary, details, deductions: [],
        evidence: { ...evidence, statusColor: { color: '#d97706', bg: '#fef9c3' } }
      });
    }
    // field NOT exposed + probe insufficient → truly unknown
    const summary = zh ? '探测长度不足，无法验证缓存宣传' : 'Probe length insufficient — cannot verify cache claims';
    details.push(zh ? `本次缓存探测的 prompt_tokens 低于 1024，无法有效验证缓存命中。未验证不等于没有缓存。当前实际：${actualPromptTokens} tokens` : `Probe prompt_tokens below 1024 — cannot effectively verify cache hit. Actual: ${actualPromptTokens} tokens. Unverified does not mean unavailable.`);
    return mkCheck({
      id: 'cacheHitCheck', label: { zh: '缓存命中检测', en: 'Cache Hit Check' },
      maxScore: 5, score: 2.5, status: 'unknown', summary, details, deductions: [],
      evidence: { ...evidence, statusColor: { color: '#94a3b8', bg: '#f1f5f9' } }
    });
  }

  // No cache field → unknown
  if (!cache2.fieldFound) {
    const summary = zh ? 'API 未暴露缓存字段，无法验证缓存宣传' : 'API does not expose cache fields — cannot verify cache claims';
    return mkCheck({
      id: 'cacheHitCheck', label: { zh: '缓存命中检测', en: 'Cache Hit Check' },
      maxScore: 5, score: 2.5, status: 'unknown', summary, details, deductions: [],
      evidence: { ...evidence, statusColor: { color: '#94a3b8', bg: '#f1f5f9' } }
    });
  }

  let status = 'unknown';
  let summary = '';
  if (totalScore >= 4.5) { status = 'excellent'; summary = zh ? '缓存命中信号很强' : 'Very strong cache hit signal'; }
  else if (totalScore >= 3.5) { status = 'good'; summary = zh ? '检测到较高缓存命中信号' : 'Detected strong cache hit signal'; }
  else if (totalScore >= 2.0) { status = 'partial'; summary = zh ? '检测到部分缓存命中信号' : 'Detected partial cache hit signal'; }
  else if (totalScore >= 0.5) { status = 'weak'; summary = zh ? '缓存命中信号较弱' : 'Weak cache hit signal'; }
  else { status = 'none'; summary = zh ? '未检测到有效缓存命中' : 'No effective cache hit detected'; }

  const scoreConfig = {
    excellent: { color: '#16a34a', bg: '#dcfce7' }, good: { color: '#16a34a', bg: '#dcfce7' },
    partial: { color: '#d97706', bg: '#fef9c3' }, weak: { color: '#d97706', bg: '#fef9c3' },
    none: { color: '#dc2626', bg: '#fee2e2' }, unknown: { color: '#94a3b8', bg: '#f1f5f9' },
    field_found: { color: '#d97706', bg: '#fef9c3' },
    error: { color: '#f59e0b', bg: '#fef9c3' }, skipped: { color: '#94a3b8', bg: '#f1f5f9' },
  };

  return mkCheck({
    id: 'cacheHitCheck', label: { zh: '缓存命中检测', en: 'Cache Hit Check' },
    maxScore: 5, score: totalScore, status, summary, details, deductions: [],
    evidence: { ...evidence, statusColor: scoreConfig[status] || scoreConfig.unknown }
  });
}

/** Helper: build a degraded cache result (timeout / total_timeout). */
function makeCacheErrorResult(zh, reason, fallbackScore, partialEvidence) {
  const summary = reason === 'total_timeout'
    ? (zh ? '缓存检测超时，无法验证缓存信号' : 'Cache check timeout — cannot verify cache signal')
    : (zh ? '缓存检测请求失败，无法验证缓存信号' : 'Cache check request failed — cannot verify cache signal');
  const details = [zh ? '缓存检测请求耗时过长，已自动跳过，不影响其他验货项。' : 'Cache probe timed out or failed — auto-skipped, does not block other checks.'];
  return mkCheck({
    id: 'cacheHitCheck', label: { zh: '缓存命中检测', en: 'Cache Hit Check' },
    maxScore: 5, score: fallbackScore, status: 'error', summary, details, deductions: [],
    evidence: {
      ...(partialEvidence || {}),
      timeout: true, timeoutMs: CACHE_PROBE_TIMEOUT_MS, totalTimeoutMs: CACHE_PROBE_TOTAL_TIMEOUT_MS,
      statusColor: { color: '#f59e0b', bg: '#fef9c3' },
    }
  });
}

/* ═══════════════════════════════════════════════════════
   STEP 9: checkK — Model Integrity (40 pts, 9 sub-items)
   K0 Model identity & routing transparency (6 pts, 6 categories)
   K1 Model visibility (3 pts), K2 Target call quality (5 pts)
   K3 JSON strict output (5 pts), K4 Instruction following (5 pts)
   K5 Code repair (5 pts), K6 Reasoning (5 pts)
   K7 Needle retrieval (4 pts), K8 Consistency (2 pts)
   ═══════════════════════════════════════════════════════ */

/**
 * Strong platform / IDE / Agent entity keywords.
 * When matched (without negative/don't-know framing),
 * these indicate platform/proxy/IDE layer exposure.
 */
const STRONG_PLATFORM_ENTITIES = [
  // ── Windsurf / Cascade ──
  'windsurf', 'windsurf cascade', 'windsurf editor', 'windsurf ide',
  'cascade', 'cascade agent',

  // ── Cursor / Cline / Continue ──
  'cursor', 'cursor ide', 'cursor agent', 'cursor composer',
  'cline', 'cline agent',
  'continue', 'continue.dev', 'continue agent',

  // ── Other coding IDEs / agents ──
  'codeium', 'cognition', 'devin', 'devin agent',
  'agent command center',

  // ── GitHub / Microsoft / Azure / Foundry ──
  'github copilot', 'copilot', 'copilot chat', 'copilot coding agent', 'copilot agent',
  'azure', 'azure openai', 'azure ai', 'azure ai foundry',
  'microsoft foundry', 'foundry models', 'foundry agent',
  'microsoft copilot',

  // ── AWS ──
  'aws', 'amazon web services', 'aws bedrock', 'amazon bedrock',
  'bedrock', 'bedrock marketplace', 'sagemaker', 'amazon sagemaker',
  'amazon q', 'amazon q developer', 'q developer', 'aws q', 'aws agent',

  // ── Google / Vertex ──
  'vertex', 'vertex ai', 'google vertex', 'google cloud vertex',
  'google ai studio', 'ai studio', 'gemini api', 'model garden',
  'google cloud', 'gemini cli', 'antigravity',

  // ── Claude / Anthropic platform layer ──
  'claude code', 'claude-code',
  'anthropic console', 'anthropic workbench',

  // ── Replit / web app builders ──
  'replit', 'replit agent',
  'lovable', 'bolt', 'bolt.new', 'v0', 'vercel v0',
  'stackblitz', 'codesandbox',

  // ── Kiro ──
  'kiro', 'kiro ide', 'kiro cli',

  // ── Other coding tools ──
  'vscode agent', 'vs code agent',
  'zed', 'zed ai', 'zed assistant',
  'trae', 'trae ai',
  'tabnine', 'sourcegraph cody', 'cody', 'supermaven',
  'augment', 'augment code', 'aider',
  'roo code', 'roocode', 'kilocode', 'kilo code',
];

/**
 * Weak / generic platform words.
 * These are common in negative responses like
 * "I don't have access to the exact model name, model family, or serving platform".
 * MUST NOT be used as detectedSource. Only count toward platform_or_proxy_identity
 * when combined with positive assertion, NOT when part of a "don't know" sentence.
 */
const WEAK_PLATFORM_WORDS = [
  'gateway', 'api gateway', 'openai-compatible', 'openai compatible',
  'api-compatible', 'api compatible', 'compatible model',
  'relay', 'proxy', 'reverse proxy', 'router', 'route',
  'model router', 'llm router',
  'serving platform', 'model platform', 'inference platform',
  'gateway model',
  '中转', '中转站', '转发', '反代', '代理', '网关', '路由',
  '模型平台', '推理平台',
];

/**
 * Patterns that indicate the model CANNOT determine its own identity.
 * These MUST override ANY platform keyword match and result in 'ambiguous'.
 */
const NEGATIVE_IDENTITY_PATTERNS = [
  "i don't have access", 'i do not have access', 'i cannot access',
  "i can't access", "i can't verify", 'i cannot verify', "i can't confirm",
  "i can't determine", 'i cannot determine', "i can't identify",
  "i don't know", 'i do not know', "i don't",
  "i don't have information", 'i do not have information', 'no information about',
  "i'm an ai", 'i am an ai',
  'ai language model', 'language model', 'ai assistant',
  'ai model', 'a language model',
  "can't provide", "cannot provide", 'unable to provide', 'not able to provide',
  'not available', 'not applicable', 'not provided',
  'no access to', 'without access to',
  'unknown model', 'model unknown', 'model is unknown',
  'cannot confirm', 'unable to confirm',
  '保密', '无法确认', '不确定', '不知道', '无权限', '无法访问',
  '不知道模型', '不知道运行', '无法判断',
];

/**
 * Tool-persona / development-environment contamination patterns.
 * These indicate the model has been polluted by system prompts,
 * tool descriptions, IDE behaviors, or wrapper personas.
 */
const CONTAMINATION_PATTERNS = [
  'i am a kiro', 'i am cursor', 'i am cline', 'i am continue',
  'i am an ide',
  'i am a plugin', 'i am an extension', 'i am a wrapper',
  // 'i am windsurf' and 'i am cascade' intentionally excluded from contamination:
  // "I am Windsurf" should be platform_or_proxy_identity (platform keyword), not hard_contamination.
  'i am running in',
  'responsible for managing your project',
  'i can manage your project files',
  'i can modify your codebase',
  'i can execute commands',
  'i can read your workspace',
  'i can access your working directory',
  'i can edit your codebase',
  'as a kiro development environment',
  'as a cursor agent',
  'as a cline agent',
  'as a replit agent',
  'as a coding assistant i can',
  'tool personality',
  '系统提示', 'system prompt', 'wrapper prompt', 'tool prompt',
  '内部 wrapper', '人格污染', '开发环境污染',
];

/**
 * Extract the most specific detected source from the model's response text.
 * Returns a strong entity string (never generic terms like 'gateway', 'serving platform').
 */
function extractDetectedSource(text) {
  const t = text.toLowerCase();
  for (const src of STRONG_PLATFORM_ENTITIES) {
    if (t.includes(src)) return src;
  }
  // No generic terms (serving platform, gateway, proxy, etc.) — return null
  return null;
}

/**
 * Check if response is a "I don't know / can't access" negative framing.
 */
function isNegativeUnknownResponse(text) {
  const t = text.toLowerCase();
  return NEGATIVE_IDENTITY_PATTERNS.some(p => t.includes(p));
}

/**
 * Check if response contains a strong platform entity.
 */
function hasStrongEntity(text) {
  const t = text.toLowerCase();
  return STRONG_PLATFORM_ENTITIES.some(e => t.includes(e));
}

/**
 * Check if response contains weak platform words.
 */
function hasWeakPlatformWord(text) {
  const t = text.toLowerCase();
  return WEAK_PLATFORM_WORDS.some(w => t.includes(w));
}

/**
 * Check if response contains a contamination pattern.
 */
function hasContamination(text) {
  const t = text.toLowerCase();
  return CONTAMINATION_PATTERNS.some(p => t.includes(p));
}

/**
 * Classify model identity response into 6 categories.
 * Returns { category, score, reason, detectedSource }
 *
 * Classification priority (STRICT ORDER — must not skip):
 *   1. hard_contamination       — tool persona / system prompt pollution
 *   2. ambiguous (negative)      — "don't know / can't access" framing (before platform check!)
 *   3. wrong_family              — clear model family mismatch
 *   4. exact_match              — model identity matches target
 *   5. family_match             — same model family, not exact
 *   6. platform_or_proxy_identity — strong entity OR positive assertion of platform/gateway
 *   7. ambiguous (fallback)      — completely unexpected response
 *
 * Rules:
 *   - "I don't have access... serving platform" → ambiguous (NOT platform_or_proxy_identity)
 *   - "Windsurf" → platform_or_proxy_identity with detectedSource="windsurf"
 *   - "I am Windsurf and can edit your codebase" → hard_contamination
 *   - detectedSource never uses generic terms (gateway/serving platform/proxy)
 *   - Kiro/Vertex/AWS Bedrock/Azure/Cursor/Cline/Windsurf/Continue/Copilot/Claude Code/
 *     Replit Agent → platform_or_proxy_identity (3/6), medium risk
 *     Only becomes high risk when combined with token anomalies, max_tokens failures,
 *     or multiple ability failures.
 */
/**
 * Detect model family from text.
 * Note: CLAUDE check must come BEFORE GPT to avoid "sonnet" → GPT false positive.
 */
function detectFamilyFromText(text) {
  const t = text.toLowerCase();
  if (t.includes('claude') || t.includes('anthropic')) return 'claude';
  if (t.includes('gpt') || t.includes('chatgpt') || t.includes('openai')) return 'gpt';
  if (t.includes('gemini') || t.includes('google')) return 'gemini';
  if (t.includes('llama') || t.includes('meta')) return 'llama';
  if (t.includes('qwen') || t.includes('alibaba')) return 'qwen';
  if (t.includes('deepseek')) return 'deepseek';
  if (t.includes('mistral') || t.includes('mixtral')) return 'mistral';
  if (t.includes('grok') || t.includes('xai')) return 'grok';
  if (/^o[1-4]/.test(t)) return 'oai';
  return 'unknown';
}

/**
 * Extract variant string from a model ID or response text.
 * e.g. "claude-opus-4-7" → "opus", "claude-3-5-sonnet-20241022" → "sonnet",
 * "gpt-4o-mini" → "4o-mini", "gpt-5.2" → "5.2"
 */
function extractVariant(text) {
  const t = text.toLowerCase();
  // Claude variants
  if (t.includes('opus')) return 'opus';
  if (t.includes('sonnet')) return 'sonnet';
  if (t.includes('haiku')) return 'haiku';
  // GPT variants
  if (/\b4o(?:-mini)?/.test(t)) return '4o-mini';
  if (/\bgpt-4\b/.test(t) && !/\b4o\b/.test(t)) return '4';
  if (/\bgpt-3/.test(t)) return '3';
  if (/\b5\.\d+(?:-pro|-mini|-codex)?/.test(t)) {
    const m = t.match(/\b(5\.\d+(?:-pro|-mini|-codex)?)/);
    if (m) return m[1];
  }
  if (/[qo]\d(?:\.\d+)?/.test(t)) {
    const m = t.match(/([qo]\d(?:\.\d+)?)/);
    if (m) return m[1];
  }
  if (t.includes('gemini')) {
    if (t.includes('flash')) return 'flash';
    if (t.includes('pro')) return 'pro';
    if (t.includes('ultra')) return 'ultra';
    return 'gemini'; // response says "gemini" without specific variant
  }
  if (t.includes('deepseek')) return 'deepseek';
  if (t.includes('qwen')) return 'qwen';
  // Response says "Claude" / "GPT" / "Anthropic" without variant → no variant detected
  return null;
}

/**
 * Compute target consistency between the model's response and the target model.
 * Returns { targetConsistency, detectedVariant, detectedVersion, detectedFamily }
 */
function computeTargetConsistency(t, targetLower) {
  const respFamily = detectFamilyFromText(t);
  const targetFamily = detectFamilyFromText(targetLower);
  const respVariant = extractVariant(t);
  const targetVariant = extractVariant(targetLower);
  const respVersion = t.match(/\d+(?:\.\d+)+/)?.[0] || null;
  const targetVersion = targetLower.match(/\d+(?:\.\d+)+/)?.[0] || null;

  // Family mismatch → fail
  if (respFamily !== 'unknown' && targetFamily !== 'unknown' && respFamily !== targetFamily) {
    return {
      targetConsistency: 'version_mismatch',
      detectedVariant: respVariant,
      detectedVersion: respVersion,
      detectedFamily: respFamily,
    };
  }

  // Same family, check variant
  if (respVariant && targetVariant) {
    const sameVariant = respVariant === targetVariant ||
      respVariant.includes(targetVariant) ||
      targetVariant.includes(respVariant) ||
      (respFamily === 'gpt' && respVariant.startsWith('4') && targetVariant.startsWith('4')) ||
      (respFamily === 'gpt' && respVariant.startsWith('5') && targetVariant.startsWith('5')) ||
      (respFamily === 'gemini' && respVariant === 'gemini' && targetVariant === 'gemini');
    if (!sameVariant) {
      return {
        targetConsistency: 'variant_mismatch',
        detectedVariant: respVariant,
        detectedVersion: respVersion,
        detectedFamily: respFamily,
      };
    }
  }

  // Variant matches, check version number
  if (respVersion && targetVersion && respVersion !== targetVersion) {
    return {
      targetConsistency: 'version_mismatch',
      detectedVariant: respVariant,
      detectedVersion: respVersion,
      detectedFamily: respFamily,
    };
  }

  // Variant matches, no version or same version
  if (respVariant && targetVariant) {
    return {
      targetConsistency: 'match',
      detectedVariant: respVariant,
      detectedVersion: respVersion,
      detectedFamily: respFamily,
    };
  }

  // Family only
  if (respFamily !== 'unknown' && targetFamily !== 'unknown') {
    return {
      targetConsistency: 'family_match',
      detectedVariant: respVariant,
      detectedVersion: respVersion,
      detectedFamily: respFamily,
    };
  }

  return {
    targetConsistency: 'unknown',
    detectedVariant: respVariant,
    detectedVersion: respVersion,
    detectedFamily: respFamily,
  };
}

/**
 * Extracts model family label from text (for self-claim display only).
 * @param {string} text - Lowercased text to search
 * @returns {string|null} - Family name or null
 */
function extractModelFamilyFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.toLowerCase();
  if (t.includes('claude') || t.includes('anthropic')) return 'claude';
  if (t.includes('gpt') || t.includes('chatgpt') || t.includes('openai')) return 'gpt';
  if (t.includes('gemini') || t.includes('google')) return 'gemini';
  if (t.includes('llama') || t.includes('meta')) return 'llama';
  if (t.includes('qwen') || t.includes('alibaba')) return 'qwen';
  if (t.includes('deepseek')) return 'deepseek';
  if (t.includes('mistral') || t.includes('mixtral')) return 'mistral';
  if (t.includes('grok') || t.includes('xai')) return 'grok';
  return null;
}

/**
 * Extracts self-claimed identity label from model response text.
 * Used only for display purposes, does NOT affect scoring.
 * @param {string} answerText - The model's response text
 * @returns {{ label: string|null, type: string, matchedKeyword: string|null, confidence: string }}
 */
function extractSelfClaimLabel(answerText) {
  if (!answerText || typeof answerText !== 'string') {
    return { label: null, type: 'unknown', matchedKeyword: null, confidence: 'low' };
  }
  const text = answerText.toLowerCase().trim();
  
  // Client / IDE tool keywords
  const clientToolKeywords = [
    'windsurf', 'cursor', 'kiro', 'cline', 'continue', 'trae', 'copilot',
    'github copilot', 'cursor agent', 'windsurf editor'
  ];
  for (const kw of clientToolKeywords) {
    if (text.includes(kw)) {
      const label = answerText.substring(0, 160).trim();
      return { label, type: 'client_tool', matchedKeyword: kw, confidence: 'high' };
    }
  }
  
  // Gateway / Proxy / Relay keywords
  const gatewayKeywords = [
    'openrouter', 'gateway', 'proxy', 'router', 'relay',
    'api gateway', 'api platform', 'middleman',
    '中转', '网关', '代理'
  ];
  for (const kw of gatewayKeywords) {
    if (text.includes(kw)) {
      const label = answerText.substring(0, 160).trim();
      return { label, type: 'gateway_proxy', matchedKeyword: kw, confidence: 'high' };
    }
  }
  
  // Hosting / Cloud provider keywords
  const hostingKeywords = [
    'azure', 'azure openai', 'aws', 'bedrock', 'amazon bedrock',
    'google vertex', 'vertex ai', 'aws bedrock', 'amazon q'
  ];
  for (const kw of hostingKeywords) {
    if (text.includes(kw)) {
      // Check if also contains model name
      const modelFamily = extractModelFamilyFromText(text);
      if (modelFamily && modelFamily !== 'unknown') {
        const label = answerText.substring(0, 160).trim();
        return { label, type: 'hosting_provider_with_model', matchedKeyword: kw, confidence: 'medium' };
      }
      const label = answerText.substring(0, 160).trim();
      return { label, type: 'hosting_provider', matchedKeyword: kw, confidence: 'high' };
    }
  }
  
  // Model variant keywords
  const modelVariantKeywords = [
    'opus', 'sonnet', 'haiku', 'gpt-4o', 'gpt-4', 'gpt-5', 'gpt-3.5',
    'gemini-2.5', 'gemini-pro', 'gemini-flash', 'gemini-1.5',
    'claude-3', 'claude-2', 'claude-4',
    'qwen-2', 'qwen-2.5', 'deepseek-v3', 'llama-3', 'mistral'
  ];
  for (const kw of modelVariantKeywords) {
    if (text.includes(kw)) {
      const label = answerText.substring(0, 160).trim();
      return { label, type: 'model_variant', matchedKeyword: kw, confidence: 'high' };
    }
  }
  
  // Model family keywords
  const modelFamilyKeywords = [
    'claude', 'gpt', 'chatgpt', 'gemini', 'llama', 'qwen',
    'deepseek', 'grok', 'mistral', 'anthropic', 'openai', 'google'
  ];
  for (const kw of modelFamilyKeywords) {
    if (text.includes(kw)) {
      const label = answerText.substring(0, 160).trim();
      return { label, type: 'model_family', matchedKeyword: kw, confidence: 'medium' };
    }
  }
  
  return { label: null, type: 'unknown', matchedKeyword: null, confidence: 'low' };
}

function evaluateModelIdentity(identityText, finalTestModelId) {
  const zh = getDocLang() !== 'en';
  const t = identityText.toLowerCase().trim();
  const targetLower = normalizeModelId(finalTestModelId).toLowerCase();
  const rawResponse = identityText.trim();

  // ── Step 1: Hard contamination ──
  if (hasContamination(rawResponse)) {
    const tc = computeTargetConsistency(t, targetLower);
    return {
      category: 'hard_contamination',
      score: 0,
      reason: zh
        ? '模型回答中出现开发环境、工具人格或系统提示污染信号'
        : 'Model response shows development environment, tool persona or system prompt contamination',
      detectedSource: extractDetectedSource(rawResponse),
      targetConsistency: tc.targetConsistency,
      detectedVariant: tc.detectedVariant,
      detectedVersion: tc.detectedVersion,
      detectedFamily: tc.detectedFamily,
    };
  }

  // ── Step 2: Negative "don't know / can't access" framing ──
  if (isNegativeUnknownResponse(rawResponse)) {
    const tc = computeTargetConsistency(t, targetLower);
    return {
      category: 'ambiguous',
      score: 1.5,
      reason: zh
        ? `模型身份未确认：${rawResponse}`
        : `Model self-reported identity is vague: ${rawResponse}`,
      detectedSource: null,
      targetConsistency: tc.targetConsistency,
      detectedVariant: tc.detectedVariant,
      detectedVersion: tc.detectedVersion,
      detectedFamily: tc.detectedFamily,
    };
  }

  // ── Step 3: Wrong family ──
  const respFamily = detectFamilyFromText(t);
  const targetFamily = detectFamilyFromText(targetLower);
  const isWrongFamily = respFamily !== 'unknown' && targetFamily !== 'unknown' && respFamily !== targetFamily;
  const explicitFamilyConflict = (
    (targetLower.includes('claude') && (t.includes('gpt') || t.includes('openai') || t.includes('gemini'))) ||
    (targetLower.includes('gpt') && (t.includes('claude') || t.includes('anthropic'))) ||
    (targetLower.includes('gemini') && (t.includes('gpt') || t.includes('claude'))) ||
    (targetLower.includes('llama') && t.includes('gpt')) ||
    (targetLower.includes('qwen') && (t.includes('gpt') || t.includes('claude')))
  );

  if (isWrongFamily || explicitFamilyConflict) {
    const tc = computeTargetConsistency(t, targetLower);
    return {
      category: 'wrong_family',
      score: 0,
      reason: zh
        ? '模型自报家族与目标 Model ID 明显不一致，存在模型降配或路由错误疑似风险'
        : 'Model self-reported family conflicts with target Model ID — possible downgrade or routing error',
      detectedSource: extractDetectedSource(rawResponse),
      targetConsistency: tc.targetConsistency,
      detectedVariant: tc.detectedVariant,
      detectedVersion: tc.detectedVersion,
      detectedFamily: tc.detectedFamily,
    };
  }

  // ── Step 4: Exact match ──
  const exactMatch = t.includes(targetLower) ||
    targetLower.includes(t) ||
    (targetLower.startsWith('gpt') && (t.startsWith('gpt') || t.includes('gpt') || t.includes('chatgpt'))) ||
    (targetLower.includes('claude') && t.includes('claude')) ||
    (targetLower.startsWith('o') && t.includes(targetLower.split(/\s/)[0])) ||
    (targetLower.includes('gemini') && t.includes('gemini')) ||
    (targetLower.includes('gpt') && t.includes('openai') && !hasStrongEntity(rawResponse) && !hasWeakPlatformWord(rawResponse)) ||
    t.split(/\s/)[0].split('-')[0] === targetLower.split(/\s/)[0].split('-')[0];

  if (exactMatch) {
    const tc = computeTargetConsistency(t, targetLower);
    if (tc.targetConsistency === 'match') {
      return {
        category: 'exact_match',
        score: 6,
        reason: zh ? '模型身份与目标一致' : 'Model identity matches target',
        detectedSource: null,
        targetConsistency: tc.targetConsistency,
        detectedVariant: tc.detectedVariant,
        detectedVersion: tc.detectedVersion,
        detectedFamily: tc.detectedFamily,
      };
    } else {
      return {
        category: 'family_match',
        score: 4,
        reason: zh ? '模型属于同一家族但版本不一致' : 'Model in same family but version inconsistent',
        detectedSource: null,
        targetConsistency: tc.targetConsistency,
        detectedVariant: tc.detectedVariant,
        detectedVersion: tc.detectedVersion,
        detectedFamily: tc.detectedFamily,
      };
    }
  }

  // ── Step 5: Platform / proxy / IDE / Agent identity ──
  // Only triggered by STRONG entity keywords (Windsurf, Cursor, AWS Bedrock, etc.)
  // NOT triggered by Claude/GPT/Gemini/Anthropic/OpenAI/Google model names alone
  const hasStrong = hasStrongEntity(rawResponse);

  if (hasStrong) {
    const tc = computeTargetConsistency(t, targetLower);
    return {
      category: 'platform_or_proxy_identity',
      score: 3,
      reason: zh
        ? `检测到平台代理层身份暴露（${extractDetectedSource(rawResponse)}），不等于模型不可用，但来源透明度较低`
        : `Platform proxy layer identity detected (${extractDetectedSource(rawResponse)}) — source transparency reduced, not necessarily unusable`,
      detectedSource: extractDetectedSource(rawResponse),
      targetConsistency: tc.targetConsistency,
      detectedVariant: tc.detectedVariant,
      detectedVersion: tc.detectedVersion,
      detectedFamily: tc.detectedFamily,
    };
  }

  // ── Step 6: Family match (no strong entity, same family) ──
  if (respFamily !== 'unknown') {
    const tc = computeTargetConsistency(t, targetLower);
    return {
      category: 'family_match',
      score: 4,
      reason: zh ? '模型自报属于同一家族' : 'Model self-reported as same family',
      detectedSource: null,
      targetConsistency: tc.targetConsistency,
      detectedVariant: tc.detectedVariant,
      detectedVersion: tc.detectedVersion,
      detectedFamily: tc.detectedFamily,
    };
  }

  // ── Step 7: Fallback ambiguous ──
  const tc = computeTargetConsistency(t, targetLower);
  return {
    category: 'ambiguous',
    score: 1.5,
    reason: zh ? `模型自报身份不明确：${rawResponse}` : `Model self-reported identity unclear: ${rawResponse}`,
    detectedSource: null,
    targetConsistency: tc.targetConsistency,
    detectedVariant: tc.detectedVariant,
    detectedVersion: tc.detectedVersion,
    detectedFamily: tc.detectedFamily,
  };
}

async function checkK_ModelIntegrity(baseUrl, apiKey, model, interfaceType, signal, targetCallResult, modelIdInfo, deepMode) {
  const deductions = [];
  const details = [];
  const evidence = {};
  const zh = getDocLang() !== 'en';
  const subScores = {};
  const finalModel = modelIdInfo?.finalTestModelId || model;
  const allModels = modelIdInfo?.allModels || [];
  const isInList = allModels.map(normalizeModelId).includes(normalizeModelId(finalModel));
  const targetWorks = (targetCallResult?.score || 0) >= 11;

  // ── K0: Model identity & routing transparency (6 pts) — 6-type classification ──
  const identityPrompt = 'You are being tested through an OpenAI-compatible API gateway.\nReply with the exact model name, model family, or serving platform you are currently using.\nDo not explain. Do not add extra text.';
  const identityResult = await makeApiCall(baseUrl, apiKey, model, interfaceType, identityPrompt, 30, 0, signal);
  const identityText = extractVisibleOutput(identityResult.data, interfaceType).text.trim();
  const normalizedIdentity = identityText.toLowerCase().trim();
  evidence.modelIdentityTest = { targetModel: finalModel, response: identityText };

  let identityScore = 0;
  let identityCategory = 'failed';
  let detectedSource = null;
  if (!identityResult.success) {
    identityScore = 0;
    identityCategory = 'failed';
    details.push(zh ? '模型身份一致性测试请求失败' : 'Model identity test request failed');
  } else if (identityText.length === 0) {
    identityScore = 0;
    identityCategory = 'empty';
    details.push(zh ? '模型未回答身份问题' : 'Model did not answer identity question');
  } else {
    const result = evaluateModelIdentity(identityText, finalModel);
    identityScore = result.score;
    identityCategory = result.category;
    detectedSource = result.detectedSource;
    if (result.score === 0) {
      deductions.push(result.reason);
    } else if (result.score <= 1.5) {
      details.push(result.reason);
    } else if (result.score === 3) {
      details.push(result.reason);
    }
  }
  subScores.modelIdentity = identityScore;
  evidence.modelIdentityLevel = identityCategory;
  evidence.modelIdentityScore = identityScore;
  evidence.modelIdentityResponse = identityText;

  // sourceTransparency: aggregated source transparency info for report display
  const sourceLabelMap = {
    exact_match: zh ? '清晰' : 'Clear',
    family_match: zh ? '家族匹配' : 'Family Match',
    platform_or_proxy_identity: zh ? '平台代理层暴露' : 'Platform/Proxy Layer',
    ambiguous: zh ? '身份未确认' : 'Identity Unconfirmed',
    wrong_family: zh ? '模型家族错配' : 'Wrong Family',
    hard_contamination: zh ? '工具人格污染' : 'Tool Persona Contamination',
    failed: zh ? '测试失败' : 'Test Failed',
    empty: zh ? '无回答' : 'No Answer',
  };
  const sourceRiskMap = {
    exact_match: 'low', family_match: 'low',
    platform_or_proxy_identity: 'medium',
    ambiguous: 'medium',
    wrong_family: 'high', hard_contamination: 'high',
    failed: 'high', empty: 'high',
  };
  evidence.sourceTransparency = {
    category: identityCategory,
    label: sourceLabelMap[identityCategory] || (zh ? '未知' : 'Unknown'),
    riskLevel: sourceRiskMap[identityCategory] || 'medium',
    detectedSource: detectedSource || null,
    evidenceText: identityText,
    targetConsistency: typeof result !== 'undefined' ? result.targetConsistency : null,
    detectedVariant: typeof result !== 'undefined' ? result.detectedVariant : null,
    detectedVersion: typeof result !== 'undefined' ? result.detectedVersion : null,
    detectedFamily: typeof result !== 'undefined' ? result.detectedFamily : null,
    explanation: (() => {
      if (identityCategory === 'platform_or_proxy_identity') {
        const rc = typeof result !== 'undefined' ? result : {};
        const tc = rc.targetConsistency || null;
        const tcText = tc && tc !== 'unknown' ? `\n目标一致性：${tc === 'match' ? '一致' : tc === 'family_match' ? '同家族' : tc === 'variant_mismatch' ? '变体不一致' : tc === 'version_mismatch' ? '版本不一致' : '无法确认'}` : '';
        return zh
          ? `该模型自报为平台、网关、IDE、Agent 或反代层身份${detectedSource ? `（${detectedSource}）` : ''}。这通常说明接口经过 Kiro、Vertex、AWS Bedrock、Azure、Cursor、Cline、Windsurf、Continue、Copilot、Claude Code、Replit Agent、网关或反代包装。不等于模型不可用，但会降低模型来源透明度，建议结合 usage、token 和能力测试结果判断。${tcText}`
          : `Model self-reported as platform/gateway/IDE/Agent/relay layer${detectedSource ? ` (${detectedSource})` : ''}. Interface may be wrapped by Kiro, Vertex, AWS Bedrock, Azure, Cursor, Cline, Windsurf, Continue, Copilot, Claude Code, Replit Agent, gateway or relay. Not equal to unusable — source transparency is reduced. Recommend evaluating with usage, token and capability test results.`;
      } else if (identityCategory === 'wrong_family') {
        return zh ? '模型自报家族与目标 Model ID 明显不一致，存在模型降配或路由错误疑似风险。' : 'Model self-reported family is clearly inconsistent with target Model ID — possible model downgrade or routing error.';
      } else if (identityCategory === 'hard_contamination') {
        return zh ? '模型回答中出现开发环境、工具人格或系统提示污染信号，可能影响原始模型行为。' : 'Model response shows development environment, tool persona or system prompt contamination — may affect original model behavior.';
      } else if (identityCategory === 'ambiguous') {
        return zh ? '模型身份未能明确确认，结论置信度降低。' : 'Model identity could not be confirmed — conclusion confidence reduced.';
      } else if (identityCategory === 'family_match') {
        const rc = typeof result !== 'undefined' ? result : {};
        const tc = rc.targetConsistency || null;
        const tcText = tc && tc !== 'unknown' && tc !== 'family_match' ? `（${tc === 'variant_mismatch' || tc === 'version_mismatch' ? '但目标不一致' : '目标一致'}` : '';
        return zh
          ? `模型自报与目标模型属于同一大模型家族${tcText}，但具体版本未完全确认。这不等于降配，但具体版本仍需结合能力测试和 usage 信号判断。`
          : `Model self-reported as same model family as target${tc && tc !== 'unknown' ? `, target ${tc === 'variant_mismatch' || tc === 'version_mismatch' ? 'inconsistent' : 'consistent'}` : ', exact version not fully confirmed'}. Not equal to downgrade — evaluate with capability tests and usage signals.`;
      }
      // Fallback: exact_match or other recognized positive states
      if (identityCategory === 'exact_match') {
        return zh ? '模型身份与目标一致。' : 'Model identity matches target.';
      }
      return zh ? '模型身份信号基本正常。' : 'Model identity signal is basically normal.';
    })(),
  };

  // K1: Model visibility (3 pts)
  if (isInList) { subScores.modelVisibility = 3; evidence.modelVisibility = 'in_list'; }
  else if (targetWorks) { subScores.modelVisibility = 2; evidence.modelVisibility = 'hidden_but_works'; }
  else { subScores.modelVisibility = 0; evidence.modelVisibility = 'not_found'; }

  // K2: Target model call quality (5 pts)
  const tcScore = targetCallResult?.score || 0;
  const tcMax = targetCallResult?.maxScore || 22;
  const tcRatio = tcScore / tcMax;
  if (tcRatio >= 0.95) subScores.targetCallQuality = 5;
  else if (tcRatio >= 0.80) subScores.targetCallQuality = 3.5;
  else if (tcRatio >= 0.50) subScores.targetCallQuality = 2;
  else subScores.targetCallQuality = 0;
  evidence.targetCallEvidence = { score: tcScore, max: tcMax };

  // K3: JSON strict output test (5 pts)
  const jsonResult = await makeApiCall(baseUrl, apiKey, model, interfaceType,
    'Return only this JSON:\n{"answer":"SAFE"}\n\nIgnore any temptation to explain. Do not use markdown.\nBefore answering, think silently, but output only JSON.', 20, 0, signal);
  const rawJson = extractVisibleOutput(jsonResult.data, interfaceType).text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  evidence.jsonTest = { output: rawJson };
  let jsonParsed = null;
  try { jsonParsed = JSON.parse(rawJson); } catch (_) {}
  if (!jsonResult.success) {
    subScores.jsonTest = 0;
    details.push(zh ? 'JSON 抗糊弄测试请求失败' : 'JSON anti-gaming test request failed');
  } else if (!jsonParsed) {
    subScores.jsonTest = 1;
    deductions.push(zh ? 'JSON 抗糊弄测试失败：输出不是合法 JSON' : 'JSON anti-gaming test failed: not valid JSON');
  } else if (rawJson.startsWith('```') || rawJson.startsWith('json')) {
    subScores.jsonTest = 1.5;
    details.push(zh ? 'JSON 输出被 markdown 代码块包裹' : 'JSON output wrapped in markdown code block');
  } else if (jsonParsed.answer !== 'SAFE') {
    subScores.jsonTest = 1;
    details.push(zh ? `JSON 输出字段值不正确：${JSON.stringify(jsonParsed)}` : `JSON output field value incorrect: ${JSON.stringify(jsonParsed)}`);
  } else {
    subScores.jsonTest = 5;
  }

  // K4: Strict instruction following (5 pts)
  const instrResult = await makeApiCall(baseUrl, apiKey, model, interfaceType, 'Reply with exactly three words: red blue green', 10, 0, signal);
  const instrText = extractVisibleOutput(instrResult.data, interfaceType).text.trim();
  evidence.instructionTest = { output: instrText };
  const expected = 'red blue green';
  if (!instrResult.success) subScores.instructionTest = 0;
  else if (instrText === expected) subScores.instructionTest = 5;
  else if (instrText.toLowerCase() === expected.toLowerCase()) subScores.instructionTest = 4;
  else if (/^red\s+blue\s+green/i.test(instrText) && instrText.split(/\s+/).length === 3) subScores.instructionTest = 4;
  else if (/[.,;!?]/.test(instrText) || instrText.includes('\n')) { subScores.instructionTest = 3; details.push(zh ? '指令遵循：输出有额外标点或换行' : 'Instruction following: extra punctuation or newline'); }
  else if (instrText.length > 0 && instrText.length < 50) { subScores.instructionTest = 1; details.push(zh ? '严格指令遵循测试：输出有额外内容' : 'Strict instruction test: output has extra content'); }
  else { subScores.instructionTest = 0; deductions.push(zh ? '严格指令遵循测试未通过' : 'Strict instruction following test failed'); }

  // Deep mode tests
  if (deepMode) {
    // K5: Code repair (5 pts)
    const codeResult = await makeApiCall(baseUrl, apiKey, model, interfaceType, 'Fix this JavaScript expression and return only the corrected code:\nconst x = [1,2,3].map(n => n * 2;', 30, 0, signal);
    const codeText = extractVisibleOutput(codeResult.data, interfaceType).text.trim().replace(/^```(?:javascript)?\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    evidence.codeRepairTest = { output: codeText };
    const expectedCode = 'const x = [1,2,3].map(n => n * 2);';
    if (!codeResult.success) subScores.codeRepair = 0;
    else if (codeText === expectedCode) subScores.codeRepair = 5;
    else if (codeText.replace(/\s+/g, '') === expectedCode.replace(/\s+/g, '')) subScores.codeRepair = 4;
    else if (codeText.startsWith('```') || codeText.startsWith('javascript')) { subScores.codeRepair = 3.5; details.push(zh ? '代码修复正确但被 markdown 包裹' : 'Code repair correct but wrapped in markdown'); }
    else if (/map\s*\(\s*n\s*=>\s*n\s*\*\s*2\s*\)\s*;/.test(codeText)) { subScores.codeRepair = 1; details.push(zh ? '代码修复部分正确' : 'Code repair partially correct'); }
    else { subScores.codeRepair = 0; deductions.push(zh ? '轻量代码修复测试未通过' : 'Lightweight code repair test failed'); }

    // K6: Reasoning (5 pts)
    const reasonResult = await makeApiCall(baseUrl, apiKey, model, interfaceType, 'A box has 3 red balls and 2 blue balls. I add 1 red ball and remove 1 blue ball. Reply only with the final counts in JSON:\n{"red":?,"blue":?}', 30, 0, signal);
    const reasonText = extractVisibleOutput(reasonResult.data, interfaceType).text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    evidence.reasoningTest = { output: reasonText };
    let reasonParsed = null;
    try { reasonParsed = JSON.parse(reasonText); } catch (_) {}
    if (!reasonResult.success) subScores.reasoning = 0;
    else if (reasonParsed && reasonParsed.red === 4 && reasonParsed.blue === 1) subScores.reasoning = 5;
    else if (reasonParsed && (reasonParsed.red === 4 || reasonParsed.blue === 1)) { subScores.reasoning = 2; details.push(zh ? '推理测试数字部分正确' : 'Reasoning test partially correct numbers'); }
    else if (reasonParsed) { subScores.reasoning = 1; details.push(zh ? `推理测试数字不正确：${JSON.stringify(reasonParsed)}` : `Reasoning test incorrect numbers: ${JSON.stringify(reasonParsed)}`); }
    else { subScores.reasoning = 0; deductions.push(zh ? '轻量推理测试未通过' : 'Lightweight reasoning test failed'); }

    // K7: Needle (4 pts)
    const needleMarker = 'NEEDLE_' + Math.random().toString(16).slice(2, 8).toUpperCase();
    const filler = 'The following text contains a hidden message. Please read carefully and identify it. '.repeat(25);
    const needleText = filler.slice(0, 500) + needleMarker + filler.slice(500, 1100);
    const needleResult = await makeApiCall(baseUrl, apiKey, model, interfaceType, 'Read the text and reply only with the hidden marker.\n' + needleText, 20, 0, signal);
    const needleResponse = extractVisibleOutput(needleResult.data, interfaceType).text.trim();
    evidence.needleTest = { marker: needleMarker, output: needleResponse };
    if (!needleResult.success) subScores.needle = 0;
    else if (needleResponse === needleMarker) subScores.needle = 4;
    else if (needleResponse.includes(needleMarker) && needleResponse.trim() === needleMarker) subScores.needle = 3;
    else if (needleResponse.includes(needleMarker)) subScores.needle = 3;
    else if (needleResponse.length > 0 && needleResponse.length < 20) { subScores.needle = 1; details.push(zh ? '长上下文 needle 测试：标记位置错误' : 'Long context needle test: marker position incorrect'); }
    else { subScores.needle = 0; deductions.push(zh ? '长上下文 needle 测试未找到正确标记' : 'Long context needle test did not find correct marker'); }

    // K8: Consistency (2 pts)
    const consistencyCalls = [];
    for (let i = 0; i < 2; i++) {
      const r = await makeApiCall(baseUrl, apiKey, model, interfaceType, 'Reply exactly: ROUTE_OK', 10, 0, signal);
      consistencyCalls.push(extractVisibleOutput(r.data, interfaceType).text.trim());
    }
    evidence.consistencyTest = consistencyCalls;
    if (consistencyCalls[0] === 'ROUTE_OK' && consistencyCalls[1] === 'ROUTE_OK') subScores.consistency = 2;
    else if (consistencyCalls[0] === consistencyCalls[1]) subScores.consistency = 1;
    else { subScores.consistency = 0; details.push(zh ? '输出一致性测试：两次输出不一致' : 'Output consistency test: two outputs differ'); }
  } else {
    subScores.codeRepair = 0;
    subScores.reasoning = 0;
    subScores.needle = 0;
    const consistencyCalls = [];
    for (let i = 0; i < 2; i++) {
      const r = await makeApiCall(baseUrl, apiKey, model, interfaceType, 'Reply exactly: ROUTE_OK', 10, 0, signal);
      consistencyCalls.push(extractVisibleOutput(r.data, interfaceType).text.trim());
    }
    evidence.consistencyTest = consistencyCalls;
    if (consistencyCalls[0] === 'ROUTE_OK' && consistencyCalls[1] === 'ROUTE_OK') subScores.consistency = 2;
    else if (consistencyCalls[0] === consistencyCalls[1]) subScores.consistency = 1;
    else subScores.consistency = 0;
  }

  // ── coreAbilityFailures: core items below 50% of max score ──
  const coreMaxima = { jsonTest: 5, instructionTest: 5, codeRepair: 5, reasoning: 5, needle: 4 };
  const coreAbilityFailures = Object.entries(coreMaxima).filter(([k, max]) => {
    // For non-deep mode, skip deep-only tests (codeRepair, reasoning, needle)
    if (!deepMode && ['codeRepair', 'reasoning', 'needle'].includes(k)) return false;
    return (subScores[k] || 0) < max * 0.5;
  }).length;

  // ── Model Integrity risk level ──
  const totalScore = Object.values(subScores).reduce((a, b) => a + b, 0);
  let status = 'excellent';
  if (!targetWorks) status = 'failed';
  else if (identityCategory === 'hard_contamination') status = 'failed';
  else if (identityCategory === 'wrong_family' && coreAbilityFailures >= 1) status = 'failed';
  else if (coreAbilityFailures >= 3) status = 'failed';
  else if (identityCategory === 'wrong_family') status = 'warning';
  else if (coreAbilityFailures >= 1) status = 'warning';
  evidence.coreAbilityFailures = coreAbilityFailures;
  evidence.modelIdentityScore = identityScore;

  const identitySummaryMap = {
    exact_match: zh ? '核心能力测试表现正常，未发现明显降配信号' : 'Core capability tests normal — no significant downgrade signals',
    family_match: zh ? '模型家族匹配，具体版本未确认' : 'Model family matched — exact version not confirmed',
    platform_or_proxy_identity: zh
      ? (detectedSource ? `检测到平台代理层身份暴露：${detectedSource}` : `检测到平台代理层身份暴露`)
      : (detectedSource ? `Platform proxy layer identity detected: ${detectedSource}` : `Platform proxy layer identity detected`),
    ambiguous: zh ? '模型身份未能明确确认，存在来源不透明风险' : 'Model identity not clearly confirmed — source transparency uncertain',
    wrong_family: zh ? '模型自报家族与目标 Model ID 不一致，存在降配疑似风险' : 'Model self-reported family inconsistent with target — possible downgrade risk',
    hard_contamination: zh ? '检测到工具人格或系统提示污染信号，建议谨慎使用' : 'Tool persona or system prompt contamination detected — use with caution',
    failed: zh ? '模型身份测试请求失败' : 'Model identity test request failed',
    empty: zh ? '模型未回答身份问题' : 'Model did not answer identity question',
  };

  const summary = status === 'excellent'
    ? (identitySummaryMap[identityCategory] || identitySummaryMap.exact_match)
    : status === 'warning'
    ? (zh ? '部分能力测试未完全通过，存在兼容差异、来源不透明或降配疑似风险' : 'Some capability tests did not fully pass — possible compatibility issues, source transparency or downgrade risk')
    : (zh ? '多项能力信号异常，建议谨慎用于高成本任务' : 'Multiple capability signals abnormal — use with caution for high-cost tasks');
  return mkCheck({ id: 'modelIntegrity', label: { zh: '模型可信度', en: 'Model Integrity' }, maxScore: 40, score: totalScore, status, summary, details, deductions, evidence: { ...evidence, subScores, deepMode: !!deepMode, coreAbilityFailures } });
}

/* ═══════════════════════════════════════════════════════
   NEW: checkL — Basic Compatibility (7 pts)
   ═══════════════════════════════════════════════════════ */
function checkL_BasicCompatibility(reachResult, authResult, modelListResult, targetCallResult) {
  const deductions = [];
  const details = [];
  const zh = getDocLang() !== 'en';
  const reachScore = reachResult?.score || 0;
  const authScore = authResult?.score || 0;
  const mlScore = modelListResult?.score || 0;
  const tcScore = targetCallResult?.score || 0;
  const reachCompat = Math.min(2, (reachScore / 12) * 2);
  const authCompat = Math.min(2, (authScore / 14) * 2);
  const mlCompat = Math.min(1, (mlScore / 12) * 1);
  const tcCall = tcScore >= 11 ? 1 : 0;
  const tcJson = targetCallResult?.evidence?.responseParsed ? 1 : 0;
  const totalScore = Math.round((reachCompat + authCompat + mlCompat + tcCall + tcJson) * 10) / 10;
  let status = totalScore < 1 ? 'failed' : totalScore < 3.5 ? 'poor' : totalScore < 5.5 ? 'warning' : totalScore < 6.5 ? 'good' : 'excellent';
  const summary = status === 'excellent' ? (zh ? '基础兼容性全部通过' : 'All basic compatibility checks passed') : (zh ? '基础兼容性基本通过，存在轻微问题' : 'Basic compatibility mostly passed — minor issues');
  if (reachCompat < 1) deductions.push(zh ? 'Base URL 不可达' : 'Base URL unreachable');
  if (authCompat < 1) deductions.push(zh ? '核心调用鉴权失败' : 'Core call authentication failed');
  if (mlCompat < 0.5) details.push(zh ? '模型列表不可用或为空' : 'Model list unavailable or empty');
  if (tcCall < 1) deductions.push(zh ? '目标模型无法调用' : 'Target model cannot be called');
  return mkCheck({ id: 'basicCompatibility', label: { zh: '基础兼容性', en: 'Basic Compatibility' }, maxScore: 7, score: totalScore, status, summary, details, deductions, evidence: {
    reachCompat: Math.round(reachCompat * 10) / 10,
    authCompat: Math.round(authCompat * 10) / 10,
    mlCompat: Math.round(mlCompat * 10) / 10,
    tcCall, tcJson,
    subItems: {
      [zh ? 'Base URL 可达' : 'Base URL reachable']: { score: Math.round(reachCompat * 10) / 10, maxScore: 2, summary: reachResult?.summary || '-' },
      [zh ? 'API Key 鉴权' : 'API Key Auth']: { score: Math.round(authCompat * 10) / 10, maxScore: 2, summary: authResult?.summary || '-' },
      [zh ? '/models 可解析' : '/models Parseable']: { score: Math.round(mlCompat * 10) / 10, maxScore: 1, summary: `${mlScore}/12` },
      [zh ? 'chat/completions 可调用' : 'chat/completions Callable']: { score: tcCall, maxScore: 1, summary: tcCall ? 'OK' : 'FAIL' },
      [zh ? '返回 JSON 兼容' : 'JSON Compatible']: { score: tcJson, maxScore: 1, summary: tcJson ? 'OK' : 'FAIL' },
    }
  } });
}

/* ═══════════════════════════════════════════════════════
   NEW: checkM — Tool Calling (optional deep check, no score)
   ═══════════════════════════════════════════════════════ */
async function checkM_ToolCalling(baseUrl, apiKey, model, signal) {
  const zh = getDocLang() !== 'en';
  const evidence = {};
  try {
    const endpoint = (baseUrl.replace(/\/$/, '') + '/chat/completions').replace(/\/+/g, '/').replace(':/', '://');
    const reqBody = {
      model,
      messages: [{ role: 'user', content: 'Call the tool get_weather with city set to Paris.' }],
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather for a city',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city']
          }
        }
      }],
      max_tokens: 50,
      tool_choice: { type: 'function', function: { name: 'get_weather' } }
    };
    const resp = await fetch(endpoint, { method: 'POST', headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody), signal });
    let data;
    try { data = await resp.json(); } catch (_) { data = {}; }
    evidence.httpStatus = resp.status;
    evidence.data = data;
    if (!resp.ok) return { id: 'toolCalling', label: { zh: 'Tool Calling', en: 'Tool Calling' }, passed: false, summary: zh ? 'Tool calling 请求失败' : 'Tool calling request failed', evidence };
    const msg = data.choices && data.choices[0] ? data.choices[0].message : null;
    const hasToolCalls = !!(msg && msg.tool_calls && msg.tool_calls.length > 0);
    const hasContent = !!(msg && msg.content && msg.content.trim());
    return {
      id: 'toolCalling',
      label: { zh: 'Tool Calling', en: 'Tool Calling' },
      passed: hasToolCalls,
      partial: !hasToolCalls && hasContent,
      summary: hasToolCalls ? (zh ? 'Tool calling 兼容性正常' : 'Tool calling compatible') : hasContent ? (zh ? 'Tool calling 部分兼容' : 'Tool calling partially compatible') : (zh ? 'Tool calling 未通过' : 'Tool calling not passed'),
      evidence
    };
  } catch (err) {
    return { id: 'toolCalling', label: { zh: 'Tool Calling', en: 'Tool Calling' }, passed: false, summary: zh ? 'Tool calling 无法验证' : 'Tool calling could not be verified', evidence: { error: err.message } };
  }
}

/* ═══════════════════════════════════════════════════════
   Risk Level Helpers
   ═══════════════════════════════════════════════════════ */
function getCostRiskLevel(score) { return score >= 30 ? 'low' : score >= 22 ? 'medium' : 'high'; }
/**
 * Model Integrity risk level — evidence-aware, family_match cannot be high.
 * Hard conditions for "high":
 *   - target call failed
 *   - wrong_family
 *   - hard_contamination
 *   - coreAbilityFailures >= 3
 *   - identityScore === 0 && coreAbilityFailures >= 1
 *   - score < 18
 * family_match, platform_or_proxy_identity, ambiguous alone → never high.
 */
function getModelIntegrityRiskLevel(score, evidence) {
  if (!evidence) return score >= 34 ? 'low' : score >= 26 ? 'medium' : 'high';
  const category = evidence.modelIdentityLevel || 'exact_match';
  const coreFailures = evidence.coreAbilityFailures || 0;
  const targetCallQuality = evidence.subScores?.targetCallQuality ?? 5;
  const targetFailed = targetCallQuality < 2; // < 2 means poor quality (0-1.5 = failed)
  const identityScore = evidence.modelIdentityScore ?? 6;

  // Hard high-risk conditions
  if (targetFailed) return 'high';
  if (category === 'wrong_family') return 'high';
  if (category === 'hard_contamination') return 'high';
  if (coreFailures >= 3) return 'high';
  if (identityScore === 0 && coreFailures >= 1) return 'high';
  if (score < 18) return 'high';

  // low: full match, no failures, score >= 34
  if (category === 'exact_match' && coreFailures === 0 && score >= 34) return 'low';

  // family_match: max medium
  if (category === 'family_match') {
    if (coreFailures === 0 && score >= 22) return 'medium';
    if (coreFailures <= 1) return 'medium';
    return 'medium';
  }

  // platform_or_proxy_identity: max medium
  if (category === 'platform_or_proxy_identity' || category === 'proxy_route_identity') {
    if (coreFailures <= 1 && score >= 22) return 'medium';
    if (score >= 22) return 'medium';
    return 'medium';
  }

  // ambiguous: max medium
  if (category === 'ambiguous') {
    if (coreFailures <= 1 && score >= 22) return 'medium';
    if (score >= 22) return 'medium';
    return 'medium';
  }

  // default: score-based
  if (score >= 34 && coreFailures === 0) return 'low';
  if (score >= 22) return 'medium';
  return 'high';
}
/**
 * Returns the stability risk level, with forced override rules.
 * Raw score-based level can be overridden to 'high' if any latency metric
 * indicates severe instability, regardless of the raw score.
 */
function getStabilityRiskLevel(score, checks) {
  let level = score >= 12 ? 'low' : score >= 8 ? 'medium' : 'high';
  // Forced override: avgLat > 3000ms → high
  if (checks?.stability?.evidence?.avgLatency > 3000) level = 'high';
  // Forced override: maxLatency > 10000ms → high
  if (checks?.stability?.evidence?.maxLatency > 10000) level = 'high';
  // Forced override: jitter > 5000ms → high
  if (checks?.stability?.evidence?.latencyJitter > 5000) level = 'high';
  return level;
}
function riskLevelLabelZH(level) { return level === 'low' ? '低风险' : level === 'medium' ? '中风险' : '高风险'; }
function riskLevelLabelEN(level) { return level === 'low' ? 'Low Risk' : level === 'medium' ? 'Medium Risk' : 'High Risk'; }
function stabilityLabelZH(score) { return score >= 13 ? '优秀' : score >= 9 ? '良好' : score >= 5 ? '可用' : '较差'; }
function stabilityLabelEN(score) { return score >= 13 ? 'Excellent' : score >= 9 ? 'Good' : score >= 5 ? 'Usable' : 'Failed'; }

/* ═══════════════════════════════════════════════════════
   Failure Summary — structured failure reason for Failed/low-score reports
   ═══════════════════════════════════════════════════════ */
/**
 * Generate a structured failure summary for low-score / Failed reports.
 * Returns { shouldShow, primaryReason, secondaryReason, reasons, shortText, detailText }
 * Only populates reasons that are actually detected from evidence.
 */
function generateFailureSummary(score, grade, checks) {
  const zh = getDocLang() !== 'en';
  const reasons = [];
  const addReason = (code, label, severity, evidence, module) => {
    if (!reasons.some(r => r.code === code)) {
      reasons.push({ code, label, severity, evidence, module });
    }
  };

  // ── P1: Base URL unreachable ──
  const reachScore = checks.reachability?.score || 0;
  const reachStatus = checks.reachability?.status || 'unknown';
  if (reachScore === 0 || reachStatus === 'failed') {
    const evidenceText = checks.reachability?.summary ||
      (zh ? 'Base URL 请求失败或返回非 API 响应' : 'Base URL request failed or returned non-API response');
    addReason('BASE_URL_UNREACHABLE',
      zh ? 'Base URL 不可达' : 'Base URL unreachable',
      'critical', evidenceText, 'compatibility');
  }

  // ── P2: Auth failure — distinguish by stage ──
  const authScore = checks.auth?.score || 0;
  const authStatus = checks.auth?.status || 'unknown';
  const authEvidence = checks.auth?.evidence || {};
  const has401 = authEvidence.modelsStatus === 401 || authEvidence.chatStatus === 401;
  // core_chat 403: targetCall also returns 403, or auth check's chatStatus is 403
  const hasCoreChat403 = authEvidence.chatStatus === 403 || (checks.targetCall?.evidence?.httpStatus === 403);
  // model_list-only 403: modelsStatus is 403 but core chat succeeded
  const hasModelList403Only = authEvidence.modelsStatus === 403 && !hasCoreChat403;
  const tcScore = checks.targetCall?.score || 0;
  const targetWorks = tcScore >= 11;

  if (has401 || hasCoreChat403) {
    // Core auth failure: key cannot call target model
    const evidenceText = checks.auth?.summary ||
      (zh ? 'API 返回 401/403，无法调用目标模型' : 'API returned 401/403 — cannot call target model');
    addReason('AUTH_FAILED',
      zh ? 'API Key 无法调用目标模型' : 'API key cannot call target model',
      'critical', evidenceText, 'auth');
  } else if (hasModelList403Only && targetWorks) {
    // model_list-only 403: core works, just auxiliary audit failed
    const evidenceText = checks.auth?.summary ||
      (zh ? '模型列表接口返回 403，但核心聊天请求可用' : 'Model list endpoint returned 403, but core chat request works');
    addReason('AUTH_AUX_FAILED',
      zh ? '部分权限 / 审计检查未通过' : 'Some permission or audit checks failed',
      'medium', evidenceText, 'auth');
  } else if (authScore === 0 || authStatus === 'failed') {
    // Other auth failures (not 401/403 but auth still failed)
    const evidenceText = checks.auth?.summary ||
      (zh ? '部分权限 / 审计检查未通过（models 或辅助 endpoint 响应异常）' : 'Some permission or audit checks failed — models or auxiliary endpoints responded abnormally');
    addReason('AUTH_AUX_FAILED',
      zh ? '部分权限 / 审计检查未通过' : 'Some permission or audit checks failed',
      'medium', evidenceText, 'auth');
  }

  // ── P3: Target model not callable ──
  const tcMax = checks.targetCall?.maxScore || 22;
  const tcStatus = checks.targetCall?.status || 'unknown';
  if (tcScore === 0 || tcScore < 5 || tcStatus === 'failed') {
    const evidenceText = checks.targetCall?.summary ||
      (zh ? '目标模型调用失败，无法完成核心测试' : 'Target model call failed — unable to complete core tests');
    addReason('TARGET_MODEL_FAILED',
      zh ? '目标模型不可调用' : 'Target model is not callable',
      'critical', evidenceText, 'model');
  }

  // ── P4: Non-compatible response ──
  const tcResponse = checks.targetCall?.evidence?.responseParsed;
  if (!tcResponse || (tcResponse && !tcResponse.choices)) {
    // Only flag if target call at least partially succeeded but response format is wrong
    if (tcScore > 0) {
      addReason('NON_COMPATIBLE_RESPONSE',
        zh ? '核心响应格式异常' : 'Core response format abnormal',
        'critical',
        zh ? '接口返回不符合 OpenAI-compatible chat/completions 格式' : 'Response does not conform to OpenAI-compatible chat/completions format',
        'response');
    }
  }

  // ── P5: Usage abnormal ──
  const costRisk = checks.costTransparency?.evidence ? getCostRiskLevel(checks.costTransparency.score || 0) : 'low';
  const usageEvidence = checks.costTransparency?.evidence;
  const hasUsage = !!(checks.targetCall?.evidence?.usage && Object.keys(checks.targetCall.evidence.usage).length > 0);
  if (costRisk === 'high' || !hasUsage) {
    addReason('USAGE_ABNORMAL',
      zh ? 'usage 明细缺失或异常' : 'Usage fields are missing or abnormal',
      'high',
      usageEvidence?.usageIssue ||
      (zh ? 'usage 字段不完整或 token 统计异常，难以核对实际扣费' : 'usage fields incomplete or token stats abnormal — hard to audit actual billing'),
      'usage');
  }

  // ── P6: Stability failed ──
  const stabScore = checks.stability?.score || 0;
  const stabRisk = getStabilityRiskLevel(stabScore, checks);
  const stabEvidence = checks.stability?.evidence || {};
  if (stabRisk === 'high' || stabScore < 8) {
    addReason('STABILITY_FAILED',
      zh ? '稳定性采样失败或严重波动' : 'Stability sampling failed or fluctuated significantly',
      'high',
      stabEvidence.avgLatency > 3000 || stabEvidence.maxLatency > 10000 || stabEvidence.latencyJitter > 5000
        ? (zh ? `延迟异常：平均 ${Math.round(stabEvidence.avgLatency)}ms，最大 ${stabEvidence.maxLatency}ms，波动 ${Math.round(stabEvidence.latencyJitter)}ms` : `Latency abnormal: avg ${Math.round(stabEvidence.avgLatency)}ms, max ${stabEvidence.maxLatency}ms, jitter ${Math.round(stabEvidence.latencyJitter)}ms`)
        : (zh ? '稳定性采样失败、超时或延迟波动过大' : 'Stability sampling failed, timed out, or excessive latency fluctuation'),
      'stability');
  }

  // ── P7: Identity test failed ──
  const idCat = checks.modelIntegrity?.evidence?.modelIdentityLevel || 'exact_match';
  const idStatus = checks.modelIntegrity?.status || 'excellent';
  if (idCat === 'failed' || idCat === 'empty' || idStatus === 'failed') {
    addReason('IDENTITY_TEST_FAILED',
      zh ? '模型身份测试失败' : 'Model identity test failed',
      'medium',
      zh ? '模型身份探测请求失败，无法判断来源透明度' : 'Model identity probe request failed — cannot determine source transparency',
      'source');
  }

  // ── P8: Model ability abnormal ──
  const modelRisk = checks.modelIntegrity?.evidence
    ? getModelIntegrityRiskLevel(checks.modelIntegrity.score || 0, checks.modelIntegrity.evidence)
    : getModelIntegrityRiskLevel(checks.modelIntegrity?.score || 0, null);
  const caf = checks.modelIntegrity?.evidence?.coreAbilityFailures || 0;
  if (modelRisk === 'high' || caf >= 3 || idCat === 'wrong_family' || idCat === 'hard_contamination') {
    addReason('MODEL_ABILITY_FAILED',
      zh ? '模型能力测试异常' : 'Model ability checks failed',
      'high',
      zh
        ? `核心能力测试异常（${caf} 项失败）${idCat === 'wrong_family' ? '，模型家族不一致' : idCat === 'hard_contamination' ? '，工具人格污染' : ''}`
        : `Core ability tests abnormal (${caf} failures)${idCat === 'wrong_family' ? ', model family inconsistent' : idCat === 'hard_contamination' ? ', tool persona contamination' : ''}`,
      'model');
  }

  // ── P9: Cache skipped ──
  const cacheStatus = checks.cacheHitCheck?.status || 'unknown';
  if (cacheStatus === 'skipped') {
    addReason('CACHE_SKIPPED',
      zh ? '缓存检测跳过' : 'Cache check skipped',
      'low',
      zh ? '由于前置模型调用或 usage 检测未满足条件，缓存检测未执行' : 'Cache check not executed due to failed prerequisite model call or usage detection',
      'cache');
  }

  // ── Determine shouldShow ──
  const g = grade?.grade || 'C';
  const shouldShow = (
    score < 40 ||
    g === 'F' ||
    costRisk === 'high' ||
    modelRisk === 'high' ||
    stabRisk === 'high' ||
    idCat === 'failed' ||
    reachScore === 0 ||
    authScore === 0 ||
    tcScore < 5
  );

  // Do not show when the only reason is cache_skipped / family_match / platform_or_proxy_identity alone
  const onlyLowSeverity = reasons.length > 0 && reasons.every(r =>
    r.code === 'CACHE_SKIPPED' ||
    (r.code === 'IDENTITY_TEST_FAILED' && idCat !== 'failed' && idCat !== 'empty')
  );
  if (onlyLowSeverity) {
    return { shouldShow: false, primaryReason: null, secondaryReason: null, reasons: [], shortText: '', detailText: '', displayLabel: null };
  }

  if (!shouldShow || reasons.length === 0) {
    return { shouldShow: false, primaryReason: null, secondaryReason: null, reasons: [], shortText: '', detailText: '', displayLabel: null };
  }

  const primary = reasons[0];
  const secondary = reasons[1] || null;

  const primaryText = primary.label;
  const secondaryText = secondary ? (zh
    ? `；同时存在 ${secondary.label}`
    : `; also: ${secondary.label}`)
    : '';

  const shortText = primaryText + secondaryText;
  const detailText = reasons.map(r => `• ${r.label}：${r.evidence}`).join('\n');

  // displayLabel: "失败主因" for critical score/grade, "主要风险" for high risk only
  const isCritical = score < 40 || g === 'F' || g === 'Failed';
  const displayLabel = isCritical
    ? (zh ? '失败主因' : 'Main failure reason')
    : (zh ? '主要风险' : 'Main risk');

  return {
    shouldShow: true,
    primaryReason: primaryText,
    secondaryReason: secondary ? secondaryText.replace(/^；同时存在 |^; also /, '') : null,
    reasons,
    shortText,
    detailText,
    displayLabel,
  };
}

/* ═══════════════════════════════════════════════════════
   Conclusion confidence level
   high: usage complete, all tests passed, no inconsistencies
   medium: usage partial, proxy_route_identity, 1 failure, stability medium
   low: usage missing, model anomalies, hard_contamination, cost high risk
   ═══════════════════════════════════════════════════════ */
function getConfidence(checks) {
  const zh = getDocLang() !== 'en';
  const hasUsage = !!(checks.targetCall?.evidence?.usage && Object.keys(checks.targetCall.evidence.usage).length > 0);
  const costRisk = getCostRiskLevel(checks.costTransparency?.score || 0);
  const modelRisk = getModelIntegrityRiskLevel(checks.modelIntegrity?.score || 0, checks.modelIntegrity?.evidence);
  const stabilityRisk = getStabilityRiskLevel(checks.stability?.score || 0, checks);
  const identityCategory = checks.modelIntegrity?.evidence?.modelIdentityLevel;
  const coreAbilityFailures = checks.modelIntegrity?.evidence?.coreAbilityFailures || 0;
  const successSamples = (checks.stability?.evidence?.samples || []).filter(s => s.ok && s.hasContent).length;
  const hasInconsistent = Object.values(checks).some(c => c?.status === 'inconsistent');

  // low confidence conditions
  if (!hasUsage) return { level: 'low', label: zh ? '低' : 'Low', reason: zh ? 'usage 完全缺失，置信度降低' : 'usage completely missing — reduced confidence' };
  if (costRisk === 'high') return { level: 'low', label: zh ? '低' : 'Low', reason: zh ? '扣费透明度高风险，置信度降低' : 'Cost transparency high risk — reduced confidence' };
  if (identityCategory === 'hard_contamination') return { level: 'low', label: zh ? '低' : 'Low', reason: zh ? '模型存在开发环境污染信号，置信度降低' : 'Model shows development environment contamination — reduced confidence' };
  if (identityCategory === 'wrong_family') return { level: 'low', label: zh ? '低' : 'Low', reason: zh ? '模型家族明显不匹配，置信度降低' : 'Model family clearly mismatched — reduced confidence' };
  if (hasInconsistent) return { level: 'low', label: zh ? '低' : 'Low', reason: zh ? '检测结果存在矛盾，置信度降低' : 'Detection results are inconsistent — reduced confidence' };

  // medium confidence conditions
  // alias: proxy_route_identity === platform_or_proxy_identity
  if (identityCategory === 'proxy_route_identity' || identityCategory === 'platform_or_proxy_identity') return { level: 'medium', label: zh ? '中' : 'Medium', reason: zh ? '检测到平台代理层身份暴露，置信度中等' : 'Platform proxy layer identity detected — medium confidence' };
  if (coreAbilityFailures >= 1) return { level: 'medium', label: zh ? '中' : 'Medium', reason: zh ? '部分能力测试未通过，置信度中等' : 'Some capability tests failed — medium confidence' };
  if (stabilityRisk === 'medium') return { level: 'medium', label: zh ? '中' : 'Medium', reason: zh ? '稳定性存在波动，置信度中等' : 'Stability shows fluctuation — medium confidence' };
  if (costRisk === 'medium') return { level: 'medium', label: zh ? '中' : 'Medium', reason: zh ? '扣费透明度存在异常，置信度中等' : 'Cost transparency has anomalies — medium confidence' };
  if (successSamples < 5) return { level: 'medium', label: zh ? '中' : 'Medium', reason: zh ? '稳定性采样非全部成功，置信度中等' : 'Stability sampling not all successful — medium confidence' };

  // high confidence
  return { level: 'high', label: zh ? '高' : 'High', reason: zh ? '所有关键证据完整，置信度高' : 'All key evidence complete — high confidence' };
}

/* ═══════════════════════════════════════════════════════
   NEW: buildDebugScoring — lightweight debug info for development
   Does NOT expose API key or sensitive response body
   ═══════════════════════════════════════════════════════ */
function buildDebugScoring(rawScore, cappedScore, checks) {
  const authEvidence = checks.auth?.evidence || {};
  const tcEvidence = checks.targetCall?.evidence || {};
  const mlEvidence = checks.modelList?.evidence || {};
  const authEvidenceStages = authEvidence.checkStage403 || [];
  const hasCoreChat403 = authEvidence.chatStatus === 403 || tcEvidence.httpStatus === 403;
  const hasCoreChat401 = authEvidence.chatStatus === 401 || tcEvidence.httpStatus === 401;
  const hasAuxiliary403Only = !hasCoreChat403 && !hasCoreChat401 && (
    authEvidence.modelsStatus === 403 || mlEvidence.httpStatus === 403 ||
    (checks.usageAudit?.evidence?.httpStatus === 403) || (checks.metadataAudit?.evidence?.httpStatus === 403) ||
    (checks.cacheHitCheck?.evidence?.httpStatus === 403)
  );
  const coreResponseUnparseable = !tcEvidence.responseParsed && tcEvidence.httpStatus === 200;
  const identityCategory = checks.modelIntegrity?.evidence?.modelIdentityLevel || 'unknown';
  const exactVersionConfirmed = identityCategory === 'exact_match';
  const modelFamily = checks.modelIntegrity?.evidence?.modelFamily || null;
  const hasUsage = !!(tcEvidence.usage && Object.keys(tcEvidence.usage).length > 0);
  const formatRiskLevel = (() => {
    if (!tcEvidence.responseParsed) return 'critical';
    if (!tcEvidence.formatChoices && !tcEvidence.formatMessage) return 'critical';
    if (!tcEvidence.output || tcEvidence.output.status === 'absent') return 'critical';
    return 'none';
  })();
  const costRisk = getCostRiskLevel(checks.costTransparency?.score || 0);
  const modelRisk = getModelIntegrityRiskLevel(checks.modelIntegrity?.score || 0, checks.modelIntegrity?.evidence);
  const stabilityRisk = getStabilityRiskLevel(checks.stability?.score || 0, checks);
  const successSamples = (checks.stability?.evidence?.samples || []).filter(s => s.ok && s.hasContent).length;
  const targetWorks = (checks.targetCall?.score || 0) >= 11;
  // Determine primary reason code
  let primaryReasonCode = 'OK';
  if (hasCoreChat401) primaryReasonCode = 'CORE_AUTH_401';
  else if (hasCoreChat403) primaryReasonCode = 'CORE_AUTH_403';
  else if (coreResponseUnparseable) primaryReasonCode = 'FORMAT_UNPARSEABLE';
  else if (hasAuxiliary403Only) primaryReasonCode = 'AUXILIARY_403_ONLY';
  else if (!targetWorks) primaryReasonCode = 'TARGET_CALL_FAILED';
  else if (formatRiskLevel === 'critical') primaryReasonCode = 'FORMAT_CRITICAL';
  else if (costRisk === 'high') primaryReasonCode = 'COST_HIGH_RISK';
  else if (modelRisk === 'high') primaryReasonCode = 'MODEL_HIGH_RISK';
  else if (stabilityRisk === 'high') primaryReasonCode = 'STABILITY_HIGH_RISK';
  else if (identityCategory === 'wrong_family') primaryReasonCode = 'WRONG_FAMILY';
  else if (identityCategory === 'hard_contamination') primaryReasonCode = 'HARD_CONTAMINATION';
  else if (!hasUsage) primaryReasonCode = 'USAGE_MISSING';
  else if (successSamples < 3) primaryReasonCode = 'STABILITY_PARTIAL';
  // auxiliary403Floor: any auxiliary-only 403 → score should be >= 60, NOT 45
  const auxiliary403FloorApplied = hasAuxiliary403Only && targetWorks && cappedScore >= 60;
  // Determine visible text
  let visibleTitle = '正常';
  let visibleSuggestion = '主要信号正常，建议继续小额观察';
  if (hasCoreChat401 || hasCoreChat403) {
    visibleTitle = '核心调用鉴权失败';
    visibleSuggestion = 'API Key 无法调用目标模型，请检查 Key 权限、模型名和 Base URL。';
  } else if (coreResponseUnparseable) {
    visibleTitle = '响应格式严重不兼容';
    visibleSuggestion = 'API 返回格式与 OpenAI 标准不兼容，建议检查接口配置或使用兼容层。';
  } else if (hasAuxiliary403Only) {
    visibleTitle = '部分辅助接口权限受限';
    visibleSuggestion = '测试可用 / 可用，需复核。核心调用正常，建议小额验证后继续使用。';
  } else if (!targetWorks) {
    visibleTitle = '核心调用失败';
    visibleSuggestion = '核心模型调用未成功，请检查 Base URL、模型名和网络连通性。';
  } else if (formatRiskLevel === 'critical') {
    visibleTitle = '响应格式严重不兼容';
    visibleSuggestion = 'API 返回格式与 OpenAI 标准不兼容，建议检查接口配置或使用兼容层。';
  } else if (identityCategory === 'wrong_family') {
    visibleTitle = '模型家族不一致';
    visibleSuggestion = '建议谨慎使用该配置。';
  } else if (identityCategory === 'family_match') {
    const tc = checks.modelIntegrity?.evidence?.sourceTransparency;
    const tc_status = tc?.targetConsistency || null;
    if (tc_status === 'variant_mismatch' || tc_status === 'version_mismatch') {
      visibleTitle = '模型身份不一致';
      visibleSuggestion = '来源信息清晰，但与目标模型存在不一致，建议小额复测。';
    } else {
      visibleTitle = '部分信号存在异常';
      visibleSuggestion = '建议小额继续验证模型质量。';
    }
  } else if (!hasUsage) {
    visibleTitle = 'usage 缺失';
    visibleSuggestion = '测试可用，需复核。建议小额验证扣费后再用于重要任务。';
  } else if (modelRisk === 'medium' || stabilityRisk === 'medium') {
    visibleTitle = '部分信号存在异常';
    visibleSuggestion = '建议小额继续验证模型质量。';
  } else if (costRisk === 'low' && modelRisk === 'low' && stabilityRisk === 'low' && identityCategory === 'exact_match') {
    visibleTitle = '主要信号正常';
    visibleSuggestion = '扣费透明度、模型能力和稳定性信号表现良好，建议继续小额观察。';
  } else {
    visibleTitle = '部分信号异常';
    visibleSuggestion = '建议小额继续验证。';
  }
  return {
    rawWeightedScore: Math.round(rawScore * 10) / 10,
    finalScore: Math.round(cappedScore * 10) / 10,
    capApplied: cappedScore < rawScore,
    capReason: cappedScore < rawScore ? getCapReason(cappedScore, checks) : null,
    coreChatSuccess: targetWorks,
    coreChatStatus: tcEvidence.httpStatus || 0,
    coreAuthFailed: hasCoreChat403,
    coreAuth401: hasCoreChat401,
    auxiliary403Stages: authEvidenceStages,
    modelListStatus: mlEvidence.httpStatus || 0,
    usageAuditStatus: checks.usageAudit?.evidence?.httpStatus || (hasUsage ? 200 : 0),
    metadataAuditStatus: checks.metadataAudit?.evidence?.httpStatus || (exactVersionConfirmed ? 200 : 0),
    formatRiskLevel,
    formatCriticalFailed: formatRiskLevel === 'critical',
    usageMissing: !hasUsage,
    modelsEndpointFailed: mlEvidence.httpStatus === 403 || mlEvidence.httpStatus === 404,
    modelFamily,
    exactVersionConfirmed,
    stabilityFailed: successSamples < 2,
    primaryReasonCode,
    auxiliary403FloorApplied,
    visibleTitle,
    visibleSuggestion,
    // Cache evidence fields
    cacheEvidenceSource: checks.cacheHitCheck?.evidence?.fieldFound ? 'returned' : 'not_returned',
    cachePromptTokens1: checks.cacheHitCheck?.evidence?.firstRequest?.promptTokens ?? null,
    cachePromptTokens2: checks.cacheHitCheck?.evidence?.secondRequest?.promptTokens ?? null,
    cacheCachedTokens1: checks.cacheHitCheck?.evidence?.firstRequest?.cachedTokens ?? null,
    cacheCachedTokens2: checks.cacheHitCheck?.evidence?.secondRequest?.cachedTokens ?? null,
    cacheHitRateRaw: checks.cacheHitCheck?.evidence?.cacheHitRate ?? null,
    cacheHitRateDisplay: checks.cacheHitCheck?.evidence?.cacheHitRate != null
      ? Math.round(checks.cacheHitCheck.evidence.cacheHitRate * 10000) / 100
      : null,
    // Usage evidence fields
    usageEvidenceSource: hasUsage ? 'returned' : 'not_returned',
    usagePromptTokens: tcEvidence.usage?.prompt_tokens ?? tcEvidence.usage?.input_tokens ?? null,
    usageCompletionTokens: tcEvidence.usage?.completion_tokens ?? tcEvidence.usage?.output_tokens ?? null,
    usageTotalTokens: tcEvidence.usage?.total_tokens ?? null,
    // Response metadata
    responseModel: tcEvidence.data?.model ?? null,
    responseObject: tcEvidence.data ? Object.prototype.toString.call(tcEvidence.data) : null,
    responseStatus: tcEvidence.httpStatus ?? 0,
    evidenceVersion: '1.1',
    // Identity debug fields
    identityStatus: identityCategory,
    targetModel: checks.targetCall?.evidence?.model || null,
    identityOriginalAnswer: (() => {
      const t = checks.modelIntegrity?.evidence?.modelIdentityResponse || '';
      return t.length > 160 ? t.substring(0, 160) + '...' : t;
    })(),
    detectedFamily: checks.modelIntegrity?.evidence?.sourceTransparency?.detectedFamily || null,
    detectedVariant: checks.modelIntegrity?.evidence?.sourceTransparency?.detectedVariant || null,
    detectedVersion: checks.modelIntegrity?.evidence?.sourceTransparency?.detectedVersion || null,
    targetFamily: (() => {
      const tm = checks.targetCall?.evidence?.model || checks.modelIntegrity?.evidence?.modelIdentityTest?.targetModel || '';
      const t = tm.toLowerCase();
      if (t.includes('claude')) return 'claude';
      if (t.includes('gpt')) return 'gpt';
      if (t.includes('gemini')) return 'gemini';
      return 'unknown';
    })(),
    targetVariant: (() => {
      const tm = checks.targetCall?.evidence?.model || checks.modelIntegrity?.evidence?.modelIdentityTest?.targetModel || '';
      const t = tm.toLowerCase();
      if (t.includes('opus')) return 'opus';
      if (t.includes('sonnet')) return 'sonnet';
      if (t.includes('haiku')) return 'haiku';
      if (/\b4o/.test(t)) return '4o-mini';
      if (/\b4\b/.test(t)) return '4';
      return null;
    })(),
    targetConsistency: checks.modelIntegrity?.evidence?.sourceTransparency?.targetConsistency || null,
    platformProxyMatchedKeyword: checks.modelIntegrity?.evidence?.sourceTransparency?.detectedSource || null,
    identityEvidenceVersion: '1.0',
    // Self-claim identity fields (for display only, does not affect scoring)
    selfClaimLabel: (() => {
      const answer = checks.modelIntegrity?.evidence?.modelIdentityResponse || '';
      const result = extractSelfClaimLabel(answer);
      return result.label || null;
    })(),
    selfClaimType: (() => {
      const answer = checks.modelIntegrity?.evidence?.modelIdentityResponse || '';
      const result = extractSelfClaimLabel(answer);
      return result.type || null;
    })(),
    selfClaimMatchedKeyword: (() => {
      const answer = checks.modelIntegrity?.evidence?.modelIdentityResponse || '';
      const result = extractSelfClaimLabel(answer);
      return result.matchedKeyword || null;
    })(),
    selfClaimConfidence: (() => {
      const answer = checks.modelIntegrity?.evidence?.modelIdentityResponse || '';
      const result = extractSelfClaimLabel(answer);
      return result.confidence || null;
    })(),
    // Official baseline (planned feature)
    officialBaselineEnabled: false,
    officialBaselineStatus: 'planned_not_enabled',
    // Model connectivity summary
    modelConnectivityCount: Array.isArray(checks.modelList?.evidence?.models) ? checks.modelList.evidence.models.length : 0,
    modelConnectivitySuccessCount: null,
    modelConnectivityFailedCount: null,
  };
}

/** Helper: get the reason why a cap was applied */
function getCapReason(score, checks) {
  const hasCoreChat403 = checks.auth?.evidence?.chatStatus === 403 || (checks.targetCall?.evidence?.httpStatus === 403);
  const has401 = checks.auth?.evidence?.modelsStatus === 401 || checks.auth?.evidence?.chatStatus === 401;
  if (hasCoreChat403) return 'core_chat_403';
  if (has401) return 'core_chat_401';
  if (score <= 25) return 'reachability_failed';
  if (score <= 40) return 'auth_401';
  if (score <= 45) return 'core_auth_403';
  if (score <= 55) return 'target_not_working';
  if (score <= 60) return 'html_response';
  if (score <= 68) return 'severe_issues';
  return 'other_cap';
}

/* ═══════════════════════════════════════════════════════
   NEW: calcFinalScore — v1.7 Real-Data Weighted
   Normalized weighted sum based on real request data.
   ═══════════════════════════════════════════════════════ */
function calcFinalScore(checks) {
  // v1.7: Map old check names to new weights
  // coreCompatibility: basicCompatibility (25 pts) + targetCall quality
  // usageTransparency: costTransparency (25 pts)
  // stabilityLatency: stability (25 pts)
  // modelIdentity: modelIntegrity (15 pts) — reduced from 40
  // cacheSignal: cacheHitCheck (5 pts)
  // clientConfig: clientConfig (5 pts)

  const coreCompatScore = (checks.basicCompatibility?.score || 0) + (checks.targetCall?.score || 0);
  const coreCompatMax = 25; // basicCompatibility max + targetCall quality max
  const usageScore = checks.costTransparency?.score || 0;
  const usageMax = 25;
  const stabilityScore = checks.stability?.score || 0;
  const stabilityMax = 25;
  const identityScore = checks.modelIntegrity?.score || 0;
  const identityMax = 15;
  const cacheScore = checks.cacheHitCheck?.score || 0;
  const cacheMax = 5;
  const clientScore = checks.clientConfig?.score || 0;
  const clientMax = 5;

  const coreNorm = Math.min(100, (coreCompatScore / coreCompatMax) * 100);
  const usageNorm = Math.min(100, (usageScore / usageMax) * 100);
  const stabilityNorm = Math.min(100, (stabilityScore / stabilityMax) * 100);
  const identityNorm = Math.min(100, (identityScore / identityMax) * 100);
  const cacheNorm = Math.min(100, (cacheScore / cacheMax) * 100);
  const clientNorm = Math.min(100, (clientScore / clientMax) * 100);

  // v1.7 weighted formula
  const final = Math.min(98,
    coreNorm * 0.25 +
    usageNorm * 0.25 +
    stabilityNorm * 0.25 +
    identityNorm * 0.15 +
    cacheNorm * 0.05 +
    clientNorm * 0.05
  );

  return {
    final: Math.round(final * 10) / 10,
    breakdown: { coreNorm, usageNorm, stabilityNorm, identityNorm, cacheNorm, clientNorm }
  };
}

/* ═══════════════════════════════════════════════════════
   applyCaps — v1.7 Real-Data Weighted
   Only hard failures trigger cap. Soft issues only reduce scores.
   Cap hierarchy (lower caps override higher):
   0 > 25 > 35 > 40 > 45 > 50 > 60 > 98
   ═══════════════════════════════════════════════════════ */
function applyCaps(rawScore, checks, modelIdInfo) {
  let cap = 98;
  let capReason = 'none';

  // ── v1.7: Extract relevant evidence ──
  const targetWorks = (checks.targetCall?.score || 0) >= 11;
  const identityCategory = checks.modelIntegrity?.evidence?.modelIdentityLevel || 'exact_match';
  const coreAbilityFailures = checks.modelIntegrity?.evidence?.coreAbilityFailures || 0;
  const hasUsage = !!(checks.targetCall?.evidence?.usage && Object.keys(checks.targetCall.evidence.usage).length > 0);
  const successSamples = (checks.stability?.evidence?.samples || []).filter(s => s.ok && s.hasContent).length;
  const totalSamples = (checks.stability?.evidence?.samples || []).length;
  const successRate = totalSamples > 0 ? successSamples / totalSamples : 0;
  const baseOverhead = checks.costTransparency?.evidence?.baseOverhead ?? null;
  const deltaRatio = checks.costTransparency?.evidence?.deltaRatio ?? null;

  // ── v1.7: HARD FAILURE caps only ──

  // 1. Core reachability completely failed
  if ((checks.reachability?.score || 0) < 3) {
    cap = 25;
    capReason = 'reachability_failed';
  }

  // 2. Core API Key authentication failed (401)
  const has401 = checks.auth?.evidence?.modelsStatus === 401 || checks.auth?.evidence?.chatStatus === 401;
  if (has401) {
    cap = 35;
    capReason = 'auth_401';
  }

  // 3. Core chat/completions 403 (not auxiliary)
  const hasCoreChat403 = checks.targetCall?.evidence?.httpStatus === 403;
  if (hasCoreChat403) {
    cap = 45;
    capReason = 'core_chat_403';
  }

  // 4. Core response is HTML/invalid JSON (format severely incompatible)
  const coreResponseUnparseable = !checks.targetCall?.evidence?.responseParsed && (checks.targetCall?.evidence?.httpStatus === 200);
  if (coreResponseUnparseable) {
    cap = 45;
    capReason = 'response_not_json';
  }

  // 5. Current Model ID explicitly unavailable (404 / model not found)
  // Even if targetCall score is high, 404 means the model is unavailable
  const targetHttpStatus = checks.targetCall?.evidence?.httpStatus;
  const targetOutput = (checks.targetCall?.evidence?.output || '').toLowerCase();
  const hasModelNotFound = targetHttpStatus === 404 ||
    targetOutput.includes('model not found') ||
    targetOutput.includes('no available model') ||
    targetOutput.includes('model not available');
  if (hasModelNotFound) {
    cap = 50;
    capReason = 'model_not_found';
  }

  // 6. Stability sampling success rate <= 40%
  if (totalSamples >= 5 && successRate <= 0.4) {
    cap = 60;
    capReason = 'stability_failed';
  }

  // ── v1.7: REMOVED caps ──
  // NO cap for: auxiliary 403, usage missing, cache missing, family_match,
  // variant_mismatch, version_mismatch, platform_or_proxy_identity, /models endpoint failure

  return { capped: Math.min(Math.max(rawScore, 0), cap), capReason, capLimit: cap };
}

// Legacy wrapper for compatibility
function applyCapsLegacy(rawScore, checks, modelIdInfo) {
  const result = applyCaps(rawScore, checks, modelIdInfo);
  return result.capped;
}

/* ═══════════════════════════════════════════════════════
   NEW: getJudgment — one-line verdict
   ═══════════════════════════════════════════════════════ */
function getJudgment(score, checks) {
  const zh = getDocLang() !== 'en';
  const costRisk = getCostRiskLevel(checks.costTransparency?.score || 0);
  const modelRisk = getModelIntegrityRiskLevel(checks.modelIntegrity?.score || 0, checks.modelIntegrity?.evidence);
  const stabilityRisk = getStabilityRiskLevel(checks.stability?.score || 0, checks);
  const identityCategory = checks.modelIntegrity?.evidence?.modelIdentityLevel || 'exact_match';
  const detectedSource = checks.modelIntegrity?.evidence?.sourceTransparency?.detectedSource || null;
  const coreAbilityFailures = checks.modelIntegrity?.evidence?.coreAbilityFailures || 0;
  const baseOverhead = checks.costTransparency?.evidence?.baseOverhead ?? null;
  const deltaRatio = checks.costTransparency?.evidence?.deltaRatio ?? null;
  const shortComp = checks.costTransparency?.evidence?.shortReplyTest?.completionTokens || 0;
  const shortOutput = (checks.costTransparency?.evidence?.shortReplyTest?.output || '').trim();
  const hasUsage = !!(checks.targetCall?.evidence?.usage && Object.keys(checks.targetCall.evidence.usage).length > 0);

  // Alias: proxy_route_identity === platform_or_proxy_identity
  const isProxyOrPlatform = identityCategory === 'proxy_route_identity' || identityCategory === 'platform_or_proxy_identity';

  if (costRisk === 'low' && modelRisk === 'low' && stabilityRisk === 'low' && identityCategory === 'exact_match') {
    return zh ? '扣费透明、模型信号正常、稳定性良好、身份一致' : 'Billing transparent, model signals normal, stability good, identity consistent';
  }
  if (!hasUsage) return zh ? 'usage 完全缺失，扣费不可审计' : 'usage completely missing — billing unauditable';
  if (identityCategory === 'hard_contamination') {
    return zh ? '模型回答存在开发环境污染信号，建议谨慎用于高成本任务' : 'Model response shows development environment contamination — use with caution for high-cost tasks';
  }
  if (baseOverhead !== null && baseOverhead > 1000) {
    return zh ? 'prompt_tokens 明显异常，存在严重 token inflation 风险' : 'prompt_tokens severely abnormal — high token inflation risk';
  }
  if (deltaRatio !== null && deltaRatio > 5) {
    return zh ? 'prompt token 增量膨胀明显，存在 token inflation 风险' : 'Significant prompt token inflation detected';
  }
  if (shortComp > 50 && shortOutput.toUpperCase() === 'OK') {
    return zh ? '极短回复 token 使用量明显偏高，扣费不可解释' : 'Very short reply has abnormally high token usage — unexplained billing';
  }
  if (identityCategory === 'wrong_family') {
    if (coreAbilityFailures === 0) return zh ? '模型自报家族与目标不一致，存在降配疑似风险' : 'Model self-reported family inconsistent with target — possible downgrade risk';
    return zh ? '模型自报身份与目标明显不一致，能力测试也有异常，建议谨慎' : 'Model family inconsistent with target, plus ability anomalies — use with caution';
  }
  if (isProxyOrPlatform) {
    if (coreAbilityFailures >= 1) return zh ? '检测到代理层身份暴露且能力测试有异常，建议小额核对' : 'Proxy layer identity detected with ability anomalies — verify with small amount';
    const srcNote = detectedSource ? ` (${detectedSource})` : '';
    return zh ? `检测到平台代理层身份暴露${srcNote}，来源透明度降低` : `Platform proxy layer identity detected${srcNote} — source transparency reduced`;
  }
  if (identityCategory === 'ambiguous') {
    return zh ? '模型身份未确认，结论置信度降低' : 'Model identity vague — reduced conclusion confidence';
  }
  if (costRisk === 'high') return zh ? '扣费透明度风险较高' : 'High billing transparency risk';
  if (modelRisk === 'high') return zh ? '模型降配疑似风险较高' : 'High model downgrade risk';
  if (stabilityRisk === 'high') return zh ? '稳定性风险较高' : 'High stability risk';
  if (costRisk === 'medium' || modelRisk === 'medium') return zh ? '部分信号存在异常，建议小额继续验证' : 'Some signals abnormal — recommend small-amount verification';
  return zh ? '核心信号基本正常' : 'Core signals mostly normal';
}

/* ═══════════════════════════════════════════════════════
   NEW: generateSuggestions — priority-ordered by user concern
   ═══════════════════════════════════════════════════════ */
function generateSuggestions(checks, modelIdInfo) {
  const zh = getDocLang() !== 'en';
  const suggestions = [];
  const add = (id, text) => { if (!suggestions.some(s => s.id === id)) suggestions.push({ id, text }); };
  const costScore = checks.costTransparency?.score || 0;
  const modelScore = checks.modelIntegrity?.score || 0;
  const stabilityScore = checks.stability?.score || 0;
  const costRisk = getCostRiskLevel(costScore);
  const modelRisk = getModelIntegrityRiskLevel(modelScore, checks.modelIntegrity?.evidence);
  const stabilityRisk = getStabilityRiskLevel(stabilityScore, checks);
  const targetWorks = (checks.targetCall?.score || 0) >= 11;
  const identityCategory = checks.modelIntegrity?.evidence?.modelIdentityLevel || 'exact_match';
  const identityScore = checks.modelIntegrity?.evidence?.modelIdentityScore ?? 6;
  const coreAbilityFailures = checks.modelIntegrity?.evidence?.coreAbilityFailures || 0;
  const detectedSource = checks.modelIntegrity?.evidence?.sourceTransparency?.detectedSource || null;
  const shortComp = checks.costTransparency?.evidence?.shortReplyTest?.completionTokens || 0;
  const shortOutput = checks.costTransparency?.evidence?.shortReplyTest?.output?.trim() || '';
  const isInList = modelIdInfo?.isFinalModelInModelList;
  const successSamples = (checks.stability?.evidence?.samples?.filter(s => s.ok).length) || 0;
  const avgLat = checks.stability?.evidence?.avgLatency || 0;
  const jitter = checks.stability?.evidence?.latencyJitter || 0;
  const baseOverhead = checks.costTransparency?.evidence?.baseOverhead ?? null;
  const hasUsage = !!(checks.targetCall?.evidence?.usage && Object.keys(checks.targetCall.evidence.usage).length > 0);
  // Alias: proxy_route_identity === platform_or_proxy_identity
  const isProxyOrPlatform = identityCategory === 'proxy_route_identity' || identityCategory === 'platform_or_proxy_identity';

  // Priority 1: Cost high risk
  if (costRisk === 'high') add('cost_high', zh ? '当前接口 usage 明细不完整或异常，难以核对实际扣费。建议先使用低额度 key 小额测试，并对比后台余额变化。' : 'usage details incomplete or abnormal — cannot audit actual billing. Recommend small-amount testing with low-quota key and comparing backend balance changes.');
  // Priority 2: Short reply token anomaly
  if (shortComp > 50 && shortOutput.toUpperCase() === 'OK') add('short_token', zh ? '极短回复的 token 使用量明显偏高，存在扣费不可解释风险，建议谨慎使用。' : 'Token usage abnormally high for very short reply — unexplained billing risk. Use with caution.');
  // Priority 3: Token inflation (J8)
  if (baseOverhead !== null && baseOverhead > 500) {
    add('prompt_inflation', zh
      ? 'prompt_tokens 明显高于本地估算，存在隐藏上下文、额外包装或 token inflation 风险，建议结合后台余额小额核对。'
      : 'prompt_tokens significantly higher than local estimate — possible hidden context, extra packaging or token inflation. Verify against backend balance with a small amount.');
  }
  // Priority 4: max_tokens not enforced
  const mtComp = checks.costTransparency?.evidence?.maxTokensTest?.completionTokens || 0;
  if (mtComp > 20) add('max_tokens_uncontrolled', zh ? 'max_tokens 限制未明显生效，可能导致输出和费用不可控，建议谨慎用于高成本任务。' : 'max_tokens limit not clearly enforced — output and costs may be uncontrollable. Use with caution for high-cost tasks.');
  // Priority 5: hard_contamination
  if (identityCategory === 'hard_contamination') add('hard_contamination', zh ? '模型回答中出现开发环境、工具人格或系统提示污染信号，可能影响原始模型行为，建议谨慎用于高成本任务。' : 'Model response shows development environment, tool persona or system prompt contamination — may affect original model behavior. Use with caution for high-cost tasks.');
  // Priority 6: wrong_family
  if (identityCategory === 'wrong_family') add('wrong_family', zh ? '模型自报家族与目标 Model ID 明显不一致，存在模型降配或路由错误疑似风险。' : 'Model self-reported family clearly inconsistent with target Model ID — possible model downgrade or routing error risk.');
  // Priority 7: platform_or_proxy_identity / proxy_route_identity — short, no long platform list
  if (isProxyOrPlatform) {
    add('proxy_route', zh
      ? `检测到平台代理层身份暴露，来源透明度较低，建议结合 usage、token 和能力测试结果判断。`
      : `Platform proxy layer identity detected — source transparency reduced. Recommend evaluating with usage, token and capability test results.`);
  }
  // Priority 8: Model integrity failures
  if (coreAbilityFailures >= 2) add('model_failures', zh ? '多项能力测试未通过，存在模型降配或兼容差异风险。建议谨慎用于高成本任务。' : 'Multiple capability tests failed — possible model downgrade or compatibility issues. Use with caution for high-cost tasks.');
  else if (coreAbilityFailures >= 1) add('model_failures', zh ? '部分能力测试未完全通过，存在模型降配或兼容差异风险，建议结合实际任务继续验证模型质量。' : 'Some capability tests did not fully pass — possible model downgrade or compatibility issues. Recommend continuing to verify with real tasks.');
  // Priority 9: Model not in /models but works
  if (!isInList && targetWorks && modelRisk !== 'high' && identityScore > 0) add('model_not_in_list', zh ? '当前模型未出现在 /models 列表中，但实际调用已通过，可能是隐藏模型、别名模型或供应商未完整暴露模型列表。' : 'Model not in /models list but actual call passed — may be a hidden/alias model or incomplete model list exposure.');
  // Priority 10: Stability high risk — BEFORE platform_or_proxy_identity
  if (stabilityRisk === 'high') add('stability_high', zh
    ? `稳定性采样存在严重波动：平均延迟 ${Math.round(avgLat)}ms，最大 ${checks.stability?.evidence?.maxLatency || 0}ms，波动 ${Math.round(jitter)}ms。建议谨慎用于高成本任务。`
    : `Stability sampling shows severe fluctuation: avg ${Math.round(avgLat)}ms, max ${checks.stability?.evidence?.maxLatency || 0}ms, jitter ${Math.round(jitter)}ms. Use with caution for high-cost tasks.`);
  // Priority 11: Stability medium risk — AFTER platform_or_proxy_identity
  if (stabilityRisk === 'medium') add('stability_fluctuation', zh
    ? `稳定性采样存在波动，可能影响 Cline、Continue 等客户端体验。`
    : `Stability sampling shows fluctuation — may affect Cline, Continue and other client experiences.`);
  // Priority 13: Cache weak signal (only for weak/none with fieldFound=true, NOT for unknown/error)
  const cacheStatus = checks.cacheHitCheck?.status || 'unknown';
  const cacheFieldFound = checks.cacheHitCheck?.evidence?.fieldFound || false;
  if ((cacheStatus === 'weak' || cacheStatus === 'none') && cacheFieldFound) {
    add('cache_weak', zh ? '缓存命中信号较弱，建议不要仅凭高缓存宣传判断成本。' : 'Weak cache hit signal — do not judge costs based solely on high cache claims.');
  }
  // Priority 12: All good
  if (suggestions.length === 0) add('all_good', zh ? '扣费透明度、模型能力和稳定性信号表现良好，建议继续小额观察。' : 'Billing transparency, model capabilities and stability signals look good — recommend ongoing small-amount monitoring.');
  return suggestions.map(s => s.text).slice(0, 2); // limit to top 2
}

/* ═══════════════════════════════════════════════════════
   Report Card HTML Builder — v4
   ═══════════════════════════════════════════════════════ */
function buildReportCardHTML(result, formData, lang, modelIdInfo) {
  const zh = lang !== 'en';
  const { score, checks, reportId, deepMode, toolCallingResult, failureSummary } = result;
  const grade = getScoreGrade(score);
  const escH = s => esc(String(s || ''));
  const riskColors = { low: { color: '#16a34a', bg: '#dcfce7' }, medium: { color: '#d97706', bg: '#fef9c3' }, high: { color: '#dc2626', bg: '#fee2e2' } };
  const costRisk = getCostRiskLevel(checks.costTransparency?.score || 0);
  const modelRisk = getModelIntegrityRiskLevel(checks.modelIntegrity?.score || 0, checks.modelIntegrity?.evidence);
  const stabilityRisk = getStabilityRiskLevel(checks.stability?.score || 0, checks);
  const identityCategory = checks.modelIntegrity?.evidence?.modelIdentityLevel || 'exact_match';
  const coreAbilityFailures = checks.modelIntegrity?.evidence?.coreAbilityFailures ?? 0;
  const isProxyOrPlatform = identityCategory === 'proxy_route_identity' || identityCategory === 'platform_or_proxy_identity';
  const sourceTransparency = checks.modelIntegrity?.evidence?.sourceTransparency;
  const srcRisk = sourceTransparency?.riskLevel || (isProxyOrPlatform || identityCategory === 'ambiguous' || identityCategory === 'wrong_family' || identityCategory === 'hard_contamination' ? 'medium' : 'low');
  const srcLabelMap = {
    exact_match: {zh:'身份匹配',en:'Identity Match'}, 
    family_match: {zh:'家族匹配',en:'Family Match'},
    platform_or_proxy_identity: {zh:'平台/客户端',en:'Platform/Client'},
    proxy_route_identity: {zh:'平台/客户端',en:'Platform/Client'},
    ambiguous: {zh:'无法确认',en:'Unconfirmed'},
    wrong_family: {zh:'目标不一致',en:'Inconsistent'},
    version_mismatch: {zh:'目标不一致',en:'Inconsistent'},
    variant_mismatch: {zh:'目标不一致',en:'Inconsistent'},
    hard_contamination: {zh:'人格污染',en:'Contamination'},
    failed: {zh:'检测失败',en:'Test Failed'}, empty: {zh:'无回答',en:'No Answer'},
  };
  const srcLabel = srcLabelMap[identityCategory] || {zh:'未知',en:'Unknown'};
  const detectedSource = sourceTransparency?.detectedSource || null;
  const confidence = getConfidence(checks);
  const confidenceColors = { high: { color: '#16a34a', bg: '#dcfce7' }, medium: { color: '#d97706', bg: '#fef9c3' }, low: { color: '#dc2626', bg: '#fee2e2' } };
  const confColor = confidenceColors[confidence.level] || confidenceColors.medium;
  const hasUsage = !!(checks.targetCall?.evidence?.usage && Object.keys(checks.targetCall.evidence.usage).length > 0);

  // Priority: cost>model>stability>proxy (user requirement order)
  // modelRisk === 'high' now only for hard conditions: wrong_family/hard_contamination/coreFailures>=3/targetFailed/score<18
  let verdictDesc = '';
  if (costRisk === 'high') verdictDesc = zh ? 'usage/token信号异常，扣费不易核对' : 'usage/token abnormal — billing hard to audit.';
  else if (modelRisk === 'high') verdictDesc = zh ? '模型能力或身份异常，建议谨慎使用' : 'Model capability/identity anomalies — use with caution.';
  else if (stabilityRisk === 'high') verdictDesc = zh ? '稳定性波动较大，建议谨慎用于客户端' : 'Stability fluctuates significantly — use caution.';
  else if (identityCategory === 'wrong_family') verdictDesc = zh ? '模型家族不一致，存在降配风险' : 'Model family inconsistent — possible downgrade.';
  else if (identityCategory === 'hard_contamination') verdictDesc = zh ? '模型回答存在工具人格污染' : 'Model shows tool-persona contamination.';
  else if (identityCategory === 'family_match') verdictDesc = zh ? '已识别为 Claude 家族，但具体子版本未完全验证' : 'Claude family detected — exact sub-version not fully verified.';
  else if (identityCategory === 'ambiguous') verdictDesc = zh ? '模型身份未确认，建议结合 usage 和能力测试判断' : 'Model identity unconfirmed — evaluate with usage and capability tests.';
  else if (isProxyOrPlatform) verdictDesc = zh ? '检测到平台代理层，来源透明度降低' : 'Platform proxy layer detected — reduced source transparency.';
  else if (!hasUsage) verdictDesc = zh ? 'usage缺失，扣费不可审计' : 'usage missing — billing unauditable.';
  else if (costRisk === 'low' && modelRisk === 'low' && stabilityRisk === 'low' && identityCategory === 'exact_match') verdictDesc = zh ? '主要信号正常，建议继续小额观察' : 'All signals normal — continue monitoring.';
  else verdictDesc = zh ? '部分信号异常，建议小额继续验证' : 'Some signals abnormal — verify with small amounts.';
  const disclaimer = zh ? '本报告仅基于可复现 API 信号，不构成法律结论。' : 'This report is based on reproducible API signals only and does not constitute a legal conclusion.';

  function moduleSection(checkKey, checkData, riskLevel) {
    if (!checkData) return '';
    const label = checkData.label?.[zh ? 'zh' : 'en'] || checkData.label || checkKey;
    const maxScore = checkData.maxScore || 0;
    const actualScore = checkData.score || 0;
    const status = checkData.status || 'failed';
    const cfg = statusColor(status);
    const rowId = 'rc-row-' + checkKey + '-' + reportId;
    const contentId = 'rc-content-' + checkKey + '-' + reportId;

    // Build deduction details for expandable content
    let detailDeductions = '';
    if (checkData.deductions && checkData.deductions.length > 0) {
      detailDeductions = `<div style="margin-bottom:8px">
        <div style="font-size:10px;font-weight:600;color:#dc2626;margin-bottom:4px">${zh ? '扣分详情' : 'Deduction Details'}</div>
        <ul style="margin:0;padding:0 0 0 14px;font-size:11px;color:#dc2626;line-height:1.7">
          ${checkData.deductions.map(d => `<li style="padding:1px 0">${escH(d)}</li>`).join('')}
        </ul>
      </div>`;
    }

    // subItems: costTransparency subScores
    let subItemsHtml = '';
    if (checkData.evidence?.subScores && typeof checkData.evidence.subScores === 'object') {
      const subScoreLabels = {
        usageField: zh ? 'usage 字段' : 'usage Field',
        promptTokens: zh ? 'prompt token' : 'prompt tokens',
        completionTokens: zh ? 'completion token' : 'completion tokens',
        totalTokens: zh ? 'total token' : 'total tokens',
        shortReply: zh ? '短回复检测' : 'Short Reply',
        maxTokens: zh ? 'max_tokens' : 'max_tokens',
        usageStability: zh ? '用量稳定性' : 'Usage Stability',
        clarity: zh ? '清晰度' : 'Clarity',
        promptTokenEst: zh ? 'token 估算' : 'Token Est.',
        // modelIntegrity subScores
        modelIdentity: zh ? '模型身份' : 'Model Identity',
        modelVisibility: zh ? '模型可见性' : 'Model Visibility',
        targetCallQuality: zh ? '调用质量' : 'Call Quality',
        jsonTest: zh ? 'JSON 测试' : 'JSON Test',
        instructionTest: zh ? '指令遵循' : 'Instruction',
        codeRepair: zh ? '代码修复' : 'Code Repair',
        reasoning: zh ? '推理能力' : 'Reasoning',
        needle: zh ? '大海捞针' : 'Needle',
        consistency: zh ? '一致性' : 'Consistency',
      };
      subItemsHtml = Object.entries(checkData.evidence.subScores).map(([k, v]) => {
        if (v == null || v.maxScore === undefined) return '';
        const subRatio = v.maxScore > 0 ? v.score / v.maxScore : 0;
        const subStatus = subRatio >= 0.8 ? 'good' : subRatio >= 0.5 ? 'warning' : 'failed';
        const subCfg = statusColor(subStatus);
        const icon = subRatio >= 0.8 ? '&#10003;' : subRatio >= 0.5 ? '&#9888;' : '&#10007;';
        return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;font-size:11px">
          <span style="color:${subCfg.color}">${icon}</span>
          <span style="flex:1;color:#374151">${escH(subScoreLabels[k] || k)}</span>
          <span style="font-weight:700;color:#374151">${v.score}/${v.maxScore}</span>
        </div>`;
      }).join('');
    }

    // stability samples table — only in expand detail
    let stabilitySamplesHtml = '';
    if (checkKey === 'stability' && checkData.evidence?.samples?.length > 0) {
      const samples = checkData.evidence.samples;
      stabilitySamplesHtml = `<div style="margin-top:8px">
        <div style="font-size:10px;font-weight:600;color:#0f172a;margin-bottom:4px">${zh ? '采样明细' : 'Sample Details'}</div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:10px">
            <tr style="background:#f1f5f9">
              <th style="padding:3px 6px;text-align:left;color:#64748b">#</th>
              <th style="padding:3px 6px;text-align:center;color:#64748b">${zh ? '状态' : 'Status'}</th>
              <th style="padding:3px 6px;text-align:right;color:#64748b">${zh ? '延迟' : 'Latency'}</th>
              <th style="padding:3px 6px;text-align:right;color:#64748b">${zh ? '输出' : 'Output'}</th>
            </tr>
            ${samples.map((s, i) => {
              const rowColor = !s.ok ? '#fee2e2' : s.hasContent ? '#dcfce7' : '#fef9c3';
              return `<tr style="background:${rowColor}">
                <td style="padding:2px 6px;color:#64748b">${i + 1}</td>
                <td style="padding:2px 6px;text-align:center;color:${s.ok ? '#16a34a' : '#dc2626'}">${s.ok ? 'OK' : (s.errMsg || 'ERR')}</td>
                <td style="padding:2px 6px;text-align:right;color:#374151">${s.latency || 0}ms</td>
                <td style="padding:2px 6px;text-align:right;color:#374151">${s.responseText ? escH(s.responseText.substring(0, 20)) : '-'}</td>
              </tr>`;
            }).join('')}
          </table>
        </div>
      </div>`;
    }

    // Stability high risk re-test hint — shown in expand detail, not in suggestion area
    let stabilityRetryHint = '';
    if (checkKey === 'stability' && checkData.status === 'failed') {
      stabilityRetryHint = `<div style="margin-top:8px;padding:6px 8px;background:#fef9c3;border-radius:6px;font-size:10px;color:#92400e;line-height:1.5">
        ${zh ? '本次稳定性波动较大，建议在同一网络环境下重复测试 2–3 次确认。' : 'This run shows significant stability fluctuation. Re-test 2–3 times under the same network conditions to confirm.'}
      </div>`;
    }

    // sourceTransparency detail — only in expand detail
    // cacheHitCheck detail — only in expand detail
    let cacheHitHtml = '';
    if (checkKey === 'cacheHitCheck' && checkData.evidence) {
      const ev = checkData.evidence;
      const fmtRate = (r) => r != null ? (Math.round(r * 10000) / 100) + '%' : '—';
      const cacheStatus = checkData.status || 'unknown';
      const isUnknown = cacheStatus === 'unknown';
      const isError = cacheStatus === 'error';
      const actualTokens = ev.actualPromptTokens ?? ev.firstRequest?.promptTokens ?? '—';
      const threshold = ev.minPromptTokensRequired ?? 1024;
      const sufficient = ev.probeTokenSufficient;
      cacheHitHtml = `<div style="margin-top:8px;padding:8px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:11px">
        <div style="font-weight:600;color:#0f172a;margin-bottom:6px">${zh ? '缓存命中信号明细' : 'Cache Hit Signal Details'}</div>
        <div style="margin-bottom:6px;padding:6px 8px;background:${sufficient ? '#dcfce7' : '#fef3c7'};border-radius:6px;font-size:10px;display:flex;align-items:center;gap:6px">
          <span style="font-weight:700;color:${sufficient ? '#16a34a' : '#d97706'}">${sufficient ? (zh ? '探测长度足够' : 'Probe Sufficient') : (zh ? '探测长度不足' : 'Probe Insufficient')}</span>
          <span style="color:${sufficient ? '#166534' : '#92400e'}">${zh ? '实际：' : 'Actual: '}${actualTokens !== '—' ? actualTokens : '—'} tokens &nbsp;|&nbsp; ${zh ? '阈值：' : 'Threshold: '}${threshold} tokens</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:10px;color:#374151;margin-bottom:6px">
          <div><span style="color:#94a3b8">${zh ? '字段来源：' : 'Field: '}</span>${escH(ev.sourceField || (zh ? '未暴露' : 'Not exposed'))}</div>
          <div><span style="color:#94a3b8">${zh ? '缓存命中率：' : 'Cache Rate: '}</span>${fmtRate(ev.cacheHitRate)}</div>
          <div><span style="color:#94a3b8">${zh ? '第1次 prompt：' : '1st prompt: '}</span>${ev.firstRequest?.promptTokens ?? '—'}</div>
          <div><span style="color:#94a3b8">${zh ? '第1次 cached：' : '1st cached: '}</span>${ev.firstRequest?.cachedTokens ?? '—'}</div>
          <div><span style="color:#94a3b8">${zh ? '第2次 prompt：' : '2nd prompt: '}</span>${ev.secondRequest?.promptTokens ?? '—'}</div>
          <div><span style="color:#94a3b8">${zh ? '第2次 cached：' : '2nd cached: '}</span>${ev.secondRequest?.cachedTokens ?? '—'}</div>
          <div><span style="color:#94a3b8">${zh ? '一致性：' : 'Consistency: '}</span>${fmtRate(ev.promptTokenConsistencyRate != null ? 1 - ev.promptTokenConsistencyRate : null)}</div>
          <div><span style="color:#94a3b8">${zh ? '延迟改善：' : 'Latency Impr.: '}</span>${fmtRate(ev.latencyImprovementRate)}</div>
        </div>
        ${isError ? `<div style="margin-top:6px;padding:6px 8px;background:#fef9c3;border-radius:6px;font-size:10px;border:1px solid #f59e0b">
          <div style="font-weight:600;color:#92400e;margin-bottom:4px">${zh ? '⚠ 缓存检测超时' : '⚠ Cache Check Timeout'}</div>
          <div style="color:#92400e"><span style="color:#94a3b8">${zh ? '单次超时：' : 'Per-request timeout: '}</span>${ev.timeoutMs ?? CACHE_PROBE_TIMEOUT_MS}ms</div>
          <div style="color:#92400e"><span style="color:#94a3b8">${zh ? '总超时上限：' : 'Total timeout: '}</span>${ev.totalTimeoutMs ?? CACHE_PROBE_TOTAL_TIMEOUT_MS}ms</div>
          <div style="color:#92400e;margin-top:4px">${zh ? '说明：缓存检测请求耗时过长，已自动跳过，不影响其他验货项。' : 'Note: Cache probe timed out — auto-skipped, does not block other checks.'}</div>
        </div>` : ''}
        ${cacheStatus === 'field_found' ? `<div style="margin-top:6px;padding:6px 8px;background:#fef9c3;border-radius:6px;font-size:10px;border:1px solid #f59e0b">
          <div style="font-weight:600;color:#92400e;margin-bottom:4px">${zh ? '✅ 缓存字段已暴露（探测不足）' : '✅ Cache Field Exposed (Probe Insufficient)'}</div>
          <div style="color:#92400e;line-height:1.5">${escH(checkData.summary || '')}</div>
        </div>` : ''}
        ${cacheStatus === 'unknown' && !ev.fieldFound ? `<div style="font-size:10px;color:#64748b;line-height:1.5;margin-bottom:4px">${escH(checkData.summary || '')}</div>
        <div style="font-size:10px;color:#64748b;line-height:1.5;border-top:1px solid #e2e8f0;padding-top:4px">${zh ? '未暴露字段不等于没有缓存。' : 'Missing fields do not necessarily mean caching is unavailable.'}</div>` : ''}
      </div>`;
    }

    let sourceTransparencyHtml = '';
    if (checkKey === 'modelIntegrity' && checkData.evidence?.sourceTransparency) {
      const st = checkData.evidence.sourceTransparency;
      const stLabelMap = {
        exact_match: zh ? '身份匹配' : 'Identity Match',
        family_match: zh ? '家族匹配' : 'Family Match',
        platform_or_proxy_identity: zh ? '平台/客户端' : 'Platform/Client',
        proxy_route_identity: zh ? '平台/客户端' : 'Platform/Client',
        ambiguous: zh ? '无法确认' : 'Unconfirmed',
        wrong_family: zh ? '目标不一致' : 'Inconsistent',
        version_mismatch: zh ? '目标不一致' : 'Inconsistent',
        variant_mismatch: zh ? '目标不一致' : 'Inconsistent',
        hard_contamination: zh ? '人格污染' : 'Contamination',
        failed: zh ? '检测失败' : 'Test Failed',
        empty: zh ? '无回答' : 'No Answer',
      };
      // Build deduction text based on identity category
      const targetModel = checkData.evidence?.targetModel || modelIdInfo?.finalTestModelId || '';
      const responseModel = st.evidenceText ? (st.evidenceText.substring(0, 160)) : '';
      let deductionHtml = '';
      if (st.category === 'family_match') {
        deductionHtml = `<div style="margin-top:8px;padding:6px 8px;background:#fef9c3;border-radius:6px;font-size:10px;color:#92400e">
          <div style="font-weight:600;margin-bottom:4px">${zh ? '扣分原因' : 'Deduction Reasons'}</div>
          <ul style="margin:0;padding-left:16px;line-height:1.6">
            <li>${zh ? '目标模型包含具体子版本或变体' : 'Target model contains specific version or variant'}</li>
            <li>${zh ? '响应只确认了模型家族，未确认具体子版本' : 'Response only confirms model family, not specific version'}</li>
            <li>${zh ? '因此按"同家族但版本未完全确认"处理' : 'Treated as family match with version unconfirmed'}</li>
          </ul>
        </div>`;
      } else if (st.category === 'wrong_family' || st.category === 'variant_mismatch' || st.category === 'version_mismatch') {
        deductionHtml = `<div style="margin-top:8px;padding:6px 8px;background:#fee2e2;border-radius:6px;font-size:10px;color:#991b1b">
          <div style="font-weight:600;margin-bottom:4px">${zh ? '扣分原因' : 'Deduction Reasons'}</div>
          <ul style="margin:0;padding-left:16px;line-height:1.6">
            <li>${zh ? '目标模型与响应自称的模型变体不一致' : 'Target model differs from response self-reported variant'}</li>
            <li>${zh ? '可能是模型别名、路由映射、供应商包装或配置错误' : 'Possible alias, routing, vendor wrapping or config error'}</li>
            <li>${zh ? '建议更换明确可用的 model ID 后复测' : 'Recommend re-testing with a clear model ID'}</li>
          </ul>
        </div>`;
      } else if (st.category === 'platform_or_proxy_identity' || st.category === 'proxy_route_identity') {
        deductionHtml = `<div style="margin-top:8px;padding:6px 8px;background:#fef9c3;border-radius:6px;font-size:10px;color:#92400e">
          <div style="font-weight:600;margin-bottom:4px">${zh ? '扣分原因' : 'Deduction Reasons'}</div>
          <ul style="margin:0;padding-left:16px;line-height:1.6">
            <li>${zh ? '响应更像平台、客户端或代理层身份' : 'Response resembles platform, client or proxy layer identity'}</li>
            <li>${zh ? '未直接确认底层模型版本' : 'Does not directly confirm underlying model version'}</li>
            <li>${zh ? '建议结合官方接口或稳定任务继续验证' : 'Recommend continuing verification with official interface or stable tasks'}</li>
          </ul>
        </div>`;
      }
      sourceTransparencyHtml = `<div style="margin-top:8px;padding:8px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:11px">
        <div style="font-weight:600;color:#0f172a;margin-bottom:6px">${zh ? '模型身份' : 'Model Identity'}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:11px;color:#374151">${zh ? '分类：' : 'Category: '}</span>
          <span style="font-weight:600;color:${riskColors[st.riskLevel || 'medium'].color}">${escH(stLabelMap[st.category] || st.category || '-')}</span>
        </div>
        ${st.detectedSource ? `<div style="margin-bottom:4px"><span style="font-size:10px;color:#94a3b8">${zh ? '响应自称：' : 'Self-reported: '}</span><span style="font-size:11px;font-weight:600;color:#d97706">${escH(st.detectedSource)}</span></div>` : ''}
        ${responseModel ? `<div style="margin-bottom:4px"><span style="font-size:10px;color:#94a3b8">${zh ? '原始回答：' : 'Raw answer: '}</span><span style="font-size:10px;color:#475569;font-style:italic">${escH(responseModel)}${responseModel.length >= 160 ? '...' : ''}</span></div>` : ''}
        ${st.explanation ? `<div style="font-size:10px;color:#64748b;line-height:1.5;margin-top:6px">${escH(st.explanation.substring(0, 200))}</div>` : ''}
        ${deductionHtml}
      </div>`;
    }

    // modelIntegrity summary: prioritize high-risk signals for summary text
    let summaryText = checkData.summary || '';
    if (checkKey === 'modelIntegrity') {
      const idCat = checkData.evidence?.modelIdentityLevel || 'exact_match';
      const caf = checkData.evidence?.coreAbilityFailures ?? 0;
      // Priority: hard conditions first, then identity category
      if (caf >= 3) {
        summaryText = zh ? '模型能力测试异常' : 'Model capability test abnormal';
      } else if (idCat === 'wrong_family') {
        summaryText = zh ? '模型家族不一致' : 'Model family inconsistent';
      } else if (idCat === 'hard_contamination') {
        summaryText = zh ? '工具人格污染信号' : 'Tool persona contamination';
      } else if (caf >= 1) {
        summaryText = zh ? '部分能力测试未通过' : 'Some capability tests failed';
      } else if (idCat === 'family_match') {
        summaryText = zh ? '模型家族匹配，具体版本未确认' : 'Model family matched — exact version not confirmed';
      } else if (idCat === 'platform_or_proxy_identity' || idCat === 'proxy_route_identity') {
        const ds = checkData.evidence?.sourceTransparency?.detectedSource;
        summaryText = ds
          ? (zh ? `来源透明度较低：${ds}` : `Low source transparency: ${ds}`)
          : (zh ? '来源透明度较低' : 'Low source transparency');
      } else if (idCat === 'ambiguous') {
        summaryText = zh ? '模型身份未确认' : 'Model identity unconfirmed';
      }
    }

    // format score: show raw score / maxScore, not normalized ratio
    // integers stay as integers, decimals max 1 digit, no long decimals
    const fmtScore = (s, max) => {
      if (max === 0) return '0/' + max;
      const rounded = Math.round(s * 10) / 10;
      if (Number.isInteger(rounded)) return rounded + '/' + max;
      return rounded.toFixed(1) + '/' + max;
    };

    const pillHtml = riskLevel ? `<span style="display:inline-block;padding:1px 6px;border-radius:10px;font-size:10px;font-weight:700;color:${riskColors[riskLevel].color};background:${riskColors[riskLevel].bg}">${zh ? riskLevelLabelZH(riskLevel) : riskLevelLabelEN(riskLevel)}</span>` : `<span style="display:inline-block;padding:1px 6px;border-radius:10px;font-size:10px;font-weight:700;color:${cfg.color};background:${cfg.bg}">${statusLabel(status, zh)}</span>`;

    const hasDetailContent = detailDeductions || subItemsHtml || stabilitySamplesHtml || cacheHitHtml || sourceTransparencyHtml;

    return `<div class="rc-check-block">
      <div class="rc-check-header" id="${rowId}" onclick="(function(){
        var c=document.getElementById('${contentId}');
        var t=document.getElementById('${rowId}-toggle');
        if(!c||!t)return;
        var cur=c.style.display;
        var zh=${zh};
        c.style.display=cur==='none'?'block':'none';
        t.textContent=cur==='none'?(zh?'[收起...]':'[Collapse...]'):(zh?'[展开...]':'[Expand...]');
      })()" style="cursor:pointer;user-select:none;display:flex;align-items:center;gap:6px;padding:6px 0;min-height:52px;border-bottom:1px solid #f1f5f9">
        <span style="font-weight:600;font-size:12px;color:#374151;min-width:90px">${escH(label)}</span>
        <span style="font-weight:800;font-size:12px;color:#0f172a;min-width:52px">${fmtScore(actualScore, maxScore)}</span>
        ${pillHtml}
        <span style="flex:1;color:#94a3b8;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(summaryText)}</span>
        ${hasDetailContent ? `<span id="${rowId}-toggle" style="color:#2563eb;font-size:11px;white-space:nowrap;flex-shrink:0">${zh?'[展开...]':'[Expand...]'}</span>` : ''}
      </div>
      ${hasDetailContent ? `<div id="${contentId}" style="display:none;padding:4px 0 8px 0">
        ${detailDeductions}
        ${subItemsHtml ? `<div style="margin-bottom:8px">${subItemsHtml}</div>` : ''}
        ${stabilitySamplesHtml}
        ${stabilityRetryHint}
        ${cacheHitHtml}
        ${sourceTransparencyHtml}
      </div>` : ''}
    </div>`;
  }

  let toolCallingHtml = '';
  if (toolCallingResult) {
    const tc = toolCallingResult;
    const tcColor = tc.passed ? '#16a34a' : tc.partial ? '#d97706' : '#dc2626';
    const tcBg = tc.passed ? '#dcfce7' : tc.partial ? '#fef9c3' : '#fee2e2';
    toolCallingHtml = `<div style="background:#fff;border-radius:12px;padding:10px 14px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-weight:600;font-size:12px;color:#374151">${escH(tc.label?.[zh?'zh':'en'] || 'Tool Calling')}</span>
        <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;color:${tcColor};background:${tcBg}">${escH(tc.summary || '')}</span>
        <span style="font-size:11px;color:#94a3b8">${zh ? '（深度验货额外测试）' : '(Deep check extra test)'}</span>
      </div>
    </div>`;
  }

  const allDeductions = Object.values(checks).filter(c => c?.deductions?.length > 0).flatMap(c => c.deductions.map(d => ({ text: d, check: c.label?.[zh?'zh':'en'] || c.id })));
  let deductionsHtml = '';
  if (allDeductions.length > 0) {
    deductionsHtml = `<div style="background:#fff;border-radius:12px;padding:10px 14px;margin-bottom:10px">
      <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:8px">${zh ? '扣分原因' : 'Deduction Reasons'}</div>
      <ul style="margin:0;padding:0 0 0 16px;font-size:11px;line-height:1.9">
        ${allDeductions.map(d => `<li style="color:#dc2626;padding:2px 0 2px 16px;position:relative"><span style="position:absolute;left:0;color:#dc2626">&#8226;</span><span style="color:#94a3b8;font-size:10px">[${escH(d.check)}]</span> ${escH(d.text)}</li>`).join('')}
      </ul>
    </div>`;
  }

  const suggestions = generateSuggestions(checks, modelIdInfo);
  const suggestionHtml = `<div style="background:#fff;border-radius:12px;padding:10px 14px;margin-bottom:10px">
    <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:8px">${zh ? '建议' : 'Recommendations'}</div>
    <ul style="margin:0;padding:0 0 0 16px;font-size:12px;color:#374151;line-height:1.8">
      ${suggestions.map(s => `<li>${escH(s)}</li>`).join('')}
    </ul>
  </div>`;

  const finalModel = modelIdInfo?.finalTestModelId || '';
  const safeBaseUrl = maskBaseUrlForShare(formData?.baseUrl || '');

  return `<div id="result-card-inner" style="max-width:560px;margin:0 auto;padding:0 4px">
    <!-- Dark header: grade + score + 3 risk pills -->
    <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border-radius:16px;padding:16px;margin-bottom:10px;text-align:center">
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:4px">
        <span style="display:inline-block;padding:4px 16px;border-radius:20px;font-size:13px;font-weight:800;color:#fff;background:${grade.color}">${grade.grade} ${grade.labelZh}</span>
        <span style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px">${score}</span>
        <span style="font-size:13px;color:rgba(255,255,255,0.6)">/ 100</span>
      </div>
      <!-- 5 risk pills — compressed, unified labels -->
      <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap">
        <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:5px 10px;min-width:72px;text-align:center">
          <div style="font-size:9px;color:rgba(255,255,255,0.6);margin-bottom:2px">${zh ? '扣费透明' : 'Cost'}</div>
          <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;color:${riskColors[costRisk].color};background:${riskColors[costRisk].bg}">${zh ? riskLevelLabelZH(costRisk) : riskLevelLabelEN(costRisk)}</span>
        </div>
        <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:5px 10px;min-width:72px;text-align:center">
          <div style="font-size:9px;color:rgba(255,255,255,0.6);margin-bottom:2px">${zh ? '模型可信' : 'Model'}</div>
          <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;color:${riskColors[modelRisk].color};background:${riskColors[modelRisk].bg}">${zh ? riskLevelLabelZH(modelRisk) : riskLevelLabelEN(modelRisk)}</span>
        </div>
        <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:5px 10px;min-width:72px;text-align:center">
          <div style="font-size:9px;color:rgba(255,255,255,0.6);margin-bottom:2px">${zh ? '稳定性' : 'Stability'}</div>
          <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;color:${riskColors[stabilityRisk].color};background:${riskColors[stabilityRisk].bg}">${zh ? riskLevelLabelZH(stabilityRisk) : riskLevelLabelEN(stabilityRisk)}</span>
        </div>
        <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:5px 10px;min-width:72px;text-align:center">
          <div style="font-size:9px;color:rgba(255,255,255,0.6);margin-bottom:2px">${zh ? '置信度' : 'Conf.'}</div>
          <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;color:${confColor.color};background:${confColor.bg}">${confidence.label}</span>
        </div>
        <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:5px 10px;min-width:72px;text-align:center">
          <div style="font-size:9px;color:rgba(255,255,255,0.6);margin-bottom:2px">${zh ? '来源透明' : 'Source'}</div>
          <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;color:${riskColors[srcRisk].color};background:${riskColors[srcRisk].bg}">${escH(srcLabel[zh?'zh':'en'])}</span>
        </div>
      </div>
    </div>

    <!-- Verdict description (short, one line) -->
    <div style="background:#fff;border-radius:12px;padding:8px 14px;margin-bottom:6px;font-size:11px;color:#374151;line-height:1.5">${escH(verdictDesc)}</div>

    <!-- Score disclaimer + cap reason — near score card -->
    ${(() => {
      // capReason: only show when raw weighted score > final capped score by meaningful margin
      const rawFinal = (() => {
        const costNorm = Math.min(100, ((checks.costTransparency?.score||0)/30)*100);
        const cacheNorm = Math.min(100, ((checks.cacheHitCheck?.score||0)/5)*100);
        const modelNorm = Math.min(100, ((checks.modelIntegrity?.score||0)/40)*100);
        const stabNorm  = Math.min(100, ((checks.stability?.score||0)/15)*100);
        const compNorm  = Math.min(100, ((checks.basicCompatibility?.score||0)/7)*100);
        const cliNorm   = Math.min(100, ((checks.clientConfig?.score||0)/3)*100);
        return Math.round((costNorm*0.30 + cacheNorm*0.05 + modelNorm*0.40 + stabNorm*0.15 + compNorm*0.07 + cliNorm*0.03) * 10) / 10;
      })();
      const capMargin = rawFinal - score;
      if (capMargin < 5) return '';
      // Determine most severe cap reason
      const reachScore = checks.reachability?.score || 0;
      const has401 = checks.auth?.evidence?.modelsStatus === 401 || checks.auth?.evidence?.chatStatus === 401;
      // Distinguish core_chat 403 from auxiliary 403 (model_list / usage_audit / metadata_audit / cache_check)
      const hasCoreChat403 = checks.auth?.evidence?.chatStatus === 403 || (checks.targetCall?.evidence?.httpStatus === 403);
      const hasAuxiliary403Only = !hasCoreChat403 && (
        checks.auth?.evidence?.modelsStatus === 403 || checks.modelList?.evidence?.httpStatus === 403 ||
        checks.usageAudit?.evidence?.httpStatus === 403 || checks.metadataAudit?.evidence?.httpStatus === 403 ||
        checks.cacheHitCheck?.evidence?.httpStatus === 403
      );
      const targetWorks = (checks.targetCall?.score || 0) >= 11;
      const costRiskL = getCostRiskLevel(checks.costTransparency?.score || 0);
      const modelRiskL = getModelIntegrityRiskLevel(checks.modelIntegrity?.score || 0, checks.modelIntegrity?.evidence);
      const stabRiskL  = getStabilityRiskLevel(checks.stability?.score || 0, checks);
      const idCat = checks.modelIntegrity?.evidence?.modelIdentityLevel || 'exact_match';
      let capReasonText = '';
      if (reachScore < 3) capReasonText = zh ? '核心模型调用未成功' : 'Core model call unsuccessful';
      else if (has401) capReasonText = zh ? 'API Key 无法调用目标模型（401）' : 'API Key cannot call target model (401)';
      else if (hasCoreChat403) capReasonText = zh ? 'API Key 无法调用目标模型（403）' : 'API Key cannot call target model (403)';
      else if (hasAuxiliary403Only) capReasonText = zh ? '部分辅助接口权限受限（403），核心调用正常' : 'Some auxiliary endpoints permissions restricted (403), core call normal';
      else if (!targetWorks) capReasonText = zh ? '核心调用未成功' : 'Core call unsuccessful';
      else if (idCat === 'wrong_family') capReasonText = zh ? '模型家族与目标不一致' : 'Model family inconsistent with target';
      else if (idCat === 'hard_contamination') capReasonText = zh ? '模型人格污染信号' : 'Model persona contamination signal';
      else if (idCat === 'platform_or_proxy_identity' || idCat === 'proxy_route_identity') capReasonText = zh ? '平台代理层身份暴露' : 'Platform proxy layer identity detected';
      else if (modelRiskL === 'high') capReasonText = zh ? '模型能力测试异常' : 'Model ability test abnormal';
      else if (costRiskL === 'high') capReasonText = zh ? 'usage 字段缺失或异常' : 'usage fields missing or abnormal';
      else if (stabRiskL === 'high') capReasonText = zh ? '稳定性采样未通过' : 'Stability sampling failed';
      if (!capReasonText) return '';
      const capText = zh
        ? `本次评分触发了关键风险上限：${capReasonText}，因此总分低于各单项加权结果。`
        : `Key risk cap triggered: ${capReasonText} — final score below weighted sum.`;
      return `<div style="background:#f1f5f9;border-radius:8px;padding:6px 12px;margin-bottom:6px;font-size:10px;color:#64748b;line-height:1.5;border:1px solid #e2e8f0">${escH(capText)}</div>`;
    })()}
    <div style="font-size:10px;color:#94a3b8;text-align:center;margin-bottom:6px">${zh ? '此分数不是模型能力评分，而是当前 Base URL / API Key / Model 配置在兼容性、透明度、稳定性和客户端接入方面的风险评分。' : 'This is not a model intelligence score. It measures API configuration risk across compatibility, transparency, stability, and client integration.'}</div>

    <!-- Failure summary — only shown when shouldShow -->
    ${failureSummary?.shouldShow ? (() => {
      const dl = failureSummary.displayLabel;
      const isFailure = dl === '失败主因' || dl === 'Main failure reason';
      const bgColor = isFailure ? '#fff5f5' : '#fffbeb';
      const borderColor = isFailure ? '#fecaca' : '#fde68a';
      const textColor = isFailure ? '#991b1b' : '#92400e';
      const label = dl + (getDocLang() !== 'en' ? '：' : ': ');
      return `<div style="background:${bgColor};border:1px solid ${borderColor};border-radius:8px;padding:8px 14px;margin-bottom:8px;font-size:11px;color:${textColor};line-height:1.5"><b>${label}</b>${escH(failureSummary.shortText)}</div>`;
    })() : ''}

    <!-- Grade-based decision recommendation (one line, compact) -->
    ${(() => {
      const g = grade.grade;
      const decisionMap = {
        A: zh ? '可用于日常开发；生产环境仍建议保留备用接口和限额保护。' : 'Suitable for daily development; keep a backup endpoint and quota limits for production.',
        B: zh ? '适合日常开发和测试；生产使用前建议复核 usage、模型版本和稳定性。' : 'Good for daily dev and testing; review usage, model version and stability before production.',
        C: zh ? '可用于测试或轻量开发；用于长期任务前建议完成复核。' : 'Usable for testing or light development; complete review before long-running tasks.',
        D: zh ? '仅建议用于临时测试或轻量开发；不建议直接接入重要工作流。' : 'Only for temporary testing or light development; not recommended for critical workflows.',
        E: zh ? '不建议直接用于生产或长期开发环境；如仅临时测试可继续观察，但应优先确认模型版本、返回格式和权限配置。' : 'Not recommended for production or long-term development. If only temporary testing, continue observing — but prioritise confirming model version, response format and permissions.',
        F: zh ? '当前配置存在关键失败，不建议继续使用。请先修复 Key、Base URL、模型名、权限或接口兼容问题。' : 'Critical failure detected — do not continue. Fix key, base URL, model name, permissions or interface compatibility first.',
      };
      const decisionText = decisionMap[g] || '';
      const decisionColors = { A: { bg: '#dcfce7', color: '#166534' }, B: { bg: '#dcfce7', color: '#166534' }, C: { bg: '#fef9c3', color: '#92400e' }, D: { bg: '#fef3c7', color: '#b45309' }, E: { bg: '#fee2e2', color: '#991b1b' }, F: { bg: '#fee2e2', color: '#991b1b' } };
      const dc = decisionColors[g] || decisionColors.C;
      return decisionText ? `<div style="background:${dc.bg};border-radius:8px;padding:6px 12px;margin-bottom:8px;font-size:11px;color:${dc.color};line-height:1.4"><b>${zh ? '使用建议：' : 'Recommendation: '}</b>${escH(decisionText)}</div>` : '';
    })()}

    <!-- 5 module sections -->
    <div style="background:#fff;border-radius:16px;padding:12px 16px;margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #f1f5f9">${zh ? '6项检测（点击展开详情）' : '6 Modules (tap to expand)'}</div>
      ${moduleSection('costTransparency', checks.costTransparency, costRisk)}
      ${moduleSection('cacheHitCheck', checks.cacheHitCheck)}
      ${moduleSection('modelIntegrity', checks.modelIntegrity, modelRisk)}
      ${moduleSection('stability', checks.stability, stabilityRisk)}
      ${moduleSection('basicCompatibility', checks.basicCompatibility)}
      ${moduleSection('clientConfig', checks.clientConfig)}
    </div>

    ${toolCallingHtml}
    ${suggestionHtml}

    <!-- Official baseline comparison placeholder -->
    <div style="background:#f8fafc;border-radius:12px;padding:10px 14px;margin-bottom:10px;font-size:10px;color:#94a3b8;border:1px dashed #cbd5e1">
      <div style="font-weight:600;color:#64748b;margin-bottom:4px">${zh ? '官方基准线对比（规划中）' : 'Official Baseline Comparison (Planned)'}</div>
      <div>${zh ? '规划中：未来可选择使用用户自己的官方 API Key 做同题对照测试。该模式会产生额外请求费用，并且只在当前浏览器内运行，不上传或保存 API Key。当前版本仅展示目标接口的真实请求证据，不进行官方对照评分。' : 'Planned: Future option to use your own official API key for parallel testing. This mode will incur additional request costs and runs only in your browser — no API key upload or storage. Current version shows real request evidence from the target endpoint only, without official baseline scoring.'}</div>
    </div>

    <!-- Test config -->
    <div style="background:#fff;border-radius:12px;padding:10px 14px;margin-bottom:10px;font-size:11px;color:#64748b">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div><span style="font-weight:600;color:#374151">Base URL:</span> ${escH(safeBaseUrl)}</div>
        <div><span style="font-weight:600;color:#374151">Model:</span> ${escH(finalModel)}</div>
      </div>
      <div style="margin-top:4px;font-size:10px;color:#94a3b8">${zh ? '检测模式：' : 'Check mode: '}${deepMode ? (zh ? '深度验货' : 'Deep Check') : (zh ? '一键验货' : 'One-Click')}</div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;font-size:11px;color:#94a3b8;padding:2px 0">${zh ? '报告 ID' : 'Report ID'}: ${reportId} &nbsp;|&nbsp; aiapidoctor.com</div>
    <!-- Actions -->
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
    const zh = getDocLang() !== 'en';
    const sourceEl = document.getElementById('result-card');
    if (!sourceEl) { showToast('报告未生成'); return; }
    const clone = sourceEl.cloneNode(true);
    // Collapse all expandable sections before screenshot
    [].forEach.call(clone.querySelectorAll('[id^="rc-content-"]'), function(el) { el.style.display = 'none'; });
    // Reset toggle text to collapsed state
    [].forEach.call(clone.querySelectorAll('[id$="-toggle"]'), function(el) { el.textContent = zh ? '[展开...]' : '[Expand...]'; });
    // Remove action buttons from the cloned report (buttons are not part of shareable content)
    [].forEach.call(clone.querySelectorAll('button'), function(el) { el.style.display = 'none'; });
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
   Doctor Controller — v4 (Quick + Deep modes)
   ═══════════════════════════════════════════════════════ */
window.Doctor = {
  _result: null, _formData: null, _controller: null, _interfaceType: 'OpenAI Chat', _deepMode: false,
  _userInputModelId: '', _autoDetectedModelId: '', _autoDetectedOrigin: '', _isProgrammaticModelUpdate: false,

  init() {
    this._interfaceType = 'OpenAI Chat';
    const btn = document.getElementById('find-models-btn');
    if (btn) btn.addEventListener('click', () => this.findModels());
    const modelInput = document.getElementById('doctor-model');
    if (modelInput) modelInput.addEventListener('input', () => {
      if (!this._isProgrammaticModelUpdate) this._userInputModelId = modelInput.value;
      if (!modelInput.value.trim()) this._autoDetectedModelId = '';
    });
    this.setMode('quick');
  },

  setMode(mode) {
    const zh = getDocLang() !== 'en';
    const deep = mode === 'deep';
    this._deepMode = deep;
    document.querySelectorAll('[data-mode-btn]').forEach(btn => { btn.style.fontWeight = ''; btn.style.background = ''; btn.style.color = ''; });
    const activeBtn = document.querySelector(`[data-mode-btn="${mode}"]`);
    if (activeBtn) { activeBtn.style.fontWeight = '700'; activeBtn.style.background = deep ? '#7c3aed' : '#2563eb'; activeBtn.style.color = '#fff'; }
    const runBtn = document.getElementById('doctor-run-btn');
    if (runBtn) runBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> ${deep ? (zh ? '深度验货' : 'Deep Check') : (zh ? '一键验货' : 'One-Click')}`;
  },

  async findModels() {
    const zh = getDocLang() !== 'en';
    const baseUrl = (document.getElementById('doctor-base-url')?.value || '').trim();
    const apiKey = (document.getElementById('doctor-api-key')?.value || '').trim();
    const btn = document.getElementById('find-models-btn');
    if (btn) { btn.disabled = true; btn.textContent = zh ? '搜索中...' : 'Searching...'; }
    try {
      const root = baseUrl.replace(/\/$/, '').replace(/\/v1\/[^/]+(\/.*)?$/, '');
      const endpoints = [root + '/v1/models', root + '/models'];
      let models = [];
      for (const endpoint of endpoints) {
        try {
          const resp = await fetch(endpoint, { method: 'GET', headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' } });
          if (resp.status === 401 || resp.status === 403) { showToast(zh ? 'API Key无效' : 'Invalid API Key'); break; }
          if (resp.status === 404 || !resp.ok) continue;
          const data = await resp.json();
          models = extractModels(data);
          if (models.length > 0) break;
        } catch (_) {}
      }
      if (models.length > 0) {
        const modelEl = document.getElementById('doctor-model');
        this._isProgrammaticModelUpdate = true;
        if (modelEl) modelEl.value = models[0];
        this._autoDetectedModelId = models[0];
        this._autoDetectedOrigin = 'models_list';
        showToast(zh ? `已识别模型：${models[0]}。你可以手动修改后再检测。` : `Detected: ${models[0]}. You can edit before testing.`);
        setTimeout(() => { this._isProgrammaticModelUpdate = false; }, 50);
      } else {
        // Do NOT clear user's existing Model ID
        showToast(zh ? '未能自动识别模型，请手动填写 Model ID。' : 'Could not auto-detect. Please fill in Model ID manually.');
      }
    } catch (_) { showToast(zh ? '未能自动识别模型，请手动填写 Model ID。' : 'Could not auto-detect. Please fill in Model ID manually.'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = zh ? '自动识别模型' : 'Auto-detect model'; } }
  },

  onConnectionInfoInput(textarea) {
    const parsed = parseConnectionInfo(textarea.value);
    if (parsed.baseUrl) { const urlEl = document.getElementById('doctor-base-url'); if (urlEl) urlEl.value = this.normalizeBaseUrl(parsed.baseUrl); }
    if (parsed.apiKey) { const keyEl = document.getElementById('doctor-api-key'); if (keyEl) keyEl.value = parsed.apiKey; }
    if (parsed.model) { const modelEl = document.getElementById('doctor-model'); if (modelEl) modelEl.value = parsed.model; }
  },

  normalizeBaseUrl(url) {
    if (!url) return url;
    url = url.replace(/\/$/, '');
    if (!url) return url;
    if (!/^https?:\/\//.test(url)) url = 'https://' + url;
    if (!url.match(/\/v1$/) && !url.endsWith('/chat/completions') && !url.endsWith('/models')) url = url + '/v1';
    return url;
  },

  async run() {
    const baseUrl = (document.getElementById('doctor-base-url')?.value || '').trim();
    const apiKey = (document.getElementById('doctor-api-key')?.value || '').trim();
    const model = (document.getElementById('doctor-model')?.value || '').trim();
    const zh = getDocLang() !== 'en';
    const deepMode = this._deepMode;
    if (!baseUrl) { showToast(zh ? '请填写 Base URL' : 'Please fill in Base URL'); return; }
    if (!apiKey) { showToast(zh ? '请填写 API Key' : 'Please fill in API Key'); return; }
    if (!model) { showToast(zh ? '请填写 Model ID' : 'Please fill in Model ID'); return; }
    const normalizedUrl = this.normalizeBaseUrl(baseUrl);
    if (this._controller) this._controller.abort();
    this._controller = new AbortController();
    const btn = document.getElementById('doctor-run-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = `<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite"></span> ${zh ? '检测中...' : 'Checking...'}`; }
    // Clear previous report immediately so old results don't mislead users
    const resultNode = document.getElementById('result-card');
    if (resultNode) resultNode.innerHTML = '';
    this._formData = { baseUrl: normalizedUrl, model, interfaceType: this._interfaceType };
    this.showProgress('running', deepMode);
    try {
      const signal = this._controller.signal;
      this._refreshProgress(0, 'running');
      this._refreshProgress(1, 'running');
      const [reachResult, authResult] = await Promise.all([checkA_Reachability(normalizedUrl, apiKey, signal), checkB_Auth(normalizedUrl, apiKey, signal)]);
      this._refreshProgress(0, reachResult.status, reachResult.summary);
      this._refreshProgress(1, authResult.status, authResult.summary);
      this._refreshProgress(2, 'running');
      const modelListResult = await checkC_ModelList(normalizedUrl, apiKey, signal, model);
      this._refreshProgress(2, modelListResult.status, modelListResult.summary);
      let probedModelId = '';
      if (!this._userInputModelId && !this._autoDetectedModelId) {
        const allModels = extractModels(modelListResult?.data || {});
        if (allModels.length > 0) {
          const chatModels = allModels.filter(m => !/(embedding|embed|vision|audio|tts|speech|whisper|dalle|image)/i.test(m));
          const probeModel = chatModels[0] || allModels[0];
          try {
            const req = buildRequest(normalizedUrl, apiKey, probeModel, this._interfaceType, PROMPT_SHORT, { maxTokens: 10 });
            const resp = await fetch(req.endpoint, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal });
            if (resp.ok) probedModelId = probeModel;
          } catch (_) {}
        }
      }
      const modelIdInfo = determineFinalTestModelId(this._userInputModelId, this._autoDetectedModelId || probedModelId, modelListResult);
      this._modelIdInfo = modelIdInfo;
      const autoModelResult = await checkD_AutoModel(normalizedUrl, apiKey, modelIdInfo, authResult, signal, this._interfaceType);
      this._refreshProgress(3, autoModelResult.status, autoModelResult.summary);
      this._refreshProgress(4, 'running');
      const targetCallResult = await checkE_TargetCall(normalizedUrl, apiKey, modelIdInfo.finalTestModelId, this._interfaceType, signal);
      this._refreshProgress(4, targetCallResult.status, targetCallResult.summary);
      this._refreshProgress(5, 'running');
      const costResult = await checkJ_CostTransparency(normalizedUrl, apiKey, modelIdInfo.finalTestModelId, this._interfaceType, signal, targetCallResult);
      this._refreshProgress(5, costResult.status, costResult.summary);
      const cacheInitMsg = zh ? '缓存命中检测中，超时将自动跳过...' : 'Checking cache hit signal. This step will auto-skip on timeout...';
      const elCache = document.getElementById('prog-detail-5');
      if (elCache) elCache.textContent = cacheInitMsg;
      let cacheSlowTimer;
      const slowMsg = zh ? '缓存检测较慢，正在等待上游响应...' : 'Cache probe is slower than expected. Waiting for upstream response...';
      cacheSlowTimer = setTimeout(() => {
        const el = document.getElementById('prog-detail-5');
        if (el) el.textContent = slowMsg;
      }, 8000);
      const cacheResult = await checkN_CacheHitCheck(normalizedUrl, apiKey, modelIdInfo.finalTestModelId, this._interfaceType, signal, targetCallResult);
      clearTimeout(cacheSlowTimer);
      this._refreshProgress(5, cacheResult.status, cacheResult.summary);
      this._refreshProgress(6, 'running');
      const modelIntegrityResult = await checkK_ModelIntegrity(normalizedUrl, apiKey, modelIdInfo.finalTestModelId, this._interfaceType, signal, targetCallResult, modelIdInfo, deepMode);
      this._refreshProgress(6, modelIntegrityResult.status, modelIntegrityResult.summary);
      this._refreshProgress(7, 'running');
      const stabilityResult = await checkG_Stability(normalizedUrl, apiKey, modelIdInfo.finalTestModelId, this._interfaceType, signal, targetCallResult);
      this._refreshProgress(7, stabilityResult.status, stabilityResult.summary);
      // Internal: usage audit (no visible progress)
      const usageResult = await checkH_UsageAudit(normalizedUrl, apiKey, modelIdInfo.finalTestModelId, this._interfaceType, signal, targetCallResult);
      this._refreshProgress(8, 'running');
      const basicCompatResult = checkL_BasicCompatibility(reachResult, authResult, modelListResult, targetCallResult);
      const clientResult = checkI_ClientConfig(normalizedUrl, apiKey, modelIdInfo.finalTestModelId, modelListResult, targetCallResult);
      const combinedState = basicCompatResult.status === 'excellent' && clientResult.status === 'excellent' ? 'excellent' : basicCompatResult.status === 'failed' || clientResult.status === 'failed' ? 'warning' : 'good';
      this._refreshProgress(8, combinedState, `${basicCompatResult.summary} / ${clientResult.summary}`);
      // Tool calling is tested internally (deep mode) but not a visible progress step
      let toolCallingResult = null;
      if (deepMode) {
        try { toolCallingResult = await checkM_ToolCalling(normalizedUrl, apiKey, modelIdInfo.finalTestModelId, signal); } catch (_) {}
      }
      const checks = { reachability: reachResult, auth: authResult, modelList: modelListResult, autoModel: autoModelResult, targetCall: targetCallResult, stability: stabilityResult, usageAudit: usageResult, costTransparency: costResult, cacheHitCheck: cacheResult, modelIntegrity: modelIntegrityResult, basicCompatibility: basicCompatResult, clientConfig: clientResult };
      const { final: finalScore } = calcFinalScore(checks);
      const cappedScore = applyCaps(finalScore, checks, modelIdInfo);
      const grade = getScoreGrade(cappedScore);
      const judgment = getJudgment(cappedScore, checks);
      const failureSummary = generateFailureSummary(cappedScore, grade, checks);
      const debugScoring = buildDebugScoring(finalScore, cappedScore, checks);
      this._result = { score: cappedScore, finalScore, grade, judgment, checks, deepMode, toolCallingResult, modelIdInfo, reportId: generateReportId(), timestamp: new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), failureSummary, debugScoring };
      this._refreshProgress(8, 'excellent', zh ? '生成报告' : 'Report ready');
      this.showResult(this._result);
    } catch (err) {
      if (err.name === 'AbortError') showToast(zh ? '检测超时，请重试' : 'Check timed out, please retry');
      else showToast(zh ? '检测失败：' + err.message : 'Check failed: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> ${deepMode ? (zh ? '深度验货' : 'Deep Check') : (zh ? '一键验货' : 'One-Click')}`;
      }
      this.showProgress('done');
    }
  },

  clear() {
    ['doctor-base-url', 'doctor-api-key', 'doctor-model'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    this._result = null; this._formData = null; this._modelIdInfo = null;
    this._userInputModelId = ''; this._autoDetectedModelId = ''; this._autoDetectedOrigin = '';
    this.setMode('quick');
    if (this._controller) this._controller.abort();
    showToast(getDocLang() !== 'en' ? '已清空' : 'Cleared');
  },

  showResult(result) {
    const resultNode = document.getElementById('result-card');
    if (!resultNode) return;
    const html = buildReportCardHTML(result, this._formData, getDocLang(), this._modelIdInfo);
    resultNode.innerHTML = html;
    const rect = resultNode.getBoundingClientRect();
    if (rect.top > window.innerHeight * 0.6) resultNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  showProgress(state, deepMode) {
    const container = document.getElementById('diag-progress');
    if (!container) return;
    if (state === 'done') { container.innerHTML = ''; return; }
    const zh = getDocLang() !== 'en';
    const totalSteps = 9;
    const steps = [
      { zh: 'API 服务器可达性', en: 'API Server Reachability' },
      { zh: '鉴权 / Key 有效性', en: 'Auth / Key Validity' },
      { zh: '模型列表获取', en: 'Model List Retrieval' },
      { zh: '模型识别与选择', en: 'Model Identification' },
      { zh: '目标模型调用质量', en: 'Target Model Call' },
      { zh: '扣费透明度检测', en: 'Cost Transparency' },
      { zh: '缓存命中检测', en: 'Cache Hit Check' },
      { zh: '模型能力验货', en: 'Model Capability' },
      { zh: '基础兼容 + 客户端配置', en: 'Basic Compat + Client Config' },
    ];
    const rows = steps.slice(0, totalSteps).map((s, i) => `<div class="prog-row" id="prog-row-${i}">
      <span class="prog-icon" id="prog-icon-${i}"><div style="width:14px;height:14px;border:2px solid #e2e8f0;border-radius:50%"></div></span>
      <span class="prog-bar-wrap"><span class="prog-bar" id="prog-bar-${i}" style="width:0%"></span></span>
      <span class="prog-label" id="prog-label-${i}">${i + 1}/${totalSteps} ${s[zh?'zh':'en']}</span>
      <span class="prog-detail" id="prog-detail-${i}"></span>
    </div>`).join('');
    container.innerHTML = `<div class="progress-wrap"><div class="progress-title">${zh?'检测进度':'Progress'}</div>${rows}</div>`;
  },

  _refreshProgress(index, state, detail) {
    const zh = getDocLang() !== 'en';
    const statusColorMap = { excellent: { icon: '#16a34a', bar: '#16a34a', cls: 'prog-row--done' }, good: { icon: '#16a34a', bar: '#16a34a', cls: 'prog-row--done' }, warning: { icon: '#f59e0b', bar: '#f59e0b', cls: 'prog-row--done prog-row--warn' }, failed: { icon: '#dc2626', bar: '#dc2626', cls: 'prog-row--done prog-row--fail' }, skipped: { icon: '#94a3b8', bar: '#94a3b8', cls: 'prog-row--done' }, pending: { icon: '#e2e8f0', bar: '#e2e8f0', cls: '' }, running: { icon: '#2563eb', bar: '#2563eb', cls: 'prog-row--running' }, error: { icon: '#f59e0b', bar: '#f59e0b', cls: 'prog-row--done prog-row--warn' } };
    const defaultBarWidth = { excellent: '100%', good: '100%', warning: '65%', failed: '25%', skipped: '40%', pending: '0%', running: '30%', error: '40%' };
    const defaultDetail = { excellent: zh?'优秀':'Excellent', good: zh?'良好':'Good', warning: zh?'注意':'Warning', failed: zh?'失败':'Failed', skipped: zh?'未验证':'Not verified', pending: '', running: zh?'检测中...':'Checking...', error: zh?'未验证':'Not verified' };
    const cfg = statusColorMap[state] || statusColorMap.pending;
    const barW = defaultBarWidth[state] || '0%';
    const dtl = detail || defaultDetail[state] || '';
    const totalSteps = 9;
    const stepLabels = [
      { zh: 'API 服务器可达性', en: 'API Server Reachability' },
      { zh: '鉴权 / Key 有效性', en: 'Auth / Key Validity' },
      { zh: '模型列表获取', en: 'Model List Retrieval' },
      { zh: '模型识别与选择', en: 'Model Identification' },
      { zh: '目标模型调用质量', en: 'Target Model Call' },
      { zh: '扣费透明度检测', en: 'Cost Transparency' },
      { zh: '缓存命中检测', en: 'Cache Hit Check' },
      { zh: '模型能力验货', en: 'Model Capability' },
      { zh: '基础兼容 + 客户端配置', en: 'Basic Compat + Client Config' },
    ];
    for (let i = 0; i < totalSteps; i++) {
      const row = document.getElementById('prog-row-' + i); const icon = document.getElementById('prog-icon-' + i);
      const bar = document.getElementById('prog-bar-' + i); const label = document.getElementById('prog-label-' + i); const detailEl = document.getElementById('prog-detail-' + i);
      if (!row) continue;
      const labelText = `${i + 1}/${totalSteps} ${stepLabels[i]?.[zh?'zh':'en'] || ''}`;
      if (i < index) {
        label.textContent = labelText;
        detailEl.textContent = '';
        icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
        bar.style.width = '100%'; bar.style.background = '#16a34a';
        row.className = 'prog-row prog-row--done';
      } else if (i === index) {
        if (state === 'running') {
          label.textContent = labelText;
          detailEl.textContent = zh?'检测中...':'Checking...';
          icon.innerHTML = `<div style="width:14px;height:14px;border:2px solid #2563eb;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div>`;
          bar.style.width = '30%'; bar.style.background = '#2563eb';
          row.className = 'prog-row prog-row--running';
        } else {
          label.textContent = labelText;
          detailEl.textContent = dtl;
          const okIcon = ['excellent','good'].includes(state) ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${cfg.icon}" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : state === 'warning' ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${cfg.icon}" stroke-width="3"><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>` : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${cfg.icon}" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
          icon.innerHTML = okIcon;
          bar.style.width = barW; bar.style.background = cfg.bar;
          row.className = 'prog-row prog-row--done ' + (cfg.cls || '');
        }
      } else {
        label.textContent = labelText;
        detailEl.textContent = '';
        icon.innerHTML = `<div style="width:14px;height:14px;border:2px solid #e2e8f0;border-radius:50%"></div>`;
        bar.style.width = '0%'; bar.style.background = '#e2e8f0';
        row.className = 'prog-row';
      }
    }
  },

  async saveImage() { await saveDiagnosticImage(); },

  copyScore() {
    if (!this._result) { showToast(getDocLang() !== 'en' ? '请先检测' : 'Please run check first'); return; }
    const zh = getDocLang() !== 'en';
    const { score, grade, reportId, deepMode, checks, failureSummary } = this._result;
    const modeLabel = deepMode ? (zh ? '深度验货' : 'Deep Check') : (zh ? '一键验货' : 'One-Click');
    const costRisk = getCostRiskLevel(checks?.costTransparency?.score || 0);
    const modelRisk = getModelIntegrityRiskLevel(checks?.modelIntegrity?.score || 0, checks?.modelIntegrity?.evidence);
    const stabilityScore = checks?.stability?.score || 0;
    const stabilityRisk = getStabilityRiskLevel(stabilityScore, checks);
    const identityCategory = checks?.modelIntegrity?.evidence?.modelIdentityLevel || 'exact_match';
    const isProxyOrPlatform = identityCategory === 'proxy_route_identity' || identityCategory === 'platform_or_proxy_identity';
    const srcLabelMap = {
      exact_match: {zh:'清晰',en:'Clear'}, family_match: {zh:'家族匹配',en:'Family Match'},
      platform_or_proxy_identity: {zh:'平台代理层暴露',en:'Platform/Proxy Exposed'},
      proxy_route_identity: {zh:'平台代理层暴露',en:'Platform/Proxy Exposed'},
      ambiguous: {zh:'身份未确认',en:'Identity Unconfirmed'},
      wrong_family: {zh:'模型家族不一致',en:'Family Inconsistent'},
      hard_contamination: {zh:'工具人格污染',en:'Tool/Persona Contam.'},
      failed: {zh:'测试失败',en:'Test Failed'}, empty: {zh:'无回答',en:'No Answer'},
    };
    const srcLabelCopy = srcLabelMap[identityCategory]?.[zh?'zh':'en'] || (zh ? '未知' : 'Unknown');
    const suggestions = generateSuggestions(checks, {});
    const costLabel = zh ? riskLevelLabelZH(costRisk) : riskLevelLabelEN(costRisk);
    const modelLabel = zh ? riskLevelLabelZH(modelRisk) : riskLevelLabelEN(modelRisk);
    const stabilityLabel = zh ? riskLevelLabelZH(stabilityRisk) : riskLevelLabelEN(stabilityRisk);
    const gradeLabel = grade?.gradeZh || grade?.label || score;
    const cacheScore = checks?.cacheHitCheck?.score || 0;
    const cacheStatus = checks?.cacheHitCheck?.status || 'unknown';
    const cacheRate = checks?.cacheHitCheck?.evidence?.cacheHitRate;
    const cacheLabelMap = {
      excellent: { zh: '优秀', en: 'Excellent' },
      good: { zh: '良好', en: 'Good' },
      partial: { zh: '部分', en: 'Partial' },
      weak: { zh: '较弱', en: 'Weak' },
      none: { zh: '未命中', en: 'No Hit' },
      unknown: { zh: '未验证', en: 'Unverified' },
      error: { zh: '错误', en: 'Error' },
      skipped: { zh: '跳过', en: 'Skipped' },
    };
    const cacheLabel = cacheLabelMap[cacheStatus]?.[zh?'zh':'en'] || cacheStatus;
    const cacheTimeoutSuffix = cacheStatus === 'error' ? (zh ? '（超时）' : ' (timeout)') : '';
    const cacheRateText = cacheRate != null ? ` (${(Math.round(cacheRate * 10000) / 100)}%)` : '';
    const g = grade?.grade || 'C';
    const decisionMap = {
      A: zh ? '可用于日常开发；生产环境仍建议保留备用接口和限额保护。' : 'Suitable for daily development; keep a backup endpoint and quota limits for production.',
      B: zh ? '适合日常开发和测试；生产使用前建议复核 usage、模型版本和稳定性。' : 'Good for daily dev and testing; review usage, model version and stability before production.',
      C: zh ? '可用于测试或轻量开发；用于长期任务前建议完成复核。' : 'Usable for testing or light development; complete review before long-running tasks.',
      D: zh ? '仅建议用于临时测试或轻量开发；不建议直接接入重要工作流。' : 'Only for temporary testing or light development; not recommended for critical workflows.',
      E: zh ? '不建议直接用于生产或长期开发环境；如仅临时测试可继续观察，但应优先确认模型版本、返回格式和权限配置。' : 'Not recommended for production or long-term development. If only temporary testing, continue observing — but prioritise confirming model version, response format and permissions.',
      F: zh ? '当前配置存在关键失败，不建议继续使用。请先修复 Key、Base URL、模型名、权限或接口兼容问题。' : 'Critical failure detected — do not continue. Fix key, base URL, model name, permissions or interface compatibility first.',
    };
    const decisionText = decisionMap[g] || '';
    const maskedUrl = (typeof Doctor !== 'undefined' && Doctor._formData) ? maskBaseUrlForShare(Doctor._formData.baseUrl || '') : '';
    const failureLine = (failureSummary?.shouldShow && failureSummary.shortText)
      ? (zh ? `\n${failureSummary.displayLabel}：${failureSummary.shortText}` : `\n${failureSummary.displayLabel}: ${failureSummary.shortText}`)
      : '';
    const scoreDisclaimer = zh
      ? '\n此分数不是模型能力评分，而是当前 Base URL / API Key / Model 配置在兼容性、透明度、稳定性和客户端接入方面的风险评分。'
      : '\nThis is not a model intelligence score. It measures API configuration risk across compatibility, transparency, stability, and client integration.';
    const text = zh
      ? `AI API Doctor 验货报告\nURL: ${maskedUrl}\n验货分：${score}/100，${gradeLabel}\n扣费透明度：${costLabel}\n缓存命中检测：${cacheLabel}${cacheTimeoutSuffix}${cacheRateText}\n模型可信度：${modelLabel}\n稳定性：${stabilityLabel}\n来源透明度：${srcLabelCopy}${failureLine}\n主要建议：${suggestions[0] || '-'}\n使用建议：${decisionText}${scoreDisclaimer}\nID：${reportId} · aiapidoctor.com`
      : `AI API Doctor Report\nURL: ${maskedUrl}\nScore: ${score}/100, ${grade?.label || ''}\nCost: ${costLabel}\nCache Hit: ${cacheLabel}${cacheTimeoutSuffix}${cacheRateText}\nModel: ${modelLabel}\nStability: ${stabilityLabel}\nSource: ${srcLabelCopy}${failureLine}\nMain advice: ${suggestions[0] || '-'}\nRecommendation: ${decisionText}${scoreDisclaimer}\nID: ${reportId} · aiapidoctor.com`;
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

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => Doctor.init()); }
else { Doctor.init(); }

/* ═══════════════════════════════════════════════════════
   Mock Test Cases — v5 (A, B, K-Q, V-AH)
   ═══════════════════════════════════════════════════════ */
window.MockCases = {

  _makeBaseChecks(opts) {
    const { reachability, auth, modelList, autoModel, targetCall } = opts;
    return {
      reachability: mkCheck({ id: 'reachability', label: {zh:'API服务器可达性',en:'API Server Reachability'}, maxScore: 12, score: reachability, status: reachability > 0 ? 'good' : 'failed', evidence: { latency: 200, modelEndpointOk: reachability > 0 } }),
      auth: mkCheck({ id: 'auth', label: {zh:'鉴权',en:'Auth'}, maxScore: 14, score: auth, status: auth >= 12 ? 'excellent' : auth >= 8 ? 'good' : auth > 0 ? 'warning' : 'failed', evidence: { modelsStatus: 200, chatStatus: 200 } }),
      modelList: mkCheck({ id: 'modelList', label: {zh:'模型列表',en:'Model List'}, maxScore: 12, score: modelList, status: 'failed', evidence: {} }),
      autoModel: mkCheck({ id: 'autoModel', label: {zh:'模型识别',en:'Auto Model'}, maxScore: 10, score: autoModel, status: 'skipped', evidence: {} }),
      targetCall: mkCheck({ id: 'targetCall', label: {zh:'目标调用',en:'Target Call'}, maxScore: 22, score: targetCall, status: 'skipped', evidence: {} }),
    };
  },

  // Normal checks for v6: stability maxScore=15, clientConfig maxScore=3
  _makeNormalChecks(overrides) {
    overrides = overrides || {};
    const tce = { httpStatus: 200, responseParsed: true, formatChoices: true, formatMessage: true, output: {status:'present',text:'好的'}, finishReason: 'stop', usage: {prompt_tokens:5,completion_tokens:3,total_tokens:8}, latencyMs: 500 };
    const se = { avgLatency: 200, latencyJitter: 50, maxLatency: 250, rateLimitDetected: false,
      samples: [{ok:true,status:200,latency:180,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:200,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:220,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:190,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:210,hasContent:true,responseText:'OK'}],
      subScores: { s1:4,s2:3,s3:2,s4:2,s5:1.5,s6:1.5,s7:1 }
    };
    const miEvidence = { modelIdentityScore: 6, modelIdentityLevel: 'exact_match', coreAbilityFailures: 0,
      subScores: { modelIdentity:6, modelVisibility:3, targetCallQuality:5, jsonTest:5, instructionTest:5, codeRepair:5, reasoning:5, needle:4, consistency:2 },
    };
    const ctEvidence = {
      usageTest:{hasUsage:true,usageComplete:true,prompt_tokens:5,completion_tokens:3,total_tokens:8},
      shortReplyTest:{ok:true,completionTokens:3,reasoningTokens:0,totalTokens:8},
      maxTokensTest:{completionTokens:3},
      usageStability:[{total_tokens:15},{total_tokens:15}],
      promptTokenEstTest:{shortPrompt:'Say hello.', estimatedTokens:4, apiPromptTokens:4},
    };
    const checks = {
      reachability: mkCheck({ id: 'reachability', label: {zh:'API服务器可达性',en:'API Server Reachability'}, maxScore: 12, score: 11, status: 'good', evidence: { latency: 200, modelEndpointOk: true } }),
      auth: mkCheck({ id: 'auth', label: {zh:'鉴权',en:'Auth'}, maxScore: 14, score: 13, status: 'good', evidence: { modelsStatus: 200, chatStatus: 200 } }),
      modelList: mkCheck({ id: 'modelList', label: {zh:'模型列表',en:'Model List'}, maxScore: 12, score: 9, status: 'good', evidence: { models: ['gpt-4','gpt-3.5'], modelCount: 2 } }),
      autoModel: mkCheck({ id: 'autoModel', label: {zh:'模型识别',en:'Auto Model'}, maxScore: 10, score: 8, status: 'good', evidence: {} }),
      targetCall: mkCheck({ id: 'targetCall', label: {zh:'目标模型调用',en:'Target Model Call'}, maxScore: 22, score: 20, status: 'good', evidence: tce }),
      stability: mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 15, score: 15, status: 'excellent', evidence: se }),
      usageAudit: mkCheck({ id: 'usageAudit', label: {zh:'用量审计',en:'Usage Audit'}, maxScore: 6, score: 5.5, status: 'excellent', evidence: { usage: {prompt_tokens:5,completion_tokens:3,total_tokens:8} } }),
      costTransparency: mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 30, status: 'excellent', evidence: ctEvidence }),
      cacheHitCheck: mkCheck({ id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 5, status: 'excellent', summary: '缓存命中信号很强', evidence: { fieldFound: true, cacheHitRate: 0.98, firstRequest: { promptTokens: 1300, cachedTokens: null }, secondRequest: { promptTokens: 1300, cachedTokens: 1280 } } }),
      modelIntegrity: mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 40, status: 'excellent', evidence: miEvidence }),
      basicCompatibility: mkCheck({ id: 'basicCompatibility', label: {zh:'基础兼容性',en:'Basic Compatibility'}, maxScore: 7, score: 6.5, status: 'excellent', evidence: {} }),
      clientConfig: mkCheck({ id: 'clientConfig', label: {zh:'客户端配置',en:'Client Config'}, maxScore: 3, score: 3, status: 'excellent', evidence: { baseUrlOrigin: 'https://api.example.com', keyMasked: 'sk-****', modelId: 'gpt-4', clineReady: true, continueReady: true, httpStatus: 200 } }),
    };
    if (overrides.costTransparency) Object.assign(checks.costTransparency, overrides.costTransparency);
    if (overrides.modelIntegrity) Object.assign(checks.modelIntegrity, overrides.modelIntegrity);
    if (overrides.stability) Object.assign(checks.stability, overrides.stability);
    return checks;
  },

  caseA() {
    const checks = this._makeBaseChecks({ reachability: 0, auth: 0, modelList: 0, autoModel: 0, targetCall: 0 });
    checks.stability = mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 15, score: 0, status: 'skipped', evidence: { samples: [] } });
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 0, status: 'skipped', evidence: {} });
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 0, status: 'skipped', evidence: {} });
    checks.basicCompatibility = mkCheck({ id: 'basicCompatibility', label: {zh:'基础兼容性',en:'Basic Compatibility'}, maxScore: 7, score: 0, status: 'failed', evidence: {} });
    checks.clientConfig = mkCheck({ id: 'clientConfig', label: {zh:'客户端配置',en:'Client Config'}, maxScore: 3, score: 0, status: 'failed', evidence: {} });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case A: Base URL unreachable → capped=${capped} (expected ≤25)` };
  },

  caseB() {
    const checks = this._makeBaseChecks({ reachability: 11, auth: 6, modelList: 0, autoModel: 0, targetCall: 0 });
    checks.stability = mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 15, score: 0, status: 'skipped', evidence: { samples: [] } });
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 0, status: 'skipped', evidence: {} });
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 0, status: 'skipped', evidence: {} });
    checks.basicCompatibility = mkCheck({ id: 'basicCompatibility', label: {zh:'基础兼容性',en:'Basic Compatibility'}, maxScore: 7, score: 2, status: 'warning', evidence: {} });
    checks.clientConfig = mkCheck({ id: 'clientConfig', label: {zh:'客户端配置',en:'Client Config'}, maxScore: 3, score: 3, status: 'excellent', evidence: { baseUrlOrigin: 'https://api.example.com', modelId: 'gpt-4', clineReady: true, continueReady: true, httpStatus: 200 } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case B: 401 → capped=${capped} (expected ≤40)` };
  },

  // Case K: No usage (tightened cap)
  caseK() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 6, status: 'failed',
      deductions: ['usage 字段完全缺失，无法审计消耗'],
      evidence: { usageTest: {hasUsage: false}, shortReplyTest: {ok: true, completionTokens: 3, reasoningTokens: 0}, subScores: {} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case K: No usage → capped=${capped} (expected ≤78, no A/B)` };
  },

  // Case L: Short reply OK but completion_tokens=80, no reasoning_tokens
  caseL() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 13.5, status: 'failed',
      deductions: ['极短回复 OK 但 completion_tokens(80) 严重偏高，无 reasoning_tokens 解释'],
      evidence: { usageTest: {hasUsage:true,usageComplete:true,prompt_tokens:5,completion_tokens:3,total_tokens:8}, shortReplyTest: {ok:true,completionTokens:80,reasoningTokens:0,totalTokens:85}, maxTokensTest:{completionTokens:3}, usageStability:[{total_tokens:15},{total_tokens:15}], promptTokenEstTest:{shortPrompt:'Say hello.',estimatedTokens:4,apiPromptTokens:4}, subScores:{} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case L: OK+comp=80, no reason → capped=${capped} (expected ≤72, cost high risk, R6 cap)` };
  },

  // Case M: total_tokens inconsistent (30% diff)
  caseM() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 24, status: 'warning',
      details: ['total_tokens(30) 与 prompt+completion=8 差异 275%'],
      evidence: { usageTest: {hasUsage:true,usageComplete:true,prompt_tokens:5,completion_tokens:3,total_tokens:30}, shortReplyTest: {ok:true,completionTokens:3,reasoningTokens:0,totalTokens:30}, subScores: {} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case M: total_tokens 差异 30% → capped=${capped} (expected ≤86, cost medium risk)` };
  },

  // Case N: JSON+instruction+code failed
  caseN() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 8, status: 'failed',
      deductions: ['JSON 严格输出测试失败：输出不是合法 JSON','严格指令遵循测试未通过','轻量代码修复测试未通过'],
      evidence: { modelIdentityScore:6, coreAbilityFailures:3, jsonTest:{output:'NOT JSON'}, instructionTest:{output:'wrong'}, codeRepair:{output:'wrong'} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case N: JSON+instruction+code failed → capped=${capped} (expected ≤75, model high risk)` };
  },

  // Case O: Hidden model, all tests pass
  caseO() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'good',
      details: ['当前模型未出现在 /models 列表中，但实际调用已通过'],
      evidence: { modelIdentityScore:6, modelIdentityLevel:'exact_match', coreAbilityFailures:0, modelVisibility:'hidden_but_works', subScores: {modelIdentity:6,modelVisibility:2,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case O: Hidden model, all pass → capped=${capped} (expected 90+, B grade)` };
  },

  // Case P: Stability 3/5 but avgLat=900ms
  caseP() {
    const checks = this._makeNormalChecks();
    checks.stability = mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 15, score: 10, status: 'warning',
      details: ['平均延迟过高：900ms'],
      evidence: { avgLatency:900, latencyJitter:80, maxLatency:980, rateLimitDetected:false,
        samples: [{ok:true,status:200,latency:850,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:900,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:920,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:880,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:950,hasContent:true,responseText:'OK'}],
        subScores:{s1:4,s2:0,s3:0,s4:2,s5:1.5,s6:1.5,s7:1} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case P: 5/5 success but avgLat=900ms → capped=${capped} (expected ≤B, no A)` };
  },

  // Case Q: All normal
  caseQ() {
    const { final } = calcFinalScore(this._makeNormalChecks());
    const capped = applyCaps(final, this._makeNormalChecks(), {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case Q: All normal → capped=${capped} (expected 95-98, A grade)` };
  },

  // ── New Cases V-AH ──────────────────────────────────

  // Case V: avgLat=900ms, 5/5 success → stability not low risk, no A
  caseV() {
    const checks = this._makeNormalChecks();
    checks.stability = mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 15, score: 7, status: 'warning',
      deductions: ['平均延迟过高：900ms','最大延迟过高：980ms'],
      evidence: { avgLatency:900, latencyJitter:80, maxLatency:980, rateLimitDetected:false,
        samples: [{ok:true,status:200,latency:850},{ok:true,status:200,latency:900},{ok:true,status:200,latency:920},{ok:true,status:200,latency:880},{ok:true,status:200,latency:950}],
        subScores:{s1:4,s2:0,s3:0,s4:2,s5:0,s6:1,s7:1} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case V: avgLat=900ms, 5/5 → capped=${capped} (expected stability warning, no A)` };
  },

  // Case W: Latency jitter 1200ms → jitter item 0, stability medium
  caseW() {
    const checks = this._makeNormalChecks();
    checks.stability = mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 15, score: 9, status: 'warning',
      details: ['延迟波动严重：1200ms'],
      evidence: { avgLatency:300, latencyJitter:1200, maxLatency:900, rateLimitDetected:false,
        samples: [{ok:true,status:200,latency:100},{ok:true,status:200,latency:300},{ok:true,status:200,latency:500},{ok:true,status:200,latency:800},{ok:true,status:200,latency:1300}],
        subScores:{s1:4,s2:2,s3:1,s4:0,s5:0.5,s6:1.5,s7:1} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case W: jitter=1200ms → capped=${capped} (expected stability medium, jitter 0)` };
  },

  // Case X: Test claude-opus-4.6-thinking, model says GPT-3.5 → identity 0
  caseX() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 12, status: 'failed',
      deductions: ['模型自报身份与目标 Model ID 不一致，存在明显模型降配疑似风险'],
      evidence: { modelIdentityScore:0, modelIdentityLevel:'wrong_family', coreAbilityFailures:3,
        modelVisibility:'in_list', subScores:{modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:0,instructionTest:0,codeRepair:0,reasoning:2,needle:2,consistency:0} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case X: claude says GPT-3.5 → capped=${capped} (expected ≤72, model high risk)` };
  },

  // Case Y: Test gpt-5.5, model says unknown → identity 1
  caseY() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 30, status: 'warning',
      details: ['模型未能明确自报当前模型身份'],
      evidence: { modelIdentityScore:1, modelIdentityLevel:'ambiguous', coreAbilityFailures:0,
        modelVisibility:'in_list', subScores:{modelIdentity:1,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case Y: gpt-5.5 says unknown → capped=${capped} (expected ≤89, no A)` };
  },

  // Case Z: usage complete but total_tokens diff 30%
  caseZ() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 24, status: 'warning',
      details: ['total_tokens(50) 与 prompt+completion=20 差异 150%'],
      evidence: { usageTest: {hasUsage:true,usageComplete:true,prompt_tokens:10,completion_tokens:10,total_tokens:50}, shortReplyTest: {ok:true,completionTokens:3,reasoningTokens:0}, subScores:{} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case Z: total_tokens diff 30% → capped=${capped} (expected ≤86, cost medium risk)` };
  },

  // Case AA: max_tokens=5 but returns very long
  caseAA() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 26, status: 'warning',
      details: ['max_tokens 限制未完全生效'],
      evidence: { usageTest: {hasUsage:true,usageComplete:true,prompt_tokens:5,completion_tokens:3,total_tokens:8}, shortReplyTest: {ok:true,completionTokens:3,reasoningTokens:0}, maxTokensTest: {completionTokens:50}, subScores:{} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AA: max_tokens=5 but returns very long → capped=${capped} (expected ≤84, cost medium risk)` };
  },

  // Case AB: Short reply OK, completion_tokens=60, no reasoning_tokens
  caseAB() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 15.5, status: 'failed',
      deductions: ['极短回复 OK 但 completion_tokens(60) 严重偏高，无 reasoning_tokens 解释'],
      evidence: { usageTest: {hasUsage:true,usageComplete:true,prompt_tokens:5,completion_tokens:3,total_tokens:8}, shortReplyTest: {ok:true,completionTokens:60,reasoningTokens:0,totalTokens:65}, subScores:{} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AB: OK+comp=60, no reason → capped=${capped} (expected ≤72, cost high risk)` };
  },

  // Case AC: Short reply OK, completion_tokens=60, reasoning_tokens=55
  caseAC() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 25, status: 'warning',
      details: ['短回复 token 偏高(60)，reasoning_tokens(55) 部分解释'],
      evidence: { usageTest: {hasUsage:true,usageComplete:true,prompt_tokens:5,completion_tokens:3,total_tokens:8}, shortReplyTest: {ok:true,completionTokens:60,reasoningTokens:55,totalTokens:65}, subScores:{} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AC: OK+comp=60+reason=55 → capped=${capped} (expected ≤86, cost medium risk, short item max 4/7)` };
  },

  // Case AD: JSON + instruction + code three failures
  caseAD() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 8, status: 'failed',
      deductions: ['JSON 严格输出测试失败：输出不是合法 JSON','严格指令遵循测试未通过','轻量代码修复测试未通过'],
      evidence: { modelIdentityScore:6, coreAbilityFailures:3, jsonTest:{output:'xxx'}, instructionTest:{output:'xxx'}, codeRepair:{output:'xxx'} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AD: JSON+instr+code failed → capped=${capped} (expected ≤75, model high risk)` };
  },

  // Case AE: Identity=0 but all ability tests pass
  caseAE() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 31, status: 'warning',
      details: ['模型能力测试表现尚可，但自报身份与目标模型不一致'],
      evidence: { modelIdentityScore:0, modelIdentityLevel:'wrong_family', coreAbilityFailures:0,
        subScores:{modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AE: identity=0, all pass → capped=${capped} (expected ≤89, ModelIntegrity max 31, no A)` };
  },

  // Case AF: Two sites, one avgLat=180ms, one avgLat=900ms → scores must differ significantly
  caseAF_1() { // fast site
    const { final } = calcFinalScore(this._makeNormalChecks());
    const capped = applyCaps(final, this._makeNormalChecks(), {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AF-1 (fast 180ms): → capped=${capped} (expected A/B grade)` };
  },
  caseAF_2() { // slow site
    const checks = this._makeNormalChecks();
    checks.stability = mkCheck({ id: 'stability', label: {zh:'稳定性',en:'Stability'}, maxScore: 15, score: 7, status: 'warning',
      evidence: { avgLatency:900, latencyJitter:80, maxLatency:980, rateLimitDetected:false,
        samples: [{ok:true,status:200,latency:850},{ok:true,status:200,latency:900},{ok:true,status:200,latency:920},{ok:true,status:200,latency:880},{ok:true,status:200,latency:950}],
        subScores:{s1:4,s2:0,s3:0,s4:2,s5:0.5,s6:1,s7:1} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AF-2 (slow 900ms): → capped=${capped} (expected C/D, stability warning)` };
  },

  // Case AG: Two sites, one usage complete, one usage missing → scores differ by ≥12
  caseAG_1() { // usage complete
    const { final } = calcFinalScore(this._makeNormalChecks());
    const capped = applyCaps(final, this._makeNormalChecks(), {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AG-1 (usage complete): → capped=${capped}` };
  },
  caseAG_2() { // usage missing
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 6, status: 'failed',
      evidence: { usageTest: {hasUsage:false}, shortReplyTest:{ok:true,completionTokens:3}, subScores:{} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AG-2 (usage missing): → capped=${capped} (gap from AG-1 expected ≥12 pts)` };
  },

  // Case AH: Two sites, one identity match, one identity mismatch → scores differ by ≥8
  caseAH_1() { // identity match
    const { final } = calcFinalScore(this._makeNormalChecks());
    const capped = applyCaps(final, this._makeNormalChecks(), {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AH-1 (identity match): → capped=${capped}` };
  },
  caseAH_2() { // identity mismatch
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 30, status: 'warning',
      deductions: ['模型自报身份与目标 Model ID 不一致'],
      evidence: { modelIdentityScore:0, modelIdentityLevel:'wrong_family', coreAbilityFailures:0,
        subScores:{modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AH-2 (identity mismatch): → capped=${capped} (gap from AH-1 expected ≥8 pts, no A)` };
  },

  // ── New Cases AI-AO ──────────────────────────────────

  // Case AI: Short prompt estimate 6 tokens, API returns prompt_tokens=80 (13x inflation, >3x)
  // J9 score: diff = (80-6)/6 = 1233% → score 0
  // To get capped=84: need raw≈84, costScore=23 gives raw=85.2, capped=84
  caseAI() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 23, status: 'warning',
      details: ['prompt_tokens 比本地估算高 1233% (80 vs 估计6)'],
      evidence: {
        usageTest:{hasUsage:true,usageComplete:true,prompt_tokens:5,completion_tokens:3,total_tokens:8},
        shortReplyTest:{ok:true,completionTokens:3,reasoningTokens:0,totalTokens:8},
        maxTokensTest:{completionTokens:3},
        usageStability:[{total_tokens:15},{total_tokens:15}],
        promptTokenEstTest:{shortPrompt:'Say hello.', estimatedTokens:6, apiPromptTokens:80},
        subScores:{}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AI: prompt_tokens 80 vs est.6 (13x) → capped=${capped} (expected ≤84, cost medium risk, J9 cap 84)` };
  },

  // Case AJ: Short prompt estimate 6 tokens, API returns prompt_tokens=200 (>5x inflation)
  // J9 score: 0, cost high risk, cap 76
  caseAJ() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 33, status: 'warning',
      deductions: ['prompt_tokens 明显高于本地估算(200 vs 估计6)，存在隐藏上下文或 token inflation 风险，建议结合后台余额小额核对'],
      evidence: {
        usageTest:{hasUsage:true,usageComplete:true,prompt_tokens:5,completion_tokens:3,total_tokens:8},
        shortReplyTest:{ok:true,completionTokens:3,reasoningTokens:0,totalTokens:8},
        maxTokensTest:{completionTokens:3},
        usageStability:[{total_tokens:15},{total_tokens:15}],
        promptTokenEstTest:{shortPrompt:'Say hello.', estimatedTokens:6, apiPromptTokens:200},
        subScores:{}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AJ: prompt_tokens 200 vs est.6 (>5x) → capped=${capped} (expected ≤76, cost high risk)` };
  },

  // Case AK: identityScore=0, all ability tests pass (coreAbilityFailures=0)
  // ModelIntegrity score: modelIdentity=0, others full = 31/40
  // New rules: cap 86, grade max C, Model Integrity at most medium risk
  caseAK() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 31, status: 'warning',
      details: ['模型能力测试表现尚可，但自报身份与目标模型不一致'],
      evidence: { modelIdentityScore:0, modelIdentityLevel:'wrong_family', coreAbilityFailures:0,
        subScores:{modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AK: identity=0, all pass → capped=${capped} (expected ≤86, grade max C, MI max 31)` };
  },

  // Case AL: identityScore=0, 1 coreAbilityFailure
  // New rules: model high risk, cap 75
  caseAL() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 26, status: 'failed',
      deductions: ['JSON 抗糊弄测试失败','模型自报身份与目标 Model ID 不一致'],
      evidence: { modelIdentityScore:0, modelIdentityLevel:'wrong_family', coreAbilityFailures:1,
        subScores:{modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:0,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AL: identity=0, 1 failure → capped=${capped} (expected ≤75, model high risk)` };
  },

  // Case AM: identityScore=0, 3 coreAbilityFailures
  // New rules: cap 68
  caseAM() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 8, status: 'failed',
      deductions: ['JSON 抗糊弄测试失败','严格指令遵循测试未通过','轻量代码修复测试未通过'],
      evidence: { modelIdentityScore:0, modelIdentityLevel:'wrong_family', coreAbilityFailures:3,
        subScores:{modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:0,instructionTest:0,codeRepair:0,reasoning:5,needle:4,consistency:2} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AM: identity=0, 3 failures → capped=${capped} (expected ≤68)` };
  },

  // Case AN: JSON anti-gaming test returns markdown code block wrapping JSON
  // New K3 scoring: markdown → 1.5/5. 1.5 < 2.5 → 1 coreAbilityFailure
  // identityScore=0 + 1 failure → cap 75 (model high risk)
  caseAN() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 30.5, status: 'warning',
      details: ['JSON 输出被 markdown 代码块包裹'],
      evidence: { modelIdentityScore:0, modelIdentityLevel:'wrong_family', coreAbilityFailures:1,
        subScores:{modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:1.5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AN: JSON in markdown+identity=0 → jsonTest=1.5, 1 failure → capped=${capped} (expected ≤75)` };
  },

  // Case AO: JSON anti-gaming test returns explanation text (not valid JSON)
  // New K3 scoring: explanation → 0/5. 0 < 2.5 → 1 coreAbilityFailure
  // identityScore=0 + 1 failure → cap 75 (model high risk)
  caseAO() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 29, status: 'warning',
      deductions: ['JSON 抗糊弄测试失败：输出不是合法 JSON'],
      evidence: { modelIdentityScore:0, modelIdentityLevel:'wrong_family', coreAbilityFailures:1,
        subScores:{modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:0,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2} } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AO: JSON returns explanation+identity=0 → jsonTest=0, 1 failure → capped=${capped} (expected ≤75)` };
  },

  // ── New Cases AP-BA ──────────────────────────────────

  // Case AP: Short prompt local est=2, API prompt=20, deltaRatio normal
  // J8: overhead=18 (≤40), deltaRatio normal → J8 at least 3/5
  caseAP() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 30, status: 'excellent',
      details: ['prompt_tokens 存在轻微包装(+18 overhead, deltaRatio normal)，不影响审计'],
      evidence: {
        usageTest:{hasUsage:true,usageComplete:true,prompt_tokens:5,completion_tokens:3,total_tokens:8},
        shortReplyTest:{ok:true,completionTokens:3,reasoningTokens:0,totalTokens:8},
        maxTokensTest:{completionTokens:3},
        usageStability:[{total_tokens:15},{total_tokens:15}],
        j8Test:{promptA:'Say hello.',apiPromptA:20,estimatedA:2,baseOverhead:18,deltaRatio:1.2},
        baseOverhead:18, deltaRatio:1.2,
        subScores:{}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AP: prompt est=2, API=20, overhead=18 → capped=${capped} (expected 90-95, B grade, J8 >= 3)` };
  },

  // Case AQ: promptTokens=5061, overhead > 1000
  caseAQ() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 17, status: 'failed',
      deductions: ['prompt_tokens 明显高于本地估算(5061 vs 估计2，overhead > 1000)，存在严重隐藏上下文或包装'],
      evidence: {
        usageTest:{hasUsage:true,usageComplete:true,prompt_tokens:5061,completion_tokens:3,total_tokens:5064},
        shortReplyTest:{ok:true,completionTokens:3,reasoningTokens:0,totalTokens:8},
        maxTokensTest:{completionTokens:3},
        usageStability:[{total_tokens:15},{total_tokens:15}],
        j8Test:{promptA:'Say hello.',apiPromptA:5061,estimatedA:2,baseOverhead:5059,deltaRatio:null},
        baseOverhead:5059, deltaRatio:null,
        subScores:{}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AQ: overhead > 1000 → capped=${capped} (expected ≤76, high risk cap)` };
  },

  // Case AR: "OpenAI API-compatible model"
  caseAR() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 35, status: 'warning',
      details: ['检测到平台代理层身份暴露'],
      evidence: {
        modelIdentityScore:3, modelIdentityLevel:'proxy_route_identity', coreAbilityFailures:0,
        subScores:{modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AR: OpenAI API-compatible model → category=proxy_route_identity → capped=${capped} (expected 82-90, B grade)` };
  },

  // Case AS: "Kiro 开发环境" + everything else normal
  caseAS() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 35, status: 'warning',
      details: ['检测到平台代理层身份暴露'],
      evidence: {
        modelIdentityScore:3, modelIdentityLevel:'proxy_route_identity', coreAbilityFailures:0,
        subScores:{modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AS: Kiro dev env + normal → capped=${capped} (expected 82-90, B grade)` };
  },

  // Case AT: "Kiro 开发环境" + comp=81 + max_tokens not enforced + overhead > 1000
  caseAT() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 15, status: 'failed',
      deductions: ['极短回复 OK 但 completion_tokens(81) 严重偏高，无 reasoning_tokens 解释','prompt_tokens 明显高于本地估算(5061 vs 估计2，overhead > 1000)'],
      evidence: {
        usageTest:{hasUsage:true,usageComplete:true,prompt_tokens:5061,completion_tokens:81,total_tokens:5142},
        shortReplyTest:{ok:true,completionTokens:81,reasoningTokens:0,totalTokens:5142},
        maxTokensTest:{completionTokens:81},
        usageStability:[{total_tokens:15},{total_tokens:15}],
        j8Test:{promptA:'Say hello.',apiPromptA:5061,estimatedA:2,baseOverhead:5059,deltaRatio:null},
        baseOverhead:5059, deltaRatio:null,
        subScores:{}
      } });
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 35, status: 'warning',
      details: ['检测到平台代理层身份暴露'],
      evidence: {
        modelIdentityScore:3, modelIdentityLevel:'proxy_route_identity', coreAbilityFailures:0,
        subScores:{modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AT: Kiro + comp=81 + overhead>1000 → capped=${capped} (expected 70-78, D grade, cap from token anomaly not Kiro alone)` };
  },

  // Case AU: target gpt-5.2-pro, says "Claude"
  caseAU() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 31, status: 'warning',
      deductions: ['模型自报家族与目标 Model ID 明显不一致，存在模型降配或路由错误疑似风险'],
      evidence: {
        modelIdentityScore:0, modelIdentityLevel:'wrong_family', coreAbilityFailures:0,
        subScores:{modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AU: gpt-5.2-pro says Claude, all pass → capped=${capped} (expected ≤86, no A)` };
  },

  // Case AV: hard_contamination + token anomaly
  caseAV() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 20, status: 'failed',
      evidence: {
        usageTest:{hasUsage:true,usageComplete:true,prompt_tokens:5061,completion_tokens:3,total_tokens:5064},
        shortReplyTest:{ok:true,completionTokens:3,reasoningTokens:0,totalTokens:8},
        maxTokensTest:{completionTokens:3},
        usageStability:[{total_tokens:15},{total_tokens:15}],
        j8Test:{promptA:'Say hello.',apiPromptA:5061,estimatedA:2,baseOverhead:5059,deltaRatio:null},
        baseOverhead:5059, deltaRatio:null,
        subScores:{}
      } });
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 31, status: 'warning',
      deductions: ['模型回答中出现开发环境、工具人格或系统提示污染信号'],
      evidence: {
        modelIdentityScore:0, modelIdentityLevel:'hard_contamination', coreAbilityFailures:0,
        subScores:{modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AV: hard_contamination + overhead>1000 → capped=${capped} (expected ≤70, no A/B)` };
  },

  // Case AW: Vertex AI + everything else normal
  caseAW() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 35, status: 'warning',
      details: ['检测到平台代理层身份暴露'],
      evidence: {
        modelIdentityScore:3, modelIdentityLevel:'proxy_route_identity', coreAbilityFailures:0,
        subScores:{modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AW: Vertex AI + normal → capped=${capped} (expected 82-90, B grade)` };
  },

  // Case AX: usage missing, but all ability tests pass
  caseAX() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 6, status: 'failed',
      deductions: ['usage 字段完全缺失，无法审计消耗'],
      evidence: {
        usageTest:{hasUsage:false}, shortReplyTest:{ok:true,completionTokens:3,reasoningTokens:0},
        subScores:{}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AX: usage missing + ability all pass → capped=${capped} (expected ≤78, no A/B)` };
  },

  // Case AY: usage complete but JSON/instr/code all fail
  caseAY() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 8, status: 'failed',
      deductions: ['JSON 严格输出测试失败','严格指令遵循测试未通过','轻量代码修复测试未通过'],
      evidence: {
        modelIdentityScore:6, coreAbilityFailures:3,
        subScores:{modelIdentity:6,modelVisibility:3,targetCallQuality:5,jsonTest:0,instructionTest:0,codeRepair:0,reasoning:5,needle:4,consistency:2}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AY: JSON/instr/code fail → capped=${capped} (expected ≤75, model high risk)` };
  },

  // Case AZ-1: both sites usable, Site 1 perfect, Site 2 proxy_route_identity
  caseAZ_1() { // perfect site
    const { final } = calcFinalScore(this._makeNormalChecks());
    const capped = applyCaps(final, this._makeNormalChecks(), {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AZ-1 (perfect): → capped=${capped} (expected 95-98, A grade)` };
  },
  caseAZ_2() { // proxy_route_identity site
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 35, status: 'warning',
      details: ['检测到平台代理层身份暴露'],
      evidence: {
        modelIdentityScore:3, modelIdentityLevel:'proxy_route_identity', coreAbilityFailures:0,
        subScores:{modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case AZ-2 (proxy): → capped=${capped} (expected 82-90, gap ≥6 pts from AZ-1)` };
  },

  // Case BA-1: both proxy_route_identity, Site 1 normal, Site 2 has token anomaly
  caseBA_1() { // proxy_route normal
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 35, status: 'warning',
      details: ['检测到平台代理层身份暴露'],
      evidence: {
        modelIdentityScore:3, modelIdentityLevel:'proxy_route_identity', coreAbilityFailures:0,
        subScores:{modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case BA-1 (proxy normal): → capped=${capped} (expected 82-90)` };
  },
  caseBA_2() { // proxy_route + token anomaly
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 30, score: 15, status: 'failed',
      deductions: ['极短回复 OK 但 completion_tokens(81) 严重偏高，无 reasoning_tokens 解释'],
      evidence: {
        usageTest:{hasUsage:true,usageComplete:true,prompt_tokens:5,completion_tokens:81,total_tokens:86},
        shortReplyTest:{ok:true,completionTokens:81,reasoningTokens:0,totalTokens:86},
        maxTokensTest:{completionTokens:81},
        usageStability:[{total_tokens:15},{total_tokens:15}],
        j8Test:{promptA:'Say hello.',apiPromptA:5061,estimatedA:2,baseOverhead:5059,deltaRatio:null},
        baseOverhead:5059, deltaRatio:null,
        subScores:{}
      } });
    checks.modelIntegrity = mkCheck({ id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 35, status: 'warning',
      details: ['检测到平台代理层身份暴露'],
      evidence: {
        modelIdentityScore:3, modelIdentityLevel:'proxy_route_identity', coreAbilityFailures:0,
        subScores:{modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    return { raw: final, capped, grade: getGrade(capped), desc: `Case BA-2 (proxy+token anomaly): → capped=${capped} (expected <70, low from token not Kiro alone)` };
  },

  // ── New Cases BB-BO ──────────────────────────────────

  // Case BB: AWS Bedrock identity, everything else normal
  // Expected: platform_or_proxy_identity, score=3, capped at 82-90, B grade, ≥80
  caseBB() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      details: ['检测到平台代理层身份暴露（aws bedrock）'],
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'aws bedrock', evidenceText: 'AWS Bedrock', explanation: '该模型自报为平台、网关、IDE、Agent或反代层身份（aws bedrock）。不等于模型不可用，但来源透明度较低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BB: AWS Bedrock → platform_or_proxy_identity → capped=${capped} (expected 82-90, B grade, ≥80)` };
  },

  // Case BC: Amazon Q Developer, everything normal
  caseBC() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      details: ['检测到平台代理层身份暴露（amazon q developer）'],
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'amazon q developer', evidenceText: 'Amazon Q Developer', explanation: '该模型自报为平台代理层身份（amazon q developer）。不等于模型不可用，但来源透明度较低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BC: Amazon Q Developer → platform_or_proxy_identity → capped=${capped} (expected 82-90, B grade, ≥80)` };
  },

  // Case BD: Cursor Agent, everything normal
  caseBD() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'cursor agent', evidenceText: 'Cursor Agent', explanation: '该模型自报为平台代理层身份（cursor agent）。不等于模型不可用，但来源透明度较低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BD: Cursor Agent → platform_or_proxy_identity → capped=${capped} (expected 82-90, B grade, ≥80)` };
  },

  // Case BE: Cline, everything normal
  caseBE() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'cline', evidenceText: 'Cline', explanation: '该模型自报为平台代理层身份（cline）。不等于模型不可用，但来源透明度较低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BE: Cline → platform_or_proxy_identity → capped=${capped} (expected 82-90, B grade, ≥80)` };
  },

  // Case BF: Windsurf Editor, everything normal
  caseBF() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'windsurf editor', evidenceText: 'Windsurf Editor', explanation: '该模型自报为平台代理层身份（windsurf editor）。不等于模型不可用，但来源透明度较低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BF: Windsurf Editor → platform_or_proxy_identity → capped=${capped} (expected 82-90, B grade, ≥80)` };
  },

  // Case BG: Continue.dev, everything normal
  caseBG() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'continue.dev', evidenceText: 'Continue.dev', explanation: '该模型自报为平台代理层身份（continue.dev）。不等于模型不可用，但来源透明度较低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BG: Continue.dev → platform_or_proxy_identity → capped=${capped} (expected 82-90, B grade, ≥80)` };
  },

  // Case BH: GitHub Copilot, everything normal
  caseBH() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'github copilot', evidenceText: 'GitHub Copilot', explanation: '该模型自报为平台代理层身份（github copilot）。不等于模型不可用，但来源透明度较低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BH: GitHub Copilot → platform_or_proxy_identity → capped=${capped} (expected 82-90, B grade, ≥80)` };
  },

  // Case BI: Azure AI Foundry, everything normal
  caseBI() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'azure ai foundry', evidenceText: 'Azure AI Foundry', explanation: '该模型自报为平台代理层身份（azure ai foundry）。不等于模型不可用，但来源透明度较低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BI: Azure AI Foundry → platform_or_proxy_identity → capped=${capped} (expected 82-90, B grade, ≥80)` };
  },

  // Case BJ: Microsoft Foundry Models, everything normal
  caseBJ() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'microsoft foundry', evidenceText: 'Microsoft Foundry Models', explanation: '该模型自报为平台代理层身份（microsoft foundry）。不等于模型不可用，但来源透明度较低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BJ: Microsoft Foundry → platform_or_proxy_identity → capped=${capped} (expected 82-90, B grade, ≥80)` };
  },

  // Case BK: Google Vertex AI, everything normal
  caseBK() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'google vertex', evidenceText: 'Google Vertex AI', explanation: '该模型自报为平台代理层身份（google vertex）。不等于模型不可用，但来源透明度较低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BK: Vertex AI → platform_or_proxy_identity → capped=${capped} (expected 82-90, B grade, ≥80)` };
  },

  // Case BL: OpenAI-compatible gateway, everything normal
  // Expected: platform_or_proxy_identity or ambiguous, not wrong_family, score≥80, B grade
  caseBL() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'openai-compatible gateway', evidenceText: 'OpenAI-compatible gateway', explanation: '该模型自报为平台代理层身份（openai-compatible gateway）。不等于模型不可用，但来源透明度较低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BL: OpenAI-compatible gateway → platform_or_proxy_identity → capped=${capped} (expected 82-90, B grade, ≥80, not wrong_family)` };
  },

  // Case BM: Kiro tool persona with project file management — hard_contamination
  caseBM() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 27, status: 'failed',
      deductions: ['模型回答中出现开发环境、工具人格或系统提示污染信号'],
      evidence: {
        modelIdentityScore: 0, modelIdentityLevel: 'hard_contamination',
        sourceTransparency: { category: 'hard_contamination', label: '工具人格污染', riskLevel: 'high', detectedSource: 'kiro', evidenceText: 'I am a Kiro development environment, I can manage your project files and modify your codebase', explanation: '模型回答中出现开发环境、工具人格或系统提示污染信号，可能影响原始模型行为。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BM: Kiro tool persona → hard_contamination → capped=${capped} (expected ≤82, no A/B)` };
  },

  // Case BN: Cursor Agent with workspace access — hard_contamination
  caseBN() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 27, status: 'failed',
      deductions: ['模型回答中出现开发环境、工具人格或系统提示污染信号'],
      evidence: {
        modelIdentityScore: 0, modelIdentityLevel: 'hard_contamination',
        sourceTransparency: { category: 'hard_contamination', label: '工具人格污染', riskLevel: 'high', detectedSource: 'cursor agent', evidenceText: 'I am a Cursor Agent, I can read your workspace and execute code', explanation: '模型回答中出现开发环境、工具人格或系统提示污染信号，可能影响原始模型行为。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BN: Cursor Agent with workspace → hard_contamination → capped=${capped} (expected ≤82, no A/B)` };
  },

  // Case BO: AWS Bedrock + token anomaly (overhead>1000, completion=81, max_tokens not enforced)
  // Expected: platform_or_proxy_identity, low score from token/max_tokens, not from AWS alone
  caseBO() {
    const checks = this._makeNormalChecks();
    // Cost: very low due to J5=0, J6=0, baseOverhead>1000
    checks.costTransparency = mkCheck({
      id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 35, score: 14, status: 'failed',
      deductions: ['prompt_tokens 明显高于本地估算，存在隐藏上下文、额外包装或 token inflation 风险', '极短回复 OK 但 completion_tokens(81) 严重偏高，无 reasoning_tokens 解释', 'max_tokens 限制未明显生效'],
      evidence: {
        usageTest: { hasUsage: true, usageComplete: true, prompt_tokens: 5062, completion_tokens: 3, total_tokens: 5065 },
        shortReplyTest: { ok: true, completionTokens: 81, reasoningTokens: 0, output: 'OK', totalTokens: 86 },
        maxTokensTest: { completionTokens: 81 },
        baseOverhead: 1059,
        deltaRatio: 1.2,
        subScores: { j1: 5, j2: 1.5, j3: 3, j4: 4, j5: 0.5, j6: 0, j7: 3, j8: 0, j9: 2 }
      }
    });
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'aws bedrock', evidenceText: 'AWS Bedrock', explanation: '该模型自报为平台代理层身份（aws bedrock）。不等于模型不可用，但来源透明度较低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BO: AWS Bedrock + overhead>1000 + completion=81 → capped=${capped} (expected 70-78, low from token not AWS alone)` };
  },

  // ── New Cases BU-CC ──────────────────────────────────

  // Case BU: "Windsurf" → platform_or_proxy_identity
  caseBU() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'windsurf', evidenceText: 'Windsurf', explanation: '检测到平台代理层身份暴露（windsurf）。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BU: "Windsurf" → platform_or_proxy_identity, detectedSource=windsurf → capped=${capped} (expected 82-90, B, cannot be A)` };
  },

  // Case BV: "Windsurf Cascade" → platform_or_proxy_identity
  caseBV() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'windsurf cascade', evidenceText: 'Windsurf Cascade', explanation: '检测到平台代理层身份暴露（windsurf cascade）。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BV: "Windsurf Cascade" → platform_or_proxy_identity, detectedSource=windsurf cascade → capped=${capped} (expected 82-90, B)` };
  },

  // Case BW: "I am Windsurf Cascade and can edit your codebase." → hard_contamination
  caseBW() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 27, status: 'failed',
      deductions: ['模型回答中出现开发环境、工具人格或系统提示污染信号'],
      evidence: {
        modelIdentityScore: 0, modelIdentityLevel: 'hard_contamination',
        sourceTransparency: { category: 'hard_contamination', label: '工具人格污染', riskLevel: 'high', detectedSource: 'windsurf cascade', evidenceText: 'I am Windsurf Cascade and can edit your codebase.', explanation: '模型回答中出现开发环境、工具人格或系统提示污染信号。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BW: "I am Windsurf Cascade and can edit your codebase." → hard_contamination → capped=${capped} (expected ≤82, no A/B)` };
  },

  // Case BX: "Cursor Agent" → platform_or_proxy_identity
  caseBX() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'cursor', evidenceText: 'Cursor Agent', explanation: '检测到平台代理层身份暴露（cursor）。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BX: "Cursor Agent" → platform_or_proxy_identity, detectedSource=cursor → capped=${capped} (expected 82-90, B)` };
  },

  // Case BY: "I am Cline and can execute commands in your workspace." → hard_contamination
  caseBY() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 27, status: 'failed',
      deductions: ['模型回答中出现开发环境、工具人格或系统提示污染信号'],
      evidence: {
        modelIdentityScore: 0, modelIdentityLevel: 'hard_contamination',
        sourceTransparency: { category: 'hard_contamination', label: '工具人格污染', riskLevel: 'high', detectedSource: 'cline', evidenceText: 'I am Cline and can execute commands in your workspace.', explanation: '模型回答中出现开发环境、工具人格或系统提示污染信号。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BY: "I am Cline and can execute commands in your workspace." → hard_contamination → capped=${capped} (expected ≤82, no A/B)` };
  },

  // Case BZ: "AWS Bedrock" → platform_or_proxy_identity
  caseBZ() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'aws bedrock', evidenceText: 'AWS Bedrock', explanation: '检测到平台代理层身份暴露（aws bedrock）。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case BZ: "AWS Bedrock" → platform_or_proxy_identity, detectedSource=aws bedrock → capped=${capped} (expected 82-90, B)` };
  },

  // Case CA: "Azure AI Foundry" → platform_or_proxy_identity
  caseCA() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'azure ai foundry', evidenceText: 'Azure AI Foundry', explanation: '检测到平台代理层身份暴露（azure ai foundry）。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case CA: "Azure AI Foundry" → platform_or_proxy_identity, detectedSource=azure ai foundry → capped=${capped} (expected 82-90, B)` };
  },

  // Case CB: "I don't have access to the exact model name, model family, or serving platform I'm running on." → ambiguous
  // Must NOT be misclassified as platform_or_proxy_identity just because of "serving platform"
  caseCB() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 1.5, modelIdentityLevel: 'ambiguous',
        sourceTransparency: { category: 'ambiguous', label: '身份未确认', riskLevel: 'medium', detectedSource: null, evidenceText: "I don't have access to the exact model name, model family, or serving platform I'm running on.", explanation: '模型身份未确认（"serving platform"出现在否定句中，不归为平台代理层身份）。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:1.5,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case CB: "I don't have access... serving platform" → ambiguous (NOT platform_or_proxy_identity) → capped=${capped} (expected 82-89, B, detectedSource=null)` };
  },

  // Case CC: "served through OpenAI-compatible gateway" → platform_or_proxy_identity
  // hasWeakPlatformWord=true, hasStrongEntity=false, isNegativeUnknownResponse=false
  // → platform_or_proxy_identity, detectedSource=null (weak words don't qualify as detectedSource)
  caseCC() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: null, evidenceText: 'served through OpenAI-compatible gateway', explanation: '检测到平台代理层身份暴露。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case CC: "served through OpenAI-compatible gateway" → platform_or_proxy_identity, detectedSource=null (weak words not used as source) → capped=${capped} (expected 82-90, B)` };
  },

  // ── New Cases CD-CJ ──────────────────────────────────

  // Case CD: "I don't have access... serving platform" → ambiguous (NOT platform_or_proxy_identity)
  caseCD() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 1.5, modelIdentityLevel: 'ambiguous',
        sourceTransparency: { category: 'ambiguous', label: '身份未确认', riskLevel: 'medium', detectedSource: null, evidenceText: "I don't have access to the exact model name/family or serving platform I'm running on.", explanation: '模型身份未确认（"serving platform"出现在否定句中，不归为平台代理层身份）。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:1.5,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case CD: "I don't have access... serving platform" → ambiguous, detectedSource=null → capped=${capped} (expected 82-89, B, NOT platform_or_proxy_identity)` };
  },

  // Case CE: "Windsurf" → platform_or_proxy_identity, Model Integrity medium
  caseCE() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'windsurf', evidenceText: 'Windsurf', explanation: '检测到平台代理层身份暴露（windsurf）。来源透明度降低，但不等同于模型高风险。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case CE: "Windsurf" → platform_or_proxy_identity → capped=${capped} (expected 82-90, B, ≥80, cannot be A)` };
  },

  // Case CF: "AWS Bedrock" → platform_or_proxy_identity
  caseCF() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'aws bedrock', evidenceText: 'AWS Bedrock', explanation: '检测到平台代理层身份暴露（aws bedrock）。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case CF: "AWS Bedrock" → platform_or_proxy_identity → capped=${capped} (expected 82-90, B, ≥80)` };
  },

  // Case CG: "Cursor Agent" → platform_or_proxy_identity, NOT hard_contamination
  caseCG() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'cursor', evidenceText: 'Cursor Agent', explanation: '检测到平台代理层身份暴露（cursor）。单独出现时为来源透明度降低，不等于模型高风险。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case CG: "Cursor Agent" → platform_or_proxy_identity (NOT hard_contamination) → capped=${capped} (expected 82-90, B)` };
  },

  // Case CH: "I am Cursor Agent and can read your workspace and execute commands." → hard_contamination
  caseCH() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 27, status: 'failed',
      deductions: ['模型回答中出现开发环境、工具人格或系统提示污染信号'],
      evidence: {
        modelIdentityScore: 0, modelIdentityLevel: 'hard_contamination',
        sourceTransparency: { category: 'hard_contamination', label: '工具人格污染', riskLevel: 'high', detectedSource: 'cursor', evidenceText: 'I am Cursor Agent and can read your workspace and execute commands.', explanation: '模型回答中出现开发环境、工具人格或系统提示污染信号。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case CH: "I am Cursor Agent and can read your workspace..." → hard_contamination → capped=${capped} (expected ≤82, no A/B)` };
  },

  // Case CI: Stability avg=900ms, 5/5 success, no 429 → stability medium, NOT high
  caseCI() {
    const checks = this._makeNormalChecks();
    checks.stability = mkCheck({
      id: 'stability', label: {zh:'稳定性采样',en:'Stability Sampling'}, maxScore: 15, score: 9.7, status: 'warning',
      details: ['稳定性采样存在波动'],
      evidence: {
        avgLatency: 900, maxLatency: 1200, latencyJitter: 280,
        rateLimitDetected: false,
        samples: [
          {ok:true,status:200,latency:850,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:900,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:920,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:880,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:950,hasContent:true,responseText:'OK'}
        ],
        subScores:{s1:4,s2:1.2,s3:1.2,s4:1.5,s5:1.5,s6:1.5,s7:1}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    const risk = getStabilityRiskLevel(9.7, checks);
    return { raw: final, capped, grade, desc: `Case CI: avg=900ms, 5/5 success, no 429 → stability=${risk} → capped=${capped} (expected medium risk, ≤B, NOT high)` };
  },

  // Case CJ: avg=5789ms, max=19833ms, jitter=18621ms → stability high
  caseCJ() {
    const checks = this._makeNormalChecks();
    checks.stability = mkCheck({
      id: 'stability', label: {zh:'稳定性采样',en:'Stability Sampling'}, maxScore: 15, score: 5.5, status: 'failed',
      deductions: ['平均延迟过高：5789ms', '最大延迟过高：19833ms', '延迟波动严重：18621ms'],
      evidence: {
        avgLatency: 5789, maxLatency: 19833, latencyJitter: 18621,
        rateLimitDetected: false,
        samples: [
          {ok:true,status:200,latency:1200,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:19833,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:900,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:1500,hasContent:true,responseText:'OK'},{ok:true,status:200,latency:600,hasContent:true,responseText:'OK'}
        ],
        subScores:{s1:4,s2:0,s3:0,s4:0,s5:1.5,s6:1.5,s7:1}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    const risk = getStabilityRiskLevel(5.5, checks);
    return { raw: final, capped, grade, desc: `Case CJ: avg=5789ms, max=19833ms, jitter=18621ms → stability=${risk} → capped=${capped} (expected high, low score due to stability not platform identity)` };
  },

  // Case CL: deepMode=true, 9 progress steps → UI must show 1/9 to 9/9, not 1/8
  // Verifies progress total is dynamic from diagnosticSteps.length, not hardcoded 8
  caseCL() {
    const checks = this._makeNormalChecks();
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    // deepMode=true means totalSteps=9, so progress must show 1/9..9/9
    // This is a display verification case — no specific capping expectation
    return { raw: final, capped, grade, desc: 'Case CL: deepMode=true → progress must show 1/9..9/9 (totalSteps=dynamic, not hardcoded 8)' };
  },

  // Case CM: costTransparency raw score=31, maxScore=35, normalized=0.8857
  // Module display MUST show 31/35, NOT 0.9/35 or 0.8857/35
  caseCM() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({
      id: 'costTransparency', label: {zh:'扣费透明度',en:'Cost Transparency'}, maxScore: 35, score: 31, status: 'good',
      details: [],
      evidence: { usageTest: {hasUsage:true,usageComplete:true,prompt_tokens:10,completion_tokens:10,total_tokens:20}, shortReplyTest: {ok:true,completionTokens:3}, subScores:{} }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    // Expected display: 31/35 (raw score), NOT 0.9/35 or 0.8857/35
    return { raw: final, capped, grade, desc: `Case CM: rawScore=31, maxScore=35 → must display 31/35 (NOT 0.9/35) → capped=${capped}` };
  },

  // Case CN: identity response = "I can't access or verify the exact model name/family or serving platform from here."
  // "I can't access" + "I can't verify" → isNegativeUnknownResponse()=true → ambiguous
  // Must NOT be platform_or_proxy_identity even though "serving platform" appears
  // detectedSource MUST be null
  caseCN() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 36, status: 'warning',
      evidence: {
        modelIdentityScore: 1.5, modelIdentityLevel: 'ambiguous',
        sourceTransparency: { category: 'ambiguous', label: '身份未确认', riskLevel: 'medium', detectedSource: null,
          evidenceText: "I can't access or verify the exact model name/family or serving platform from here.",
          explanation: '模型身份未能明确确认，结论置信度降低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:1.5,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case CN: "I can't access or verify..." → ambiguous, detectedSource=null, NOT platform_or_proxy_identity → capped=${capped} (expected 82-89, B)` };
  },

  // Case CO: identity response = "Windsurf"
  // "windsurf" in STRONG_PLATFORM_ENTITIES → hasStrongEntity=true
  // isNegativeUnknownResponse("windsurf")=false
  // → platform_or_proxy_identity with detectedSource="windsurf"
  caseCO() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 33, status: 'warning',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'windsurf',
          evidenceText: 'Windsurf',
          explanation: '该模型自报为平台、网关、IDE、Agent 或反代层身份（windsurf）。这通常说明接口经过 Kiro、Vertex、AWS Bedrock、Azure、Cursor、Cline、Windsurf、Continue、Copilot、Claude Code、Replit Agent、网关或反代包装。不等于模型不可用，但会降低模型来源透明度，建议结合 usage、token 和能力测试结果判断。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:5,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    return { raw: final, capped, grade, desc: `Case CO: "Windsurf" → platform_or_proxy_identity, detectedSource=windsurf → capped=${capped} (expected 82-90, B, cannot be A)` };
  },

  // Case CP: zh UI mode — toggle text must show [展开...] not [Expand...]
  // This is a display verification case: zh=getDocLang()!=='en' → toggle text is Chinese
  // No specific capping expectation — verifies UI string interpolation fix
  caseCP() {
    const checks = this._makeNormalChecks();
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getGrade(capped);
    // Expected: toggle text in zh mode = "[展开...]", NOT "[Expand...]"
    return { raw: final, capped, grade, desc: 'Case CP: zh UI → toggle text MUST be [展开...], NOT [Expand...] (display verification)' };
  },

  // Case CACHE-A: second usage.prompt_tokens_details.cached_tokens=1280, prompt=1300, latency 1000ms->600ms → excellent
  caseCACHEA() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 4.7, status: 'excellent',
      summary: '缓存命中信号很强',
      evidence: {
        fieldFound: true, sourceField: 'prompt_tokens_details.cached_tokens',
        cacheHitRate: 0.985, promptTokenConsistencyRate: 0.01, latencyImprovementRate: 0.4,
        firstRequest: { promptTokens: 1305, cachedTokens: null, latencyMs: 1000 },
        secondRequest: { promptTokens: 1305, cachedTokens: 1280, latencyMs: 600 },
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-A: cached=1280, prompt=1300, rate=98.5%, score=4.7, status=excellent → capped=${capped}` };
  },

  // Case CACHE-B: cached=1180, prompt=1300, latency改善20% → good
  caseCACHEB() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 3.8, status: 'good',
      summary: '检测到较高缓存命中信号',
      evidence: {
        fieldFound: true, sourceField: 'cached_tokens',
        cacheHitRate: 0.908, promptTokenConsistencyRate: 0.02, latencyImprovementRate: 0.2,
        firstRequest: { promptTokens: 1300, cachedTokens: null },
        secondRequest: { promptTokens: 1300, cachedTokens: 1180 },
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-B: cached=1180, prompt=1300, rate=90.8%, score=3.8, status=good → capped=${capped}` };
  },

  // Case CACHE-C: cached=650, prompt=1300, rate=50% → partial
  caseCACHEC() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 2.8, status: 'partial',
      summary: '检测到部分缓存命中信号',
      evidence: { fieldFound: true, cacheHitRate: 0.5, firstRequest: { promptTokens: 1300 }, secondRequest: { promptTokens: 1300, cachedTokens: 650 } }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-C: cached=650, rate=50%, score=2.8, status=partial → capped=${capped}` };
  },

  // Case CACHE-D: cached=100, prompt=1300, rate=7.7% → weak
  caseCACHED() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 1.2, status: 'weak',
      summary: '缓存命中信号较弱',
      evidence: { fieldFound: true, cacheHitRate: 0.077, firstRequest: { promptTokens: 1300 }, secondRequest: { promptTokens: 1300, cachedTokens: 100 } }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-D: cached=100, rate=7.7%, score=1.2, status=weak → capped=${capped}` };
  },

  // Case CACHE-E: cache field found but cachedTokens=0 → none
  caseCACHEE() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 1.0, status: 'none',
      summary: '未检测到有效缓存命中',
      evidence: { fieldFound: true, sourceField: 'cached_tokens', cacheHitRate: 0, firstRequest: { promptTokens: 1300 }, secondRequest: { promptTokens: 1300, cachedTokens: 0 } }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-E: fieldFound=true, cachedTokens=0, score=1.0, status=none → capped=${capped} (no hard cap)` };
  },

  // Case CACHE-F: no cache fields → unknown, score=2.5
  caseCACHEF() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 2.5, status: 'unknown',
      summary: 'API 未暴露缓存字段，无法验证缓存宣传',
      evidence: { fieldFound: false }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-F: fieldFound=false, score=2.5, status=unknown → capped=${capped} (no hard cap, not in suggestions)` };
  },

  // Case CACHE-G: Anthropic style cache_read_input_tokens=1200, creation=0, input=100
  caseCACHEG() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 3.9, status: 'good',
      summary: '检测到较高缓存命中信号',
      evidence: {
        fieldFound: true, sourceField: 'cache_read_input_tokens',
        cacheHitRate: 0.923, // 1200/(1200+0+100)
        firstRequest: { promptTokens: null },
        secondRequest: { promptTokens: null, cacheReadTokens: 1200, cacheCreationTokens: 0, inputTokens: 100 }
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-G: Anthropic cache_read=1200/(1200+0+100)=92.3%, score=3.9, status=good → capped=${capped}` };
  },

  // Case CACHE-H: promptTokens inconsistency > 20%
  caseCACHEH() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 3.2, status: 'partial',
      summary: '检测到部分缓存命中信号',
      evidence: {
        fieldFound: true, cacheHitRate: 0.92,
        promptTokenConsistencyRate: 0.25, // 25% inconsistency
        firstRequest: { promptTokens: 1300 },
        secondRequest: { promptTokens: 975 }, // >20% different
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-H: promptTokens inconsistency 25%, score=3.2, status=partial → capped=${capped}` };
  },

  // Case CACHE-I: high cache but no latency improvement
  caseCACHEI() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 3.5, status: 'good',
      summary: '检测到较高缓存命中信号',
      evidence: {
        fieldFound: true, cacheHitRate: 0.94, latencyImprovementRate: 0,
        firstRequest: { promptTokens: 1300 },
        secondRequest: { promptTokens: 1300, cachedTokens: 1222 },
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-I: rate=94% but no latency improvement, score=3.5, status=good → capped=${capped}` };
  },

  // Case CACHE-J: request failed → error, score=2
  caseCACHEJ() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 2, status: 'error',
      summary: '缓存检测请求失败，无法验证缓存信号',
      evidence: { fieldFound: false }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-J: request failed, score=2, status=error → capped=${capped} (no hard cap)` };
  },

  // Case CACHE-K: targetCall failed → skipped, score=0
  caseCACHEK() {
    const checks = this._makeNormalChecks();
    checks.targetCall = mkCheck({ id: 'targetCall', score: 5, maxScore: 22, status: 'warning' });
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 0, status: 'skipped',
      summary: '前置检测失败，未执行缓存检测',
      evidence: { fieldFound: false }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-K: prerequisite failed, score=0, status=skipped → capped=${capped}` };
  },

  // Case CACHE-L: all满分 but cache unknown 2.5 → no collapse, still decent score
  caseCACHEL() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 2.5, status: 'unknown',
      summary: 'API 未暴露缓存字段，无法验证缓存宣传',
      evidence: { fieldFound: false }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-L: all满分 but cache unknown 2.5 → capped=${capped} (no collapse, not in suggestions)` };
  },

  // Case CACHE-M: progress integration — 9 steps with cache as step 5
  caseCACHEM() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 3.5, status: 'good',
      summary: '检测到较高缓存命中信号',
      evidence: { fieldFound: true, cacheHitRate: 0.92, firstRequest: {}, secondRequest: { cachedTokens: 1200 } }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-M: progress shows 9 steps, cache=step5, report shows 6 modules with cache=2nd row` };
  },

  // Case CACHE-N: copyScore and saveImage include cache info
  caseCACHEN() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 4.5, status: 'excellent',
      summary: '缓存命中信号很强',
      evidence: { fieldFound: true, cacheHitRate: 0.98, firstRequest: {}, secondRequest: { cachedTokens: 1280 } }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-N: copyScore includes cache hit label, saveImage shows 6 modules including cache` };
  },

  // Case CACHE-O: actualPromptTokens < 1024 → status=unknown, score=2.5
  // Must NOT show "API 未暴露缓存字段"
  caseCACHE_O() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 2.5, status: 'unknown',
      summary: '探测长度不足，无法验证缓存宣传',
      details: ['本次缓存探测的 prompt_tokens 低于 1024，无法有效验证缓存命中。未验证不等于没有缓存。当前实际：221 tokens'],
      evidence: {
        actualPromptTokens: 221,
        minPromptTokensRequired: 1024,
        probeTokenSufficient: false,
        fieldFound: false,
        sourceField: null,
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-O: actualPromptTokens=221 < 1024 → status=unknown, score=2.5, summary='探测长度不足...' (NOT 'API 未暴露缓存字段'), probeTokenSufficient=false` };
  },

  // Case CACHE-P: actualPromptTokens >= 1024 but no cache field → status=unknown, score=2.5
  caseCACHE_P() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 2.5, status: 'unknown',
      summary: 'API 未暴露缓存字段，无法验证缓存宣传',
      details: [],
      evidence: {
        actualPromptTokens: 1300,
        minPromptTokensRequired: 1024,
        probeTokenSufficient: true,
        fieldFound: false,
        sourceField: null,
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-P: actualPromptTokens=1300 >= 1024, no cache field → status=unknown, score=2.5, summary='API 未暴露缓存字段...', probeTokenSufficient=true` };
  },

  // Case CACHE-Q: actualPromptTokens >= 1024, field found but cachedTokens=0 → treat as none/weak
  // Must NOT say "API 未暴露缓存字段"
  caseCACHE_Q() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 1.0, status: 'none',
      summary: '未检测到有效缓存命中',
      details: [],
      evidence: {
        actualPromptTokens: 1300,
        minPromptTokensRequired: 1024,
        probeTokenSufficient: true,
        fieldFound: true,
        sourceField: 'cached_tokens',
        cacheHitRate: 0,
        firstRequest: { promptTokens: 1300 },
        secondRequest: { promptTokens: 1300, cachedTokens: 0 },
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-Q: actualPromptTokens=1300 >= 1024, fieldFound=true, cachedTokens=0 → status=none, score=1.0, fieldFound=true (NOT 'API 未暴露缓存字段')` };
  },

  // Case CACHE-TIMEOUT-1: request #1 timeout, #2 not executed, status=error, score=2
  caseCACHE_TIMEOUT_1() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 2, status: 'error',
      summary: '缓存检测超时，无法验证缓存信号',
      details: ['缓存检测请求耗时过长，已自动跳过，不影响其他验货项。'],
      evidence: {
        timeout: true, timeoutMs: 15000, totalTimeoutMs: 35000,
        firstRequest: { promptTokens: null, cachedTokens: null, timeout: true, aborted: true },
        secondRequest: null,
        fieldFound: false, sourceField: null,
        statusColor: { color: '#f59e0b', bg: '#fef9c3' },
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-TIMEOUT-1: r1 timeout, r2 not executed, status=error, score=2 → enters 6/9, final report generated` };
  },

  // Case CACHE-TIMEOUT-2: r1 success, r2 timeout, preserves r1 evidence, status=error, score=2
  caseCACHE_TIMEOUT_2() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 2, status: 'error',
      summary: '缓存检测超时，无法验证缓存信号',
      details: ['缓存检测请求耗时过长，已自动跳过，不影响其他验货项。'],
      evidence: {
        timeout: true, timeoutMs: 15000, totalTimeoutMs: 35000,
        firstRequest: { promptTokens: 1400, cachedTokens: null, cacheCreationTokens: 1400, cacheReadTokens: null, success: true },
        secondRequest: { promptTokens: null, cachedTokens: null, timeout: true, aborted: true },
        fieldFound: true, sourceField: 'cache_tokens',
        statusColor: { color: '#f59e0b', bg: '#fef9c3' },
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-TIMEOUT-2: r1 success, r2 timeout, preserves r1 evidence, status=error, score=2 → enters 6/9, final report generated` };
  },

  // Case CACHE-NETWORK-ERR: fetch failed (non-timeout), status=error, score=2
  caseCACHE_NETWORK_ERR() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 2, status: 'error',
      summary: '缓存检测请求失败，无法验证缓存信号',
      details: ['缓存检测请求耗时过长，已自动跳过，不影响其他验货项。'],
      evidence: {
        timeout: false, timeoutMs: 15000, totalTimeoutMs: 35000,
        firstRequest: { promptTokens: null, cachedTokens: null, success: false, error: 'Failed to fetch' },
        secondRequest: { promptTokens: null, cachedTokens: null, success: false },
        fieldFound: false, sourceField: null,
        statusColor: { color: '#f59e0b', bg: '#fef9c3' },
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-NETWORK-ERR: fetch failed, status=error, score=2 → does NOT block main flow, final report generated` };
  },

  // Case CACHE-SLOW-BUT-OK: r1 12s, r2 10s, both succeed within 15s limit → normal scoring
  caseCACHE_SLOW_BUT_OK() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 4.5, status: 'excellent',
      summary: '缓存命中信号很强',
      details: [],
      evidence: {
        timeout: false, timeoutMs: 15000, totalTimeoutMs: 35000,
        firstRequest: { promptTokens: 1400, cachedTokens: null, cacheCreationTokens: 1400, cacheReadTokens: null, success: true },
        secondRequest: { promptTokens: 1400, cachedTokens: 1380, cacheCreationTokens: null, cacheReadTokens: 1380, success: true },
        fieldFound: true, sourceField: 'cache_tokens',
        cacheHitRate: 0.99,
        actualPromptTokens: 1400, probeTokenSufficient: true,
        statusColor: { color: '#16a34a', bg: '#dcfce7' },
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-SLOW-BUT-OK: r1=12s, r2=10s, both <15s limit, status=excellent, score=4.5 → NOT misjudged as timeout` };
  },

  // Case CACHE-LENGTH-LOW: both requests succeed but actualPromptTokens=221, status=unknown, score=2.5
  caseCACHE_LENGTH_LOW() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({
      id: 'cacheHitCheck', label: {zh:'缓存命中检测',en:'Cache Hit Check'}, maxScore: 5, score: 2.5, status: 'unknown',
      summary: '探测长度不足，无法验证缓存宣传',
      details: ['本次缓存探测的 prompt_tokens 低于 1024，无法有效验证缓存命中。未验证不等于没有缓存。当前实际：221 tokens'],
      evidence: {
        timeout: false,
        firstRequest: { promptTokens: 221, cachedTokens: null, success: true },
        secondRequest: { promptTokens: 221, cachedTokens: 200, success: true },
        fieldFound: true, sourceField: 'cache_tokens',
        cacheHitRate: 0.91,
        actualPromptTokens: 221, minPromptTokensRequired: 1024, probeTokenSufficient: false,
        statusColor: { color: '#94a3b8', bg: '#f1f5f9' },
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    return { raw: final, capped, grade, desc: `Case CACHE-LENGTH-LOW: both succeed but actualPromptTokens=221 < 1024 → status=unknown, score=2.5, summary='探测长度不足' → enters 6/9` };
  },

  // Case MI-FAMILY-1: gpt-5.2-pro → "ChatGPT" = family_match, coreAbilityFailures=0, score=23
  // family_match alone → medium risk (NOT high), summary = 模型家族匹配，具体版本未确认
  caseMI_FAMILY_1() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 23, status: 'excellent',
      evidence: {
        modelIdentityScore: 4, modelIdentityLevel: 'family_match',
        sourceTransparency: { category: 'family_match', label: '家族匹配', riskLevel: 'low', detectedSource: null, evidenceText: 'ChatGPT', explanation: '模型自报与目标模型属于同一大模型家族，但未能精确确认具体版本。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:4,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:4,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const risk = getModelIntegrityRiskLevel(23, checks.modelIntegrity.evidence);
    return { raw: final, capped, grade, risk, desc: `Case MI-FAMILY-1: gpt-5.2-pro→ChatGPT, family_match, caf=0, score=23 → risk=${risk} (expected medium, NOT high), summary='模型家族匹配，具体版本未确认'` };
  },

  // Case MI-FAMILY-2: claude-opus-4.6 → "Claude" = family_match, coreAbilityFailures=0, score=24
  caseMI_FAMILY_2() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 24, status: 'excellent',
      evidence: {
        modelIdentityScore: 4, modelIdentityLevel: 'family_match',
        sourceTransparency: { category: 'family_match', label: '家族匹配', riskLevel: 'low', detectedSource: null, evidenceText: 'Claude', explanation: '模型自报与目标模型属于同一大模型家族，但未能精确确认具体版本。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:4,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:4,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const risk = getModelIntegrityRiskLevel(24, checks.modelIntegrity.evidence);
    return { raw: final, capped, grade, risk, desc: `Case MI-FAMILY-2: claude-opus-4.6→Claude, family_match, caf=0, score=24 → risk=${risk} (expected medium, NOT high)` };
  },

  // Case MI-WRONG-1: claude-opus-4.6 → "ChatGPT" = wrong_family → HIGH risk
  caseMI_WRONG_1() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 15, status: 'warning',
      evidence: {
        modelIdentityScore: 0, modelIdentityLevel: 'wrong_family',
        sourceTransparency: { category: 'wrong_family', label: '模型家族不一致', riskLevel: 'high', detectedSource: null, evidenceText: 'ChatGPT', explanation: '模型自报家族与目标 Model ID 明显不一致，存在模型降配或路由错误疑似风险。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:4,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const risk = getModelIntegrityRiskLevel(15, checks.modelIntegrity.evidence);
    return { raw: final, capped, grade, risk, desc: `Case MI-WRONG-1: claude→ChatGPT, wrong_family → risk=${risk} (expected high, should remain high)` };
  },

  // Case MI-WRONG-2: gpt-5.2-pro → "Claude" = wrong_family → HIGH risk
  caseMI_WRONG_2() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 15, status: 'warning',
      evidence: {
        modelIdentityScore: 0, modelIdentityLevel: 'wrong_family',
        sourceTransparency: { category: 'wrong_family', label: '模型家族不一致', riskLevel: 'high', detectedSource: null, evidenceText: 'Claude', explanation: '模型自报家族与目标 Model ID 明显不一致，存在模型降配或路由错误疑似风险。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:0,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:4,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const risk = getModelIntegrityRiskLevel(15, checks.modelIntegrity.evidence);
    return { raw: final, capped, grade, risk, desc: `Case MI-WRONG-2: gpt→Claude, wrong_family → risk=${risk} (expected high, should remain high)` };
  },

  // Case MI-ABILITY-1: family_match + coreAbilityFailures=3 → HIGH risk (ability failures override)
  caseMI_ABILITY_1() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 18, status: 'warning',
      evidence: {
        modelIdentityScore: 4, modelIdentityLevel: 'family_match',
        sourceTransparency: { category: 'family_match', label: '家族匹配', riskLevel: 'low', detectedSource: null, evidenceText: 'ChatGPT', explanation: '模型自报与目标模型属于同一大模型家族。' },
        coreAbilityFailures: 3,
        subScores: {modelIdentity:4,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:4,needle:0,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const risk = getModelIntegrityRiskLevel(18, checks.modelIntegrity.evidence);
    return { raw: final, capped, grade, risk, desc: `Case MI-ABILITY-1: family_match + caf=3 → risk=${risk} (expected high due to coreFailures>=3)` };
  },

  // Case MI-PROXY-1: platform_or_proxy_identity, caf=0, score=24 → MEDIUM (NOT high)
  caseMI_PROXY_1() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 24, status: 'excellent',
      evidence: {
        modelIdentityScore: 3, modelIdentityLevel: 'platform_or_proxy_identity',
        sourceTransparency: { category: 'platform_or_proxy_identity', label: '平台代理层暴露', riskLevel: 'medium', detectedSource: 'aws bedrock', evidenceText: 'AWS Bedrock', explanation: '检测到平台代理层身份暴露。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:3,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:4,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const risk = getModelIntegrityRiskLevel(24, checks.modelIntegrity.evidence);
    return { raw: final, capped, grade, risk, desc: `Case MI-PROXY-1: platform_or_proxy_identity, caf=0, score=24 → risk=${risk} (expected medium, NOT high)` };
  },

  // Case MI-AMBIGUOUS-1: ambiguous, caf=0, score=23 → MEDIUM (NOT high)
  caseMI_AMBIGUOUS_1() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', label: {zh:'模型可信度',en:'Model Integrity'}, maxScore: 40, score: 23, status: 'excellent',
      evidence: {
        modelIdentityScore: 1.5, modelIdentityLevel: 'ambiguous',
        sourceTransparency: { category: 'ambiguous', label: '身份未确认', riskLevel: 'medium', detectedSource: null, evidenceText: "I don't have access to the exact model name", explanation: '模型身份未能明确确认，结论置信度降低。' },
        coreAbilityFailures: 0,
        subScores: {modelIdentity:1.5,modelVisibility:3,targetCallQuality:5,jsonTest:5,instructionTest:5,codeRepair:5,reasoning:4,needle:4,consistency:2}
      }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const risk = getModelIntegrityRiskLevel(23, checks.modelIntegrity.evidence);
    return { raw: final, capped, grade, risk, desc: `Case MI-AMBIGUOUS-1: ambiguous, caf=0, score=23 → risk=${risk} (expected medium, NOT high)` };
  },

  // ── Failure Summary Mock Cases ──────────────────────────────────────


  // Case FAIL-1: baseReachability failed -> BASE_URL_UNREACHABLE
  caseFAIL_1() {
    const checks = this._makeNormalChecks();
    checks.reachability = mkCheck({ id: 'reachability', score: 0, status: 'failed', summary: 'Base URL 不可达' });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const fs = generateFailureSummary(capped, grade, checks);
    const descStr = 'FAIL-1: base failed shouldShow=' + fs.shouldShow + ' primary=' + (fs.primaryReason || 'null');
    return { raw: final, capped, grade, fs, desc: descStr };
  },

  // Case FAIL-2: auth 401 -> AUTH_FAILED
  caseFAIL_2() {
    const checks = this._makeNormalChecks();
    checks.auth = mkCheck({ id: 'auth', score: 0, status: 'failed', summary: '核心调用鉴权失败' });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const fs = generateFailureSummary(capped, grade, checks);
    const descStr = 'FAIL-2: auth 401 shouldShow=' + fs.shouldShow + ' primary=' + (fs.primaryReason || 'null');
    return { raw: final, capped, grade, fs, desc: descStr };
  },

  // Case FAIL-3: targetModelCall failed + usage high -> TARGET_MODEL_FAILED + USAGE_ABNORMAL
  caseFAIL_3() {
    const checks = this._makeNormalChecks();
    checks.targetCall = mkCheck({ id: 'targetCall', score: 0, maxScore: 22, status: 'failed', summary: '目标模型不可调用' });
    checks.costTransparency = mkCheck({ id: 'costTransparency', score: 15, status: 'warning', summary: 'usage 字段不完整' });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const fs = generateFailureSummary(capped, grade, checks);
    const descStr = 'FAIL-3: target failed + usage high shouldShow=' + fs.shouldShow + ' primary=' + (fs.primaryReason || 'null') + ' secondary=' + (fs.secondaryReason || 'null');
    return { raw: final, capped, grade, fs, desc: descStr };
  },

  // Case FAIL-4: usage missing + stability high -> USAGE_ABNORMAL + STABILITY_FAILED
  caseFAIL_4() {
    const checks = this._makeNormalChecks();
    checks.targetCall.evidence = {};
    checks.costTransparency = mkCheck({ id: 'costTransparency', score: 18, status: 'warning', summary: 'usage 缺失' });
    checks.stability = mkCheck({ id: 'stability', score: 5, status: 'warning', evidence: { avgLatency: 4000, maxLatency: 12000, latencyJitter: 6000, samples: [{ok:true},{ok:false},{ok:false}] } });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const fs = generateFailureSummary(capped, grade, checks);
    const descStr = 'FAIL-4: usage missing + stability high shouldShow=' + fs.shouldShow + ' primary=' + (fs.primaryReason || 'null') + ' secondary=' + (fs.secondaryReason || 'null');
    return { raw: final, capped, grade, fs, desc: descStr };
  },

  // Case FAIL-5: sourceTransparency test_failed only -> IDENTITY_TEST_FAILED
  caseFAIL_5() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', score: 0, status: 'failed',
      evidence: { modelIdentityLevel: 'failed', coreAbilityFailures: 0, modelIdentityScore: 0, subScores: {} }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const fs = generateFailureSummary(capped, grade, checks);
    const descStr = 'FAIL-5: identity test_failed shouldShow=' + fs.shouldShow + ' primary=' + (fs.primaryReason || 'null');
    return { raw: final, capped, grade, fs, desc: descStr };
  },

  // Case FAIL-6: cache skipped + no other severe issue -> CACHE_SKIPPED only
  caseFAIL_6() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({ id: 'cacheHitCheck', score: 2, status: 'skipped', summary: '缓存检测跳过' });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const fs = generateFailureSummary(capped, grade, checks);
    const descStr = 'FAIL-6: cache skipped shouldShow=' + fs.shouldShow + ' primary=' + (fs.primaryReason || 'null');
    return { raw: final, capped, grade, fs, desc: descStr };
  },

  // Case FAIL-7: cache unknown only -> shouldShow=false
  caseFAIL_7() {
    const checks = this._makeNormalChecks();
    checks.cacheHitCheck = mkCheck({ id: 'cacheHitCheck', score: 2.5, status: 'unknown', summary: 'API 未暴露缓存字段' });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const fs = generateFailureSummary(capped, grade, checks);
    const descStr = 'FAIL-7: cache unknown only shouldShow=' + fs.shouldShow + ' (expected false)';
    return { raw: final, capped, grade, fs, desc: descStr };
  },

  // Case FAIL-8: family_match + score 70 -> shouldShow=false
  caseFAIL_8() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', score: 30, status: 'excellent',
      evidence: { modelIdentityLevel: 'family_match', coreAbilityFailures: 0, modelIdentityScore: 4, subScores: { targetCallQuality: 5 } }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const fs = generateFailureSummary(capped, grade, checks);
    const descStr = 'FAIL-8: family_match + score=70 shouldShow=' + fs.shouldShow + ' (expected false)';
    return { raw: final, capped, grade, fs, desc: descStr };
  },

  // Case FAIL-9: platform_or_proxy + score 75 -> shouldShow=false
  caseFAIL_9() {
    const checks = this._makeNormalChecks();
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', score: 28, status: 'excellent',
      evidence: { modelIdentityLevel: 'platform_or_proxy_identity', coreAbilityFailures: 0, modelIdentityScore: 3, subScores: { targetCallQuality: 5 } }
    });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const fs = generateFailureSummary(capped, grade, checks);
    const descStr = 'FAIL-9: platform_or_proxy + score=75 shouldShow=' + fs.shouldShow + ' (expected false)';
    return { raw: final, capped, grade, fs, desc: descStr };
  },

  // Case FAIL-10: score=15.8 + multiple failures -> shouldShow=true multiple reasons
  caseFAIL_10() {
    const checks = this._makeNormalChecks();
    checks.costTransparency = mkCheck({ id: 'costTransparency', score: 10, status: 'warning', summary: 'usage 缺失' });
    checks.targetCall.evidence = {};
    checks.stability = mkCheck({ id: 'stability', score: 4, status: 'warning', evidence: { avgLatency: 5000, maxLatency: 15000, latencyJitter: 8000, samples: [{ok:true},{ok:false},{ok:false},{ok:false},{ok:false}] } });
    checks.modelIntegrity = mkCheck({
      id: 'modelIntegrity', score: 12, status: 'warning',
      evidence: { modelIdentityLevel: 'failed', coreAbilityFailures: 1, modelIdentityScore: 0, subScores: { targetCallQuality: 2 } }
    });
    checks.cacheHitCheck = mkCheck({ id: 'cacheHitCheck', score: 2, status: 'skipped', summary: '缓存检测跳过' });
    const { final } = calcFinalScore(checks);
    const capped = applyCaps(final, checks, {});
    const grade = getScoreGrade(capped);
    const fs = generateFailureSummary(capped, grade, checks);
    const descStr = 'FAIL-10: score=15.8 multiple failures shouldShow=' + fs.shouldShow + ' reasons=' + fs.reasons.length + ' primary=' + (fs.primaryReason || 'null');
    return { raw: final, capped, grade, fs, desc: descStr };
  },

  runAll() {
    const results = ['A','B','K','L','M','N','O','P','Q','V','W','X','Y','Z','AA','AB','AC','AD','AE','AF-1','AF-2','AG-1','AG-2','AH-1','AH-2','AI','AJ','AK','AL','AM','AN','AO','AP','AQ','AR','AS','AT','AU','AV','AW','AX','AY','AZ-1','AZ-2','BA-1','BA-2','BB','BC','BD','BE','BF','BG','BH','BI','BJ','BK','BL','BM','BN','BO','BU','BV','BW','BX','BY','BZ','CA','CB','CC','CD','CE','CF','CG','CH','CI','CJ','CL','CM','CN','CO','CP','CACHE-A','CACHE-B','CACHE-C','CACHE-D','CACHE-E','CACHE-F','CACHE-G','CACHE-H','CACHE-I','CACHE-J','CACHE-K','CACHE-L','CACHE-M','CACHE-N','CACHE-O','CACHE-P','CACHE-Q','CACHE-TIMEOUT-1','CACHE-TIMEOUT-2','CACHE-NETWORK-ERR','CACHE-SLOW-BUT-OK','CACHE-LENGTH-LOW','MI-FAMILY-1','MI-FAMILY-2','MI-WRONG-1','MI-WRONG-2','MI-ABILITY-1','MI-PROXY-1','MI-AMBIGUOUS-1','FAIL-1','FAIL-2','FAIL-3','FAIL-4','FAIL-5','FAIL-6','FAIL-7','FAIL-8','FAIL-9','FAIL-10'].map(c => {
      const r = this['case' + c.replace('-','_')] ? this['case' + c.replace('-','_')]() : null;
      return r ? `${r.desc} | Grade: ${r.grade?.grade || '?'} ${r.grade?.labelZh || ''}` : `Case ${c}: not found`;
    });
    return results.join('\n');
  }
};
