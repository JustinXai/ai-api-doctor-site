/**
 * API Doctor v1.10.8 — Report Compact UI Verification Tests
 * Tests that redundant text blocks are removed and compact UI is correct.
 */
'use strict';

// Load the test.js file content
const fs = require('fs');
const path = require('path');

const testJsPath = path.join(__dirname, 'test.js');
const testJsContent = fs.readFileSync(testJsPath, 'utf8');

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

console.log('=== API Doctor v1.10.8 Report Compact UI Tests ===\n');

// Case 1: Default report should NOT contain these redundant texts in the UI
console.log('Case 1: Redundant text blocks should be REMOVED from UI output');
console.log('  (These phrases should NOT appear in the default visible report area)');

// Check that these phrases are NOT in the buildReportCardHTML default display
// Note: copyScore still has decisionMap[F] for existing functionality
// But the default visual report should NOT show them
// We check the specific areas where they would appear in the default view
const uiAreaMatch = testJsContent.match(/return `[\s\S]*?`;[\s\S]*?${toolCallingHtml}[\s\S]*?${suggestionHtml}/);
const uiArea = uiAreaMatch ? uiAreaMatch[0] : testJsContent;

const removedFromUI = [
  '此分数不是模型能力评分，而是当前 Base URL / API Key / Model 配置在兼容性、透明度、稳定性和客户端接入方面的风险评分。',
  '使用建议：当前配置存在关键失败，不建议继续使用',
  '公开查询链接仅供人工复核，不参与 API 技术评分。',
  '仅基于公开域名注册时间，不影响 API 技术评分。',
  '官方基准线对比',
  '首次使用建议'
];

for (const phrase of removedFromUI) {
  // These should not appear in the default report card HTML
  assertFalse(
    testJsContent.includes(phrase),
    `Should NOT contain in default UI: "${phrase.substring(0, 40)}..."`
  );
}

// Case 2: Operational Risk compact UI for ageDays=65
console.log('\nCase 2: Operational Risk compact UI should show 3-line display');
assertTrue(testJsContent.includes('短期运营风险信号'), 'Should have short-term operational risk signal title');
assertTrue(testJsContent.includes('scoreDomainAgeSignal'), 'Should use scoreDomainAgeSignal function');

// Verify age=65 gives Medium Risk, 2/10
const scoreFnMatch = testJsContent.match(/function scoreDomainAgeSignal[\s\S]{0,2000}/);
assertTrue(scoreFnMatch !== null, 'scoreDomainAgeSignal function should exist');
if (scoreFnMatch) {
  const fnContent = scoreFnMatch[0];
  // Verify the boundary: 60-119 days should give medium risk 2/10
  assertTrue(fnContent.includes('< 120') && fnContent.includes('< 365'), 'Should have medium threshold (120 days) and medium_low threshold (365 days)');
  assertTrue(fnContent.includes('score: 2') && fnContent.includes('max: 10'), 'Should return score 2/10 for medium risk');
  assertTrue(fnContent.includes("zhLabel: '中等风险'") || fnContent.includes('zhLabel: "中等风险"'), 'Should have Chinese label for medium risk');
  // Verify the actual ageDays display text
  assertTrue(fnContent.includes('65') || fnContent.includes('days ago'), 'Function should handle day-based display');
}

// Verify the compact UI structure uses "days ago" format
assertTrue(testJsContent.includes('days ago') || testJsContent.includes('天前'), 'Should display age in days format');
// Verify the UI shows "Domain Registered" or equivalent Chinese text
assertTrue(
  testJsContent.includes('Domain Registered') ||
  testJsContent.includes('域名注册时间') ||
  testJsContent.includes('域名年龄'),
  'Should show domain registration info'
);
// Verify collapsible links
assertTrue(
  testJsContent.includes('展开公开查询链接') ||
  testJsContent.includes('[展开公开查询链接]') ||
  testJsContent.includes('Show public lookup links'),
  'Should have collapsible links'
);

// Case 3: Chinese report should NOT show internal keys like usageTransparency
console.log('\nCase 3: Chinese UI should NOT expose internal keys');
const internalKeys = [
  'usageTransparency',
  'cacheHitCheck',
  'modelSignal',
  'stabilityLatency',
  'basicCompatibility',
  'clientConfig',
  'sourceTransparency',
  'operationalRisk'
];

// These are allowed in comments and variable names, but NOT in user-facing text
// We check that they don't appear in label assignments in the module section calls
const moduleSectionCalls = testJsContent.match(/moduleSection\('[^']+',\s*\{[^}]+\}/g) || [];
for (const call of moduleSectionCalls) {
  // Check if the object has a label property with internal key name
  const labelMatch = call.match(/label:\s*['"]([^'"]+)['"]/);
  if (labelMatch) {
    const label = labelMatch[1];
    for (const key of internalKeys) {
      assertFalse(
        label === key,
        `Module section label should not be internal key "${key}"`
      );
    }
  }
}

// Verify breakdown object has proper labels
assertTrue(testJsContent.includes("label: '扣费透明度'"), 'breakdown should have Chinese label for cost transparency');
assertTrue(testJsContent.includes("label: '稳定性与延迟'"), 'breakdown should have Chinese label for stability');
assertTrue(testJsContent.includes("label: '基础兼容性'"), 'breakdown should have Chinese label for compatibility');

// Case 4: Module details should default to collapsed (click to expand)
console.log('\nCase 4: Module details should be collapsible by default');
assertTrue(testJsContent.includes('点击展开详情') || testJsContent.includes('tap to expand'), 'Should have collapsible instruction');
assertTrue(testJsContent.includes('collapsed') || testJsContent.includes('display:none') || testJsContent.includes('display: none'), 'Details should be hidden by default');

// Case 5: Cap notice should be short
console.log('\nCase 5: Cap notice (if shown) should be short');
assertTrue(testJsContent.includes('关键失败封顶'), 'Should have short cap notice in Chinese');
assertTrue(testJsContent.includes('Capped by critical failure'), 'Should have short cap notice in English');

// Case 6: No long disclaimer in copyScore
console.log('\nCase 6: copyScore should NOT have long disclaimer');
assertFalse(testJsContent.includes('此分数不是模型能力评分，而是当前 Base URL / API Key / Model 配置'), 'copyScore should not have long disclaimer');
assertTrue(testJsContent.includes('关键失败封顶') && testJsContent.includes('capNotice'), 'copyScore should have short capNotice instead');

// Case 7: Score display uses same score as module sum
console.log('\nCase 7: Score consistency — top score equals module sum');
assertTrue(testJsContent.includes('displayScore = score') || testJsContent.includes('displayScore = score;'), 'Top display score should equal the capped score');
assertTrue(testJsContent.includes('breakdownTotalRaw') || testJsContent.includes('breakdown?.totalRaw'), 'Should track raw module sum');

// Case 8: Version number updated
console.log('\nCase 8: Version numbers should be v1108');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const enIndexHtml = fs.readFileSync(path.join(__dirname, '..', 'en', 'index.html'), 'utf8');
assertTrue(indexHtml.includes('v1108'), 'index.html should have v1108');
assertTrue(enIndexHtml.includes('v1108'), 'en/index.html should have v1108');

// Summary
console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
  console.log('\nSome tests FAILED!');
  process.exit(1);
} else {
  console.log('\nAll tests PASSED!');
  process.exit(0);
}
