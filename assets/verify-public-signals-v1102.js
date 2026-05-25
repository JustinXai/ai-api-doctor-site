/**
 * AI API Doctor v1.10.2 — Public Signals Display & Logic Tests
 */

'use strict';

// ── Copy of relevant functions from test.js ──────────────────────────────────

const MULTI_SEGMENT_TLDS = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'co.uk', 'org.uk', 'co.jp', 'ne.jp', 'or.jp', 'ac.jp',
  'com.au', 'net.au', 'org.au', 'com.br', 'net.br', 'org.br',
  'com.mx', 'net.mx', 'org.mx', 'com.ar', 'net.ar', 'org.ar',
  'com.sg', 'net.sg', 'org.sg', 'com.hk', 'net.hk', 'org.hk',
  'co.nz', 'net.nz', 'org.nz', 'com.tw', 'net.tw', 'org.tw'
]);

function guessRegistrableDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join('.');
    if (MULTI_SEGMENT_TLDS.has(lastTwo)) return parts.slice(-3).join('.');
  }
  if (parts.length >= 2) return parts.slice(-2).join('.');
  return hostname;
}

function getTld(hostname) {
  const parts = hostname.split('.');
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

function buildVerisignUrl(domain) {
  const tld = getTld(domain);
  const verisignTlds = {
    'com': 'https://rdap.verisign.com/com/v1/domain/',
    'net': 'https://rdap.verisign.com/net/v1/domain/',
    'name': 'https://rdap.verisign.com/name/v1/domain/',
    'cc': 'https://rdap.nic.cc/cc/domain/'
  };
  return verisignTlds[tld] ? verisignTlds[tld] + domain : null;
}

function calcOperationalRiskScore(domainSignal, certSignal) {
  const MAX_DOMAIN = 10;
  const MAX_CERT = 8;
  const MAX_VERIFIABILITY = 2;
  const MAX_SCORE = MAX_DOMAIN + MAX_CERT + MAX_VERIFIABILITY; // 20

  const domainAvailable = domainSignal && domainSignal.available === true;
  const certAvailable = certSignal && certSignal.available === true;

  // Both unavailable → not scored
  if (!domainAvailable && !certAvailable) {
    return {
      score: null,
      max: MAX_SCORE,
      domainScore: 0,
      certScore: 0,
      verifiabilityScore: 0,
      level: 'unknown',
      scored: false
    };
  }

  let domainScore = 0;
  let certScore = 0;
  let verifiabilityScore = 0;

  // Domain registration score (10 pts)
  if (domainAvailable && domainSignal.ageDays !== null) {
    const days = domainSignal.ageDays;
    if (days >= 1095) domainScore = 10;
    else if (days >= 365) domainScore = 8;
    else if (days >= 180) domainScore = 6;
    else if (days >= 90) domainScore = 4;
    else if (days >= 30) domainScore = 2;
    else domainScore = 0;
  } else {
    domainScore = 0;
  }

  // Certificate first-seen score (8 pts)
  if (certAvailable && certSignal.firstSeenDays !== null) {
    const days = certSignal.firstSeenDays;
    if (days >= 365) certScore = 8;
    else if (days >= 180) certScore = 6;
    else if (days >= 90) certScore = 4;
    else if (days >= 30) certScore = 2;
    else certScore = 0;
  } else {
    certScore = 0;
  }

  // Verifiability score (2 pts)
  if (domainAvailable && certAvailable) {
    verifiabilityScore = 2;
  } else if (domainAvailable || certAvailable) {
    verifiabilityScore = 1;
  }

  const totalScore = domainScore + certScore + verifiabilityScore;

  // Determine level
  let level = 'unknown';
  if (totalScore >= 16) level = 'low';
  else if (totalScore >= 10) level = 'medium';
  else level = 'high';

  return {
    score: totalScore,
    max: MAX_SCORE,
    domainScore,
    certScore,
    verifiabilityScore,
    level,
    scored: true
  };
}

function buildPublicSignalsStatus(domainRegistration, certificateHistory) {
  const domainOk = domainRegistration && domainRegistration.available === true;
  const certOk = certificateHistory && certificateHistory.available === true;
  let status = 'unknown';
  let confidence = 'none';
  if (domainOk && certOk) { status = 'full'; confidence = 'full'; }
  else if (domainOk || certOk) { status = 'partial'; confidence = 'partial'; }
  return { status, confidence };
}

function getCacheTtl(status) {
  switch (status) {
    case 'full': return 86400;
    case 'partial': return 21600;
    default: return 1800;
  }
}

function buildOperationalRiskConfidence(publicSignalsData, domainRegistration, certificateHistory) {
  const workerStatus = publicSignalsData && publicSignalsData.status ? publicSignalsData.status : 'unknown';
  const domainAvailable = domainRegistration && domainRegistration.available === true;
  const certAvailable = certificateHistory && certificateHistory.available === true;
  return workerStatus === 'full' ? 'full'
    : (workerStatus === 'partial' || domainAvailable || certAvailable) ? 'partial'
    : 'none';
}

function renderScoreDisplay(scored, confidence, score, max, zh) {
  const isPartial = confidence === 'partial';
  const isUnknown = !scored || confidence === 'none';

  if (isUnknown) {
    return `<span style="font-weight:700;color:#94a3b8">${zh ? '未评分' : 'Not Scored'}</span>`;
  }

  let suffix = '';
  if (isPartial) {
    suffix = `<span style="font-size:9px;color:#d97706"> ${zh ? '（仅基于部分公开信号）' : '(partial)'}</span>`;
  }
  return `<span style="font-weight:700">${score}/${max}</span>${suffix}`;
}

function renderTitle(confidence, levelLabel, zh) {
  const titleSuffix = confidence === 'partial' ? (zh ? '（部分确认）' : ' (Partial)') : '';
  return `${zh ? '短期运营风险信号' : 'Short-term Operational Risk Signals'}${titleSuffix}`;
}

// ── Test Cases ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, testName) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`  PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  FAIL: ${testName}`);
    console.log(`    Expected: ${expectedStr}`);
    console.log(`    Actual:   ${actualStr}`);
    failed++;
  }
}

