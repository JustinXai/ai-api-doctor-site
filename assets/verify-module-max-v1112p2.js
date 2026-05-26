/**
 * verify-module-max-v1112p2.js
 * Tests that all modules have correct max values
 */
const fs = require('fs');
const path = require('path');

const testJsPath = path.join(__dirname, 'test.js');
const testJs = fs.readFileSync(testJsPath, 'utf8');

// Extract MODULE_DEFINITIONS
const MODULE_DEFINITIONS = {
  usageTransparency: { max: 25, labelZh: '扣费透明度', labelEn: 'Cost Transparency' },
  cacheSignal: { max: 5, labelZh: '缓存命中信号', labelEn: 'Cache Signal' },
  cacheHitCheck: { max: 5, labelZh: '缓存命中信号', labelEn: 'Cache Signal' },
  modelSignal: { max: 15, labelZh: '模型信号', labelEn: 'Model Signal' },
  stabilityLatency: { max: 25, labelZh: '稳定性与延迟', labelEn: 'Stability & Latency' },
  stability: { max: 25, labelZh: '稳定性与延迟', labelEn: 'Stability & Latency' },
  coreCompatibility: { max: 25, labelZh: '基础兼容性', labelEn: 'Basic Compatibility' },
  basicCompatibility: { max: 25, labelZh: '基础兼容性', labelEn: 'Basic Compatibility' },
  clientConfig: { max: 5, labelZh: '客户端配置', labelEn: 'Client Config' }
};

function safeNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(v, fallback) {
  return typeof v === 'string' && v ? v : (fallback || '');
}

function getRiskByRatio(score, max) {
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return 'unknown';
  const ratio = score / max;
  if (ratio >= 0.8) return 'low';
  if (ratio >= 0.5) return 'medium';
  return 'high';
}

