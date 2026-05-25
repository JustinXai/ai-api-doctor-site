/**
 * AI API Doctor v1.10.7 — Operational Risk Compact UI & Domain Age Scoring Tests
 */

'use strict';

// ── Copy of scoreDomainAgeSignal from test.js ────────────────────────────────

function scoreDomainAgeSignal(ageDays) {
  if (ageDays == null || !Number.isFinite(ageDays)) {
    return { score: null, max: 10, level: 'unknown', zhLabel: '未确认', enLabel: 'Unconfirmed' };
  }
  if (ageDays < 30)  return { score: 0,  max: 10, level: 'high',       zhLabel: '高风险',     enLabel: 'High Risk' };
  if (ageDays < 60)  return { score: 1,  max: 10, level: 'elevated',   zhLabel: '偏高风险',   enLabel: 'Elevated Risk' };
  if (ageDays < 120) return { score: 2,  max: 10, level: 'medium',     zhLabel: '中等风险',   enLabel: 'Medium Risk' };
  if (ageDays < 365) return { score: 5,  max: 10, level: 'medium_low', zhLabel: '中低风险',   enLabel: 'Medium-Low Risk' };
  if (ageDays < 1095) return { score: 8,  max: 10, level: 'low',       zhLabel: '低风险',     enLabel: 'Low Risk' };
  return                  { score: 10, max: 10, level: 'stable',     zhLabel: '较稳定',     enLabel: 'More Established' };
}

function escH(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Simulate the v1.10.7 compact UI rendering ───────────────────────────────

function renderCompactORCard(domainSignal, certSignal, hostname, zh) {
  const domainAvailable = domainSignal && domainSignal.available === true;
  const certAvailable = certSignal && certSignal.available === true;
  const ageDays = domainSignal ? domainSignal.ageDays : null;

  const domainAgeSignal = domainAvailable ? scoreDomainAgeSignal(ageDays) : null;
  const ageLevel = domainAgeSignal ? domainAgeSignal.level : 'unknown';
  const ageLabel = domainAgeSignal
    ? (zh ? domainAgeSignal.zhLabel : domainAgeSignal.enLabel)
    : (zh ? '未确认' : 'Unconfirmed');

  const levelColors = {
    high:       { tagColor: '#dc2626', tagBg: '#fee2e2', tagBorder: '#fecaca', cardBg: '#fff', cardBorder: '#fecaca' },
    elevated:   { tagColor: '#ea580c', tagBg: '#fff7ed', tagBorder: '#fed7aa', cardBg: '#fff', cardBorder: '#fed7aa' },
    medium:     { tagColor: '#d97706', tagBg: '#fef9c3', tagBorder: '#fde68a', cardBg: '#fff', cardBorder: '#fde68a' },
    medium_low: { tagColor: '#0891b2', tagBg: '#ecfeff', tagBorder: '#a5f3fc', cardBg: '#fff', cardBorder: '#a5f3fc' },
    low:        { tagColor: '#16a34a', tagBg: '#f0fdf4', tagBorder: '#bbf7d0', cardBg: '#fff', cardBorder: '#bbf7d0' },
    stable:     { tagColor: '#15803d', tagBg: '#dcfce7', tagBorder: '#86efac', cardBg: '#fff', cardBorder: '#86efac' },
    unknown:    { tagColor: '#64748b', tagBg: '#f8fafc', tagBorder: '#e2e8f0', cardBg: '#fff', cardBorder: '#e2e8f0' }
  };
  const lc = levelColors[ageLevel] || levelColors.unknown;

  const domainAgeText = domainAvailable
    ? `${ageDays} ${zh ? '天前' : 'days ago'}`
    : (zh ? '自动查询失败' : 'Auto-lookup failed');

  const scoreText = domainAgeSignal && domainAgeSignal.score !== null
    ? `${domainAgeSignal.score}/10`
    : '';

  const isPartial = domainAvailable && !certAvailable;
  const partialHint = isPartial ? (zh ? '（部分证据）' : ' (Partial Evidence)') : '';

  const title = `${zh ? '短期运营风险信号' : 'Short-term Operational Risk Signal'}`;
  const scoreSuffix = scoreText ? ` ${scoreText}` : '';

  const html = `
    <div>
      <div><span>${title}：${ageLabel}${partialHint}${scoreSuffix}</span></div>
      <div>${zh ? '检测域名：' : 'Domain: '}${escH(hostname || '—')}</div>
      <div>${zh ? '域名注册时间：' : 'Domain Registered: '}${escH(domainAgeText)}</div>
      ${!domainAvailable ? `<div>${zh ? '无法自动获取域名注册时间，建议手动复核。' : 'Domain registration age could not be retrieved automatically. Manual review is recommended.'}</div>` : ''}
    </div>
  `;

  return { html, ageLevel, ageLabel, scoreText, isPartial };
}

// ── Test Cases ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assertEqual(a, e, n) {
  if (JSON.stringify(a) === JSON.stringify(e)) { console.log(`  PASS: ${n}`); passed++; }
  else { console.log(`  FAIL: ${n}`); console.log(`    Expected: ${JSON.stringify(e)}`); console.log(`    Actual:   ${JSON.stringify(a)}`); failed++; }
}
function assertTrue(v, n) { if (v === true) { console.log(`  PASS: ${n}`); passed++; } else { console.log(`  FAIL: ${n}`); failed++; } }
function assertFalse(v, n) { if (v === false) { console.log(`  PASS: ${n}`); passed++; } else { console.log(`  FAIL: ${n}`); failed++; } }
function assertContains(s, n, msg) { if (s && s.includes && s.includes(n)) { console.log(`  PASS: ${msg}`); passed++; } else { console.log(`  FAIL: ${msg} - "${n}" not found in "${s}"`); failed++; } }
function assertNotContains(s, n, msg) { if (!s || !s.includes || !s.includes(n)) { console.log(`  PASS: ${msg}`); passed++; } else { console.log(`  FAIL: ${msg} - "${n}" should NOT be in output`); failed++; } }