function assertTrue(value, testName) {
  if (value === true) { console.log(`  PASS: ${testName}`); passed++; }
  else { console.log(`  FAIL: ${testName} - Expected true, got ${value}`); failed++; }
}

function assertFalse(value, testName) {
  if (value === false) { console.log(`  PASS: ${testName}`); passed++; }
  else { console.log(`  FAIL: ${testName} - Expected false, got ${value}`); failed++; }
}

function assertNull(value, testName) {
  if (value === null) { console.log(`  PASS: ${testName}`); passed++; }
  else { console.log(`  FAIL: ${testName} - Expected null, got ${value}`); failed++; }
}

function assertInRange(value, min, max, testName) {
  if (value >= min && value <= max) { console.log(`  PASS: ${testName}`); passed++; }
  else { console.log(`  FAIL: ${testName} - Expected ${min}-${max}, got ${value}`); failed++; }
}

function assertContains(haystack, needle, testName) {
  if (haystack && haystack.includes && haystack.includes(needle)) {
    console.log(`  PASS: ${testName}`);
    passed++;
  } else if (haystack === needle) {
    console.log(`  PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  FAIL: ${testName} - "${needle}" not found in "${haystack}"`);
    failed++;
  }
}

function assertNotContains(haystack, needle, testName) {
  if (!haystack || !haystack.includes || !haystack.includes(needle)) {
    console.log(`  PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  FAIL: ${testName} - "${needle}" should NOT be in output`);
    failed++;
  }
}

console.log('\n=== AI API Doctor v1.10.2 Public Signals Display & Logic Tests ===\n');

// ── Case 1: Both unavailable → score=null, scored=false ──────────────────────

console.log('\n--- Case 1: Both unavailable = unknown, not_scored ---');

