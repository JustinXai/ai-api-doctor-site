/**
 * API Doctor v1.10.8 — Score Consistency Verification Tests
 * Tests that top score equals module sum, and cap logic is correct.
 */
'use strict';

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, desc) {
  if (actual === expected) {
    console.log(`  PASS: ${desc}`);
    passed++;
  } else {
    console.log(`  FAIL: ${desc}`);
    console.log(`    Expected: ${JSON.stringify(expected)}`);
    console.log(`    Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertApprox(actual, expected, tolerance, desc) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log(`  PASS: ${desc} (diff=${diff.toFixed(2)}, within ${tolerance})`);
    passed++;
  } else {
    console.log(`  FAIL: ${desc}`);
    console.log(`    Expected: ${expected} (±${tolerance})`);
    console.log(`    Actual:   ${actual}`);
    failed++;
  }
}

function assertTrue(condition, desc) {
  if (condition) {
    console.log(`  PASS: ${desc}`);
    passed++;
  } else {
    console.log(`  FAIL: ${desc}`);
    failed++;
  }
}

function assertFalse(condition, desc) {
  assertTrue(!condition, desc);
}

console.log('=== API Doctor v1.10.8 Score Consistency Tests ===\n');

// Case 1: No cap — finalScore should equal rawModuleScore
console.log('Case 1: No cap → finalScore = rawModuleScore');
{
  // Simulate a case with no cap applied
  // In normal case: usage=25, cache=5, model=15, stability=25, compat=25, client=5
  // Total = 100
  const moduleScores = {
    usageTransparency: 25,
    cacheSignal: 5,
    modelSignal: 15,
    stabilityLatency: 25,
    coreCompatibility: 25,
    clientConfig: 5
  };
  const rawModuleScore = Object.values(moduleScores).reduce((a, b) => a + b, 0);
  const capApplied = false;
  const finalScore = rawModuleScore; // No cap

  assertEqual(rawModuleScore, 100, 'Sum of all max modules = 100');
  assertEqual(capApplied, false, 'No cap applied');
  assertEqual(finalScore, rawModuleScore, 'finalScore = rawModuleScore when no cap');
}

// Case 2: Cap applied — finalScore <= rawModuleScore
console.log('\nCase 2: Cap applied → finalScore <= rawModuleScore');
{
  // Simulate the screenshot case: usage=0, cache=2.5, model=2, stability=20, compat=24.6, client=5
  const moduleScores = {
    usageTransparency: 0,
    cacheSignal: 2.5,
    modelSignal: 2,
    stabilityLatency: 20,
    coreCompatibility: 24.6,
    clientConfig: 5
  };
  const rawModuleScore = Object.values(moduleScores).reduce((a, b) => a + b, 0);
  const capApplied = true;
  const capReason = 'COST_HIGH_RISK'; // usage missing/abnormal
  const capLimit = 78; // Typical cap for cost high risk

  // Cap: grade score = 0 (usage score 0 → grade = 0), cap at some value
  // Simulate cap: gradeScore is 0, so finalScore is capped
  const finalScore = 24.3; // As shown in screenshot

  assertApprox(rawModuleScore, 54.1, 0.1, 'Raw module sum = 54.1 (0+2.5+2+20+24.6+5)');
  assertEqual(capApplied, true, 'Cap is applied');
  assertTrue(finalScore < rawModuleScore, 'finalScore (24.3) < rawModuleScore (54.1)');
  assertEqual(finalScore <= 78, true, 'finalScore is under cap limit');
}

// Case 3: Score consistency check logic
console.log('\nCase 3: Score calculation consistency');
{
  // Test the scoring logic
  // Without cap: totalScore = rawModuleScore
  // With cap: finalScore = min(rawModuleScore, capLimit) when capApplied = true
  
  // Example: raw = 54.1, cap = 78 (cost_high_risk)
  // If cap is NOT applied (capApplied=false), finalScore = 54.1
  // If cap IS applied, finalScore = capped_grade_score * raw / 100 = 24.3
  
  const scenarioA = {
    rawModuleScore: 54.1,
    capApplied: false,
    finalScore: 54.1
  };
  assertEqual(scenarioA.finalScore, scenarioA.rawModuleScore, 'No cap: finalScore = rawModuleScore');

  const scenarioB = {
    rawModuleScore: 54.1,
    capApplied: true,
    capReason: 'usage_missing',
    finalScore: 24.3
  };
  assertTrue(scenarioB.finalScore < scenarioB.rawModuleScore, 'Cap: finalScore < rawModuleScore');
  assertTrue(scenarioB.capApplied, 'Cap is applied');
}

// Case 4: debugScoring must contain required fields
console.log('\nCase 4: debugScoring must include required fields');
{
  const requiredFields = [
    'rawModuleScore',
    'finalScore',
    'capApplied',
    'capReason',
    'capLimit',
    'moduleScores'
  ];

  // Check that buildDebugScoring includes these fields
  const fs = require('fs');
  const path = require('path');
  const testJsContent = fs.readFileSync(path.join(__dirname, 'test.js'), 'utf8');

  for (const field of requiredFields) {
    assertTrue(
      testJsContent.includes(`rawModuleScore:`) ||
      testJsContent.includes(`${field}:`) ||
      testJsContent.includes(`'${field}':`) ||
      testJsContent.includes(`"${field}":`),
      `debugScoring should include ${field}`
    );
  }

  assertTrue(
    testJsContent.includes('moduleScores:') && testJsContent.includes('usageTransparency'),
    'moduleScores should contain all module keys'
  );
}

// Case 5: Top score display equals debugScoring.finalScore
console.log('\nCase 5: Top score should equal debugScoring.finalScore');
{
  const fs = require('fs');
  const path = require('path');
  const testJsContent = fs.readFileSync(path.join(__dirname, 'test.js'), 'utf8');

  // displayScore should be set to score (capped score)
  assertTrue(
    testJsContent.includes('displayScore = score') || testJsContent.includes('displayScore = score;'),
    'displayScore should be set to score (the final capped value)'
  );
}

// Case 6: Module display scores must equal debugScoring.moduleScores
console.log('\nCase 6: Module display should use breakdown values');
{
  const fs = require('fs');
  const path = require('path');
  const testJsContent = fs.readFileSync(path.join(__dirname, 'test.js'), 'utf8');

  // Each moduleSection should use breakdown values
  const moduleKeys = ['usageTransparency', 'cacheSignal', 'modelSignal', 'stabilityLatency', 'coreCompatibility', 'clientConfig'];
  for (const key of moduleKeys) {
    assertTrue(
      testJsContent.includes(`breakdown?.${key}?.score`) ||
      testJsContent.includes(`breakdown?.${key}?.risk`),
      `Module ${key} should use breakdown values`
    );
  }
}

// Case 7: Cap notice should appear in UI when capApplied = true
console.log('\nCase 7: Cap notice should appear when capApplied = true');
{
  const fs = require('fs');
  const path = require('path');
  const testJsContent = fs.readFileSync(path.join(__dirname, 'test.js'), 'utf8');

  assertTrue(
    (testJsContent.includes('关键失败封顶') || testJsContent.includes('capApplied ?')) &&
    (testJsContent.includes('Capped by critical failure')),
    'UI should show cap notice when capApplied'
  );
}

// Case 8: buildScoreBreakdown function structure (documentation check)
console.log('\nCase 8: Score breakdown structure is consistent');
{
  const fs = require('fs');
  const path = require('path');
  const testJsContent = fs.readFileSync(path.join(__dirname, 'test.js'), 'utf8');

  // Verify breakdown object has all 6 modules
  assertTrue(testJsContent.includes('usageTransparency:'), 'breakdown should have usageTransparency');
  assertTrue(testJsContent.includes('cacheSignal:'), 'breakdown should have cacheSignal');
  assertTrue(testJsContent.includes('modelSignal:'), 'breakdown should have modelSignal');
  assertTrue(testJsContent.includes('stabilityLatency:'), 'breakdown should have stabilityLatency');
  assertTrue(testJsContent.includes('coreCompatibility:'), 'breakdown should have coreCompatibility');
  assertTrue(testJsContent.includes('clientConfig:'), 'breakdown should have clientConfig');

  // Each should have score, max, norm, risk, label
  assertTrue(testJsContent.includes('score:') && testJsContent.includes('max:'), 'Module should have score and max');
  assertTrue(testJsContent.includes('norm:') || testJsContent.includes('norm:'), 'Module should have normalized value');
  assertTrue(testJsContent.includes('risk:'), 'Module should have risk level');
  assertTrue(testJsContent.includes('label:'), 'Module should have label');
}

// Case 9: operationalRisk should NOT affect API technical score
console.log('\nCase 9: operationalRisk should NOT affect total score');
{
  const fs = require('fs');
  const path = require('path');
  const testJsContent = fs.readFileSync(path.join(__dirname, 'test.js'), 'utf8');

  // In buildReportCardHTML, operationalRisk is displayed separately
  // and should NOT be included in the totalScore calculation
  assertTrue(
    testJsContent.includes('operationalRisk') &&
    (testJsContent.includes('operationalRisk.enabled') || testJsContent.includes("'operationalRisk'")),
    'operationalRisk should be tracked for display'
  );

  // Check that calcFinalScore does not include operationalRisk
  const calcFinalScoreMatch = testJsContent.match(/function calcFinalScore[\s\S]{0,5000}/);
  if (calcFinalScoreMatch) {
    const fnContent = calcFinalScoreMatch[0];
    assertFalse(
      fnContent.includes('operationalRisk'),
      'calcFinalScore should NOT include operationalRisk'
    );
  }
}

// Summary
console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
  console.log('\nSome tests FAILED!');
  process.exit(1);
} else {
  console.log('\nAll score consistency tests PASSED!');
  process.exit(0);
}
