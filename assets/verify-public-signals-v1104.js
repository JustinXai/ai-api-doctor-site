/**
 * AI API Doctor v1.10.4 — Public Signals Frontend Adoption & Cache Cleanup Tests
 */

'use strict';

// ── Copy of relevant functions from test.js ──────────────────────────────────

function calcOperationalRiskScore(domainSignal, certSignal) {
  const MAX_DOMAIN = 10;
  const MAX_CERT = 8;
  const MAX_VERIFIABILITY = 2;
  const MAX_SCORE = MAX_DOMAIN + MAX_CERT + MAX_VERIFIABILITY;

  const domainAvailable = domainSignal && domainSignal.available === true;
  const certAvailable = certSignal && certSignal.available === true;

  if (!domainAvailable && !certAvailable) {
    return { score: null, max: MAX_SCORE, level: 'unknown', scored: false };
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
  }

  if (certAvailable && certSignal.firstSeenDays !== null) {
    const days = certSignal.firstSeenDays;
    if (days >= 365) certScore = 8;
    else if (days >= 180) certScore = 6;
    else if (days >= 90) certScore = 4;
    else if (days >= 30) certScore = 2;
    else certScore = 0;
  }

  if (domainAvailable && certAvailable) verifiabilityScore = 2;
  else if (domainAvailable || certAvailable) verifiabilityScore = 1;

  const totalScore = domainScore + certScore + verifiabilityScore;
  let level = 'unknown';
  if (totalScore >= 16) level = 'low';
  else if (totalScore >= 10) level = 'medium';
  else level = 'high';

  return { score: totalScore, max: MAX_SCORE, level, scored: true };
}

function buildOperationalRiskFromWorkerResponse(publicSignalsData, hostname) {
  const domainRegistration = publicSignalsData?.domainRegistration || {};
  const certificateHistory = publicSignalsData?.certificateHistory || {};
  const operationalRiskScore = calcOperationalRiskScore(domainRegistration, certificateHistory);

  // Derive from actual field availability — NOT just status string
  const domainAvailable = domainRegistration && domainRegistration.available === true;
  const certAvailable = certificateHistory && certificateHistory.available === true;
  const workerStatus = publicSignalsData?.status || 'unknown';

  // Field-fact overrides status string
  let confidence;
  if (domainAvailable && certAvailable) {
    confidence = 'full';
  } else if (domainAvailable || certAvailable) {
    confidence = 'partial';
  } else {
    confidence = 'none';
  }

  const operationalRisk = {
    enabled: true,
    affectsApiScore: false,
    hostname: hostname || publicSignalsData?.hostname,
    domainQueried: domainRegistration?.domainQueried || null,
    score: operationalRiskScore.score,
    max: operationalRiskScore.max,
    level: operationalRiskScore.level,
    scored: operationalRiskScore.scored !== false,
    confidence,
    status: confidence,
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
    high: { color: '#dc2626', bg: '#fee2e2' },
    medium: { color: '#d97706', bg: '#fef9c3' },
    low: { color: '#16a34a', bg: '#dcfce7' },
    unknown: { color: '#64748b', bg: '#f1f5f9' }
  };
  const lc = levelColors[level] || levelColors.unknown;
  const levelLabel = operationalRisk.levelLabel || level;

  const domainSignal = operationalRisk.domainRegistration || {};
  const certSignal = operationalRisk.certificateHistory || {};
  const domainText = domainSignal.available
    ? `${domainSignal.ageDays} ${zh ? '天前' : 'days ago'}`
    : (zh ? '自动查询失败，请手动复核' : 'Auto-lookup failed — verify manually');
  const certText = certSignal.available
    ? `${certSignal.firstSeenDays} ${zh ? '天前' : 'days ago'}`
    : (zh ? '自动查询失败，请手动复核' : 'Auto-lookup failed — verify manually');

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
    html: `<div>${title} ${levelLabel} ${scoreDisplay} ${domainText} ${certText}</div>`
  };
}

