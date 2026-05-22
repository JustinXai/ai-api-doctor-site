'use strict';

/*
 * AI API Doctor — v1.7 Mock Verification Script
 * Tests the new real-data weighted scoring system.
 */

console.log('═══════════════════════════════════════════════════════════');
console.log('  VERIFICATION SCRIPT — Scoring Logic Tests (v1.7)');
console.log('═══════════════════════════════════════════════════════════');

// ─── v1.7 Scoring Constants ────────────────────────

const WEIGHT = {
  coreCompatibility: 25,
  usageTransparency: 25,
  stabilityLatency: 25,
  modelIdentity: 15,
  cacheSignal: 5,
  clientConfig: 5,
};
WEIGHT.total = Object.values(WEIGHT).reduce((a, b) => a + b, 0);

const GRADES = [
  { min: 95, grade: 'A', label: 'Excellent', labelZh: '优秀', color: '#16a34a', bg: '#dcfce7' },
  { min: 90, grade: 'B', label: 'Good', labelZh: '良好', color: '#16a34a', bg: '#ecfeff' },
  { min: 70, grade: 'C', label: 'Fair', labelZh: '可用', color: '#d97706', bg: '#fef9c3' },
  { min: 60, grade: 'D', label: 'Limited', labelZh: '受限', color: '#ea580c', bg: '#ffedd5' },
  { min: 40, grade: 'E', label: 'Poor', labelZh: '较差', color: '#dc2626', bg: '#fee2e2' },
  { min: 0, grade: 'F', label: 'Failed', labelZh: '失败', color: '#dc2626', bg: '#fee2e2' },
];

function getScoreGrade(score) {
  for (const g of GRADES) {
    if (score >= g.min) return g;
  }
  return GRADES[GRADES.length - 1];
}

// ─── v1.7 Scoring Functions ────────────────────────

function calcFinalScore(checks) {
  const coreCompatScore = (checks.basicCompatibility?.score || 0) + (checks.targetCall?.score || 0);
  const coreCompatMax = 25;
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

  const final = Math.min(98,
    coreNorm * 0.25 +
    usageNorm * 0.25 +
    stabilityNorm * 0.25 +
    identityNorm * 0.15 +
    cacheNorm * 0.05 +
    clientNorm * 0.05
  );

  return { final: Math.round(final * 10) / 10 };
}

function applyCaps(rawScore, checks, modelIdInfo) {
  let cap = 98;
  let capReason = 'none';

  const targetWorks = (checks.targetCall?.score || 0) >= 11;
  const successSamples = (checks.stability?.evidence?.samples || []).filter(s => s.ok && s.hasContent).length;
  const totalSamples = (checks.stability?.evidence?.samples || []).length;
  const successRate = totalSamples > 0 ? successSamples / totalSamples : 0;

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

  // 3. Core chat/completions 403
  const hasCoreChat403 = checks.targetCall?.evidence?.httpStatus === 403;
  if (hasCoreChat403) {
    cap = 45;
    capReason = 'core_chat_403';
  }

  // 4. Core response is HTML/invalid JSON
  const coreResponseUnparseable = !checks.targetCall?.evidence?.responseParsed && (checks.targetCall?.evidence?.httpStatus === 200);
  if (coreResponseUnparseable) {
    cap = 45;
    capReason = 'response_not_json';
  }

  // 5. Current Model ID explicitly unavailable
  const targetHttpStatus = checks.targetCall?.evidence?.httpStatus;
  const targetOutput = (checks.targetCall?.evidence?.output || '').toLowerCase();
  const hasModelNotFound = targetHttpStatus === 404 ||
    targetOutput.includes('model not found') ||
    targetOutput.includes('no available model');
  if (hasModelNotFound) {
    cap = 50;
    capReason = 'model_not_found';
  }

  // 6. Stability sampling success rate <= 40%
  if (totalSamples >= 5 && successRate <= 0.4) {
    cap = 60;
    capReason = 'stability_failed';
  }

  return { capped: Math.min(Math.max(rawScore, 0), cap), capReason, capLimit: cap };
}

function mkCheck(cfg) {
  return {
    id: cfg.id,
    label: cfg.label || { zh: cfg.id, en: cfg.id },
    maxScore: cfg.maxScore || 0,
    score: cfg.score || 0,
    status: cfg.status || 'warning',
    details: cfg.details || [],
    deductions: cfg.deductions || [],
    evidence: cfg.evidence || {},
  };
}

// ─── Tests ──────────────────────────────────────────

let allPass = true;

