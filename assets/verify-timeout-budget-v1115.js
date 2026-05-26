/**
 * verify-timeout-budget-v1115.js
 * Tests timeout budget configuration
 */
const fs = require('fs');
const path = require('path');

const testJsPath = path.join(__dirname, 'test.js');
const testJs = fs.readFileSync(testJsPath, 'utf8');

let allPassed = true;
const results = [];

results.push('=== v1.11.5 Timeout Budget Verification ===\n');

// Case 1: TARGET_CALL_TIMEOUT_MS = 30000
results.push('Case 1: TARGET_CALL_TIMEOUT_MS');
const targetCallMatch = testJs.match(/TARGET_CALL_TIMEOUT_MS:\s*(\d+)/);
if (targetCallMatch) {
  const value = parseInt(targetCallMatch[1]);
  if (value === 30000) {
    results.push(`  PASS: TARGET_CALL_TIMEOUT_MS = ${value} (30s)`);
  } else {
    results.push(`  FAIL: TARGET_CALL_TIMEOUT_MS = ${value}, expected 30000`);
    allPassed = false;
  }
} else {
  results.push('  FAIL: TARGET_CALL_TIMEOUT_MS not found');
  allPassed = false;
}

// Case 2: USAGE_AUDIT_TIMEOUT_MS = 30000
results.push('\nCase 2: USAGE_AUDIT_TIMEOUT_MS');
const usageMatch = testJs.match(/USAGE_AUDIT_TIMEOUT_MS:\s*(\d+)/);
if (usageMatch) {
  const value = parseInt(usageMatch[1]);
  if (value === 30000) {
    results.push(`  PASS: USAGE_AUDIT_TIMEOUT_MS = ${value} (30s)`);
  } else {
    results.push(`  FAIL: USAGE_AUDIT_TIMEOUT_MS = ${value}, expected 30000`);
    allPassed = false;
  }
} else {
  results.push('  FAIL: USAGE_AUDIT_TIMEOUT_MS not found');
  allPassed = false;
}

// Case 3: GLOBAL_TIMEOUT_MS unchanged
results.push('\nCase 3: GLOBAL_TIMEOUT_MS unchanged (150s)');
const globalMatch = testJs.match(/GLOBAL_TIMEOUT_MS:\s*(\d+)/);
if (globalMatch) {
  const value = parseInt(globalMatch[1]);
  if (value === 150000) {
    results.push(`  PASS: GLOBAL_TIMEOUT_MS = ${value} (150s, unchanged)`);
  } else {
    results.push(`  FAIL: GLOBAL_TIMEOUT_MS = ${value}, expected 150000`);
    allPassed = false;
  }
} else {
  results.push('  FAIL: GLOBAL_TIMEOUT_MS not found');
  allPassed = false;
}

// Case 4: PUBLIC_SIGNALS_TIMEOUT_MS unchanged
results.push('\nCase 4: PUBLIC_SIGNALS_TIMEOUT_MS unchanged (6s)');
const publicMatch = testJs.match(/PUBLIC_SIGNALS_TIMEOUT_MS:\s*(\d+)/);
if (publicMatch) {
  const value = parseInt(publicMatch[1]);
  if (value === 6000) {
    results.push(`  PASS: PUBLIC_SIGNALS_TIMEOUT_MS = ${value} (6s, unchanged)`);
  } else {
    results.push(`  FAIL: PUBLIC_SIGNALS_TIMEOUT_MS = ${value}, expected 6000`);
    allPassed = false;
  }
} else {
  results.push('  FAIL: PUBLIC_SIGNALS_TIMEOUT_MS not found');
  allPassed = false;
}

// Case 5: STEP_TIMEOUTS updated
results.push('\nCase 5: STEP_TIMEOUTS.usageTransparency = 30000');
// Match specifically within STEP_TIMEOUTS block
const stepTimeoutBlock = testJs.match(/STEP_TIMEOUTS[\s\S]*?\}/);
if (stepTimeoutBlock) {
  const usageMatch = stepTimeoutBlock[0].match(/usageTransparency:\s*(\d+)/);
  if (usageMatch) {
    const value = parseInt(usageMatch[1]);
    if (value === 30000) {
      results.push(`  PASS: STEP_TIMEOUTS.usageTransparency = ${value}`);
    } else {
      results.push(`  FAIL: STEP_TIMEOUTS.usageTransparency = ${value}, expected 30000`);
      allPassed = false;
    }
  } else {
    results.push('  FAIL: STEP_TIMEOUTS.usageTransparency not found');
    allPassed = false;
  }
} else {
  results.push('  FAIL: STEP_TIMEOUTS block not found');
  allPassed = false;
}

console.log('=== verify-timeout-budget-v1115.js ===');
results.forEach(r => console.log(r));
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
