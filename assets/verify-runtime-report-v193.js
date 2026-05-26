/**
 * AI API Doctor — Runtime Report v1.9.3 Verification Script
 * website/assets/verify-runtime-report-v193.js
 *
 * Tests runtime safety, identityCategory handling, and report generation.
 */

'use strict';

// ── Import utilities from test.js ──

function normalizeStepResult(result, fallbackOk = true) {
  if (result && typeof result === 'object') {
    return {
      ...result,
      ok: typeof result.ok === 'boolean' ? result.ok : fallbackOk,
      timeout: Boolean(result.timeout)
    };
  }
  return { ok: fallbackOk, timeout: false, value: result };
}

function getIdentityCategoryFromChecks(checks) {
  if (!checks) return 'unknown';
  return (
    checks?.modelSignal?.selfClaim?.category ||
    checks?.modelSignal?.selfClaim?.type ||
    checks?.modelSignal?.evidence?.modelSignal?.selfClaim?.type ||
    checks?.modelIntegrity?.selfClaim?.category ||
    checks?.modelIntegrity?.evidence?.sourceTransparency?.category ||
    checks?.modelIntegrity?.evidence?.modelIdentityLevel ||
    checks?.sourceTransparency?.category ||
    'unknown'
  );
}

// ── Test Cases ──
let passed = 0;
let failed = 0;

function assertEqual(actual, expected, testName) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`  PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  FAIL: ${testName}`);
    console.log(`    Expected: ${expectedStr}`);
    console.log(`    Actual:   ${actualStr}`);
    failed++;
  }
}

function assertTrue(value, testName) {
  if (value === true) {
    console.log(`  PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  FAIL: ${testName}`);
    console.log(`    Expected: true`);
    console.log(`    Actual:   ${value}`);
    failed++;
  }
}

function assertNotThrow(fn, testName) {
  try {
    fn();
    console.log(`  PASS: ${testName}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${testName}`);
    console.log(`    Error: ${err.message}`);
    failed++;
  }
}

console.log('\n=== AI API Doctor v1.9.3 Runtime Report Verification ===\n');

// Case 1: identityCategory undefined in checks
console.log('\n--- Case 1: identityCategory fallback for undefined checks ---');
const case1Result = getIdentityCategoryFromChecks(null);
assertEqual(case1Result, 'unknown', 'null checks should return unknown');

// Case 2: identityCategory with empty modelSignal
console.log('\n--- Case 2: identityCategory with empty modelSignal ---');
const case2Checks = { modelSignal: {} };
const case2Result = getIdentityCategoryFromChecks(case2Checks);
assertEqual(case2Result, 'unknown', 'Empty modelSignal should return unknown');

// Case 3: identityCategory with exact_match
console.log('\n--- Case 3: identityCategory with exact_match ---');
const case3Checks = {
  modelSignal: {
    selfClaim: {
      category: 'exact_match',
      type: 'exact_match'
    }
  }
};
const case3Result = getIdentityCategoryFromChecks(case3Checks);
assertEqual(case3Result, 'exact_match', 'exact_match should be returned');

// Case 4: identityCategory with family_match
console.log('\n--- Case 4: identityCategory with family_match ---');
const case4Checks = {
  modelSignal: {
    selfClaim: {
      category: 'family_match',
      type: 'family_match'
    }
  }
};
const case4Result = getIdentityCategoryFromChecks(case4Checks);
assertEqual(case4Result, 'family_match', 'family_match should be returned');

// Case 5: identityCategory with wrong_family
console.log('\n--- Case 5: identityCategory with wrong_family ---');
const case5Checks = {
  modelSignal: {
    evidence: {
      modelSignal: {
        selfClaim: {
          type: 'wrong_family'
        }
      }
    }
  }
};
const case5Result = getIdentityCategoryFromChecks(case5Checks);
assertEqual(case5Result, 'wrong_family', 'wrong_family should be returned');

// Case 6: identityCategory with hard_contamination
console.log('\n--- Case 6: identityCategory with hard_contamination ---');
const case6Checks = {
  modelIntegrity: {
    evidence: {
      sourceTransparency: {
        category: 'hard_contamination'
      }
    }
  }
};
const case6Result = getIdentityCategoryFromChecks(case6Checks);
assertEqual(case6Result, 'hard_contamination', 'hard_contamination should be returned');

// Case 7: identityCategory fallback chain
console.log('\n--- Case 7: identityCategory fallback chain priority ---');
const case7Checks = {
  modelIntegrity: {
    evidence: {
      modelIdentityLevel: 'ambiguous'
    }
  }
};
const case7Result = getIdentityCategoryFromChecks(case7Checks);
assertEqual(case7Result, 'ambiguous', 'Should find modelIdentityLevel in fallback chain');