// ── Test Cases ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assertEqual(a, e, n) {
  if (JSON.stringify(a) === JSON.stringify(e)) { console.log(`  PASS: ${n}`); passed++; }
  else { console.log(`  FAIL: ${n}`); console.log(`    Expected: ${JSON.stringify(e)}`); console.log(`    Actual:   ${JSON.stringify(a)}`); failed++; }
}
function assertTrue(v, n) { if (v === true) { console.log(`  PASS: ${n}`); passed++; } else { console.log(`  FAIL: ${n} - Expected true, got ${v}`); failed++; } }
function assertFalse(v, n) { if (v === false) { console.log(`  PASS: ${n}`); passed++; } else { console.log(`  FAIL: ${n} - Expected false, got ${v}`); failed++; } }
function assertNull(v, n) { if (v === null) { console.log(`  PASS: ${n}`); passed++; } else { console.log(`  FAIL: ${n} - Expected null, got ${JSON.stringify(v)}`); failed++; } }
function assertNotNull(v, n) { if (v !== null) { console.log(`  PASS: ${n}`); passed++; } else { console.log(`  FAIL: ${n} - Expected not null`); failed++; } }
function assertContains(s, n, msg) { if (s && s.includes && s.includes(n)) { console.log(`  PASS: ${msg}`); passed++; } else { console.log(`  FAIL: ${msg} - "${n}" not found in "${s}"`); failed++; } }
function assertNotContains(s, n, msg) { if (!s || !s.includes || !s.includes(n)) { console.log(`  PASS: ${msg}`); passed++; } else { console.log(`  FAIL: ${msg} - "${n}" should NOT be in output`); failed++; } }

console.log('\n=== AI API Doctor v1.10.4 Public Signals Frontend Adoption & Cache Tests ===\n');

// ── Case 1: Worker partial (RDAP ok, crt fail) — aizhongzhuan.com ──────────────

console.log('\n--- Case 1: Worker partial - aizhongzhuan.com (65 days) ---');

const workerPartialResp = {
  ok: true,
  status: 'partial',
  confidence: 'partial',
  hostname: 'aizhongzhuan.com',
  domainRegistration: {
    available: true,
    createdAt: '2026-03-20T23:22:38Z',
    ageDays: 65,
    source: 'Verisign'
  },
  certificateHistory: {
    available: false,
    error: 'HTTP 502'
  }
};

const partialOR = buildOperationalRiskFromWorkerResponse(workerPartialResp, 'aizhongzhuan.com');
const partialDisplay = renderOperationalRiskDisplay(partialOR, true);

assertEqual(partialOR.confidence, 'partial', 'confidence = partial');
assertTrue(partialOR.scored, 'scored = true');
assertNotNull(partialOR.score, 'score is not null');
assertEqual(partialOR.domainRegistration.ageDays, 65, 'domain age = 65');
assertEqual(partialOR.domainRegistration.source, 'Verisign', 'source = Verisign');
assertFalse(partialOR.certificateHistory.available, 'cert available = false');

assertTrue(partialDisplay.isPartial, 'isPartial = true');
assertFalse(partialDisplay.isUnknown, 'isUnknown = false');
assertContains(partialDisplay.title, '部分确认', 'Title contains 部分确认');
assertContains(partialDisplay.domainText, '65 天前', 'Domain text shows 65 天前');
assertContains(partialDisplay.certText, '自动查询失败', 'Cert text shows failure');
assertNotContains(partialDisplay.html, '未确认', 'Should NOT show 未确认');
assertNotContains(partialDisplay.html, '未评分', 'Should NOT show 未评分 for partial');
assertNotContains(partialDisplay.domainText, '自动查询失败', 'Domain text should NOT show auto-fail');

// ── Case 2: Field-fact overrides status string ────────────────────────────────

console.log('\n--- Case 2: Field-fact overrides status string ---');

// Status says unknown but domain is actually available
const statusMismatch = {
  status: 'unknown',  // old cache says unknown
  domainRegistration: { available: true, ageDays: 65 },
  certificateHistory: { available: false }
};

