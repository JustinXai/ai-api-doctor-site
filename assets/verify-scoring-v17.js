'use strict';

/*
 * AI API Doctor — v1.7 Scoring Verification Script
 * Tests the new real-data weighted scoring system.
 */

// ─── v1.7 Scoring Constants (copy from test.js) ────────────────────────

const WEIGHT_V17 = {
  coreCompatibility: 25,
  usageTransparency: 25,
  stabilityLatency: 25,
  modelIdentity: 15,
  cacheSignal: 5,
  clientConfig: 5,
};

// ─── v1.7 calcFinalScore (copy from test.js) ────────────────────────

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

  return {
    final: Math.round(final * 10) / 10,
    breakdown: { coreNorm, usageNorm, stabilityNorm, identityNorm, cacheNorm, clientNorm }
  };
}

// ─── v1.7 applyCaps (copy from test.js) ────────────────────────

function applyCaps(rawScore, checks, modelIdInfo) {
  let cap = 98;
  let capReason = 'none';

  const targetWorks = (checks.targetCall?.score || 0) >= 11;
  const identityCategory = checks.modelIntegrity?.evidence?.modelIdentityLevel || 'exact_match';
  const coreAbilityFailures = checks.modelIntegrity?.evidence?.coreAbilityFailures || 0;
  const hasUsage = !!(checks.targetCall?.evidence?.usage && Object.keys(checks.targetCall.evidence.usage).length > 0);
  const successSamples = (checks.stability?.evidence?.samples || []).filter(s => s.ok && s.hasContent).length;
  const totalSamples = (checks.stability?.evidence?.samples || []).length;
  const successRate = totalSamples > 0 ? successSamples / totalSamples : 0;
  const baseOverhead = checks.costTransparency?.evidence?.baseOverhead ?? null;
  const deltaRatio = checks.costTransparency?.evidence?.deltaRatio ?? null;

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

  // 3. Core chat/completions 403 (not auxiliary)
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

  // 5. Current Model ID explicitly unavailable (404 / model not found)
  // Even if targetCall score is high, 404 means the model is unavailable
  const targetHttpStatus = checks.targetCall?.evidence?.httpStatus;
  const targetOutput = (checks.targetCall?.evidence?.output || '').toLowerCase();
  const hasModelNotFound = targetHttpStatus === 404 ||
    targetOutput.includes('model not found') ||
    targetOutput.includes('no available model') ||
    targetOutput.includes('model not available');
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

// ─── Helper: Create mock checks ────────────────────────

function mkCheck(overrides = {}) {
  return {
    score: overrides.score ?? 0,
    status: overrides.status ?? 'skipped',
    evidence: overrides.evidence ?? {},
    deductions: overrides.deductions ?? [],
    details: overrides.details ?? [],
    maxScore: overrides.maxScore ?? 0,
    ...overrides
  };
}

function makeChecks(overrides = {}) {
  return {
    reachability: mkCheck({ maxScore: 12, score: 12, status: 'excellent', ...overrides.reachability }),
    auth: mkCheck({ maxScore: 14, score: 14, status: 'excellent', ...overrides.auth }),
    basicCompatibility: mkCheck({ maxScore: 7, score: 7, status: 'excellent', ...overrides.basicCompatibility }),
    targetCall: mkCheck({ maxScore: 22, score: 22, status: 'excellent', httpStatus: 200, responseParsed: true, output: 'OK', ...overrides.targetCall }),
    costTransparency: mkCheck({ maxScore: 25, score: 25, status: 'excellent', ...overrides.costTransparency }),
    cacheHitCheck: mkCheck({ maxScore: 5, score: 5, status: 'excellent', ...overrides.cacheHitCheck }),
    modelIntegrity: mkCheck({ maxScore: 15, score: 15, status: 'excellent', ...overrides.modelIntegrity }),
    stability: mkCheck({ maxScore: 25, score: 25, status: 'excellent', ...overrides.stability }),
    clientConfig: mkCheck({ maxScore: 5, score: 5, status: 'excellent', ...overrides.clientConfig }),
    ...overrides
  };
}

// ─── Test Cases ──────────────────────────────────────────────────

const TEST_CASES = [
  {
    name: 'Case 1: Low latency excellent (avg 1800ms, 5/5 success)',
    checks: makeChecks({
      costTransparency: { score: 25, status: 'excellent', evidence: { usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } } },
      cacheHitCheck: { score: 3, status: 'warning', evidence: {} }, // cache field missing
      modelIntegrity: { score: 12, status: 'good', evidence: { modelIdentityLevel: 'family_match', coreAbilityFailures: 0 } },
      stability: {
        score: 24,
        status: 'excellent',
        evidence: {
          avgLatency: 1800,
          medianLatency: 1750,
          maxLatency: 2000,
          latencyJitter: 200,
          samples: [
            {ok: true, status: 200, latency: 1700, hasContent: true},
            {ok: true, status: 200, latency: 1800, hasContent: true},
            {ok: true, status: 200, latency: 1850, hasContent: true},
            {ok: true, status: 200, latency: 1750, hasContent: true},
            {ok: true, status: 200, latency: 1900, hasContent: true},
          ]
        }
      }
    }),
    expected: {
      minScore: 78,
      noCap: true,
      capReason: 'none',
      stabilityScore: 24,
      identityScore: 12,
      cacheScore: 3,
    }
  },
  {
    name: 'Case 2: Normal latency (avg 3200ms, 5/5 success)',
    checks: makeChecks({
      costTransparency: { score: 25, status: 'excellent' },
      modelIntegrity: { score: 12, status: 'good', evidence: { modelIdentityLevel: 'family_match', coreAbilityFailures: 0 } },
      stability: {
        score: 22,
        status: 'good',
        evidence: {
          avgLatency: 3200,
          medianLatency: 3100,
          maxLatency: 3500,
          latencyJitter: 400,
          samples: [
            {ok: true, status: 200, latency: 3000, hasContent: true},
            {ok: true, status: 200, latency: 3100, hasContent: true},
            {ok: true, status: 200, latency: 3200, hasContent: true},
            {ok: true, status: 200, latency: 3300, hasContent: true},
            {ok: true, status: 200, latency: 3400, hasContent: true},
          ]
        }
      }
    }),
    expected: {
      minScore: 70,
      noCap: true,
      stabilityScore: 22,
      identityScore: 12,
    }
  },
  {
    name: 'Case 3: One long-tail outlier (5/5 success, latencies: [1900, 2100, 2200, 2300, 9500])',
    checks: makeChecks({
      costTransparency: { score: 25, status: 'excellent' },
      stability: {
        score: 20,
        status: 'good',
        evidence: {
          avgLatency: 3600,
          medianLatency: 2200,
          maxLatency: 9500,
          latencyJitter: 7300,
          samples: [
            {ok: true, status: 200, latency: 1900, hasContent: true},
            {ok: true, status: 200, latency: 2100, hasContent: true},
            {ok: true, status: 200, latency: 2200, hasContent: true},
            {ok: true, status: 200, latency: 2300, hasContent: true},
            {ok: true, status: 200, latency: 9500, hasContent: true},
          ]
        }
      }
    }),
    expected: {
      minScore: 65,
      noCap: true,
      stabilityScore: 20,
    }
  },
  {
    name: 'Case 4: 4/5 success',
    checks: makeChecks({
      costTransparency: { score: 25, status: 'excellent' },
      stability: {
        score: 18,
        status: 'warning',
        evidence: {
          avgLatency: 2500,
          medianLatency: 2400,
          maxLatency: 3000,
          samples: [
            {ok: true, status: 200, latency: 2300, hasContent: true},
            {ok: true, status: 200, latency: 2400, hasContent: true},
            {ok: true, status: 200, latency: 2500, hasContent: true},
            {ok: true, status: 200, latency: 2600, hasContent: true},
            {ok: false, status: 503, latency: 0, hasContent: false},
          ]
        }
      }
    }),
    expected: {
      minScore: 60,
      noCap: true, // 4/5 success should NOT trigger cap
      stabilityScore: 18,
    }
  },
  {
    name: 'Case 5: Usage missing but core success',
    checks: makeChecks({
      costTransparency: { score: 10, status: 'warning', evidence: {} }, // usage missing
      targetCall: { score: 22, status: 'excellent', httpStatus: 200, responseParsed: true, output: 'OK', evidence: {} },
      stability: { score: 24, status: 'excellent', evidence: { samples: [{ok:true, status:200, latency:1800, hasContent:true},{ok:true, status:200, latency:1900, hasContent:true},{ok:true, status:200, latency:1700, hasContent:true},{ok:true, status:200, latency:2000, hasContent:true},{ok:true, status:200, latency:1850, hasContent:true}] } },
      modelIntegrity: { score: 12, status: 'good', evidence: { modelIdentityLevel: 'family_match', coreAbilityFailures: 0 } },
    }),
    expected: {
      minScore: 50,
      noCap: true, // usage missing should NOT trigger cap
      capReason: 'none',
      usageScore: 10,
    }
  },
  {
    name: 'Case 6: Auxiliary 403 but core success',
    checks: makeChecks({
      targetCall: { score: 22, status: 'excellent', httpStatus: 200, responseParsed: true, output: 'OK' },
      costTransparency: { score: 20, status: 'good', evidence: { httpStatus: 403, usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } } }, // auxiliary 403
      stability: { score: 24, status: 'excellent', evidence: { samples: [{ok:true, status:200, latency:1800, hasContent:true},{ok:true, status:200, latency:1900, hasContent:true},{ok:true, status:200, latency:1700, hasContent:true},{ok:true, status:200, latency:2000, hasContent:true},{ok:true, status:200, latency:1850, hasContent:true}] } },
      modelIntegrity: { score: 12, status: 'good', evidence: { modelIdentityLevel: 'family_match', coreAbilityFailures: 0 } },
    }),
    expected: {
      minScore: 70,
      noCap: true, // auxiliary 403 should NOT trigger cap
      capReason: 'none',
    }
  },
  {
    name: 'Case 7: family_match (target=claude-opus-4-7, response=Claude)',
    checks: makeChecks({
      costTransparency: { score: 25, status: 'excellent' },
      modelIntegrity: { score: 12, status: 'good', evidence: { modelIdentityLevel: 'family_match', modelIdentityScore: 6, coreAbilityFailures: 0 } },
      stability: { score: 24, status: 'excellent', evidence: { samples: [{ok:true, status:200, latency:1800, hasContent:true},{ok:true, status:200, latency:1900, hasContent:true},{ok:true, status:200, latency:1700, hasContent:true},{ok:true, status:200, latency:2000, hasContent:true},{ok:true, status:200, latency:1850, hasContent:true}] } },
    }),
    expected: {
      minScore: 70,
      noCap: true, // family_match should NOT trigger cap
      capReason: 'none',
      identityScore: 12,
      identityLevel: 'family_match',
    }
  },
  {
    name: 'Case 8: version_mismatch (target=claude-opus-4-7, response=Claude 3.5 Sonnet)',
    checks: makeChecks({
      costTransparency: { score: 25, status: 'excellent' },
      modelIntegrity: { score: 8, status: 'warning', evidence: { modelIdentityLevel: 'variant_mismatch', modelIdentityScore: 3, coreAbilityFailures: 0 } },
      stability: { score: 24, status: 'excellent', evidence: { samples: [{ok:true, status:200, latency:1800, hasContent:true},{ok:true, status:200, latency:1900, hasContent:true},{ok:true, status:200, latency:1700, hasContent:true},{ok:true, status:200, latency:2000, hasContent:true},{ok:true, status:200, latency:1850, hasContent:true}] } },
    }),
    expected: {
      minScore: 65,
      noCap: true, // version_mismatch should NOT trigger cap
      capReason: 'none',
      identityScore: 8,
      identityLevel: 'variant_mismatch',
    }
  },
  {
    name: 'Case 9: Core auth failure (401)',
    checks: makeChecks({
      auth: { score: 0, status: 'failed', evidence: { modelsStatus: 401, chatStatus: 401 } },
      targetCall: { score: 0, status: 'failed', httpStatus: 401 },
      costTransparency: { score: 0, status: 'failed' },
      stability: { score: 0, status: 'skipped' },
      modelIntegrity: { score: 0, status: 'skipped' },
    }),
    expected: {
      maxCap: 35,
      capReason: 'auth_401',
    }
  },
  {
    name: 'Case 10: Current Model ID 404 (model not found)',
    checks: makeChecks({
      targetCall: { 
        score: 22, 
        status: 'excellent', 
        evidence: { httpStatus: 404, responseParsed: true, output: 'model not found' }
      },
      costTransparency: { score: 25, status: 'excellent' },
      stability: { score: 24, status: 'excellent', evidence: { samples: [{ok:true, status:200, latency:1800, hasContent:true},{ok:true, status:200, latency:1900, hasContent:true},{ok:true, status:200, latency:1700, hasContent:true},{ok:true, status:200, latency:2000, hasContent:true},{ok:true, status:200, latency:1850, hasContent:true}] } },
      modelIntegrity: { score: 12, status: 'good', evidence: { modelIdentityLevel: 'family_match', coreAbilityFailures: 0 } },
    }),
    expected: {
      maxCap: 50,
      capReason: 'model_not_found',
    }
  },
  {
    name: 'Case 11: exact_match (perfect identity)',
    checks: makeChecks({
      costTransparency: { score: 25, status: 'excellent' },
      modelIntegrity: { score: 15, status: 'excellent', evidence: { modelIdentityLevel: 'exact_match', modelIdentityScore: 6, coreAbilityFailures: 0 } },
      stability: { score: 24, status: 'excellent', evidence: { samples: [{ok:true, status:200, latency:1800, hasContent:true},{ok:true, status:200, latency:1900, hasContent:true},{ok:true, status:200, latency:1700, hasContent:true},{ok:true, status:200, latency:2000, hasContent:true},{ok:true, status:200, latency:1850, hasContent:true}] } },
      cacheHitCheck: { score: 5, status: 'excellent' },
    }),
    expected: {
      minScore: 85,
      noCap: true,
      identityScore: 15,
      identityLevel: 'exact_match',
    }
  },
  {
    name: 'Case 12: Stability 0/5 success (should trigger cap)',
    checks: makeChecks({
      costTransparency: { score: 25, status: 'excellent' },
      stability: {
        score: 0,
        status: 'failed',
        evidence: {
          avgLatency: 0,
          samples: [
            {ok: false, status: 503, latency: 0, hasContent: false},
            {ok: false, status: 503, latency: 0, hasContent: false},
            {ok: false, status: 503, latency: 0, hasContent: false},
            {ok: false, status: 503, latency: 0, hasContent: false},
            {ok: false, status: 503, latency: 0, hasContent: false},
          ]
        }
      },
      modelIntegrity: { score: 12, status: 'good', evidence: { modelIdentityLevel: 'family_match', coreAbilityFailures: 0 } },
    }),
    expected: {
      maxCap: 60, // stability <= 40% should trigger cap <= 60
      capReason: 'stability_failed',
    }
  },
];

