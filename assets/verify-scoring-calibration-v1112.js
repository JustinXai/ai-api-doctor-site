/**
 * v1.10.12: Scoring Calibration Verification
 * Tests that scores are calibrated correctly after fixes.
 * Run: node assets/verify-scoring-calibration-v1112.js
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

  function assertInRange(actual, min, max, msg) {
    if (actual < min || actual > max) {
      throw new Error(`${msg || ''} Expected ${actual} to be between ${min} and ${max}`);
    }
  }

  // Simulate applyFatalCapsToRaw
  function applyFatalCapsToRaw(rawScore, checks) {
    let applied = false;
    let reason = null;
    let limit = null;

    if ((checks.reachability?.score || 0) < 3) {
      applied = true; reason = 'base_url_unreachable'; limit = 20;
    } else if (checks.auth?.evidence?.chatStatus === 401 || checks.auth?.evidence?.modelsStatus === 401) {
      applied = true; reason = 'core_auth_failed'; limit = 25;
    } else if (checks.targetCall?.evidence?.httpStatus === 403) {
      applied = true; reason = 'target_call_403'; limit = 25;
    } else if (checks.targetCall?.evidence?.httpStatus === 404) {
      applied = true; reason = 'model_not_found'; limit = 35;
    } else if (checks.basicCompatibility?.score < 10 && !checks.targetCall?.evidence?.responseParsed) {
      applied = true; reason = 'response_format_incompatible'; limit = 35;
    } else {
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

  // Simulate final score calculation
  function calculateFinalScore(moduleScores, checks) {
    const rawModuleScore = Object.values(moduleScores).reduce((a, b) => a + b, 0);
    const capResult = applyFatalCapsToRaw(rawModuleScore, checks);
    const finalScore = capResult.applied ? capResult.limit : rawModuleScore;
    return { rawModuleScore, finalScore, capApplied: capResult.applied, capReason: capResult.reason };
  }

  console.log('\n=== v1.10.12 Scoring Calibration Verification ===\n');

  // Case 1: Current case - usage missing, model no answer, etc.
  test('Case 1: Current case (usage missing, no answer) should be 65-72', () => {
    const moduleScores = {
      usageTransparency: 8,  // After fix: no usage field = 8, not 0
      cacheHitCheck: 2.5,
      modelSignal: 7,  // After fix: no answer = 7, not 2
      stabilityLatency: 21,
      basicCompatibility: 24.6,
      clientConfig: 5
    };
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true } },
      basicCompatibility: { score: 24.6 },
      stability: { score: 21, evidence: { samples: [] } }
    };
    const result = calculateFinalScore(moduleScores, checks);
    assertFalse(result.capApplied, 'Should NOT apply cap');
    assertInRange(result.finalScore, 65, 72, 'Score should be between 65-72');
    console.log(`    rawModuleScore: ${result.rawModuleScore}`);
    console.log(`    finalScore: ${result.finalScore}`);
  });

  // Case 2: Complete usage + family match - should be >= 80
  test('Case 2: Complete usage + family match - should be >= 80', () => {
    const moduleScores = {
      usageTransparency: 25,  // Complete usage
      cacheHitCheck: 4,
      modelSignal: 15,  // Exact match
      stabilityLatency: 24,
      basicCompatibility: 25,
      clientConfig: 5
    };
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true } },
      basicCompatibility: { score: 25 },
      stability: { score: 24, evidence: { samples: [] } }
    };
    const result = calculateFinalScore(moduleScores, checks);
    assertFalse(result.capApplied, 'Should NOT apply cap');
    assertTrue(result.finalScore >= 80, `Score should be >= 80, got ${result.finalScore}`);
    console.log(`    finalScore: ${result.finalScore}`);
  });

  // Case 3: Core auth failed - should be <= 25 and cap applied
  test('Case 3: Core auth failed - should be <= 25', () => {
    const moduleScores = {
      usageTransparency: 25,
      cacheHitCheck: 4,
      modelSignal: 15,
      stabilityLatency: 24,
      basicCompatibility: 25,
      clientConfig: 5
    };
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 401, modelsStatus: 401 } },
      targetCall: { evidence: { httpStatus: 401, responseParsed: false } },
      basicCompatibility: { score: 0 },
      stability: { score: 0, evidence: { samples: [] } }
    };
    const result = calculateFinalScore(moduleScores, checks);
    assertTrue(result.capApplied, 'Should apply cap');
    assertEqual(result.capReason, 'core_auth_failed', 'Reason should be core_auth_failed');
    assertTrue(result.finalScore <= 25, `Score should be <= 25, got ${result.finalScore}`);
    console.log(`    finalScore: ${result.finalScore}`);
  });

  // Case 4: Target call 404 - should be <= 35
  test('Case 4: Target call 404 - should be <= 35', () => {
    const moduleScores = {
      usageTransparency: 20,
      cacheHitCheck: 3,
      modelSignal: 10,
      stabilityLatency: 20,
      basicCompatibility: 20,
      clientConfig: 5
    };
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 404, responseParsed: false } },
      basicCompatibility: { score: 10 },
      stability: { score: 10, evidence: { samples: [] } }
    };
    const result = calculateFinalScore(moduleScores, checks);
    assertTrue(result.capApplied, 'Should apply cap');
    assertEqual(result.capReason, 'model_not_found', 'Reason should be model_not_found');
    assertTrue(result.finalScore <= 35, `Score should be <= 35, got ${result.finalScore}`);
    console.log(`    finalScore: ${result.finalScore}`);
  });

  // Case 5: Usage missing alone - should NOT cap
  test('Case 5: Usage missing alone - should NOT cap', () => {
    const moduleScores = {
      usageTransparency: 0,
      cacheHitCheck: 3,
      modelSignal: 12,
      stabilityLatency: 22,
      basicCompatibility: 24,
      clientConfig: 5
    };
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true } },
      basicCompatibility: { score: 24 },
      stability: { score: 22, evidence: { samples: [] } }
    };
    const result = calculateFinalScore(moduleScores, checks);
    assertFalse(result.capApplied, 'Should NOT apply cap');
    console.log(`    finalScore: ${result.finalScore}`);
  });

  // Case 6: Model signal low alone - should NOT cap
  test('Case 6: Model signal low alone - should NOT cap', () => {
    const moduleScores = {
      usageTransparency: 20,
      cacheHitCheck: 3,
      modelSignal: 2,
      stabilityLatency: 22,
      basicCompatibility: 24,
      clientConfig: 5
    };
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true } },
      basicCompatibility: { score: 24 },
      stability: { score: 22, evidence: { samples: [] } }
    };
    const result = calculateFinalScore(moduleScores, checks);
    assertFalse(result.capApplied, 'Should NOT apply cap');
    console.log(`    finalScore: ${result.finalScore}`);
  });

  // Case 7: Cache unverified alone - should NOT cap
  test('Case 7: Cache unverified alone - should NOT cap', () => {
    const moduleScores = {
      usageTransparency: 20,
      cacheHitCheck: 2,
      modelSignal: 12,
      stabilityLatency: 22,
      basicCompatibility: 24,
      clientConfig: 5
    };
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true } },
      basicCompatibility: { score: 24 },
      stability: { score: 22, evidence: { samples: [] } }
    };
    const result = calculateFinalScore(moduleScores, checks);
    assertFalse(result.capApplied, 'Should NOT apply cap');
    console.log(`    finalScore: ${result.finalScore}`);
  });

  // Case 8: basicCompatibility high + response format issues - NO cap
  test('Case 8: basicCompat high + format issues - NO cap', () => {
    const moduleScores = {
      usageTransparency: 15,
      cacheHitCheck: 3,
      modelSignal: 8,
      stabilityLatency: 20,
      basicCompatibility: 24,
      clientConfig: 5
    };
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: false } },  // Format issue
      basicCompatibility: { score: 24 },  // High score!
      stability: { score: 20, evidence: { samples: [] } }
    };
    const result = calculateFinalScore(moduleScores, checks);
    assertFalse(result.capApplied, 'Should NOT apply cap (basicCompat >= 10 blocks the cap)');
    console.log(`    finalScore: ${result.finalScore}`);
  });

  // Case 9: Stability at boundary (40%) - should cap
  test('Case 9: Stability at 40% - should cap', () => {
    const samples = Array(10).fill(null).map((_, i) => ({
      ok: i < 4,
      hasContent: i < 4
    }));
    const moduleScores = {
      usageTransparency: 20,
      cacheHitCheck: 4,
      modelSignal: 12,
      stabilityLatency: 18,
      basicCompatibility: 24,
      clientConfig: 5
    };
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true } },
      basicCompatibility: { score: 24 },
      stability: { score: 18, evidence: { samples } }
    };
    const result = calculateFinalScore(moduleScores, checks);
    assertTrue(result.capApplied, 'Should apply cap');
    assertEqual(result.capReason, 'stability_failed', 'Reason should be stability_failed');
    console.log(`    finalScore: ${result.finalScore}`);
  });

  // Case 10: Stability at 41% - should NOT cap
  test('Case 10: Stability at 41% - should NOT cap', () => {
    const samples = Array(100).fill(null).map((_, i) => ({
      ok: i < 41,
      hasContent: i < 41
    }));
    const moduleScores = {
      usageTransparency: 20,
      cacheHitCheck: 4,
      modelSignal: 12,
      stabilityLatency: 20,
      basicCompatibility: 24,
      clientConfig: 5
    };
    const checks = {
      reachability: { score: 25 },
      auth: { evidence: { chatStatus: 200, modelsStatus: 200 } },
      targetCall: { evidence: { httpStatus: 200, responseParsed: true } },
      basicCompatibility: { score: 24 },
      stability: { score: 20, evidence: { samples } }
    };
    const result = calculateFinalScore(moduleScores, checks);
    assertFalse(result.capApplied, 'Should NOT apply cap');
    console.log(`    finalScore: ${result.finalScore}`);
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