console.log('\n=== AI API Doctor v1.10.7 Operational Risk Compact UI & Domain Age Scoring Tests ===\n');

// ── Score boundary tests ────────────────────────────────────────────────────

console.log('\n--- Score boundary tests ---');

const cases = [
  { age: 10,  expectScore: 0, expectLevel: 'high',       expectZh: '高风险',     expectEn: 'High Risk' },
  { age: 45,  expectScore: 1, expectLevel: 'elevated',    expectZh: '偏高风险',   expectEn: 'Elevated Risk' },
  { age: 65,  expectScore: 2, expectLevel: 'medium',       expectZh: '中等风险',   expectEn: 'Medium Risk' },
  { age: 200, expectScore: 5, expectLevel: 'medium_low',  expectZh: '中低风险',   expectEn: 'Medium-Low Risk' },
  { age: 400, expectScore: 8, expectLevel: 'low',         expectZh: '低风险',     expectEn: 'Low Risk' },
  { age: 1200,expectScore: 10,expectLevel: 'stable',      expectZh: '较稳定',     expectEn: 'More Established' },
];

for (const c of cases) {
  const r = scoreDomainAgeSignal(c.age);
  assertEqual(r.score, c.expectScore, `ageDays=${c.age} score=${c.expectScore}`);
  assertEqual(r.level, c.expectLevel, `ageDays=${c.age} level=${c.expectLevel}`);
  assertEqual(r.zhLabel, c.expectZh, `ageDays=${c.age} zhLabel=${c.expectZh}`);
  assertEqual(r.enLabel, c.expectEn, `ageDays=${c.age} enLabel=${c.expectEn}`);
  assertEqual(r.max, 10, `ageDays=${c.age} max=10`);
}

// Boundary: null
const rNull = scoreDomainAgeSignal(null);
assertEqual(rNull.score, null, 'null ageDays score=null');
assertEqual(rNull.level, 'unknown', 'null ageDays level=unknown');
assertEqual(rNull.zhLabel, '未确认', 'null ageDays zhLabel=未确认');

// Boundary: undefined
const rUndef = scoreDomainAgeSignal(undefined);
assertEqual(rUndef.score, null, 'undefined ageDays score=null');

// Boundary: exactly 30, 60, 120, 365, 1095
const edgeCases = [
  { age: 30,  expectScore: 1,  level: 'elevated' },   // 30 >= 30, < 60 → elevated
  { age: 60,  expectScore: 2,  level: 'medium' },    // 60 >= 60, < 120 → medium
  { age: 119, expectScore: 2,  level: 'medium' },    // 119 >= 119, < 120 → medium
  { age: 120, expectScore: 5,  level: 'medium_low' }, // 120 >= 120, < 365 → medium_low
  { age: 365, expectScore: 8,  level: 'low' },       // 365 >= 365, < 1095 → low
  { age: 1095,expectScore: 10, level: 'stable' },    // 1095 >= 1095 → stable
];
for (const c of edgeCases) {
  const r = scoreDomainAgeSignal(c.age);
  assertEqual(r.score, c.expectScore, `boundary ageDays=${c.age} score=${c.expectScore}`);
  assertEqual(r.level, c.level, `boundary ageDays=${c.age} level=${c.level}`);
}

// ── Case 7: Compact ZH UI for 65 days ─────────────────────────────────────────

console.log('\n--- Case 7: Compact ZH UI for 65 days ---');

const zh65 = renderCompactORCard(
  { available: true, ageDays: 65 },
  { available: false },
  'aizhongzhuan.com',
  true
);

assertContains(zh65.html, '短期运营风险信号', 'Contains 短期运营风险信号');
assertContains(zh65.html, '中等风险', 'Contains 中等风险');
assertContains(zh65.html, '部分证据', 'Contains 部分证据');
assertContains(zh65.html, '2/10', 'Contains 2/10');
assertContains(zh65.html, 'aizhongzhuan.com', 'Contains hostname');
assertContains(zh65.html, '65 天前', 'Contains 65 天前');
assertNotContains(zh65.html, '证书首次发现', 'Does NOT contain 证书首次发现');
assertNotContains(zh65.html, '完整运营风险评分', 'Does NOT contain 完整运营风险评分');
assertNotContains(zh65.html, 'ICANN Lookup', 'Does NOT contain ICANN Lookup');
assertNotContains(zh65.html, 'crt.sh', 'Does NOT contain crt.sh');
assertNotContains(zh65.html, '大额预充值', 'Does NOT contain 大额预充值');
assertNotContains(zh65.html, '3/20', 'Does NOT contain 3/20');
assertNotContains(zh65.html, '9/20', 'Does NOT contain 9/20');
assertNotContains(zh65.html, 'HTTPS site history is very short', 'Does NOT contain HTTPS site history');

