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
const DIAG_TIMEOUT = 20000;
const CACHE_TIMEOUT = 30000;
const TOTAL_TIMEOUT = 90000;
const PROMPT_SHORT = '只回复一个字：1';
const PROMPT_LONG = `The concept of RESTful API design emphasizes stateless communication between clients and servers, where each request from a client contains all information necessary to process that request. The server does not store any user state between requests, which improves scalability and simplifies server implementation. HTTP methods such as GET, POST, PUT, DELETE, and PATCH map directly to CRUD operations. A well-designed API uses consistent naming conventions, meaningful status codes, and proper error messages to help developers integrate quickly. Response formats should be predictable, typically using JSON with clear field names. Pagination mechanisms prevent clients from overwhelming servers with large result sets. Authentication and rate limiting protect resources from unauthorized access and abuse.`;
const STORAGE_KEY_NON_SENSITIVE = 'aiapidoctor_doctor_config';

/* ═══════════════════════════════════════════════════════
   Detection Modes — simplified to 2
   ═══════════════════════════════════════════════════════ */
const DETECTION_MODES = {
  quick: {
    label: '快速检测',
    labelEn: 'Quick Check',
    desc: '1 次请求，检测模型联通、HTTP 状态、延迟和基础 usage，消耗极低。',
    descEn: '1 request — checks model connectivity, HTTP status, latency, and basic usage. Minimal cost.',
    requests: '1 次请求，消耗极低',
    requestsEn: '1 request, minimal cost',
    connectivity: true,
    usageIntegrity: true,
    cacheTest: false,
    priceAudit: false,
    modelSanity: false,
    isFull: false
  },
  full: {
    label: '完整体检',
    labelEn: 'Full Doctor Check',
    desc: '会额外检测扣费、缓存、usage 完整性和模型表现，可能发送多次请求并消耗少量额度。',
    descEn: 'Also checks billing, cache, usage integrity, and model performance. May make multiple requests and consume a small amount of quota.',
    requests: '约 6-7 次请求，可能消耗少量额度',
    requestsEn: '~6-7 requests, may consume a small amount of quota',
    connectivity: true,
    usageIntegrity: true,
    cacheTest: false,
    priceAudit: false,
    modelSanity: true,
    isFull: true
  }
};

/* ═══════════════════════════════════════════════════════
   Model Sanity — Local Question Bank
   Each dimension has ≥3 questions, randomly pick 1 per test run.
   No remote loading. Questions don't include API keys.
   ═══════════════════════════════════════════════════════ */
const SANITY_QUESTION_BANK = {
  instruction_following: {
    name: '指令遵守',
    nameEn: 'Instruction Following',
    pool: [
      {
        prompt: '请严格只输出下面 JSON，不要解释，不要 Markdown：\n{"answer":"AI_API_DOCTOR_OK"}',
        expected: 'AI_API_DOCTOR_OK',
        normalize(raw) {
          const text = (raw || '').trim();
          try {
            const obj = JSON.parse(text);
            return obj && obj.answer === 'AI_API_DOCTOR_OK' ? 'perfect' : 'partial';
          } catch (_) {
            if (text.includes('AI_API_DOCTOR_OK')) {
              if (text.length < 30) return 'partial';
              return 'extra';
            }
            return 'fail';
          }
        },
        score(norm) {
          if (norm === 'perfect') return 100;
          if (norm === 'partial') return 90;
          if (norm === 'extra') return 60;
          return 20;
        },
        explain(norm) {
          if (norm === 'perfect') return '严格输出了正确 JSON，无多余内容';
          if (norm === 'partial') return 'JSON 格式正确但有轻微差异';
          if (norm === 'extra') return '包含正确答案但有多余解释';
          return '未输出正确内容';
        }
      },
      {
        prompt: '只输出单词 PASS，不要有任何其他文字或符号。',
        expected: 'PASS',
        normalize(raw) {
          const text = (raw || '').trim().toUpperCase();
          if (text === 'PASS') return 'perfect';
          if (text.startsWith('PASS') && text.length > 4) return 'extra';
          return 'fail';
        },
        score(norm) {
          if (norm === 'perfect') return 100;
          if (norm === 'extra') return 60;
          return 0;
        },
        explain(norm) {
          if (norm === 'perfect') return '严格只输出了 PASS';
          if (norm === 'extra') return '包含 PASS 但有多余内容';
          return '未按要求输出';
        }
      },
      {
        prompt: '请严格按照以下格式回答，不要解释：type:ok',
        expected: 'type:ok',
        normalize(raw) {
          const text = (raw || '').trim();
          if (text === 'type:ok') return 'perfect';
          if (text.includes('type:ok')) return 'extra';
          return 'fail';
        },
        score(norm) {
          if (norm === 'perfect') return 100;
          if (norm === 'extra') return 60;
          return 0;
        },
        explain(norm) {
          if (norm === 'perfect') return '完全按格式输出';
          if (norm === 'extra') return '包含正确格式但有多余内容';
          return '未按格式输出';
        }
      }
    ]
  },
  basic_reasoning: {
    name: '基础推理',
    nameEn: 'Basic Reasoning',
    pool: [
      {
        prompt: '小明有 3 个盒子。红盒比蓝盒重，蓝盒比绿盒重。请问最轻的是哪个盒子？只输出盒子颜色。',
        expected: '绿',
        normalize(raw) {
          const text = (raw || '').trim().toLowerCase();
          if (text === '绿' || text === '绿色' || text === '绿盒') return 'correct';
          if (text.includes('绿') && text.length < 10) return 'correct_extra';
          return 'wrong';
        },
        score(norm) {
          if (norm === 'correct') return 100;
          if (norm === 'correct_extra') return 80;
          return 0;
        },
        explain(norm) {
          if (norm === 'correct') return '答案正确：绿盒最轻';
          if (norm === 'correct_extra') return '答案正确但有解释';
          return '答案错误';
        }
      },
      {
        prompt: 'A 比 B 重，B 比 C 重。最轻的是谁？只输出字母。',
        expected: 'C',
        normalize(raw) {
          const text = (raw || '').trim().toUpperCase();
          if (text === 'C') return 'correct';
          if (text.startsWith('C')) return 'correct_extra';
          return 'wrong';
        },
        score(norm) {
          if (norm === 'correct') return 100;
          if (norm === 'correct_extra') return 80;
          return 0;
        },
        explain(norm) {
          if (norm === 'correct') return '推理正确：C 最轻';
          if (norm === 'correct_extra') return '结论正确但有多余内容';
          return '推理错误';
        }
      },
      {
        prompt: '苹果比梨贵，梨比香蕉贵。三种水果中最便宜的是什么？只输出水果名称。',
        expected: '香蕉',
        normalize(raw) {
          const text = (raw || '').trim();
          if (text === '香蕉') return 'correct';
          if (text.includes('香蕉') && text.length < 8) return 'correct_extra';
          return 'wrong';
        },
        score(norm) {
          if (norm === 'correct') return 100;
          if (norm === 'correct_extra') return 80;
          return 0;
        },
        explain(norm) {
          if (norm === 'correct') return '推理正确：香蕉最便宜';
          if (norm === 'correct_extra') return '结论正确但有多余内容';
          return '推理错误';
        }
      }
    ]
  },
  number_trap: {
    name: '数字陷阱',
    nameEn: 'Number Trap',
    pool: [
      {
        prompt: '只输出答案，不要解释：9.11 和 9.9 哪个数字更大？',
        expected: '9.9',
        normalize(raw) {
          const text = (raw || '').trim();
          if (text === '9.9') return 'correct';
          if (text === '9.11') return 'wrong';
          if (text.includes('9.9') && text.length < 10) return 'correct_extra';
          return 'other';
        },
        score(norm) {
          if (norm === 'correct') return 100;
          if (norm === 'correct_extra') return 80;
          if (norm === 'wrong') return 0;
          return 20;
        },
        explain(norm) {
          if (norm === 'correct') return '正确识别：9.9 > 9.11';
          if (norm === 'correct_extra') return '结论正确但有解释';
          if (norm === 'wrong') return '错误识别 9.11 > 9.9（常见陷阱）';
          return '其他错误';
        }
      },
      {
        prompt: '请回答：1.02 和 1.2 谁更大？只输出数字。',
        expected: '1.2',
        normalize(raw) {
          const text = (raw || '').trim();
          if (text === '1.2') return 'correct';
          if (text === '1.02') return 'wrong';
          if (text.includes('1.2') && text.length < 8) return 'correct_extra';
          return 'other';
        },
        score(norm) {
          if (norm === 'correct') return 100;
          if (norm === 'correct_extra') return 80;
          if (norm === 'wrong') return 0;
          return 20;
        },
        explain(norm) {
          if (norm === 'correct') return '正确识别：1.2 > 1.02';
          if (norm === 'correct_extra') return '结论正确但有解释';
          if (norm === 'wrong') return '错误识别 1.02 > 1.2（常见陷阱）';
          return '其他错误';
        }
      },
      {
        prompt: '哪个数更大：5.08 还是 5.4？只写数字，不要写文字。',
        expected: '5.4',
        normalize(raw) {
          const text = (raw || '').trim();
          if (text === '5.4') return 'correct';
          if (text === '5.08') return 'wrong';
          if (text.includes('5.4') && text.length < 8) return 'correct_extra';
          return 'other';
        },
        score(norm) {
          if (norm === 'correct') return 100;
          if (norm === 'correct_extra') return 80;
          if (norm === 'wrong') return 0;
          return 20;
        },
        explain(norm) {
          if (norm === 'correct') return '正确识别：5.4 > 5.08';
          if (norm === 'correct_extra') return '结论正确但有解释';
          if (norm === 'wrong') return '错误识别 5.08 > 5.4（常见陷阱）';
          return '其他错误';
        }
      }
    ]
  },
  code_understanding: {
    name: '代码理解',
    nameEn: 'Code Understanding',
    pool: [
      {
        prompt: '下面 JavaScript 输出什么？只输出最终结果。\n\nlet a = [1,2,3];\nlet b = a;\nb.push(4);\nconsole.log(a.length);',
        expected: '4',
        normalize(raw) {
          const text = (raw || '').trim();
          if (text === '4') return 'correct';
          if (text === '3') return 'wrong';
          if (text.includes('4') && text.length < 8) return 'correct_extra';
          return 'other';
        },
        score(norm) {
          if (norm === 'correct') return 100;
          if (norm === 'correct_extra') return 80;
          return 0;
        },
        explain(norm) {
          if (norm === 'correct') return '正确：a 和 b 指向同一数组，结果为 4';
          if (norm === 'correct_extra') return '结论正确但有解释';
          return '答案错误';
        }
      },
      {
        prompt: '下面 JavaScript 输出什么？只输出数字。\n\nconst obj = { val: 10 };\nfunction fn(o) { o.val = 20; }\nfn(obj);\nconsole.log(obj.val);',
        expected: '20',
        normalize(raw) {
          const text = (raw || '').trim();
          if (text === '20') return 'correct';
          if (text === '10') return 'wrong';
          if (text.includes('20') && text.length < 8) return 'correct_extra';
          return 'other';
        },
        score(norm) {
          if (norm === 'correct') return 100;
          if (norm === 'correct_extra') return 80;
          return 0;
        },
        explain(norm) {
          if (norm === 'correct') return '正确：对象按引用传递，val 变为 20';
          if (norm === 'correct_extra') return '结论正确但有解释';
          return '答案错误';
        }
      },
      {
        prompt: '下面代码的 console.log 输出了什么？只输出结果。\n\nlet x = [1, 2];\nlet y = x;\nx.push(3);\nconsole.log(y.length);',
        expected: '3',
        normalize(raw) {
          const text = (raw || '').trim();
          if (text === '3') return 'correct';
          if (text === '2') return 'wrong';
          if (text.includes('3') && text.length < 8) return 'correct_extra';
          return 'other';
        },
        score(norm) {
          if (norm === 'correct') return 100;
          if (norm === 'correct_extra') return 80;
          return 0;
        },
        explain(norm) {
          if (norm === 'correct') return '正确：y 和 x 共享同一数组，长度为 3';
          if (norm === 'correct_extra') return '结论正确但有解释';
          return '答案错误';
        }
      }
    ]
  },
  context_retention: {
    name: '上下文保持',
    nameEn: 'Context Retention',
    pool: [
      {
        prompt: '记住以下配置：\nprovider = alpha\nmodel = beta-2026\nprice = 0.123\n\n现在只输出 model 的值。',
        expected: 'beta-2026',
        normalize(raw) {
          const text = (raw || '').trim();
          if (text === 'beta-2026') return 'correct';
          if (text.includes('beta-2026') && text.length < 30) return 'correct_extra';
          return 'wrong';
        },
        score(norm) {
          if (norm === 'correct') return 100;
          if (norm === 'correct_extra') return 70;
          return 0;
        },
        explain(norm) {
          if (norm === 'correct') return '正确记忆并输出：beta-2026';
          if (norm === 'correct_extra') return '包含正确值但有多余内容';
          return '未正确记忆上下文';
        }
      },
      {
        prompt: '请记住这个序列号：API-2026-Q1-PRO。当被问到"序列号是什么"时，只输出这个序列号。',
        expected: 'API-2026-Q1-PRO',
        normalize(raw) {
          const text = (raw || '').trim();
          if (text === 'API-2026-Q1-PRO') return 'correct';
          if (text.includes('API-2026-Q1-PRO') && text.length < 40) return 'correct_extra';
          return 'wrong';
        },
        score(norm) {
          if (norm === 'correct') return 100;
          if (norm === 'correct_extra') return 70;
          return 0;
        },
        explain(norm) {
          if (norm === 'correct') return '正确记忆序列号';
          if (norm === 'correct_extra') return '包含正确序列号但有多余内容';
          return '未正确记忆序列号';
        }
      },
      {
        prompt: '记住这个密钥标识：SECRET-X9-ALPHA。现在问：密钥标识是什么？只输出标识本身。',
        expected: 'SECRET-X9-ALPHA',
        normalize(raw) {
          const text = (raw || '').trim();
          if (text === 'SECRET-X9-ALPHA') return 'correct';
          if (text.includes('SECRET-X9-ALPHA') && text.length < 40) return 'correct_extra';
          return 'wrong';
        },
        score(norm) {
          if (norm === 'correct') return 100;
          if (norm === 'correct_extra') return 70;
          return 0;
        },
        explain(norm) {
          if (norm === 'correct') return '正确记忆密钥标识';
          if (norm === 'correct_extra') return '包含正确标识但有多余内容';
          return '未正确记忆密钥标识';
        }
      }
    ]
  }
};

