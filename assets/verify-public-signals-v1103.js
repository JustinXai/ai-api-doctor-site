/**
 * AI API Doctor v1.10.3 — Public Signals Frontend Mapping Tests
 * Tests that Worker response is correctly mapped to operationalRisk display
 */

'use strict';

// ── Copy of relevant functions from test.js ──────────────────────────────────

function calcOperationalRiskScore(domainSignal, certSignal) {
  const MAX_DOMAIN = 10;
  const MAX_CERT = 8;
  const MAX_VERIFIABILITY = 2;
  const MAX_SCORE = MAX_DOMAIN + MAX_CERT + MAX_VERIFIABILITY; // 20

  const domainAvailable = domainSignal && domainSignal.available === true;
  const certAvailable = certSignal && certSignal.available === true;

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

  if (domainAvailable && certAvailable) {
    verifiabilityScore = 2;
  } else if (domainAvailable || certAvailable) {
    verifiabilityScore = 1;
  }

  const totalScore = domainScore + certScore + verifiabilityScore;

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

function buildOperationalRiskFromWorkerResponse(publicSignalsData) {
  const { domainRegistration, certificateHistory } = publicSignalsData;
  const operationalRiskScore = calcOperationalRiskScore(domainRegistration, certificateHistory);

  const workerStatus = publicSignalsData.status || 'unknown';
  const domainAvailable = domainRegistration && domainRegistration.available === true;
  const certAvailable = certificateHistory && certificateHistory.available === true;
  const confidence = workerStatus === 'full' ? 'full'
    : (workerStatus === 'partial' || domainAvailable || certAvailable) ? 'partial'
    : 'none';

  const operationalRisk = {
    enabled: true,
    affectsApiScore: false,
    hostname: publicSignalsData.hostname,
    domainQueried: domainRegistration && domainRegistration.domainQueried ? domainRegistration.domainQueried : null,
    score: operationalRiskScore.score,
    max: operationalRiskScore.max,
    level: operationalRiskScore.level,
    scored: operationalRiskScore.scored !== false,
    confidence,
    status: workerStatus,
    domainRegistration,
    certificateHistory,
    summary: '',
    recommendation: ''
  };

  return operationalRisk;
}

function renderOperationalRiskDisplay(operationalRisk, zh) {
  const level = operationalRisk.level || 'unknown';
  const levelColors = {
    high: { color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
    medium: { color: '#d97706', bg: '#fef9c3', border: '#fde68a' },
    low: { color: '#16a34a', bg: '#dcfce7', border: '#bbf7d0' },
    unknown: { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' }
  };
  const lc = levelColors[level] || levelColors.unknown;
  const levelLabel = operationalRisk.levelLabel || level;

  const domainSignal = operationalRisk.domainRegistration || {};
  const certSignal = operationalRisk.certificateHistory || {};
  const domainText = domainSignal.available
    ? `${domainSignal.ageDays} ${zh ? '天前' : 'days ago'}`
    : (zh ? '自动查询失败，请手动复核' : 'Auto-lookup failed — please verify manually');
  const certText = certSignal.available
    ? `${certSignal.firstSeenDays} ${zh ? '天前' : 'days ago'}`
    : (zh ? '自动查询失败，请手动复核' : 'Auto-lookup failed — please verify manually');

  const scored = operationalRisk.scored !== false;
  const confidence = operationalRisk.confidence || 'none';
  const isPartial = confidence === 'partial';
  const isUnknown = !scored || confidence === 'none';

  let scoreDisplay = '';
  if (isUnknown) {
    scoreDisplay = `<span style="font-weight:700;color:#94a3b8">${zh ? '未评分' : 'Not Scored'}</span>`;
  } else {
    const suffix = isPartial ? `<span style="font-size:9px;color:#d97706"> ${zh ? '（仅基于部分公开信号）' : '(partial)'}</span>` : '';
    scoreDisplay = `<span style="font-weight:700">${operationalRisk.score}/${operationalRisk.max}</span>${suffix}`;
  }

  const titleSuffix = isPartial ? (zh ? '（部分确认）' : ' (Partial)') : '';
  const title = `${zh ? '短期运营风险信号' : 'Short-term Operational Risk Signals'}${titleSuffix}`;

  return {
    title,
    levelLabel,
    scoreDisplay,
    domainText,
    certText,
    domainAgeDays: domainSignal.ageDays,
    scored,
    confidence,
    isPartial,
    isUnknown,
    html: `
      <div>
        <div>${title}</div>
        <div>${levelLabel}</div>
        <div>${scoreDisplay}</div>
        <div>${domainText}</div>
        <div>${certText}</div>
      </div>
    `
  };
}

function escH(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Test Cases ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, testName) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { console.log(`  PASS: ${testName}`); passed++; }
  else { console.log(`  FAIL: ${testName}`); console.log(`    Expected: ${e}`); console.log(`    Actual:   ${a}`); failed++; }
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

function assertNotNull(value, testName) {
  if (value !== null) { console.log(`  PASS: ${testName}`); passed++; }
  else { console.log(`  FAIL: ${testName} - Expected not null`); failed++; }
}

function assertContains(haystack, needle, testName) {
  if (haystack && haystack.includes && haystack.includes(needle)) { console.log(`  PASS: ${testName}`); passed++; }
  else { console.log(`  FAIL: ${testName} - "${needle}" not found in output`); failed++; }
}

function assertNotContains(haystack, needle, testName) {
  if (!haystack || !haystack.includes || !haystack.includes(needle)) { console.log(`  PASS: ${testName}`); passed++; }
  else { console.log(`  FAIL: ${testName} - "${needle}" should NOT be in output`); failed++; }
}

console.log('\n=== AI API Doctor v1.10.3 Public Signals Frontend Mapping Tests ===\n');

// ── Case 1: Worker partial (RDAP success + crt failure) ───────────────────────

console.log('\n--- Case 1: Worker partial - github.com (RDAP ok, crt fail) ---');

const partialWorkerResp = {
  ok: true,
  status: 'partial',
  confidence: 'partial',
  hostname: 'github.com',
  domainRegistration: {
    available: true,
    domainQueried: 'github.com',
    createdAt: '2007-10-09T18:20:50Z',
    ageDays: 6802,
    source: 'Verisign',
    lookupUrl: 'https://lookup.icann.org/en/lookup?name=github.com',
    rdapUrl: 'https://rdap.org/domain/github.com'
  },
  certificateHistory: {
    available: false,
    error: 'timeout',
    lookupUrl: 'https://crt.sh/?q=github.com'
  },
  errors: [{ source: 'crt.sh', message: 'timeout' }]
};

const partialOR = buildOperationalRiskFromWorkerResponse(partialWorkerResp);
const partialDisplay = renderOperationalRiskDisplay(partialOR, true);

assertEqual(partialOR.status, 'partial', 'status should be partial');
assertEqual(partialOR.confidence, 'partial', 'confidence should be partial');
assertTrue(partialOR.scored, 'scored should be true');
assertNotNull(partialOR.score, 'score should not be null');
assertEqual(partialOR.level, 'medium', '6802-day + no cert = 11/20 = medium');
assertEqual(partialOR.domainRegistration.available, true, 'domain available = true');
assertEqual(partialOR.domainRegistration.ageDays, 6802, 'domain age = 6802');
assertEqual(partialOR.certificateHistory.available, false, 'cert available = false');

assertTrue(partialDisplay.isPartial, 'isPartial should be true');
assertFalse(partialDisplay.isUnknown, 'isUnknown should be false');
assertContains(partialDisplay.title, '部分确认', 'Title should include 部分确认');
assertEqual(partialOR.level, 'medium', '6802-day + no cert = 11/20 = medium (not low)');
assertContains(partialDisplay.scoreDisplay, '11/20', 'Score display should show 11/20');
assertContains(partialDisplay.domainText, '6802 天前', 'Domain text shows 6802 天前');
assertContains(partialDisplay.certText, '自动查询失败', 'Cert text should show failure');
assertNotContains(partialDisplay.html, '9/20', 'Should NOT contain 9/20');
assertNotContains(partialDisplay.html, '未评分', 'Should NOT show 未评分 for partial');

// ── Case 2: Worker partial - aizhongzhuan.com (65 days) ──────────────────────

console.log('\n--- Case 2: Worker partial - aizhongzhuan.com (65 days) ---');

const partialAzzResp = {
  ok: true,
  status: 'partial',
  confidence: 'partial',
  hostname: 'aizhongzhuan.com',
  domainRegistration: {
    available: true,
    domainQueried: 'aizhongzhuan.com',
    createdAt: '2026-03-20T23:22:38Z',
    ageDays: 65,
    source: 'Verisign'
  },
  certificateHistory: {
    available: false,
    error: 'HTTP 502'
  }
};

const partialAzzOR = buildOperationalRiskFromWorkerResponse(partialAzzResp);
const partialAzzDisplay = renderOperationalRiskDisplay(partialAzzOR, true);

assertEqual(partialAzzOR.status, 'partial', 'status = partial');
assertEqual(partialAzzOR.confidence, 'partial', 'confidence = partial');
assertTrue(partialAzzOR.scored, 'scored = true');
assertEqual(partialAzzOR.domainRegistration.ageDays, 65, 'domain age = 65');
assertEqual(partialAzzOR.level, 'high', '65-day + no cert = 2+0+1=3 < 10 = high');
assertContains(partialAzzDisplay.title, '部分确认', 'Title includes 部分确认');
assertContains(partialAzzDisplay.domainText, '65 天前', 'Domain text shows 65 天前');
assertNotContains(partialAzzDisplay.html, '域名注册时间：自动查询失败', 'Should NOT show domain auto-lookup failed');
assertNotContains(partialAzzDisplay.html, '未评分', 'Should NOT show 未评分');

// ── Case 3: Worker unknown (both fail) ────────────────────────────────────────

console.log('\n--- Case 3: Worker unknown - both unavailable ---');

const unknownWorkerResp = {
  ok: true,
  status: 'unknown',
  confidence: 'none',
  hostname: 'newsite.xyz',
  domainRegistration: { available: false, error: 'HTTP 403' },
  certificateHistory: { available: false, error: 'HTTP 502' }
};

const unknownOR = buildOperationalRiskFromWorkerResponse(unknownWorkerResp);
const unknownDisplay = renderOperationalRiskDisplay(unknownOR, true);

assertEqual(unknownOR.status, 'unknown', 'status = unknown');
assertEqual(unknownOR.confidence, 'none', 'confidence = none');
assertFalse(unknownOR.scored, 'scored = false');
assertNull(unknownOR.score, 'score = null');
assertEqual(unknownOR.level, 'unknown', 'level = unknown');
assertTrue(unknownDisplay.isUnknown, 'isUnknown = true');
assertFalse(unknownDisplay.isPartial, 'isPartial = false');
assertNotContains(unknownDisplay.title, '部分确认', 'Title should NOT include 部分确认');
assertContains(unknownDisplay.scoreDisplay, '未评分', 'Score display should show 未评分');
assertNotContains(unknownDisplay.html, '9/20', 'Should NOT contain 9/20');
assertContains(unknownDisplay.domainText, '自动查询失败', 'Domain text should show failure');
assertContains(unknownDisplay.certText, '自动查询失败', 'Cert text should show failure');

// ── Case 4: Worker full (both succeed) ─────────────────────────────────────

console.log('\n--- Case 4: Worker full - both succeed ---');

const fullWorkerResp = {
  ok: true,
  status: 'full',
  confidence: 'full',
  hostname: 'github.com',
  domainRegistration: {
    available: true,
    ageDays: 6802,
    createdAt: '2007-10-09T18:20:50Z'
  },
  certificateHistory: {
    available: true,
    firstSeenDays: 3650,
    firstSeenAt: '2019-05-01T00:00:00Z'
  }
};

const fullOR = buildOperationalRiskFromWorkerResponse(fullWorkerResp);
const fullDisplay = renderOperationalRiskDisplay(fullOR, true);

assertEqual(fullOR.status, 'full', 'status = full');
assertEqual(fullOR.confidence, 'full', 'confidence = full');
assertTrue(fullOR.scored, 'scored = true');
assertNotNull(fullOR.score, 'score not null');
assertEqual(fullOR.level, 'low', 'both old = low');
assertFalse(fullDisplay.isPartial, 'isPartial = false');
assertFalse(fullDisplay.isUnknown, 'isUnknown = false');
assertNotContains(fullDisplay.title, '部分确认', 'Title should NOT include 部分确认');
assertEqual(fullOR.level, 'low', '10+8+2=20 >= 16 = low');
assertContains(fullDisplay.scoreDisplay, '20/20', 'Score display should show 20/20 for full');
assertContains(fullDisplay.domainText, '6802 天前', 'Domain text shows 6802 days');
assertContains(fullDisplay.certText, '3650 天前', 'Cert text shows 3650 days');

// ── Case 5: Worker request failed ────────────────────────────────────────────

console.log('\n--- Case 5: Worker request failed ---');

const failedWorkerResp = {
  ok: false,
  status: 'unknown',
  domainRegistration: { available: false, error: 'Worker timeout' },
  certificateHistory: { available: false, error: 'Worker timeout' }
};

const failedOR = buildOperationalRiskFromWorkerResponse(failedWorkerResp);
const failedDisplay = renderOperationalRiskDisplay(failedOR, true);

assertEqual(failedOR.confidence, 'none', 'failed worker = confidence none');
assertFalse(failedOR.scored, 'scored = false');
assertNull(failedOR.score, 'score = null');
assertTrue(failedDisplay.isUnknown, 'isUnknown = true');
assertContains(failedDisplay.scoreDisplay, '未评分', 'Shows 未评分');

// ── Case 6: English UI for partial ────────────────────────────────────────────

console.log('\n--- Case 6: English UI for partial ---');

const enDisplay = renderOperationalRiskDisplay(partialOR, false);

assertContains(enDisplay.title, 'Partial', 'EN title includes Partial');
assertContains(enDisplay.scoreDisplay, '(partial)', 'EN score display includes (partial)');
assertNotContains(enDisplay.title, '部分确认', 'EN title should NOT have Chinese');
assertNotContains(enDisplay.scoreDisplay, '（仅基于部分公开信号）', 'EN should not have Chinese suffix');

// ── Case 7: Scoring for partial domains ──────────────────────────────────────

console.log('\n--- Case 7: Partial scoring boundary tests ---');

// New domain (30 days) + no cert = high
const newDomainPartial = calcOperationalRiskScore(
  { available: true, ageDays: 30 },
  { available: false }
);
assertEqual(newDomainPartial.level, 'high', '30-day domain + no cert = high');
assertEqual(newDomainPartial.score, 3, '2 (domain) + 0 (cert) + 1 (verif) = 3');

// Old domain (400 days) + no cert = high
const oldDomainPartial = calcOperationalRiskScore(
  { available: true, ageDays: 400 },
  { available: false }
);
assertEqual(oldDomainPartial.level, 'high', '8+0+1=9 < 10 = high');

// Very old domain (1500 days) + no cert = medium (10+0+1=11)
const veryOldPartial = calcOperationalRiskScore(
  { available: true, ageDays: 1500 },
  { available: false }
);
assertEqual(veryOldPartial.level, 'medium', '10+0+1=11 >= 10 = medium');

// ── Case 8: Score boundaries ─────────────────────────────────────────────────

console.log('\n--- Case 8: Score boundaries ---');

// 365 days = 8, cert 365 = 8, both = 2
const oldBoth = calcOperationalRiskScore(
  { available: true, ageDays: 365 },
  { available: true, firstSeenDays: 365 }
);
assertEqual(oldBoth.score, 18, '365+365+both = 18');
assertEqual(oldBoth.level, 'low', '18 >= 16 = low');

// 90 days = 4, cert 90 = 4, both = 2
const midBoth = calcOperationalRiskScore(
  { available: true, ageDays: 90 },
  { available: true, firstSeenDays: 90 }
);
assertEqual(midBoth.score, 10, '4+4+2 = 10');
assertEqual(midBoth.level, 'medium', '10 >= 10 = medium');

// 30 days = 2, cert 30 = 2, both = 2
const newBoth = calcOperationalRiskScore(
  { available: true, ageDays: 30 },
  { available: true, firstSeenDays: 30 }
);
assertEqual(newBoth.score, 6, '2+2+2 = 6');
assertEqual(newBoth.level, 'high', '6 < 10 = high');

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All v1.10.3 frontend mapping tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}
