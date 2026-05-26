/**
 * v1.10.11: Score cap verification script
 * Tests that caps are only applied for truly fatal failures.
 * Run: node assets/verify-score-cap-v1111.js
 */

(function() {
  'use strict';

  const results = [];
  let passCount = 0;
  let failCount = 0;

  function test(name, fn) {
    try {
      fn();
      results.push({ name, status: 'PASS' });
      passCount++;
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      results.push({ name, status: 'FAIL', error: err.message });
      failCount++;
      console.log(`  [FAIL] ${name}: ${err.message}`);
    }
  }

  function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${msg || ''} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  function assertTrue(condition, msg) {
    if (!condition) throw new Error(msg || 'Expected true');
  }

  function assertFalse(condition, msg) {
    if (condition) throw new Error(msg || 'Expected false');
  }

  // Simulate applyCaps logic (v1.10.11)
  function applyCaps(rawScore, checks) {
    let cap = 98;
    let capReason = null;
    let capApplied = false;

    // 1. Core reachability completely failed
    if ((checks.reachability?.score || 0) < 3) {
      cap = 25; capReason = 'reachability_failed'; capApplied = true;
    }

    // 2. Core API Key authentication failed (401)
    const has401 = checks.auth?.evidence?.modelsStatus === 401 || checks.auth?.evidence?.chatStatus === 401;
    if (has401) {
      cap = 35; capReason = 'auth_401'; capApplied = true;
    }

    // 3. Core chat/completions 403 (not auxiliary)
    const hasCoreChat403 = checks.targetCall?.evidence?.httpStatus === 403;
    if (hasCoreChat403) {
      cap = 45; capReason = 'core_chat_403'; capApplied = true;
    }

    // 4. Core response is HTML/invalid JSON (format severely incompatible)
    // v1.10.11: Only cap if basicCompatibility is genuinely low AND response is truly incompatible.
    const basicCompatScore = checks.basicCompatibility?.score || 0;
    const targetResponseParsed = checks.targetCall?.evidence?.responseParsed === true;
    const targetHttpStatus = checks.targetCall?.evidence?.httpStatus;
    const trulyIncompatibleResponse =
      basicCompatScore < 20 &&
      !targetResponseParsed &&
      targetHttpStatus === 200;
    if (trulyIncompatibleResponse) {
      cap = 45; capReason = 'response_not_json'; capApplied = true;
    }

    // 5. Current Model ID explicitly unavailable (404 / model not found)
    const targetHttpStatus2 = checks.targetCall?.evidence?.httpStatus;
    const targetOutputText = typeof checks.targetCall?.evidence?.output === 'string'
      ? checks.targetCall.evidence.output
      : checks.targetCall?.evidence?.output?.text || '';
    const targetOutput = targetOutputText.toLowerCase();
    const hasModelNotFound = targetHttpStatus2 === 404 ||
      targetOutput.includes('model not found') ||
      targetOutput.includes('no available model') ||
      targetOutput.includes('model not available');
    if (hasModelNotFound) {
      cap = 50; capReason = 'model_not_found'; capApplied = true;
    }

    // 6. Stability sampling success rate <= 40%
    const totalSamples = (checks.stability?.evidence?.samples || []).length;
    const successSamples = (checks.stability?.evidence?.samples || []).filter(s => s.ok && s.hasContent).length;
    const successRate = totalSamples > 0 ? successSamples / totalSamples : 0;
    if (totalSamples >= 5 && successRate <= 0.4) {
      cap = 60; capReason = 'stability_failed'; capApplied = true;
    }

    const cappedValue = capApplied ? Math.min(Math.max(rawScore, 0), cap) : rawScore;
    return { capped: cappedValue, capReason, capLimit: capApplied ? cap : null, capApplied };
  }

  console.log('\n=== v1.10.11 Score Cap Verification ===\n');

  // Case 1: Module scores 4+2.5+2+18+24.5+5 = 56, no fatal failure
  test('Case 1: No fatal failure - no cap applied', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { modelsStatus: 200, chatStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true, output: 'response text' } },
      basicCompatibility: { score: 24.5 },
      costTransparency: { score: 4 },
      cacheHitCheck: { score: 2.5 },
      modelSignal: { score: 2 },
      stability: { score: 18, evidence: { samples: [] } },
      clientConfig: { score: 5 }
    };
    const rawScore = 56;
    const result = applyCaps(rawScore, checks);
    assertFalse(result.capApplied, 'Should not apply cap');
    assertEqual(result.capped, 56, 'Score should be unchanged');
  });

  // Case 2: usage missing + modelSignal low + basicCompatibility high
  test('Case 2: usage missing does NOT trigger cap', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { modelsStatus: 200, chatStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true, output: 'response text' }, score: 0 },
      basicCompatibility: { score: 24.5 },
      costTransparency: { score: 0 },  // usage missing
      cacheHitCheck: { score: 2.5 },
      modelSignal: { score: 2 },  // low
      stability: { score: 18, evidence: { samples: [] } },
      clientConfig: { score: 5 }
    };
    const result = applyCaps(56, checks);
    assertFalse(result.capApplied, 'Usage missing should NOT trigger cap');
  });

  // Case 3: basicCompatibility >= 20, should NOT trigger response format cap
  test('Case 3: basicCompatibility >= 20, no response_format_incompatible cap', () => {
    for (const score of [20, 21, 22, 23, 24, 25]) {
      const checks = {
        reachability: { score: 25 },
        auth: { evidence: { modelsStatus: 200, chatStatus: 200 } },
        targetCall: { evidence: { httpStatus: 200, responseParsed: false, output: 'garbage' } },
        basicCompatibility: { score: score },
        costTransparency: { score: 10 },
        cacheHitCheck: { score: 3 },
        modelSignal: { score: 10 },
        stability: { score: 20, evidence: { samples: [] } },
        clientConfig: { score: 4 }
      };
      const result = applyCaps(75, checks);
      assertFalse(result.capApplied, `basicCompatibility=${score} should NOT trigger cap`);
    }
  });

  // Case 4: targetCall core 401
  test('Case 4: core 401 triggers cap with reason auth_401', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { modelsStatus: 401, chatStatus: 401 } },
      targetCall: { evidence: { httpStatus: 401, responseParsed: false } },
      basicCompatibility: { score: 0 },
      costTransparency: { score: 0 },
      cacheHitCheck: { score: 0 },
      modelSignal: { score: 0 },
      stability: { score: 0, evidence: { samples: [] } },
      clientConfig: { score: 0 }
    };
    const result = applyCaps(20, checks);
    assertTrue(result.capApplied, 'Should apply cap');
    assertEqual(result.capReason, 'auth_401', 'Reason should be auth_401');
    assertEqual(result.capLimit, 35, 'Cap limit should be 35');
  });

  // Case 5: targetCall non-json HTML + basicCompatibility low
  test('Case 5: non-JSON HTML + low basicCompat triggers cap', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { modelsStatus: 200, chatStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: false, output: '<html>error</html>' } },
      basicCompatibility: { score: 5 },  // genuinely low
      costTransparency: { score: 0 },
      cacheHitCheck: { score: 0 },
      modelSignal: { score: 0 },
      stability: { score: 0, evidence: { samples: [] } },
      clientConfig: { score: 0 }
    };
    const result = applyCaps(10, checks);
    assertTrue(result.capApplied, 'Should apply cap');
    assertEqual(result.capReason, 'response_not_json', 'Reason should be response_not_json');
    assertEqual(result.capLimit, 45, 'Cap limit should be 45');
  });

  // Case 5b: basicCompatibility LOW but response IS parseable - NO cap
  test('Case 5b: basicCompatibility low but response parseable - no cap', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { modelsStatus: 200, chatStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true, output: '{"ok":true}' } },
      basicCompatibility: { score: 15 },  // low but response is parseable
      costTransparency: { score: 0 },
      cacheHitCheck: { score: 0 },
      modelSignal: { score: 0 },
      stability: { score: 0, evidence: { samples: [] } },
      clientConfig: { score: 0 }
    };
    const result = applyCaps(30, checks);
    assertFalse(result.capApplied, 'Should NOT apply cap when response is parseable');
  });

  // Case 6: wrong model family
  test('Case 6: model not found triggers cap', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { modelsStatus: 200, chatStatus: 200 } },
      targetCall: { evidence: { httpStatus: 404, responseParsed: false, output: '' } },
      basicCompatibility: { score: 0 },
      costTransparency: { score: 0 },
      cacheHitCheck: { score: 0 },
      modelSignal: { score: 0 },
      stability: { score: 0, evidence: { samples: [] } },
      clientConfig: { score: 0 }
    };
    const result = applyCaps(10, checks);
    assertTrue(result.capApplied, 'Should apply cap');
    assertEqual(result.capReason, 'model_not_found', 'Reason should be model_not_found');
    assertEqual(result.capLimit, 50, 'Cap limit should be 50');
  });

  // Case 7: operationalRisk high
  test('Case 7: operationalRisk high does NOT trigger cap', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { modelsStatus: 200, chatStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true, output: 'response' } },
      basicCompatibility: { score: 24.5 },
      costTransparency: { score: 4 },
      cacheHitCheck: { score: 2.5 },
      modelSignal: { score: 2 },
      stability: { score: 18, evidence: { samples: [] } },
      clientConfig: { score: 5 }
    };
    // operationalRisk is NOT part of checks, so it cannot trigger cap
    const result = applyCaps(56, checks);
    assertFalse(result.capApplied, 'operationalRisk should NOT trigger cap');
  });

  // Case 8: stability_failed (success rate <= 40%)
  test('Case 8: stability success rate <= 40% triggers cap', () => {
    const samples = Array(10).fill(null).map((_, i) => ({
      ok: i < 4,  // only 4 out of 10 succeeded = 40%
      hasContent: i < 4
    }));
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { modelsStatus: 200, chatStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true, output: 'response' } },
      basicCompatibility: { score: 20 },
      costTransparency: { score: 10 },
      cacheHitCheck: { score: 3 },
      modelSignal: { score: 10 },
      stability: { score: 10, evidence: { samples } },
      clientConfig: { score: 4 }
    };
    const result = applyCaps(57, checks);
    assertTrue(result.capApplied, 'Should apply cap');
    assertEqual(result.capReason, 'stability_failed', 'Reason should be stability_failed');
    assertEqual(result.capLimit, 60, 'Cap limit should be 60');
  });

  // Case 9: stability 41% success rate should NOT trigger cap
  test('Case 9: stability success rate 41% does NOT trigger cap', () => {
    const samples = Array(100).fill(null).map((_, i) => ({
      ok: i < 41,  // 41%
      hasContent: i < 41
    }));
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { modelsStatus: 200, chatStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true, output: 'response' } },
      basicCompatibility: { score: 20 },
      costTransparency: { score: 10 },
      cacheHitCheck: { score: 3 },
      modelSignal: { score: 10 },
      stability: { score: 10, evidence: { samples } },
      clientConfig: { score: 4 }
    };
    const result = applyCaps(57, checks);
    assertFalse(result.capApplied, 'Should NOT apply cap at 41% success rate');
  });

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total: ${passCount + failCount} tests`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);

  if (failCount > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    process.exit(0);
  }
})();
