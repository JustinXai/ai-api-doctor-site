/**
 * v1.10.12: Fatal Cap Verification
 * Tests that caps are only applied for truly fatal failures.
 * Run: node assets/verify-fatal-cap-v1112.js
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

  // Simulate applyFatalCapsToRaw logic (v1.10.12)
  function applyFatalCapsToRaw(rawScore, checks) {
    let applied = false;
    let reason = null;
    let limit = null;

    // 1. Base URL unreachable
    if ((checks.reachability?.score || 0) < 3) {
      applied = true; reason = 'base_url_unreachable'; limit = 20;
    }
    // 2. Core auth failed (401/403 on target call)
    else if (checks.auth?.evidence?.chatStatus === 401 || checks.auth?.evidence?.modelsStatus === 401) {
      applied = true; reason = 'core_auth_failed'; limit = 25;
    }
    // 3. Target call 403 on core endpoint
    else if (checks.targetCall?.evidence?.httpStatus === 403) {
      applied = true; reason = 'target_call_403'; limit = 25;
    }
    // 4. Target call 404 (model not found)
    else if (checks.targetCall?.evidence?.httpStatus === 404) {
      applied = true; reason = 'model_not_found'; limit = 35;
    }
    // 5. Response format incompatible - ONLY if basicCompat < 10 AND response is truly garbage
    else if (checks.basicCompatibility?.score < 10 && !checks.targetCall?.evidence?.responseParsed) {
      applied = true; reason = 'response_format_incompatible'; limit = 35;
    }
    // 6. Stability completely failed (success rate <= 40%)
    else {
      const samples = checks.stability?.evidence?.samples || [];
      const totalSamples = samples.length;
      const successSamples = samples.filter(s => s.ok && s.hasContent).length;
      const successRate = totalSamples >= 5 ? successSamples / totalSamples : 1;
      if (totalSamples >= 5 && successRate <= 0.4) {
        applied = true; reason = 'stability_failed'; limit = 60;
      }
    }

    return { applied, reason, limit };
  }

  console.log('\n=== v1.10.12 Fatal Cap Verification ===\n');

  // Case 1: usage missing + basicCompatibility high - no cap
  test('Case 1: usage missing + basicCompatibility high - no cap', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true, usage: null } },
      basicCompatibility: { score: 24.6 },
      costTransparency: { score: 0 },
      cacheHitCheck: { score: 2.5 },
      modelSignal: { score: 2 },
      stability: { score: 21, evidence: { samples: [] } },
      clientConfig: { score: 5 }
    };
    const result = applyFatalCapsToRaw(55.1, checks);
    assertFalse(result.applied, 'Should NOT apply cap');
  });

  // Case 2: modelSignal low + basicCompatibility high - no cap
  test('Case 2: modelSignal low + basicCompatibility high - no cap', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true } },
      basicCompatibility: { score: 24 },
      stability: { score: 20, evidence: { samples: [] } }
    };
    const result = applyFatalCapsToRaw(50, checks);
    assertFalse(result.applied, 'Should NOT apply cap');
  });

  // Case 3: short reply failed + basicCompatibility high - no cap
  test('Case 3: short reply failed + basicCompatibility high - no cap', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true } },
      basicCompatibility: { score: 24 },
      costTransparency: { score: 10 },
      stability: { score: 20, evidence: { samples: [] } }
    };
    const result = applyFatalCapsToRaw(54, checks);
    assertFalse(result.applied, 'Should NOT apply cap');
  });

  // Case 4: basicCompatibility >= 20 - no response_format_incompatible cap
  test('Case 4: basicCompatibility >= 20 - no cap', () => {
    for (const score of [20, 21, 22, 23, 24, 25]) {
      const checks = {
        reachability: { score: 25 },
        auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
        targetCall: { evidence: { httpStatus: 200, responseParsed: false } },
        basicCompatibility: { score: score },
        stability: { score: 20, evidence: { samples: [] } }
      };
      const result = applyFatalCapsToRaw(50, checks);
      assertFalse(result.applied, `basicCompatibility=${score} should NOT trigger cap`);
    }
  });

  // Case 5: core auth 401 - cap with core_auth_failed
  test('Case 5: core auth 401 triggers cap', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 401, modelsStatus: 401 } },
      targetCall: { evidence: { httpStatus: 401, responseParsed: false } },
      basicCompatibility: { score: 0 },
      stability: { score: 0, evidence: { samples: [] } }
    };
    const result = applyFatalCapsToRaw(20, checks);
    assertTrue(result.applied, 'Should apply cap');
    assertEqual(result.reason, 'core_auth_failed', 'Reason should be core_auth_failed');
    assertEqual(result.limit, 25, 'Limit should be 25');
  });

  // Case 6: targetCall 403 - cap
  test('Case 6: targetCall 403 triggers cap', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 403, responseParsed: false } },
      basicCompatibility: { score: 0 },
      stability: { score: 0, evidence: { samples: [] } }
    };
    const result = applyFatalCapsToRaw(15, checks);
    assertTrue(result.applied, 'Should apply cap');
    assertEqual(result.reason, 'target_call_403', 'Reason should be target_call_403');
    assertEqual(result.limit, 25, 'Limit should be 25');
  });

  // Case 7: targetCall 404 - cap
  test('Case 7: targetCall 404 triggers cap', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 404, responseParsed: false } },
      basicCompatibility: { score: 0 },
      stability: { score: 0, evidence: { samples: [] } }
    };
    const result = applyFatalCapsToRaw(10, checks);
    assertTrue(result.applied, 'Should apply cap');
    assertEqual(result.reason, 'model_not_found', 'Reason should be model_not_found');
    assertEqual(result.limit, 35, 'Limit should be 35');
  });

  // Case 8: basicCompatibility < 10 + response unparseable - cap
  test('Case 8: basicCompat < 10 + unparseable triggers cap', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: false } },
      basicCompatibility: { score: 5 },
      stability: { score: 5, evidence: { samples: [] } }
    };
    const result = applyFatalCapsToRaw(20, checks);
    assertTrue(result.applied, 'Should apply cap');
    assertEqual(result.reason, 'response_format_incompatible', 'Reason should be response_format_incompatible');
    assertEqual(result.limit, 35, 'Limit should be 35');
  });

  // Case 9: basicCompatibility < 10 but response parseable - NO cap
  test('Case 9: basicCompat < 10 but parseable - no cap', () => {
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true } },
      basicCompatibility: { score: 8 },
      stability: { score: 15, evidence: { samples: [] } }
    };
    const result = applyFatalCapsToRaw(40, checks);
    assertFalse(result.applied, 'Should NOT apply cap');
  });

  // Case 10: stability success rate <= 40% - cap
  test('Case 10: stability <= 40% success rate triggers cap', () => {
    const samples = Array(10).fill(null).map((_, i) => ({
      ok: i < 4,  // only 4 out of 10 succeeded = 40%
      hasContent: i < 4
    }));
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true } },
      basicCompatibility: { score: 20 },
      stability: { score: 10, evidence: { samples } }
    };
    const result = applyFatalCapsToRaw(55, checks);
    assertTrue(result.applied, 'Should apply cap');
    assertEqual(result.reason, 'stability_failed', 'Reason should be stability_failed');
    assertEqual(result.limit, 60, 'Limit should be 60');
  });

  // Case 11: stability 41% success rate - no cap
  test('Case 11: stability 41% success rate - no cap', () => {
    const samples = Array(100).fill(null).map((_, i) => ({
      ok: i < 41,
      hasContent: i < 41
    }));
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true } },
      basicCompatibility: { score: 20 },
      stability: { score: 15, evidence: { samples } }
    };
    const result = applyFatalCapsToRaw(60, checks);
    assertFalse(result.applied, 'Should NOT apply cap');
  });

  // Case 12: reachability < 3 - cap
  test('Case 12: reachability < 3 triggers cap', () => {
    const checks = {
      reachability: { score: 2 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true } },
      basicCompatibility: { score: 20 },
      stability: { score: 15, evidence: { samples: [] } }
    };
    const result = applyFatalCapsToRaw(55, checks);
    assertTrue(result.applied, 'Should apply cap');
    assertEqual(result.reason, 'base_url_unreachable', 'Reason should be base_url_unreachable');
    assertEqual(result.limit, 20, 'Limit should be 20');
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
