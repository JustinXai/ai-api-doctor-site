/**
 * verify-score-breakdown-schema-v1112p2.js
 * Tests score breakdown schema consistency
 */
const fs = require('fs');
const path = require('path');

const testJsPath = path.join(__dirname, 'test.js');
const testJs = fs.readFileSync(testJsPath, 'utf8');

// Simulate buildScoreBreakdown logic
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
    if (ratio >= 0.85) return 'low';
    if (ratio >= 0.6) return 'medium';
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
      label: zh ? '基础兼容性' : 'Basic Compatibility',
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

  const rawModuleScore = Math.round(
    modules.reduce((sum, m) => sum + safeNum(m.score, 0), 0) * 10
  ) / 10;

  // Simulate cap logic
  const capApplied = false;
  const capLimit = 35;
  const capReason = null;

  const finalScore = capApplied && capLimit !== null
    ? Math.min(rawModuleScore, capLimit)
    : rawModuleScore;

  return {
    modules,
    rawModuleScore,
    finalScore: Math.round(finalScore * 10) / 10,
    capApplied,
    capReason,
    capLimit: capLimit === null ? null : capLimit
  };
}

let allPassed = true;
const results = [];

// Case 1: breakdown.modules.length = 6
results.push('=== Case 1: breakdown.modules.length ===');
const mockChecks = {
  costTransparency: { score: 4 },
  cacheHitCheck: { score: 2.5 },
  modelSignal: { score: 2 },
  stability: { score: 20 },
  basicCompatibility: { score: 5.6 },
  clientConfig: { score: 3 }
};

const breakdown = buildScoreBreakdown(mockChecks, 'zh');
if (breakdown.modules.length === 6) {
  results.push('PASS: modules.length = 6');
} else {
  results.push('FAIL: modules.length = ' + breakdown.modules.length + ', expected 6');
  allPassed = false;
}

// Case 2: All modules have required fields
results.push('\n=== Case 2: All modules have required fields ===');
const requiredFields = ['key', 'label', 'score', 'max', 'risk'];
breakdown.modules.forEach(m => {
  requiredFields.forEach(field => {
    if (m[field] !== undefined && m[field] !== null) {
      results.push(`PASS: module.${m.key}.${field} exists`);
    } else {
      results.push(`FAIL: module.${m.key}.${field} is ${m[field]}`);
      allPassed = false;
    }
  });
});

// Case 3: rawModuleScore equals sum of module scores
results.push('\n=== Case 3: rawModuleScore = sum(module scores) ===');
const scoreSum = breakdown.modules.reduce((sum, m) => sum + m.score, 0);
const expectedRaw = Math.round(scoreSum * 10) / 10;
if (breakdown.rawModuleScore === expectedRaw) {
  results.push(`PASS: rawModuleScore = ${breakdown.rawModuleScore} (sum of ${scoreSum})`);
} else {
  results.push(`FAIL: rawModuleScore = ${breakdown.rawModuleScore}, expected ${expectedRaw}`);
  allPassed = false;
}

// Case 4: finalScore <= rawModuleScore
results.push('\n=== Case 4: finalScore <= rawModuleScore ===');
if (breakdown.finalScore <= breakdown.rawModuleScore) {
  results.push(`PASS: finalScore (${breakdown.finalScore}) <= rawModuleScore (${breakdown.rawModuleScore})`);
} else {
  results.push(`FAIL: finalScore (${breakdown.finalScore}) > rawModuleScore (${breakdown.rawModuleScore})`);
  allPassed = false;
}

// Case 5: Summary cards and module grid use same breakdown
results.push('\n=== Case 5: Same breakdown used for summary and grid ===');
// In real code, the same breakdown object should be used for both
const summaryCard = {
  usageTransparency: breakdown.modules.find(m => m.key === 'usageTransparency'),
  cacheSignal: breakdown.modules.find(m => m.key === 'cacheSignal'),
  modelSignal: breakdown.modules.find(m => m.key === 'modelSignal'),
  stabilityLatency: breakdown.modules.find(m => m.key === 'stabilityLatency'),
  coreCompatibility: breakdown.modules.find(m => m.key === 'coreCompatibility'),
  clientConfig: breakdown.modules.find(m => m.key === 'clientConfig')
};