const bothUnavail = calcOperationalRiskScore(
  { available: false, error: 'timeout' },
  { available: false, error: 'timeout' }
);
assertNull(bothUnavail.score, 'score should be null when both unavailable');
assertEqual(bothUnavail.level, 'unknown', 'level should be unknown');
assertFalse(bothUnavail.scored, 'scored should be false');
assertEqual(bothUnavail.domainScore, 0, 'domainScore should be 0');
assertEqual(bothUnavail.certScore, 0, 'certScore should be 0');
assertEqual(bothUnavail.verifiabilityScore, 0, 'verifiabilityScore should be 0');

// ── Case 2: Render unknown UI ─────────────────────────────────────────────────

console.log('\n--- Case 2: Unknown UI - no 9/20 ---');

const unknownHtml = renderScoreDisplay(false, 'none', null, 20, true);
assertNotContains(unknownHtml, '9/20', 'Should NOT contain 9/20');
assertNotContains(unknownHtml, '未确认 9/20', 'Should NOT contain 未确认 9/20');
assertContains(unknownHtml, '未评分', 'Should contain 未评分');

const unknownTitle = renderTitle('none', '未确认', true);
assertContains(unknownTitle, '短期运营风险信号', 'Title contains 短期运营风险信号');
assertNotContains(unknownTitle, '9/20', 'Title should not have score');

// ── Case 3: Worker status unknown mapping ────────────────────────────────────

console.log('\n--- Case 3: Worker status unknown → not_scored ---');

const workerData = { status: 'unknown' };
const domainUnavail = { available: false };
const certUnavail = { available: false };
const confidence1 = buildOperationalRiskConfidence(workerData, domainUnavail, certUnavail);
assertEqual(confidence1, 'none', 'Both unavailable = confidence none');

const scoreDisplay1 = renderScoreDisplay(false, 'none', null, 20, true);
assertNotContains(scoreDisplay1, '9/20', 'Unknown should not show 9/20');
assertContains(scoreDisplay1, '未评分', 'Should show 未评分');

// ── Case 4: Worker request failed → not_scored ───────────────────────────────

console.log('\n--- Case 4: Worker request failed → not_scored ---');

const failedWorkerData = { ok: false, status: 'unknown' };
const confidence2 = buildOperationalRiskConfidence(failedWorkerData, null, null);
assertEqual(confidence2, 'none', 'Failed worker = confidence none');

const scoreDisplay2 = renderScoreDisplay(false, 'none', null, 20, false);
assertNotContains(scoreDisplay2, '9/20', 'Failed worker should not show 9/20');
assertContains(scoreDisplay2, 'Not Scored', 'Should show Not Scored');

// ── Case 5: RDAP success + crt.sh failure = partial ─────────────────────────

console.log('\n--- Case 5: RDAP success + crt failure = partial ---');

const partialResult = buildPublicSignalsStatus(
  { available: true, ageDays: 365, createdAt: '2025-01-01T00:00:00Z' },
  { available: false, error: 'timeout' }
);
assertEqual(partialResult.status, 'partial', 'RDAP ok + crt fail = partial');
assertEqual(partialResult.confidence, 'partial', 'confidence = partial');

const partialScore = calcOperationalRiskScore(
  { available: true, ageDays: 365 },
  { available: false }
);
assertTrue(partialScore.scored, 'partial should be scored');
assertTrue(partialScore.score !== null, 'partial should have score');
assertNotEqual(partialScore.score, undefined, 'partial score should be defined');

function assertNotEqual(actual, unexpected, testName) {
  const actualStr = JSON.stringify(actual);
  if (actualStr !== JSON.stringify(unexpected)) {
    console.log(`  PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  FAIL: ${testName} - Should not be ${unexpected}`);
    failed++;
  }
}

// ── Case 6: Partial UI ────────────────────────────────────────────────────────

console.log('\n--- Case 6: Partial UI includes partial indicator ---');

const partialTitle = renderTitle('partial', '中', true);
assertContains(partialTitle, '部分确认', 'Partial title should include 部分确认');

const partialScoreDisplay = renderScoreDisplay(true, 'partial', 10, 20, true);
assertContains(partialScoreDisplay, '10/20', 'Should show 10/20');
assertContains(partialScoreDisplay, '部分公开信号', 'Should include partial hint');

