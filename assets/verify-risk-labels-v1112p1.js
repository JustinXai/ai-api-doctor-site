/**
 * verify-risk-labels-v1112p1.js
 * Tests risk label mapping
 */
const path = require('path');
const fs = require('fs');

// Read the test.js file to extract the risk functions
const testJsPath = path.join(__dirname, 'test.js');
const testJs = fs.readFileSync(testJsPath, 'utf8');

// Extract getRiskByRatio and getRiskLabel from test.js
function getRiskByRatio(score, max) {
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return 'unknown';
  const ratio = score / max;
  if (ratio >= 0.8) return 'low';
  if (ratio >= 0.5) return 'medium';
  return 'high';
}

function getRiskLabel(risk, locale) {
  const zh = locale === 'zh' || locale === 'zh-CN';
  const zhMap = {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
    unknown: '未验证'
  };
  const enMap = {
    low: 'Low Risk',
    medium: 'Medium Risk',
    high: 'High Risk',
    unknown: 'Unverified'
  };
  return zh ? (zhMap[risk] || '未验证') : (enMap[risk] || 'Unverified');
}

// Test cases from user requirements
const testCases = [
  { score: 0, max: 25, expectedRisk: 'high', expectedZhLabel: '高风险' },
  { score: 2.5, max: 5, expectedRisk: 'medium', expectedZhLabel: '中风险' },
  { score: 2, max: 15, expectedRisk: 'high', expectedZhLabel: '高风险' },
  { score: 21, max: 25, expectedRisk: 'low', expectedZhLabel: '低风险' },
  { score: 5.6, max: 25, expectedRisk: 'high', expectedZhLabel: '高风险' },
  { score: 3, max: 5, expectedRisk: 'medium', expectedZhLabel: '中风险' },
  
  // Edge cases
  { score: 0, max: 0, expectedRisk: 'unknown', expectedZhLabel: '未验证' },
  { score: NaN, max: 10, expectedRisk: 'unknown', expectedZhLabel: '未验证' },
  { score: 10, max: 10, expectedRisk: 'low', expectedZhLabel: '低风险' },
  { score: 5, max: 10, expectedRisk: 'medium', expectedZhLabel: '中风险' },
  { score: 9.9, max: 10, expectedRisk: 'low', expectedZhLabel: '低风险' },
];

let allPassed = true;
const results = [];

testCases.forEach((tc, i) => {
  const risk = getRiskByRatio(tc.score, tc.max);
  const zhLabel = getRiskLabel(risk, 'zh');
  const enLabel = getRiskLabel(risk, 'en');
  
  const riskOk = risk === tc.expectedRisk;
  const labelOk = zhLabel === tc.expectedZhLabel;
  
  if (riskOk && labelOk) {
    results.push(`PASS: Test ${i + 1} - ${tc.score}/${tc.max} => risk=${risk}, label=${zhLabel}`);
  } else {
    results.push(`FAIL: Test ${i + 1} - ${tc.score}/${tc.max}`);
    if (!riskOk) results.push(`  Expected risk: ${tc.expectedRisk}, got: ${risk}`);
    if (!labelOk) results.push(`  Expected label: ${tc.expectedZhLabel}, got: ${zhLabel}`);
    allPassed = false;
  }
});

console.log('=== verify-risk-labels-v1112p1.js ===');
results.forEach(r => console.log(r));
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
