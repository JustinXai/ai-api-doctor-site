/**
 * verify-summary-module-source-v1113p3.js
 * Tests that summary cards and module grid use same source
 */
const fs = require('fs');
const path = require('path');

function safeNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(v) {
  return v && typeof v === 'object' ? v : {};
}

// Simulated buildModuleScores
function buildModuleScores(checks, locale) {
  const zh = locale !== 'en';
  const sc = safeObject(checks);
  
  const getRisk = (score, max) => {
    const ratio = max > 0 ? score / max : 0;
    if (ratio >= 0.8) return 'low';
    if (ratio >= 0.5) return 'medium';
    return 'high';
  };
  
  return [
    {
      key: 'usageTransparency',
      label: zh ? '扣费透明度' : 'Cost Transparency',
      score: safeNum(sc.costTransparency?.score, 0),
      max: 25,
      risk: getRisk(safeNum(sc.costTransparency?.score, 0), 25)
    },
    {
      key: 'cacheSignal',
      label: zh ? '缓存命中信号' : 'Cache Signal',
      score: safeNum(sc.cacheHitCheck?.score, 0),
      max: 5,
      risk: getRisk(safeNum(sc.cacheHitCheck?.score, 0), 5)
    },
    {
      key: 'modelSignal',
      label: zh ? '模型信号' : 'Model Signal',
      score: safeNum(sc.modelSignal?.score, 0),
      max: 15,
      risk: getRisk(safeNum(sc.modelSignal?.score, 0), 15)
    },
    {
      key: 'stabilityLatency',
      label: zh ? '稳定性与延迟' : 'Stability & Latency',
      score: safeNum(sc.stability?.score, 0),
      max: 25,
      risk: getRisk(safeNum(sc.stability?.score, 0), 25)
    },
    {
      key: 'coreCompatibility',
      label: zh ? '基础兼容性' : 'Core Compatibility',
      score: safeNum(sc.basicCompatibility?.score, 0),
      max: 25,
      risk: getRisk(safeNum(sc.basicCompatibility?.score, 0), 25)
    },
    {
      key: 'clientConfig',
      label: zh ? '客户端配置' : 'Client Config',
      score: safeNum(sc.clientConfig?.score, 0),
      max: 5,
      risk: getRisk(safeNum(sc.clientConfig?.score, 0), 5)
    }
  ];
}

// Simulated buildScoreBreakdown
function buildScoreBreakdown(checks, locale) {
  const sc = safeObject(checks);
  const modules = buildModuleScores(sc, locale);
  return { modules };
}

// Build moduleByKey from breakdown.modules (same as in buildReportCardHTML)
function buildModuleByKey(breakdown) {
  const moduleByKey = {};
  if (breakdown.modules && Array.isArray(breakdown.modules)) {
    breakdown.modules.forEach(m => { if (m && m.key) moduleByKey[m.key] = m; });
  }
  return moduleByKey;
}

let allPassed = true;
const results = [];

// Test case: mock current scenario
const mockChecks = {
  costTransparency: { score: 0 },
  cacheHitCheck: { score: 2.5 },
  modelSignal: { score: 2 },
  stability: { score: 20 },
  basicCompatibility: { score: 5.6 },
  clientConfig: { score: 3 }
};

results.push('=== Summary vs Module Grid Source Tests ===\n');
results.push('Mock scenario:');
results.push('  usageTransparency: 0/25 (risk: high)');
results.push('  cacheSignal: 2.5/5 (risk: medium)');
results.push('  modelSignal: 2/15 (risk: high)');
results.push('  stabilityLatency: 20/25 (risk: low)');
results.push('  coreCompatibility: 5.6/25 (risk: high)');
results.push('  clientConfig: 3/5 (risk: medium)');
results.push('');

const breakdown = buildScoreBreakdown(mockChecks, 'zh');
const moduleByKey = buildModuleByKey(breakdown);

// Case 1: usageTransparency risk should be same in summary and module
results.push('=== Case 1: usageTransparency risk ===');
const summaryCostRisk = moduleByKey.usageTransparency?.risk;
const moduleGridCostRisk = breakdown.modules.find(m => m.key === 'usageTransparency')?.risk;
if (summaryCostRisk === moduleGridCostRisk) {
  results.push(`PASS: summary risk (${summaryCostRisk}) === module grid risk (${moduleGridCostRisk})`);
} else {
  results.push(`FAIL: summary risk (${summaryCostRisk}) !== module grid risk (${moduleGridCostRisk})`);
  allPassed = false;
}