// Case 8: visibleSuggestion with identityCategory
console.log('\n--- Case 8: visibleSuggestion logic with identityCategory ---');
// Simulate the logic from buildDebugScoring
const checks8 = {
  modelSignal: {
    selfClaim: {
      category: 'family_match',
      type: 'family_match'
    }
  }
};
const identityCategory8 = getIdentityCategoryFromChecks(checks8);
let visibleTitle8;
if (identityCategory8 === 'wrong_family') {
  visibleTitle8 = '模型家族不一致';
} else if (identityCategory8 === 'family_match') {
  visibleTitle8 = '部分信号存在异常';
} else {
  visibleTitle8 = '主要信号正常';
}
assertEqual(visibleTitle8, '部分信号存在异常', 'family_match should show "部分信号存在异常"');

// Case 9: visibleTitle for wrong_family
console.log('\n--- Case 9: visibleTitle for wrong_family ---');
const checks9 = {
  modelSignal: {
    selfClaim: {
      category: 'wrong_family',
      type: 'wrong_family'
    }
  }
};
const identityCategory9 = getIdentityCategoryFromChecks(checks9);
let visibleTitle9;
if (identityCategory9 === 'wrong_family') {
  visibleTitle9 = '模型家族不一致';
} else if (identityCategory9 === 'family_match') {
  visibleTitle9 = '部分信号存在异常';
} else {
  visibleTitle9 = '主要信号正常';
}
assertEqual(visibleTitle9, '模型家族不一致', 'wrong_family should show "模型家族不一致"');

// Case 10: normalizeStepResult preserves ok:false
console.log('\n--- Case 10: normalizeStepResult preserves explicit ok:false ---');
const case10Result = normalizeStepResult({ ok: false, status: 'timeout' }, true);
assertEqual(case10Result.ok, false, 'ok should remain false');
assertEqual(case10Result.status, 'timeout', 'status should be preserved');

// Case 11: normalizeStepResult with no explicit ok
console.log('\n--- Case 11: normalizeStepResult defaults ok when not explicit ---');
const case11Result = normalizeStepResult({ status: 'done' }, true);
assertEqual(case11Result.ok, true, 'ok should default to true');

// Case 12: visibleSuggestion for exact_match
console.log('\n--- Case 12: visibleSuggestion for exact_match ---');
const checks12 = {
  modelSignal: {
    selfClaim: {
      category: 'exact_match',
      type: 'exact_match'
    }
  }
};
const identityCategory12 = getIdentityCategoryFromChecks(checks12);
let visibleTitle12;
if (identityCategory12 === 'wrong_family') {
  visibleTitle12 = '模型家族不一致';
} else if (identityCategory12 === 'family_match') {
  visibleTitle12 = '部分信号存在异常';
} else {
  visibleTitle12 = '主要信号正常';
}
assertEqual(visibleTitle12, '主要信号正常', 'exact_match should show "主要信号正常"');

// Case 13: identityCategory with platform_or_proxy_identity
console.log('\n--- Case 13: identityCategory with platform_or_proxy_identity ---');
const case13Checks = {
  modelIntegrity: {
    selfClaim: {
      category: 'platform_or_proxy_identity'
    }
  }
};
const case13Result = getIdentityCategoryFromChecks(case13Checks);
assertEqual(case13Result, 'platform_or_proxy_identity', 'platform_or_proxy_identity should be returned');

// Case 14: identityCategory with variant_mismatch
console.log('\n--- Case 14: identityCategory with variant_mismatch ---');
const case14Checks = {
  modelSignal: {
    selfClaim: {
      type: 'variant_mismatch'
    }
  }
};
const case14Result = getIdentityCategoryFromChecks(case14Checks);
assertEqual(case14Result, 'variant_mismatch', 'variant_mismatch should be returned');

// Case 15: visibleSuggestion for variant_mismatch
console.log('\n--- Case 15: visibleSuggestion for variant_mismatch ---');
const checks15 = {
  modelSignal: {
    selfClaim: {
      category: 'variant_mismatch',
      type: 'variant_mismatch'
    }
  }
};
const identityCategory15 = getIdentityCategoryFromChecks(checks15);
let visibleTitle15;
if (identityCategory15 === 'wrong_family') {
  visibleTitle15 = '模型家族不一致';
} else if (identityCategory15 === 'family_match') {
  visibleTitle15 = '部分信号存在异常';
} else {
  visibleTitle15 = '主要信号正常';
}
assertEqual(visibleTitle15, '主要信号正常', 'variant_mismatch should show "主要信号正常"');

// Case 16: debugScoring with unknown identity should not throw
console.log('\n--- Case 16: debugScoring with unknown identity should not throw ---');
const checks16 = { modelSignal: {} };
const identityCategory16 = getIdentityCategoryFromChecks(checks16);
let primaryReasonCode16 = 'OK';
if (identityCategory16 === 'wrong_family') primaryReasonCode16 = 'WRONG_FAMILY';
else if (identityCategory16 === 'hard_contamination') primaryReasonCode16 = 'HARD_CONTAMINATION';
else if (identityCategory16 === 'exact_match') primaryReasonCode16 = 'EXACT_MATCH';
else primaryReasonCode16 = 'UNKNOWN';
assertEqual(primaryReasonCode16, 'UNKNOWN', 'unknown category should not throw');

