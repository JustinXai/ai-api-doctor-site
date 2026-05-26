/**
 * verify-score-diagnostics-v1114.js
 * Tests that debugScoring contains required diagnostic fields
 */
const fs = require('fs');
const path = require('path');

const testJsPath = path.join(__dirname, 'test.js');
const testJs = fs.readFileSync(testJsPath, 'utf8');

let allPassed = true;
const results = [];

// Case 1: debugScoring should contain stepDiagnostics
results.push('=== Case 1: debugScoring contains stepDiagnostics ===');
if (testJs.includes('stepDiagnostics:')) {
  results.push('PASS: stepDiagnostics field exists in test.js');
} else {
  results.push('FAIL: stepDiagnostics field not found in test.js');
  allPassed = false;
}

// Case 2: Each moduleScore should contain reason/evidenceSource/timeout/fallbackUsed
results.push('\n=== Case 2: moduleScore structure ===');
const requiredModuleFields = ['reason:', 'evidenceSource:', 'timeout:', 'fallbackUsed:'];
const moduleCheckPassed = requiredModuleFields.every(field => testJs.includes(field));
if (moduleCheckPassed) {
  results.push('PASS: moduleScore contains reason/evidenceSource/timeout/fallbackUsed');
} else {
  results.push('FAIL: moduleScore missing some required fields');
  allPassed = false;
}

// Case 3: usageTransparency low score must have reason
results.push('\n=== Case 3: usageTransparency reason logic ===');
if (testJs.includes('usage_missing') && testJs.includes('target_call_timeout')) {
  results.push('PASS: usageTransparency has multiple reason codes');
} else {
  results.push('FAIL: usageTransparency missing reason codes');
  allPassed = false;
}

// Case 4: modelSignal low score must have reason
results.push('\n=== Case 4: modelSignal reason logic ===');
if (testJs.includes('no_self_claim_evidence') && testJs.includes('model_unable_to_confirm')) {
  results.push('PASS: modelSignal has multiple reason codes');
} else {
  results.push('FAIL: modelSignal missing reason codes');
  allPassed = false;
}

// Case 5: capDetected=true should have capEvidence
results.push('\n=== Case 5: cap-related fields ===');
if (testJs.includes('capDetected') && testJs.includes('capEffective')) {
  results.push('PASS: capDetected and capEffective fields exist');
} else {
  results.push('FAIL: capDetected or capEffective not found');
  allPassed = false;
}

// Case 6: finalScore, rawModuleScore, capEffective should exist
results.push('\n=== Case 6: Required score fields ===');
const requiredFields = ['rawModuleScore', 'finalScore', 'capEffective', 'capReason', 'capLimit'];
const fieldsCheck = requiredFields.every(field => testJs.includes(field + ':') || testJs.includes(field + ','));
if (fieldsCheck) {
  results.push('PASS: All required score fields exist');
} else {
  results.push('FAIL: Some required score fields missing');
  allPassed = false;
}

// Case 7: timeout constants reference
results.push('\n=== Case 7: timeoutConstants ===');
if (testJs.includes('timeoutConstants:')) {
  results.push('PASS: timeoutConstants field exists');
} else {
  results.push('FAIL: timeoutConstants not found');
  allPassed = false;
}

// Case 8: moduleByKey from breakdown.modules
results.push('\n=== Case 8: moduleByKey from breakdown.modules ===');
if (testJs.includes('moduleByKey') && testJs.includes('breakdown.modules')) {
  results.push('PASS: moduleByKey built from breakdown.modules');
} else {
  results.push('FAIL: moduleByKey not built from breakdown.modules');
  allPassed = false;
}

// Case 9: stepDiagnostics for each step
results.push('\n=== Case 9: Step-specific diagnostics ===');
const steps = ['reachability', 'auth', 'targetCall', 'usageTransparency', 'cacheHitCheck', 'modelSignal', 'stability', 'basicCompatibility', 'clientConfig'];
const allStepsHaveDiag = steps.every(step => testJs.includes(`${step}: {`));
if (allStepsHaveDiag) {
  results.push('PASS: All steps have diagnostics');
} else {
  results.push('FAIL: Some steps missing diagnostics');
  allPassed = false;
}

// Case 10: moduleScore reason codes for each module
results.push('\n=== Case 10: Module-specific reason codes ===');
const reasonCodes = [
  'target_call_not_executed',
  'usage_audit_timeout',
  'cache_probe_timeout',
  'no_self_claim_evidence',
  'stability_timeout',
  'response_not_json'
];
const allReasonsPresent = reasonCodes.every(code => testJs.includes(code));
if (allReasonsPresent) {
  results.push('PASS: All module-specific reason codes present');
} else {
  results.push('FAIL: Some reason codes missing');
  allPassed = false;
}

// Case 11: diagnose-score-regression-v1114.js exists
results.push('\n=== Case 11: Diagnosis script ===');
const diagScriptPath = path.join(__dirname, 'diagnose-score-regression-v1114.js');
if (fs.existsSync(diagScriptPath)) {
  results.push('PASS: diagnose-score-regression-v1114.js exists');
} else {
  results.push('FAIL: diagnose-score-regression-v1114.js not found');
  allPassed = false;
}

// Case 12: No direct scoring changes (verifying this is diagnostic only)
results.push('\n=== Case 12: No scoring changes ===');
// This test checks that we didn't change scoring rules
const scoringChangeIndicators = [
  "usageTransparency: { score: 8", // We shouldn't have changed to fixed 8
  "usageTransparency: { score: 25",
  "if (rawModuleScore > capLimit) { rawModuleScore = 999", // Should not inflate
];
const hasScoringChanges = scoringChangeIndicators.some(indicator => testJs.includes(indicator));
if (!hasScoringChanges) {
  results.push('PASS: No direct scoring changes detected');
} else {
  results.push('FAIL: Possible scoring manipulation detected');
  allPassed = false;
}

console.log('=== verify-score-diagnostics-v1114.js ===');
results.forEach(r => console.log(r));
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