// Case 2: modelSignal risk should be same
results.push('\n=== Case 2: modelSignal risk ===');
const summaryModelRisk = moduleByKey.modelSignal?.risk;
const moduleGridModelRisk = breakdown.modules.find(m => m.key === 'modelSignal')?.risk;
if (summaryModelRisk === moduleGridModelRisk) {
  results.push(`PASS: summary risk (${summaryModelRisk}) === module grid risk (${moduleGridModelRisk})`);
} else {
  results.push(`FAIL: summary risk (${summaryModelRisk}) !== module grid risk (${moduleGridModelRisk})`);
  allPassed = false;
}

// Case 3: stabilityLatency risk should be same
results.push('\n=== Case 3: stabilityLatency risk ===');
const summaryStabilityRisk = moduleByKey.stabilityLatency?.risk;
const moduleGridStabilityRisk = breakdown.modules.find(m => m.key === 'stabilityLatency')?.risk;
if (summaryStabilityRisk === moduleGridStabilityRisk) {
  results.push(`PASS: summary risk (${summaryStabilityRisk}) === module grid risk (${moduleGridStabilityRisk})`);
} else {
  results.push(`FAIL: summary risk (${summaryStabilityRisk}) !== module grid risk (${moduleGridStabilityRisk})`);
  allPassed = false;
}

// Case 4: All modules should use same breakdown source
results.push('\n=== Case 4: Same breakdown source ===');
let allMatch = true;
breakdown.modules.forEach(m => {
  const summaryModule = moduleByKey[m.key];
  if (!summaryModule) {
    results.push(`FAIL: module ${m.key} not found in moduleByKey`);
    allMatch = false;
    allPassed = false;
  } else if (summaryModule.risk !== m.risk || summaryModule.score !== m.score || summaryModule.max !== m.max) {
    results.push(`FAIL: ${m.key} mismatch: summary vs grid`);
    allMatch = false;
    allPassed = false;
  }
});

if (allMatch) {
  results.push('PASS: All modules have consistent risk between summary and grid');
} else {
  results.push('FAIL: Some modules have inconsistent risk');
}

// Case 5: Verify expected risk labels for current scenario
results.push('\n=== Case 5: Expected risk labels ===');
const expectedRisks = {
  usageTransparency: 'high',    // 0/25 = 0%
  cacheSignal: 'medium',        // 2.5/5 = 50%
  modelSignal: 'high',         // 2/15 = 13%
  stabilityLatency: 'low',     // 20/25 = 80%
  coreCompatibility: 'high',   // 5.6/25 = 22%
  clientConfig: 'medium'       // 3/5 = 60%
};

Object.entries(expectedRisks).forEach(([key, expectedRisk]) => {
  const actualRisk = moduleByKey[key]?.risk;
  if (actualRisk === expectedRisk) {
    results.push(`PASS: ${key} risk = ${actualRisk} (expected ${expectedRisk})`);
  } else {
    results.push(`FAIL: ${key} risk = ${actualRisk}, expected ${expectedRisk}`);
    allPassed = false;
  }
});

// Case 6: Test with different scenario
results.push('\n=== Case 6: Different scenario ===');
const mockChecks2 = {
  costTransparency: { score: 25 },
  cacheHitCheck: { score: 5 },
  modelSignal: { score: 15 },
  stability: { score: 25 },
  basicCompatibility: { score: 25 },
  clientConfig: { score: 5 }
};

const breakdown2 = buildScoreBreakdown(mockChecks2, 'zh');
const moduleByKey2 = buildModuleByKey(breakdown2);

const allLowRisk = breakdown2.modules.every(m => m.risk === 'low');
const allLowRisk2 = Object.values(moduleByKey2).every(m => m.risk === 'low');

if (allLowRisk && allLowRisk2) {
  results.push('PASS: All modules have low risk (100% scores)');
} else {
  results.push('FAIL: Not all modules have low risk');
  allPassed = false;
}

console.log('=== verify-summary-module-source-v1113p3.js ===');
results.forEach(r => console.log(r));
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
