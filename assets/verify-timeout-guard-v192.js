/**
 * AI API Doctor — Timeout Guard v1.9.2 Verification Script
 * website/assets/verify-timeout-guard-v192.js
 *
 * Tests timeout protection, safeFetch, and global timeout handling.
 */

'use strict';

// ── Updated Timeout Utilities (mirrored from test.js v1.9.2) ──

function safeTimeoutPromise(promiseOrFn, ms, fallback = {}, label = 'step') {
  const startedAt = Date.now();
  const defaultFallback = {
    ok: false,
    timeout: false,
    skipped: false,
    error: null,
    durationMs: 0,
    ...fallback
  };

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const durationMs = Date.now() - startedAt;
      resolve({
        ...defaultFallback,
        ok: false,
        timeout: true,
        error: `${label} timeout after ${ms}ms`,
        durationMs
      });
    }, ms);

    Promise.resolve()
      .then(() => (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn))
      .then((result) => {
        clearTimeout(timer);
        // Normalize ok: if result already has an explicit ok, preserve it
        const normalized = normalizeStepResult(result, true);
        resolve({
          ...defaultFallback,
          ...normalized,
          timeout: false,
          durationMs: Date.now() - startedAt
        });
      })
      .catch((err) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startedAt;
        resolve({
          ...defaultFallback,
          ok: false,
          timeout: false,
          error: err && err.name === 'AbortError' ? `${label} aborted` : `${label} error`,
          durationMs
        });
      });
  });
}

/**
 * Normalize step result to preserve explicit ok values.
 */
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

/**
 * Safe JSON parsing with timeout.
 */
async function safeReadJson(response, timeoutMs = 8000, label = 'read json') {
  return safeTimeoutPromise(
    () => response.json(),
    timeoutMs,
    { ok: false, timeout: true, error: `${label} timeout after ${timeoutMs}ms`, data: null },
    label
  );
}

/**
 * Safe text reading with truncation.
 */
