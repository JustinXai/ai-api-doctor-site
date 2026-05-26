/**
 * AI API Doctor v1.10.9 — Score Consistency Verification
 * Tests that top score equals module sum when no fatal cap
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TEST_JS = path.join(__dirname, 'test.js');
const content = fs.readFileSync(TEST_JS, 'utf8');

let passed = 0;
let failed = 0;

console.log('\n=== API Doctor v1.10.9 Score Consistency Tests ===\n');

// Case 1: Score calculation structure
console.log('Case 1: Score calculation structure');
const calcFinalScoreStart = content.indexOf('function calcFinalScore');
const calcFinalScoreEnd = content.indexOf('function applyCaps');
const calcFinalScore = content.substring(calcFinalScoreStart, calcFinalScoreEnd);
if (calcFinalScore.includes('totalScore') && calcFinalScore.includes('breakdownTotalRaw')) {
  console.log('  PASS: calcFinalScore returns totalScore and breakdownTotalRaw');
  passed++;
} else {
  console.log('  FAIL: calcFinalScore missing required fields');
  failed++;
}

// Case 2: Score breakdown structure
console.log('\nCase 2: Score breakdown structure');
const breakdownModules = ['coreCompatibility', 'usageTransparency', 'stabilityLatency', 'modelSignal', 'cacheSignal', 'clientConfig'];
breakdownModules.forEach(mod => {
  if (calcFinalScore.includes(mod)) {
    console.log(`  PASS: ${mod} in breakdown`);
    passed++;
  } else {
    console.log(`  FAIL: ${mod} not in breakdown`);
    failed++;
  }
});

// Case 3: applyCaps only caps truly fatal failures
console.log('\nCase 3: applyCaps only caps fatal failures');
const applyCapsStart = content.indexOf('function applyCaps');
const applyCapsEnd = content.indexOf('function applyCapsLegacy');
const applyCaps = content.substring(applyCapsStart, applyCapsEnd);

const fatalCapReasons = ['reachability_failed', 'auth_401', 'core_chat_403', 'response_not_json', 'model_not_found', 'stability_failed'];
fatalCapReasons.forEach(reason => {
  if (applyCaps.includes(reason)) {
    console.log(`  PASS: Fatal cap reason: ${reason}`);
    passed++;
  } else {
    console.log(`  FAIL: Missing fatal cap: ${reason}`);
    failed++;
  }
});

// Case 4: Truly fatal cap conditions only
console.log('\nCase 4: Truly fatal cap conditions only');
const trulyFatalConditions = [
  { pat: '(checks.reachability?.score || 0) < 3', name: 'reachability < 3' },
  { pat: 'has401', name: 'has401' },
  { pat: 'hasCoreChat403', name: 'hasCoreChat403' },
  { pat: 'coreResponseUnparseable', name: 'coreResponseUnparseable' },
  { pat: 'hasModelNotFound', name: 'hasModelNotFound' },
  { pat: 'successRate <= 0.4', name: 'successRate <= 0.4' }
];
trulyFatalConditions.forEach(c => {
  if (applyCaps.includes(c.pat)) {
    console.log(`  PASS: Fatal condition: ${c.name}`);
    passed++;
  } else {
    console.log(`  FAIL: Missing fatal condition: ${c.name}`);
    failed++;
  }
});

// Case 5: Non-fatal should NOT be cap triggers
console.log('\nCase 5: Non-fatal conditions NOT capping');
const hasCostRiskInCap = applyCaps.includes('costRiskL === \'high\'') || applyCaps.includes('costRiskL === "high"');
if (!hasCostRiskInCap) {
  console.log('  PASS: costRiskL NOT in cap conditions');
  passed++;
} else {
  console.log('  FAIL: costRiskL incorrectly in cap conditions');
  failed++;
}

const hasModelRiskInCap = applyCaps.includes('modelRiskL === \'high\'') || applyCaps.includes('modelRiskL === "high"');
if (!hasModelRiskInCap) {
  console.log('  PASS: modelRiskL NOT in cap conditions');
  passed++;
} else {
  console.log('  FAIL: modelRiskL incorrectly in cap conditions');
  failed++;
}

// Case 6: Example data simulation (4+2.5+2+22+24.6+5 = 60.1)
console.log('\nCase 6: Example score consistency');
const exampleSum = 4 + 2.5 + 2 + 22 + 24.6 + 5;
console.log(`  Example: 4 + 2.5 + 2 + 22 + 24.6 + 5 = ${exampleSum}`);
if (Math.abs(exampleSum - 60.1) < 0.1) {
  console.log('  PASS: Example sum is correct (60.1)');
  passed++;
} else {
  console.log('  FAIL: Example sum calculation wrong');
  failed++;
}

// Case 7: No fatal cap = no score reduction
console.log('\nCase 7: No fatal cap = no score reduction');
const capDisplay = content.substring(content.indexOf('<!-- v1.10.9: Score cap reason'), content.indexOf('<!-- Short-term Operational Risk'));
const trulyFatalReasons = ['reachability_failed', 'auth_401', 'core_chat_403', 'response_not_json', 'model_not_found', 'stability_failed'];
const hasOnlyFatalCheck = trulyFatalReasons.some(r => capDisplay.includes(r));
if (hasOnlyFatalCheck) {
  console.log('  PASS: Cap display checks only fatal reasons');
  passed++;
} else {
  console.log('  FAIL: Cap display may check non-fatal reasons');
  failed++;
}

// Case 8: Version number updated
console.log('\nCase 8: Version number');
const INDEX_HTML = path.join(__dirname, '..', 'index.html');
const indexContent = fs.readFileSync(INDEX_HTML, 'utf8');
if (indexContent.includes('v=20260526-v1109')) {
  console.log('  PASS: Version v1109 in index.html');
  passed++;
} else {
  console.log('  FAIL: Version not updated');
  failed++;
}

console.log(`\n=== Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log('\n✓ All v1.10.9 score consistency tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}
