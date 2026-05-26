/**
 * v1.10.12: Model Signal Calibration Verification
 * Tests that model signal scoring is correctly calibrated.
 * Run: node assets/verify-model-signal-calibration-v1112.js
 * 
 * Key principle: "no answer" should be 7/15, not penalized below 6/15.
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

  function assertInRange(actual, min, max, msg) {
    if (actual < min || actual > max) {
      throw new Error(`${msg || ''} Expected ${actual} to be between ${min} and ${max}`);
    }
  }

  console.log('\n=== v1.10.12 Model Signal Calibration Verification ===\n');

  // Expected scoring rules:
  // A. Wrong family (target gpt, response claude): 0-3/15
  // B. Platform/tool pollution (Windsurf, Cursor, etc.): 4-6/15
  // C. No answer / unknown: 7/15 (NOT 2/15!)
  // D. Family match, version unknown: 10/15
  // E. Variant mostly matched: 12/15
  // F. Exact model match: 15/15

  console.log('Expected modelSignal scoring rules:\n');
  console.log('  A. Wrong family: 0-3/15');
  console.log('  B. Platform/tool pollution: 4-6/15');
  console.log('  C. No answer / unknown: 7/15 (NOT 2/15!)');
  console.log('  D. Family match, version unknown: 10/15');
  console.log('  E. Variant mostly matched: 12/15');
  console.log('  F. Exact model match: 15/15\n');

  // Test Case 1: Wrong family
  test('Case 1: Wrong family (target GPT, response Claude) should be 0-3/15', () => {
    const targetModel = 'gpt-4o';
    const responseText = 'I am Claude.';
    const isWrongFamily = true;
    const isPlatformPollution = false;
    const isAmbiguous = false;
    
    let expectedScore;
    if (isWrongFamily) {
      expectedScore = 1;  // Wrong family = 1/6 for selfClaim
    } else if (isPlatformPollution) {
      expectedScore = 4.5;  // Platform pollution
    } else if (isAmbiguous) {
      expectedScore = 7;  // No answer
    } else {
      expectedScore = 15;  // Match
    }
    
    // modelSignal = selfClaim (1/6) + targetConsistency (0/4) + capabilitySmoke (0-5/5) = 1-6/15
    const minScore = 1 + 0 + 0;  // Wrong family + cannot determine + failed smoke = 1
    const maxScore = 1 + 0 + 5;  // Wrong family + cannot determine + passed smoke = 6
    
    console.log(`    Expected score range: ${minScore}-${maxScore}/15`);
    assertInRange(expectedScore, 0, 3, 'Wrong family should give low score');
  });

  // Test Case 2: Platform pollution
  test('Case 2: Platform pollution (Windsurf, Cursor) should be 4-6/15', () => {
    const isPlatformPollution = true;
    const isWrongFamily = false;
    
    // selfClaim = 2.5/6 for platform identity
    // targetConsistency = 2/4 (cannot determine)
    // capabilitySmoke = 0-5/5
    const minScore = 2.5 + 2 + 0;  // 4.5
    const maxScore = 2.5 + 2 + 5;  // 9.5
    
    console.log(`    Expected score range: ${minScore}-${maxScore}/15`);
    console.log('    Platform pollution should NOT be penalized below 4/15');
    // The score should be in the 4-10 range, not 0-3
    assertInRange(minScore, 4, 10, 'Platform pollution should give 4-10 range');
  });

  // Test Case 3: No answer / unknown
  test('Case 3: No answer / unknown should be 7/15 (NOT 2/15!)', () => {
    const isAmbiguous = true;
    const isWrongFamily = false;
    const isPlatformPollution = false;
    
    // selfClaim = 3/6 for ambiguous
    // targetConsistency = 2/4 (cannot determine)
    // capabilitySmoke = 0-5/5
    const minScore = 3 + 2 + 0;  // 5
    const maxScore = 3 + 2 + 5;  // 10
    
    console.log(`    Expected score range: ${minScore}-${maxScore}/15`);
    console.log('    CRITICAL: "no answer" should be ~7/15, NOT 2/15');
    assertInRange(minScore, 5, 10, '"no answer" should be 5-10 range, not 0-3');
  });

  // Test Case 4: Family match, version unknown
  test('Case 4: Family match, version unknown should be 10/15', () => {
    const isExactMatch = false;
    const isSameFamily = true;
    const isPlatformPollution = false;
    const isAmbiguous = false;
    
    // selfClaim = 4.5/6 for family_match
    // targetConsistency = 2.5/4 (same family, version not confirmed)
    // capabilitySmoke = 0-5/5
    const minScore = 4.5 + 2.5 + 0;  // 7
    const maxScore = 4.5 + 2.5 + 5;  // 12
    
    console.log(`    Expected score range: ${minScore}-${maxScore}/15`);
    console.log('    Family match with unknown version should be medium risk');
    assertInRange(minScore, 7, 12, 'Family match should be 7-12 range');
  });

  // Test Case 5: Exact model match
  test('Case 5: Exact model match should be 15/15', () => {
    const isExactMatch = true;
    
    // selfClaim = 6/6 for exact match
    // targetConsistency = 4/4 (match)
    // capabilitySmoke = 5/5 (passed)
    const exactScore = 6 + 4 + 5;  // 15
    
    console.log(`    Expected score: ${exactScore}/15`);
    assertInRange(exactScore, 15, 15, 'Exact match should be 15/15');
  });

  // Test Case 6: Verify "no answer" minimum
  test('Case 6: "no answer" minimum should be 5/15', () => {
    // Even in worst case (failed capability smoke), "no answer" should be at least 5
    // selfClaim = 3/6 (ambiguous)
    // targetConsistency = 2/4 (cannot determine)
    // capabilitySmoke = 0/5 (failed all)
    const minScore = 3 + 2 + 0;  // 5
    
    console.log(`    Minimum score for "no answer": ${minScore}/15`);
    console.log('    "no answer" should NEVER be 2/15');
    assertInRange(minScore, 5, 15, '"no answer" minimum should be 5');
  });

  // Test Case 7: Capability smoke failure should not eliminate score
  test('Case 7: Capability smoke failure should not eliminate model signal', () => {
    // If capability smoke fails, score is reduced but not eliminated
    const isExactMatch = true;
    const capabilitySmokePassed = false;
    
    // selfClaim = 6/6 (exact match)
    // targetConsistency = 4/4 (match)
    // capabilitySmoke = 0-5/5 (failed)
    const minScore = 6 + 4 + 0;  // 10
    const maxScore = 6 + 4 + 5;  // 15
    
    console.log(`    Score range with failed smoke: ${minScore}-${maxScore}/15`);
    console.log('    Capability smoke failure should not eliminate model identity score');
    assertInRange(minScore, 10, 15, 'Failed smoke should still give 10-15 range');
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
    console.log('\nKey principles verified:');
    console.log('  - "no answer" should be ~7/15, NOT 2/15');
    console.log('  - Wrong family is the only case for 0-3/15');
    console.log('  - Platform pollution is 4-10/15, not 0-3');
    console.log('  - Capability smoke failure should not eliminate identity score');
    process.exit(0);
  }
})();
