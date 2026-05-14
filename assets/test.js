/**
 * AI API Doctor — Local Diagnostic Engine
 * website/assets/test.js
 *
 * Security rules:
 * - API Key NEVER uploaded to AI API Doctor servers
 * - API Key NEVER written to localStorage
 * - API Key NEVER appears in console.log, report images, or copied text
 * - Base URL and Model ID may be displayed
 */
'use strict';

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */
const DIAG_TIMEOUT = 20000;   // model connectivity: 20s
const CACHE_TIMEOUT = 30000; // cache detection per request: 30s
const TOTAL_TIMEOUT = 70000; // total flow: 70s
const PROMPT_SHORT = '只回复一个字：1';
const PROMPT_LONG = `The concept of RESTful API design emphasizes stateless communication between clients and servers, where each request from a client contains all information necessary to process that request. The server does not store any user state between requests, which improves scalability and simplifies server implementation. HTTP methods such as GET, POST, PUT, DELETE, and PATCH map directly to CRUD operations. A well-designed API uses consistent naming conventions, meaningful status codes, and proper error messages to help developers integrate quickly. Response formats should be predictable, typically using JSON with clear field names. Pagination mechanisms prevent clients from overwhelming servers with large result sets. Authentication and rate limiting protect resources from unauthorized access and abuse.`;
const STORAGE_KEY_NON_SENSITIVE = 'aiapidoctor_doctor_config';

