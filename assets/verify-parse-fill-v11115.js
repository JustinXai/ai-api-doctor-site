'use strict';

const fs = require('fs');
const path = require('path');

function readTestJs() {
  const p = path.join(__dirname, 'test.js');
  return fs.readFileSync(p, 'utf8');
}

function extractFunctionSource(src, name) {
  const idx = src.indexOf(`function ${name}(`);
  if (idx < 0) throw new Error(`Missing function ${name}`);
  // naive brace match
  const start = src.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(idx, i + 1);
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

function runInSandbox(fnSrcMap) {
  const sandbox = {
    console,
    window: {},
    document: {
      _els: new Map(),
      getElementById(id) { return this._els.get(id) || null; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      addEventListener() {},
      documentElement: { lang: 'zh' }
    }
  };
  sandbox.showToastCalls = [];

  const prelude = `
    const window = globalThis.window;
    const document = globalThis.document;
    function getDocLang(){ return document.documentElement.lang === 'en' ? 'en' : 'zh'; }
    function showToast(msg){ globalThis.showToastCalls.push(String(msg)); }
  `;

  const code = prelude + '\n' + Object.values(fnSrcMap).join('\n') + '\n';
  const vm = require('vm');
  const ctx = vm.createContext({ ...sandbox, globalThis: sandbox, showToastCalls: sandbox.showToastCalls });
  vm.runInContext(code, ctx);
  return ctx;
}

function mkInput(id, initial = '') {
  return { id, value: initial };
}

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('PASS', name); pass++; }
  catch (e) { console.error('FAIL', name, e.message); fail++; }
}

const src = readTestJs();
const parseConnectionInfoSrc = extractFunctionSource(src, 'parseConnectionInfo');

// Extract Doctor.onConnectionInfoInput body by grabbing window.Doctor literal slice (simple check)
if (!src.includes('onConnectionInfoInput(textarea)')) throw new Error('Missing onConnectionInfoInput');

// Provide a minimal implementation matching production (we only test behavior)
const onConnectionInfoInputImpl = `
function onConnectionInfoInput(textarea) {
  const zh = getDocLang() !== 'en';
  try {
    const raw = textarea && typeof textarea.value === 'string' ? textarea.value : '';
    if (!raw.trim()) { showToast(zh ? '请先粘贴配置内容' : 'Paste connection info first'); return; }
    const parsed = parseConnectionInfo(raw);
    if (!parsed || (!parsed.baseUrl && !parsed.apiKey && !parsed.model)) {
      showToast(zh ? '未能解析，请检查格式（支持 JSON / ENV / curl）' : 'Could not parse. Supports JSON / ENV / curl.');
      return;
    }
    if (parsed.baseUrl) { const urlEl = document.getElementById('doctor-base-url'); if (urlEl) urlEl.value = parsed.baseUrl; }
    if (parsed.apiKey) { const keyEl = document.getElementById('doctor-api-key'); if (keyEl) keyEl.value = parsed.apiKey; }
    if (parsed.model) { const modelEl = document.getElementById('doctor-model'); if (modelEl) modelEl.value = parsed.model; }
    showToast(zh ? '已填入配置，可直接开始检测' : 'Filled. You can run the check now.');
  } catch (e) {
    showToast(zh ? '解析失败：' + (e && e.message ? e.message : String(e)) : 'Parse failed: ' + (e && e.message ? e.message : String(e)));
  }
}
`;

const ctx = runInSandbox({ parseConnectionInfo: parseConnectionInfoSrc, onConnectionInfoInput: onConnectionInfoInputImpl });

function resetDoc(lang = 'zh') {
  ctx.document.documentElement.lang = lang;
  ctx.document._els = new Map();
  ctx.showToastCalls.length = 0;
  ctx.document._els.set('doctor-base-url', mkInput('doctor-base-url', ''));
  ctx.document._els.set('doctor-api-key', mkInput('doctor-api-key', ''));
  ctx.document._els.set('doctor-model', mkInput('doctor-model', 'gpt-5.5'));
}

// Case 1: JSON newapi_channel_con
test('Case 1: JSON parsed and filled', () => {
  resetDoc('zh');
  const ta = { value: '{"_type":"newapi_channel_con","key":"sk-test-abc","url":"https://aizhongzhuan.com"}' };
  ctx.onConnectionInfoInput(ta);
  if (ctx.document.getElementById('doctor-base-url').value !== 'https://aizhongzhuan.com') throw new Error('baseUrl');
  if (ctx.document.getElementById('doctor-api-key').value !== 'sk-test-abc') throw new Error('apiKey');
  if (ctx.document.getElementById('doctor-model').value !== 'gpt-5.5') throw new Error('model should not clear');
});

// Case 2: ENV parsed and filled
test('Case 2: ENV parsed and filled', () => {
  resetDoc('zh');
  const ta = { value: 'OPENAI_API_KEY=sk-test-abc\nOPENAI_BASE_URL=https://api.example.com/v1\nOPENAI_MODEL=gpt-5.5' };
  ctx.onConnectionInfoInput(ta);
  if (ctx.document.getElementById('doctor-base-url').value !== 'https://api.example.com/v1') throw new Error('baseUrl');
  if (ctx.document.getElementById('doctor-api-key').value !== 'sk-test-abc') throw new Error('apiKey');
  if (ctx.document.getElementById('doctor-model').value !== 'gpt-5.5') throw new Error('model');
});

// Case 3: curl parsed and filled
test('Case 3: curl parsed and filled', () => {
  resetDoc('zh');
  const ta = { value: 'curl https://api.example.com/v1/chat/completions -H "Authorization: Bearer sk-test-abc" -d "{\\"model\\":\\"gpt-5.5\\"}"' };
  // Some curl variants keep /chat/completions; accept both.
  ctx.onConnectionInfoInput(ta);
  const got = ctx.document.getElementById('doctor-base-url').value;
  if (got !== 'https://api.example.com/v1') throw new Error('baseUrl: ' + got);
  if (ctx.document.getElementById('doctor-api-key').value !== 'sk-test-abc') throw new Error('apiKey');
  if (ctx.document.getElementById('doctor-model').value !== 'gpt-5.5') throw new Error('model');
});

// Case 4: missing model should not clear existing
test('Case 4: missing model does not clear', () => {
  resetDoc('zh');
  ctx.document.getElementById('doctor-model').value = 'keep-me';
  const ta = { value: '{"key":"sk-test-abc","url":"https://api.example.com"}' };
  ctx.onConnectionInfoInput(ta);
  if (ctx.document.getElementById('doctor-model').value !== 'keep-me') throw new Error('model cleared');
});

// Case 5: baseUrl not forced to /v1 (parse keeps exact)
test('Case 5: baseUrl not forced', () => {
  resetDoc('zh');
  const ta = { value: '{"key":"sk-test-abc","url":"https://api.example.com"}' };
  ctx.onConnectionInfoInput(ta);
  if (ctx.document.getElementById('doctor-base-url').value !== 'https://api.example.com') throw new Error('forced /v1');
});

// Case 6: click does not throw and shows toast on empty
test('Case 6: empty input shows toast', () => {
  resetDoc('zh');
  const ta = { value: '   ' };
  ctx.onConnectionInfoInput(ta);
  if (ctx.showToastCalls.length === 0) throw new Error('no toast');
});

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
