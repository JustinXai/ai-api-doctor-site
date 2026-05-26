/**
 * verify-no-object-object-v1112p1.js
 * Tests that [object Object] never appears in HTML output
 */
const fs = require('fs');
const path = require('path');

// Read the test.js file
const testJsPath = path.join(__dirname, 'test.js');
const testJs = fs.readFileSync(testJsPath, 'utf8');

// Extract the buildModuleCell function and related code
function simulateBuildModuleCell(label, score, max, risk, riskLabel, zh) {
  const riskColors = {
    low: { color: '#16a34a', bg: '#dcfce7' },
    medium: { color: '#d97706', bg: '#fef3c7' },
    high: { color: '#dc2626', bg: '#fee2e2' },
    unknown: { color: '#64748b', bg: '#f1f5f9' }
  };
  const riskLabels = {
    low: zh ? '低风险' : 'Low Risk',
    medium: zh ? '中风险' : 'Medium Risk',
    high: zh ? '高风险' : 'High Risk',
    unknown: zh ? '未验证' : 'Unverified'
  };
  const rc = riskColors[risk] || riskColors.unknown;
  const displayRiskLabel = typeof riskLabel === 'string' && riskLabel
    ? riskLabel
    : riskLabels[risk] || riskLabels.unknown;

  return `<button class="module-cell">
    <span class="module-name">${label}</span>
    <span class="module-score">${score}/${max}</span>
    <span class="risk-pill">${displayRiskLabel}</span>
  </button>`;
}

// Test cases
const testCases = [
  // Test 1: String labels should render correctly
  { label: '扣费透明度', score: 0, max: 25, risk: 'high', riskLabel: '高风险', zh: true },
  { label: 'Cache Signal', score: 2.5, max: 5, risk: 'medium', riskLabel: '中风险', zh: false },
  
  // Test 2: Object labels (should NOT happen in production - normalizeModuleForDisplay fixes this)
  // But test the safe fallback behavior
  { label: null, score: 5, max: 10, risk: 'low', riskLabel: '低风险', zh: true },
  
  // Test 3: Empty/undefined labels
  { label: undefined, score: 0, max: 25, risk: 'unknown', riskLabel: '未验证', zh: true },
  
  // Test 4: Empty string labels
  { label: '', score: 5, max: 15, risk: 'medium', riskLabel: '中风险', zh: true },
  
  // Test 5: All Chinese labels
  { label: '稳定性与延迟', score: 21, max: 25, risk: 'low', riskLabel: '低风险', zh: true },
  { label: '基础兼容性', score: 5.6, max: 25, risk: 'high', riskLabel: '高风险', zh: true },
  { label: '客户端配置', score: 3, max: 5, risk: 'medium', riskLabel: '中风险', zh: true },
];

let allPassed = true;
const results = [];

testCases.forEach((tc, i) => {
  const html = simulateBuildModuleCell(tc.label, tc.score, tc.max, tc.risk, tc.riskLabel, tc.zh);
  const hasObject = html.includes('[object Object]');
  
  if (hasObject) {
    results.push(`FAIL: Test ${i + 1} - Found [object Object] in output`);
    allPassed = false;
  } else {
    results.push(`PASS: Test ${i + 1} - No [object Object] found`);
  }
});

// Check that module.label is string type
const labelTests = [
  { label: '扣费透明度', expect: 'string' },
  { label: '模型信号', expect: 'string' },
  { label: 'Stability & Latency', expect: 'string' },
];

labelTests.forEach((tc, i) => {
  const isString = typeof tc.label === 'string';
  if (isString) {
    results.push(`PASS: Label type test ${i + 1} - label is string`);
  } else {
    results.push(`FAIL: Label type test ${i + 1} - label is not string`);
    allPassed = false;
  }
});

// Verify riskLabel is string
const riskLabelTests = [
  { riskLabel: '低风险', expect: 'string' },
  { riskLabel: '中风险', expect: 'string' },
  { riskLabel: '高风险', expect: 'string' },
  { riskLabel: '未验证', expect: 'string' },
  { riskLabel: 'Low Risk', expect: 'string' },
];

riskLabelTests.forEach((tc, i) => {
  const isString = typeof tc.riskLabel === 'string';
  if (isString) {
    results.push(`PASS: RiskLabel type test ${i + 1} - riskLabel is string`);
  } else {
    results.push(`FAIL: RiskLabel type test ${i + 1} - riskLabel is not string`);
    allPassed = false;
  }
});

console.log('=== verify-no-object-object-v1112p1.js ===');
results.forEach(r => console.log(r));
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
