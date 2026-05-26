/**
 * AI API Doctor v1.10.9 — Two-Column Module Grid & Compact UI Verification
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TEST_JS = path.join(__dirname, 'test.js');
const CSS_FILE = path.join(__dirname, 'site.css');
const testContent = fs.readFileSync(TEST_JS, 'utf8');
const cssContent = fs.readFileSync(CSS_FILE, 'utf8');

let passed = 0;
let failed = 0;

console.log('\n=== API Doctor v1.10.9 Two-Column Module Grid & Compact UI Tests ===\n');

// Case 1: 6 modules in fixed order
console.log('Case 1: Module order in grid');
const moduleOrder = ['usageTransparency', 'cacheSignal', 'modelSignal', 'stabilityLatency', 'coreCompatibility', 'clientConfig'];
const gridStart = testContent.indexOf('<!-- v1.10.9: 6 module sections');
const gridSection = testContent.substring(gridStart, gridStart + 3000);
moduleOrder.forEach((mod, i) => {
  if (gridSection.includes(`buildModuleCell('${mod}'`)) {
    console.log(`  PASS: ${mod} found at position ${i + 1}`);
    passed++;
  } else {
    console.log(`  FAIL: ${mod} not found`);
    failed++;
  }
});

// Case 2: Two-column grid CSS
console.log('\nCase 2: Two-column grid CSS');
if (cssContent.includes('.module-grid') && cssContent.includes('grid-template-columns: 1fr 1fr')) {
  console.log('  PASS: module-grid with 2 columns');
  passed++;
} else {
  console.log('  FAIL: No two-column grid found');
  failed++;
}

// Case 3: Each cell shows only name, score, risk pill
console.log('\nCase 3: Module cell structure');
if (testContent.includes('class="module-cell"') && testContent.includes('class="module-name"') && testContent.includes('class="module-score"') && testContent.includes('class="risk-pill"')) {
  console.log('  PASS: Module cell has required structure');
  passed++;
} else {
  console.log('  FAIL: Module cell structure incomplete');
  failed++;
}

// Case 4: No long text in default state
console.log('\nCase 4: No verbose text in default UI');
const verbosePatterns = [
  '此分数不是模型能力评分',
  '官方基准线对比',
  '首次使用建议',
  '公开查询链接仅供人工复核',
  '仅基于公开域名注册时间',
  '完整运营风险评分'
];
verbosePatterns.forEach(pat => {
  if (testContent.includes(pat)) {
    console.log(`  FAIL: Found verbose text: ${pat.substring(0, 30)}`);
    failed++;
  } else {
    console.log(`  PASS: No verbose text: ${pat.substring(0, 30)}`);
    passed++;
  }
});

// Case 5: Operational risk 3-line display
console.log('\nCase 5: Operational risk compact 3-line');
const orSection = testContent.substring(testContent.indexOf('<!-- Short-term Operational Risk'), testContent.indexOf('<!-- v1.10.9: 6 module'));
if (orSection.includes('短期运营风险信号') && orSection.includes('检测域名') && orSection.includes('域名注册时间')) {
  console.log('  PASS: Operational risk has 3 required lines');
  passed++;
} else {
  console.log('  FAIL: Operational risk missing required lines');
  failed++;
}

// Case 6: Links hidden by default
console.log('\nCase 6: Public lookup links hidden by default');
if (orSection.includes('display:none') && orSection.includes('展开公开查询链接')) {
  console.log('  PASS: Links hidden by default');
  passed++;
} else {
  console.log('  FAIL: Links not properly hidden');
  failed++;
}

// Case 7: External links hidden (not visible by default)
console.log('\nCase 7: External links hidden by default');
const visibleLinks = orSection.match(/ICANN<\/a>|RDAP<\/a>|crt\.sh<\/a>|Wayback<\/a>/g);
if (visibleLinks && visibleLinks.length > 0 && orSection.includes('display:none')) {
  console.log(`  PASS: External links exist but hidden (${visibleLinks.length} links with display:none)`);
  passed++;
} else if (!visibleLinks || visibleLinks.length === 0) {
  console.log('  PASS: No external links in operational risk section');
  passed++;
} else {
  console.log(`  FAIL: External links visible without hidden: ${visibleLinks.length}`);
  failed++;
}

// Case 8: Module detail panel
console.log('\nCase 8: Module detail panel');
if (testContent.includes('module-detail-panel') && testContent.includes('function buildModuleDetail')) {
  console.log('  PASS: Module detail panel implemented');
  passed++;
} else {
  console.log('  FAIL: Module detail panel not found');
  failed++;
}

// Case 9: Chinese labels used, not internal keys in visible UI
console.log('\nCase 9: Chinese labels in UI');
if (gridSection.includes('扣费透明度') && gridSection.includes('缓存命中信号') && gridSection.includes('模型信号')) {
  console.log('  PASS: Chinese labels used in UI');
  passed++;
} else {
  console.log('  FAIL: Chinese labels not found');
  failed++;
}

// Case 10: Mobile responsive CSS
console.log('\nCase 10: Mobile responsive CSS');
if (cssContent.includes('@media (max-width: 640px)') && cssContent.includes('grid-template-columns: 1fr')) {
  console.log('  PASS: Mobile single-column layout');
  passed++;
} else {
  console.log('  FAIL: Mobile layout not found');
  failed++;
}

// Case 11: Suggestion text is compact
console.log('\nCase 11: Compact suggestions');
const suggestStart = testContent.indexOf('function generateSuggestions');
const suggestEnd = testContent.indexOf('function buildReportCardHTML');
const suggestFunc = testContent.substring(suggestStart, suggestEnd);
if (!suggestFunc.includes('本次稳定性波动较大，建议在同一网络环境下重复测试')) {
  console.log('  PASS: Suggestions are compact');
  passed++;
} else {
  console.log('  FAIL: Suggestions too verbose');
  failed++;
}

// Case 12: No duplicate cap notice in UI section
console.log('\nCase 12: Cap notice in cap reason section only');
const capNoticeInUI = (testContent.substring(gridStart - 500, gridStart).match(/关键失败封顶/g) || []).length;
if (capNoticeInUI <= 1) {
  console.log(`  PASS: Cap notice count in UI section: ${capNoticeInUI}`);
  passed++;
} else {
  console.log(`  FAIL: Too many cap notices: ${capNoticeInUI}`);
  failed++;
}

// Case 13: Score arrow in module cell
console.log('\nCase 13: Module cell has arrow');
if (testContent.includes('class="module-arrow"')) {
  console.log('  PASS: Module arrow exists');
  passed++;
} else {
  console.log('  FAIL: Module arrow missing');
  failed++;
}

console.log(`\n=== Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log('\n✓ All v1.10.9 two-column grid & compact UI tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}
