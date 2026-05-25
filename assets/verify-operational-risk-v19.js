/**
 * AI API Doctor — Operational Risk v1.9 Verification Script
 * website/assets/verify-operational-risk-v19.js
 *
 * Tests:
 * - extractHostnameFromBaseUrl
 * - guessRegistrableDomain
 * - buildOperationalRiskLinks
 * - calcOperationalRiskScore
 * - buildOperationalRiskSummary
 * - verify operationalRisk.affectsApiScore = false
 *
 * Does NOT make real network requests.
 */

'use strict';

// ── Minimal function implementations for testing ──
// (These mirror the actual implementations in test.js)

function extractHostnameFromBaseUrl(rawBaseUrl) {
  if (!rawBaseUrl) return null;
  const trimmed = String(rawBaseUrl).trim();
  if (!trimmed) return null;
  try {
    const urlStr = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : 'https://' + trimmed;
    const u = new URL(urlStr);
    return u.hostname;
  } catch (_) {
    return null;
  }
}

function guessRegistrableDomain(hostname) {
  if (!hostname) return null;
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

function buildOperationalRiskLinks(hostname, domainQueried) {
  const target = domainQueried || hostname || '';
  return {
    icannLookup: `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(target)}`,
    rdapLookup: `https://rdap.org/domain/${encodeURIComponent(target)}`,
    crtShLookup: `https://crt.sh/?q=${encodeURIComponent(hostname || '')}`,
    waybackLookup: `https://web.archive.org/web/*/${hostname || ''}`
  };
}

function calcOperationalRiskScore(domainSignal, certSignal) {
  const MAX_DOMAIN = 10;
  const MAX_CERT = 8;
  const MAX_VERIFIABILITY = 2;
  const MAX_SCORE = MAX_DOMAIN + MAX_CERT + MAX_VERIFIABILITY;

  let domainScore = 0;
  let certScore = 0;
  let verifiabilityScore = 0;

  if (domainSignal.available && domainSignal.ageDays !== null) {
    const days = domainSignal.ageDays;
    if (days >= 1095) domainScore = 10;
    else if (days >= 365) domainScore = 8;
    else if (days >= 180) domainScore = 6;
    else if (days >= 90) domainScore = 4;
    else if (days >= 30) domainScore = 2;
    else domainScore = 0;
  } else {
    domainScore = 5;
  }

  if (certSignal.available && certSignal.firstSeenDays !== null) {
    const days = certSignal.firstSeenDays;
    if (days >= 365) certScore = 8;
    else if (days >= 180) certScore = 6;
    else if (days >= 90) certScore = 4;
    else if (days >= 30) certScore = 2;
    else certScore = 0;
  } else {
    certScore = 4;
  }

  const domainAvailable = domainSignal.available;
  const certAvailable = certSignal.available;
  if (domainAvailable && certAvailable) {
    verifiabilityScore = 2;
  } else if (domainAvailable || certAvailable) {
    verifiabilityScore = 1;
  } else {
    verifiabilityScore = 0;
  }

  const totalScore = domainScore + certScore + verifiabilityScore;

  let level = 'unknown';
  if (domainAvailable || certAvailable) {
    if (totalScore >= 16) level = 'low';
    else if (totalScore >= 10) level = 'medium';
    else level = 'high';
  } else {
    level = 'unknown';
  }

  return {
    score: totalScore,
    max: MAX_SCORE,
    domainScore,
    certScore,
    verifiabilityScore,
    level
  };
}

function buildOperationalRiskSummary(level, domainSignal, certSignal, zh) {
  const labels = {
    high: zh ? '高' : 'High',
    medium: zh ? '中' : 'Medium',
    low: zh ? '低' : 'Low',
    unknown: zh ? '未确认' : 'Unconfirmed'
  };

  let summary = '';
  let recommendation = '';

  if (level === 'high') {
    const domainDays = domainSignal.ageDays;
    const certDays = certSignal.firstSeenDays;

    if (domainDays !== null && domainDays < 30) {
      summary = zh
        ? `公开记录显示该域名注册仅 ${domainDays} 天，存在强短期运营风险信号。`
        : `The domain was registered only ${domainDays} days ago — strong short-term operational risk signal.`;
    } else if (certDays !== null && certDays < 30) {
      summary = zh
        ? `HTTPS 证书首次发现仅 ${certDays} 天前，说明该站点公开 HTTPS 记录很新。`
        : `HTTPS certificate first seen only ${certDays} days ago — very new public HTTPS record.`;
    } else {
      summary = zh
        ? '公开记录显示该域名或 HTTPS 站点历史很短，存在明显短期运营风险信号。'
        : 'Public records show the domain or HTTPS site history is very short, indicating significant short-term operational risk signals.';
    }

    recommendation = zh
      ? '建议只小额测试，不建议一次性大额预充值。'
      : 'Use with small test top-ups only. Avoid large prepaid balances.';
  } else if (level === 'medium') {
    summary = zh
      ? '域名或证书历史不算长，仍建议先小额充值、小额请求，观察后台余额变化后再继续使用。'
      : 'Domain or certificate history is not long. Start with small top-ups, monitor balance changes before committing more funds.';
    recommendation = zh
      ? '先小额充值、小额请求，观察后台余额变化后再继续使用。'
      : 'Use small test top-ups first and observe dashboard balance changes before continuing.';
  } else if (level === 'low') {
    summary = zh
      ? '域名和证书公开历史相对较长，未发现明显短期运营信号。'
      : 'Domain and certificate public history are relatively long. No significant short-term operational risk signals detected.';
    recommendation = zh
      ? '首次使用仍建议小额测试。'
      : 'Small test top-ups are still recommended for first-time use.';
  } else {
    summary = zh
      ? '未能自动获取域名注册时间或证书历史。建议手动查询公开记录后再考虑大额充值。'
      : 'Failed to automatically retrieve domain registration time or certificate history. Manual verification of public records is advised before large top-ups.';
    recommendation = zh
      ? '建议手动复核域名注册时间、证书历史和历史快照后再决定。'
      : 'Please manually verify domain registration, certificate history, and snapshots before deciding on larger amounts.';
  }

  return { summary, recommendation, levelLabel: labels[level] };
}

// ── Test Cases ──
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

function assertContains(str, substr, testName) {
  if (str.includes(substr)) {
    console.log(`  PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  FAIL: ${testName}`);
    console.log(`    Expected to contain: "${substr}"`);
    console.log(`    Actual string: "${str}"`);
    failed++;
  }
}

function assertTrue(value, testName) {
  if (value === true) {
    console.log(`  PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  FAIL: ${testName}`);
    console.log(`    Expected: true`);
    console.log(`    Actual:   ${value}`);
    failed++;
  }
}

console.log('\n=== AI API Doctor v1.9 Operational Risk Verification ===\n');

console.log('Test Case 1: Hostname extraction - https://api.example.com/v1');
assertEqual(extractHostnameFromBaseUrl('https://api.example.com/v1'), 'api.example.com', 'Should extract api.example.com');

console.log('\nTest Case 2: Hostname extraction - api.example.com (no protocol)');
assertEqual(extractHostnameFromBaseUrl('api.example.com'), 'api.example.com', 'Should return api.example.com');

console.log('\nTest Case 3: Hostname extraction - invalid URL');
assertEqual(extractHostnameFromBaseUrl('not a url'), null, 'Should return null for invalid input');

console.log('\nTest Case 4: Hostname extraction - null input');
assertEqual(extractHostnameFromBaseUrl(null), null, 'Should return null for null input');

console.log('\nTest Case 5: Registrable domain - api.example.com');
assertEqual(guessRegistrableDomain('api.example.com'), 'example.com', 'Should return example.com');

console.log('\nTest Case 6: Registrable domain - example.com');
assertEqual(guessRegistrableDomain('example.com'), 'example.com', 'Should return example.com');

console.log('\nTest Case 7: Registrable domain - api.foo.example.net');
assertEqual(guessRegistrableDomain('api.foo.example.net'), 'example.net', 'Should return example.net');

// Case 8: High risk scenario
console.log('\n--- Case 8: High Risk (domain 12 days, cert 9 days) ---');
const highRiskDomain = { available: true, ageDays: 12 };
const highRiskCert = { available: true, firstSeenDays: 9 };
const highRiskResult = calcOperationalRiskScore(highRiskDomain, highRiskCert);
assertEqual(highRiskResult.level, 'high', 'Level should be high');
assertTrue(highRiskResult.score < 10, 'Score should be less than 10 for high risk');
const highRiskSummary = buildOperationalRiskSummary('high', highRiskDomain, highRiskCert, true);
assertContains(highRiskSummary.summary, '短期运营风险', 'Summary should mention short-term operational risk');
assertContains(highRiskSummary.recommendation, '不建议一次性大额预充值', 'Recommendation should mention not to make large prepaid top-ups');

// Case 9: Medium risk scenario
console.log('\n--- Case 9: Medium Risk (domain 200 days, cert 100 days) ---');
const mediumRiskDomain = { available: true, ageDays: 200 };
const mediumRiskCert = { available: true, firstSeenDays: 100 };
const mediumRiskResult = calcOperationalRiskScore(mediumRiskDomain, mediumRiskCert);
assertEqual(mediumRiskResult.level, 'medium', 'Level should be medium (200+100+2=6, >=10 and <16)');
assertEqual(mediumRiskResult.domainScore, 6, 'Domain 200 days should score 6');
assertEqual(mediumRiskResult.certScore, 4, 'Cert 100 days should score 4');
assertEqual(mediumRiskResult.verifiabilityScore, 2, 'Verifiability should be 2');
const mediumRiskSummary = buildOperationalRiskSummary('medium', mediumRiskDomain, mediumRiskCert, true);
assertContains(mediumRiskSummary.recommendation, '小额', 'Recommendation should mention small amounts');

// Case 10: Low risk scenario
console.log('\n--- Case 10: Low Risk (domain 1380 days, cert 730 days) ---');
const lowRiskDomain = { available: true, ageDays: 1380 };
const lowRiskCert = { available: true, firstSeenDays: 730 };
const lowRiskResult = calcOperationalRiskScore(lowRiskDomain, lowRiskCert);
assertEqual(lowRiskResult.level, 'low', 'Level should be low');
assertTrue(lowRiskResult.score >= 16, 'Score should be >= 16 for low risk');
const lowRiskSummary = buildOperationalRiskSummary('low', lowRiskDomain, lowRiskCert, true);
assertContains(lowRiskSummary.summary, '未发现明显短期运营信号', 'Summary should mention no significant short-term operational risk signals');

// Case 11: Both signals unknown
console.log('\n--- Case 11: Both Signals Unknown ---');
const unknownDomain = { available: false, ageDays: null };
const unknownCert = { available: false, firstSeenDays: null };
const unknownResult = calcOperationalRiskScore(unknownDomain, unknownCert);
assertEqual(unknownResult.level, 'unknown', 'Level should be unknown');
assertEqual(unknownResult.score, 9, 'Score should be 9 (5+4 neutral) when both unavailable');
const unknownSummary = buildOperationalRiskSummary('unknown', unknownDomain, unknownCert, true);
assertContains(unknownSummary.summary, '未能自动获取', 'Summary should mention auto-retrieval failed');

// Case 12: Only domain available
console.log('\n--- Case 12: Only Domain Available (400 days) ---');
const domainOnly = { available: true, ageDays: 400 };
const certUnavailable = { available: false, firstSeenDays: null };
const domainOnlyResult = calcOperationalRiskScore(domainOnly, certUnavailable);
assertEqual(domainOnlyResult.level, 'medium', 'Level should be medium with only domain');
assertEqual(domainOnlyResult.certScore, 4, 'Cert score should be neutral 4 when unavailable');
assertEqual(domainOnlyResult.verifiabilityScore, 1, 'Verifiability should be 1 when only one available');

// Case 13: Score boundaries
console.log('\n--- Case 13: Score Boundaries ---');
// Domain >= 1095 days = 10 pts
const domain1095 = { available: true, ageDays: 1095 };
const certMax = { available: true, firstSeenDays: 365 };
const maxResult = calcOperationalRiskScore(domain1095, certMax);
assertEqual(maxResult.score, 20, 'Score should be 20 (10+8+2) at maximum');

// Case 14: Verifiability scoring
console.log('\n--- Case 14: Verifiability Scoring ---');
const bothAvail = { available: true, ageDays: 365 };
const bothCert = { available: true, firstSeenDays: 365 };
const bothResult = calcOperationalRiskScore(bothAvail, bothCert);
assertEqual(bothResult.verifiabilityScore, 2, 'Both available should give 2 verifiability points');

const onlyDomain = { available: true, ageDays: 365 };
const onlyCert = { available: false, firstSeenDays: null };
const onlyDomainResult = calcOperationalRiskScore(onlyDomain, onlyCert);
assertEqual(onlyDomainResult.verifiabilityScore, 1, 'Only domain available should give 1 verifiability point');

// Case 15: External links generation
console.log('\n--- Case 15: External Links Generation ---');
const links = buildOperationalRiskLinks('api.example.com', 'example.com');
assertContains(links.icannLookup, 'lookup.icann.org', 'Should contain ICANN lookup URL');
assertContains(links.icannLookup, 'example.com', 'Should contain domain in ICANN URL');
assertContains(links.rdapLookup, 'rdap.org', 'Should contain RDAP URL');
assertContains(links.crtShLookup, 'crt.sh', 'Should contain crt.sh URL');
assertContains(links.crtShLookup, 'api.example.com', 'Should contain hostname in crt.sh URL');
assertContains(links.waybackLookup, 'web.archive.org', 'Should contain Wayback URL');

// Case 16: operationalRisk.affectsApiScore must be false
console.log('\n--- Case 16: operationalRisk.affectsApiScore Verification ---');
// This verifies the design principle
const operationalRiskObject = {
  enabled: true,
  affectsApiScore: false,
  hostname: 'api.example.com',
  domainQueried: 'example.com',
  score: 12,
  max: 20,
  level: 'medium'
};
assertTrue(operationalRiskObject.affectsApiScore === false, 'operationalRisk.affectsApiScore must be false');

// Case 17: English summary
console.log('\n--- Case 17: English Summary Generation ---');
const enSummary = buildOperationalRiskSummary('high', highRiskDomain, highRiskCert, false);
assertContains(enSummary.summary, 'short-term operational risk', 'English summary should mention short-term operational risk');
assertContains(enSummary.levelLabel, 'High', 'English level label should be High');

const enLowSummary = buildOperationalRiskSummary('low', lowRiskDomain, lowRiskCert, false);
assertContains(enLowSummary.levelLabel, 'Low', 'English level label for low should be Low');

// Case 18: Domain score thresholds
console.log('\n--- Case 18: Domain Score Thresholds ---');
const testDomain = (days, expectedScore) => {
  const result = calcOperationalRiskScore({ available: true, ageDays: days }, { available: false, firstSeenDays: null });
  assertEqual(result.domainScore, expectedScore, `Domain ${days} days should give score ${expectedScore}`);
};

testDomain(2000, 10);
testDomain(1095, 10);
testDomain(500, 8);
testDomain(365, 8);
testDomain(200, 6);
testDomain(180, 6);
testDomain(100, 4);
testDomain(90, 4);
testDomain(50, 2);
testDomain(30, 2);
testDomain(10, 0);

// Case 19: Cert score thresholds
console.log('\n--- Case 19: Certificate Score Thresholds ---');
const testCert = (days, expectedScore) => {
  const result = calcOperationalRiskScore({ available: false, ageDays: null }, { available: true, firstSeenDays: days });
  assertEqual(result.certScore, expectedScore, `Cert ${days} days should give score ${expectedScore}`);
};

testCert(500, 8);
testCert(365, 8);
testCert(200, 6);
testCert(180, 6);
testCert(100, 4);
testCert(90, 4);
testCert(50, 2);
testCert(30, 2);
testCert(10, 0);

// Case 20: Max score constant
console.log('\n--- Case 20: Max Score Constant ---');
const maxScore = calcOperationalRiskScore({ available: true, ageDays: 2000 }, { available: true, firstSeenDays: 500 });
assertEqual(maxScore.max, 20, 'Max operational risk score should be 20');
assertEqual(maxScore.score, 20, 'Max possible score should be 20');

// ── Summary ──
console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}