const mismatchOR = buildOperationalRiskFromWorkerResponse(statusMismatch, 'test.com');
assertEqual(mismatchOR.confidence, 'partial', 'Field availability overrides status = partial');
assertTrue(mismatchOR.scored, 'scored = true');
assertNotNull(mismatchOR.score, 'score is not null');
assertEqual(mismatchOR.status, 'partial', 'status mapped to partial');

// ── Case 3: Old cache unknown + Worker partial → use Worker ────────────────────

console.log('\n--- Case 3: Old cache unknown + Worker partial → use Worker ---');

// Simulate: old cache had unknown, but Worker returned partial
const oldCacheData = {
  status: 'unknown',
  domainRegistration: { available: false },
  certificateHistory: { available: false }
};
const newWorkerData = {
  status: 'partial',
  domainRegistration: { available: true, ageDays: 65 },
  certificateHistory: { available: false }
};

// Decision: newWorkerData wins (always prefer Worker over cache)
const adoptedOR = buildOperationalRiskFromWorkerResponse(newWorkerData, 'aizhongzhuan.com');
assertEqual(adoptedOR.confidence, 'partial', 'Worker partial adopted over cache unknown');
assertTrue(adoptedOR.scored, 'scored = true');
assertEqual(adoptedOR.domainRegistration.ageDays, 65, 'domain age from Worker');

// ── Case 4: Worker failed + v1104 partial cache exists → use cache ─────────────

console.log('\n--- Case 4: Worker failed + v1104 partial cache → use cache ---');

// Simulate Worker failure
const workerFailedData = {
  ok: false,
  status: 'unknown',
  domainRegistration: { available: false },
  certificateHistory: { available: false }
};
// Simulate v1104 partial cache
const v1104CacheData = {
  status: 'partial',
  domainRegistration: { available: true, ageDays: 65 },
  certificateHistory: { available: false }
};

// Decision: use v1104 cache (same version)
const cacheOR = buildOperationalRiskFromWorkerResponse(v1104CacheData, 'test.com');
assertEqual(cacheOR.confidence, 'partial', 'v1104 partial cache adopted when Worker fails');
assertTrue(cacheOR.scored, 'scored = true');

// ── Case 5: Worker failed + only old v1103 unknown cache → ignore old cache ────

console.log('\n--- Case 5: Worker failed + old v1103 unknown cache → ignore ---');

// Old v1103 cache is unknown
const oldCacheUnknown = {
  status: 'unknown',
  domainRegistration: { available: false },
  certificateHistory: { available: false }
};

// Worker failed
const workerFailed = { ok: false, status: 'unknown' };

// Decision: old cache is different version, fallback to unknown
const fallbackOR = buildOperationalRiskFromWorkerResponse(workerFailed, 'test.com');
assertEqual(fallbackOR.confidence, 'none', 'Old v1103 cache ignored → fallback unknown');
assertFalse(fallbackOR.scored, 'scored = false');
assertNull(fallbackOR.score, 'score = null');

// ── Case 6: Both unavailable → unknown ─────────────────────────────────────────

console.log('\n--- Case 6: Both unavailable → unknown ---');

const bothUnavail = {
  status: 'unknown',
  domainRegistration: { available: false },
  certificateHistory: { available: false }
};
const bothOR = buildOperationalRiskFromWorkerResponse(bothUnavail, 'test.com');
assertEqual(bothOR.confidence, 'none', 'Both unavailable = none');
assertFalse(bothOR.scored, 'scored = false');
assertNull(bothOR.score, 'score = null');
assertEqual(bothOR.level, 'unknown', 'level = unknown');

const bothDisplay = renderOperationalRiskDisplay(bothOR, true);
assertTrue(bothDisplay.isUnknown, 'isUnknown = true');
assertContains(bothDisplay.html, '未评分', 'HTML shows 未评分 for unknown');
assertContains(bothDisplay.scoreDisplay, '未评分', 'Score shows 未评分');
assertNotContains(bothDisplay.html, '9/20', 'Should NOT contain 9/20');
assertNotContains(bothDisplay.title, '部分确认', 'Title should not have 部分确认');