function pickRandomQuestion(bankKey) {
  const bank = SANITY_QUESTION_BANK[bankKey];
  if (!bank || !bank.pool || bank.pool.length === 0) return null;
  return bank.pool[Math.floor(Math.random() * bank.pool.length)];
}

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
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function generateReportId() {
  const now = new Date();
  const mmdd = String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return 'AID-' + mmdd + '-' + suffix;
}

function getDocLang() {
  return document.documentElement.lang === 'en' ? 'en' : 'zh';
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
   Model Sanity Tests
   ═══════════════════════════════════════════════════════ */
async function runModelSanityTests(opts) {
  const { baseUrl, apiKey, model, interfaceType, signal } = opts;
  const results = [];

  const dimensionKeys = ['instruction_following', 'basic_reasoning', 'number_trap', 'code_understanding', 'context_retention'];

  for (const dimKey of dimensionKeys) {
    const bank = SANITY_QUESTION_BANK[dimKey];
    const question = pickRandomQuestion(dimKey);
    if (!question) continue;

    const req = buildRequest(baseUrl, apiKey, model, interfaceType, question.prompt, 50);
    let rawOutput = '';
    let latency = 0;
    let status = 'ok';

    try {
      const t0 = Date.now();
      const resp = await fetch(req.endpoint, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal
      });
      latency = Date.now() - t0;

      let data;
      try { data = await resp.json(); } catch { data = {}; }

      if (interfaceType === 'OpenAI Chat' || interfaceType === 'OpenAI Responses') {
        rawOutput = (data.choices?.[0]?.message?.content || data.output?.text || '').trim();
      } else {
        rawOutput = (data.content?.[0]?.text || '').trim();
      }

      if (!resp.ok) {
        status = 'error';
        rawOutput = `HTTP ${resp.status}`;
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        status = 'timeout';
        rawOutput = 'Request timed out';
      } else {
        status = 'error';
        rawOutput = err.message;
      }
    }

    const norm = question.normalize(rawOutput);
    const score = question.score(norm);
    const explanation = question.explain(norm);

    results.push({
      id: dimKey,
      name: bank.name,
      nameEn: bank.nameEn,
      prompt: question.prompt,
      expected: question.expected,
      rawOutput: rawOutput.length > 200 ? rawOutput.slice(0, 200) + '...' : rawOutput,
      norm,
      score,
      latency,
      status,
      explanation
    });
  }

  const weights = { instruction_following: 0.25, basic_reasoning: 0.25, number_trap: 0.20, code_understanding: 0.15, context_retention: 0.15 };
  let weightedSum = 0, totalWeight = 0;
  results.forEach(r => {
    const w = weights[r.id] || 0.1;
    weightedSum += r.score * w;
    totalWeight += w;
  });
  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  let label, labelEn;
  if (overallScore >= 90) { label = '表现稳定'; labelEn = 'Stable'; }
  else if (overallScore >= 70) { label = '基本可用'; labelEn = 'Usable'; }
  else if (overallScore >= 50) { label = '需复查'; labelEn = 'Needs Review'; }
  else { label = '疑似降智'; labelEn = 'Possible Degradation'; }

  return { overallScore, label, labelEn, results };
}

/* ═══════════════════════════════════════════════════════
   Report fingerprint via Web Crypto API SHA-256
   ═══════════════════════════════════════════════════════ */
