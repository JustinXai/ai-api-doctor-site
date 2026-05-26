/**
 * verify-score-invariant-v1113p3.js
 * Tests finalScore <= rawModuleScore invariant
 */
const fs = require('fs');
const path = require('path');

function round1(v) {
  return Math.round(v * 10) / 10;
}

function safeNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Simulate buildScoreBreakdown logic
function buildScoreBreakdownLogic(rawModuleScore, capResult) {
  const capDetected = capResult.reason !== null;
  const capLimit = safeNum(capResult.limit, null);
  // capEffective: cap only applies if raw is ABOVE the cap limit
  const capEffective = capDetected && capLimit !== null && rawModuleScore > capLimit;
  const capApplied = capEffective;
  const capReason = capResult.reason || null;

  let finalScore = capApplied && capLimit !== null
    ? Math.min(rawModuleScore, capLimit)
    : rawModuleScore;

  // Invariant: finalScore must never exceed rawModuleScore
  if (finalScore > rawModuleScore) {
    console.warn('[score invariant] finalScore > rawModuleScore, clamping', { finalScore, rawModuleScore });
    finalScore = rawModuleScore;
  }

  finalScore = round1(finalScore);

  return {
    rawModuleScore,
    finalScore,
    capDetected,
    capEffective,
    capApplied,
    capReason,
    capLimit
  };
}

let allPassed = true;
const results = [];

// Case 1: raw=33.1, capDetected=true, capLimit=35
// raw < capLimit, so cap should NOT apply
results.push('=== Case 1: raw=33.1, capLimit=35 (raw < cap) ===');
const case1 = buildScoreBreakdownLogic(33.1, { reason: 'response_format_incompatible', limit: 35, applied: true });
results.push(`  raw=${case1.rawModuleScore}, capDetected=${case1.capDetected}, capLimit=${case1.capLimit}`);
results.push(`  capEffective=${case1.capEffective}, capApplied=${case1.capApplied}`);
results.push(`  finalScore=${case1.finalScore}`);

if (case1.finalScore === 33.1) {
  results.push('PASS: finalScore = 33.1 (no cap applied because raw < capLimit)');
} else {
  results.push(`FAIL: finalScore = ${case1.finalScore}, expected 33.1`);
  allPassed = false;
}

if (case1.finalScore <= case1.rawModuleScore) {
  results.push('PASS: Invariant: finalScore <= rawModuleScore');
} else {
  results.push(`FAIL: Invariant violated: ${case1.finalScore} > ${case1.rawModuleScore}`);
  allPassed = false;
}

// Case 2: raw=55.1, capDetected=true, capLimit=35
// raw > capLimit, so cap should apply
results.push('\n=== Case 2: raw=55.1, capLimit=35 (raw > cap) ===');
const case2 = buildScoreBreakdownLogic(55.1, { reason: 'response_format_incompatible', limit: 35, applied: true });
results.push(`  raw=${case2.rawModuleScore}, capDetected=${case2.capDetected}, capLimit=${case2.capLimit}`);
results.push(`  capEffective=${case2.capEffective}, capApplied=${case2.capApplied}`);
results.push(`  finalScore=${case2.finalScore}`);

if (case2.finalScore === 35) {
  results.push('PASS: finalScore = 35 (capped)');
} else {
  results.push(`FAIL: finalScore = ${case2.finalScore}, expected 35`);
  allPassed = false;
}

if (case2.finalScore <= case2.rawModuleScore) {
  results.push('PASS: Invariant: finalScore <= rawModuleScore');
} else {
  results.push(`FAIL: Invariant violated: ${case2.finalScore} > ${case2.rawModuleScore}`);
  allPassed = false;
}

// Case 3: raw=55.1, capDetected=false
results.push('\n=== Case 3: raw=55.1, no cap ===');
const case3 = buildScoreBreakdownLogic(55.1, { reason: null, limit: null, applied: false });
results.push(`  raw=${case3.rawModuleScore}, capDetected=${case3.capDetected}, capLimit=${case3.capLimit}`);
results.push(`  finalScore=${case3.finalScore}`);

if (case3.finalScore === 55.1) {
  results.push('PASS: finalScore = 55.1 (no cap)');
} else {
  results.push(`FAIL: finalScore = ${case3.finalScore}, expected 55.1`);
  allPassed = false;
}

if (case3.finalScore <= case3.rawModuleScore) {
  results.push('PASS: Invariant: finalScore <= rawModuleScore');
} else {
  results.push(`FAIL: Invariant violated: ${case3.finalScore} > ${case3.rawModuleScore}`);
  allPassed = false;
}

// Case 4: Invariant test for various scenarios
results.push('\n=== Case 4: Invariant Tests ===');
const scenarios = [
  { raw: 0, cap: { reason: 'test', limit: 35, applied: true } },
  { raw: 34.9, cap: { reason: 'test', limit: 35, applied: true } },
  { raw: 35.0, cap: { reason: 'test', limit: 35, applied: true } },
  { raw: 35.1, cap: { reason: 'test', limit: 35, applied: true } },
  { raw: 100, cap: { reason: 'test', limit: 60, applied: true } },
  { raw: 60, cap: { reason: 'test', limit: 60, applied: true } },
  { raw: 59.9, cap: { reason: 'test', limit: 60, applied: true } },
];

scenarios.forEach((s, i) => {
  const result = buildScoreBreakdownLogic(s.raw, s.cap);
  const ok = result.finalScore <= result.rawModuleScore;
  const expectedFinal = result.capEffective ? Math.min(s.raw, s.cap.limit) : s.raw;
  results.push(`[${i+1}] raw=${s.raw}, cap=${s.cap.limit}, final=${result.finalScore} (expected ${expectedFinal}) => ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) {
    results.push(`    INVARIANT VIOLATION: ${result.finalScore} > ${result.rawModuleScore}`);
    allPassed = false;
  }
  if (result.finalScore !== round1(expectedFinal)) {
    results.push(`    WRONG VALUE: expected ${expectedFinal}`);
    allPassed = false;
  }
});

// Case 5: Test capEffective flag
results.push('\n=== Case 5: capEffective flag ===');
const capTests = [
  { raw: 33.1, capLimit: 35, expectedEffective: false },
  { raw: 35.0, capLimit: 35, expectedEffective: false },
  { raw: 35.1, capLimit: 35, expectedEffective: true },
  { raw: 55.1, capLimit: 35, expectedEffective: true },
];

capTests.forEach((t, i) => {
  const result = buildScoreBreakdownLogic(t.raw, { reason: 'test', limit: t.capLimit, applied: true });
  if (result.capEffective === t.expectedEffective) {
    results.push(`PASS: raw=${t.raw}, cap=${t.capLimit} => capEffective=${result.capEffective}`);
  } else {
    results.push(`FAIL: raw=${t.raw}, cap=${t.capLimit} => capEffective=${result.capEffective}, expected ${t.expectedEffective}`);
    allPassed = false;
  }
});

console.log('=== verify-score-invariant-v1113p3.js ===');
results.forEach(r => console.log(r));
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