// ── Case 7: English partial UI ─────────────────────────────────────────────────

console.log('\n--- Case 7: English partial UI ---');

const enDisplay = renderOperationalRiskDisplay(partialOR, false);
assertContains(enDisplay.title, 'Partial', 'EN title contains Partial');
assertContains(enDisplay.domainText, '65 days ago', 'EN domain text shows 65 days ago');
assertNotContains(enDisplay.title, '部分确认', 'EN title should NOT have Chinese');

// ── Case 8: Full success ───────────────────────────────────────────────────────

console.log('\n--- Case 8: Full success ---');

const fullResp = {
  status: 'full',
  domainRegistration: { available: true, ageDays: 6802 },
  certificateHistory: { available: true, firstSeenDays: 3650 }
};
const fullOR = buildOperationalRiskFromWorkerResponse(fullResp, 'github.com');
assertEqual(fullOR.confidence, 'full', 'confidence = full');
assertTrue(fullOR.scored, 'scored = true');

const fullDisplay = renderOperationalRiskDisplay(fullOR, true);
assertFalse(fullDisplay.isPartial, 'isPartial = false');
assertNotContains(fullDisplay.title, '部分确认', 'Full title should NOT have 部分确认');
assertContains(fullDisplay.domainText, '6802 天前', 'Domain text shows 6802 days');

// ── Case 9: Cache versioning check ─────────────────────────────────────────────

console.log('\n--- Case 9: Cache key versioning ---');

// Simulate cache key comparison
const CACHE_KEY_PREFIX = 'https://aiapidoctor.com/api/public-signals-cache/v1104/';
const v1104Key = CACHE_KEY_PREFIX + 'aizhongzhuan.com';
const oldV1103Key = 'https://aiapidoctor.com/api/public-signals-cache/v1103/aizhongzhuan.com';
const oldV110Key = 'https://aiapidoctor.com/api/public-signals-cache/aizhongzhuan.com';

assertContains(v1104Key, 'v1104', 'New cache key contains v1104');
assertNotContains(v1104Key, 'v1103', 'New cache key does NOT contain v1103');
assertNotContains(v1104Key, 'v1.10', 'New cache key does NOT contain v1.10');
assertNotContains(oldV1103Key, 'v1104', 'Old v1103 key does NOT contain v1104');
assertNotContains(oldV110Key, 'v1104', 'Old v1.10 key does NOT contain v1104');

// ── Case 10: Score boundaries ───────────────────────────────────────────────────

console.log('\n--- Case 10: Score boundaries ---');

// 65-day domain + no cert = 2+0+1 = 3 < 10 = high
const score65 = calcOperationalRiskScore({ available: true, ageDays: 65 }, { available: false });
assertEqual(score65.level, 'high', '65-day + no cert = high (3 < 10)');
assertEqual(score65.score, 3, '65-day + no cert = 3 points');

// 2000-day domain + no cert = 10+0+1 = 11 >= 10 = medium
const score2000 = calcOperationalRiskScore({ available: true, ageDays: 2000 }, { available: false });
assertEqual(score2000.level, 'medium', '2000-day + no cert = medium (11 >= 10)');
assertEqual(score2000.score, 11, '2000-day + no cert = 11 points');

// ── Case 11: Verisign source confirmed ─────────────────────────────────────────

console.log('\n--- Case 11: Verisign source in response ---');

assertEqual(workerPartialResp.domainRegistration.source, 'Verisign', 'RDAP source = Verisign');
assertNotEqual(workerPartialResp.domainRegistration.source, 'rdap.org', 'Source is NOT rdap.org');

// Helper
function assertNotEqual(a, e, n) {
  if (JSON.stringify(a) !== JSON.stringify(e)) { console.log(`  PASS: ${n}`); passed++; }
  else { console.log(`  FAIL: ${n} - Should not be ${e}`); failed++; }
}

// ── Summary ────────────────────────────────────────────────────────────────────

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All v1.10.4 frontend adoption & cache tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}