// ── Case 8: Compact EN UI for 65 days ─────────────────────────────────────────

console.log('\n--- Case 8: Compact EN UI for 65 days ---');

const en65 = renderCompactORCard(
  { available: true, ageDays: 65 },
  { available: false },
  'aizhongzhuan.com',
  false
);

assertContains(en65.html, 'Short-term Operational Risk Signal', 'EN: Contains Short-term Operational Risk Signal');
assertContains(en65.html, 'Medium Risk', 'EN: Contains Medium Risk');
assertContains(en65.html, 'Partial Evidence', 'EN: Contains Partial Evidence');
assertContains(en65.html, '2/10', 'EN: Contains 2/10');
assertContains(en65.html, '65 days ago', 'EN: Contains 65 days ago');
assertNotContains(en65.html, 'Cert First Seen', 'EN: Does NOT contain Cert First Seen');
assertNotContains(en65.html, 'Full Operational Score', 'EN: Does NOT contain Full Operational Score');
assertNotContains(en65.html, '3/20', 'EN: Does NOT contain 3/20');
assertNotContains(en65.html, '9/20', 'EN: Does NOT contain 9/20');
assertNotContains(en65.html, 'HTTPS site history is very short', 'EN: Does NOT contain HTTPS site history is very short');

// ── Case 9: Unknown UI ──────────────────────────────────────────────────────

console.log('\n--- Case 9: Unknown UI ---');

const unknownZH = renderCompactORCard(
  { available: false },
  { available: false },
  'aizhongzhuan.com',
  true
);
const unknownEN = renderCompactORCard(
  { available: false },
  { available: false },
  'aizhongzhuan.com',
  false
);

assertContains(unknownZH.html, '未确认', 'ZH: Contains 未确认');
assertContains(unknownZH.html, '自动查询失败', 'ZH: Contains 自动查询失败');
assertContains(unknownZH.html, '无法自动获取', 'ZH: Contains 无法自动获取');
assertNotContains(unknownZH.html, '9/20', 'ZH: Unknown should NOT show 9/20');
assertNotContains(unknownZH.html, '完整运营风险评分', 'ZH: Unknown should NOT show 完整运营风险评分');

assertContains(unknownEN.html, 'Unconfirmed', 'EN: Contains Unconfirmed');
assertNotContains(unknownEN.html, '9/20', 'EN: Unknown should NOT show 9/20');
assertNotContains(unknownEN.html, 'Full Operational Score', 'EN: Unknown should NOT show Full Operational Score');

// ── Case 10: Full both available ────────────────────────────────────────────

console.log('\n--- Case 10: Full both available ---');

const full = renderCompactORCard(
  { available: true, ageDays: 2000 },
  { available: true, firstSeenDays: 1000 },
  'github.com',
  true
);

assertContains(full.html, '较稳定', 'Full domain age 2000 = stable');
assertContains(full.html, '10/10', 'Full shows 10/10');

// ── Case 11: Only 2 lines should exist (title + domain + age) ─────────────────

console.log('\n--- Case 11: ZH compact 65 days - line count check ---');

// ZH title: 短期运营风险信号：中等风险（部分证据）2/10
// ZH domain: 检测域名：aizhongzhuan.com
// ZH age: 域名注册时间：65 天前
// + 1 footer line
assertContains(zh65.html, '短期运营风险信号：中等风险（部分证据） 2/10', 'ZH: Full title line with score');

// ── Case 12: 30 days = elevated risk (not high) ───────────────────────────────

console.log('\n--- Case 12: 30 days = elevated risk ---');

const r30 = scoreDomainAgeSignal(30);
assertEqual(r30.level, 'elevated', '30 days = elevated (>= 30, < 60)');
assertEqual(r30.score, 1, '30 days = 1/10');

// ── Case 13: 59 days = elevated risk ─────────────────────────────────────

console.log('\n--- Case 13: 59 days = elevated risk ---');

const r59 = scoreDomainAgeSignal(59);
assertEqual(r59.level, 'elevated', '59 days = elevated');
assertEqual(r59.score, 1, '59 days = 1/10');

// ── Case 14: 119 days = medium risk ─────────────────────────────────────

console.log('\n--- Case 14: 119 days = medium risk ---');

const r119 = scoreDomainAgeSignal(119);
assertEqual(r119.level, 'medium', '119 days = medium (< 120)');
assertEqual(r119.score, 2, '119 days = 2/10');

// ── Summary ────────────────────────────────────────────────────────────────────

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All v1.10.7 compact UI & domain age scoring tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}
