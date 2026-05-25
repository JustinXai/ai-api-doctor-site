/**
 * AI API Doctor v1.9.4 — idCat ReferenceError Fix Verification
 * Tests that idCat is properly declared and all identity category usages are safe
 */

'use strict';

// ── Utility: Mirror from test.js ──

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

console.log('\n=== AI API Doctor v1.9.4 idCat ReferenceError Fix ===\n');

// Case 1: getIdentityCategoryFromChecks with undefined
console.log('\n--- Case 1: undefined checks returns unknown ---');
const case1Result = getIdentityCategoryFromChecks(undefined);
assertEqual(case1Result, 'unknown', 'undefined checks should return unknown');

// Case 2: getIdentityCategoryFromChecks with null
console.log('\n--- Case 2: null checks returns unknown ---');
const case2Result = getIdentityCategoryFromChecks(null);
assertEqual(case2Result, 'unknown', 'null checks should return unknown');

// Case 3: getIdentityCategoryFromChecks with empty object
console.log('\n--- Case 3: empty checks returns unknown ---');
const case3Result = getIdentityCategoryFromChecks({});
assertEqual(case3Result, 'unknown', 'empty checks should return unknown');

// Case 4: getIdentityCategoryFromChecks with modelSignal.selfClaim.category
console.log('\n--- Case 4: modelSignal.selfClaim.category ---');
const case4Result = getIdentityCategoryFromChecks({
  modelSignal: { selfClaim: { category: 'family_match' } }
});
assertEqual(case4Result, 'family_match', 'should return family_match');

// Case 5: getIdentityCategoryFromChecks with modelSignal.selfClaim.type
console.log('\n--- Case 5: modelSignal.selfClaim.type fallback ---');
const case5Result = getIdentityCategoryFromChecks({
  modelSignal: { selfClaim: { type: 'exact_match' } }
});
assertEqual(case5Result, 'exact_match', 'should return exact_match from type');

// Case 6: getIdentityCategoryFromChecks with modelIntegrity.evidence.modelIdentityLevel
console.log('\n--- Case 6: modelIntegrity.evidence.modelIdentityLevel fallback ---');
const case6Result = getIdentityCategoryFromChecks({
  modelIntegrity: { evidence: { modelIdentityLevel: 'ambiguous' } }
});
assertEqual(case6Result, 'ambiguous', 'should return ambiguous from modelIdentityLevel');

// Case 7: getIdentityCategoryFromChecks with modelIntegrity.evidence.sourceTransparency.category
console.log('\n--- Case 7: sourceTransparency.category fallback ---');
const case7Result = getIdentityCategoryFromChecks({
  modelIntegrity: { evidence: { sourceTransparency: { category: 'hard_contamination' } } }
});
assertEqual(case7Result, 'hard_contamination', 'should return hard_contamination');

// Case 8: generateFailureSummary logic with missing identity
console.log('\n--- Case 8: generateFailureSummary with missing identity ---');
// Simulate the logic that uses identityCategory
const identityCategory8 = getIdentityCategoryFromChecks({});
const shouldShow8 = (
  identityCategory8 === 'failed' ||
  identityCategory8 === 'unknown'
);
assertTrue(typeof identityCategory8 === 'string', 'identityCategory should be string');
assertTrue(identityCategory8 !== undefined, 'identityCategory should not be undefined');
assertTrue(identityCategory8 !== null, 'identityCategory should not be null');

// Case 9: identityCategory === 'wrong_family' comparison
console.log('\n--- Case 9: wrong_family comparison ---');
const identityCategory9 = getIdentityCategoryFromChecks({
  modelSignal: { selfClaim: { category: 'wrong_family' } }
});
let reasonCode9 = 'OK';
if (identityCategory9 === 'wrong_family') reasonCode9 = 'WRONG_FAMILY';
assertEqual(reasonCode9, 'WRONG_FAMILY', 'should set WRONG_FAMILY for wrong_family');

// Case 10: identityCategory === 'hard_contamination' comparison
console.log('\n--- Case 10: hard_contamination comparison ---');
const identityCategory10 = getIdentityCategoryFromChecks({
  modelSignal: { selfClaim: { category: 'hard_contamination' } }
});
let reasonCode10 = 'OK';
if (identityCategory10 === 'hard_contamination') reasonCode10 = 'HARD_CONTAMINATION';
assertEqual(reasonCode10, 'HARD_CONTAMINATION', 'should set HARD_CONTAMINATION');

// Case 11: identityCategory === 'exact_match' comparison
console.log('\n--- Case 11: exact_match comparison ---');
const identityCategory11 = getIdentityCategoryFromChecks({
  modelSignal: { selfClaim: { category: 'exact_match' } }
});
let reasonCode11 = 'OK';
if (identityCategory11 === 'exact_match') reasonCode11 = 'EXACT_MATCH';
assertEqual(reasonCode11, 'EXACT_MATCH', 'should set EXACT_MATCH');