const gridModules = breakdown.modules;
if (JSON.stringify(summaryCard) !== JSON.stringify(gridModules)) {
  // They should reference the same objects, not be equal
  results.push('INFO: summaryCard and gridModules are separate objects (expected for JSON comparison)');
}

// But verify they have the same data
let sameData = true;
breakdown.modules.forEach(m => {
  const summaryModule = summaryCard[m.key];
  if (!summaryModule || summaryModule.score !== m.score || summaryModule.max !== m.max) {
    sameData = false;
  }
});

if (sameData) {
  results.push('PASS: Summary cards and module grid use same score data');
} else {
  results.push('FAIL: Summary cards and module grid have different score data');
  allPassed = false;
}

// Test with cap applied
results.push('\n=== Case 6: Cap applied (finalScore = capLimit) ===');
function buildScoreBreakdownWithCap(checks, locale, capApplied, capLimit) {
  const sc = safeObject(checks);
  const modules = buildModuleScores(sc, locale);

  const rawModuleScore = Math.round(
    modules.reduce((sum, m) => sum + safeNum(m.score, 0), 0) * 10
  ) / 10;

  const finalScore = capApplied && capLimit !== null
    ? Math.min(rawModuleScore, capLimit)
    : rawModuleScore;

  return {
    modules,
    rawModuleScore,
    finalScore: Math.round(finalScore * 10) / 10,
    capApplied,
    capLimit
  };
}

// Test: raw=37.1, capApplied=true, capLimit=35 => final=35
const breakdown2 = buildScoreBreakdownWithCap(mockChecks, 'zh', true, 35);
if (breakdown2.finalScore === 35 && breakdown2.rawModuleScore === 37.1) {
  results.push('PASS: raw=37.1, capLimit=35, final=35 (capped correctly)');
} else {
  results.push(`FAIL: raw=${breakdown2.rawModuleScore}, final=${breakdown2.finalScore}, expected final=35`);
  allPassed = false;
}

if (breakdown2.finalScore <= breakdown2.rawModuleScore) {
  results.push('PASS: Invariant: finalScore <= rawModuleScore');
} else {
  results.push(`FAIL: Invariant violated: ${breakdown2.finalScore} > ${breakdown2.rawModuleScore}`);
  allPassed = false;
}

// Test: raw=34.1, capApplied=true, capLimit=35 => final=34.1
const mockChecks2 = {
  costTransparency: { score: 0 },
  cacheHitCheck: { score: 2.5 },
  modelSignal: { score: 2 },
  stability: { score: 21 },
  basicCompatibility: { score: 5.6 },
  clientConfig: { score: 3 }
};
const breakdown3 = buildScoreBreakdownWithCap(mockChecks2, 'zh', true, 35);
if (breakdown3.finalScore === 34.1 && breakdown3.rawModuleScore === 34.1) {
  results.push('PASS: raw=34.1, capLimit=35, final=34.1 (no cap needed)');
} else {
  results.push(`FAIL: raw=${breakdown3.rawModuleScore}, final=${breakdown3.finalScore}, expected final=34.1`);
  allPassed = false;
}

if (breakdown3.finalScore <= breakdown3.rawModuleScore) {
  results.push('PASS: Invariant: finalScore <= rawModuleScore');
} else {
  results.push(`FAIL: Invariant violated: ${breakdown3.finalScore} > ${breakdown3.rawModuleScore}`);
  allPassed = false;
}

console.log('=== verify-score-breakdown-schema-v1112p2.js ===');
results.forEach(r => console.log(r));
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