async function generateReportFingerprint(data) {
  try {
    const jsonStr = JSON.stringify(data);
    const encoded = new TextEncoder().encode(jsonStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return hashHex.slice(0, 4) + '-' + hashHex.slice(4, 8);
  } catch (_) {
    return 'XXXX-XXXX';
  }
}

/* ═══════════════════════════════════════════════════════
   Score calculation — for full mode only
   Status: pass / warn / fail / skipped / blocked
   skipped/blocked: not in denominator
   pass: 100%, warn: 50%, fail: 0%
   billing:30, connectivity:20, usage:15, cache:15, price:10, modelSanity:10
   ═══════════════════════════════════════════════════════ */
const DIM_WEIGHTS = {
  billing: 30,
  connectivity: 20,
  usage: 15,
  cache: 15,
  price: 10,
  modelSanity: 10
};
const TOTAL_WEIGHT = Object.values(DIM_WEIGHTS).reduce((a, b) => a + b, 0);

function newCalcScore(result) {
  const dims = {
    billing:      { state: result.billing?.state,       score: null },
    connectivity: { state: result.connectivity?.state,  score: null },
    usage:        { state: result.usageIntegrity?.state, score: null },
    cache:        { state: result.cacheHit?.state,       score: null },
    price:        { state: result.priceAudit?.state,    score: null },
    modelSanity:  { state: result.modelSanity?.state,   score: null },
  };

  if (result.billing?.state) {
    dims.billing.state = result.billing.state;
  } else if (result.billing?.verdict) {
    const v = result.billing.verdict;
    if (v === 'failed_request_not_charged' || v === 'precharge_refunded') {
      dims.billing.state = 'pass'; dims.billing.score = 100;
    } else if (v === 'failed_request_charged' || v === 'empty_response_charged') {
      dims.billing.state = 'fail'; dims.billing.score = 0;
    } else if (v === 'raw_quota_unavailable') {
      dims.billing.state = 'skipped';
    } else {
      dims.billing.state = 'warn'; dims.billing.score = 50;
    }
  } else {
    dims.billing.state = 'skipped';
  }

  if (result.connectivity) {
    const s = result.connectivity.status;
    if (result.connectivity.error === 'cors_or_network') {
      dims.connectivity.state = 'blocked';
      dims.connectivity.score = 20;
    } else if (s >= 200 && s < 300 && (result.connectivity.visibleLength > 0)) {
      dims.connectivity.state = 'pass'; dims.connectivity.score = 100;
    } else if (s >= 200 && result.connectivity.visibleLength === 0) {
      dims.connectivity.state = 'warn'; dims.connectivity.score = 50;
    } else if (s === 0) {
      dims.connectivity.state = 'fail'; dims.connectivity.score = 0;
    } else {
      dims.connectivity.state = 'fail'; dims.connectivity.score = 0;
    }
  } else {
    dims.connectivity.state = 'skipped';
  }

  if (result.usageIntegrity) {
    if (result.usageIntegrity === 'complete') {
      dims.usage.state = 'pass'; dims.usage.score = 100;
    } else if (result.usageIntegrity === 'incomplete') {
      dims.usage.state = 'warn'; dims.usage.score = 50;
    } else if (result.usageIntegrity === 'missing') {
      dims.usage.state = 'fail'; dims.usage.score = 0;
    } else {
      dims.usage.state = 'skipped';
    }
  } else {
    dims.usage.state = 'skipped';
  }

  if (result.cacheHit) {
    if (result.cacheHit.status === 'hit') {
      dims.cache.state = 'pass'; dims.cache.score = 100;
    } else if (result.cacheHit.status === 'no_hit') {
      dims.cache.state = 'warn'; dims.cache.score = 50;
    } else {
      dims.cache.state = 'skipped';
    }
  } else {
    dims.cache.state = 'skipped';
  }

  if (result.priceAudit) {
    if (result.priceAudit.status === 'normal') {
      dims.price.state = 'pass'; dims.price.score = 100;
    } else if (result.priceAudit.status === 'needs_review') {
      dims.price.state = 'warn'; dims.price.score = 50;
    } else if (result.priceAudit.status === 'anomaly_risk') {
      dims.price.state = 'fail'; dims.price.score = 0;
    } else {
      dims.price.state = 'skipped';
    }
  } else {
    dims.price.state = 'skipped';
  }

  if (result.modelSanity && result.modelSanity.overallScore !== null) {
    const ms = result.modelSanity.overallScore;
    if (ms >= 70) {
      dims.modelSanity.state = 'pass'; dims.modelSanity.score = 100;
    } else if (ms >= 50) {
      dims.modelSanity.state = 'warn'; dims.modelSanity.score = 50;
    } else {
      dims.modelSanity.state = 'fail'; dims.modelSanity.score = 0;
    }
  } else {
    dims.modelSanity.state = 'skipped';
  }

  let activeWeight = 0, earnedWeight = 0;
  for (const [key, dim] of Object.entries(dims)) {
    if (dim.state === 'skipped' || dim.state === 'blocked') continue;
    activeWeight += DIM_WEIGHTS[key];
    if (dim.score !== null) earnedWeight += dim.score * DIM_WEIGHTS[key] / 100;
  }

  const score = activeWeight > 0 ? Math.round(earnedWeight / activeWeight * 100) : null;
  const coverage = Math.round(activeWeight / TOTAL_WEIGHT * 100);

  let confidence = 'low';
  if (activeWeight >= 70) confidence = 'high';
  else if (activeWeight >= 40) confidence = 'medium';

  let heroTitle = '体检完成';
  let heroStatus = 'ok';
  let heroSub = '';
  let heroStatusLabel = '正常';

  if (coverage < 40) {
    heroTitle = '基础检测完成';
    heroStatus = 'ok';
    heroStatusLabel = '完成';
    heroSub = '已完成模型联通和基础响应检测，未运行扣费/缓存/模型表现检测。';
  } else {
    const hasFail = Object.values(dims).some(d => d.state === 'fail');
    const hasWarn = Object.values(dims).some(d => d.state === 'warn');
    if (hasFail) {
      heroTitle = '发现风险';
      heroStatus = 'danger';
      heroStatusLabel = '异常风险';
      heroSub = '检测中发现异常，请查看下方详情。';
    } else if (hasWarn) {
      heroTitle = '需要复查';
      heroStatus = 'warn';
      heroStatusLabel = '需复查';
      heroSub = '部分检测项需要关注，请查看下方详情。';
    } else if (coverage >= 70) {
      heroTitle = '体检完成';
      heroStatus = 'ok';
      heroStatusLabel = '正常';
      heroSub = '所有检测项均通过。';
    } else {
      heroTitle = '部分体检完成';
      heroStatus = 'ok';
      heroStatusLabel = '完成';
      heroSub = '部分检测项已完成，结果请见下方。';
    }
  }

  const modelSanityScore = dims.modelSanity.score !== null ? Math.round(dims.modelSanity.score) : null;

  let overallScore;
  if (modelSanityScore !== null && score !== null) {
    overallScore = Math.round(score * 0.7 + modelSanityScore * 0.3);
  } else if (score !== null) {
    overallScore = score;
  } else {
    overallScore = null;
  }

  return {
    score,
    overallScore,
    modelSanityScore,
    coverage,
    activeWeight,
    confidence,
    heroTitle,
    heroStatus,
    heroStatusLabel,
    heroSub,
    dims
  };
}

/* ═══════════════════════════════════════════════════════
   Main finding
   ═══════════════════════════════════════════════════════ */
function getMainFinding(result, dims) {
  if (dims.connectivity?.state === 'fail') return '模型联通失败';
  if (dims.connectivity?.state === 'blocked') return '模型联通受阻（CORS 限制）';
  const onlyConnPassed = dims.connectivity?.state === 'pass'
    && dims.usage?.state === 'skipped'
    && dims.billing?.state === 'skipped'
    && dims.cache?.state === 'skipped'
    && dims.price?.state === 'skipped'
    && dims.modelSanity?.state === 'skipped';
  if (onlyConnPassed) return '基础联通正常';
  if (dims.usage?.state === 'fail') return 'usage 返回不完整';
  if (dims.usage?.state === 'warn') return 'usage 返回需复查';
  if (dims.billing?.state === 'fail') return '发现扣费异常风险';
  if (dims.cache?.state === 'pass') return '缓存字段已返回';
  if (dims.modelSanity?.state === 'fail') return '发现模型表现异常';
  if (dims.modelSanity?.state === 'warn') return '模型表现需复查';
  if (dims.price?.state === 'fail') return '价格核对异常';
  return '检测完成';
}

function getMainFindingEn(result, dims) {
  if (dims.connectivity?.state === 'fail') return 'Model connectivity failed';
  if (dims.connectivity?.state === 'blocked') return 'Model connectivity blocked (CORS restriction)';
  const onlyConnPassed = dims.connectivity?.state === 'pass'
    && dims.usage?.state === 'skipped'
    && dims.billing?.state === 'skipped'
    && dims.cache?.state === 'skipped'
    && dims.price?.state === 'skipped'
    && dims.modelSanity?.state === 'skipped';
  if (onlyConnPassed) return 'Basic connectivity normal';
  if (dims.usage?.state === 'fail') return 'Incomplete usage data';
  if (dims.usage?.state === 'warn') return 'Usage data needs review';
  if (dims.billing?.state === 'fail') return 'Billing anomaly risk detected';
  if (dims.cache?.state === 'pass') return 'Cache fields returned';
  if (dims.modelSanity?.state === 'fail') return 'Model performance anomaly detected';
  if (dims.modelSanity?.state === 'warn') return 'Model performance needs review';
  if (dims.price?.state === 'fail') return 'Price audit anomaly';
  return 'Diagnosis complete';
}

/* ═══════════════════════════════════════════════════════
   Quick mode: simple finding
   ═══════════════════════════════════════════════════════ */
function getQuickFinding(result, lang) {
  const zh = lang !== 'en';
  const conn = result.connectivity;
  if (!conn) return { status: 'unknown', label: zh ? '无法判断' : 'Unknown', text: zh ? '无法获取响应' : 'Unable to get response' };
  if (conn.error === 'cors_or_network') {
    return { status: 'blocked', label: zh ? '受阻' : 'Blocked', text: zh ? '浏览器跨域限制，网页版无法判断' : 'Browser CORS restriction — cannot determine from web page' };
  }
  if (conn.error === 'timeout') {
    return { status: 'timeout', label: zh ? '超时' : 'Timeout', text: zh ? '请求超时' : 'Request timed out' };
  }
  const s = conn.status;
  if (s === 401 || s === 403) {
    return { status: 'fail', label: zh ? '失败' : 'Failed', text: zh ? 'API Key 无效或权限不足' : 'API Key invalid or insufficient permissions' };
  }
  if (s === 404) {
    return { status: 'fail', label: zh ? '失败' : 'Failed', text: zh ? '模型不可用或模型名不匹配' : 'Model unavailable or model name mismatch' };
  }
  if (s >= 500 && s < 600) {
    return { status: 'warn', label: zh ? '需复查' : 'Needs Review', text: zh ? '服务商或上游错误，需要复查' : 'Provider or upstream error — please review' };
  }
  if (s >= 200 && s < 300) {
    if (conn.visibleLength > 0) {
      return { status: 'pass', label: zh ? '正常' : 'Normal', text: zh ? '模型联通正常' : 'Model connectivity normal' };
    }
    return { status: 'warn', label: zh ? '需复查' : 'Needs Review', text: zh ? '模型联通正常，usage 明细未返回' : 'Connectivity OK, usage details not returned' };
  }
  return { status: 'fail', label: zh ? '失败' : 'Failed', text: (zh ? 'HTTP ' : 'HTTP ') + s };
}

/* ═══════════════════════════════════════════════════════
   Core diagnostic runner
   ═══════════════════════════════════════════════════════ */
async function runDiagnosis(opts) {
  const { baseUrl, apiKey, model, interfaceType, signal, runCacheTest, runPriceTest, priceData, runSanityTest, mode } = opts;

  const result = {
    connectivity: null,
    usageIntegrity: null,
    billing: null,
    cacheHit: null,
    priceAudit: null,
    errorAttribution: null,
    modelSanity: null,
    reportId: generateReportId(),
    reportFingerprint: '',
    timestamp: new Date().toLocaleString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }),
    mode: mode || 'quick'
  };

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
      state: null,
    };

    let data;
    try { data = await resp.json(); } catch { data = {}; }

    let visibleOutput = '';
    if (interfaceType === 'OpenAI Chat' || interfaceType === 'OpenAI Responses') {
      const choices = data.choices || data.output?.text ? [data.output] : [];
      visibleOutput = (choices[0]?.message?.content || choices[0]?.text || '').trim();
    } else {
      visibleOutput = (data.content?.[0]?.text || '').trim();
    }
    result.connectivity.visibleOutput = visibleOutput;
    result.connectivity.visibleLength = visibleOutput.length;

    const usage = data.usage || {};
    result.connectivity.promptTokens = usage.prompt_tokens || usage.input_tokens || null;
    result.connectivity.completionTokens = usage.completion_tokens || usage.output_tokens || null;
    result.connectivity.totalTokens = usage.total_tokens || null;
    result.connectivity.cachedTokens = usage.prompt_tokens_details?.cached_tokens
      || usage.input_tokens_details?.cached_tokens
      || usage.cached_tokens
      || null;

    result.errorAttribution = getErrorAttribution(resp.status, false);

  } catch (err) {
    if (err.name === 'AbortError') {
      result.connectivity = { status: 0, latency: 0, error: 'timeout', state: 'fail' };
    } else {
      result.connectivity = { status: 0, latency: 0, error: 'cors_or_network', rawMessage: err.message, state: 'blocked' };
      result.errorAttribution = 'CORS / 浏览器拦截：网页无法直接读取当前站点的响应内容。这是浏览器的安全限制，不代表 API 本身不可用。建议手动填写 Model ID，或使用 Chrome 插件绕过此限制。';
    }
  }

  result.usageIntegrity = assessUsageIntegrity(result.connectivity);

  if (runCacheTest) {
    result.cacheHit = await runCacheTestFn(baseUrl, apiKey, model, interfaceType, signal);
  }

  if (runPriceTest && priceData) {
    result.priceAudit = runPriceAudit(result.connectivity, priceData);
  }

  result.billing = { verdict: 'raw_quota_unavailable', reason: '网页版无法自动读取 raw quota，请切换到手动报告模式填写原始额度。', state: 'skipped' };

  if (runSanityTest) {
    result.modelSanity = await runModelSanityTests({ baseUrl, apiKey, model, interfaceType, signal });
  }

  if (mode === 'full') {
    const scored = newCalcScore(result);
    result._scored = scored;
  }

  const fpData = {
    reportId: result.reportId,
    timestamp: result.timestamp,
    mode: result.mode,
    apiHealthScore: result._scored?.score ?? null,
    modelSanityScore: result._scored?.modelSanityScore ?? null,
    overallScore: result._scored?.overallScore ?? null,
    coverage: result._scored?.coverage ?? 0,
    confidence: result._scored?.confidence ?? 'low',
    connectivityState: result.connectivity?.state,
    usageState: result.usageIntegrity?.state,
    cacheState: result.cacheHit?.state,
    billingState: result.billing?.state,
    priceState: result.priceAudit?.state,
    modelSanityState: result.modelSanity ? 'tested' : 'skipped',
  };
  result.reportFingerprint = await generateReportFingerprint(fpData);

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
    const u1 = d1.usage || {};
    const cached1 = u1.prompt_tokens_details?.cached_tokens || u1.input_tokens_details?.cached_tokens || u1.cached_tokens || 0;

    await sleep(2000);

    const t2 = Date.now();
    const r2 = await fetch(req2.endpoint, { method:'POST', headers:req2.headers, body:JSON.stringify(req2.body), signal });
    const latency2 = Date.now() - t2;
    const d2 = await r2.json();
    const u2 = d2.usage || {};
    const cached2 = u2.prompt_tokens_details?.cached_tokens || u2.input_tokens_details?.cached_tokens || u2.cached_tokens || 0;

    return {
      status: cached1 > 0 || cached2 > 0 ? 'hit' : 'no_hit',
      cachedTokens1: cached1,
      cachedTokens2: cached2,
      latency1,
      latency2,
      state: cached1 > 0 || cached2 > 0 ? 'hit' : 'no_hit'
    };
  } catch (err) {
    return { status: 'error', error: err.message, state: 'skipped' };
  }
}

