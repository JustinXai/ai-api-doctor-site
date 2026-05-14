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
   Detection Modes
   ═══════════════════════════════════════════════════════ */
const DETECTION_MODES = {
  quick: {
    label: 'Quick Check',
    labelEn: 'Quick Check',
    desc: '1 request — checks model connectivity and basic usage. Minimal cost.',
    descEn: '1 request — checks model connectivity and basic usage. Minimal cost.',
    requests: '~1 request, minimal cost',
    requestsEn: '~1 request, minimal cost',
    reqCount: 1,
    connectivity: true,
    usageIntegrity: true,
    cacheTest: false,
    priceAudit: false,
    modelSanity: false,
  },
  standard: {
    label: 'Standard Check',
    labelEn: 'Standard Check',
    desc: '~6 requests — adds model sanity tests. May consume a small amount of quota.',
    descEn: '~6 requests — adds model sanity tests. May consume a small amount of quota.',
    requests: '~6 requests, may consume a small amount of quota',
    requestsEn: '~6 requests, may consume a small amount of quota',
    reqCount: 6,
    connectivity: true,
    usageIntegrity: true,
    cacheTest: false,
    priceAudit: false,
    modelSanity: true,
  },
  deep: {
    label: 'Deep Check',
    labelEn: 'Deep Check',
    desc: '~8-10 requests — adds cache re-test and price audit. May cost more.',
    descEn: '~8-10 requests — adds cache re-test and price audit. May cost more.',
    requests: '~8-10 requests, cache test needs longer prompt, may cost more',
    requestsEn: '~8-10 requests, cache test needs longer prompt, may cost more',
    reqCount: 10,
    connectivity: true,
    usageIntegrity: true,
    cacheTest: true,
    priceAudit: false,
    modelSanity: true,
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
          if (text === 'C' || text.startsWith('C')) return 'correct_extra';
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
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

function generateReportId() {
  const now = new Date();
  const mmdd = String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return 'AID-' + mmdd + '-' + suffix;
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
   Score calculation — NEW LOGIC
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
const TOTAL_WEIGHT = Object.values(DIM_WEIGHTS).reduce((a, b) => a + b, 0); // 100

function newCalcScore(result) {
  const dims = {
    billing:      { state: result.billing?.state,       score: null },
    connectivity: { state: result.connectivity?.state,  score: null },
    usage:        { state: result.usageIntegrity?.state, score: null },
    cache:        { state: result.cacheHit?.state,       score: null },
    price:        { state: result.priceAudit?.state,     score: null },
    modelSanity:  { state: result.modelSanity?.state,   score: null },
  };

  // Determine state for each dimension
  // billing
  if (result.billing?.state) {
    dims.billing.state = result.billing.state;
  } else if (result.billing?.verdict) {
    const v = result.billing.verdict;
    if (v === 'failed_request_not_charged' || v === 'precharge_refunded') {
      dims.billing.state = 'pass'; dims.billing.score = 100;
    } else if (v === 'failed_request_charged' || v === 'empty_response_charged') {
      dims.billing.state = 'fail'; dims.billing.score = 0;
    } else if (v === 'raw_quota_unavailable') {
      dims.billing.state = 'skipped'; // web can't read raw quota
    } else {
      dims.billing.state = 'warn'; dims.billing.score = 50;
    }
  } else {
    dims.billing.state = 'skipped';
  }

  // connectivity
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

  // usage
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

  // cache
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

  // price
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

  // modelSanity
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

  // Calculate active weight and earned weight
  let activeWeight = 0, earnedWeight = 0;
  for (const [key, dim] of Object.entries(dims)) {
    if (dim.state === 'skipped' || dim.state === 'blocked') continue;
    activeWeight += DIM_WEIGHTS[key];
    if (dim.score !== null) earnedWeight += dim.score * DIM_WEIGHTS[key] / 100;
  }

  const score = activeWeight > 0 ? Math.round(earnedWeight / activeWeight * 100) : null;
  const coverage = Math.round(activeWeight / TOTAL_WEIGHT * 100);

  // Confidence
  let confidence = 'low';
  if (activeWeight >= 70) confidence = 'high';
  else if (activeWeight >= 40) confidence = 'medium';

  // Hero title based on coverage + any fail/warn
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

  // Model sanity score
  const modelSanityScore = dims.modelSanity.score !== null ? Math.round(dims.modelSanity.score) : null;

  // Overall: if model sanity tested, blend with api score
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
   Main finding — NEW LOGIC
   ═══════════════════════════════════════════════════════ */
function getMainFinding(result, dims) {
  // Priority: connectivity fail
  if (dims.connectivity?.state === 'fail') return '模型联通失败';
  if (dims.connectivity?.state === 'blocked') return '模型联通受阻（CORS 限制）';

  // Only connectivity pass, rest skipped
  const onlyConnPassed = dims.connectivity?.state === 'pass'
    && dims.usage?.state === 'skipped'
    && dims.billing?.state === 'skipped'
    && dims.cache?.state === 'skipped'
    && dims.price?.state === 'skipped'
    && dims.modelSanity?.state === 'skipped';
  if (onlyConnPassed) return '基础联通正常';

  // usage fail/missing
  if (dims.usage?.state === 'fail') return 'usage 返回不完整';
  if (dims.usage?.state === 'warn') return 'usage 返回需复查';

  // billing fail
  if (dims.billing?.state === 'fail') return '发现扣费异常风险';

  // cache
  if (dims.cache?.state === 'pass') return '缓存字段已返回';
  // don't mention cache skipped in mainFinding

  // modelSanity
  if (dims.modelSanity?.state === 'fail') return '发现模型表现异常';
  if (dims.modelSanity?.state === 'warn') return '模型表现需复查';

  // price fail
  if (dims.price?.state === 'fail') return '价格核对异常';

  // Default
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
   Core diagnostic runner
   ═══════════════════════════════════════════════════════ */
async function runDiagnosis(opts) {
  const { baseUrl, apiKey, model, interfaceType, signal, runCacheTest, runPriceTest, priceData, runSanityTest, modelTier } = opts;

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
    modelTier: modelTier || 'uncertain'
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
    result.connectivity.promptTokensDetails = usage.prompt_tokens_details || {};
    result.connectivity.cachedTokens = usage.prompt_tokens_details?.cached_tokens
      || usage.input_tokens_details?.cached_tokens
      || usage.cached_tokens
      || null;
    result.connectivity.finishReason = data.choices?.[0]?.finish_reason || data.stop_reason || null;
    result.connectivity.requestId = data.id || null;

    result.errorAttribution = getErrorAttribution(resp.status, false);

  } catch (err) {
    if (err.name === 'AbortError') {
      result.connectivity = { status: 0, latency: 0, error: 'timeout', state: 'fail' };
    } else {
      result.connectivity = { status: 0, latency: 0, error: 'cors_or_network', rawMessage: err.message, state: 'blocked' };
      result.errorAttribution = 'CORS / 浏览器拦截：网页无法直接读取当前站点的响应内容。这是浏览器的安全限制，不代表 API 本身不可用。建议手动填写 Model ID，或使用 Chrome 插件绕过此限制。';
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

  // ── Step 5: Billing integrity ───────────────────────
  result.billing = { verdict: 'raw_quota_unavailable', reason: '网页版无法自动读取 raw quota，请切换到手动报告模式填写原始额度。', state: 'skipped' };

  // ── Model Sanity Test ──────────────────────────────
  if (runSanityTest) {
    result.modelSanity = await runModelSanityTests({ baseUrl, apiKey, model, interfaceType, signal });
  }

  // ── New Score calculation ──────────────────────────
  const scored = newCalcScore(result);
  result._scored = scored;

  // ── Report Fingerprint ─────────────────────────────
  const fpData = {
    reportId: result.reportId,
    timestamp: result.timestamp,
    apiHealthScore: scored.score,
    modelSanityScore: scored.modelSanityScore,
    overallScore: scored.overallScore,
    coverage: scored.coverage,
    confidence: scored.confidence,
    connectivityState: result.connectivity?.state,
    usageState: result.usageIntegrity?.state,
    cacheState: result.cacheHit?.state,
    billingState: result.billing?.state,
    priceState: result.priceAudit?.state,
    modelSanityState: result.modelSanity ? 'tested' : 'skipped',
    modelTier: result.modelTier
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
  if (!conn || conn.status === 0) return { state: 'skipped' };
  if (conn.status >= 400) return { state: 'skipped' };
  if (!conn.visibleLength) return { state: 'skipped' };

  const hasPrompt = conn.promptTokens != null;
  const hasCompletion = conn.completionTokens != null;
  const hasTotal = conn.totalTokens != null;

  if (hasPrompt && hasCompletion && hasTotal) return { state: 'pass', detail: 'complete' };
  if (hasTotal) return { state: 'warn', detail: 'incomplete' };
  return { state: 'fail', detail: 'missing' };
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
   Report rendering — DYNAMIC GROUPED DISPLAY
   ═══════════════════════════════════════════════════════ */
function renderDiagnosticReport(result, formData) {
  const scored = result._scored;
  const dims = scored.dims;
  const conn = result.connectivity || {};
  const overallScore = scored.overallScore;
  const apiScore = scored.score;
  const modelScore = scored.modelSanityScore;
  const coverage = scored.coverage;
  const confidence = scored.confidence;
  const heroTitle = scored.heroTitle;
  const heroStatus = scored.heroStatus;
  const heroStatusLabel = scored.heroStatusLabel;
  const heroSub = scored.heroSub;
  const mainFinding = getMainFinding(result, dims);
  const reportId = result.reportId;
  const reportFingerprint = result.reportFingerprint || '';
  const modelTier = result.modelTier || 'uncertain';

  const tierLabelMap = { uncertain: '不确定', light: '轻量', standard: '标准', advanced: '高级' };
  const tierDisplay = tierLabelMap[modelTier] || '不确定';

  let modelTierComment = '';
  if (modelScore !== null) {
    if (modelTier === 'light') {
      if (modelScore >= 60 && modelScore <= 75) modelTierComment = '基本符合轻量模型预期';
      else if (modelScore < 60) modelTierComment = '低于轻量模型预期';
      else modelTierComment = '高于轻量模型预期';
    } else if (modelTier === 'standard') {
      if (modelScore >= 60 && modelScore <= 75) modelTierComment = '模型表现需复查';
      else if (modelScore < 60) modelTierComment = '低于标准模型预期';
      else modelTierComment = '高于标准模型预期';
    } else if (modelTier === 'advanced') {
      if (modelScore < 80) modelTierComment = '低于高级模型预期，建议复查';
      else modelTierComment = '符合高级模型预期';
    }
  }

  // ── Build tested / untested dimension lists ──
  const testedDims = [];
  const untestedDims = [];

  const dimDefs = [
    {
      key: 'connectivity',
      label: '模型联通',
      weight: DIM_WEIGHTS.connectivity,
      getState: () => dims.connectivity?.state,
      getDetail: () => {
        if (!conn) return '—';
        if (conn.error === 'cors_or_network') return 'CORS 限制';
        if (conn.error === 'timeout') return '超时';
        if (!conn.status) return '无响应';
        if (conn.status >= 200 && conn.status < 300) return conn.visibleLength > 0 ? '正常' : '空回复';
        return 'HTTP ' + conn.status;
      }
    },
    {
      key: 'usage',
      label: 'usage 完整性',
      weight: DIM_WEIGHTS.usage,
      getState: () => dims.usage?.state,
      getDetail: () => {
        const d = result.usageIntegrity?.detail;
        return { complete: '完整', incomplete: '不完整', missing: '缺失' }[d] || '—';
      }
    },
    {
      key: 'billing',
      label: '扣费完整性',
      weight: DIM_WEIGHTS.billing,
      getState: () => dims.billing?.state,
      getDetail: () => {
        const v = result.billing?.verdict;
        return {
          failed_request_not_charged: '未扣费',
          precharge_refunded: '已返还',
          failed_request_charged: '扣费异常',
          empty_response_charged: '扣费异常',
          raw_quota_unavailable: '无法判断'
        }[v] || '—';
      }
    },
    {
      key: 'cache',
      label: '缓存命中',
      weight: DIM_WEIGHTS.cache,
      getState: () => dims.cache?.state,
      getDetail: () => {
        const s = result.cacheHit?.status;
        return { hit: '命中', no_hit: '未命中', error: '检测失败' }[s] || '—';
      }
    },
    {
      key: 'price',
      label: '价格核对',
      weight: DIM_WEIGHTS.price,
      getState: () => dims.price?.state,
      getDetail: () => {
        const s = result.priceAudit?.status;
        return { normal: '正常', needs_review: '需复查', anomaly_risk: '异常', no_usage: '无 usage' }[s] || '—';
      }
    },
    {
      key: 'modelSanity',
      label: '模型表现',
      weight: DIM_WEIGHTS.modelSanity,
      getState: () => dims.modelSanity?.state,
      getDetail: () => {
        if (!result.modelSanity) return '—';
        return result.modelSanity.label + '（' + result.modelSanity.overallScore + '分）';
      }
    }
  ];

  for (const def of dimDefs) {
    const state = def.getState();
    const detail = def.getDetail();
    const item = { key: def.key, label: def.label, state, detail, weight: def.weight };

    if (state === 'skipped') {
      untestedDims.push({ ...item, untestedReason: '未开启' });
    } else {
      testedDims.push(item);
    }
  }

  const stateColor = { pass: '#16a34a', warn: '#d97706', fail: '#dc2626', blocked: '#64748b', skipped: '#94a3b8' };
  const stateBg = { pass: '#dcfce7', warn: '#fef3c7', fail: '#fee2e2', blocked: '#f1f5f9', skipped: '#f1f5f9' };
  const stateText = { pass: '通过', warn: '需复查', fail: '异常', blocked: '受阻', skipped: '未检测' };
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

  // Model sanity cards
  const sanityHtml = result.modelSanity ? `
    <div style="margin-bottom:20px">
      <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">模型表现分 · Model Sanity Score</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px">
        ${result.modelSanity.results.map(r => {
          const sc = r.score >= 70 ? '#16a34a' : r.score >= 50 ? '#d97706' : '#dc2626';
          return `<div style="background:#f1f5f9;border-radius:8px;padding:10px 8px;text-align:center">
            <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px">${r.name}</div>
            <div style="font-size:22px;font-weight:800;color:${sc}">${r.score}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px">${r.explanation}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const scoreColor = overallScore !== null
    ? (overallScore >= 85 ? '#16a34a' : overallScore >= 60 ? '#d97706' : '#dc2626')
    : '#64748b';
  const scoreBg = overallScore !== null
    ? (overallScore >= 85 ? '#dcfce7' : overallScore >= 60 ? '#fef3c7' : '#fee2e2')
    : '#f1f5f9';

  const heroBgMap = { ok: '#dcfce7', warn: '#fef3c7', danger: '#fee2e2', neutral: '#f1f5f9' };
  const heroColorMap = { ok: '#16a34a', warn: '#d97706', danger: '#dc2626', neutral: '#64748b' };
  const hBg = heroBgMap[heroStatus] || '#f1f5f9';
  const hColor = heroColorMap[heroStatus] || '#64748b';

  const shareOneLineZH = coverage < 40
    ? `我的 AI API 快速体检：${overallScore !== null ? overallScore : '—'}/100｜覆盖度 ${coverage}%｜${mainFinding}｜报告 ID：${reportId}\nhttps://aiapidoctor.com/`
    : `我的 AI API 体检分：${overallScore !== null ? overallScore : '—'}/100｜覆盖度 ${coverage}%｜${mainFinding}｜报告 ID：${reportId}\nhttps://aiapidoctor.com/`;

  const shareOneLineEN = coverage < 40
    ? `My AI API Quick Check: ${overallScore !== null ? overallScore : '—'}/100 | Coverage: ${coverage}% | ${getMainFindingEn(result, dims)} | Report ID: ${reportId}\nhttps://aiapidoctor.com/en/`
    : `My AI API Doctor Score: ${overallScore !== null ? overallScore : '—'}/100 | Coverage: ${coverage}% | ${getMainFindingEn(result, dims)} | Report ID: ${reportId}\nhttps://aiapidoctor.com/en/`;

  const shareForumZH = [
    `我测了一下 AI API：`,
    `体检分：${overallScore !== null ? overallScore : '—'}/100（覆盖度 ${coverage}%）`,
    `主要发现：${mainFinding}`,
    `报告 ID：${reportId}`,
    `https://aiapidoctor.com/`
  ].join('\n');

  const shareForumEN = [
    `I tested my AI API with AI API Doctor:`,
    `Score: ${overallScore !== null ? overallScore : '—'}/100 (Coverage: ${coverage}%)`,
    `Finding: ${getMainFindingEn(result, dims)}`,
    `Report ID: ${reportId}`,
    `https://aiapidoctor.com/en/`
  ].join('\n');

  const html = `
    <div style="border-bottom:1px solid #e2e8f0;padding-bottom:20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div>
        <div style="font-size:18px;font-weight:700;color:#0f172a">AI API Doctor</div>
        <div style="font-size:13px;color:#64748b;margin-top:2px">AI API 体检报告</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#64748b;line-height:1.8">
        <div>API Key 已脱敏</div>
        <div>本地浏览器检测</div>
        <div>${result.timestamp}</div>
      </div>
    </div>

    <!-- Score Hero -->
    <div style="text-align:center;padding:20px 16px;border-radius:12px;background:${hBg};margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${hColor};margin-bottom:6px">${escHtml(heroStatusLabel)}</div>
      <div style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:4px">${escHtml(heroTitle)}</div>
      ${heroSub ? `<div style="font-size:13px;color:#64748b;margin-bottom:16px;line-height:1.5">${escHtml(heroSub)}</div>` : '<div style="margin-bottom:12px"></div>'}

      <!-- Score row -->
      <div style="display:flex;gap:10px;justify-content:center;margin-bottom:12px;flex-wrap:wrap">
        ${overallScore !== null ? `<div style="flex:1;max-width:180px;background:#fff;border-radius:10px;padding:14px">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">综合分</div>
          <div style="font-size:40px;font-weight:800;color:${scoreColor};line-height:1">${overallScore}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">Overall Score</div>
        </div>` : ''}
        ${apiScore !== null ? `<div style="flex:1;max-width:180px;background:#fff;border-radius:10px;padding:14px">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">API 体检分</div>
          <div style="font-size:32px;font-weight:800;color:${apiScore >= 85 ? '#16a34a' : apiScore >= 60 ? '#d97706' : '#dc2626'};line-height:1">${apiScore}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">${coverage < 100 ? '基于已测项目' : 'API Health Score'}</div>
        </div>` : ''}
        <div style="flex:1;max-width:180px;background:#fff;border-radius:10px;padding:14px">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">覆盖度</div>
          <div style="font-size:32px;font-weight:800;color:#0f172a;line-height:1">${coverage}%</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">Coverage</div>
        </div>
        <div style="flex:1;max-width:180px;background:#fff;border-radius:10px;padding:14px">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">置信度</div>
          <div style="font-size:32px;font-weight:800;color:#0f172a;line-height:1">${confidence === 'high' ? '高' : confidence === 'medium' ? '中' : '低'}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">Confidence</div>
        </div>
        ${modelScore !== null ? `<div style="flex:1;max-width:180px;background:#fff;border-radius:10px;padding:14px">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">模型表现分</div>
          <div style="font-size:32px;font-weight:800;color:${modelScore >= 70 ? '#16a34a' : modelScore >= 50 ? '#d97706' : '#dc2626'};line-height:1">${modelScore}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">${result.modelSanity?.label || 'Model Sanity'}</div>
        </div>` : ''}
      </div>

      <!-- Main finding -->
      <div style="font-size:13px;font-weight:600;color:#374151;padding:8px 14px;background:#fff;border-radius:8px;display:inline-block">
        ${escHtml(mainFinding)}
      </div>
      <div style="font-size:11px;color:#64748b;margin-top:8px">报告 ID：${reportId}</div>
    </div>

    <!-- Model tier -->
    ${modelScore !== null && modelTierComment ? `
    <div style="margin-bottom:12px;padding:10px 14px;background:#eff6ff;border-radius:8px;font-size:12px;color:#1e40af;line-height:1.6">
      模型预期：${tierDisplay} &nbsp;|&nbsp; ${modelTierComment}
    </div>` : ''}
    ${modelScore !== null ? `<div style="margin-bottom:16px;font-size:11px;color:#94a3b8;line-height:1.5;padding:0 2px">模型表现分是轻量推理与指令遵守测试，不是官方 IQ，不证明模型真假，只用于发现明显异常或降智风险。</div>` : ''}

    <!-- Tested dimensions -->
    ${testedDims.length > 0 ? `
    <div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">已测项目</div>
      <div style="display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        ${testedDims.map(d => dimCard(d, false)).join('')}
      </div>
    </div>` : ''}

    <!-- Untested dimensions -->
    ${untestedDims.length > 0 ? `
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">未测项目</div>
      <div style="display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        ${untestedDims.map(d => dimCard(d, true)).join('')}
      </div>
    </div>` : ''}

    <!-- Model Sanity Section -->
    ${sanityHtml}

    <!-- Tech grid -->
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
      API Key 已脱敏。本报告只展示本次测试中的可复现信号，不证明服务商故意多扣费，也不证明模型真假。模型表现分仅用于发现明显异常或降智风险，不代表官方模型排名。
    </div>

    <!-- Action buttons -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <button onclick="Doctor.saveImage()" style="flex:1;padding:10px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        保存图片
      </button>
      <button onclick="Doctor.copyMarkdown()" style="flex:1;padding:10px 16px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        复制 Markdown
      </button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <button onclick="Doctor.copyForProvider()" style="flex:1;padding:10px 16px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        复制给站长
      </button>
      <button onclick="Doctor.copyOneLine()" style="flex:1;padding:10px 16px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        复制一行晒分
      </button>
      <button onclick="Doctor.copyForum()" style="flex:1;padding:10px 16px;background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        复制论坛回复
      </button>
    </div>

    <!-- Hidden sharing data -->
    <div id="share-data" style="display:none"
      data-report-id="${reportId}"
      data-fingerprint="${reportFingerprint}"
      data-overall="${overallScore !== null ? overallScore : ''}"
      data-api="${apiScore !== null ? apiScore : ''}"
      data-model="${modelScore !== null ? modelScore : ''}"
      data-model-label="${modelScore !== null ? (result.modelSanity?.label || '') : ''}"
      data-finding="${mainFinding}"
      data-finding-en="${getMainFindingEn(result, dims)}"
      data-model-tier="${tierDisplay}"
      data-coverage="${coverage}"
    ></div>
  `;

  const node = document.getElementById('result-card');
  if (node) node.innerHTML = html;

  return { score: overallScore, coverage, confidence, reportId };
}

/* ═══════════════════════════════════════════════════════
   Markdown copy
   ═══════════════════════════════════════════════════════ */
function buildMarkdownReport(result, formData) {
  const scored = result._scored;
  const dims = scored.dims;
  const conn = result.connectivity || {};
  const mainFinding = getMainFinding(result, dims);
  const overallScore = scored.overallScore;
  const apiScore = scored.score;
  const modelScore = scored.modelSanityScore;
  const coverage = scored.coverage;
  const tierLabelMap = { uncertain: '不确定', light: '轻量', standard: '标准', advanced: '高级' };

  let sanityLines = '';
  if (modelScore !== null && result.modelSanity) {
    sanityLines = result.modelSanity.results.map(r =>
      `- ${r.name}（${r.nameEn}）：${r.score}/100`
    ).join('\n');
  }

  const testedDimLines = [
    { label: '模型联通', state: dims.connectivity?.state, detail: conn.status ? 'HTTP ' + conn.status : '—' },
    { label: 'usage 完整性', state: dims.usage?.state, detail: result.usageIntegrity?.detail || '—' },
    { label: '扣费完整性', state: dims.billing?.state, detail: result.billing?.verdict || '—' },
    { label: '缓存命中', state: dims.cache?.state, detail: result.cacheHit?.status || '—' },
    { label: '价格核对', state: dims.price?.state, detail: result.priceAudit?.status || '—' },
  ].filter(d => d.state !== 'skipped').map(d => `| ${d.label} | ${d.state === 'pass' ? '通过' : d.state === 'warn' ? '需复查' : d.state === 'fail' ? '异常' : '—'} |`).join('\n');

  return [
    '## AI API Doctor 体检报告',
    '',
    `**综合分：** ${overallScore !== null ? overallScore + '/100' : '—'} | **API 体检分：** ${apiScore !== null ? apiScore + '/100' : '—'} | **模型表现分：** ${modelScore !== null ? modelScore + '/100' : '未检测'}`,
    `**覆盖度：** ${coverage}% | **置信度：** ${scored.confidence === 'high' ? '高' : scored.confidence === 'medium' ? '中' : '低'} | **发现：** ${mainFinding}`,
    `**报告 ID：** ${result.reportId} | **Report Fingerprint：** ${result.reportFingerprint || '—'}`,
    modelScore !== null ? `**模型预期：** ${tierLabelMap[result.modelTier] || '不确定'}` : '',
    '',
    '### 检测维度',
    `| 维度 | 结果 |`,
    `|------|------|`,
    testedDimLines,
    '',
    modelScore !== null && result.modelSanity ? '### 模型表现分\n' + sanityLines : '',
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
    '',
    '### 安全说明',
    '本报告不包含 API Key，只展示本次测试中的可复现信号，不证明服务商故意多扣费。模型表现分仅用于发现明显异常或降智风险，不代表官方模型排名。',
    '',
    `Generated by AI API Doctor · ${result.timestamp}`
  ].filter(Boolean).join('\n');
}

/* ═══════════════════════════════════════════════════════
   Copy-for-provider template
   ═══════════════════════════════════════════════════════ */
function buildProviderReport(result, formData) {
  const scored = result._scored;
  const dims = scored.dims;
  const conn = result.connectivity || {};
  const mainFinding = getMainFinding(result, dims);
  const overallScore = scored.overallScore;
  const apiScore = scored.score;
  const modelScore = scored.modelSanityScore;
  const coverage = scored.coverage;
  const tierLabelMap = { uncertain: '不确定', light: '轻量', standard: '标准', advanced: '高级' };
  const tierDisplay = tierLabelMap[result.modelTier] || '不确定';

  return [
    '您好，我用 AI API Doctor 做了一次本地诊断，结果如下：',
    '',
    `综合分：${overallScore !== null ? overallScore + '/100' : '—'}（覆盖度 ${coverage}%）`,
    `主要发现：${mainFinding}`,
    `报告 ID：${result.reportId}`,
    `模型预期：${tierDisplay}`,
    '',
    '检测结果：',
    dims.connectivity?.state !== 'skipped' ? `- 模型联通：${dims.connectivity?.state === 'pass' ? '通过' : dims.connectivity?.state === 'warn' ? '需复查' : dims.connectivity?.state === 'fail' ? '异常' : '受阻'}（HTTP ${conn.status || '—'}${conn.latency ? ', ' + conn.latency + 'ms' : ''}）` : '',
    dims.usage?.state !== 'skipped' ? `- usage 完整性：${dims.usage?.state === 'pass' ? '完整' : dims.usage?.state === 'warn' ? '需复查' : '不完整'}` : '',
    dims.billing?.state !== 'skipped' ? `- 扣费完整性：${result.billing?.verdict || '—'}` : '',
    dims.cache?.state !== 'skipped' ? `- 缓存命中：${result.cacheHit?.status || '—'}` : '',
    dims.price?.state !== 'skipped' ? `- 价格核对：${result.priceAudit?.status || '—'}` : '',
    modelScore !== null ? `- 模型表现分：${modelScore}/100（${result.modelSanity?.label}）` : '',
    '',
    '关键证据：',
    `- Base URL：${formData.baseUrl || '—'}`,
    `- 模型：${formData.model || '—'}`,
    `- 接口：${formData.interfaceType || '—'}`,
    `- HTTP 状态：${conn.status || '—'}`,
    `- completion_tokens / output_tokens：${conn.completionTokens ?? '—'}`,
    `- total_tokens：${conn.totalTokens ?? '—'}`,
    `- cached_tokens：${conn.cachedTokens ?? '—'}`,
    result.priceAudit?.expectedCost !== null ? `- 理论成本：$${result.priceAudit.expectedCost.toFixed(6)}` : '',
    result.priceAudit?.actualCost !== null ? `- 实际扣费：$${result.priceAudit.actualCost.toFixed(6)}` : '',
    '',
    '说明：',
    '本报告只展示本次测试中的可复现信号，不证明服务商故意多扣费，也不证明模型真假。模型表现分仅用于发现明显异常或降智风险，不代表官方模型排名。',
    '',
    '— 由 AI API Doctor 生成 · aiapidoctor.com'
  ].filter(Boolean).join('\n');
}

/* ═══════════════════════════════════════════════════════
   Save image — dedicated export clone, fixed 1080px
   ═══════════════════════════════════════════════════════ */
async function saveDiagnosticImage() {
  const sourceNode = document.getElementById('result-card');
  if (!sourceNode) { showToast('报告节点不存在'); return; }

  try {
    await new Promise(requestAnimationFrame);
    await document.fonts.ready.catch(() => undefined);

    if (typeof htmlToImage !== 'undefined') {
      // Create a dedicated export clone
      const clone = sourceNode.cloneNode(true);
      clone.style.cssText = [
        'position:fixed',
        'top:-9999px',
        'left:-9999px',
        'width:1080px',
        'background:#f8fafc',
        'padding:64px',
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
      showToast('报告图片已保存');
    } else {
      showToast('图片生成失败，请使用浏览器截图或复制报告文本。');
    }
  } catch (err) {
    showToast('图片生成失败，请使用浏览器截图。');
  }
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/* ═══════════════════════════════════════════════════════
   Model List Reader — try to fetch /models
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
      models = data.data.map(m => m.id || m.id || '').filter(Boolean);
    } else if (Array.isArray(data.models)) {
      models = data.models.map(m => typeof m === 'string' ? m : m.id || m.name || '').filter(Boolean);
    } else if (Array.isArray(data)) {
      models = data.map(m => typeof m === 'string' ? m : m.id || m.name || '').filter(Boolean);
    }

    if (models.length === 0) {
      return { error: 'empty_list' };
    }

    return { models, data };
  } catch (err) {
    return { error: 'cors', message: err.message };
  }
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
  _sanityEnabled: false,
  _mode: 'quick',

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

  setTier(type) {
    document.querySelectorAll('.tier-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tier === type);
    });
    const el = document.getElementById('doctor-tier');
    if (el) el.value = type;
  },

  setMode(mode) {
    this._mode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Auto-set advanced checkboxes based on mode
    const cfg = DETECTION_MODES[mode];
    const cacheCb = document.getElementById('cache-test-toggle');
    const priceCb = document.getElementById('price-test-toggle');
    const sanityCb = document.getElementById('sanity-test-toggle');

    if (cacheCb) cacheCb.checked = cfg.cacheTest;
    if (priceCb) priceCb.checked = cfg.priceAudit;
    if (sanityCb) sanityCb.checked = cfg.modelSanity;

    this._cacheEnabled = cfg.cacheTest;
    this._priceEnabled = cfg.priceAudit;
    this._sanityEnabled = cfg.modelSanity;

    updateCostEstimate();
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
    updateCostEstimate();
  },

  togglePrice(checkbox) {
    this._priceEnabled = checkbox.checked;
    updateCostEstimate();
  },

  toggleSanity(checkbox) {
    this._sanityEnabled = checkbox.checked;
    updateCostEstimate();
  },

  showCommonModels() {
    const modal = document.getElementById('model-modal');
    if (modal) {
      modal.style.display = 'flex';
      const searchInput = modal.querySelector('.model-search-input');
      if (searchInput) { searchInput.value = ''; filterModelList(''); }
    }
  },

  hideModelModal() {
    const modal = document.getElementById('model-modal');
    if (modal) modal.style.display = 'none';
  },

  selectModel(model) {
    const el = document.getElementById('doctor-model');
    if (el) el.value = model;
    this.hideModelModal();
  },

  async readModelList() {
    const baseUrl = (document.getElementById('doctor-base-url')?.value || '').trim();
    const apiKey = (document.getElementById('doctor-api-key')?.value || '').trim();

    if (!baseUrl) { showToast('请先填写 Base URL'); return; }
    if (!apiKey) { showToast('请先填写 API Key'); return; }

    const btn = document.getElementById('read-models-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '读取中...';
    }

    try {
      const result = await tryReadModelList(baseUrl, apiKey);

      if (result.error) {
        let msg = '';
        if (result.error === 'cors') msg = '浏览器跨域限制，无法从网页读取模型列表。可以手动填写 Model ID。';
        else if (result.error === 'auth') msg = 'API Key 无效或权限不足，无法读取模型列表。';
        else if (result.error === 'not_found') msg = '当前服务商可能不支持 /v1/models 接口，请手动填写 Model ID。';
        else if (result.error === 'no_url') msg = '请先填写 Base URL。';
        else if (result.error === 'empty_list') msg = '模型列表为空，请手动填写 Model ID。';
        else msg = '读取失败，请手动填写 Model ID。这不代表 API 本身不可用。';
        showToast(msg);
      } else {
        // Show fetched models in modal
        const modal = document.getElementById('model-modal');
        if (modal) {
          const fetchedSection = modal.querySelector('.model-fetched-list');
          if (fetchedSection) {
            fetchedSection.innerHTML = result.models.map(m =>
              `<div class="model-fetched-item" onclick="Doctor.selectModel('${escHtml(m)}')">${escHtml(m)}</div>`
            ).join('');
          }
          modal.style.display = 'flex';
          const searchInput = modal.querySelector('.model-search-input');
          if (searchInput) { searchInput.value = ''; filterModelList(''); }
        }
      }
    } catch (err) {
      showToast('读取模型列表失败，请手动填写 Model ID。这不代表 API 不可用。');
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = '尝试读取模型列表 Beta';
    }
  },

  async run() {
    const baseUrl = (document.getElementById('doctor-base-url')?.value || '').trim();
    const apiKey = (document.getElementById('doctor-api-key')?.value || '').trim();
    const model = (document.getElementById('doctor-model')?.value || '').trim();
    const interfaceType = (document.getElementById('doctor-interface')?.value || 'OpenAI Chat');
    const modelTier = (document.getElementById('doctor-tier')?.value || 'uncertain');
    const providerName = (document.getElementById('doctor-provider')?.value || '').trim()
      || (baseUrl ? new URL(baseUrl.startsWith('http') ? baseUrl : 'https://' + baseUrl).hostname : 'Unknown');

    if (!baseUrl) { showToast('请填写 Base URL'); return; }
    if (!model) { showToast('请填写 Model ID'); return; }

    saveConfigToStorage({ baseUrl, providerName, model, interfaceType });

    if (this._controller) this._controller.abort();
    this._controller = new AbortController();

    const btn = document.getElementById('doctor-run-btn');
    const clearBtn = document.getElementById('doctor-clear-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="status-dot status-dot--running"></span>检测中...`;
    }
    if (clearBtn) clearBtn.disabled = true;

    this.showProgress('running');

    const priceData = this._priceEnabled ? {
      inputPrice: document.getElementById('price-input')?.value,
      outputPrice: document.getElementById('price-output')?.value,
      cachedReadPrice: document.getElementById('price-cached-read')?.value,
      cachedWritePrice: document.getElementById('price-cached-write')?.value,
      actualCost: document.getElementById('price-actual')?.value
    } : null;

    this._formData = { baseUrl, apiKey, model, interfaceType, providerName, modelTier };

    try {
      const timeout = setTimeout(() => {
        this._controller.abort();
      }, TOTAL_TIMEOUT);

      this._result = await runDiagnosis({
        baseUrl, apiKey, model, interfaceType,
        signal: this._controller.signal,
        runCacheTest: this._cacheEnabled,
        runPriceTest: this._priceEnabled,
        priceData,
        runSanityTest: this._sanityEnabled,
        modelTier
      });

      clearTimeout(timeout);
    } catch (err) {
      if (err.name === 'AbortError') {
        showToast('检测超时（90 秒），请重试或使用 Chrome 插件');
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
    const mode = this._mode;
    const cfg = DETECTION_MODES[mode];
    const steps = [
      '模型联通检测',
      'usage 完整性',
      this._cacheEnabled ? '缓存命中检测' : null,
      this._priceEnabled ? '价格核对' : null,
      this._sanityEnabled ? '模型智商检测（5 项）' : null,
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
    document.getElementById('doctor-tier').value = 'standard';
    this.setTier('standard');
    this._mode = 'quick';
    this.setMode('quick');
    updateCostEstimate();
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
  },

  copyOneLine() {
    if (!this._result) { showToast('请先进行检测'); return; }
    const scored = this._result._scored;
    const dims = scored.dims;
    const coverage = scored.coverage;
    const mainFinding = getMainFinding(this._result, dims);
    const overallScore = scored.overallScore;
    const text = coverage < 40
      ? `我的 AI API 快速体检：${overallScore !== null ? overallScore : '—'}/100｜覆盖度 ${coverage}%｜${mainFinding}｜报告 ID：${this._result.reportId}\nhttps://aiapidoctor.com/`
      : `我的 AI API 体检分：${overallScore !== null ? overallScore : '—'}/100｜覆盖度 ${coverage}%｜${mainFinding}｜报告 ID：${this._result.reportId}\nhttps://aiapidoctor.com/`;
    copyToClipboard(text, '一行晒分已复制');
  },

  copyForum() {
    if (!this._result) { showToast('请先进行检测'); return; }
    const scored = this._result._scored;
    const dims = scored.dims;
    const coverage = scored.coverage;
    const mainFinding = getMainFinding(this._result, dims);
    const overallScore = scored.overallScore;
    const text = [
      `我测了一下 AI API：` ,
      `体检分：${overallScore !== null ? overallScore : '—'}/100（覆盖度 ${coverage}%）`,
      `主要发现：${mainFinding}`,
      `报告 ID：${this._result.reportId}`,
      `https://aiapidoctor.com/`
    ].join('\n');
    copyToClipboard(text, '论坛回复已复制');
  }
};

/* ═══════════════════════════════════════════════════════
   Model list modal filter (global)
   ═══════════════════════════════════════════════════════ */
function filterModelList(query) {
  const modal = document.getElementById('model-modal');
  if (!modal) return;
  const q = (query || '').toLowerCase();

  // Filter common models
  const commonItems = modal.querySelectorAll('.common-models__item');
  commonItems.forEach(item => {
    const text = (item.textContent || '').toLowerCase();
    item.style.display = text.includes(q) || q === '' ? '' : 'none';
  });

  // Filter fetched items
  const fetchedItems = modal.querySelectorAll('.model-fetched-item');
  fetchedItems.forEach(item => {
    const text = (item.textContent || '').toLowerCase();
    item.style.display = text.includes(q) || q === '' ? '' : 'none';
  });

  // Show/hide groups
  const groups = modal.querySelectorAll('.model-group');
  groups.forEach(g => {
    const visible = Array.from(g.querySelectorAll('.common-models__item, .model-fetched-item'))
      .some(el => el.style.display !== 'none');
    g.style.display = visible || q === '' ? '' : 'none';
  });
}