function test(name, actual, expected, comparator = '=') {
  let pass = false;
  if (comparator === '>=') pass = actual >= expected;
  else if (comparator === '<=') pass = actual <= expected;
  else if (comparator === '>') pass = actual > expected;
  else if (comparator === '<') pass = actual < expected;
  else pass = actual === expected;
  
  const status = pass ? 'PASS ✓' : 'FAIL ✗';
  console.log(`${status}  ${name}`);
  if (!pass) {
    console.log(`       Expected: ${comparator} ${expected}, got: ${actual}`);
    allPass = false;
  }
}

// ─── 1. Scoring Constants ──────────────────────────

console.log('\n── 1. SCORING CONSTANTS ───────────────────────────────────');
console.log('WEIGHT:', JSON.stringify(WEIGHT, null, 2));
test('WEIGHT.total = 100', WEIGHT.total, 100);

const grade95 = getScoreGrade(95);
const grade50 = getScoreGrade(50);
console.log('\ngetScoreGrade(95):', JSON.stringify(grade95, null, 2));
console.log('getScoreGrade(50):', JSON.stringify(grade50, null, 2));

// ─── 2. Mock Cases ────────────────────────────────

console.log('\n── 2. MOCK CASES ─────────────────────────────────────────');

function runMockCase(name, checks, expectedScoreRange) {
  const { final } = calcFinalScore(checks);
  const { capped, capReason } = applyCaps(final, checks, {});
  const grade = getScoreGrade(capped);
  console.log(`\n[${name}]`);
  console.log(`  raw score: ${final}`);
  console.log(`  capped: ${capped}`);
  console.log(`  capReason: ${capReason}`);
  console.log(`  grade: ${grade.grade} - ${grade.label}`);
  
  if (expectedScoreRange) {
    if (expectedScoreRange.max !== undefined) {
      test(`${name} <= ${expectedScoreRange.max}`, capped, expectedScoreRange.max, '<=');
    }
    if (expectedScoreRange.min !== undefined) {
      test(`${name} >= ${expectedScoreRange.min}`, capped, expectedScoreRange.min, '>=');
    }
  }
  
  return { raw: final, capped, grade, capReason };
}

// Case CM: Excellent
runMockCase('CM (Excellent)', {
  reachability: mkCheck({ score: 12 }),
  basicCompatibility: mkCheck({ score: 7 }),
  targetCall: mkCheck({ score: 22 }),
  costTransparency: mkCheck({ score: 25 }),
  cacheHitCheck: mkCheck({ score: 5 }),
  modelIntegrity: mkCheck({ score: 15 }),
  stability: mkCheck({ score: 24, evidence: { samples: [{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true}] } }),
  clientConfig: mkCheck({ score: 5 }),
}, { min: 90 });

// Case CN: Excellent but with cap
runMockCase('CN (with cap)', {
  reachability: mkCheck({ score: 12 }),
  basicCompatibility: mkCheck({ score: 7 }),
  targetCall: mkCheck({ score: 22 }),
  costTransparency: mkCheck({ score: 25 }),
  cacheHitCheck: mkCheck({ score: 5 }),
  modelIntegrity: mkCheck({ score: 15 }),
  stability: mkCheck({ score: 24, evidence: { samples: [{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true}] } }),
  clientConfig: mkCheck({ score: 5 }),
  targetCall: mkCheck({ score: 22, evidence: { httpStatus: 404, output: 'model not found' } }),
}, { max: 50 });

// Case CO: Good with cap
runMockCase('CO (Good capped)', {
  reachability: mkCheck({ score: 12 }),
  basicCompatibility: mkCheck({ score: 7 }),
  targetCall: mkCheck({ score: 22 }),
  costTransparency: mkCheck({ score: 20 }),
  cacheHitCheck: mkCheck({ score: 4 }),
  modelIntegrity: mkCheck({ score: 12 }),
  stability: mkCheck({ score: 22, evidence: { samples: [{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true}] } }),
  clientConfig: mkCheck({ score: 4 }),
}, { min: 70 });

// Case CB: Basic compatibility failed
runMockCase('CB (basic compat failed)', {
  reachability: mkCheck({ score: 12 }),
  basicCompatibility: mkCheck({ score: 2 }),
  targetCall: mkCheck({ score: 22 }),
  costTransparency: mkCheck({ score: 25 }),
  cacheHitCheck: mkCheck({ score: 5 }),
  modelIntegrity: mkCheck({ score: 15 }),
  stability: mkCheck({ score: 24, evidence: { samples: [{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true}] } }),
  clientConfig: mkCheck({ score: 5 }),
}, { min: 70 });

// ─── 3. Cap Tests ───────────────────────────────────

console.log('\n── 3. CAP TESTS ──────────────────────────────────────────');