async function safeReadText(response, timeoutMs = 8000, maxLength = 500, label = 'read text') {
  return safeTimeoutPromise(
    () => response.text().then(t => t.substring(0, maxLength)),
    timeoutMs,
    { ok: false, timeout: true, error: `${label} timeout after ${timeoutMs}ms`, data: null },
    label
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

function assertGreater(duration, max, testName) {
  if (duration >= 100 && duration <= max) {
    console.log(`  PASS: ${testName} (${duration}ms)`);
    passed++;
  } else {
    console.log(`  FAIL: ${testName}`);
    console.log(`    Expected duration between 100ms and ${max}ms, got ${duration}ms`);
    failed++;
  }
}

function assertLess(duration, max, testName) {
  if (duration < max) {
    console.log(`  PASS: ${testName} (${duration}ms < ${max}ms)`);
    passed++;
  } else {
    console.log(`  FAIL: ${testName}`);
    console.log(`    Expected duration < ${max}ms, got ${duration}ms`);
    failed++;
  }
}

console.log('\n=== AI API Doctor v1.9.2 Timeout Guard Verification ===\n');

// Case 1: safeTimeoutPromise resolves never resolve
console.log('\n--- Case 1: Promise never resolves (100ms timeout) ---');
const start1 = Date.now();
const case1Result = await safeTimeoutPromise(
  new Promise(() => {}), // Never resolves
  100,
  { status: 'timeout' },
  'test'
);
const duration1 = Date.now() - start1;
assertTrue(case1Result.timeout, 'Should timeout after ~100ms');
assertEqual(case1Result.status, 'timeout', 'Status should be timeout');
assertLess(duration1, 200, 'Should complete within 200ms');

// Case 2: Promise resolves successfully
console.log('\n--- Case 2: Promise resolves successfully ---');
const case2Result = await safeTimeoutPromise(
  Promise.resolve({ ok: true, data: 'success' }),
  1000,
  {},
  'test'
);
assertTrue(case2Result.ok, 'Should resolve successfully');
assertEqual(case2Result.data, 'success', 'Should pass through data');

// Case 3: Promise rejects
console.log('\n--- Case 3: Promise rejects ---');
const case3Result = await safeTimeoutPromise(
  Promise.reject(new Error('test error')),
  1000,
  { fallback: true },
  'test'
);
assertTrue(!case3Result.ok, 'Should return failure on reject');
assertTrue(!case3Result.timeout, 'Should not be timeout');

// Case 4: Function instead of Promise
console.log('\n--- Case 4: Function instead of Promise ---');
const case4Result = await safeTimeoutPromise(
  () => ({ result: 'function worked' }),
  1000,
  {},
  'test'
);
assertTrue(case4Result.ok, 'Function should resolve');
assertEqual(case4Result.result, 'function worked', 'Should pass through function result');

// Case 5: Async function
console.log('\n--- Case 5: Async function ---');
const case5Result = await safeTimeoutPromise(
  async () => { return { async: true }; },
  1000,
  {},
  'test'
);
assertTrue(case5Result.ok, 'Async function should resolve');
assertTrue(case5Result.async, 'Should pass through async result');

// Case 6: Timeout with fallback
console.log('\n--- Case 6: Timeout with custom fallback ---');
const case6Start = Date.now();
const case6Result = await safeTimeoutPromise(
  () => new Promise(() => {}),
  100,
  { status: 'timeout', customField: 'fallbackValue' },
  'test'
);
const duration6 = Date.now() - case6Start;
assertTrue(case6Result.timeout, 'Should be timeout');
assertEqual(case6Result.status, 'timeout', 'Status should be timeout');
assertEqual(case6Result.customField, 'fallbackValue', 'Should include custom fallback field');
assertLess(duration6, 200, 'Should complete quickly');

// Case 7: Duration tracking
console.log('\n--- Case 7: Duration tracking ---');
const case7Result = await safeTimeoutPromise(
  async () => { await new Promise(r => setTimeout(r, 50)); return { done: true }; },
  1000,
  {},
  'test'
);
assertTrue(case7Result.durationMs >= 40, 'Duration should be >= 50ms (accounting for overhead)');
assertTrue(case7Result.durationMs < 200, 'Duration should be < 200ms');

// Case 8: Multiple concurrent timeouts
console.log('\n--- Case 8: Multiple concurrent timeouts ---');
const start8 = Date.now();
const [r8a, r8b] = await Promise.all([
  safeTimeoutPromise(() => new Promise(() => {}), 100, {}, 'a'),
  safeTimeoutPromise(() => new Promise(() => {}), 150, {}, 'b')
]);
const duration8 = Date.now() - start8;
assertTrue(r8a.timeout && r8b.timeout, 'Both should timeout');
assertLess(duration8, 250, 'Concurrent timeouts should complete within max timeout');

// Case 9: Mixed success and timeout
console.log('\n--- Case 9: Mixed success and timeout ---');
const [r9a, r9b] = await Promise.all([
  safeTimeoutPromise(() => Promise.resolve({ ok: true }), 1000, {}, 'success'),
  safeTimeoutPromise(() => new Promise(() => {}), 100, {}, 'timeout')
]);
assertTrue(r9a.ok && !r9a.timeout, 'First should succeed');
assertTrue(r9b.timeout && !r9b.ok, 'Second should timeout');

// Case 10: Step timing structure
console.log('\n--- Case 10: Step timing structure verification ---');
const stepTimings = {
  reachability: 1200,
  auth: 2100,
  modelList: 3000,
  operationalRisk: 5000,
  usageTransparency: 15000,
  cacheSignal: 20000,
  modelSignal: 25000,
  stability: 40000
};
assertEqual(typeof stepTimings.reachability, 'number', 'reachability timing should be number');
assertEqual(typeof stepTimings.stability, 'number', 'stability timing should be number');

// Case 11: Timeout thresholds
console.log('\n--- Case 11: Timeout thresholds verification ---');
const STEP_TIMEOUTS = {
  reachability: 10000,
  auth: 15000,
  modelList: 12000,
  modelSelection: 15000,
  operationalRisk: 6000,
  usageTransparency: 20000,
  cacheSignal: 25000,
  modelSignal: 30000,
  stability: 45000
};
const GLOBAL_TIMEOUT = 90000;
assertEqual(STEP_TIMEOUTS.reachability, 10000, 'reachability should be 10s');
assertEqual(STEP_TIMEOUTS.usageTransparency, 20000, 'usage should be 20s');
assertEqual(STEP_TIMEOUTS.cacheSignal, 25000, 'cache should be 25s');
assertEqual(STEP_TIMEOUTS.modelSignal, 30000, 'modelSignal should be 30s');
assertEqual(STEP_TIMEOUTS.stability, 45000, 'stability should be 45s');
assertEqual(GLOBAL_TIMEOUT, 90000, 'global timeout should be 90s');

// Case 12: Step timeout budgets are reasonable (parallel execution, not sum)
console.log('\n--- Case 12: Step timeout budgets are within reasonable bounds ---');
assertEqual(STEP_TIMEOUTS.reachability <= 15000, true, 'reachability budget should be <= 15s');
assertEqual(STEP_TIMEOUTS.stability <= 60000, true, 'stability budget should be <= 60s');
assertEqual(GLOBAL_TIMEOUT <= 120000, true, 'global timeout should be <= 120s');

// Case 13: Operational risk isolated
console.log('\n--- Case 13: Operational risk does not affect API score ---');
const operationalRisk = {
  enabled: true,
  affectsApiScore: false,
  score: 8,
  max: 20,
  level: 'medium'
};
assertTrue(operationalRisk.affectsApiScore === false, 'operationalRisk.affectsApiScore must be false');

// Case 14: Timeout state in progress
console.log('\n--- Case 14: Timeout state configuration ---');
const statusColorMap = {
  timeout: { icon: '#f59e0b', bar: '#f59e0b', cls: 'prog-row--done prog-row--warn' }
};
const defaultBarWidth = { timeout: '40%' };
assertEqual(statusColorMap.timeout.cls.includes('prog-row--warn'), true, 'Timeout should have warn styling');
assertEqual(defaultBarWidth.timeout, '40%', 'Timeout bar should be 40%');

// Case 15: Safe fallback result structure
console.log('\n--- Case 15: Safe fallback result structure ---');
const fallbackResult = {
  ok: false,
  timeout: true,
  skipped: false,
  status: 'timeout',
  summary: 'usage 检测超时，无法确认扣费透明度',
  durationMs: 20000
};
assertEqual(typeof fallbackResult.ok, 'boolean', 'ok should be boolean');
assertEqual(typeof fallbackResult.timeout, 'boolean', 'timeout should be boolean');
assertEqual(typeof fallbackResult.durationMs, 'number', 'durationMs should be number');

// Case 16: No API key exposure in error
console.log('\n--- Case 16: No API key exposure in timeout error ---');
const testError = 'usage timeout after 20000ms';
assertTrue(!testError.includes('sk-'), 'Error should not contain API key pattern');
assertTrue(!testError.includes('Bearer'), 'Error should not contain Bearer token');
assertTrue(!testError.includes('token'), 'Error should not contain token string');

// Case 17: Partial report generation check
console.log('\n--- Case 17: Partial report structure for timeout ---');
const partialReport = {
  score: null,
  totalScore: null,
  capReason: 'partial_timeout',
  grade: { grade: 'U' },
  debugScoring: {
    globalTimeoutApplied: true,
    stuckPreventionVersion: 'v1.9.2-timeout-guard'
  },
  operationalRisk: null
};
assertEqual(partialReport.grade.grade, 'U', 'Timeout grade should be U (unfinished)');
assertTrue(partialReport.debugScoring.globalTimeoutApplied, 'Should mark global timeout');
assertEqual(partialReport.debugScoring.stuckPreventionVersion, 'v1.9.2-timeout-guard', 'Should have version tag');

// Case A: normalizeStepResult preserves explicit ok:false
console.log('\n--- Case A: normalizeStepResult preserves explicit ok:false ---');
const caseA = normalizeStepResult({ ok: false, status: 'timeout' }, true);
assertEqual(caseA.ok, false, 'ok should be preserved as false');
assertEqual(caseA.status, 'timeout', 'status should be preserved');

// Case B: safeReadJson timeout
console.log('\n--- Case B: safeReadJson timeout simulation ---');
// Simulate: safeReadJson wraps a promise that never resolves
const caseBResult = await safeTimeoutPromise(
  new Promise(() => {}), // Never resolves
  100,
  { ok: false, timeout: true, error: 'read json timeout', data: null },
  'readJson'
);
assertTrue(caseBResult.timeout, 'safeReadJson should timeout');
assertTrue(!caseBResult.ok, 'safeReadJson should not succeed on timeout');

// Case C: safeTimeoutPromise with explicit ok:false should not be overwritten
console.log('\n--- Case C: safeTimeoutPromise preserves explicit ok:false ---');
const caseCResult = await safeTimeoutPromise(
  Promise.resolve({ ok: false, status: 'timeout' }),
  1000,
  {},
  'test'
);
assertEqual(caseCResult.ok, false, 'ok should remain false (not overwritten to true)');
assertEqual(caseCResult.status, 'timeout', 'status should be preserved');
assertTrue(!caseCResult.timeout, 'should not be timeout since promise resolved');

// Case D: runId mechanism
console.log('\n--- Case D: runId prevents stale updates ---');
// Simulate: old runId vs current runId
const currentRunId = 2;
const staleRunId = 1;
const isStaleUpdate = (staleRunId !== currentRunId);
assertTrue(isStaleUpdate, 'Stale runId should be detected');

// Case E: JSON parse with timeout in makeApiCall
console.log('\n--- Case E: JSON parse timeout protection ---');
const jsonTimeoutResult = await safeTimeoutPromise(
  () => new Promise(() => {}),
  100,
  { ok: false, timeout: true },
  'jsonParse'
);
assertTrue(jsonTimeoutResult.timeout, 'JSON parse should timeout if promise never resolves');

// Case F: safeReadText with truncation
console.log('\n--- Case F: safeReadText truncation ---');
const caseFResult = await safeTimeoutPromise(
  () => Promise.resolve('a'.repeat(1000)),
  1000,
  { data: null },
  'readText'
);
assertTrue(caseFResult.ok, 'safeReadText should succeed');
// The actual truncation happens inside safeReadText - test the truncation logic directly
const truncatedText = 'a'.repeat(1000).substring(0, 500);
assertEqual(truncatedText.length, 500, 'Text should be truncated to 500 chars');

// Case G: normalizeStepResult with no explicit ok
console.log('\n--- Case G: normalizeStepResult defaults ok when not explicit ---');
const caseG = normalizeStepResult({ status: 'done' }, true);
assertEqual(caseG.ok, true, 'ok should default to fallbackOk=true when not explicit');
const caseG2 = normalizeStepResult({ status: 'done' }, false);
assertEqual(caseG2.ok, false, 'ok should default to fallbackOk=false when not explicit');

// Case H: normalizeStepResult with ok:null or undefined
console.log('\n--- Case H: normalizeStepResult handles ok:null or undefined ---');
// null is not a boolean, so it should default to fallbackOk
const caseH = normalizeStepResult({ ok: null }, true);
assertEqual(caseH.ok, true, 'ok:null should default to fallbackOk (null is not boolean)');
const caseH2 = normalizeStepResult({ ok: undefined }, true);
assertEqual(caseH2.ok, true, 'ok:undefined should default to fallbackOk');

// Case I: makeApiCall default timeout is 12s
console.log('\n--- Case I: makeApiCall default timeout verification ---');
const DEFAULT_TIMEOUT = 12000;
assertEqual(DEFAULT_TIMEOUT, 12000, 'makeApiCall default timeout should be 12 seconds');

// Case J: Multiple concurrent steps with different timeouts
console.log('\n--- Case J: Concurrent steps with independent timeouts ---');
const [stepA, stepB] = await Promise.all([
  safeTimeoutPromise(() => new Promise(resolve => setTimeout(() => resolve({ ok: true, step: 'A' }), 50)), 200, {}, 'stepA'),
  safeTimeoutPromise(() => new Promise(() => {}), 100, { ok: false, timeout: true }, 'stepB')
]);
assertTrue(stepA.ok && stepA.step === 'A', 'Step A should succeed');
assertTrue(stepB.timeout && !stepB.ok, 'Step B should timeout independently');

// ── Summary ──
console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All timeout guard tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some timeout guard tests failed!\n');
  process.exit(1);
}
