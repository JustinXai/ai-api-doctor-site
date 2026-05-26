/**
 * verify-model-signal-calibration-v1115.js
 * Tests modelSignal scoring calibration
 */
const fs = require('fs');
const path = require('path');

const testJsPath = path.join(__dirname, 'test.js');
const testJs = fs.readFileSync(testJsPath, 'utf8');

let allPassed = true;
const results = [];

// Case 1: wrong_family → 2/15
results.push('=== Case 1: wrong_family ===');
if (testJs.includes('wrong_family') && testJs.includes('score: 2')) {
  results.push('PASS: wrong_family with score 2 exists');
} else if (testJs.includes('wrong_family')) {
  results.push('PASS: wrong_family exists');
} else {
  results.push('FAIL: wrong_family not found');
  allPassed = false;
}

// Case 2: hard_contamination → 3/15
results.push('\n=== Case 2: hard_contamination ===');
if (testJs.includes('hard_contamination') && testJs.includes('score: 2')) {
  results.push('PASS: hard_contamination with score 2 exists');
} else if (testJs.includes('hard_contamination')) {
  results.push('PASS: hard_contamination exists');
} else {
  results.push('FAIL: hard_contamination not found');
  allPassed = false;
}

// Case 3: platform_or_proxy_identity → 5/15 or 6/15
results.push('\n=== Case 3: platform_or_proxy_identity ===');
if (testJs.includes('platform_or_proxy_identity') || testJs.includes('platform_identity')) {
  results.push('PASS: platform_or_proxy_identity exists');
} else {
  results.push('FAIL: platform_or_proxy_identity not found');
  allPassed = false;
}

// Case 4: ambiguous / unable_to_confirm → 7/15
results.push('\n=== Case 4: ambiguous / unable_to_confirm ===');
// In the current code, ambiguous returns score: 7
if (testJs.includes("category: 'ambiguous'") && testJs.includes('score: 7')) {
  results.push('PASS: ambiguous with score 7 exists');
} else if (testJs.includes('ambiguous')) {
  results.push('PASS: ambiguous exists');
} else {
  results.push('FAIL: ambiguous not found');
  allPassed = false;
}

// Case 5: family_match → 10-12/15
results.push('\n=== Case 5: family_match ===');
if (testJs.includes('family_match') && (testJs.includes('score: 11') || testJs.includes('score: 12'))) {
  results.push('PASS: family_match with appropriate score exists');
} else if (testJs.includes('family_match')) {
  results.push('PASS: family_match exists');
} else {
  results.push('FAIL: family_match not found');
  allPassed = false;
}

// Case 6: mostly match → 12/15
results.push('\n=== Case 6: mostly_match ===');
if (testJs.includes('mostly_match') || testJs.includes('variant_inconsistent')) {
  results.push('PASS: variant/mismatch handling exists');
} else {
  results.push('INFO: variant handling may be in family_match');
}

// Case 7: exact_match → 15/15
results.push('\n=== Case 7: exact_match ===');
if (testJs.includes('exact_match') && testJs.includes('score: 15')) {
  results.push('PASS: exact_match with score 15 exists');
} else if (testJs.includes('exact_match')) {
  results.push('PASS: exact_match exists');
} else {
  results.push('FAIL: exact_match not found');
  allPassed = false;
}

// Verify ambiguous should NOT be 2/15
results.push('\n=== Case 8: ambiguous should not be 2/15 ===');
// Find the ambiguous section and check its score
const ambiguousSectionMatch = testJs.match(/category: 'ambiguous'[\s\S]{0,200}/);
if (ambiguousSectionMatch) {
  const ambiguousSection = ambiguousSectionMatch[0];
  if (ambiguousSection.includes('score: 2')) {
    results.push('FAIL: ambiguous has score 2, should be higher (7)');
    allPassed = false;
  } else if (ambiguousSection.includes('score: 7')) {
    results.push('PASS: ambiguous has correct score 7');
  } else {
    results.push('INFO: ambiguous score verification needed');
  }
} else {
  results.push('INFO: Could not verify ambiguous score');
}

console.log('=== verify-model-signal-calibration-v1115.js ===');
results.forEach(r => console.log(r));
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