function runPriceAudit(connectivity, priceData) {
  const cachedTokens = connectivity?.cachedTokens || 0;
  const inputTokens = connectivity?.promptTokens || 0;
  const outputTokens = connectivity?.completionTokens || 0;

  if (!inputTokens && !outputTokens) {
    return { status: 'no_usage', expectedCost: null, actualCost: null, state: 'skipped' };
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

  return { status, expectedCost: expected, actualCost: actual, ratio, inputTokens, outputTokens, cachedTokens, state: status };
}

function assessUsageIntegrity(conn) {
  if (!conn || conn.status === 0) return 'skipped';
  if (conn.status >= 400) return 'skipped';
  if (!conn.visibleLength) return 'skipped';

  const hasPrompt = conn.promptTokens != null;
  const hasCompletion = conn.completionTokens != null;
  const hasTotal = conn.totalTokens != null;

  if (hasPrompt && hasCompletion && hasTotal) return 'complete';
  if (hasTotal) return 'incomplete';
  return 'missing';
}

function getErrorAttribution(status, isCorsError) {
  if (isCorsError) return 'CORS / 浏览器拦截：网页无法直接读取当前站点的响应内容。这是浏览器的安全限制，不代表 API 本身不可用。建议手动填写 Model ID，或使用 Chrome 插件绕过此限制。';
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
   Report rendering — Quick mode (no scores)
   ═══════════════════════════════════════════════════════ */
function renderQuickReport(result, formData) {
  const lang = getDocLang();
  const zh = lang !== 'en';
  const conn = result.connectivity || {};
  const qf = getQuickFinding(result, lang);
  const reportId = result.reportId;
  const timestamp = result.timestamp;

  const statusColorMap = { pass: '#16a34a', warn: '#d97706', fail: '#dc2626', blocked: '#64748b', unknown: '#94a3b8' };
  const statusBgMap = { pass: '#dcfce7', warn: '#fef3c7', fail: '#fee2e2', blocked: '#f1f5f9', unknown: '#f1f5f9' };
  const sc = statusColorMap[qf.status] || '#94a3b8';
  const bg = statusBgMap[qf.status] || '#f1f5f9';

  const usageState = assessUsageIntegrity(conn);
  const usageText = usageState === 'complete' ? 'yes' : usageState === 'incomplete' ? 'partial' : 'no';

  const title = zh ? '基础联通检测' : 'Basic Connectivity Check';
  const titleSuffix = qf.status === 'pass' ? (zh ? '完成' : 'Complete') : qf.status === 'blocked' ? (zh ? '受阻' : 'Blocked') : qf.status === 'fail' ? (zh ? '失败' : 'Failed') : qf.status === 'warn' ? (zh ? '需复查' : 'Needs Review') : (zh ? '未知' : 'Unknown');
  const untestedNote = zh
    ? '未开启的检测：扣费完整性、缓存命中、模型表现、价格核对。切换到「完整体检」可继续检查。'
    : 'Unchecked: Billing integrity, Cache hit, Model performance, Price audit. Switch to "Full Check" to continue.';
  const labelApiKey = zh ? 'API Key Anonymized' : 'API Key 已脱敏';
  const labelLocalBrowser = zh ? 'Local Browser Test' : '本地浏览器检测';
  const labelSaveImg = zh ? 'Save Image' : '保存图片';
  const labelCopy = zh ? 'Copy Result' : '复制结果';
  const reportNodeLabel = zh ? 'Report ID' : '报告 ID';
  const safeNote = zh
    ? 'API Key anonymized. This report only shows reproducible signals from this test and does not prove intentional overcharging or model authenticity.'
    : 'API Key 已脱敏。本报告只展示本次测试中的可复现信号，不证明服务商故意多扣费，也不证明模型真假。';
  const localBrowser = zh ? 'API Key stored locally' : 'API Key 本地使用';

  const html = `
    <div style="border-bottom:1px solid #e2e8f0;padding-bottom:16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div>
        <div style="font-size:18px;font-weight:700;color:#0f172a">AI API Doctor</div>
        <div style="font-size:13px;color:#64748b;margin-top:2px">${title}</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#64748b;line-height:1.8">
        <div>${labelApiKey}</div>
        <div>${labelLocalBrowser}</div>
        <div>${timestamp}</div>
      </div>
    </div>

    <div style="text-align:center;padding:20px 16px;border-radius:12px;background:${bg};margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${sc};margin-bottom:6px">${qf.label}</div>
      <div style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:4px">${title} ${titleSuffix}</div>
      <div style="font-size:13px;color:#64748b">${escHtml(qf.text)}</div>
    </div>

    <div style="font-size:14px;font-weight:600;color:#374151;padding:10px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:16px;text-align:center">
      ${escHtml(qf.text)}
    </div>

    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">
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
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Visible Output</div>
        <div style="font-size:12px;font-weight:600;color:#0f172a;margin-top:2px">${conn.visibleLength > 0 ? 'Yes' : 'No'}</div>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">usage Returned</div>
        <div style="font-size:12px;font-weight:600;color:#0f172a;margin-top:2px">${usageText}</div>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">completion_tokens</div>
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
    </div>

    ${result.errorAttribution ? `<div style="background:#eff6ff;border-left:3px solid #2563eb;border-radius:0 6px 6px 0;padding:10px 14px;font-size:13px;color:#1e40af;line-height:1.6;margin-bottom:12px">${escHtml(result.errorAttribution)}</div>` : ''}

    <div style="font-size:11px;color:#94a3b8;line-height:1.5;padding:10px 12px;background:#f9fafb;border-radius:8px;margin-bottom:8px">
      ${safeNote}
    </div>

    <div style="font-size:11px;color:#92400e;line-height:1.5;padding:8px 12px;background:#fff9f0;border:1px solid #fef3c7;border-radius:8px;margin-bottom:12px">
      ${untestedNote}
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <button onclick="Doctor.saveImage()" style="flex:1;padding:10px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        ${labelSaveImg}
      </button>
      <button onclick="Doctor.copyOneLine()" style="flex:1;padding:10px 16px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        ${labelCopy}
      </button>
    </div>

    <div style="text-align:center;font-size:11px;color:#94a3b8;margin-top:4px">${reportNodeLabel}：${reportId}</div>
  `;

  const node = document.getElementById('result-card');
  if (node) node.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════
   Report rendering — Full mode (with scores)
   ═══════════════════════════════════════════════════════ */
function renderFullReport(result, formData) {
  const lang = getDocLang();
  const zh = lang !== 'en';
  const scored = result._scored;
  const dims = scored.dims;
  const conn = result.connectivity || {};
  const overallScore = scored.overallScore;
  const apiScore = scored.score;
  const modelScore = scored.modelSanityScore;
  const coverage = scored.coverage;
  const confidence = scored.confidence;

  const L = {
    reportTitle:        zh ? 'AI API 体检报告' : 'AI API Diagnostic Report',
    apiKeyAnonymized:  zh ? 'API Key Anonymized' : 'API Key 已脱敏',
    localBrowser:       zh ? 'Local Browser Test' : '本地浏览器检测',
    overallScore:       zh ? 'Overall Score' : '综合分',
    apiScoreLabel:      zh ? 'API Health Score' : 'API 体检分',
    coverage:           zh ? 'Coverage' : '覆盖度',
    confidence:         zh ? 'Confidence' : '置信度',
    modelScoreLabel:   zh ? 'Model Score' : '模型表现分',
    basedOnTested:     zh ? 'Based on tested items' : '基于已测项目',
    confidenceHigh:    zh ? 'High' : '高',
    confidenceMid:     zh ? 'Medium' : '中',
    confidenceLow:     zh ? 'Low' : '低',
    testedItems:       zh ? 'Tested Items' : '已测项目',
    untestedItems:     zh ? 'Untested Items' : '未测项目',
    notEnabled:        zh ? 'Not enabled' : '未开启',
    mainFinding:       zh ? 'Main Finding' : '主要发现',
    reportId:          zh ? 'Report ID' : '报告 ID',
    saveImage:         zh ? 'Save Image' : '保存图片',
    copyMarkdown:      zh ? 'Copy Markdown' : '复制 Markdown',
    copyForProvider:   zh ? 'Copy for Provider' : '复制给站长',
    copyOneLine:       zh ? 'Copy Score Line' : '复制一行晒分',
    copyForum:         zh ? 'Copy Forum Reply' : '复制论坛回复',
    safetyNote:        zh ? 'API Key anonymized. This report only shows reproducible signals and does not prove intentional overcharging or model authenticity. Model score is for anomaly detection only, not an official ranking.' : 'API Key 已脱敏。本报告只展示本次测试中的可复现信号，不证明服务商故意多扣费，也不证明模型真假。模型表现分仅用于发现明显异常或降智风险，不代表官方模型排名。',
    heroSubOk:         zh ? 'All test items passed.' : '所有检测项均通过。',
    heroSubFail:       zh ? 'Anomalies detected — see details below.' : '检测中发现异常，请查看下方详情。',
    heroSubWarn:       zh ? 'Some items need attention — see details below.' : '部分检测项需要关注，请查看下方详情。',
    heroSubPartial:    zh ? 'Some items completed — see results below.' : '部分检测项已完成，结果请见下方。',
    heroSubBasic:      zh ? 'Model connectivity and basic response tested. Billing, cache, and model performance not checked.' : '已完成模型联通和基础响应检测，未运行扣费/缓存/模型表现检测。',
    heroTitleComplete:   zh ? 'Diagnosis Complete' : '体检完成',
    heroTitleRisk:       zh ? 'Risk Detected' : '发现风险',
    heroTitleReview:     zh ? 'Needs Review' : '需要复查',
    heroTitlePartial:    zh ? 'Partial Diagnosis Complete' : '部分体检完成',
    heroTitleBasic:      zh ? 'Basic Test Complete' : '基础检测完成',
    heroStatusOk:         zh ? 'Normal' : '正常',
    heroStatusDanger:    zh ? 'Anomaly Risk' : '异常风险',
    heroStatusWarn:      zh ? 'Needs Review' : '需复查',
    heroStatusComplete:   zh ? 'Complete' : '完成',
    heroStatusBlocked:    zh ? 'Blocked' : '受阻',
    heroTitleMap: {
      '体检完成': 'Diagnosis Complete',
      '发现风险': 'Risk Detected',
      '需要复查': 'Needs Review',
      '部分体检完成': 'Partial Diagnosis Complete',
      '基础检测完成': 'Basic Test Complete'
    },
    heroStatusLabelMap: {
      '正常': 'Normal', '异常风险': 'Anomaly Risk', '需复查': 'Needs Review',
      '完成': 'Complete', '受阻': 'Blocked'
    },
    connectivityLabel:   zh ? 'Model Connectivity' : '模型联通',
    usageLabel:           zh ? 'Usage Integrity' : 'usage 完整性',
    billingLabel:         zh ? 'Billing Integrity' : '扣费完整性',
    cacheLabel:           zh ? 'Cache Hit' : '缓存命中',
    priceLabel:           zh ? 'Price Audit' : '价格核对',
    modelSanityLabel:     zh ? 'Model Performance' : '模型表现',
  };

  const heroTitle = L.heroTitleMap[scored.heroTitle] ? L.heroTitleMap[scored.heroTitle] : scored.heroTitle;
  const heroStatusLabel = L.heroStatusLabelMap[scored.heroStatusLabel] ? L.heroStatusLabelMap[scored.heroStatusLabel] : scored.heroStatusLabel;
  let heroSub = scored.heroSub;
  if (heroSub === '检测中发现异常，请查看下方详情。') heroSub = L.heroSubFail;
  else if (heroSub === '部分检测项需要关注，请查看下方详情。') heroSub = L.heroSubWarn;
  else if (heroSub === '所有检测项均通过。') heroSub = L.heroSubOk;
  else if (heroSub === '部分检测项已完成，结果请见下方。') heroSub = L.heroSubPartial;
  else if (heroSub === '已完成模型联通和基础响应检测，未运行扣费/缓存/模型表现检测。') heroSub = L.heroSubBasic;

  const mainFinding = zh ? getMainFinding(result, dims) : getMainFindingEn(result, dims);
  const reportId = result.reportId;

  const stateColor = { pass: '#16a34a', warn: '#d97706', fail: '#dc2626', blocked: '#64748b', skipped: '#94a3b8' };
  const stateBg = { pass: '#dcfce7', warn: '#fef3c7', fail: '#fee2e2', blocked: '#f1f5f9', skipped: '#f1f5f9' };
  const stateText = zh ? { pass: 'Pass', warn: 'Needs Review', fail: 'Fail', blocked: 'Blocked', skipped: 'Not Tested' } : { pass: '通过', warn: '需复查', fail: '异常', blocked: '受阻', skipped: '未检测' };
  const stateDot = { pass: '#16a34a', warn: '#d97706', fail: '#dc2626', blocked: '#94a3b8', skipped: '#94a3b8' };

  function dimCard(item, muted) {
    const sc = stateColor[item.state] || '#94a3b8';
    const bg = muted ? '#f8fafc' : stateBg[item.state];
    const txt = muted ? '#94a3b8' : sc;
    const dot = stateDot[item.state];
    const label = muted ? item.untestedReason : stateText[item.state];
    return `<div style="background:${bg};border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:8px">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0"></span>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:600;color:${muted?'#94a3b8':'#374151'};text-transform:uppercase;letter-spacing:0.3px">${escHtml(item.label)}</div>
        <div style="font-size:13px;font-weight:700;color:${txt};margin-top:2px;display:flex;align-items:center;gap:6px">
          ${!muted && item.state !== 'skipped' ? `<span style="font-size:10px;font-weight:400;opacity:0.6">${label}</span>` : ''}
          ${muted ? `<span style="font-size:11px;font-weight:400">${escHtml(item.untestedReason)}</span>` : `<span style="font-size:11px;font-weight:400;opacity:0.7">${escHtml(item.detail)}</span>`}
        </div>
      </div>
    </div>`;
  }

  const testedDims = [];
  const untestedDims = [];

  const dimDefs = [
    { key: 'connectivity', label: L.connectivityLabel, weight: DIM_WEIGHTS.connectivity,
      getState: () => dims.connectivity?.state,
      getDetail: () => {
        if (!conn) return '—';
        if (conn.error === 'cors_or_network') return zh ? 'CORS Restriction' : 'CORS 限制';
        if (conn.error === 'timeout') return zh ? 'Timeout' : '超时';
        if (!conn.status) return zh ? 'No response' : '无响应';
        if (conn.status >= 200 && conn.status < 300) return conn.visibleLength > 0 ? (zh ? 'OK' : '正常') : (zh ? 'Empty reply' : '空回复');
        return 'HTTP ' + conn.status;
      }
    },
    { key: 'usage', label: L.usageLabel, weight: DIM_WEIGHTS.usage,
      getState: () => dims.usage?.state,
      getDetail: () => {
        const d = result.usageIntegrity;
        return zh ? { complete: 'Complete', incomplete: 'Incomplete', missing: 'Missing', skipped: '—' }[d] || '—' : { complete: '完整', incomplete: '不完整', missing: '缺失', skipped: '—' }[d] || '—';
      }
    },
    { key: 'billing', label: L.billingLabel, weight: DIM_WEIGHTS.billing,
      getState: () => dims.billing?.state,
      getDetail: () => {
        const v = result.billing?.verdict;
        return zh ? { failed_request_not_charged: 'Not charged', precharge_refunded: 'Refunded', failed_request_charged: 'Overcharged', empty_response_charged: 'Overcharged', raw_quota_unavailable: 'Cannot determine' }[v] || '—' : { failed_request_not_charged: '未扣费', precharge_refunded: '已返还', failed_request_charged: '扣费异常', empty_response_charged: '扣费异常', raw_quota_unavailable: '无法判断' }[v] || '—';
      }
    },
    { key: 'cache', label: L.cacheLabel, weight: DIM_WEIGHTS.cache,
      getState: () => dims.cache?.state,
      getDetail: () => {
        const s = result.cacheHit?.status;
        return zh ? { hit: 'Hit', no_hit: 'No hit', error: 'Test failed' }[s] || '—' : { hit: '命中', no_hit: '未命中', error: '检测失败' }[s] || '—';
      }
    },
    { key: 'price', label: L.priceLabel, weight: DIM_WEIGHTS.price,
      getState: () => dims.price?.state,
      getDetail: () => {
        const s = result.priceAudit?.status;
        return zh ? { normal: 'Normal', needs_review: 'Needs review', anomaly_risk: 'Anomaly', no_usage: 'No usage' }[s] || '—' : { normal: '正常', needs_review: '需复查', anomaly_risk: '异常', no_usage: '无 usage' }[s] || '—';
      }
    },
    { key: 'modelSanity', label: L.modelSanityLabel, weight: DIM_WEIGHTS.modelSanity,
      getState: () => dims.modelSanity?.state,
      getDetail: () => {
        if (!result.modelSanity) return '—';
        return (zh ? result.modelSanity.label : result.modelSanity.labelEn) + ' (' + result.modelSanity.overallScore + (zh ? ' pts)' : '分)');
      }
    }
  ];

  for (const def of dimDefs) {
    const state = def.getState();
    const detail = def.getDetail();
    const item = { key: def.key, label: def.label, state, detail, weight: def.weight };
    if (state === 'skipped') {
      untestedDims.push({ ...item, untestedReason: L.notEnabled });
    } else {
      testedDims.push(item);
    }
  }

  const sanityHtml = result.modelSanity ? `
    <div style="margin-bottom:20px">
      <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">${L.modelScoreLabel}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px">
        ${result.modelSanity.results.map(r => {
          const sc = r.score >= 70 ? '#16a34a' : r.score >= 50 ? '#d97706' : '#dc2626';
          return `<div style="background:#f1f5f9;border-radius:8px;padding:10px 8px;text-align:center">
            <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px">${zh ? r.name : r.nameEn}</div>
            <div style="font-size:22px;font-weight:800;color:${sc}">${r.score}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px">${r.explanation}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const scoreColor = overallScore !== null
    ? (overallScore >= 85 ? '#16a34a' : overallScore >= 60 ? '#d97706' : '#dc2626')
    : '#64748b';

  const heroBgMap = { ok: '#dcfce7', warn: '#fef3c7', danger: '#fee2e2', neutral: '#f1f5f9' };
  const heroColorMap = { ok: '#16a34a', warn: '#d97706', danger: '#dc2626', neutral: '#64748b' };
  const hBg = heroBgMap[scored.heroStatus] || '#f1f5f9';
  const hColor = heroColorMap[scored.heroStatus] || '#64748b';

  const confidenceText = confidence === 'high' ? L.confidenceHigh : confidence === 'medium' ? L.confidenceMid : L.confidenceLow;

  const html = `
    <div style="border-bottom:1px solid #e2e8f0;padding-bottom:20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div>
        <div style="font-size:18px;font-weight:700;color:#0f172a">AI API Doctor</div>
        <div style="font-size:13px;color:#64748b;margin-top:2px">${L.reportTitle}</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#64748b;line-height:1.8">
        <div>${L.apiKeyAnonymized}</div>
        <div>${L.localBrowser}</div>
        <div>${result.timestamp}</div>
      </div>
    </div>

    <div style="text-align:center;padding:20px 16px;border-radius:12px;background:${hBg};margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${hColor};margin-bottom:6px">${escHtml(heroStatusLabel)}</div>
      <div style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:4px">${escHtml(heroTitle)}</div>
      ${heroSub ? `<div style="font-size:13px;color:#64748b;margin-bottom:16px;line-height:1.5">${escHtml(heroSub)}</div>` : '<div style="margin-bottom:12px"></div>'}

      <div style="display:flex;gap:10px;justify-content:center;margin-bottom:12px;flex-wrap:wrap">
        ${overallScore !== null ? `<div style="flex:1;max-width:180px;background:#fff;border-radius:10px;padding:14px">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">${L.overallScore}</div>
          <div style="font-size:40px;font-weight:800;color:${scoreColor};line-height:1">${overallScore}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">Overall</div>
        </div>` : ''}
        ${apiScore !== null ? `<div style="flex:1;max-width:180px;background:#fff;border-radius:10px;padding:14px">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">${L.apiScoreLabel}</div>
          <div style="font-size:32px;font-weight:800;color:${apiScore >= 85 ? '#16a34a' : apiScore >= 60 ? '#d97706' : '#dc2626'};line-height:1">${apiScore}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">${coverage < 100 ? L.basedOnTested : 'API Health'}</div>
        </div>` : ''}
        <div style="flex:1;max-width:180px;background:#fff;border-radius:10px;padding:14px">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">${L.coverage}</div>
          <div style="font-size:32px;font-weight:800;color:#0f172a;line-height:1">${coverage}%</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">Coverage</div>
        </div>
        <div style="flex:1;max-width:180px;background:#fff;border-radius:10px;padding:14px">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">${L.confidence}</div>
          <div style="font-size:32px;font-weight:800;color:#0f172a;line-height:1">${confidenceText}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">Confidence</div>
        </div>
        ${modelScore !== null ? `<div style="flex:1;max-width:180px;background:#fff;border-radius:10px;padding:14px">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">${L.modelScoreLabel}</div>
          <div style="font-size:32px;font-weight:800;color:${modelScore >= 70 ? '#16a34a' : modelScore >= 50 ? '#d97706' : '#dc2626'};line-height:1">${modelScore}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">${result.modelSanity?.label || 'Model Sanity'}</div>
        </div>` : ''}
      </div>

      <div style="font-size:13px;font-weight:600;color:#374151;padding:8px 14px;background:#fff;border-radius:8px;display:inline-block">
        ${escHtml(mainFinding)}
      </div>
      <div style="font-size:11px;color:#64748b;margin-top:8px">${L.reportId}: ${reportId}</div>
    </div>

    ${testedDims.length > 0 ? `
    <div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">${L.testedItems}</div>
      <div style="display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        ${testedDims.map(d => dimCard(d, false)).join('')}
      </div>
    </div>` : ''}

    ${untestedDims.length > 0 ? `
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">${L.untestedItems}</div>
      <div style="display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        ${untestedDims.map(d => dimCard(d, true)).join('')}
      </div>
    </div>` : ''}

    ${sanityHtml}

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
        <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">completion_tokens</div>
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
    </div>

    ${result.errorAttribution ? `<div style="background:#eff6ff;border-left:3px solid #2563eb;border-radius:0 6px 6px 0;padding:10px 14px;font-size:13px;color:#1e40af;line-height:1.6;margin-bottom:12px">${escHtml(result.errorAttribution)}</div>` : ''}

    <div style="font-size:11px;color:#94a3b8;line-height:1.5;padding:10px 12px;background:#f9fafb;border-radius:8px;margin-bottom:16px">
      ${L.safetyNote}
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <button onclick="Doctor.saveImage()" style="flex:1;padding:10px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        ${L.saveImage}
      </button>
      <button onclick="Doctor.copyMarkdown()" style="flex:1;padding:10px 16px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        ${L.copyMarkdown}
      </button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <button onclick="Doctor.copyForProvider()" style="flex:1;padding:10px 16px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        ${L.copyForProvider}
      </button>
      <button onclick="Doctor.copyOneLine()" style="flex:1;padding:10px 16px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        ${L.copyOneLine}
      </button>
      <button onclick="Doctor.copyForum()" style="flex:1;padding:10px 16px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        ${L.copyForum}
      </button>
    </div>
  `;

  const node = document.getElementById('result-card');
  if (node) node.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════
   Markdown copy
   ═══════════════════════════════════════════════════════ */
function buildMarkdownReport(result, formData) {
  const lang = getDocLang();
  const zh = lang !== 'en';
  const scored = result._scored;
  const dims = scored ? scored.dims : {};
  const conn = result.connectivity || {};
  const mainFinding = scored ? (zh ? getMainFinding(result, dims) : getMainFindingEn(result, dims)) : getQuickFinding(result, lang).text;
  const overallScore = scored ? scored.overallScore : null;
  const apiScore = scored ? scored.score : null;
  const modelScore = scored ? scored.modelSanityScore : null;
  const coverage = scored ? scored.coverage : 0;
  const confidence = scored ? scored.confidence : 'low';

  let sanityLines = '';
  if (modelScore !== null && result.modelSanity) {
    sanityLines = result.modelSanity.results.map(r =>
      `- ${zh ? r.name : r.nameEn}: ${r.score}/100`
    ).join('\n');
  }

  const dimLabels = {
    connectivity: zh ? 'Model Connectivity' : '模型联通',
    usage: zh ? 'Usage Integrity' : 'usage 完整性',
    billing: zh ? 'Billing Integrity' : '扣费完整性',
    cache: zh ? 'Cache Hit' : '缓存命中',
    price: zh ? 'Price Audit' : '价格核对',
  };

  const stateLabels = {
    pass: zh ? 'Pass' : '通过',
    warn: zh ? 'Needs Review' : '需复查',
    fail: zh ? 'Fail' : '异常',
    blocked: zh ? 'Blocked' : '受阻',
    skipped: zh ? 'Skipped' : '未检测',
  };

  const testedDimLines = Object.entries(dimLabels).map(([key, label]) => {
    const d = dims[key];
    if (!d || d.state === 'skipped') return null;
    return `| ${label} | ${stateLabels[d.state] || '—'} |`;
  }).filter(Boolean).join('\n');

  const lines = [
    `## ${zh ? 'AI API Diagnostic Report' : 'AI API 体检报告'}`,
    '',
    `**${zh ? 'Overall Score' : '综合分'}:** ${overallScore !== null ? overallScore + '/100' : '—'} | **${zh ? 'API Health Score' : 'API 体检分'}:** ${apiScore !== null ? apiScore + '/100' : '—'} | **${zh ? 'Model Score' : '模型表现分'}:** ${modelScore !== null ? modelScore + '/100' : zh ? 'Not tested' : '未检测'}`,
    `**${zh ? 'Coverage' : '覆盖度'}:** ${coverage}% | **${zh ? 'Confidence' : '置信度'}:** ${zh ? { high: 'High', medium: 'Medium', low: 'Low' }[confidence] : { high: '高', medium: '中', low: '低' }[confidence]} | **${zh ? 'Main Finding' : '主要发现'}:** ${mainFinding}`,
    `**${zh ? 'Report ID' : '报告 ID'}:** ${result.reportId} | **Report Fingerprint:** ${result.reportFingerprint || '—'}`,
    '',
    `### ${zh ? 'Test Dimensions' : '检测维度'}`,
    `| ${zh ? 'Dimension' : '维度'} | ${zh ? 'Result' : '结果'} |`,
    `|------|------|`,
    testedDimLines,
    '',
    modelScore !== null && result.modelSanity ? `### ${zh ? 'Model Performance' : '模型表现分'}\n${sanityLines}` : '',
    '',
    `### ${zh ? 'Technical Summary' : '技术摘要'}`,
    `| ${zh ? 'Item' : '项目'} | ${zh ? 'Value' : '值'} |`,
    `|------|----|`,
    `| Base URL | ${formData.baseUrl || '—'} |`,
    `| Model | ${formData.model || '—'} |`,
    `| Interface | ${formData.interfaceType || '—'} |`,
    `| HTTP | ${conn.status || '—'} |`,
    `| Latency | ${conn.latency ? conn.latency + 'ms' : '—'} |`,
    `| completion_tokens | ${conn.completionTokens ?? '—'} |`,
    `| total_tokens | ${conn.totalTokens ?? '—'} |`,
    `| cached_tokens | ${conn.cachedTokens ?? '—'} |`,
    '',
    `### ${zh ? 'Safety Notice' : '安全说明'}`,
    zh ? 'This report does not contain API Key and only shows reproducible signals from this test. It does not prove intentional overcharging or model authenticity. Model score is for anomaly detection only, not an official ranking.' : '本报告不包含 API Key，只展示本次测试中的可复现信号，不证明服务商故意多扣费。模型表现分仅用于发现明显异常或降智风险，不代表官方模型排名。',
    '',
    `${zh ? 'Generated by AI API Doctor' : '由 AI API Doctor 生成'} · ${result.timestamp}`
  ].filter(Boolean).join('\n');

  return lines;
}

/* ═══════════════════════════════════════════════════════
   Copy-for-provider template
   ═══════════════════════════════════════════════════════ */
function buildProviderReport(result, formData) {
  const lang = getDocLang();
  const zh = lang !== 'en';
  const scored = result._scored;
  const dims = scored ? scored.dims : {};
  const conn = result.connectivity || {};
  const mainFinding = scored ? (zh ? getMainFinding(result, dims) : getMainFindingEn(result, dims)) : getQuickFinding(result, lang).text;
  const overallScore = scored ? scored.overallScore : null;
  const apiScore = scored ? scored.score : null;
  const modelScore = scored ? scored.modelSanityScore : null;
  const coverage = scored ? scored.coverage : 0;

  const stateLabels = {
    pass: zh ? 'Pass' : '通过',
    warn: zh ? 'Needs Review' : '需复查',
    fail: zh ? 'Fail' : '异常',
    blocked: zh ? 'Blocked' : '受阻',
  };

  const dimLabels = {
    connectivity: zh ? 'Model Connectivity' : '模型联通',
    usage: zh ? 'Usage Integrity' : 'usage 完整性',
    billing: zh ? 'Billing Integrity' : '扣费完整性',
    cache: zh ? 'Cache Hit' : '缓存命中',
    price: zh ? 'Price Audit' : '价格核对',
    modelSanity: zh ? 'Model Performance' : '模型表现',
  };

  const greeting = zh ? 'Hello, I ran a local diagnostic with AI API Doctor. Here are the results:' : '您好，我用 AI API Doctor 做了一次本地诊断，结果如下：';
  const keyEvidence = zh ? 'Key Evidence:' : '关键证据：';
  const explanation = zh ? 'This report only shows reproducible signals and does not prove intentional overcharging or model authenticity.' : '本报告只展示本次测试中的可复现信号，不证明服务商故意多扣费，也不证明模型真假。';
  const generatedBy = zh ? '— Generated by AI API Doctor · aiapidoctor.com' : '— 由 AI API Doctor 生成 · aiapidoctor.com';

  const reportLines = [
    greeting,
    '',
    overallScore !== null
      ? `${zh ? 'Overall Score' : '综合分'}：${overallScore}/100（${zh ? 'Coverage' : '覆盖度'} ${coverage}%）`
      : `${zh ? 'Basic Connectivity Check' : '基础联通检测'}：${mainFinding}`,
    `${zh ? 'Main Finding' : '主要发现'}：${mainFinding}`,
    `${zh ? 'Report ID' : '报告 ID'}：${result.reportId}`,
  ];

  if (scored) {
    reportLines.push(
      '',
      zh ? 'Test Results:' : '检测结果：',
      dims.connectivity?.state !== 'skipped' ? `- ${dimLabels.connectivity}：${stateLabels[dims.connectivity?.state] || '—'}（HTTP ${conn.status || '—'}${conn.latency ? ', ' + conn.latency + 'ms' : ''}）` : '',
      dims.usage?.state !== 'skipped' ? `- ${dimLabels.usage}：${stateLabels[dims.usage?.state] || '—'}` : '',
      dims.billing?.state !== 'skipped' ? `- ${dimLabels.billing}：${result.billing?.verdict || '—'}` : '',
      dims.cache?.state !== 'skipped' ? `- ${dimLabels.cache}：${result.cacheHit?.status || '—'}` : '',
      dims.price?.state !== 'skipped' ? `- ${dimLabels.price}：${result.priceAudit?.status || '—'}` : '',
      modelScore !== null ? `- ${dimLabels.modelSanity}：${modelScore}/100（${result.modelSanity?.label || result.modelSanity?.labelEn || '—'}）` : '',
    );
  }

  reportLines.push(
    '',
    keyEvidence,
    `- Base URL: ${formData.baseUrl || '—'}`,
    `- ${zh ? 'Model' : '模型'}: ${formData.model || '—'}`,
    `- ${zh ? 'Interface' : '接口'}: ${formData.interfaceType || '—'}`,
    `- HTTP ${zh ? 'Status' : '状态'}: ${conn.status || '—'}`,
    `- completion_tokens: ${conn.completionTokens ?? '—'}`,
    `- total_tokens: ${conn.totalTokens ?? '—'}`,
    `- cached_tokens: ${conn.cachedTokens ?? '—'}`,
  );

  if (result.priceAudit?.expectedCost !== null) {
    reportLines.push(`- ${zh ? 'Theoretical Cost' : '理论成本'}: $${result.priceAudit.expectedCost.toFixed(6)}`);
  }
  if (result.priceAudit?.actualCost !== null) {
    reportLines.push(`- ${zh ? 'Actual Cost' : '实际扣费'}: $${result.priceAudit.actualCost.toFixed(6)}`);
  }

  reportLines.push(
    '',
    explanation,
    '',
    generatedBy
  );

  return reportLines.filter(Boolean).join('\n');
}

/* ═══════════════════════════════════════════════════════
   Save image — dedicated export clone
   ═══════════════════════════════════════════════════════ */
async function saveDiagnosticImage() {
  const sourceNode = document.getElementById('result-card');
  if (!sourceNode) { showToast('Report node not found'); return; }

  try {
    await new Promise(requestAnimationFrame);
    await document.fonts.ready.catch(() => undefined);

    if (typeof htmlToImage !== 'undefined') {
      const clone = sourceNode.cloneNode(true);
      clone.style.cssText = [
        'position:fixed',
        'top:-9999px',
        'left:-9999px',
        'width:1080px',
        'background:#f8fafc',
        'padding:48px',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
        'box-sizing:border-box',
        'border:none',
        'border-radius:0'
      ].join(';');
      document.body.appendChild(clone);

      const dataUrl = await htmlToImage.toPng(clone, {
        pixelRatio: 1,
        cacheBust: true,
        backgroundColor: '#f8fafc',
        width: 1080
      });

      document.body.removeChild(clone);
      downloadDataUrl(dataUrl, `aiapidoctor-report-${Date.now()}.png`);
      showToast('Report image saved');
    } else {
      showToast('Image generation failed, please use browser screenshot or copy report text.');
    }
  } catch (err) {
    showToast('Image generation failed, please use browser screenshot.');
  }
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/* ═══════════════════════════════════════════════════════
   Model List Reader — inline results below input
   ═══════════════════════════════════════════════════════ */
async function tryReadModelList(baseUrl, apiKey) {
  const normalized = (baseUrl || '').replace(/\/$/, '');
  if (!normalized) return { error: 'no_url' };

  const endpoint = normalized + '/models';
  try {
    const resp = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (resp.status === 401 || resp.status === 403) {
      return { error: 'auth', status: resp.status };
    }
    if (resp.status === 404) {
      return { error: 'not_found' };
    }
    if (!resp.ok) {
      return { error: 'http_error', status: resp.status };
    }

    const data = await resp.json();
    let models = [];
    if (Array.isArray(data.data)) {
      models = data.data.map(m => m.id || '').filter(Boolean);
    } else if (Array.isArray(data.models)) {
      models = data.models.map(m => typeof m === 'string' ? m : m.id || m.name || '').filter(Boolean);
    } else if (Array.isArray(data)) {
      models = data.map(m => typeof m === 'string' ? m : m.id || m.name || '').filter(Boolean);
    }

    if (models.length === 0) {
      return { error: 'empty_list' };
    }

    return { models, total: models.length };
  } catch (err) {
    return { error: 'cors', message: err.message };
  }
}

function showInlineModelResults(result) {
  const container = document.getElementById('model-fetch-results');
  if (!container) return;

  const lang = getDocLang();
  const zh = lang !== 'en';

  if (result.error) {
    let msg = '';
    if (result.error === 'cors') {
      msg = zh
        ? '网页版可能受浏览器跨域限制，无法读取模型列表。这不代表 API 不可用，请手动填写模型 ID。'
        : 'Browser CORS restriction may prevent reading the model list. This does not mean the API is unavailable. Please fill in the Model ID manually.';
    } else if (result.error === 'auth') {
      const status = result.status || '';
      msg = zh
        ? `API Key 无效或权限不足（${status || '401/403'}），无法读取模型列表。`
        : `API Key invalid or insufficient permissions (${status || '401/403'}). Cannot read model list.`;
    } else if (result.error === 'not_found') {
      msg = zh
        ? '当前服务商可能不支持 /v1/models，请手动填写模型 ID。'
        : 'The current provider may not support /v1/models endpoint. Please fill in the Model ID manually.';
    } else if (result.error === 'no_url') {
      msg = zh ? '请先填写 Base URL。' : 'Please fill in the Base URL first.';
    } else if (result.error === 'empty_list') {
      msg = zh ? '模型列表为空，请手动填写模型 ID。' : 'Model list is empty. Please fill in the Model ID manually.';
    } else {
      msg = zh
        ? '读取失败，请手动填写模型 ID。这不代表 API 本身不可用。'
        : 'Failed to read model list. Please fill in the Model ID manually. This does not mean the API is unavailable.';
    }
    container.innerHTML = `<div style="margin-top:8px;padding:10px 12px;background:#fef3c7;border-radius:6px;font-size:12px;color:#92400e;line-height:1.5">${escHtml(msg)}</div>`;
    container.style.display = 'block';
    return;
  }

  const { models, total } = result;
  const displayModels = models.slice(0, 20);
  const hasMore = models.length > 20;

  const headerText = zh ? `Found ${total} models, click to fill:` : `读取到 ${total} 个模型，点击填入：`;
  const searchPlaceholder = zh ? 'Search...' : '搜索...';

  let html = `<div style="margin-top:8px;padding:12px;background:#f1f5f9;border-radius:8px;font-size:12px;color:#374151;line-height:1.5">
    <div style="font-weight:600;margin-bottom:8px">${headerText}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">`;

  displayModels.forEach(m => {
    html += `<button type="button" onclick="Doctor.selectModel('${escHtml(m).replace(/'/g, '&#39;')}')" style="padding:4px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:20px;font-size:12px;font-family:monospace;color:#0f172a;cursor:pointer;transition:all 0.1s">${escHtml(m)}</button>`;
  });

  html += `</div>`;

  if (hasMore) {
    html += `<div style="margin-top:8px"><input type="text" id="model-filter-input" placeholder="${searchPlaceholder}" oninput="Doctor.filterModels(this.value)" style="padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;width:120px" /></div>
    <div id="model-filter-results" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px"></div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
  container.style.display = 'block';
}

function hideInlineModelResults() {
  const container = document.getElementById('model-fetch-results');
  if (container) { container.innerHTML = ''; container.style.display = 'none'; }
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
  _mode: 'quick',
  _fetchedModels: [],

  init() {
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
    val = val.replace(/\/v1\/v1$/, '/v1');
    const hint = document.getElementById('base-url-hint');
    if (hint) {
      hint.style.display = (val && !val.match(/\/v1$/)) ? 'block' : 'none';
    }
    el.value = val;
  },

  setInterface(type) {
    document.querySelectorAll('.interface-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    const el = document.getElementById('doctor-interface');
    if (el) el.value = type;
  },

  setTier(tier) {
    document.querySelectorAll('.tier-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tier === tier);
    });
    const el = document.getElementById('doctor-tier');
    if (el) el.value = tier;
  },

  setMode(mode) {
    this._mode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const cfg = DETECTION_MODES[mode];
    const cacheCb = document.getElementById('cache-test-toggle');
    const priceCb = document.getElementById('price-test-toggle');
    const sanityCb = document.getElementById('sanity-test-toggle');

    if (cacheCb) cacheCb.checked = cfg.cacheTest;
    if (priceCb) priceCb.checked = cfg.priceAudit;
    if (sanityCb) sanityCb.checked = cfg.modelSanity;

    const lang = getDocLang();
    const zh = lang !== 'en';
    const isQuick = mode === 'quick';
    const btnText = isQuick
      ? (zh ? '开始快速检测' : 'Start Quick Check')
      : (zh ? '开始完整体检' : 'Start Full Check');

    const runBtn = document.getElementById('doctor-run-btn');
    if (runBtn) {
      runBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> ${btnText}`;
    }

    if (mode === 'full') {
      const panel = document.getElementById('advanced-panel');
      const toggle = document.getElementById('advanced-toggle');
      if (panel && toggle) {
        panel.classList.add('open');
        toggle.classList.add('open');
      }
    }

    if (typeof updateCostEstimate === 'function') updateCostEstimate();
  },

  toggleAdvanced() {
    const panel = document.getElementById('advanced-panel');
    const toggle = document.getElementById('advanced-toggle');
    if (!panel || !toggle) return;
    const open = panel.classList.toggle('open');
    toggle.classList.toggle('open', open);
  },

  toggleCache(checkbox) {
    if (typeof updateCostEstimate === 'function') updateCostEstimate();
  },

  togglePrice(checkbox) {
    if (typeof updateCostEstimate === 'function') updateCostEstimate();
  },

  toggleSanity(checkbox) {
    if (typeof updateCostEstimate === 'function') updateCostEstimate();
  },

  async readModelList() {
    const baseUrl = (document.getElementById('doctor-base-url')?.value || '').trim();
    const apiKey = (document.getElementById('doctor-api-key')?.value || '').trim();

    const lang = getDocLang();
    const zh = lang !== 'en';

    if (!baseUrl) { showToast(zh ? 'Please fill in Base URL first' : '请先填写 Base URL'); return; }
    if (!apiKey) { showToast(zh ? 'Please fill in API Key first' : '请先填写 API Key'); return; }

    const btn = document.getElementById('read-models-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = zh ? 'Reading...' : '读取中...';
    }

    try {
      const result = await tryReadModelList(baseUrl, apiKey);
      this._fetchedModels = result.models || [];
      showInlineModelResults(result);
    } catch (err) {
      showInlineModelResults({ error: 'cors', message: err.message });
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = zh ? 'Auto Read Models' : '自动读取模型';
    }
  },

  selectModel(model) {
    const el = document.getElementById('doctor-model');
    if (el) el.value = model;
    hideInlineModelResults();
  },

  filterModels(query) {
    const q = (query || '').toLowerCase();
    const filtered = this._fetchedModels.filter(m => m.toLowerCase().includes(q));
    const container = document.getElementById('model-filter-results');
    if (!container) return;
    container.innerHTML = filtered.slice(0, 20).map(m =>
      `<button type="button" onclick="Doctor.selectModel('${escHtml(m).replace(/'/g, '&#39;')}')" style="padding:4px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:20px;font-size:12px;font-family:monospace;color:#0f172a;cursor:pointer">${escHtml(m)}</button>`
    ).join('');
  },

  async run() {
    const baseUrl = (document.getElementById('doctor-base-url')?.value || '').trim();
    const apiKey = (document.getElementById('doctor-api-key')?.value || '').trim();
    const model = (document.getElementById('doctor-model')?.value || '').trim();
    const interfaceType = (document.getElementById('doctor-interface')?.value || 'OpenAI Chat');
    const providerName = (document.getElementById('doctor-provider')?.value || '').trim()
      || (baseUrl ? new URL(baseUrl.startsWith('http') ? baseUrl : 'https://' + baseUrl).hostname : 'Unknown');

    const lang = getDocLang();
    const zh = lang !== 'en';

    if (!baseUrl) { showToast(zh ? 'Please fill in Base URL' : '请填写 Base URL'); return; }
    if (!model) { showToast(zh ? 'Please fill in Model ID' : '请填写 Model ID'); return; }

    saveConfigToStorage({ baseUrl, providerName, model, interfaceType });

    if (this._controller) this._controller.abort();
    this._controller = new AbortController();

    const isQuick = this._mode === 'quick';
    const btnRunningLabel = zh
      ? (isQuick ? 'Running Quick Check...' : 'Running Full Check...')
      : '检测中...';

    const btn = document.getElementById('doctor-run-btn');
    const clearBtn = document.getElementById('doctor-clear-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="status-dot status-dot--running"></span>${btnRunningLabel}`;
    }
    if (clearBtn) clearBtn.disabled = true;

    this.showProgress('running');

    const priceData = {
      inputPrice: document.getElementById('price-input')?.value,
      outputPrice: document.getElementById('price-output')?.value,
      cachedReadPrice: document.getElementById('price-cached-read')?.value,
      cachedWritePrice: document.getElementById('price-cached-write')?.value,
      actualCost: document.getElementById('price-actual')?.value
    };

    this._formData = { baseUrl, apiKey, model, interfaceType, providerName };

    try {
      const timeout = setTimeout(() => {
        this._controller.abort();
      }, TOTAL_TIMEOUT);

      const isFull = this._mode === 'full';
      const runCache = isFull && document.getElementById('cache-test-toggle')?.checked;
      const runPrice = isFull && document.getElementById('price-test-toggle')?.checked;
      const runSanity = isFull && document.getElementById('sanity-test-toggle')?.checked;

      this._result = await runDiagnosis({
        baseUrl, apiKey, model, interfaceType,
        signal: this._controller.signal,
        runCacheTest: runCache,
        runPriceTest: runPrice,
        priceData: runPrice ? priceData : null,
        runSanityTest: runSanity,
        mode: this._mode
      });

      clearTimeout(timeout);
    } catch (err) {
      if (err.name === 'AbortError') {
        showToast(zh ? 'Diagnosis timed out (90s). Please retry or use Chrome extension.' : '检测超时（90秒），请重试或使用 Chrome 插件');
      }
    }

    const btnLabelReset = isQuick
      ? (zh ? '开始快速检测' : 'Start Quick Check')
      : (zh ? '开始完整体检' : 'Start Full Check');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> ${btnLabelReset}`;
    }
    if (clearBtn) clearBtn.disabled = false;

    if (this._result) {
      this.showProgress('done');
      if (this._mode === 'quick') {
        renderQuickReport(this._result, this._formData);
      } else {
        renderFullReport(this._result, this._formData);
      }
      document.getElementById('result-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  showProgress(state) {
    const lang = getDocLang();
    const zh = lang !== 'en';
    const mode = this._mode;

    const steps = [
      zh ? 'Model Connectivity Check' : '模型联通检测',
      zh ? 'Usage Integrity' : 'usage 完整性',
      mode === 'full' && document.getElementById('cache-test-toggle')?.checked ? (zh ? 'Cache Hit Test' : '缓存命中检测') : null,
      mode === 'full' && document.getElementById('price-test-toggle')?.checked ? (zh ? 'Price Audit' : '价格核对') : null,
      mode === 'full' && document.getElementById('sanity-test-toggle')?.checked ? (zh ? 'Model Performance Test (5 dims)' : '模型表现检测（5项）') : null,
      zh ? 'Calculating Score' : '计算体检分'
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
    const lang = getDocLang();
    const zh = lang !== 'en';

    ['doctor-base-url','doctor-api-key','doctor-model','doctor-provider'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('doctor-interface').value = 'OpenAI Chat';
    this.setInterface('OpenAI Chat');
    this._mode = 'quick';
    this.setMode('quick');
    hideInlineModelResults();
    if (typeof updateCostEstimate === 'function') updateCostEstimate();
    document.getElementById('result-card').innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:#94a3b8;font-size:14px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius-lg)">
        ${zh ? 'Fill in the information and click the diagnosis button to view results.' : '填写信息后点击检测按钮，即可查看诊断结果。'}
      </div>`;
    this._result = null;
    this._formData = null;
    if (this._controller) this._controller.abort();
    showToast(zh ? 'Cleared' : '已清空');
  },

  async saveImage() {
    await saveDiagnosticImage();
  },

  copyMarkdown() {
    if (!this._result) { showToast(getDocLang() !== 'en' ? 'Please run diagnosis first' : '请先进行检测'); return; }
    const md = buildMarkdownReport(this._result, this._formData);
    copyToClipboard(md, getDocLang() !== 'en' ? 'Markdown copied' : 'Markdown 已复制');
  },

  copyForProvider() {
    if (!this._result) { showToast(getDocLang() !== 'en' ? 'Please run diagnosis first' : '请先进行检测'); return; }
    const text = buildProviderReport(this._result, this._formData);
    copyToClipboard(text, getDocLang() !== 'en' ? 'Report copied, can send to provider' : '报告文本已复制，可发给站长');
  },

  copyOneLine() {
    if (!this._result) { showToast(getDocLang() !== 'en' ? 'Please run diagnosis first' : '请先进行检测'); return; }
    const result = this._result;
    const lang = getDocLang();
    const zh = lang !== 'en';

    if (result.mode === 'quick') {
      const qf = getQuickFinding(result, lang);
      const text = zh
        ? `My AI API Quick Check: ${qf.label} | ${qf.text} | Report ID: ${result.reportId}\nhttps://aiapidoctor.com/`
        : `我的 AI API 快速检测：${qf.label}｜${qf.text}｜报告 ID：${result.reportId}\nhttps://aiapidoctor.com/`;
      copyToClipboard(text, zh ? 'Result copied' : '结果已复制');
    } else {
      const scored = result._scored;
      const dims = scored.dims;
      const coverage = scored.coverage;
      const mainFinding = zh ? getMainFinding(result, dims) : getMainFindingEn(result, dims);
      const overallScore = scored.overallScore;
      const text = zh
        ? `My AI API Doctor Score: ${overallScore !== null ? overallScore : '—'}/100 | Coverage: ${coverage}% | ${mainFinding} | Report ID: ${result.reportId}\nhttps://aiapidoctor.com/`
        : `我的 AI API 体检分：${overallScore !== null ? overallScore : '—'}/100｜覆盖度 ${coverage}%｜${mainFinding}｜报告 ID：${result.reportId}\nhttps://aiapidoctor.com/`;
      copyToClipboard(text, zh ? 'Score line copied' : '一行晒分已复制');
    }
  },

  copyForum() {
    if (!this._result) { showToast(getDocLang() !== 'en' ? 'Please run diagnosis first' : '请先进行检测'); return; }
    const result = this._result;
    const lang = getDocLang();
    const zh = lang !== 'en';

    if (result.mode === 'quick') {
      const qf = getQuickFinding(result, lang);
      const text = [
        zh ? 'I tested the AI API:' : '我测了一下 AI API：',
        `${zh ? 'Quick Check' : '快速检测'}：${qf.label}（${qf.text}）`,
        `${zh ? 'Report ID' : '报告 ID'}：${result.reportId}`,
        `https://aiapidoctor.com/`
      ].join('\n');
      copyToClipboard(text, zh ? 'Forum reply copied' : '论坛回复已复制');
    } else {
      const scored = result._scored;
      const dims = scored.dims;
      const coverage = scored.coverage;
      const mainFinding = zh ? getMainFinding(result, dims) : getMainFindingEn(result, dims);
      const overallScore = scored.overallScore;
      const text = [
        zh ? 'I tested the AI API:' : '我测了一下 AI API：',
        `${zh ? 'Health Score' : '体检分'}：${overallScore !== null ? overallScore + '/100' : '—'}（${zh ? 'Coverage' : '覆盖度'} ${coverage}%）`,
        `${zh ? 'Main Finding' : '主要发现'}：${mainFinding}`,
        `${zh ? 'Report ID' : '报告 ID'}：${result.reportId}`,
        `https://aiapidoctor.com/`
      ].join('\n');
      copyToClipboard(text, zh ? 'Forum reply copied' : '论坛回复已复制');
    }
  }
};
