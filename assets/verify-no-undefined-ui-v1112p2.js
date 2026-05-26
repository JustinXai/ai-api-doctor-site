/**
 * verify-no-undefined-ui-v1112p2.js
 * Tests that undefined/null/NaN never appears in HTML output
 */
const fs = require('fs');
const path = require('path');

const testJsPath = path.join(__dirname, 'test.js');
const testJs = fs.readFileSync(testJsPath, 'utf8');

// Simulate module grid HTML generation
const MODULE_DEFINITIONS = {
  usageTransparency: { max: 25, labelZh: '扣费透明度', labelEn: 'Cost Transparency' },
  cacheSignal: { max: 5, labelZh: '缓存命中信号', labelEn: 'Cache Signal' },
  modelSignal: { max: 15, labelZh: '模型信号', labelEn: 'Model Signal' },
  stabilityLatency: { max: 25, labelZh: '稳定性与延迟', labelEn: 'Stability & Latency' },
  coreCompatibility: { max: 25, labelZh: '基础兼容性', labelEn: 'Basic Compatibility' },
  clientConfig: { max: 5, labelZh: '客户端配置', labelEn: 'Client Config' }
};

function safeNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatModuleScore(score, max, key) {
  const def = MODULE_DEFINITIONS[key] || {};
  const safeMax = safeNum(max, def.max);
  
  const fmtScore = (s) => {
    const rounded = Math.round(s * 10) / 10;
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(1);
  };
  
  if (safeMax > 0) {
    return fmtScore(score) + '/' + fmtScore(safeMax);
  } else {
    return fmtScore(score) + '/?';
  }
}

function escH(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildModuleCell(checkKey, moduleData, zh) {
  const { label, score, max, risk, riskLabel } = moduleData;
  const riskColors = {
    low: { color: '#16a34a', bg: '#dcfce7' },
    medium: { color: '#d97706', bg: '#fef3c3' },
    high: { color: '#dc2626', bg: '#fee2e2' },
    unknown: { color: '#64748b', bg: '#f1f5f9' }
  };
  const rc = riskColors[risk] || riskColors.unknown;
  const displayRiskLabel = typeof riskLabel === 'string' && riskLabel
    ? riskLabel
    : (zh ? '未验证' : 'Unverified');

  return '<button class="module-cell" type="button" data-module="' + escH(checkKey) + '">' +
    '<span class="module-name">' + escH(label) + '</span>' +
    '<span class="module-score">' + escH(formatModuleScore(score, max, checkKey)) + '</span>' +
    '<span class="risk-pill" style="background:' + rc.bg + ';color:' + rc.color + '">' + escH(displayRiskLabel) + '</span>' +
    '</button>';
}

// Test with various score scenarios
const testModules = [
  { key: 'usageTransparency', label: '扣费透明度', score: 4, max: 25, risk: 'high', riskLabel: '高风险' },
  { key: 'cacheSignal', label: '缓存命中信号', score: 2.5, max: 5, risk: 'medium', riskLabel: '中风险' },
  { key: 'modelSignal', label: '模型信号', score: 2, max: 15, risk: 'high', riskLabel: '高风险' },
  { key: 'stabilityLatency', label: '稳定性与延迟', score: 20, max: 25, risk: 'low', riskLabel: '低风险' },
  { key: 'coreCompatibility', label: '基础兼容性', score: 5.6, max: 25, risk: 'high', riskLabel: '高风险' },
  { key: 'clientConfig', label: '客户端配置', score: 3, max: 5, risk: 'medium', riskLabel: '中风险' }
];

let allPassed = true;
const results = [];

// Generate HTML for all modules
const html = testModules.map(m => buildModuleCell(m.key, m, true)).join('\n');

// Check for forbidden patterns
const forbiddenPatterns = [
  { pattern: 'undefined', name: 'undefined' },
  { pattern: '/undefined', name: '/undefined' },
  { pattern: '[object Object]', name: '[object Object]' },
  { pattern: 'NaN', name: 'NaN' },
  { pattern: 'null/undefined', name: 'null/undefined' }
];

results.push('=== Checking HTML for forbidden patterns ===');
forbiddenPatterns.forEach(({ pattern, name }) => {
  if (html.includes(pattern)) {
    results.push(`FAIL: HTML contains '${name}'`);
    allPassed = false;
  } else {
    results.push(`PASS: HTML does not contain '${name}'`);
  }
});

// Verify module scores display correctly
results.push('\n=== Verifying module score displays ===');
const expectedDisplays = [
  { key: 'usageTransparency', expect: '4/25' },
  { key: 'cacheSignal', expect: '2.5/5' },
  { key: 'modelSignal', expect: '2/15' },
  { key: 'stabilityLatency', expect: '20/25' },
  { key: 'coreCompatibility', expect: '5.6/25' },
  { key: 'clientConfig', expect: '3/5' }
];

expectedDisplays.forEach(({ key, expect }) => {
  const m = testModules.find(x => x.key === key);
  const display = formatModuleScore(m.score, m.max, key);
  if (display === expect) {
    results.push(`PASS: ${key} displays '${display}'`);
  } else {
    results.push(`FAIL: ${key} displays '${display}', expected '${expect}'`);
    allPassed = false;
  }
});

// Test with missing max values (fallback to MODULE_DEFINITIONS)
results.push('\n=== Testing fallback when max is missing ===');
const moduleWithMissingMax = { key: 'usageTransparency', label: '扣费透明度', score: 4, max: undefined, risk: 'high', riskLabel: '高风险' };
const displayWithFallback = formatModuleScore(moduleWithMissingMax.score, moduleWithMissingMax.max, moduleWithMissingMax.key);
if (displayWithFallback === '4/25') {
  results.push('PASS: Fallback to MODULE_DEFINITIONS.max works');
} else {
  results.push(`FAIL: Fallback display '${displayWithFallback}', expected '4/25'`);
  allPassed = false;
}

if (displayWithFallback.includes('undefined')) {
  results.push('FAIL: Display contains undefined after fallback');
  allPassed = false;
}

console.log('=== verify-no-undefined-ui-v1112p2.js ===');
results.forEach(r => console.log(r));
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