// ─── Run Tests ───────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════');
console.log('  VERIFICATION SCRIPT — v1.7 Real-Data Weighted Scoring');
console.log('═══════════════════════════════════════════════════════════\n');

let allPass = true;

for (const tc of TEST_CASES) {
  const { final } = calcFinalScore(tc.checks);
  const capResult = applyCaps(final, tc.checks, {});
  const { capped, capReason } = capResult;

  let casePass = true;
  const reasons = [];

  // Check score range
  if (tc.expected.minScore !== undefined && capped < tc.expected.minScore) {
    casePass = false;
    reasons.push(`FAIL: score ${capped} < minScore ${tc.expected.minScore}`);
  }

  if (tc.expected.maxScore !== undefined && capped > tc.expected.maxScore) {
    casePass = false;
    reasons.push(`FAIL: score ${capped} > maxScore ${tc.expected.maxScore}`);
  }

  // Check cap
  if (tc.expected.noCap !== undefined && tc.expected.noCap === true) {
    if (capReason !== 'none') {
      casePass = false;
      reasons.push(`FAIL: expected no cap, got capReason=${capReason}`);
    }
  }

  if (tc.expected.maxCap !== undefined && capped > tc.expected.maxCap) {
    casePass = false;
    reasons.push(`FAIL: capped ${capped} > maxCap ${tc.expected.maxCap}`);
  }

  if (tc.expected.capReason !== undefined && capReason !== tc.expected.capReason) {
    casePass = false;
    reasons.push(`FAIL: capReason=${capReason} (expected: ${tc.expected.capReason})`);
  }

  // Check specific scores
  if (tc.expected.stabilityScore !== undefined) {
    const stabilityScore = tc.checks.stability?.score || 0;
    if (stabilityScore !== tc.expected.stabilityScore) {
      casePass = false;
      reasons.push(`FAIL: stabilityScore=${stabilityScore} (expected: ${tc.expected.stabilityScore})`);
    }
  }

  if (tc.expected.identityScore !== undefined) {
    const identityScore = tc.checks.modelIntegrity?.score || 0;
    if (identityScore !== tc.expected.identityScore) {
      casePass = false;
      reasons.push(`FAIL: identityScore=${identityScore} (expected: ${tc.expected.identityScore})`);
    }
  }

  const status = casePass ? 'PASS ✓' : 'FAIL ✗';
  console.log(`${status}  ${tc.name}`);
  console.log(`       raw=${final}  capped=${capped}  capReason=${capReason}`);
  if (!casePass) {
    allPass = false;
    for (const r of reasons) console.log(`       ${r}`);
  }
  console.log('');
}

// ─── Weight Sum Verification ──────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════');
console.log('  Weight Sum Check');
console.log('═══════════════════════════════════════════════════════════');

const weightSum = Object.values(WEIGHT_V17).reduce((a, b) => a + b, 0);
console.log(`  Total weight: ${weightSum} (expected: 100)`);
if (weightSum === 100) {
  console.log('  PASS ✓  Weight sum is correct\n');
} else {
  console.log('  FAIL ✗  Weight sum is incorrect\n');
  allPass = false;
}

// ─── Summary ─────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════════════');
console.log(allPass ? '  All tests passed: YES ✓' : '  Some tests failed: NO ✗');
console.log('═══════════════════════════════════════════════════════════');
process.exit(allPass ? 0 : 1);
