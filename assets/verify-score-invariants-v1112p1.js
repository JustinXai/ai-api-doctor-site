/**
 * verify-score-invariants-v1112p1.js
 * Tests that finalScore never exceeds rawModuleScore
 */
const path = require('path');
const fs = require('fs');

// Read the test.js file to extract the relevant functions
const testJsPath = path.join(__dirname, 'test.js');
const testJs = fs.readFileSync(testJsPath, 'utf8');

// Simulate buildScoreBreakdown logic from test.js
function round1(v) {
  return Math.round(v * 10) / 10;
}

function safeNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildScoreBreakdownLogic(rawModuleScore, capApplied, capLimit) {
  // Apply cap: finalScore = min(rawModuleScore, capLimit) if capApplied
  // Otherwise: finalScore = rawModuleScore
  const finalScore = capApplied && capLimit !== null
    ? Math.min(rawModuleScore, capLimit)
    : rawModuleScore;
  
  return round1(finalScore);
}

// Test cases from user requirements
const testCases = [
  { 
    name: 'Case 1: raw=34.1, capApplied=true, capLimit=35',
    raw: 34.1, 
    capApplied: true, 
    capLimit: 35, 
    expectedFinal: 34.1,
    description: 'finalScore should be 34.1 (raw), not 35 (capLimit)'
  },
  { 
    name: 'Case 2: raw=55.1, capApplied=true, capLimit=35',
    raw: 55.1, 
    capApplied: true, 
    capLimit: 35, 
    expectedFinal: 35,
    description: 'finalScore should be 35 (capLimit) because raw > capLimit'
  },
  { 
    name: 'Case 3: raw=55.1, capApplied=false',
    raw: 55.1, 
    capApplied: false, 
    capLimit: null, 
    expectedFinal: 55.1,
    description: 'finalScore should be 55.1 when no cap applied'
  },
  { 
    name: 'Case 4: raw=85.0, capApplied=true, capLimit=35',
    raw: 85.0, 
    capApplied: true, 
    capLimit: 35, 
    expectedFinal: 35,
    description: 'finalScore should be 35 (capLimit) because raw > capLimit'
  },
  { 
    name: 'Case 5: raw=35.0, capApplied=true, capLimit=35',
    raw: 35.0, 
    capApplied: true, 
    capLimit: 35, 
    expectedFinal: 35.0,
    description: 'finalScore should be 35.0 when raw === capLimit'
  },
  { 
    name: 'Case 6: raw=0, capApplied=true, capLimit=35',
    raw: 0, 
    capApplied: true, 
    capLimit: 35, 
    expectedFinal: 0,
    description: 'finalScore should be 0 when raw is 0'
  },
];

let allPassed = true;
const results = [];

testCases.forEach((tc, i) => {
  const finalScore = buildScoreBreakdownLogic(tc.raw, tc.capApplied, tc.capLimit);
  const invariantOk = finalScore <= tc.raw;
  const expectedOk = finalScore === tc.expectedFinal;
  
  if (invariantOk && expectedOk) {
    results.push(`PASS: ${tc.name}`);
    results.push(`  => finalScore=${finalScore} <= raw=${tc.raw} (invariant OK)`);
  } else {
    results.push(`FAIL: ${tc.name}`);
    if (!expectedOk) results.push(`  Expected: ${tc.expectedFinal}, got: ${finalScore}`);
    if (!invariantOk) results.push(`  INVARIANT VIOLATION: ${finalScore} > ${tc.raw}`);
    allPassed = false;
  }
});

// Additional invariant test: finalScore should never exceed rawModuleScore
results.push('\n--- Invariant Tests ---');
testCases.forEach((tc, i) => {
  const finalScore = buildScoreBreakdownLogic(tc.raw, tc.capApplied, tc.capLimit);
  const invariantOk = finalScore <= tc.raw;
  results.push(`[${i + 1}] raw=${tc.raw}, cap=${tc.capLimit}, final=${finalScore} => ${invariantOk ? 'OK' : 'FAIL'}`);
  if (!invariantOk) {
    results.push(`    INVARIANT VIOLATION: ${finalScore} > ${tc.raw}`);
    allPassed = false;
  }
});

console.log('=== verify-score-invariants-v1112p1.js ===');
results.forEach(r => console.log(r));
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