/* ═══════════════════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════════════════ */
function escHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function maskKey(key) {
  if (!key || key.length < 8) return '****';
  return key.slice(0, 3) + '****' + key.slice(-4);
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-US');
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

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

/* ═══════════════════════════════════════════════════════
   Connection Info Parser
   ═══════════════════════════════════════════════════════ */
function parseConnectionInfo(raw) {
  const text = (raw || '').trim();
  if (!text) return {};

  // New API JSON
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

  // curl command
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

  // ENV format
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

  // Raw URL
  if (/^https?:\/\//.test(text)) {
    return { baseUrl: text.replace(/\/$/, ''), apiKey: '', model: '' };
  }

  // Raw key
  if (/^sk-/.test(text)) {
    return { baseUrl: '', apiKey: text, model: '' };
  }

  return {};
}

/* ═══════════════════════════════════════════════════════
   Request Builder
   ═══════════════════════════════════════════════════════ */
function buildRequest(baseUrl, apiKey, model, interfaceType, prompt, maxTokens) {
  const urlMap = {
    'OpenAI Chat': '/chat/completions',
    'OpenAI Responses': '/responses',
    'Claude Messages': '/messages'
  };
  const path = urlMap[interfaceType] || '/chat/completions';
  const endpoint = (baseUrl + path).replace(/\/+/g, '/').replace(':/', '://');

  let body;
  if (interfaceType === 'OpenAI Chat') {
    body = { model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, stream: false };
  } else if (interfaceType === 'OpenAI Responses') {
    body = { model, input: prompt, max_output_tokens: maxTokens, stream: false };
  } else {
    body = { model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, stream: false };
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
   Core diagnostic runner
   ═══════════════════════════════════════════════════════ */
async function runDiagnosis(opts) {
  const { baseUrl, apiKey, model, interfaceType, signal, runCacheTest, runPriceTest, priceData } = opts;

  const result = {
    connectivity: null,   // { status, latency, requestId, visibleOutput, visibleLength, promptTokens, completionTokens, totalTokens, finishReason, rawMessage, rawResponse }
    usageIntegrity: null, // 'complete' | 'incomplete' | 'missing' | 'not_applicable'
    billingIntegrity: null, // { verdict, deltaQuota, beforeQuota, after10Quota, rawQuotas }
    cacheHit: null,        // { status, cachedTokens, latency1, latency2, usage1, usage2 }
    priceAudit: null,      // { status, expectedCost, actualCost, ratio }
    errorAttribution: null, // string
    score: 0,
    confidence: 'low',
    status: 'unknown',
    timestamp: new Date().toLocaleString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
  };

  // ── Step 1: Model connectivity ──────────────────────
  const req1 = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_SHORT, 5);
  try {
    const t0 = Date.now();
    const resp = await fetch(req1.endpoint, {
      method: 'POST',
      headers: req1.headers,
      body: JSON.stringify(req1.body),
      signal
    });
    result.connectivity = {
      status: resp.status,
      latency: Date.now() - t0,
      rawResponse: resp.clone()
    };

    let data;
    try { data = await resp.json(); } catch { data = {}; }
    result.connectivity.rawMessage = JSON.stringify(data).slice(0, 500);

    // Extract visible output
    let visibleOutput = '';
    if (interfaceType === 'OpenAI Chat' || interfaceType === 'OpenAI Responses') {
      const choices = data.choices || data.output?.text ? [data.output] : [];
      visibleOutput = (choices[0]?.message?.content || choices[0]?.text || '').trim();
    } else {
      visibleOutput = (data.content?.[0]?.text || '').trim();
    }
    result.connectivity.visibleOutput = visibleOutput;
    result.connectivity.visibleLength = visibleOutput.length;

    // Extract usage
    const usage = data.usage || data.usage || {};
    result.connectivity.promptTokens = usage.prompt_tokens || usage.input_tokens || null;
    result.connectivity.completionTokens = usage.completion_tokens || usage.output_tokens || null;
    result.connectivity.totalTokens = usage.total_tokens || null;
    result.connectivity.promptTokensDetails = usage.prompt_tokens_details || {};
    result.connectivity.cachedTokens = usage.prompt_tokens_details?.cached_tokens
      || usage.input_tokens_details?.cached_tokens
      || usage.cached_tokens
      || null;
    result.connectivity.finishReason = data.choices?.[0]?.finish_reason
      || data.stop_reason
      || null;
    result.connectivity.requestId = data.id || null;

    // Error attribution
    result.errorAttribution = getErrorAttribution(resp.status, 'cors_error' in opts && opts.cors_error);

  } catch (err) {
    if (err.name === 'AbortError') {
      result.connectivity = { status: 0, latency: 0, error: 'timeout', rawMessage: 'Request timed out' };
    } else {
      result.connectivity = { status: 0, latency: 0, error: 'cors_or_network', rawMessage: err.message };
      result.errorAttribution = getErrorAttribution(0, true);
    }
  }

  // ── Step 2: Usage integrity ────────────────────────
  result.usageIntegrity = assessUsageIntegrity(result.connectivity);

  // ── Step 3: Cache hit detection ───────────────────
  if (runCacheTest) {
    result.cacheHit = await runCacheTestFn(baseUrl, apiKey, model, interfaceType, signal);
  }

  // ── Step 4: Price audit ───────────────────────────
  if (runPriceTest && priceData) {
    result.priceAudit = runPriceAudit(result.connectivity, priceData);
  }

  // ── Step 5: Billing integrity (manual evidence) ───
  // Only assessable via manual raw quota input — mark as unavailable in local test mode
  result.billingIntegrity = { verdict: 'raw_quota_unavailable', reason: '网页版无法自动读取 raw quota，请切换到手动报告模式填写原始额度。' };

  // ── Score calculation ──────────────────────────────
  const scored = calculateScore(result);
  result.score = scored.score;
  result.confidence = scored.confidence;
  result.status = scored.status;

  return result;
}

async function runCacheTestFn(baseUrl, apiKey, model, interfaceType, signal) {
  const req1 = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_LONG, 5);
  const req2 = buildRequest(baseUrl, apiKey, model, interfaceType, PROMPT_LONG, 5);

  try {
    const t1 = Date.now();
    const r1 = await fetch(req1.endpoint, { method:'POST', headers:req1.headers, body:JSON.stringify(req1.body), signal });
    const latency1 = Date.now() - t1;
    const d1 = await r1.json();
    const u1 = d1.usage || d1.usage || {};
    const cached1 = u1.prompt_tokens_details?.cached_tokens || u1.input_tokens_details?.cached_tokens || u1.cached_tokens || 0;
    const visible1 = (d1.choices?.[0]?.message?.content || d1.content?.[0]?.text || '').trim();

    await sleep(2000);

    const t2 = Date.now();
    const r2 = await fetch(req2.endpoint, { method:'POST', headers:req2.headers, body:JSON.stringify(req2.body), signal });
    const latency2 = Date.now() - t2;
    const d2 = await r2.json();
    const u2 = d2.usage || d2.usage || {};
    const cached2 = u2.prompt_tokens_details?.cached_tokens || u2.input_tokens_details?.cached_tokens || u2.cached_tokens || 0;

    return {
      status: cached1 > 0 || cached2 > 0 ? 'hit' : 'no_hit',
      cachedTokens1: cached1,
      cachedTokens2: cached2,
      latency1,
      latency2,
      usage1: u1,
      usage2: u2,
      visibleOutput: visible1
    };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

function runPriceAudit(connectivity, priceData) {
  const usage = connectivity ? (connectivity.promptTokensDetails || {}) : {};
  const cachedTokens = connectivity?.cachedTokens || 0;
  const inputTokens = connectivity?.promptTokens || 0;
  const outputTokens = connectivity?.completionTokens || 0;

  if (!inputTokens && !outputTokens) {
    return { status: 'no_usage', expectedCost: null, actualCost: null };
  }

  const ip = parseFloat(priceData.inputPrice) || 0;
  const op = parseFloat(priceData.outputPrice) || 0;
  const crp = parseFloat(priceData.cachedReadPrice) || ip * 0.5;
  const cwp = parseFloat(priceData.cachedWritePrice) || ip;

  const uncachedInput = Math.max(0, inputTokens - cachedTokens);
  const expected = (uncachedInput / 1e6) * ip
                + (cachedTokens / 1e6) * crp
                + (outputTokens / 1e6) * op;

  const actual = parseFloat(priceData.actualCost) || null;

  let ratio = null;
  let status = 'normal';
  if (actual !== null && actual > 0) {
    ratio = actual / expected;
    if (ratio > 2) status = 'anomaly_risk';
    else if (ratio > 1.2) status = 'needs_review';
  }

  return { status, expectedCost: expected, actualCost: actual, ratio, inputTokens, outputTokens, cachedTokens };
}

function assessUsageIntegrity(conn) {
  if (!conn || conn.status === 0) return 'not_applicable';
  if (conn.status >= 400) return 'not_applicable';
  if (!conn.visibleLength) return 'not_applicable';

  const hasPrompt = conn.promptTokens != null;
  const hasCompletion = conn.completionTokens != null;
  const hasTotal = conn.totalTokens != null;
  const hasCache = conn.cachedTokens != null;

  if (hasPrompt && hasCompletion && hasTotal) return 'complete';
  if (hasTotal) return 'incomplete';
  return 'missing';
}

function getErrorAttribution(status, isCorsError) {
  if (isCorsError) return 'CORS：网页无法直接检测，不代表 API 不可用。建议使用 Chrome 插件或手动报告模式。';
  if (status === 401) return '401：API Key 无效或未授权。';
  if (status === 403) return '403：权限不足、IP 限制或服务商拒绝访问。';
  if (status === 404) return '404：模型不存在、路由错误或 endpoint 不兼容。';
  if (status === 429) return '429：请求过快、余额不足、RPM/TPM 限制或上游限流。';
  if (status >= 500 && status < 600) return `${status}：服务商或上游服务异常，建议稍后重试并核对是否发生预扣返还。`;
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ═══════════════════════════════════════════════════════
   Score calculation
   ═══════════════════════════════════════════════════════ */
function calculateScore(result) {
  let billingScore = null;   // 0-100 or null
  let connectivityScore = null;
  let usageScore = null;
  let cacheScore = null;
  let priceScore = null;

  // Billing integrity (35%)
  if (result.billingIntegrity) {
    const v = result.billingIntegrity.verdict;
    if (v === 'failed_request_not_charged' || v === 'precharge_refunded') billingScore = 100;
    else if (v === 'raw_quota_unavailable') billingScore = null;
    else if (v === 'failed_request_charged' || v === 'empty_response_charged') billingScore = 20;
    else billingScore = 60; // needs review
  }

  // Connectivity (25%)
  if (result.connectivity) {
    const s = result.connectivity.status;
    if (s >= 200 && s < 300 && result.connectivity.visibleLength > 0) connectivityScore = 100;
    else if (s >= 200 && result.connectivity.visibleLength === 0) connectivityScore = 60;
    else if (s === 0) connectivityScore = 20; // CORS or network
    else connectivityScore = 20;
  }

  // Usage integrity (15%)
  if (result.usageIntegrity) {
    if (result.usageIntegrity === 'complete') usageScore = 100;
    else if (result.usageIntegrity === 'incomplete') usageScore = 60;
    else if (result.usageIntegrity === 'missing') usageScore = 40;
    else usageScore = null;
  }

  // Cache hit (15%)
  if (result.cacheHit) {
    if (result.cacheHit.status === 'hit') cacheScore = 100;
    else if (result.cacheHit.status === 'no_hit') cacheScore = 50;
    else cacheScore = null;
  }

  // Price audit (10%)
  if (result.priceAudit) {
    if (result.priceAudit.status === 'normal') priceScore = 100;
    else if (result.priceAudit.status === 'needs_review') priceScore = 60;
    else if (result.priceAudit.status === 'anomaly_risk') priceScore = 20;
    else priceScore = null;
  }

  // Weighted score
  const scores = [billingScore, connectivityScore, usageScore, cacheScore, priceScore].filter(s => s !== null && s !== undefined);
  const weights = [0.35, 0.25, 0.15, 0.15, 0.10];
  let totalWeight = 0, weightedSum = 0;
  scores.forEach((s, i) => {
    const w = weights[i];
    weightedSum += s * w;
    totalWeight += w;
  });

  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  // Confidence
  const completedCount = scores.length;
  let confidence = 'low';
  if (connectivityScore !== null && usageScore !== null && billingScore !== null) {
    if (cacheScore !== null || priceScore !== null) confidence = 'high';
    else confidence = 'medium';
  }

  // Status
  let status = 'unknown';
  if (completedCount >= 2) {
    if (score >= 85) status = 'normal';
    else if (score >= 60) status = 'needs_review';
    else status = 'anomaly_risk';
  } else {
    status = 'unable_to_determine';
  }

  return { score, confidence, status };
}

/* ═══════════════════════════════════════════════════════
   Report rendering
   ═══════════════════════════════════════════════════════ */
function renderDiagnosticReport(result, formData, exportNode) {
  const score = result.score;
  const confidence = result.confidence;
  const status = result.status;

  const statusLabels = {
    normal: '正常',
    needs_review: '需复查',
    anomaly_risk: '异常风险',
    unable_to_determine: '无法判断',
    unknown: '未知'
  };
  const statusClass = {
    normal: 'ok',
    needs_review: 'warn',
    anomaly_risk: 'danger',
    unable_to_determine: 'neutral',
    unknown: 'neutral'
  }[status] || 'neutral';

  const conn = result.connectivity || {};
  const connStatusClass = conn.status >= 200 && conn.status < 300 ? 'ok' : conn.status >= 400 ? 'danger' : 'neutral';
  const connStatusLabels = {
    ok: '正常',
    warn: '需复查',
    danger: '异常',
    neutral: '无法判断'
  }[connStatusClass] || '未知';

  const usageLabel = {
    complete: '完整',
    incomplete: '不完整',
    missing: '缺失',
    not_applicable: '不适用',
    null: '未检测'
  }[result.usageIntegrity] || '未检测';

  const cacheLabel = {
    hit: '命中',
    no_hit: '未命中',
    error: '检测失败',
    null: '未检测'
  }[result.cacheHit?.status] || '未检测';
  const cacheClass = {
    hit: 'ok',
    no_hit: 'warn',
    error: 'danger',
    null: 'neutral'
  }[result.cacheHit?.status] || 'neutral';

  const priceLabel = {
    normal: '正常',
    needs_review: '需复查',
    anomaly_risk: '异常',
    no_usage: '无 usage',
    null: '未检测'
  }[result.priceAudit?.status] || '未检测';
  const priceClass = {
    normal: 'ok',
    needs_review: 'warn',
    anomaly_risk: 'danger',
    no_usage: 'neutral',
    null: 'neutral'
  }[result.priceAudit?.status] || 'neutral';

  const billingLabel = {
    failed_request_not_charged: '未扣费',
    precharge_refunded: '已返还',
    failed_request_charged: '扣费',
    empty_response_charged: '扣费',
    raw_quota_unavailable: '无法判断',
    null: '未检测'
  }[result.billingIntegrity?.verdict] || '未检测';
  const billingClass = {
    failed_request_not_charged: 'ok',
    precharge_refunded: 'ok',
    failed_request_charged: 'danger',
    empty_response_charged: 'danger',
    raw_quota_unavailable: 'neutral',
    null: 'neutral'
  }[result.billingIntegrity?.verdict] || 'neutral';

  // Evidence chain
  const bq = result.billingIntegrity?.beforeQuota;
  const aq = result.billingIntegrity?.after10Quota;
  const delta = result.billingIntegrity?.deltaQuota;
  const hasRawQuota = bq && aq;

  const evidenceHtml = hasRawQuota ? `
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <div style="background:#f1f5f9;border:2px solid #e2e8f0;border-radius:8px;padding:10px 14px;text-align:center;min-width:70px">
        <div style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:4px">检测前</div>
        <div style="font-size:13px;font-weight:700;font-family:monospace;color:#0f172a">${fmtNum(bq)}</div>
      </div>
      <div style="font-size:16px;color:#cbd5e1">&#8594;</div>
      <div style="background:${conn.status >= 400 ? '#fee2e2' : '#f1f5f9'};border:2px solid ${conn.status >= 400 ? '#fecaca' : '#e2e8f0'};border-radius:8px;padding:10px 14px;text-align:center;min-width:60px">
        <div style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:4px">HTTP</div>
        <div style="font-size:13px;font-weight:700;font-family:monospace;color:${conn.status >= 400 ? '#dc2626' : '#0f172a'}">${conn.status || '—'}</div>
      </div>
      <div style="font-size:16px;color:#cbd5e1">&#8594;</div>
      <div style="background:#f1f5f9;border:2px solid #e2e8f0;border-radius:8px;padding:10px 14px;text-align:center;min-width:70px">
        <div style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:4px">10 秒后</div>
        <div style="font-size:13px;font-weight:700;font-family:monospace;color:#0f172a">${fmtNum(aq)}</div>
      </div>
    </div>` : '';

  const techGrid = `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px">
      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Base URL</div>
        <div style="font-size:12px;font-weight:600;color:#0f172a;word-break:break-all;font-family:monospace;margin-top:2px">${escHtml(formData.baseUrl || '—')}</div>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Model</div>
        <div style="font-size:12px;font-weight:600;color:#0f172a;font-family:monospace;margin-top:2px">${escHtml(formData.model || '—')}</div>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Interface</div>
        <div style="font-size:12px;font-weight:600;color:#0f172a;margin-top:2px">${escHtml(formData.interfaceType || '—')}</div>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">HTTP</div>
        <div style="font-size:12px;font-weight:700;color:${conn.status >= 400 ? '#dc2626' : '#16a34a'};font-family:monospace;margin-top:2px">${conn.status || '—'}</div>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Latency</div>
        <div style="font-size:12px;font-weight:600;color:#0f172a;font-family:monospace;margin-top:2px">${conn.latency ? conn.latency + 'ms' : '—'}</div>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">output_tokens</div>
        <div style="font-size:12px;font-weight:600;color:#0f172a;font-family:monospace;margin-top:2px">${conn.completionTokens ?? '—'}</div>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">total_tokens</div>
        <div style="font-size:12px;font-weight:600;color:#0f172a;font-family:monospace;margin-top:2px">${conn.totalTokens ?? '—'}</div>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">cached_tokens</div>
        <div style="font-size:12px;font-weight:600;color:#0f172a;font-family:monospace;margin-top:2px">${conn.cachedTokens ?? '—'}</div>
      </div>
      ${result.priceAudit && result.priceAudit.expectedCost !== null ? `
      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Expected Cost</div>
        <div style="font-size:12px;font-weight:600;color:#0f172a;font-family:monospace;margin-top:2px">$${result.priceAudit.expectedCost.toFixed(6)}</div>
      </div>` : ''}
      ${result.priceAudit && result.priceAudit.actualCost !== null ? `
      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Actual Cost</div>
        <div style="font-size:12px;font-weight:600;color:#0f172a;font-family:monospace;margin-top:2px">$${result.priceAudit.actualCost.toFixed(6)}</div>
      </div>` : ''}
    </div>`;

  const conclusionMap = {
    normal: `本次诊断未发现明显异常。HTTP ${conn.status || '—'}，${usageLabel} usage${conn.cachedTokens != null ? `，cached_tokens = ${conn.cachedTokens}` : ''}。${result.errorAttribution || ''}`,
    needs_review: `部分检测项需复查。HTTP ${conn.status || '—'}，${usageLabel} usage。${result.errorAttribution || '建议核对服务商后台余额变化。'}`,
    anomaly_risk: `检测到异常信号。HTTP ${conn.status || '—'}，${usageLabel} usage。${result.errorAttribution || '建议将报告发给站长核对。'}`,
    unable_to_determine: `检测项不足，无法得出明确结论。建议：①填写原始额度进行扣费检测；②使用 Chrome 插件自动读取 New API raw quota。`,
    unknown: `请重新检测。`
  };
  const conclusion = conclusionMap[status] || conclusionMap.unknown;

  const verdictClass = statusClass;
  const verdictBg = { ok: '#dcfce7', warn: '#fef3c7', danger: '#fee2e2', neutral: '#f1f5f9' }[verdictClass] || '#f1f5f9';
  const verdictColor = { ok: '#16a34a', warn: '#d97706', danger: '#dc2626', neutral: '#64748b' }[verdictClass] || '#64748b';

  const html = `
    <div style="border-bottom:1px solid #e2e8f0;padding-bottom:20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div>
        <div style="font-size:18px;font-weight:700;color:#0f172a">AI API Doctor</div>
        <div style="font-size:13px;color:#64748b;margin-top:2px">API 体检报告</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#64748b;line-height:1.8">
        <div>API Key 已脱敏</div>
        <div>本地浏览器检测</div>
        <div>${result.timestamp}</div>
      </div>
    </div>

    <div style="text-align:center;padding:24px 16px;border-radius:12px;background:${verdictBg};margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${verdictColor};margin-bottom:8px">${statusLabels[status] || '未知'}</div>
      <div style="font-size:48px;font-weight:800;line-height:1.1;color:#0f172a;margin-bottom:4px">${score}</div>
      <div style="font-size:11px;color:#64748b">API 体检分</div>
      <div style="font-size:12px;color:#64748b;margin-top:6px">置信度：<strong>${confidence === 'high' ? '高' : confidence === 'medium' ? '中' : '低'}</strong></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:20px;grid-template-columns:repeat(auto-fit,minmax(100px,1fr))">
      <div style="background:#f1f5f9;border-radius:8px;padding:12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">扣费完整性</div>
        <div style="font-size:14px;font-weight:700;color:${billingClass === 'ok' ? '#16a34a' : billingClass === 'danger' ? '#dc2626' : '#64748b'};display:flex;align-items:center;gap:5px">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${billingClass === 'ok' ? '#16a34a' : billingClass === 'danger' ? '#dc2626' : '#94a3b8'}"></span>
          ${billingLabel}
        </div>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">模型联通</div>
        <div style="font-size:14px;font-weight:700;color:${connStatusClass === 'ok' ? '#16a34a' : connStatusClass === 'danger' ? '#dc2626' : '#64748b'};display:flex;align-items:center;gap:5px">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${connStatusClass === 'ok' ? '#16a34a' : connStatusClass === 'danger' ? '#dc2626' : '#94a3b8'}"></span>
          ${connStatusLabels}
        </div>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">usage 完整性</div>
        <div style="font-size:14px;font-weight:700;color:${usageLabel === '完整' ? '#16a34a' : usageLabel === '缺失' ? '#dc2626' : '#64748b'};display:flex;align-items:center;gap:5px">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${usageLabel === '完整' ? '#16a34a' : usageLabel === '缺失' ? '#dc2626' : '#94a3b8'}"></span>
          ${usageLabel}
        </div>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">缓存命中</div>
        <div style="font-size:14px;font-weight:700;color:${cacheClass === 'ok' ? '#16a34a' : cacheClass === 'warn' ? '#d97706' : '#64748b'};display:flex;align-items:center;gap:5px">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cacheClass === 'ok' ? '#16a34a' : cacheClass === 'warn' ? '#d97706' : '#94a3b8'}"></span>
          ${cacheLabel}
        </div>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">价格核对</div>
        <div style="font-size:14px;font-weight:700;color:${priceClass === 'ok' ? '#16a34a' : priceClass === 'warn' ? '#d97706' : '#64748b'};display:flex;align-items:center;gap:5px">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${priceClass === 'ok' ? '#16a34a' : priceClass === 'warn' ? '#d97706' : '#94a3b8'}"></span>
          ${priceLabel}
        </div>
      </div>
    </div>

    ${evidenceHtml}

    ${techGrid}

    ${result.errorAttribution ? `<div style="background:#eff6ff;border-left:3px solid #2563eb;border-radius:0 6px 6px 0;padding:10px 14px;font-size:13px;color:#1e40af;line-height:1.6;margin-bottom:12px">${escHtml(result.errorAttribution)}</div>` : ''}

    <div style="background:#f8fafc;border-radius:8px;padding:12px 14px;font-size:13px;color:#0f172a;line-height:1.6;margin-bottom:12px;border-left:3px solid #2563eb">${escHtml(conclusion)}</div>

    <div style="font-size:11px;color:#94a3b8;line-height:1.5;padding:10px 12px;background:#f9fafb;border-radius:8px;margin-bottom:16px">
      API Key 已脱敏。本报告只展示本次测试中的可复现信号，不证明服务商故意多扣费。本工具不是法律审计报告。
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button onclick="Doctor.saveImage()" style="flex:1;padding:10px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        保存图片
      </button>
      <button onclick="Doctor.copyMarkdown()" style="flex:1;padding:10px 16px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        复制 Markdown
      </button>
      <button onclick="Doctor.copyForProvider()" style="flex:1;padding:10px 16px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        复制给站长
      </button>
    </div>
  `;

  const node = document.getElementById('result-card');
  if (node) node.innerHTML = html;

  return { status, score, confidence, verdictClass, statusLabels };
}

/* ═══════════════════════════════════════════════════════
   Markdown copy
   ═══════════════════════════════════════════════════════ */
function buildMarkdownReport(result, formData) {
  const conn = result.connectivity || {};
  const statusLabels = { normal: '正常', needs_review: '需复查', anomaly_risk: '异常风险', unable_to_determine: '无法判断', unknown: '未知' };
  const status = result.status || 'unknown';

  return [
    '## AI API Doctor 体检报告',
    '',
    `**结论：** ${statusLabels[status] || '未知'} | **体检分：** ${result.score}/100 | **置信度：** ${result.confidence === 'high' ? '高' : result.confidence === 'medium' ? '中' : '低'}`,
    '',
    '### 检测维度',
    `| 维度 | 结果 |`,
    `|------|------|`,
    `| 扣费完整性 | ${result.billingIntegrity?.verdict || '未检测'} |`,
    `| 模型联通 | HTTP ${conn.status || '—'} |`,
    `| usage 完整性 | ${result.usageIntegrity || '未检测'} |`,
    `| 缓存命中 | ${result.cacheHit?.status || '未检测'} |`,
    `| 价格核对 | ${result.priceAudit?.status || '未检测'} |`,
    '',
    '### 技术摘要',
    `| 项目 | 值 |`,
    `|------|----|`,
    `| Base URL | ${formData.baseUrl || '—'} |`,
    `| 模型 | ${formData.model || '—'} |`,
    `| 接口 | ${formData.interfaceType || '—'} |`,
    `| HTTP | ${conn.status || '—'} |`,
    `| Latency | ${conn.latency ? conn.latency + 'ms' : '—'} |`,
    `| completion_tokens | ${conn.completionTokens ?? '—'} |`,
    `| total_tokens | ${conn.totalTokens ?? '—'} |`,
    `| cached_tokens | ${conn.cachedTokens ?? '—'} |`,
    conn.visibleOutput ? `| 可见输出 | ${conn.visibleOutput.substring(0, 80)}... |` : '',
    '',
    result.errorAttribution ? `### 错误归因\n${result.errorAttribution}\n` : '',
    '### 安全说明',
    '本报告不包含 API Key，只展示本次测试中的可复现信号，不证明服务商故意多扣费。本工具不是法律审计报告。',
    '',
    `Generated by AI API Doctor · ${result.timestamp}`
  ].filter(Boolean).join('\n');
}

/* ═══════════════════════════════════════════════════════
   Copy-for-provider template
   ═══════════════════════════════════════════════════════ */
function buildProviderReport(result, formData) {
  const conn = result.connectivity || {};
  const statusLabels = { normal: '正常', needs_review: '需复查', anomaly_risk: '异常风险', unable_to_determine: '无法判断', unknown: '未知' };
  const status = result.status || 'unknown';

  return [
    '您好，我用 AI API Doctor 做了一次本地诊断，结果如下：',
    '',
    `结论：${statusLabels[status] || '未知'}`,
    `API 体检分：${result.score}/100`,
    `置信度：${result.confidence === 'high' ? '高' : result.confidence === 'medium' ? '中' : '低'}`,
    '',
    '检测项：',
    `- 扣费完整性：${result.billingIntegrity?.verdict || '未检测'}`,
    `- 模型联通：HTTP ${conn.status || '—'}${conn.latency ? ' (' + conn.latency + 'ms)' : ''}`,
    `- usage 完整性：${result.usageIntegrity || '未检测'}`,
    `- 缓存命中：${result.cacheHit?.status || '未检测'}`,
    `- 价格核对：${result.priceAudit?.status || '未检测'}`,
    '',
    '关键证据：',
    `- Base URL：${formData.baseUrl || '—'}`,
    `- 模型：${formData.model || '—'}`,
    `- 接口：${formData.interfaceType || '—'}`,
    `- HTTP 状态：${conn.status || '—'}`,
    `- 可见输出长度：${conn.visibleLength ?? '—'}`,
    `- completion_tokens / output_tokens：${conn.completionTokens ?? '—'}`,
    `- total_tokens：${conn.totalTokens ?? '—'}`,
    `- cached_tokens / cache_read_input_tokens：${conn.cachedTokens ?? '—'}`,
    result.priceAudit?.expectedCost !== null ? `- 理论成本：$${result.priceAudit.expectedCost.toFixed(6)}` : '',
    result.priceAudit?.actualCost !== null ? `- 实际扣费：$${result.priceAudit.actualCost.toFixed(6)}` : '',
    '',
    '说明：',
    '本报告只展示本次测试中的可复现信号，不证明服务商故意多扣费。请协助核对计费日志、预扣返还、usage 返回和缓存计费规则。',
    '',
    '站长修复建议：',
    '失败请求、无效模型、上游 503、超时、无有效输出请求不应最终扣费；如果发生预扣，应在最终结算阶段返还。若 cached_tokens 或 cache_read_input_tokens 已返回，应按站点公示的缓存价格结算。',
    '',
    '— 由 AI API Doctor 生成 · aiapidoctor.com'
  ].filter(Boolean).join('\n');
}

/* ═══════════════════════════════════════════════════════
   Save image (fixed 1080×1350)
   ═══════════════════════════════════════════════════════ */
async function saveDiagnosticImage() {
  const exportNode = document.getElementById('report-export-node');
  const sourceNode = document.getElementById('result-card');

  if (!sourceNode) { showToast('报告节点不存在'); return; }

  try {
    await new Promise(requestAnimationFrame);
    await document.fonts.ready.catch(() => undefined);

    if (typeof htmlToImage !== 'undefined') {
      const dataUrl = await htmlToImage.toPng(sourceNode, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#f8fafc',
        width: 1080,
        height: undefined // auto height
      });
      downloadDataUrl(dataUrl, `aiapidoctor-diagnostic-${Date.now()}.png`);
      showToast('报告图片已保存');
    } else {
      showToast('图片生成失败，请使用浏览器截图或复制报告文本。');
    }
  } catch (err) {
    showToast('图片生成失败，请使用浏览器截图或复制报告文本。');
  }
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/* ═══════════════════════════════════════════════════════
   Non-sensitive config storage (no API key)
   ═══════════════════════════════════════════════════════ */
function saveConfigToStorage(data) {
  try {
    const safe = { baseUrl: data.baseUrl, providerName: data.providerName, model: data.model, interfaceType: data.interfaceType };
    localStorage.setItem(STORAGE_KEY_NON_SENSITIVE, JSON.stringify(safe));
  } catch (_) {}
}

function restoreConfigFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NON_SENSITIVE);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return (data && typeof data === 'object') ? data : {};
  } catch (_) { return {}; }
}

/* ═══════════════════════════════════════════════════════
   Doctor Controller (global)
   ═══════════════════════════════════════════════════════ */
window.Doctor = {
  _result: null,
  _formData: null,
  _controller: null,
  _cacheEnabled: false,
  _priceEnabled: false,

  init() {
    // Restore non-sensitive config
    const saved = restoreConfigFromStorage();
    if (saved.baseUrl) {
      const el = document.getElementById('doctor-base-url');
      if (el) el.value = saved.baseUrl;
    }
    if (saved.model) {
      const el = document.getElementById('doctor-model');
      if (el) el.value = saved.model;
    }
    if (saved.interfaceType) {
      this.setInterface(saved.interfaceType);
    }
  },

  onConnectionInfoInput(el) {
    const parsed = parseConnectionInfo(el.value);
    if (parsed.baseUrl) {
      const urlEl = document.getElementById('doctor-base-url');
      if (urlEl && !urlEl.value) urlEl.value = parsed.baseUrl;
    }
    if (parsed.apiKey) {
      const keyEl = document.getElementById('doctor-api-key');
      if (keyEl && !keyEl.value) keyEl.value = parsed.apiKey;
    }
    if (parsed.model) {
      const modelEl = document.getElementById('doctor-model');
      if (modelEl && !modelEl.value) modelEl.value = parsed.model;
    }
  },

  normalizeBaseUrl(el) {
    let val = el.value.trim().replace(/\/$/, '');
    // Fix double /v1
    val = val.replace(/\/v1\/v1$/, '/v1');
    // Hint if missing /v1
    const hint = document.getElementById('base-url-hint');
    if (hint) {
      if (val && !val.match(/\/v1$/)) {
        hint.style.display = 'block';
      } else {
        hint.style.display = 'none';
      }
    }
    el.value = val;
  },

  setInterface(type) {
    document.querySelectorAll('.interface-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    // Update hidden input
    const el = document.getElementById('doctor-interface');
    if (el) el.value = type;
  },

  toggleAdvanced() {
    const panel = document.getElementById('advanced-panel');
    const toggle = document.getElementById('advanced-toggle');
    if (!panel || !toggle) return;
    const open = panel.classList.toggle('open');
    toggle.classList.toggle('open', open);
  },

  toggleCache(checkbox) {
    this._cacheEnabled = checkbox.checked;
  },

  togglePrice(checkbox) {
    this._priceEnabled = checkbox.checked;
  },

  showCommonModels(btn) {
    const list = btn.nextElementSibling;
    if (list) list.classList.toggle('open');
    // Click outside to close
    const close = (e) => {
      if (!btn.parentElement.contains(e.target)) {
        list?.classList.remove('open');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  selectModel(model) {
    const el = document.getElementById('doctor-model');
    if (el) el.value = model;
    const list = document.querySelector('.common-models__list');
    if (list) list.classList.remove('open');
  },

  async run() {
    const baseUrl = (document.getElementById('doctor-base-url')?.value || '').trim();
    const apiKey = (document.getElementById('doctor-api-key')?.value || '').trim();
    const model = (document.getElementById('doctor-model')?.value || '').trim();
    const interfaceType = (document.getElementById('doctor-interface')?.value || 'OpenAI Chat');
    const providerName = (document.getElementById('doctor-provider')?.value || '').trim()
      || (baseUrl ? new URL(baseUrl.startsWith('http') ? baseUrl : 'https://' + baseUrl).hostname : 'Unknown');

    if (!baseUrl) { showToast('请填写 Base URL'); return; }
    if (!model) { showToast('请填写 Model ID'); return; }

    // Save non-sensitive config
    saveConfigToStorage({ baseUrl, providerName, model, interfaceType });

    // Cancel previous
    if (this._controller) this._controller.abort();
    this._controller = new AbortController();

    const btn = document.getElementById('doctor-run-btn');
    const clearBtn = document.getElementById('doctor-clear-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="status-dot status-dot--running"></span>检测中...`;
    }
    if (clearBtn) clearBtn.disabled = true;

    // Show progress
    this.showProgress('running');

    // Price data
    const priceData = this._priceEnabled ? {
      inputPrice: document.getElementById('price-input')?.value,
      outputPrice: document.getElementById('price-output')?.value,
      cachedReadPrice: document.getElementById('price-cached-read')?.value,
      cachedWritePrice: document.getElementById('price-cached-write')?.value,
      actualCost: document.getElementById('price-actual')?.value
    } : null;

    this._formData = { baseUrl, apiKey, model, interfaceType, providerName };

    try {
      const timeout = setTimeout(() => {
        this._controller.abort();
      }, TOTAL_TIMEOUT);

      this._result = await runDiagnosis({
        baseUrl, apiKey, model, interfaceType,
        signal: this._controller.signal,
        runCacheTest: this._cacheEnabled,
        runPriceTest: this._priceEnabled,
        priceData
      });

      clearTimeout(timeout);
    } catch (err) {
      if (err.name === 'AbortError') {
        showToast('检测超时（70 秒），请重试或使用 Chrome 插件');
      }
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> 开始体检`;
    }
    if (clearBtn) clearBtn.disabled = false;

    if (this._result) {
      this.showProgress('done');
      renderDiagnosticReport(this._result, this._formData);
      document.getElementById('result-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  showProgress(state) {
    const steps = [
      '模型联通检测',
      'usage 完整性',
      this._cacheEnabled ? '缓存命中检测' : null,
      this._priceEnabled ? '价格核对' : null,
      '计算体检分'
    ].filter(Boolean);

    const container = document.getElementById('diag-progress');
    if (!container) return;

    if (state === 'running') {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
          ${steps.map((s, i) => `
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#64748b" id="step-${i}">
              <span class="status-dot status-dot--running"></span>
              <span>${s}</span>
            </div>`).join('')}
        </div>`;
    } else {
      container.innerHTML = '';
    }
  },

  clear() {
    ['doctor-base-url','doctor-api-key','doctor-model','doctor-provider'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('doctor-interface').value = 'OpenAI Chat';
    this.setInterface('OpenAI Chat');
    document.getElementById('result-card').innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:#94a3b8;font-size:14px">
        填写信息后点击"开始体检"，即可查看诊断报告。
      </div>`;
    this._result = null;
    this._formData = null;
    if (this._controller) this._controller.abort();
    showToast('已清空');
  },

  async saveImage() {
    await saveDiagnosticImage();
  },

  copyMarkdown() {
    if (!this._result) { showToast('请先进行检测'); return; }
    const md = buildMarkdownReport(this._result, this._formData);
    copyToClipboard(md, 'Markdown 已复制');
  },

  copyForProvider() {
    if (!this._result) { showToast('请先进行检测'); return; }
    const text = buildProviderReport(this._result, this._formData);
    copyToClipboard(text, '报告文本已复制，可发给站长');
  }
};