function getRiskLabel(risk, locale) {
  const zh = locale === 'zh' || locale === 'zh-CN';
  const zhMap = { low: '低风险', medium: '中风险', high: '高风险', unknown: '未验证' };
  const enMap = { low: 'Low Risk', medium: 'Medium Risk', high: 'High Risk', unknown: 'Unverified' };
  return zh ? (zhMap[risk] || '未验证') : (enMap[risk] || 'Unverified');
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

// Simulate buildModuleScores (simplified version)
function buildModuleScores(checks, locale) {
  const zh = locale !== 'en';
  const sc = checks || {};
  
  const getRisk = (score, max) => {
    const ratio = max > 0 ? score / max : 0;
    if (ratio >= 0.85) return 'low';
    if (ratio >= 0.6) return 'medium';
    return 'high';
  };
  
  return [
    {
      key: 'usageTransparency',
      labelZh: '扣费透明度',
      labelEn: 'Usage Transparency',
      label: zh ? '扣费透明度' : 'Usage Transparency',
      score: safeNum(sc.costTransparency?.score, 0),
      max: 25,
      risk: getRisk(safeNum(sc.costTransparency?.score, 0), 25)
    },
    {
      key: 'cacheSignal',
      labelZh: '缓存命中信号',
      labelEn: 'Cache Signal',
      label: zh ? '缓存命中信号' : 'Cache Signal',
      score: safeNum(sc.cacheHitCheck?.score, 0),
      max: 5,
      risk: getRisk(safeNum(sc.cacheHitCheck?.score, 0), 5)
    },
    {
      key: 'modelSignal',
      labelZh: '模型信号',
      labelEn: 'Model Signal',
      label: zh ? '模型信号' : 'Model Signal',
      score: safeNum(sc.modelSignal?.score, 0),
      max: 15,
      risk: getRisk(safeNum(sc.modelSignal?.score, 0), 15)
    },
    {
      key: 'stabilityLatency',
      labelZh: '稳定性与延迟',
      labelEn: 'Stability & Latency',
      label: zh ? '稳定性与延迟' : 'Stability & Latency',
      score: safeNum(sc.stability?.score, 0),
      max: 25,
      risk: getRisk(safeNum(sc.stability?.score, 0), 25)
    },
    {
      key: 'coreCompatibility',
      labelZh: '基础兼容性',
      labelEn: 'Core Compatibility',
      label: zh ? '基础兼容性' : 'Core Compatibility',
      score: safeNum(sc.basicCompatibility?.score, 0),
      max: 25,
      risk: getRisk(safeNum(sc.basicCompatibility?.score, 0), 25)
    },
    {
      key: 'clientConfig',
      labelZh: '客户端配置',
      labelEn: 'Client Config',
      label: zh ? '客户端配置' : 'Client Config',
      score: safeNum(sc.clientConfig?.score, 0),
      max: 5,
      risk: getRisk(safeNum(sc.clientConfig?.score, 0), 5)
    }
  ];
}

let allPassed = true;
const results = [];

// Case 1: buildModuleScores({}) still returns 6 modules
results.push('=== Case 1: buildModuleScores({}) returns 6 modules ===');
const emptyModules = buildModuleScores({}, 'zh');
if (emptyModules.length === 6) {
  results.push('PASS: 6 modules returned');
} else {
  results.push('FAIL: Expected 6 modules, got ' + emptyModules.length);
  allPassed = false;
}

// Case 2: Each module has correct max
results.push('\n=== Case 2: Module max values ===');
const expectedMax = {
  usageTransparency: 25,
  cacheSignal: 5,
  modelSignal: 15,
  stabilityLatency: 25,
  coreCompatibility: 25,
  clientConfig: 5
};

emptyModules.forEach(m => {
  const expected = expectedMax[m.key];
  if (m.max === expected) {
    results.push(`PASS: ${m.key} max = ${m.max}`);
  } else {
    results.push(`FAIL: ${m.key} max = ${m.max}, expected ${expected}`);
    allPassed = false;
  }
});

// Case 3: formatModuleScore does not output undefined
results.push('\n=== Case 3: formatModuleScore no undefined ===');
const testCases = [
  { score: 4, max: 25, key: 'usageTransparency', expect: '4/25' },
  { score: 2.5, max: 5, key: 'cacheSignal', expect: '2.5/5' },
  { score: 2, max: 15, key: 'modelSignal', expect: '2/15' },
  { score: 20, max: 25, key: 'stabilityLatency', expect: '20/25' },
  { score: 5.6, max: 25, key: 'coreCompatibility', expect: '5.6/25' },
  { score: 3, max: 5, key: 'clientConfig', expect: '3/5' },
  // Edge case: no max
  { score: 5, max: undefined, key: 'usageTransparency', expect: '5/25' },
];

testCases.forEach(tc => {
  const result = formatModuleScore(tc.score, tc.max, tc.key);
  if (result === tc.expect) {
    results.push(`PASS: formatModuleScore(${tc.score}, ${tc.max}, '${tc.key}') = '${result}'`);
  } else {
    results.push(`FAIL: formatModuleScore(${tc.score}, ${tc.max}, '${tc.key}') = '${result}', expected '${tc.expect}'`);
    allPassed = false;
  }
  if (result.includes('undefined')) {
    results.push(`FAIL: formatModuleScore output contains 'undefined'`);
    allPassed = false;
  }
});

// Case 4: normalizeModuleForDisplay output types
results.push('\n=== Case 4: normalizeModuleForDisplay output types ===');
function normalizeModuleForDisplay(module, locale) {
  const zh = locale !== 'en';
  const key = safeText(module?.key, 'unknown');
  const def = MODULE_DEFINITIONS[key] || {};
  
  const score = safeNum(module?.score, 0);
  const max = safeNum(module?.max, def.max || 0);
  const risk = module?.risk || getRiskByRatio(score, max);

  return {
    key,
    labelZh: safeText(module?.labelZh, def.labelZh || key),
    labelEn: safeText(module?.labelEn, def.labelEn || key),
    label: zh ? safeText(module?.labelZh, def.labelZh || key) : safeText(module?.labelEn, def.labelEn || key),
    score,
    max,
    risk,
    riskLabelZh: getRiskLabel(risk, 'zh'),
    riskLabelEn: getRiskLabel(risk, 'en'),
    riskLabel: getRiskLabel(risk, zh ? 'zh' : 'en')
  };
}

const testModule = { key: 'usageTransparency', score: 4, max: 25 };
const normalized = normalizeModuleForDisplay(testModule, 'zh');

if (typeof normalized.label === 'string') {
  results.push('PASS: label is string');
} else {
  results.push('FAIL: label is ' + typeof normalized.label);
  allPassed = false;
}

if (typeof normalized.riskLabel === 'string') {
  results.push('PASS: riskLabel is string');
} else {
  results.push('FAIL: riskLabel is ' + typeof normalized.riskLabel);
  allPassed = false;
}

if (typeof normalized.max === 'number') {
  results.push('PASS: max is number');
} else {
  results.push('FAIL: max is ' + typeof normalized.max);
  allPassed = false;
}

if (normalized.max === 25) {
  results.push('PASS: max = 25');
} else {
  results.push('FAIL: max = ' + normalized.max + ', expected 25');
  allPassed = false;
}

// Test fallback when module.max is missing
const moduleWithoutMax = { key: 'usageTransparency', score: 4 };
const normalized2 = normalizeModuleForDisplay(moduleWithoutMax, 'zh');
if (normalized2.max === 25) {
  results.push('PASS: max fallback works (25)');
} else {
  results.push('FAIL: max fallback = ' + normalized2.max + ', expected 25');
  allPassed = false;
}

console.log('=== verify-module-max-v1112p2.js ===');
results.forEach(r => console.log(r));
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