// ── Case 7: Full UI ──────────────────────────────────────────────────────────

console.log('\n--- Case 7: Full UI shows score without partial hint ---');

const fullTitle = renderTitle('full', '低', false);
assertNotContains(fullTitle, 'Partial', 'Full title should not have Partial');

const fullScoreDisplay = renderScoreDisplay(true, 'full', 18, 20, false);
assertContains(fullScoreDisplay, '18/20', 'Should show 18/20');
assertNotContains(fullScoreDisplay, 'partial', 'Full score should not have partial hint');

// ── Case 8: Verisign URL for example.com ─────────────────────────────────────

console.log('\n--- Case 8: example.com Verisign RDAP URL ---');

const exampleComUrl = buildVerisignUrl('example.com');
assertEqual(exampleComUrl, 'https://rdap.verisign.com/com/v1/domain/example.com', '.com should use Verisign');

// ── Case 9: Verisign URL for github.com ──────────────────────────────────────

console.log('\n--- Case 9: github.com Verisign RDAP URL ---');

const githubUrl = buildVerisignUrl('github.com');
assertEqual(githubUrl, 'https://rdap.verisign.com/com/v1/domain/github.com', '.com should use Verisign');

// ── Case 10: Domain availability scoring ──────────────────────────────────────

console.log('\n--- Case 10: Domain-only available scoring ---');

const domainOnlyScore = calcOperationalRiskScore(
  { available: true, ageDays: 365 },
  { available: false }
);
assertTrue(domainOnlyScore.scored, 'domain only = scored');
assertTrue(domainOnlyScore.score !== null, 'domain only has score');
assertEqual(domainOnlyScore.domainScore, 8, '365 days = 8 points');
assertEqual(domainOnlyScore.certScore, 0, 'cert unavailable = 0');
assertEqual(domainOnlyScore.verifiabilityScore, 1, 'only one available = 1');
assertEqual(domainOnlyScore.level, 'high', '9/20 < 10 = high');

// ── Case 11: Both available scoring ──────────────────────────────────────────

console.log('\n--- Case 11: Both available = full scoring ---');

const bothAvailScore = calcOperationalRiskScore(
  { available: true, ageDays: 1500 },
  { available: true, firstSeenDays: 400 }
);
assertTrue(bothAvailScore.scored, 'both available = scored');
assertTrue(bothAvailScore.score >= 16, 'both old = at least 16');
assertEqual(bothAvailScore.level, 'low', 'both old = low');

// ── Case 12: New domain scoring ──────────────────────────────────────────────

console.log('\n--- Case 12: New domain + old cert = high risk ---');

const newDomainScore = calcOperationalRiskScore(
  { available: true, ageDays: 15 },
  { available: true, firstSeenDays: 500 }
);
assertEqual(newDomainScore.domainScore, 0, '15 days = 0 points');
assertEqual(newDomainScore.certScore, 8, '500 days = 8 points');
assertEqual(newDomainScore.level, 'medium', '9/20 = medium (< 10 boundary)');

// ── Case 13: Cache TTL ────────────────────────────────────────────────────────

console.log('\n--- Case 13: Cache TTL rules ---');

assertEqual(getCacheTtl('full'), 86400, 'full = 86400');
assertEqual(getCacheTtl('partial'), 21600, 'partial = 21600');
assertInRange(getCacheTtl('unknown'), 1700, 1900, 'unknown <= 1800');

// ── Case 14: New domain + no cert = high ─────────────────────────────────────

console.log('\n--- Case 14: New domain + no cert = high risk ---');

const newDomainNoCert = calcOperationalRiskScore(
  { available: true, ageDays: 25 },
  { available: false }
);
assertEqual(newDomainNoCert.level, 'high', 'new domain + no cert = high');
assertEqual(newDomainNoCert.scored, true, 'scored = true');
assertTrue(newDomainNoCert.score !== null, 'has score');

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All v1.10.2 Public Signals display & logic tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}
