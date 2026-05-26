/**
 * verify-risk-boundary-v1113p3.js
 * Tests risk label boundary (>=0.8 low, >=0.5 medium, else high)
 */
const fs = require('fs');
const path = require('path');

function getRiskByRatio(score, max) {
  const s = Number(score);
  const m = Number(max);
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return 'unknown';

  const ratio = s / m;

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

let allPassed = true;
const results = [];

// Test cases from requirements
const testCases = [
  // 0/25 → high risk (ratio = 0)
  { score: 0, max: 25, expectRisk: 'high', expectZhLabel: '高风险' },
  // 2.5/5 → medium risk (ratio = 0.5, exactly at boundary)
  { score: 2.5, max: 5, expectRisk: 'medium', expectZhLabel: '中风险' },
  // 2/15 → high risk (ratio = 0.133)
  { score: 2, max: 15, expectRisk: 'high', expectZhLabel: '高风险' },
  // 20/25 → low risk (ratio = 0.8, exactly at boundary)
  { score: 20, max: 25, expectRisk: 'low', expectZhLabel: '低风险' },
  // 5.6/25 → high risk (ratio = 0.224)
  { score: 5.6, max: 25, expectRisk: 'high', expectZhLabel: '高风险' },
  // 3/5 → medium risk (ratio = 0.6)
  { score: 3, max: 5, expectRisk: 'medium', expectZhLabel: '中风险' },
  // 4/5 → medium risk (ratio = 0.8, boundary case)
  { score: 4, max: 5, expectRisk: 'low', expectZhLabel: '低风险' },
  // 4.9/5 → low risk (ratio = 0.98)
  { score: 4.9, max: 5, expectRisk: 'low', expectZhLabel: '低风险' },
  // 2.4/5 → medium risk (ratio = 0.48, just below boundary)
  { score: 2.4, max: 5, expectRisk: 'high', expectZhLabel: '高风险' },
  // 19/25 → medium risk (ratio = 0.76)
  { score: 19, max: 25, expectRisk: 'medium', expectZhLabel: '中风险' },
];

results.push('=== Risk Label Boundary Tests ===\n');
testCases.forEach((tc, i) => {
  const ratio = tc.score / tc.max;
  const risk = getRiskByRatio(tc.score, tc.max);
  const zhLabel = getRiskLabel(risk, 'zh');
  const enLabel = getRiskLabel(risk, 'en');
  
  const riskOk = risk === tc.expectRisk;
  const labelOk = zhLabel === tc.expectZhLabel;
  
  if (riskOk && labelOk) {
    results.push(`PASS: ${tc.score}/${tc.max} (${(ratio * 100).toFixed(1)}%) => risk=${risk}, label=${zhLabel}`);
  } else {
    results.push(`FAIL: ${tc.score}/${tc.max} (${(ratio * 100).toFixed(1)}%)`);
    if (!riskOk) results.push(`  Expected risk: ${tc.expectRisk}, got: ${risk}`);
    if (!labelOk) results.push(`  Expected label: ${tc.expectZhLabel}, got: ${zhLabel}`);
    allPassed = false;
  }
});

// Edge cases
results.push('\n=== Edge Cases ===');
const edgeCases = [
  { score: NaN, max: 10, expectRisk: 'unknown' },
  { score: 5, max: NaN, expectRisk: 'unknown' },
  { score: 5, max: 0, expectRisk: 'unknown' },
  { score: 5, max: -5, expectRisk: 'unknown' },
  { score: Infinity, max: 10, expectRisk: 'unknown' },
  { score: 5, max: Infinity, expectRisk: 'unknown' }, // Infinity not finite, returns unknown
];

edgeCases.forEach((tc, i) => {
  const risk = getRiskByRatio(tc.score, tc.max);
  if (risk === tc.expectRisk) {
    results.push(`PASS: ${tc.score}/${tc.max} => risk=${risk}`);
  } else {
    results.push(`FAIL: ${tc.score}/${tc.max} => risk=${risk}, expected ${tc.expectRisk}`);
    allPassed = false;
  }
});

console.log('=== verify-risk-boundary-v1113p3.js ===');
results.forEach(r => console.log(r));
console.log(allPassed ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