function runCapTest(name, checks, expectedCap, expectedReason) {
  const { final } = calcFinalScore(checks);
  const { capped, capReason, capLimit } = applyCaps(final, checks, {});
  console.log(`\n[${name}]`);
  console.log(`  capped: ${capped}`);
  console.log(`  capLimit: ${capLimit}`);
  console.log(`  capReason: ${capReason}`);
  
  test(`${name} capReason`, capReason, expectedReason);
  if (expectedCap !== undefined) {
    test(`${name} capLimit`, capLimit, expectedCap);
  }
}

// 401 Auth failure
runCapTest('401 Auth', {
  reachability: mkCheck({ score: 12 }),
  auth: mkCheck({ evidence: { modelsStatus: 401, chatStatus: 401 } }),
  targetCall: mkCheck({ score: 0, evidence: { httpStatus: 401 } }),
  costTransparency: mkCheck({ score: 0 }),
  stability: mkCheck({ score: 0 }),
  modelIntegrity: mkCheck({ score: 0 }),
}, 35, 'auth_401');

// 403 Core chat
runCapTest('403 Core Chat', {
  reachability: mkCheck({ score: 12 }),
  targetCall: mkCheck({ score: 0, evidence: { httpStatus: 403 } }),
  costTransparency: mkCheck({ score: 0 }),
  stability: mkCheck({ score: 0 }),
  modelIntegrity: mkCheck({ score: 0 }),
}, 45, 'core_chat_403');

// Model not found
runCapTest('Model Not Found', {
  reachability: mkCheck({ score: 12 }),
  targetCall: mkCheck({ score: 22, evidence: { httpStatus: 404, output: 'model not found' } }),
  costTransparency: mkCheck({ score: 25 }),
  stability: mkCheck({ score: 24, evidence: { samples: [{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true}] } }),
  modelIntegrity: mkCheck({ score: 12 }),
}, 50, 'model_not_found');

// Stability failed
runCapTest('Stability Failed (0/5)', {
  reachability: mkCheck({ score: 12 }),
  costTransparency: mkCheck({ score: 25 }),
  stability: mkCheck({ score: 0, evidence: { samples: [
    {ok:false,hasContent:false},{ok:false,hasContent:false},{ok:false,hasContent:false},{ok:false,hasContent:false},{ok:false,hasContent:false}
  ] } }),
  modelIntegrity: mkCheck({ score: 12 }),
}, 60, 'stability_failed');

// ─── 4. NO CAP Tests (Soft issues) ─────────────────

console.log('\n── 4. NO CAP TESTS (Soft issues should NOT trigger cap) ──────────────────────────');

// Usage missing should NOT cap
runCapTest('Usage Missing (no cap)', {
  reachability: mkCheck({ score: 12 }),
  basicCompatibility: mkCheck({ score: 7 }),
  targetCall: mkCheck({ score: 22 }),
  costTransparency: mkCheck({ score: 10, evidence: {} }), // usage missing
  stability: mkCheck({ score: 24, evidence: { samples: [{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true}] } }),
  modelIntegrity: mkCheck({ score: 12 }),
}, 98, 'none');

// family_match should NOT cap
runCapTest('family_match (no cap)', {
  reachability: mkCheck({ score: 12 }),
  basicCompatibility: mkCheck({ score: 7 }),
  targetCall: mkCheck({ score: 22 }),
  costTransparency: mkCheck({ score: 25 }),
  stability: mkCheck({ score: 24, evidence: { samples: [{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true}] } }),
  modelIntegrity: mkCheck({ score: 12, evidence: { modelIdentityLevel: 'family_match' } }),
}, 98, 'none');

// variant_mismatch should NOT cap
runCapTest('variant_mismatch (no cap)', {
  reachability: mkCheck({ score: 12 }),
  basicCompatibility: mkCheck({ score: 7 }),
  targetCall: mkCheck({ score: 22 }),
  costTransparency: mkCheck({ score: 25 }),
  stability: mkCheck({ score: 24, evidence: { samples: [{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true}] } }),
  modelIntegrity: mkCheck({ score: 8, evidence: { modelIdentityLevel: 'variant_mismatch' } }),
}, 98, 'none');

// platform_or_proxy_identity should NOT cap
runCapTest('platform_or_proxy_identity (no cap)', {
  reachability: mkCheck({ score: 12 }),
  basicCompatibility: mkCheck({ score: 7 }),
  targetCall: mkCheck({ score: 22 }),
  costTransparency: mkCheck({ score: 25 }),
  stability: mkCheck({ score: 24, evidence: { samples: [{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true},{ok:true,hasContent:true}] } }),
  modelIntegrity: mkCheck({ score: 10, evidence: { modelIdentityLevel: 'platform_or_proxy_identity' } }),
}, 98, 'none');

// ─── Summary ───────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════════════');
console.log(allPass ? '  All tests passed: YES ✓' : '  Some tests failed: NO ✗');
console.log('═══════════════════════════════════════════════════════════');
process.exit(allPass ? 0 : 1);