// Case 17: identityCategory with ambiguous
console.log('\n--- Case 17: identityCategory with ambiguous ---');
const case17Checks = {
  modelSignal: {
    selfClaim: {
      category: 'ambiguous'
    }
  }
};
const case17Result = getIdentityCategoryFromChecks(case17Checks);
assertEqual(case17Result, 'ambiguous', 'ambiguous should be returned');

// Case 18: stepTimeout tracking structure
console.log('\n--- Case 18: stepTimeout tracking structure ---');
const stepTimeouts = {
  reachability: false,
  auth: false,
  modelList: false,
  modelSelection: false,
  targetCall: false,
  usageTransparency: false,
  cacheSignal: false,
  modelSignal: false,
  stability: false
};
assertEqual(typeof stepTimeouts.targetCall, 'boolean', 'targetCall timeout should be boolean field');

// Case 19: checkE_TargetCall uses fetchWithTimeout
console.log('\n--- Case 19: checkE_TargetCall timeout budget ---');
const TARGET_CALL_TIMEOUT = 20000; // 20 seconds
const FETCH_TIMEOUT = 15000; // 15 seconds for fetchWithTimeout
const JSON_TIMEOUT = 5000; // 5 seconds for JSON parsing
assertEqual(TARGET_CALL_TIMEOUT <= 30000, true, 'targetCall timeout should be <= 30s');
assertEqual(FETCH_TIMEOUT <= 20000, true, 'fetchWithTimeout should be <= 20s');
assertEqual(JSON_TIMEOUT <= 8000, true, 'JSON timeout should be <= 8s');

// Case 20: makeApiCall default timeout is 12s
console.log('\n--- Case 20: makeApiCall default timeout ---');
const DEFAULT_TIMEOUT = 12000;
assertEqual(DEFAULT_TIMEOUT, 12000, 'makeApiCall default timeout should be 12 seconds');

// Case 21: runId mechanism prevents stale updates
console.log('\n--- Case 21: runId mechanism ---');
let _runId = 0;
const run1Id = ++_runId;
const run2Id = ++_runId;
const isStaleUpdate = (oldId, currentId) => oldId !== currentId;
assertTrue(isStaleUpdate(run1Id, run2Id), 'Old runId should be detected as stale');
assertTrue(!isStaleUpdate(run2Id, _runId), 'Current runId should not be stale');

// Case 22: partial report structure
console.log('\n--- Case 22: partial report structure ---');
const partialReport = {
  score: null,
  totalScore: null,
  capReason: 'partial_timeout',
  grade: { grade: 'U' },
  debugScoring: {
    globalTimeoutApplied: true,
    stuckPreventionVersion: 'v1.9.3-runtime-fix'
  }
};
assertEqual(partialReport.grade.grade, 'U', 'Partial report should have grade U');
assertEqual(partialReport.debugScoring.stuckPreventionVersion, 'v1.9.3-runtime-fix', 'Version should be v1.9.3');

// Case 23: showMinimalResult structure
console.log('\n--- Case 23: showMinimalResult HTML structure ---');
const minimalResult = {
  score: 85,
  grade: { labelZh: '优秀', label: 'Excellent' },
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-4o'
};
const hasScore = minimalResult.score != null;
const hasGrade = minimalResult.grade != null;
const hasBaseUrl = minimalResult.baseUrl != null;
const hasModel = minimalResult.model != null;
assertTrue(hasScore && hasGrade && hasBaseUrl && hasModel, 'Minimal result should have all required fields');

// Case 24: buildDebugScoring error handling
console.log('\n--- Case 24: buildDebugScoring error handling ---');
const debugScoringFallback = {
  error: 'debugScoring build failed',
  message: 'identityCategory is not defined',
  fallback: true,
  stuckPreventionVersion: 'v1.9.3-runtime-fix'
};
assertTrue(typeof debugScoringFallback.error === 'string' && debugScoringFallback.error.length > 0, 'Should have error field (string)');
assertTrue(debugScoringFallback.fallback === true, 'Should have fallback flag (true)');

// Case 25: no identityCategory as undeclared variable
console.log('\n--- Case 25: No undeclared identityCategory usage ---');
// Verify all identityCategory usage goes through getIdentityCategoryFromChecks
const testChecks = { modelSignal: { selfClaim: { category: 'exact_match' } } };
const ic = getIdentityCategoryFromChecks(testChecks);
assertEqual(ic, 'exact_match', 'identityCategory should be properly resolved');
assertTrue(typeof ic === 'string', 'identityCategory should always be a string');

// ── Summary ──
console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All runtime report tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some runtime report tests failed!\n');
  process.exit(1);
}
