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
    label: '快速验货',
    labelEn: 'Quick Check',
    desc: '1 次请求，测空跑、usage 消失和基础联通，生成中转站验货分。',
    descEn: '1 request — detects empty runs, missing usage, and basic connectivity. Generates a relay API scorecard.',
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
    label: '完整验货',
    labelEn: 'Full Check',
    desc: '额外测扣费、缓存、usage 完整性和模型缩水风险，生成完整中转站验货分。',
    descEn: 'Also checks billing, cache, usage integrity, and model shrinkage risk. Generates a complete relay API scorecard.',
    requests: '约 3–6 次请求，可能产生少量成本',
    requestsEn: '~3-6 requests, may consume a small amount of credits',
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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  dims.billing.state = result.billing?.state ?? 'skipped';
  const bv = result.billing?.verdict;
  if (bv === 'failed_request_not_charged' || bv === 'precharge_refunded') {
    dims.billing.state = 'pass'; dims.billing.score = 100;
  } else if (bv === 'failed_request_charged' || bv === 'empty_response_charged') {
    dims.billing.state = 'fail'; dims.billing.score = 0;
  } else if (bv === 'raw_quota_unavailable' || !bv) {
    dims.billing.state = 'skipped';
  } else {
    dims.billing.state = 'warn'; dims.billing.score = 50;
  }

  if (result.connectivity) {
    const s = result.connectivity.status;
    const vos = result.connectivity.visibleOutputStatus || 'absent';
    if (result.connectivity.error === 'cors_or_network') {
      dims.connectivity.state = 'blocked';
      dims.connectivity.score = 20;
    } else if (s >= 200 && s < 300 && vos === 'present') {
      dims.connectivity.state = 'pass'; dims.connectivity.score = 100;
    } else if (s >= 200 && (vos === 'absent' || vos === 'parser_unknown')) {
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

  let heroTitle = '验货完成';
  let heroStatus = 'ok';
  let heroSub = '';
  let heroStatusLabel = '通过验货';

  if (coverage < 40) {
    heroTitle = '基础检测完成';
    heroStatus = 'ok';
    heroStatusLabel = '完成';
    heroSub = '已完成基础验货，扣费/缓存/模型表现未检测。';
  } else {
    const hasFail = Object.values(dims).some(d => d.state === 'fail');
    const hasWarn = Object.values(dims).some(d => d.state === 'warn');
    if (hasFail) {
      heroTitle = '发现风险';
      heroStatus = 'danger';
      heroStatusLabel = '疑似异常';
      heroSub = '检测中发现疑似异常，请查看下方详情。';
    } else if (hasWarn) {
      heroTitle = '需要复查';
      heroStatus = 'warn';
      heroStatusLabel = '有坑';
      heroSub = '部分检测项有坑，请查看下方详情。';
    } else if (coverage >= 70) {
      heroTitle = '验货完成';
      heroStatus = 'ok';
      heroStatusLabel = '通过验货';
      heroSub = '所有检测项均通过验货。';
    } else {
      heroTitle = '部分验货完成';
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
  if (dims.connectivity?.state === 'blocked') return '模型联通受阻（浏览器限制）';
  const onlyConnPassed = dims.connectivity?.state === 'pass'
    && dims.usage?.state === 'skipped'
    && dims.billing?.state === 'skipped'
    && dims.cache?.state === 'skipped'
    && dims.price?.state === 'skipped'
    && dims.modelSanity?.state === 'skipped';
  if (onlyConnPassed) return '基础联通正常';
  if (dims.usage?.state === 'fail') return 'usage 消失';
  if (dims.usage?.state === 'warn') return 'usage 返回有坑';
  if (dims.billing?.state === 'fail') return '发现疑似扣费异常';
  if (dims.cache?.state === 'pass') return '缓存命中正常';
  if (dims.modelSanity?.state === 'fail') return '发现模型缩水风险';
  if (dims.modelSanity?.state === 'warn') return '模型表现有坑';
  if (dims.price?.state === 'fail') return '价格核对疑似异常';
  return '验货完成';
}

function getMainFindingEn(result, dims) {
  if (dims.connectivity?.state === 'fail') return 'Model connectivity failed';
  if (dims.connectivity?.state === 'blocked') return 'Model connectivity blocked (browser restriction)';
  const onlyConnPassed = dims.connectivity?.state === 'pass'
    && dims.usage?.state === 'skipped'
    && dims.billing?.state === 'skipped'
    && dims.cache?.state === 'skipped'
    && dims.price?.state === 'skipped'
    && dims.modelSanity?.state === 'skipped';
  if (onlyConnPassed) return 'Basic connectivity normal';
  if (dims.usage?.state === 'fail') return 'Usage missing';
  if (dims.usage?.state === 'warn') return 'Usage data is risky';
  if (dims.billing?.state === 'fail') return 'Suspected billing anomaly';
  if (dims.cache?.state === 'pass') return 'Cache hit normal';
  if (dims.modelSanity?.state === 'fail') return 'Model degradation risk detected';
  if (dims.modelSanity?.state === 'warn') return 'Model performance is risky';
  if (dims.price?.state === 'fail') return 'Price audit anomaly';
  return 'Diagnosis complete';
}

/* ═══════════════════════════════════════════════════════════════════
   Shareable Card — 传播短卡评分系统
   优先级顺序：有无产物 > 扣没扣钱 > 账单明细 > 流式 > 模型 > 能否连上
   ═══════════════════════════════════════════════════════════════════ */
function calcShareableCard(result, dims, lang) {
  const zh = lang !== 'en';
  const conn = result.connectivity || {};
  const scored = result._scored || {};

  // ── 判断扣款证据 ────────────────────────────────────────────────
  const hasBalanceDelta = result.billing && (
    result.billing.beforeBalance !== undefined ||
    result.billing.afterBalance !== undefined
  );
  const balanceReduced = hasBalanceDelta && result.billing.beforeBalance !== undefined &&
    result.billing.afterBalance !== undefined &&
    result.billing.afterBalance < result.billing.beforeBalance;

  const hasUsage = conn.totalTokens != null;
  const hasOutput = conn.visibleOutputStatus === 'present';
  const hasRawQuota = result.billing?.rawQuotaAvailable === true;

  // ── 6维读条数据 ────────────────────────────────────────────────
  // 1. 有无产物
  const outputState = hasOutput ? 'pass' : 'fail';
  const outputScore = hasOutput ? 100 : 0;
  const outputDetail = hasOutput ? (zh ? '有文字产出' : 'Has output') : (zh ? '没出字' : 'No output');

  // 2. 扣没扣钱
  let billingState, billingScore, billingDetail;
  if (balanceReduced) {
    billingState = 'fail'; billingScore = 0;
    billingDetail = zh ? '余额少了' : 'Balance reduced';
  } else if (hasBalanceDelta) {
    billingState = 'pass'; billingScore = 100;
    billingDetail = zh ? '没扣钱' : 'No charge';
  } else {
    billingState = 'skipped'; billingScore = 0;
    billingDetail = zh ? '网页没读余额' : 'No balance read';
  }

  // 3. 账单明细
  const usageState = conn.totalTokens != null ? 'pass' : 'fail';
  const usageScore = conn.totalTokens != null ? 100 : 0;
  const usageDetail = conn.totalTokens != null
    ? (zh ? '有 token' : 'Has tokens')
    : (zh ? '无账单明细' : 'No token data');

  // 4. 流式会不会炸 (未单独测试，标记为未验)
  const streamState = 'skipped';
  const streamScore = 0;
  const streamDetail = zh ? '需完整验货' : 'Needs full check';

  // 5. 模型有没有缩水
  let modelState, modelScore, modelDetail;
  if (result.modelSanity && result.modelSanity.overallScore !== null) {
    const ms = result.modelSanity.overallScore;
    modelState = ms >= 70 ? 'pass' : ms >= 50 ? 'warn' : 'fail';
    modelScore = ms;
    modelDetail = zh
      ? (result.modelSanity.label || '模型正常')
      : (result.modelSanity.labelEn || 'Model OK');
  } else {
    modelState = 'skipped'; modelScore = 0;
    modelDetail = zh ? '需完整验货' : 'Needs full check';
  }

  // 6. 能否连上
  const connState = dims.connectivity?.state ?? 'skipped';
  const connScore = dims.connectivity?.score ?? 0;
  const connDetail = (() => {
    if (!conn || !conn.status) return zh ? '无响应' : 'No response';
    if (conn.status === 200) return 'HTTP 200';
    if (conn.status >= 400) return 'HTTP ' + conn.status;
    return conn.status;
  })();

  const bars = [
    { label: zh ? '有无产物' : 'Output',     state: outputState,  score: outputScore,  detail: outputDetail,   key: 'output' },
    { label: zh ? '扣没扣钱' : 'Charged?', state: billingState,  score: billingScore, detail: billingDetail, key: 'billing' },
    { label: zh ? '账单明细' : 'Token Details', state: usageState, score: usageScore, detail: usageDetail, key: 'usage' },
    { label: zh ? '流式会不会炸' : 'Streaming', state: streamState,  score: streamScore,  detail: streamDetail,  key: 'streaming' },
    { label: zh ? '模型有没有缩水' : 'Model Shrinkage', state: modelState, score: modelScore, detail: modelDetail, key: 'model' },
    { label: zh ? '能否连上' : 'Connection', state: connState,     score: connScore,   detail: connDetail,    key: 'conn' },
  ];

  // ── 动态 verdict + grade + chips ──────────────────────────────
  let verdict, grade, chips;

  if (!hasOutput && balanceReduced) {
    verdict = zh ? '空跑扣费' : 'Empty-Run Fraud';
    grade = 'F';
    chips = [
      zh ? '没产物' : 'No Output',
      zh ? '已扣钱' : 'Charged',
      zh ? '高危' : 'High Risk'
    ];
  } else if (!hasOutput && hasUsage) {
    verdict = zh ? '返回废包' : 'Empty Response';
    grade = connScore >= 65 ? 'D' : 'C';
    chips = [
      zh ? '没产物' : 'No Output',
      zh ? '有账单' : 'Has Tokens',
      zh ? '扣钱没验' : 'Unverified Charge'
    ];
  } else if (!hasOutput && !hasUsage) {
    verdict = zh ? '疑似空跑' : 'Suspected Empty Run';
    grade = 'D';
    chips = [
      zh ? '没产物' : 'No Output',
      zh ? '没账单' : 'No Tokens',
      zh ? '扣钱没验' : 'Charge Unverified'
    ];
  } else if (connState === 'blocked') {
    verdict = zh ? '连不上' : 'Cannot Connect';
    grade = 'U';
    chips = [
      zh ? '浏览器拦截' : 'Browser Blocked',
      zh ? '需看详情' : 'See Details'
    ];
  } else if (modelState === 'fail') {
    verdict = zh ? '模型缩水' : 'Model Shrinkage';
    grade = 'C';
    chips = [
      zh ? '表现不对' : 'Perf. Anomaly',
      zh ? '需复查' : 'Needs Review'
    ];
  } else if (modelState === 'warn') {
    verdict = zh ? '模型存疑' : 'Model Uncertain';
    grade = 'C';
    chips = [
      zh ? '指令不稳' : 'Unstable Output',
      zh ? '需复查' : 'Needs Review'
    ];
  } else if (billingState === 'fail') {
    verdict = zh ? '扣费异常' : 'Billing Anomaly';
    grade = 'D';
    chips = [
      zh ? '已扣钱' : 'Charged',
      zh ? '需复查' : 'Needs Review'
    ];
  } else if (!hasOutput) {
    verdict = zh ? '无产物' : 'No Output';
    grade = 'D';
    chips = [zh ? '没产物' : 'No Output'];
  } else if (usageState !== 'pass') {
    verdict = zh ? '账单异常' : 'Token Anomaly';
    grade = 'C';
    chips = [zh ? '账单不明' : 'Tokens Unclear'];
  } else if (billingState === 'pass') {
    verdict = zh ? '硬货' : 'Solid';
    grade = connScore >= 100 ? 'A' : 'B';
    chips = [
      zh ? '有产物' : 'Has Output',
      zh ? '账单完整' : 'Tokens OK',
      zh ? '能对账' : 'Verified'
    ];
  } else {
    verdict = zh ? '能用' : 'Usable';
    grade = connScore >= 90 ? 'A' : 'B';
    chips = [
      zh ? '有产物' : 'Has Output',
      zh ? '账单完整' : 'Tokens OK'
    ];
  }

  // ── 综合分 ─────────────────────────────────────────────────────
  const activeBars = bars.filter(b => b.state !== 'skipped');
  const totalScore = activeBars.length > 0
    ? Math.round(activeBars.reduce((sum, b) => sum + (b.score || 0), 0) / activeBars.length)
    : 0;

  // ── 一句话结论 ────────────────────────────────────────────────
  const conclusion = (() => {
    if (grade === 'F') return zh ? '没拿到东西，钱却扣了，请仔细核查。' : 'No output, but charged. Verify carefully.';
    if (grade === 'D') return zh ? '返回无效内容，或扣费无法核验。' : 'Invalid content returned, or charges unverified.';
    if (grade === 'C') return zh ? '有产出，但有些指标存疑。' : 'Has output, but some indicators are questionable.';
    if (grade === 'A') return zh ? '有产物、有账单明细，扣钱也能对上。' : 'Has output and tokens, charges verified.';
    return zh ? '有产物，基础功能可用。' : 'Has output, basic functions work.';
  })();

  return {
    verdict, grade, chips, conclusion,
    score: totalScore,
    bars,
    conn,
    model: formData => formData?.model || '—',
    reportId: result.reportId,
    timestamp: result.timestamp,
  };
}

/* ═══════════════════════════════════════════════════════
   Quick mode: simple finding
   ═══════════════════════════════════════════════════════ */
function getQuickFinding(result, lang) {
  const zh = lang !== 'en';
  const conn = result.connectivity;

  // U: no response at all
  if (!conn) {
    return {
      score: 0, grade: 'U', status: 'U',
      label: zh ? 'U档：验不出真身' : 'U: Unverified',
      mainFinding: zh ? '验不出真身：无法获取响应。' : 'Unverified: no response received.',
      riskChips: zh ? ['浏览器拦截', '验不出真身'] : ['Browser Blocked', 'Unverified']
    };
  }

  const s = conn.status;
  const vos = conn.visibleOutputStatus || 'absent'; // 'present' | 'absent' | 'parser_unknown'
  const hasOutput = vos === 'present';
  const hasUsage = conn.totalTokens != null;
  const completionTokens = conn.completionTokens ?? null;
  const latency = conn.latency || 0;

  // ── U: CORS / timeout ──────────────────────────────────────
  if (conn.error === 'cors_or_network' || conn.error === 'timeout') {
    return {
      score: 0, grade: 'U', status: 'U',
      label: zh ? 'U档：验不出真身' : 'U: Unverified',
      mainFinding: zh
        ? 'U档：验不出真身。浏览器环境限制了检测，建议换 Chrome 插件或服务端环境复查。'
        : 'U: Unverified. Browser environment limits detection. Use the Chrome extension or server environment to retest.',
      riskChips: zh ? ['浏览器拦截', '验不出真身'] : ['Browser Blocked', 'Unverified']
    };
  }

  // ── F: 401 / 403 — cap 35 ───────────────────────────────
  if (s === 401 || s === 403) {
    return {
      score: 35, grade: 'F', status: 'F',
      label: zh ? 'F档：高危' : 'F: High Risk',
      mainFinding: zh
        ? 'F档：Key 无效或权限不足。'
        : 'F: API Key invalid or insufficient permissions.',
      riskChips: zh ? ['Key 无效', '权限不足'] : ['Invalid Key', 'Access Denied']
    };
  }

  // ── F: 404 — cap 40 ────────────────────────────────────
  if (s === 404) {
    return {
      score: 40, grade: 'F', status: 'F',
      label: zh ? 'F档：模型不可用' : 'F: Model Unavailable',
      mainFinding: zh
        ? 'F档：模型名错误、模型不可用或接口不兼容。'
        : 'F: Model name incorrect, model unavailable, or incompatible API.',
      riskChips: zh ? ['模型不可用'] : ['Model Unavailable']
    };
  }

  // ── D: 5xx — cap 45 ───────────────────────────────────
  if (s >= 500 && s < 600) {
    return {
      score: 45, grade: 'D', status: 'D',
      label: zh ? 'D档：上游爆错' : 'D: Upstream Error',
      mainFinding: zh
        ? 'D档：服务商或上游爆错，本次请求不可用。'
        : 'D: Provider or upstream error — request failed.',
      riskChips: zh ? ['上游爆错'] : ['Upstream Error']
    };
  }

  // ── F: other non-2xx — cap 20 ─────────────────────────
  if (s < 200 || s >= 300) {
    return {
      score: 20, grade: 'F', status: 'F',
      label: zh ? 'F档：HTTP 异常' : 'F: HTTP Error',
      mainFinding: zh
        ? `F档：HTTP ${s}，无法完成验货。`
        : `F: HTTP ${s} — cannot complete check.`,
      riskChips: zh ? ['HTTP 异常'] : ['HTTP Error']
    };
  }

  // ── HTTP 200: points-based scoring ───────────────────────
  let httpScore = 35;
  let outputScore = 0;
  let usageScore = 0;
  let latencyScore = 0;
  let errorScore = 10;

  if (s >= 200 && s < 300) { httpScore = 35; }

  // Effective output: 25
  if (hasOutput) { outputScore = 25; }

  // Usage: 20
  if (hasUsage) { usageScore = 20; }

  // Latency: 10
  if (latency <= 1500) { latencyScore = 10; }
  else if (latency <= 5000) { latencyScore = 6; }
  else if (latency <= 10000) { latencyScore = 3; }
  else { latencyScore = 0; }

  // Error explainability: 10
  if (hasOutput && hasUsage) { errorScore = 10; }
  else if (!hasOutput && !hasUsage) { errorScore = 5; }
  else if (hasOutput && !hasUsage) { errorScore = 6; }
  else if (vos === 'parser_unknown') { errorScore = 4; }
  else { errorScore = 4; } // absent + usage

  let rawScore = httpScore + outputScore + usageScore + latencyScore + errorScore;

  // ── Apply capping rules ───────────────────────────────────
  // Rule 1: 200 + no output + no usage → max D / 55
  if (vos === 'absent' && !hasUsage) {
    rawScore = Math.min(rawScore, 55);
  }
  // Rule 2: 200 + has usage (absent or parser_unknown) → max C / 65
  else if (hasUsage && !hasOutput) {
    rawScore = Math.min(rawScore, 65);
  }
  // Rule 3: 200 + has output + no usage → max C / 69
  else if (hasOutput && !hasUsage) {
    rawScore = Math.min(rawScore, 69);
  }

  const score = Math.min(rawScore, 100);

  // ── Assign grade ─────────────────────────────────────────
  let grade;
  if (score >= 90) { grade = 'A'; }
  else if (score >= 75) { grade = 'B'; }
  else if (score >= 60) { grade = 'C'; }
  else if (score >= 40) { grade = 'D'; }
  else { grade = 'F'; }

  // ── Generate mainFinding ─────────────────────────────────
  let mainFinding, riskChips;

  if (grade === 'A') {
    mainFinding = zh
      ? '通过验货：模型有输出，usage 明细完整。'
      : 'Passed: output and usage details are both present.';
    riskChips = zh ? ['通过验货'] : ['Passed'];
  } else if (grade === 'B') {
    mainFinding = zh
      ? '能用：基本通过，有少量可改进项。'
      : 'Usable: mostly passed, minor issues to address.';
    riskChips = zh ? ['延迟偏高'].filter(Boolean) : ['High Latency'].filter(Boolean);
  } else if (grade === 'C') {
    if (vos === 'parser_unknown') {
      mainFinding = zh
        ? '输出解析异常：usage 有 completion tokens，但未发现标准输出字段。可能是中转站兼容层返回格式不标准，也可能是 API Doctor 需要适配该响应结构。'
        : 'Output parser unknown: usage shows completion tokens but no standard output fields found. The response may use a non-standard format from a compatibility layer.';
      riskChips = zh ? ['输出解析异常', '兼容层不兼容'] : ['Parser Unknown', 'Compatibility Layer Issue'];
    } else if (vos === 'absent' && hasUsage) {
      mainFinding = zh
        ? '返回废包：usage 有记录，但本次没有有效输出。'
        : 'Dead output: usage exists, but no effective response was produced.';
      riskChips = zh ? ['返回废包', 'usage 消失'] : ['Dead Output', 'Usage Missing'];
    } else if (!hasUsage) {
      mainFinding = zh
        ? '能用但不透明：模型有输出，但 usage 明细消失。'
        : 'Usable but opaque: output exists, but usage details are missing.';
      riskChips = zh ? ['usage 消失', '扣费黑洞风险'] : ['Usage Missing', 'Billing Blackhole Risk'];
    } else {
      mainFinding = zh
        ? 'C档：模型输出状态异常。'
        : 'C: Abnormal output state.';
      riskChips = zh ? ['输出异常'] : ['Abnormal Output'];
    }
  } else if (grade === 'D') {
    mainFinding = zh
      ? '疑似空跑：HTTP 200 但无有效输出，usage 也没返回。'
      : 'Suspected empty run: HTTP 200, but no effective output and no usage details.';
    riskChips = zh ? ['疑似空跑', 'usage 消失', '接口假健康'] : ['Suspected Empty Run', 'Usage Missing', 'Fake-Healthy API'];
  } else {
    mainFinding = zh
      ? '高危：多项指标异常，结果不可信。'
      : 'High risk: multiple anomalies detected. Results may not be reliable.';
    riskChips = zh ? ['疑似空跑', '高危'] : ['Suspected Empty Run', 'High Risk'];
  }

  const labelMap = {
    A: zh ? 'A档：硬货' : 'A: Solid',
    B: zh ? 'B档：能用' : 'B: Usable',
    C: zh ? 'C档：掺水' : 'C: Diluted',
    D: zh ? 'D档：疑似空跑' : 'D: Suspected Empty Run',
    F: zh ? 'F档：高危' : 'F: High Risk',
  };

  return {
    score,
    grade,
    status: grade,
    label: labelMap[grade] || (zh ? 'U档' : 'U'),
    mainFinding,
    riskChips
  };
}

function getQuickFindingEn(result) { return getQuickFinding(result, 'en'); }

/* ═══════════════════════════════════════════════════════
   Core diagnostic runner
   ═══════════════════════════════════════════════════════ */
async function runDiagnosis(opts) {
  const { baseUrl, apiKey, model, interfaceType, signal, runCacheTest, runPriceTest, priceData, runSanityTest, mode } = opts;
  const lang = getDocLang();

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

    const outputInfo = extractVisibleOutput(data, interfaceType);
    result.connectivity.visibleOutputStatus = outputInfo.status;
    result.connectivity.visibleOutputFoundFields = outputInfo.foundFields;
    result.connectivity.visibleLength = outputInfo.text.length;
    result.connectivity.responseShapeSummary = buildResponseShapeSummary(data, interfaceType);

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
      result.connectivity = { status: 0, latency: 0, error: 'timeout', state: 'fail', visibleOutputStatus: 'absent', visibleLength: 0, responseShapeSummary: [] };
    } else {
      result.connectivity = { status: 0, latency: 0, error: 'cors_or_network', rawMessage: err.message, state: 'blocked', visibleOutputStatus: 'absent', visibleLength: 0, responseShapeSummary: [] };
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

  // ── Billing Integrity Test ──────────────────────────────────
  // Billing test sends a 2nd request → only run in full mode to keep quick at 1 request
  result.billing = mode === 'full'
    ? await runBillingTest(baseUrl, apiKey, model, interfaceType, signal, result.connectivity)
    : { verdict: 'raw_quota_unavailable', reason: 'Billing check requires Full Check mode.', state: 'skipped' };

  if (runSanityTest) {
    result.modelSanity = await runModelSanityTests({ baseUrl, apiKey, model, interfaceType, signal });
  }

  if (mode === 'full') {
    const scored = newCalcScore(result);
    result._scored = scored;
  }

  // Always calculate quick-mode score for scorecard display
  result._quickScore = getQuickFinding(result, lang);

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

/* ── Billing Integrity Test ─────────────────────────────────────
   Sends a second request with an intentionally invalid model.
   If the provider returns a 4xx response WITH usage reported → overcharging.
   If 4xx without usage → correctly not charged.
   ═══════════════════════════════════════════════════════════════ */
async function runBillingTest(baseUrl, apiKey, model, interfaceType, signal, connResult) {
  // Skip if we have no connectivity result yet
  if (!connResult || connResult.status === 0) {
    return { verdict: 'raw_quota_unavailable', reason: 'No baseline connectivity — skipped', state: 'skipped' };
  }

  // Check if the first (valid) request returned any usage data at all
  const hasBaselineUsage = connResult.totalTokens != null && connResult.totalTokens > 0;
  if (!hasBaselineUsage) {
    return { verdict: 'raw_quota_unavailable', reason: 'Baseline request returned no usage data — cannot compare', state: 'skipped' };
  }

  // Build a second request with an obviously invalid model name
  const badModel = `__invalid-model-test-99999__billing-check__${Date.now()}`;
  const req = buildRequest(baseUrl, apiKey, badModel, interfaceType, 'reply with just the word "test"', 1);

  try {
    const resp = await fetch(req.endpoint, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal
    });

    // Only meaningful if we got a client error (provider rejected the bad model)
    if (resp.status >= 400 && resp.status < 500) {
      let data = {};
      try { data = await resp.json(); } catch { /* not JSON */ }
      const badUsage = data.usage || {};

      // If usage is still reported on a 4xx → provider charged for a bad request
      if (badUsage.total_tokens > 0 || badUsage.prompt_tokens > 0 || badUsage.completion_tokens > 0) {
        return {
          verdict: 'failed_request_charged',
          reason: `Provider charged for a 4xx request (HTTP ${resp.status}). prompt_tokens=${badUsage.prompt_tokens}, completion_tokens=${badUsage.completion_tokens}`,
          state: 'fail',
          badRequestUsage: {
            promptTokens: badUsage.prompt_tokens || badUsage.input_tokens || 0,
            completionTokens: badUsage.completion_tokens || badUsage.output_tokens || 0,
            totalTokens: badUsage.total_tokens || 0
          }
        };
      } else {
        return {
          verdict: 'failed_request_not_charged',
          reason: `HTTP ${resp.status} with no usage — provider correctly declined to charge.`,
          state: 'pass'
        };
      }
    }

    // 2xx: provider accepted the bad model — might be routing elsewhere
    if (resp.status >= 200 && resp.status < 300) {
      return {
        verdict: 'raw_quota_unavailable',
        reason: 'Provider accepted the invalid model name — model validation unclear.',
        state: 'warn'
      };
    }

    // 5xx: upstream error — inconclusive
    return {
      verdict: 'raw_quota_unavailable',
      reason: `Provider returned HTTP ${resp.status} — result inconclusive.`,
      state: 'skipped'
    };

  } catch (err) {
    if (err.name === 'AbortError') {
      return { verdict: 'raw_quota_unavailable', reason: 'Test aborted — timeout', state: 'skipped' };
    }
    return { verdict: 'raw_quota_unavailable', reason: `Network error: ${err.message}`, state: 'skipped' };
  }
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

/* ═══════════════════════════════════════════════════════
   Visible output extraction
   ═══════════════════════════════════════════════════════ */
function extractVisibleOutput(data, interfaceType) {
  const EMPTY = { text: '', status: 'absent', foundFields: [] };
  if (!data || typeof data !== 'object') return EMPTY;

  const foundFields = [];

  if (interfaceType === 'OpenAI Chat') {
    const choices = data.choices;
    if (!choices || !Array.isArray(choices) || choices.length === 0) return EMPTY;

    const c0 = choices[0];
    if (!c0) return EMPTY;

    // 1. message.content (string)
    const mc = c0.message?.content;
    if (typeof mc === 'string' && mc.trim()) {
      foundFields.push('choices[0].message.content');
      return { text: mc.trim(), status: 'present', foundFields };
    }
    // 2. message.content (array of content parts)
    if (Array.isArray(mc)) {
      for (const part of mc) {
        if (part?.type === 'text' && part?.text?.trim()) {
          foundFields.push('choices[0].message.content[type=text].text');
          return { text: part.text.trim(), status: 'present', foundFields };
        }
        if ((part?.type === 'input_text' || part?.type === 'output_text') && part?.text?.trim()) {
          foundFields.push(`choices[0].message.content[type=${part.type}].text`);
          return { text: part.text.trim(), status: 'present', foundFields };
        }
      }
      // array with content but no text
      foundFields.push('choices[0].message.content (array)');
    }
    // 3. reasoning_content
    if (c0.message?.reasoning_content && String(c0.message.reasoning_content).trim()) {
      foundFields.push('choices[0].message.reasoning_content');
      return { text: String(c0.message.reasoning_content).trim(), status: 'present', foundFields };
    }
    // 4. tool_calls
    if (c0.message?.tool_calls && c0.message.tool_calls.length > 0) {
      foundFields.push('choices[0].message.tool_calls');
      return { text: '[tool_calls]', status: 'present', foundFields };
    }
    // 5. finish_reason
    if (c0.finish_reason) {
      foundFields.push('choices[0].finish_reason');
    }
    // 6. delta.content
    const delta = c0.delta;
    if (delta?.content && String(delta.content).trim()) {
      foundFields.push('choices[0].delta.content');
      return { text: String(delta.content).trim(), status: 'present', foundFields };
    }

  } else if (interfaceType === 'OpenAI Responses') {
    // output_text top-level
    if (data.output_text && String(data.output_text).trim()) {
      foundFields.push('output_text');
      return { text: String(data.output_text).trim(), status: 'present', foundFields };
    }
    // response.output_text
    if (data.response?.output_text && String(data.response.output_text).trim()) {
      foundFields.push('response.output_text');
      return { text: String(data.response.output_text).trim(), status: 'present', foundFields };
    }
    // output[].content[].text
    const outputs = data.output || data.response?.output || [];
    if (Array.isArray(outputs)) {
      for (const out of outputs) {
        if (out?.content && Array.isArray(out.content)) {
          for (const part of out.content) {
            if (part?.type === 'output_text' && part?.text?.trim()) {
              foundFields.push(`output[].content[type=output_text].text`);
              return { text: part.text.trim(), status: 'present', foundFields };
            }
            if (part?.type === 'text' && part?.text?.trim()) {
              foundFields.push(`output[].content[type=text].text`);
              return { text: part.text.trim(), status: 'present', foundFields };
            }
            if (part?.type === 'message' && part?.text?.trim()) {
              foundFields.push(`output[].content[type=message].text`);
              return { text: part.text.trim(), status: 'present', foundFields };
            }
            if (part?.annotations && part.annotations.length > 0) {
              foundFields.push('output[].content[].annotations');
              return { text: '[annotations]', status: 'present', foundFields };
            }
          }
          if (out.content.length > 0) foundFields.push('output[].content (array)');
        }
        if (out?.type) foundFields.push(`output[].type=${out.type}`);
      }
    }

  } else if (interfaceType === 'Claude Messages') {
    // content[].text
    const content = data.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part?.type === 'text' && part?.text?.trim()) {
          foundFields.push('content[type=text].text');
          return { text: part.text.trim(), status: 'present', foundFields };
        }
        if (part?.type === 'tool_use') {
          foundFields.push('content[type=tool_use]');
          return { text: '[tool_use]', status: 'present', foundFields };
        }
        if (part?.type === 'image' || part?.type === 'source') {
          foundFields.push(`content[type=${part.type}]`);
          return { text: `[${part.type}]`, status: 'present', foundFields };
        }
      }
      if (content.length > 0) foundFields.push('content (array)');
    }
    // delta.text
    if (data.delta?.text && String(data.delta.text).trim()) {
      foundFields.push('delta.text');
      return { text: String(data.delta.text).trim(), status: 'present', foundFields };
    }
    // stop_reason
    if (data.stop_reason) foundFields.push('stop_reason');
    // usage
    if (data.usage) foundFields.push('usage');
  }

  // If we reached here, we found some structural fields but no text
  return { text: '', status: foundFields.length > 0 ? 'parser_unknown' : 'absent', foundFields };
}

/* ═══════════════════════════════════════════════════════
   Response shape summary builder
   ═══════════════════════════════════════════════════════ */
function buildResponseShapeSummary(data, interfaceType) {
  if (!data || typeof data !== 'object') return [];
  const lines = [];
  const topKeys = Object.keys(data).filter(k => k !== 'choices' && k !== 'content' && k !== 'output' && k !== 'error');

  // Top-level safe keys
  const safeTop = topKeys.filter(k => !k.toLowerCase().includes('key') && !k.toLowerCase().includes('secret') && !k.toLowerCase().includes('token') && k !== 'body');
  if (safeTop.length > 0) {
    lines.push(`response keys: ${safeTop.join(', ')}`);
  }

  // Choices / output
  if (interfaceType === 'OpenAI Chat') {
    const choices = data.choices;
    if (choices && Array.isArray(choices) && choices[0]) {
      const cKeys = Object.keys(choices[0]).filter(k => k !== 'message');
      if (cKeys.length > 0) lines.push(`choices[0] keys: ${cKeys.join(', ')}`);
      if (choices[0].message) {
        const mKeys = Object.keys(choices[0].message).filter(k => !k.toLowerCase().includes('key') && !k.toLowerCase().includes('token'));
        if (mKeys.length > 0) lines.push(`choices[0].message keys: ${mKeys.join(', ')}`);
        if (Array.isArray(choices[0].message.content)) {
          const partTypes = choices[0].message.content.map(p => p?.type || '?').filter((v, i, a) => a.indexOf(v) === i);
          lines.push(`choices[0].message.content types: ${partTypes.join(', ')}`);
        }
      }
    }
  } else if (interfaceType === 'OpenAI Responses') {
    const outputs = data.output || data.response?.output;
    if (outputs && Array.isArray(outputs) && outputs[0]) {
      const oKeys = Object.keys(outputs[0]).filter(k => k !== 'content');
      if (oKeys.length > 0) lines.push(`output[0] keys: ${oKeys.join(', ')}`);
      if (outputs[0].content && Array.isArray(outputs[0].content)) {
        const pTypes = outputs[0].content.map(p => p?.type || '?').filter((v, i, a) => a.indexOf(v) === i);
        lines.push(`output[0].content types: ${pTypes.join(', ')}`);
      }
    }
  } else if (interfaceType === 'Claude Messages') {
    if (data.content && Array.isArray(data.content)) {
      const partTypes = data.content.map(p => p?.type || '?').filter((v, i, a) => a.indexOf(v) === i);
      lines.push(`content types: ${partTypes.join(', ')}`);
    }
  }

  // Usage keys
  const usage = data.usage;
  if (usage && typeof usage === 'object') {
    const uKeys = Object.keys(usage).filter(k => !k.toLowerCase().includes('key') && !k.toLowerCase().includes('secret'));
    if (uKeys.length > 0) lines.push(`usage keys: ${uKeys.join(', ')}`);
  }

  return lines;
}

function assessUsageIntegrity(conn) {
  if (!conn || conn.status === 0) return 'skipped';
  if (conn.status >= 400) return 'skipped';
  if (conn.visibleOutputStatus === 'absent' || conn.visibleOutputStatus === 'parser_unknown') return 'skipped';

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
   Report rendering — Shareable Short Card (Playground v4 style)
   All modes use the same card format for consistency
   ═══════════════════════════════════════════════════════ */
function renderCard(result, formData) {
  const lang = getDocLang();
  const zh = lang !== 'en';
  const conn = result.connectivity || {};
  const isQuick = result.mode === 'quick';

  // ── Score data ──────────────────────────────────────────────
  const qs = isQuick ? (result._quickScore || getQuickFinding(result, lang)) : null;
  const scored = result._scored;

  // Build 6-dim bar data
  const hasBalanceDelta = result.billing && (
    result.billing.beforeBalance !== undefined || result.billing.afterBalance !== undefined
  );
  const balanceReduced = hasBalanceDelta &&
    result.billing.beforeBalance !== undefined &&
    result.billing.afterBalance !== undefined &&
    result.billing.afterBalance < result.billing.beforeBalance;
  const hasOutput = conn.visibleOutputStatus === 'present';
  const hasUsage = conn.totalTokens != null;

  // Output bar
  const barOutput = {
    label: zh ? '有无产物' : 'Output',
    state: hasOutput ? 'pass' : 'fail',
    score: hasOutput ? 100 : 0,
    detail: hasOutput ? (zh ? '有文字产出' : 'Has output') : (zh ? '没出字' : 'No output'),
  };

  // Billing bar
  const barBilling = (() => {
    if (balanceReduced) return { label: zh ? '扣没扣钱' : 'Charged?', state: 'fail', score: 0, detail: zh ? '余额少了' : 'Balance reduced' };
    if (hasBalanceDelta) return { label: zh ? '扣没扣钱' : 'Charged?', state: 'pass', score: 100, detail: zh ? '没扣钱' : 'No charge' };
    return { label: zh ? '扣没扣钱' : 'Charged?', state: 'skipped', score: 0, detail: zh ? '网页没读余额' : 'No balance read' };
  })();

  // Usage bar
  const barUsage = {
    label: zh ? '账单明细' : 'Token Details',
    state: hasUsage ? 'pass' : 'fail',
    score: hasUsage ? 100 : 0,
    detail: hasUsage ? (zh ? '有 token' : 'Has tokens') : (zh ? '无账单明细' : 'No token data'),
  };

  // Streaming bar (untested in quick mode)
  const barStream = {
    label: zh ? '流式会不会炸' : 'Streaming',
    state: isQuick ? 'skipped' : 'skipped',
    score: 0,
    detail: zh ? '需完整验货' : 'Needs full check',
  };

  // Model bar
  const barModel = (() => {
    if (result.modelSanity && result.modelSanity.overallScore !== null) {
      const ms = result.modelSanity.overallScore;
      return {
        label: zh ? '模型有没有缩水' : 'Model Shrinkage',
        state: ms >= 70 ? 'pass' : ms >= 50 ? 'warn' : 'fail',
        score: ms,
        detail: zh ? (result.modelSanity.label || '正常') : (result.modelSanity.labelEn || 'OK'),
      };
    }
    return { label: zh ? '模型有没有缩水' : 'Model Shrinkage', state: 'skipped', score: 0, detail: zh ? '需完整验货' : 'Needs full check' };
  })();

  // Connection bar
  const barConn = (() => {
    const s = conn.status;
    const st = scored?.dims?.connectivity?.state ?? 'skipped';
    const sc = scored?.dims?.connectivity?.score ?? 0;
    if (st === 'blocked') return { label: zh ? '能否连上' : 'Connection', state: 'warn', score: sc, detail: zh ? 'CORS 限制' : 'CORS Blocked' };
    if (!s) return { label: zh ? '能否连上' : 'Connection', state: 'fail', score: 0, detail: zh ? '无响应' : 'No response' };
    if (s >= 200 && s < 300) return { label: zh ? '能否连上' : 'Connection', state: 'pass', score: sc || 100, detail: 'HTTP 200' };
    return { label: zh ? '能否连上' : 'Connection', state: 'fail', score: 0, detail: 'HTTP ' + s };
  })();

  const bars = [barOutput, barBilling, barUsage, barStream, barModel, barConn];

  // ── Dynamic verdict / grade / chips ─────────────────────────
  let verdict, grade, chips, conclusion;

  if (!hasOutput && balanceReduced) {
    verdict = zh ? '空跑扣费' : 'Empty-Run Fraud'; grade = 'F';
    chips = [zh ? '没产物' : 'No Output', zh ? '已扣钱' : 'Charged', zh ? '高危' : 'High Risk'];
    conclusion = zh ? '没拿到东西，钱却扣了，请仔细核查。' : 'No output, but charged. Verify carefully.';
  } else if (!hasOutput && hasUsage) {
    verdict = zh ? '返回废包' : 'Empty Response'; grade = 'D';
    chips = [zh ? '没产物' : 'No Output', zh ? '有账单' : 'Has Tokens', zh ? '扣钱没验' : 'Charge Unverified'];
    conclusion = zh ? '返回无效内容，账单明细无法核验。' : 'Invalid content returned, charges unverified.';
  } else if (!hasOutput && !hasUsage) {
    verdict = zh ? '疑似空跑' : 'Suspected Empty Run'; grade = 'D';
    chips = [zh ? '没产物' : 'No Output', zh ? '没账单' : 'No Tokens', zh ? '扣钱没验' : 'Charge Unverified'];
    conclusion = zh ? '返回无效内容，无账单明细，扣费无法核验。' : 'Invalid content, no tokens, charges unverified.';
  } else if (barConn.state === 'blocked') {
    verdict = zh ? '连不上' : 'Cannot Connect'; grade = 'U';
    chips = [zh ? '浏览器拦截' : 'Browser Blocked'];
    conclusion = zh ? '浏览器跨域限制，无法完成检测。' : 'Browser CORS restriction blocks the check.';
  } else if (barModel.state === 'fail') {
    verdict = zh ? '模型缩水' : 'Model Shrinkage'; grade = 'C';
    chips = [zh ? '表现不对' : 'Perf. Anomaly', zh ? '需复查' : 'Needs Review'];
    conclusion = zh ? '模型输出异常，表现与标称不符。' : 'Model output anomaly detected.';
  } else if (barModel.state === 'warn') {
    verdict = zh ? '模型存疑' : 'Model Uncertain'; grade = 'C';
    chips = [zh ? '指令不稳' : 'Unstable', zh ? '需复查' : 'Needs Review'];
    conclusion = zh ? '模型输出不太稳定，建议复查。' : 'Model output is unstable, recommend review.';
  } else if (barBilling.state === 'fail') {
    verdict = zh ? '扣费异常' : 'Billing Anomaly'; grade = 'D';
    chips = [zh ? '已扣钱' : 'Charged', zh ? '需复查' : 'Needs Review'];
    conclusion = zh ? '扣费证据显示异常，请核查账单。' : 'Billing evidence shows anomaly.';
  } else if (!hasOutput) {
    verdict = zh ? '无产物' : 'No Output'; grade = 'D';
    chips = [zh ? '没产物' : 'No Output'];
    conclusion = zh ? '未获得有效输出。' : 'No valid output received.';
  } else if (barUsage.state !== 'pass') {
    verdict = zh ? '账单异常' : 'Token Anomaly'; grade = 'C';
    chips = [zh ? '账单不明' : 'Tokens Unclear'];
    conclusion = zh ? '有产出，但账单明细不完整。' : 'Has output but token details incomplete.';
  } else if (barBilling.state === 'pass') {
    verdict = zh ? '硬货' : 'Solid'; grade = barConn.state === 'pass' && barOutput.state === 'pass' && barUsage.state === 'pass' ? 'A' : 'B';
    chips = [zh ? '有产物' : 'Has Output', zh ? '账单完整' : 'Tokens OK', zh ? '能对账' : 'Verified'];
    conclusion = zh ? '有产物、有账单明细，扣钱也能对上。' : 'Has output and tokens, charges verified.';
  } else {
    verdict = zh ? '能用' : 'Usable'; grade = barConn.state === 'pass' ? 'B' : 'C';
    chips = [zh ? '有产物' : 'Has Output', zh ? '账单完整' : 'Tokens OK'];
    conclusion = zh ? '有产物，基础功能可用。' : 'Has output, basic functions work.';
  }

  // ── Score ───────────────────────────────────────────────────
  const activeBars = bars.filter(b => b.state !== 'skipped');
  const totalScore = activeBars.length > 0
    ? Math.round(activeBars.reduce((sum, b) => sum + (b.score || 0), 0) / activeBars.length)
    : (qs ? qs.score : 0);

  // ── Color helpers ───────────────────────────────────────────
  const gradeColor = { A: '#16a34a', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#dc2626', U: '#64748b' }[grade] || '#94a3b8';
  const gradeBg    = { A: '#dcfce7', B: '#eff6ff', C: '#fef9c3', D: '#ffedd5', F: '#fee2e2', U: '#f1f5f9' }[grade] || '#f1f5f9';

  const barColor = (s) => {
    if (s === 'pass') return '#16a34a';
    if (s === 'fail') return '#dc2626';
    if (s === 'warn') return '#f59e0b';
    return '#94a3b8';
  };
  const barBg = (s) => {
    if (s === 'pass') return '#dcfce7';
    if (s === 'fail') return '#fee2e2';
    if (s === 'warn') return '#fef9c3';
    return '#f1f5f9';
  };
  const barTextColor = (s) => barColor(s);
  const barPct = (s) => {
    if (s === 'pass') return 100;
    if (s === 'fail') return 0;
    if (s === 'warn') return 50;
    return 0;
  };
  const statePill = (s) => {
    const c = barColor(s);
    const t = s === 'pass' ? (zh ? '通过' : 'Pass') : s === 'fail' ? (zh ? '失败' : 'Fail') : s === 'warn' ? (zh ? '警告' : 'Warn') : (zh ? '未验' : 'N/A');
    return '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700;color:' + c + ';background:' + barBg(s) + ';white-space:nowrap">' + t + '</span>';
  };

  // ── Render bars ─────────────────────────────────────────────
  const barRow = (b) => {
    const pct = barPct(b.state);
    const c = barColor(b.state);
    const bg = barBg(b.state);
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9">' +
      '<div style="width:88px;font-size:11px;font-weight:600;color:#374151;flex-shrink:0">' + b.label + '</div>' +
      '<div style="flex:1;height:8px;background:' + (b.state === 'skipped' ? '#f1f5f9' : bg) + ';border-radius:4px;overflow:hidden">' +
      '<div style="height:100%;width:' + pct + '%;background:' + (b.state === 'skipped' ? '#cbd5e1' : c) + ';border-radius:4px"></div></div>' +
      '<div style="width:40px;flex-shrink:0">' + statePill(b.state) + '</div>' +
      '<div style="width:70px;text-align:right;font-size:10px;color:#94a3b8;flex-shrink:0">' + b.detail + '</div>' +
      '</div>';
  };

  // ── Tech detail (collapsible) ────────────────────────────────
  const techDetail = '<div id="tech-detail" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px">' +
    '<div style="background:#f8fafc;border-radius:6px;padding:6px 8px"><div style="font-size:8px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:2px">HTTP</div><div style="font-size:12px;font-weight:700;color:' + (conn.status === 200 ? '#16a34a' : '#dc2626') + ';font-family:monospace">' + (conn.status || '—') + '</div></div>' +
    '<div style="background:#f8fafc;border-radius:6px;padding:6px 8px"><div style="font-size:8px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:2px">Latency</div><div style="font-size:12px;font-weight:700;color:#0f172a;font-family:monospace">' + (conn.latency ? conn.latency + 'ms' : '—') + '</div></div>' +
    '<div style="background:#f8fafc;border-radius:6px;padding:6px 8px"><div style="font-size:8px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:2px">completion</div><div style="font-size:12px;font-weight:700;color:#0f172a;font-family:monospace">' + (conn.completionTokens ?? '—') + '</div></div>' +
    '<div style="background:#f8fafc;border-radius:6px;padding:6px 8px"><div style="font-size:8px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:2px">total_tokens</div><div style="font-size:12px;font-weight:700;color:#0f172a;font-family:monospace">' + (conn.totalTokens ?? '—') + '</div></div>' +
    '<div style="background:#f8fafc;border-radius:6px;padding:6px 8px;grid-column:1/-1"><div style="font-size:8px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:2px">Model</div><div style="font-size:11px;font-weight:600;color:#0f172a;font-family:monospace;word-break:break-all">' + escHtml(formData.model || '—') + '</div></div>' +
    '</div></div>';

  // ── Build HTML ─────────────────────────────────────────────
  const reportId = result.reportId;
  const timestamp = result.timestamp;

  const html =
    // ── Short card container (max-width: 540px) ─────────────────
    '<div style="max-width:540px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif">' +

    // ── Dark header ────────────────────────────────────────────
    '<div style="background:#0f172a;border-radius:20px;padding:16px 18px 14px;margin-bottom:10px;position:relative">' +

    // Top row: title + grade badge
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">' +
    '<div>' +
    '<div style="font-size:15px;font-weight:800;color:#fff;letter-spacing:-0.2px">API Doctor</div>' +
    '<div style="font-size:10px;color:#94a3b8;margin-top:1px">' + (zh ? '中转站黑盒验货' : 'Relay API Black-box Check') + '</div>' +
    '</div>' +
    '<div style="background:' + gradeBg + ';border-radius:8px;padding:4px 10px;text-align:center;flex-shrink:0">' +
    '<div style="font-size:22px;font-weight:900;color:' + gradeColor + ';line-height:1">' + grade + '</div>' +
    '<div style="font-size:8px;color:' + gradeColor + ';font-weight:600;margin-top:1px">' + (zh ? '档' : 'Grade') + '</div>' +
    '</div>' +
    '</div>' +

    // Score + verdict
    '<div style="text-align:center;margin-bottom:8px">' +
    '<div style="font-size:56px;font-weight:900;color:' + gradeColor + ';line-height:1">' + totalScore + '</div>' +
    '<div style="font-size:13px;font-weight:700;color:' + gradeColor + ';margin-top:3px">' + verdict + '</div>' +
    '</div>' +

    // Chips row
    '<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center;margin-bottom:4px">' +
    chips.map(c => '<span style="background:' + gradeBg + ';color:' + gradeColor + ';font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap">' + escHtml(c) + '</span>').join('') +
    '</div>' +

    // One-line conclusion
    '<div style="font-size:11px;color:#94a3b8;text-align:center;margin-top:6px;line-height:1.4">' + escHtml(conclusion) + '</div>' +
    '</div>' + // end dark header

    // ── Score bars section ─────────────────────────────────────
    '<div style="background:#fff;border-radius:16px;padding:12px 14px;margin-bottom:10px">' +

    '<div style="font-size:10px;font-weight:700;color:#0f172a;margin-bottom:2px">' + (zh ? '为什么是 ' + totalScore + ' 分？' : 'Why ' + totalScore + ' points?') + '</div>' +
    '<div style="font-size:10px;color:#94a3b8;margin-bottom:8px">' + (zh ? '先看有没有产物，再看扣没扣钱' : 'Check output first, then billing') + '</div>' +

    bars.map(barRow).join('') +

    // Expand tech detail toggle
    '<div style="margin-top:8px;text-align:center">' +
    '<button id="toggle-tech" onclick="var d=document.getElementById(\'tech-detail\');var b=document.getElementById(\'toggle-tech\');if(d.style.display===\'none\'){d.style.display=\'block\';b.textContent=\'' + (zh ? '收起技术详情' : 'Hide Details') + '\'}else{d.style.display=\'none\';b.textContent=\'' + (zh ? '展开技术详情' : 'Show Details') + '\'}" style="background:none;border:none;color:#64748b;font-size:10px;cursor:pointer;padding:2px 0;font-family:inherit">' + (zh ? '展开技术详情' : 'Show Details') + '</button>' +
    '</div>' +
    techDetail +
    '</div>' + // end bars section

    // ── Footer ─────────────────────────────────────────────────
    '<div style="text-align:center;font-size:10px;color:#94a3b8;padding:4px 0 6px">' +
    (zh ? '模型' : 'Model') + ': ' + escHtml(formData.model || '—') + ' &nbsp;|&nbsp; ' +
    (zh ? '报告 ID' : 'Report ID') + ': ' + reportId + ' &nbsp;|&nbsp; aiapidoctor.com' +
    '</div>' +

    // Action buttons
    '<div style="display:flex;gap:6px;margin-top:6px">' +
    '<button onclick="Doctor.saveImage()" style="flex:1;padding:8px 10px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">' + (zh ? '保存图片' : 'Save Image') + '</button>' +
    '<button onclick="Doctor.copyOneLine()" style="flex:1;padding:8px 10px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">' + (zh ? '复制晒分' : 'Copy Score') + '</button>' +
    '<button onclick="Doctor.copyMarkdown()" style="flex:1;padding:8px 10px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">' + (zh ? 'Markdown' : 'Markdown') + '</button>' +
    '</div>' +

    // Safety note
    '<div style="font-size:9px;color:#94a3b8;text-align:center;padding:6px 0 4px;line-height:1.4">' +
    (zh ? '本报告仅展示可复现信号，不构成法律结论。' : 'Report shows reproducible signals only, not a legal conclusion.') +
    '</div>' +

    '</div>'; // end card container

  const node = document.getElementById('result-card');
  if (node) node.innerHTML = html;
}
/* Alias for compatibility — both modes use renderCard */
function renderQuickReport(result, formData) { renderCard(result, formData); }
function renderFullReport(result, formData) { renderCard(result, formData); }

/* ═══════════════════════════════════════════════════════
   Markdown report — kept separate from visual card
   ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   Markdown copy
   ═══════════════════════════════════════════════════════ */
function buildMarkdownReport(result, formData) {
  const lang = getDocLang();
  const zh = lang !== 'en';
  const scored = result._scored;
  const dims = scored ? scored.dims : {};
  const conn = result.connectivity || {};
  const isQuick = result.mode === 'quick';

  if (isQuick) {
    const qs = result._quickScore || getQuickFinding(result, lang);
    const reportLines = [
      `## API Doctor 验货单`,
      '',
      `**${zh ? '档位' : 'Grade'}:** ${qs.grade} | **${zh ? '分数' : 'Score'}:** ${qs.score} | **${zh ? '结论' : 'Finding'}:** ${qs.mainFinding}`,
      '',
      `**${zh ? '风险标签' : 'Risk Chips'}:** ${(qs.riskChips || []).join(', ')}`,
      `**${zh ? '报告 ID' : 'Report ID'}:** ${result.reportId}`,
      `https://aiapidoctor.com/`,
      '',
      `### ${zh ? '技术摘要' : 'Technical Summary'}`,
      `| ${zh ? '项目' : 'Item'} | ${zh ? '值' : 'Value'} |`,
      `|------|----|`,
      `| Base URL | ${formData.baseUrl || '—'} |`,
      `| Model | ${formData.model || '—'} |`,
      `| Interface | ${formData.interfaceType || '—'} |`,
      `| HTTP | ${conn.status || '—'} |`,
      `| Latency | ${conn.latency ? conn.latency + 'ms' : '—'} |`,
      `| Visible Output | ${(conn.visibleOutputStatus || 'absent') === 'present' ? 'Yes' : (conn.visibleOutputStatus === 'parser_unknown' ? 'Parser Unknown' : 'No')} |`,
      `| completion_tokens | ${conn.completionTokens ?? '—'} |`,
      `| total_tokens | ${conn.totalTokens ?? '—'} |`,
      `| cached_tokens | ${conn.cachedTokens ?? '—'} |`,
      '',
      `### ${zh ? '安全说明' : 'Safety Notice'}`,
      zh ? '本报告不包含 API Key，只展示本次测试中的可复现信号，不证明服务商故意多扣费，也不证明模型真假。' : 'This report does not contain API Key and only shows reproducible signals from this test. It does not prove intentional overcharging or model authenticity.',
      '',
      `${zh ? '由 AI API Doctor 生成' : 'Generated by AI API Doctor'} · ${result.timestamp}`
    ].filter(Boolean).join('\n');
    return reportLines;
  }

  const mainFinding = scored
    ? (zh ? getMainFinding(result, dims) : getMainFindingEn(result, dims))
    : (result._quickScore ? result._quickScore.mainFinding : getQuickFinding(result, lang).mainFinding);
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
    connectivity: zh ? '模型联通' : 'Model Connectivity',
    usage: zh ? 'usage 完整性' : 'Usage Integrity',
    billing: zh ? '扣费完整性' : 'Billing Integrity',
    cache: zh ? '缓存命中' : 'Cache Hit',
    price: zh ? '价格核对' : 'Price Audit',
  };

  const stateLabels = {
    pass: zh ? '通过' : 'Pass',
    warn: zh ? '需复查' : 'Needs Review',
    fail: zh ? '异常' : 'Fail',
    blocked: zh ? '受阻' : 'Blocked',
    skipped: zh ? '未检测' : 'Skipped',
  };

  const testedDimLines = Object.entries(dimLabels).map(([key, label]) => {
    const d = dims[key];
    if (!d || d.state === 'skipped') return null;
    return `| ${label} | ${stateLabels[d.state] || '—'} |`;
  }).filter(Boolean).join('\n');

  const lines = [
    `## API Doctor 完整验货分`,
    '',
    `**${zh ? '综合分' : 'Overall Score'}:** ${overallScore !== null ? overallScore + '/100' : '—'} | **${zh ? '主要结论' : 'Main Finding'}:** ${mainFinding}`,
    `**${zh ? '报告 ID' : 'Report ID'}:** ${result.reportId}`,
    '',
    `### ${zh ? '检测维度' : 'Test Dimensions'}`,
    `| ${zh ? '维度' : 'Dimension'} | ${zh ? '结果' : 'Result'} |`,
    `|------|------|`,
    testedDimLines,
    '',
    modelScore !== null && result.modelSanity ? `### ${zh ? '模型表现分' : 'Model Performance'}\n${sanityLines}` : '',
    '',
    `### ${zh ? '技术摘要' : 'Technical Summary'}`,
    `| ${zh ? '项目' : 'Item'} | ${zh ? '值' : 'Value'} |`,
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
    `### ${zh ? '安全说明' : 'Safety Notice'}`,
    zh ? '本报告不包含 API Key，只展示本次测试中的可复现信号，不证明服务商故意多扣费。模型表现分仅用于发现明显异常或降智风险，不代表官方模型排名。' : 'This report does not contain API Key and only shows reproducible signals from this test. It does not prove intentional overcharging or model authenticity. Model score is for anomaly detection only, not an official ranking.',
    '',
    `${zh ? '由 AI API Doctor 生成' : 'Generated by AI API Doctor'} · ${result.timestamp}`
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
  const isQuick = result.mode === 'quick';
  const mainFinding = isQuick
    ? (result._quickScore || getQuickFinding(result, lang)).mainFinding
    : (scored ? (zh ? getMainFinding(result, dims) : getMainFindingEn(result, dims)) : '');
  const overallScore = scored ? scored.overallScore : null;
  const apiScore = scored ? scored.score : null;
  const modelScore = scored ? scored.modelSanityScore : null;
  const coverage = scored ? scored.coverage : 0;

  const stateLabels = {
    pass: zh ? '通过验货' : 'Passed',
    warn: zh ? '有坑' : 'Risky',
    fail: zh ? '疑似异常' : 'Suspect',
    blocked: zh ? '验不出真身' : 'Unverified',
  };

  const dimLabels = {
    connectivity: zh ? '模型联通' : 'Model Connectivity',
    usage: zh ? 'usage 完整性' : 'Usage Integrity',
    billing: zh ? '扣费完整性' : 'Billing Integrity',
    cache: zh ? '缓存命中' : 'Cache Hit',
    price: zh ? '价格核对' : 'Price Audit',
    modelSanity: zh ? '模型表现' : 'Model Performance',
  };

  const greeting = zh ? '您好，我用 API Doctor 做了一次黑盒验货，结果如下：' : 'Hello, I ran a black-box API check with API Doctor. Here are the results:';
  const keyEvidence = zh ? '关键证据：' : 'Key Evidence:';
  const explanation = zh ? '本报告只展示本次测试中的可复现信号，不证明服务商主观故意，也不构成法律结论。' : 'This report only shows reproducible signals from this test. It does not prove provider intent and is not a legal conclusion.';
  const generatedBy = zh ? '— API Doctor 黑盒验货 · aiapidoctor.com' : '— API Doctor Black-box Check · aiapidoctor.com';

  const reportLines = [
    greeting,
    '',
    overallScore !== null && !isQuick
      ? `${zh ? 'API Doctor 完整验货分' : 'API Doctor Full Score'}：${overallScore}/100（${zh ? '覆盖度' : 'Coverage'} ${coverage}%）`
      : `${zh ? 'API Doctor 验货单' : 'API Doctor Scorecard'}：${mainFinding}`,
    `${zh ? '一句话结论' : 'Main Finding'}：${mainFinding}`,
    `${zh ? 'Report ID' : '报告 ID'}：${result.reportId}`,
  ];

  if (!isQuick && scored) {
    reportLines.push(
      '',
      zh ? '检测结果：' : 'Test Results:',
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
   Image export — always uses short card format (Playground v4)
   ═══════════════════════════════════════════════════════ */
function buildShortCardHTML(result, formData) {
  const lang = getDocLang();
  const zh = lang !== 'en';
  const conn = result.connectivity || {};
  const isQuick = result.mode === 'quick';
  const qs = isQuick ? (result._quickScore || getQuickFinding(result, lang)) : null;
  const scored = result._scored;
  const hasBalanceDelta = result.billing && (result.billing.beforeBalance !== undefined || result.billing.afterBalance !== undefined);
  const balanceReduced = hasBalanceDelta && result.billing.beforeBalance !== undefined && result.billing.afterBalance !== undefined && result.billing.afterBalance < result.billing.beforeBalance;
  const hasOutput = conn.visibleOutputStatus === 'present';
  const hasUsage = conn.totalTokens != null;
  const barOutput = { label: zh ? '有无产物' : 'Output', state: hasOutput ? 'pass' : 'fail', score: hasOutput ? 100 : 0, detail: hasOutput ? (zh ? '有文字产出' : 'Has output') : (zh ? '没出字' : 'No output') };
  const barBilling = balanceReduced ? { label: zh ? '扣没扣钱' : 'Charged?', state: 'fail', score: 0, detail: zh ? '余额少了' : 'Balance reduced' } : hasBalanceDelta ? { label: zh ? '扣没扣钱' : 'Charged?', state: 'pass', score: 100, detail: zh ? '没扣钱' : 'No charge' } : { label: zh ? '扣没扣钱' : 'Charged?', state: 'skipped', score: 0, detail: zh ? '网页没读余额' : 'No balance read' };
  const barUsage = { label: zh ? '账单明细' : 'Token Details', state: hasUsage ? 'pass' : 'fail', score: hasUsage ? 100 : 0, detail: hasUsage ? (zh ? '有 token' : 'Has tokens') : (zh ? '无账单明细' : 'No token data') };
  const barStream = { label: zh ? '流式会不会炸' : 'Streaming', state: 'skipped', score: 0, detail: zh ? '需完整验货' : 'Needs full check' };
  const barModel = result.modelSanity && result.modelSanity.overallScore !== null ? (function(){ var ms=result.modelSanity.overallScore; return { label: zh ? '模型有没有缩水' : 'Model Shrinkage', state: ms>=70?'pass':ms>=50?'warn':'fail', score: ms, detail: zh?(result.modelSanity.label||'正常'):(result.modelSanity.labelEn||'OK') }; })() : { label: zh ? '模型有没有缩水' : 'Model Shrinkage', state: 'skipped', score: 0, detail: zh ? '需完整验货' : 'Needs full check' };
  const barConn = (function(){ var st=scored?.dims?.connectivity?.state??'skipped'; var s=conn.status; if(st==='blocked') return { label: zh?'能否连上':'Connection', state:'warn', score: scored?.dims?.connectivity?.score??0, detail: zh?'CORS 限制':'CORS Blocked' }; if(!s) return { label: zh?'能否连上':'Connection', state:'fail', score:0, detail: zh?'无响应':'No response' }; if(s>=200&&s<300) return { label: zh?'能否连上':'Connection', state:'pass', score:100, detail:'HTTP 200' }; return { label: zh?'能否连上':'Connection', state:'fail', score:0, detail:'HTTP '+s }; })();
  var bars = [barOutput, barBilling, barUsage, barStream, barModel, barConn];
  var verdict, grade, chips, conclusion;
  if(!hasOutput&&balanceReduced){verdict=zh?'空跑扣费':'Empty-Run Fraud';grade='F';chips=[zh?'没产物':'No Output',zh?'已扣钱':'Charged',zh?'高危':'High Risk'];conclusion=zh?'没拿到东西，钱却扣了，请仔细核查。':'No output, but charged. Verify carefully.';}
  else if(!hasOutput&&hasUsage){verdict=zh?'返回废包':'Empty Response';grade='D';chips=[zh?'没产物':'No Output',zh?'有账单':'Has Tokens',zh?'扣钱没验':'Charge Unverified'];conclusion=zh?'返回无效内容，账单明细无法核验。':'Invalid content returned, charges unverified.';}
  else if(!hasOutput&&!hasUsage){verdict=zh?'疑似空跑':'Suspected Empty Run';grade='D';chips=[zh?'没产物':'No Output',zh?'没账单':'No Tokens',zh?'扣钱没验':'Charge Unverified'];conclusion=zh?'返回无效内容，无账单明细，扣费无法核验。':'Invalid content, no tokens, charges unverified.';}
  else if(barConn.state==='blocked'){verdict=zh?'连不上':'Cannot Connect';grade='U';chips=[zh?'浏览器拦截':'Browser Blocked'];conclusion=zh?'浏览器跨域限制，无法完成检测。':'Browser CORS restriction blocks the check.';}
  else if(barModel.state==='fail'){verdict=zh?'模型缩水':'Model Shrinkage';grade='C';chips=[zh?'表现不对':'Perf. Anomaly',zh?'需复查':'Needs Review'];conclusion=zh?'模型输出异常，表现与标称不符。':'Model output anomaly detected.';}
  else if(barModel.state==='warn'){verdict=zh?'模型存疑':'Model Uncertain';grade='C';chips=[zh?'指令不稳':'Unstable',zh?'需复查':'Needs Review'];conclusion=zh?'模型输出不太稳定，建议复查。':'Model output is unstable, recommend review.';}
  else if(barBilling.state==='fail'){verdict=zh?'扣费异常':'Billing Anomaly';grade='D';chips=[zh?'已扣钱':'Charged',zh?'需复查':'Needs Review'];conclusion=zh?'扣费证据显示异常，请核查账单。':'Billing evidence shows anomaly.';}
  else if(!hasOutput){verdict=zh?'无产物':'No Output';grade='D';chips=[zh?'没产物':'No Output'];conclusion=zh?'未获得有效输出。':'No valid output received.';}
  else if(barUsage.state!=='pass'){verdict=zh?'账单异常':'Token Anomaly';grade='C';chips=[zh?'账单不明':'Tokens Unclear'];conclusion=zh?'有产出，但账单明细不完整。':'Has output but token details incomplete.';}
  else if(barBilling.state==='pass'){verdict=zh?'硬货':'Solid';grade=barConn.state==='pass'&&barOutput.state==='pass'&&barUsage.state==='pass'?'A':'B';chips=[zh?'有产物':'Has Output',zh?'账单完整':'Tokens OK',zh?'能对账':'Verified'];conclusion=zh?'有产物、有账单明细，扣钱也能对上。':'Has output and tokens, charges verified.';}
  else{verdict=zh?'能用':'Usable';grade=barConn.state==='pass'?'B':'C';chips=[zh?'有产物':'Has Output',zh?'账单完整':'Tokens OK'];conclusion=zh?'有产物，基础功能可用。':'Has output, basic functions work.';}
  var activeBars = bars.filter(function(b){return b.state!=='skipped';});
  var totalScore = activeBars.length>0?Math.round(activeBars.reduce(function(s,b){return s+(b.score||0);},0)/activeBars.length):(qs?qs.score:0);
  var gradeColor={A:'#16a34a',B:'#3b82f6',C:'#f59e0b',D:'#f97316',F:'#dc2626',U:'#64748b'}[grade]||'#94a3b8';
  var gradeBg={A:'#dcfce7',B:'#eff6ff',C:'#fef9c3',D:'#ffedd5',F:'#fee2e2',U:'#f1f5f9'}[grade]||'#f1f5f9';
  function barColor(s){return s==='pass'?'#16a34a':s==='fail'?'#dc2626':s==='warn'?'#f59e0b':'#94a3b8';}
  function barBg(s){return s==='pass'?'#dcfce7':s==='fail'?'#fee2e2':s==='warn'?'#fef9c3':'#f1f5f9';}
  function barPct(s){return s==='pass'?100:s==='fail'?0:s==='warn'?50:0;}
  function escH(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function pill(s){var c=barColor(s);var t=s==='pass'?(zh?'通过':'Pass'):s==='fail'?(zh?'失败':'Fail'):s==='warn'?(zh?'警告':'Warn'):(zh?'未验':'N/A');return'<span style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:8px;font-weight:700;color:'+c+';background:'+barBg(s)+';white-space:nowrap">'+t+'</span>';}
  function row(b){var pct=barPct(b.state);var c=barColor(b.state);var bg=barBg(b.state);return'<div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid #f1f5f9"><div style="width:86px;font-size:10px;font-weight:600;color:#374151;flex-shrink:0">'+b.label+'</div><div style="flex:1;height:7px;background:'+(b.state==='skipped'?'#f1f5f9':bg)+';border-radius:4px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+(b.state==='skipped'?'#cbd5e1':c)+';border-radius:4px"></div></div><div style="width:38px;flex-shrink:0;text-align:center">'+pill(b.state)+'</div><div style="width:68px;text-align:right;font-size:9px;color:#94a3b8;flex-shrink:0">'+escH(b.detail)+'</div></div>';}
  return'<div style="max-width:540px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;background:#f8fafc;padding:32px 36px;box-sizing:border-box">'+
    '<div style="background:#0f172a;border-radius:20px;padding:16px 18px 14px;margin-bottom:10px">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">'+
    '<div><div style="font-size:15px;font-weight:800;color:#fff;letter-spacing:-0.2px">API Doctor</div><div style="font-size:10px;color:#94a3b8;margin-top:1px">'+(zh?'中转站黑盒验货':'Relay API Black-box Check')+'</div></div>'+
    '<div style="background:'+gradeBg+';border-radius:8px;padding:4px 10px;text-align:center;flex-shrink:0"><div style="font-size:22px;font-weight:900;color:'+gradeColor+';line-height:1">'+grade+'</div><div style="font-size:8px;color:'+gradeColor+';font-weight:600;margin-top:1px">'+(zh?'档':'Grade')+'</div></div>'+
    '</div>'+
    '<div style="text-align:center;margin-bottom:8px"><div style="font-size:56px;font-weight:900;color:'+gradeColor+';line-height:1">'+totalScore+'</div><div style="font-size:13px;font-weight:700;color:'+gradeColor+';margin-top:3px">'+escH(verdict)+'</div></div>'+
    '<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center;margin-bottom:4px">'+chips.map(function(c){return'<span style="background:'+gradeBg+';color:'+gradeColor+';font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap">'+escH(c)+'</span>';}).join('')+'</div>'+
    '<div style="font-size:11px;color:#94a3b8;text-align:center;margin-top:6px;line-height:1.4">'+escH(conclusion)+'</div>'+
    '</div>'+
    '<div style="background:#fff;border-radius:16px;padding:12px 14px;margin-bottom:10px">'+
    '<div style="font-size:10px;font-weight:700;color:#0f172a;margin-bottom:2px">'+(zh?'为什么是 '+totalScore+' 分？':'Why '+totalScore+' points?')+'</div>'+
    '<div style="font-size:10px;color:#94a3b8;margin-bottom:8px">'+(zh?'先看有没有产物，再看扣没扣钱':'Check output first, then billing')+'</div>'+
    bars.map(row).join('')+
    '</div>'+
    '<div style="text-align:center;font-size:11px;color:#94a3b8;padding:4px 0 6px">'+(zh?'模型':'Model')+': '+escH(formData.model||'—')+' &nbsp;|&nbsp; '+(zh?'报告 ID':'Report ID')+': '+result.reportId+' &nbsp;|&nbsp; aiapidoctor.com</div>'+
    '<div style="font-size:9px;color:#94a3b8;text-align:center;padding:6px 0 4px;line-height:1.4">'+(zh?'本报告仅展示可复现信号，不构成法律结论。':'Report shows reproducible signals only, not a legal conclusion.')+'</div>'+
    '</div>';
}

async function saveDiagnosticImage() {
  var result = window.Doctor ? window.Doctor._result : null;
  var formData = window.Doctor ? window.Doctor._formData : null;
  try {
    await new Promise(requestAnimationFrame);
    await document.fonts.ready.catch(function(){});
    if (typeof htmlToImage === 'undefined') { showToast('Image generation failed, please use browser screenshot.'); return; }
    var clone = document.createElement('div');
    clone.innerHTML = buildShortCardHTML(result, formData);
    clone.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:540px;background:#f8fafc;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;box-sizing:border-box';
    document.body.appendChild(clone);
    var dataUrl = await htmlToImage.toPng(clone, { pixelRatio: 2, cacheBust: true, backgroundColor: '#f8fafc', width: 540 });
    document.body.removeChild(clone);
    downloadDataUrl(dataUrl, 'aiapidoctor-' + Date.now() + '.png');
    showToast(getDocLang() !== 'en' ? '图片已保存' : 'Image saved');
  } catch (err) {
    showToast(getDocLang() !== 'en' ? '保存失败，请用浏览器截图' : 'Image failed, use browser screenshot.');
  }
}

function buildQuickImageNode(result, formData) {
  var node = document.createElement('div');
  node.innerHTML = buildShortCardHTML(result, formData);
  return node;
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

  const headerText = zh ? `读取到 ${total} 个模型，点击填入：` : `Found ${total} models, click to fill:`;
  const searchPlaceholder = zh ? '搜索...' : 'Search...';

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
      if (urlEl) {
        let url = parsed.baseUrl;
        if (!url.endsWith('/v1')) url = url + '/v1';
        urlEl.value = url;
      }
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
      ? (zh ? '开始验货' : 'Start Check')
      : (zh ? '开始完整验货' : 'Start Full Check');

    const runBtn = document.getElementById('doctor-run-btn');
    if (runBtn) {
      runBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> ${btnText}`;
    }

    if (typeof updateCostEstimate === 'function') updateCostEstimate();
    if (typeof updateCostHint === 'function') updateCostHint();
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
    if (typeof updateCostHint === 'function') updateCostHint();
  },

  togglePrice(checkbox) {
    if (typeof updateCostEstimate === 'function') updateCostEstimate();
    if (typeof updateCostHint === 'function') updateCostHint();
  },

  toggleSanity(checkbox) {
    if (typeof updateCostEstimate === 'function') updateCostEstimate();
    if (typeof updateCostHint === 'function') updateCostHint();
  },

  async readModelList() {
    const baseUrl = (document.getElementById('doctor-base-url')?.value || '').trim();
    const apiKey = (document.getElementById('doctor-api-key')?.value || '').trim();
    const lang = getDocLang();
    const zh = lang !== 'en';

    if (!baseUrl) { showToast(zh ? '请先填写 Base URL' : 'Please fill in Base URL first'); return; }
    if (!apiKey) { showToast(zh ? '请先填写 API Key' : 'Please fill in API Key first'); return; }

    const btn = document.getElementById('read-models-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = zh ? '读取中...' : 'Reading...';
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
      btn.textContent = zh ? '自动读取模型' : 'Fetch Models';
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
      || (() => {
        try {
          const urlStr = baseUrl.startsWith('http') ? baseUrl : 'https://' + baseUrl;
          return new URL(urlStr).hostname.split(':')[0];
        } catch {
          return 'Unknown';
        }
      })();

    const lang = getDocLang();
    const zh = lang !== 'en';

    if (!baseUrl) { showToast(zh ? '请填写 Base URL' : 'Please fill in Base URL'); return; }
    if (!apiKey) { showToast(zh ? '请填写 API Key' : 'Please fill in API Key'); return; }
    if (!model) { showToast(zh ? '请填写 Model ID' : 'Please fill in Model ID'); return; }

    saveConfigToStorage({ baseUrl, providerName, model, interfaceType });

    if (this._controller) this._controller.abort();
    this._controller = new AbortController();

    const isQuick = this._mode === 'quick';
    const btnRunningLabel = zh
      ? '验货中...'
      : 'Checking...';

    const btn = document.getElementById('doctor-run-btn');
    const clearBtn = document.getElementById('doctor-clear-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="status-dot"></span>${btnRunningLabel}`;
    }
    if (clearBtn) clearBtn.disabled = true;

    // Clear result card and show loading state so old score doesn't flash
    const lang2 = document.documentElement.lang;
    const zh2 = lang2 !== 'en';
    const resultNode = document.getElementById('result-card');
    if (resultNode) {
      resultNode.innerHTML = `
        <div class="result-empty-state" style="font-size:14px">
          <span class="status-dot" style="display:inline-block;vertical-align:middle;margin-right:6px"></span>
          ${zh2 ? '正在检测...' : 'Checking...'}
        </div>`;
    }

    this.showProgress('running');

    const priceData = {
      inputPrice: document.getElementById('price-input')?.value,
      outputPrice: document.getElementById('price-output')?.value,
      cachedReadPrice: document.getElementById('price-cached-read')?.value,
      cachedWritePrice: document.getElementById('price-cached-write')?.value,
      actualCost: document.getElementById('price-actual')?.value
    };

    this._formData = { baseUrl, apiKey, model, interfaceType, providerName };

    const btnLabelReset = isQuick
      ? (zh ? '开始验货' : 'Start Check')
      : (zh ? '开始完整验货' : 'Start Full Check');

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
        showToast(zh ? '检测超时（90秒），请重试或使用 Chrome 插件' : 'Diagnosis timed out (90s). Please retry or use Chrome extension.');
      } else {
        console.error('[API Doctor run error]', err?.message || err);
        showToast(zh ? `验货失败：${err?.message || '未知错误'}` : `Check failed: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      // Always re-enable buttons regardless of outcome
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> ${btnLabelReset}`;
      }
      if (clearBtn) clearBtn.disabled = false;
    }

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
      zh ? '模型联通检测' : 'Model Connectivity Check',
      zh ? 'usage 完整性' : 'Usage Integrity',
      mode === 'full' && document.getElementById('cache-test-toggle')?.checked ? (zh ? '缓存命中检测' : 'Cache Hit Test') : null,
      mode === 'full' && document.getElementById('price-test-toggle')?.checked ? (zh ? '价格核对' : 'Price Audit') : null,
      mode === 'full' && document.getElementById('sanity-test-toggle')?.checked ? (zh ? '模型表现检测（5项）' : 'Model Performance Test (5 dims)') : null,
      zh ? '计算验货分' : 'Calculating Score'
    ].filter(Boolean);

    const container = document.getElementById('diag-progress');
    if (!container) return;

    if (state === 'running') {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
          ${steps.map((s, i) => `
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#64748b" id="step-${i}">
              <span class="status-dot"></span>
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
    if (typeof updateCostHint === 'function') updateCostHint();
    document.getElementById('result-card').innerHTML = `
      <div class="result-empty-state">
        ${zh ? '填写 Base URL、API Key 和 Model ID 后开始检测。' : 'Enter Base URL, API Key, and Model ID to start.'}
      </div>`;
    this._result = null;
    this._formData = null;
    if (this._controller) this._controller.abort();
    showToast(zh ? '已清空' : 'Cleared');
  },

  async saveImage() {
    await saveDiagnosticImage();
  },

  copyMarkdown() {
    if (!this._result) { showToast(getDocLang() !== 'en' ? '请先进行检测' : 'Please run diagnosis first'); return; }
    const md = buildMarkdownReport(this._result, this._formData);
    copyToClipboard(md, getDocLang() !== 'en' ? 'Markdown 已复制' : 'Markdown copied');
  },

  copyForProvider() {
    if (!this._result) { showToast(getDocLang() !== 'en' ? '请先进行检测' : 'Please run diagnosis first'); return; }
    const text = buildProviderReport(this._result, this._formData);
    copyToClipboard(text, getDocLang() !== 'en' ? '报告文本已复制，可发给站长' : 'Report copied, can send to provider');
  },

  copyOneLine() {
    if (!this._result) { showToast(getDocLang() !== 'en' ? '请先进行检测' : 'Please run diagnosis first'); return; }
    const result = this._result;
    const lang = getDocLang();
    const zh = lang !== 'en';

    if (result.mode === 'quick') {
      const qs = result._quickScore || getQuickFinding(result, lang);
      const vos = result.connectivity?.visibleOutputStatus || 'absent';
      // Build a concise label tag based on vos
      let tag = '';
      if (qs.grade === 'C') {
        if (vos === 'parser_unknown') {
          tag = zh ? '｜输出解析异常' : ' | Output Parser Unknown';
        } else if (vos === 'absent' && result.connectivity?.totalTokens != null) {
          tag = zh ? '｜返回废包' : ' | Dead Output';
        }
      }
      const text = zh
        ? `我的 API Doctor 验货：${qs.grade}档 ${qs.score}分${tag}｜${qs.mainFinding}｜报告 ID：${result.reportId}\nhttps://aiapidoctor.com/`
        : `My API Doctor score: ${qs.grade} ${qs.score}/100${tag} | ${qs.mainFinding} | Report ID: ${result.reportId}\nhttps://aiapidoctor.com/`;
      copyToClipboard(text, zh ? '晒分已复制' : 'Score copied');
    } else {
      const scored = result._scored;
      const dims = scored.dims;
      const coverage = scored.coverage;
      const mainFinding = zh ? getMainFinding(result, dims) : getMainFindingEn(result, dims);
      const overallScore = scored.overallScore;
      const text = zh
        ? `我的 API Doctor 完整验货分：${overallScore !== null ? overallScore : '—'}分｜${mainFinding}｜报告 ID：${result.reportId}\nhttps://aiapidoctor.com/`
        : `My API Doctor Full Score: ${overallScore !== null ? overallScore : '—'}/100 | ${mainFinding} | Report ID: ${result.reportId}\nhttps://aiapidoctor.com/`;
      copyToClipboard(text, zh ? '晒分已复制' : 'Score copied');
    }
  },

  copyForum() {
    if (!this._result) { showToast(getDocLang() !== 'en' ? '请先进行检测' : 'Please run diagnosis first'); return; }
    const result = this._result;
    const lang = getDocLang();
    const zh = lang !== 'en';

    if (result.mode === 'quick') {
      const qs = result._quickScore || getQuickFinding(result, lang);
      const text = [
        zh ? '我测了一下 API Doctor：' : 'I ran an API Doctor check:',
        `API Doctor 验货：${qs.grade}档 ${qs.score}分｜${qs.mainFinding}`,
        `${zh ? '报告 ID' : 'Report ID'}：${result.reportId}`,
        `https://aiapidoctor.com/`
      ].join('\n');
      copyToClipboard(text, zh ? '论坛回复已复制' : 'Forum reply copied');
    } else {
      const scored = result._scored;
      const dims = scored.dims;
      const coverage = scored.coverage;
      const mainFinding = zh ? getMainFinding(result, dims) : getMainFindingEn(result, dims);
      const overallScore = scored.overallScore;
      const text = [
        zh ? '我测了一下 API Doctor：' : 'I tested with API Doctor:',
        `${zh ? 'API Doctor 完整验货分' : 'API Doctor Full Score'}：${overallScore !== null ? overallScore + '/100' : '—'}（${zh ? '覆盖度' : 'Coverage'} ${coverage}%）`,
        `${zh ? '主要结论' : 'Main Finding'}：${mainFinding}`,
        `${zh ? '报告 ID' : 'Report ID'}：${result.reportId}`,
        `https://aiapidoctor.com/`
      ].join('\n');
      copyToClipboard(text, zh ? '论坛回复已复制' : 'Forum reply copied');
    }
  }
};

/* ═══════════════════════════════════════════════════════
   Helpers — debounce, parse feedback
   ═══════════════════════════════════════════════════════ */
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function showParseResult(result, textarea) {
  if (!textarea) textarea = document.getElementById('doctor-conn-info');
  if (!textarea) return;
  // Remove old feedback
  const old = textarea.parentElement.querySelector('.parse-feedback');
  if (old) old.remove();
  const lang = getDocLang();
  const zh = lang !== 'en';

  const div = document.createElement('div');
  div.className = 'parse-feedback';
  if (result.success) {
    div.style.cssText = 'margin-top:6px;font-size:12px;color:#16a34a;font-weight:500;';
    div.textContent = zh
      ? '已解析：Base URL 和 API Key 已填入，请确认模型 ID。'
      : 'Parsed: Base URL and API Key filled. Please verify Model ID.';
  } else {
    div.style.cssText = 'margin-top:6px;font-size:12px;color:#b45309;font-weight:400;';
    div.textContent = zh
      ? '未识别连接信息，请手动填写 Base URL 和 API Key。'
      : 'Unrecognized. Please fill in Base URL and API Key manually.';
  }
  textarea.parentElement.appendChild(div);
  // Auto-hide success after 5s
  if (result.success) {
    setTimeout(() => { if (div.parentElement) div.remove(); }, 5000);
  }
}

function tryParseConnectionInfo() {
  const textarea = document.getElementById('doctor-conn-info');
  if (!textarea) return;
  const raw = textarea.value;
  if (!raw.trim()) return;

  const result = parseConnectionInfo(raw);
  const success = !!(result.baseUrl || result.apiKey);

  if (result.baseUrl) {
    const urlEl = document.getElementById('doctor-base-url');
    if (urlEl) {
      // Auto-add /v1 if missing
      let url = result.baseUrl;
      if (!url.endsWith('/v1')) url = url + '/v1';
      urlEl.value = url;
    }
  }
  if (result.apiKey) {
    const keyEl = document.getElementById('doctor-api-key');
    if (keyEl) keyEl.value = result.apiKey;
  }
  if (result.model) {
    const modelEl = document.getElementById('doctor-model');
    if (modelEl) modelEl.value = result.model;
  }

  showParseResult({ success }, textarea);
}

function bindConnectionParser() {
  const input = document.getElementById('doctor-conn-info');
  if (!input) return;
  const parse = debounce(() => {
    const result = parseConnectionInfo(input.value);
    const success = !!(result.baseUrl || result.apiKey);
    if (result.baseUrl) {
      const urlEl = document.getElementById('doctor-base-url');
      if (urlEl && !urlEl.value) {
        let url = result.baseUrl;
        if (!url.endsWith('/v1')) url = url + '/v1';
        urlEl.value = url;
      }
    }
    if (result.apiKey) {
      const keyEl = document.getElementById('doctor-api-key');
      if (keyEl && !keyEl.value) keyEl.value = result.apiKey;
    }
    if (result.model) {
      const modelEl = document.getElementById('doctor-model');
      if (modelEl && !modelEl.value) modelEl.value = result.model;
    }
  }, 300);
  input.addEventListener('input', parse);
  input.addEventListener('change', parse);
  input.addEventListener('paste', () => setTimeout(parse, 0));
}

/* ═══════════════════════════════════════════════════════
   data-action delegation — stable click binding
   ═══════════════════════════════════════════════════════ */
function bindDoctorEvents() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const lang = getDocLang();
    const zh = lang !== 'en';

    try {
      switch (action) {
        case 'run-check':
          event.preventDefault();
          Doctor.run();
          break;
        case 'clear-form':
          event.preventDefault();
          Doctor.clear();
          break;
        case 'set-full-check':
          event.preventDefault();
          Doctor.setMode('full');
          break;
        case 'set-quick-check':
          event.preventDefault();
          Doctor.setMode('quick');
          break;
        case 'fetch-models':
          event.preventDefault();
          Doctor.readModelList();
          break;
        case 'parse-connection':
          event.preventDefault();
          tryParseConnectionInfo();
          break;
        case 'show-manual-report':
          event.preventDefault();
          if (typeof switchTab === 'function') switchTab('manual');
          break;
        case 'show-auto-check':
          event.preventDefault();
          if (typeof switchTab === 'function') switchTab('local');
          break;
      }
    } catch (err) {
      console.error('[API Doctor action failed]', action, err?.message || err);
      if (typeof showToast === 'function') {
        showToast(zh ? `操作失败：${err?.message || '未知错误'}` : `Action failed: ${err?.message || 'Unknown error'}`);
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════
   Safe init — handles script timing edge cases
   ═══════════════════════════════════════════════════════ */
function showSafeInitError(err) {
  // Graceful degradation — don't throw, just log
  console.warn('[API Doctor init degraded]', err?.message || err);
}

function initDoctor() {
  try {
    bindDoctorEvents();
    bindConnectionParser();
    if (typeof updateCostHint === 'function') updateCostHint();
  } catch (err) {
    console.error('[API Doctor init failed]', err?.message || err, err?.stack);
    showSafeInitError(err);
  }
}

// Call initDoctor when DOM is ready, with document.readyState guard
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDoctor);
} else {
  // DOM already loaded (e.g. defer script or cached page)
  initDoctor();
}