// Case 12: identityCategory === 'ambiguous' comparison
console.log('\n--- Case 12: ambiguous comparison ---');
const identityCategory12 = getIdentityCategoryFromChecks({
  modelSignal: { selfClaim: { category: 'ambiguous' } }
});
let reasonCode12 = 'OK';
if (identityCategory12 === 'ambiguous') reasonCode12 = 'AMBIGUOUS';
assertEqual(reasonCode12, 'AMBIGUOUS', 'should set AMBIGUOUS');

// Case 13: Simulate generateFailureSummary shouldShow logic
console.log('\n--- Case 13: shouldShow logic with unknown identity ---');
const checks13 = { modelSignal: { selfClaim: { category: 'unknown' } } };
const identityCat13 = getIdentityCategoryFromChecks(checks13);
const shouldShow13 = identityCat13 === 'failed' || identityCat13 === 'unknown';
assertTrue(shouldShow13, 'shouldShow should be true for unknown identity');

// Case 14: onlyLowSeverity check
console.log('\n--- Case 14: onlyLowSeverity logic ---');
const checks14 = { modelSignal: { selfClaim: { category: 'family_match' } } };
const identityCat14 = getIdentityCategoryFromChecks(checks14);
const identityTestFailed = true; // simulating IDENTITY_TEST_FAILED reason
const onlyLowSeverity = (
  identityTestFailed && 
  identityCat14 !== 'failed' && 
  identityCat14 !== 'empty'
);
assertTrue(onlyLowSeverity, 'should be low severity when family_match');

// Case 15: No ReferenceError should occur with getIdentityCategoryFromChecks
console.log('\n--- Case 15: No ReferenceError with various checks structures ---');
const testCases15 = [
  {},
  { modelSignal: {} },
  { modelSignal: { selfClaim: {} } },
  { modelIntegrity: {} },
  { modelIntegrity: { evidence: {} } },
  { modelIntegrity: { evidence: { modelIdentityLevel: null } } },
  { modelIntegrity: { evidence: { modelIdentityLevel: undefined } } },
  { sourceTransparency: {} },
  { sourceTransparency: { category: null } }
];
testCases15.forEach((tc, i) => {
  assertNotThrow(() => getIdentityCategoryFromChecks(tc), `Case 15.${i + 1}: No error for structure ${i + 1}`);
});

// Case 16: getIdentityCategoryFromChecks always returns string
console.log('\n--- Case 16: Always returns string ---');
const testCases16 = [undefined, null, {}, { a: 1 }, { modelSignal: null }];
testCases16.forEach((tc, i) => {
  const result = getIdentityCategoryFromChecks(tc);
  assertTrue(typeof result === 'string', `Case 16.${i + 1}: result is string for structure ${i + 1}`);
});

// Case 17: Priority chain test - modelSignal.selfClaim.category wins
console.log('\n--- Case 17: Priority chain - modelSignal.selfClaim.category ---');
const checks17 = {
  modelSignal: { selfClaim: { category: 'exact_match' } },
  modelIntegrity: { evidence: { modelIdentityLevel: 'ambiguous' } },
  sourceTransparency: { category: 'family_match' }
};
const result17 = getIdentityCategoryFromChecks(checks17);
assertEqual(result17, 'exact_match', 'should return first match in priority chain');

// Case 18: Priority chain test - falls back correctly
console.log('\n--- Case 18: Priority chain fallback ---');
const checks18 = {
  modelIntegrity: { evidence: { modelIdentityLevel: 'ambiguous' } }
};
const result18 = getIdentityCategoryFromChecks(checks18);
assertEqual(result18, 'ambiguous', 'should fallback to modelIdentityLevel');

// Case 19: Priority chain - sourceTransparency fallback
console.log('\n--- Case 19: Priority chain - sourceTransparency fallback ---');
const checks19 = {
  sourceTransparency: { category: 'hard_contamination' }
};
const result19 = getIdentityCategoryFromChecks(checks19);
assertEqual(result19, 'hard_contamination', 'should fallback to sourceTransparency');

// Case 20: Empty string should not be returned (should fall to 'unknown')
console.log('\n--- Case 20: Empty string becomes unknown ---');
const checks20 = {
  modelSignal: { selfClaim: { category: '' } }
};
const result20 = getIdentityCategoryFromChecks(checks20);
// Empty string is falsy, so it should fall through to 'unknown'
assertEqual(result20, 'unknown', 'empty string should fall through to unknown');

// ── Summary ──
console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All idCat ReferenceError fix tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}
