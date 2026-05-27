/**
 * verify-score-wiring-v1116.js
 * Tests score wiring and v1.11.6 calibration rules
 */
const fs = require('fs');
const path = require('path');

const testJsPath = path.join(__dirname, 'test.js');
const testJs = fs.readFileSync(testJsPath, 'utf8');

let allPassed = true;
const results = [];

results.push('=== v1.11.6 Score Wiring Verification ===\n');

// Case 1: buildModuleScores uses calibration
results.push('Case 1: buildModuleScores applies v1.11.6 calibration');
if (testJs.includes('v1116_calibration')) {
  results.push('  PASS: v1116_calibration markers found');
} else {
  results.push('  FAIL: v1116_calibration markers not found');
  allPassed = false;
}

// Case 2: usage calibration - target success + usage missing → >= 8
results.push('\nCase 2: usageTransparency calibration');
if (testJs.includes('target_call_success_usage_missing') || testJs.includes('Math.max(usageScore, 8)')) {
  results.push('  PASS: Usage calibration logic found (min 8)');
} else {
  results.push('  FAIL: Usage calibration logic not found');
  allPassed = false;
}

// Case 3: modelSignal calibration - ambiguous → 7/15
results.push('\nCase 3: modelSignal ambiguous calibration');
if (testJs.includes("ambiguous: 7") || testJs.includes("'ambiguous': 7")) {
  results.push('  PASS: ambiguous → 7 mapping found');
} else if (testJs.includes('ambiguous') && testJs.includes('expectedScoreByType')) {
  results.push('  PASS: ambiguous in expectedScoreByType');
} else {
  results.push('  FAIL: ambiguous calibration not found');
  allPassed = false;
}

// Case 4: coreCompatibility calibration - target success → >= 20
results.push('\nCase 4: coreCompatibility calibration');
if (testJs.includes('realTargetCallSuccess') && testJs.includes('Math.max(rawBasicScore, 20)')) {
  results.push('  PASS: Core compatibility calibration found (min 20)');
} else {
  results.push('  FAIL: Core compatibility calibration not found');
  allPassed = false;
}

// Case 5: scorePathTrace added
results.push('\nCase 5: scorePathTrace added');
if (testJs.includes('scorePathTrace')) {
  results.push('  PASS: scorePathTrace found');
} else {
  results.push('  FAIL: scorePathTrace not found');
  allPassed = false;
}

// Case 6: capEvidence added to cap result
results.push('\nCase 6: capEvidence in applyFatalCapsToRaw');
if (testJs.includes('capEvidence:')) {
  results.push('  PASS: capEvidence found');
} else {
  results.push('  FAIL: capEvidence not found');
  allPassed = false;
}

// Case 7: realTargetCallSuccess detection
results.push('\nCase 7: realTargetCallSuccess detection');
if (testJs.includes('realTargetCallSuccess') && testJs.includes('!targetCallEvidence.timeout')) {
  results.push('  PASS: realTargetCallSuccess detection found');
} else {
  results.push('  FAIL: realTargetCallSuccess detection not found');
  allPassed = false;
}

// Case 8: source tracking in buildModuleScores
results.push('\nCase 8: source tracking in modules');
if (testJs.includes('source:') && testJs.includes('v1116_calibration')) {
  results.push('  PASS: source tracking found');
} else {
  results.push('  FAIL: source tracking not found');
  allPassed = false;
}

// Case 9: selfClaimType tracking
results.push('\nCase 9: selfClaimType tracking');
if (testJs.includes('selfClaimType: selfClaimType')) {
  results.push('  PASS: selfClaimType tracking found');
} else {
  results.push('  FAIL: selfClaimType tracking not found');
  allPassed = false;
}

// Case 10: buildModuleScores return has source field
results.push('\nCase 10: buildModuleScores returns modules with source');
if (testJs.includes("key: 'usageTransparency'") && testJs.includes('source:')) {
  results.push('  PASS: Module return includes source field');
} else {
  results.push('  FAIL: Module return missing source field');
  allPassed = false;
}

// Case 11: buildDebugScoring uses breakdown.modules
results.push('\nCase 11: buildDebugScoring uses breakdown.modules');
if (testJs.includes('moduleByKey.usageTransparency?.score') && testJs.includes('breakdown.modules')) {
  results.push('  PASS: buildDebugScoring uses breakdown.modules');
} else {
  results.push('  FAIL: buildDebugScoring not using breakdown.modules');
  allPassed = false;
}

// Case 12: timeout detection for targetCall
results.push('\nCase 12: timeout detection');
if (testJs.includes('!targetCallEvidence.timeout') || testJs.includes('timeout: !!(sc.targetCall?.timeout)')) {
  results.push('  PASS: timeout detection found');
} else {
  results.push('  FAIL: timeout detection not found');
  allPassed = false;
}

// Case 13: expectedScoreByType for modelSignal
results.push('\nCase 13: expectedScoreByType for modelSignal');
if (testJs.includes('expectedScoreByType')) {
  results.push('  PASS: expectedScoreByType found');
} else {
  results.push('  FAIL: expectedScoreByType not found');
  allPassed = false;
}

// Case 14: fallbackUsed detection
results.push('\nCase 14: fallbackUsed detection');
if (testJs.includes('fallbackUsed: !!(sc.targetCall?.fallback)') || testJs.includes('!targetCallEvidence.fallbackUsed')) {
  results.push('  PASS: fallbackUsed detection found');
} else {
  results.push('  FAIL: fallbackUsed detection not found');
  allPassed = false;
}

// Case 15: buildScoreBreakdown uses calibrated modules
results.push('\nCase 15: buildScoreBreakdown uses calibrated modules');
if (testJs.includes('buildScoreBreakdown') && testJs.includes('modules.reduce((sum, m)')) {
  results.push('  PASS: buildScoreBreakdown uses modules');
} else {
  results.push('  FAIL: buildScoreBreakdown module usage unclear');
  allPassed = false;
}

console.log(results.join('\n'));
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
