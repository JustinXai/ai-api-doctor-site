/**
 * AI API Doctor v1.10.5 — Operational Risk Partial Evidence UI Tests
 * Tests that partial signals show domain/cert signal instead of full 20-point score
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
    return { score: null, max: MAX_SCORE, domainScore: 0, certScore: 0, verifiabilityScore: 0, level: 'unknown', scored: false };
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

  return { score: totalScore, max: MAX_SCORE, domainScore, certScore, verifiabilityScore, level, scored: true };
}

function buildOperationalRiskSummary(level, domainSignal, certSignal, zh, opts) {
  opts = opts || {};
  const confidence = opts.confidence || 'none';
  const isPartial = confidence === 'partial';
  const domainAvailable = domainSignal && domainSignal.available === true;
  const certAvailable = certSignal && certSignal.available === true;

  const labels = {
    high: zh ? '高' : 'High',
    medium: zh ? '中' : 'Medium',
    low: zh ? '低' : 'Low',
    unknown: zh ? '未确认' : 'Unconfirmed'
  };

  let summary = '';
  let recommendation = '';

  // Case 1: Partial — domain available, cert unavailable
  if (isPartial && domainAvailable && !certAvailable) {
    const days = domainSignal.ageDays;
    if (days !== null && days < 30) {
      summary = zh
        ? `公开记录显示该域名注册仅 ${days} 天，但证书历史未能自动获取，这里只是部分运营信号。`
        : `The domain was registered only ${days} days ago. Certificate history was not retrieved automatically — this is a partial operational signal only.`;
    } else {
      summary = zh
        ? `公开记录显示该域名注册时间较短；证书历史未能自动获取，因此这里只是部分运营信号。`
        : `Public records show this domain was registered recently. Certificate history was not retrieved automatically, so this is only a partial operational signal.`;
    }
    recommendation = zh
      ? '仅建议小额测试充值。证书历史未能自动获取，完整评估前请手动核验证书历史、历史快照和供应商口碑。'
      : 'Use with small test top-ups only. Certificate history was not retrieved; before large prepaid balances, manually verify certificate history, archive snapshots, and provider reputation.';
  }
  // Case 2: Partial — cert available, domain unavailable
  else if (isPartial && !domainAvailable && certAvailable) {
    const days = certSignal.firstSeenDays;
    if (days !== null && days < 30) {
      summary = zh
        ? `证书首次发现仅 ${days} 天前，但域名注册信息未能自动获取，这里只是部分运营信号。`
        : `HTTPS certificate first seen only ${days} days ago. Domain registration was not retrieved automatically — this is a partial operational signal only.`;
    } else {
      summary = zh
        ? `公开记录显示该站点证书历史较短；域名注册信息未能自动获取，因此这里只是部分运营信号。`
        : `Public records show a relatively short HTTPS history. Domain registration was not retrieved automatically, so this is only a partial operational signal.`;
    }
    recommendation = zh
      ? '仅建议小额测试充值。域名注册信息未能自动获取，完整评估前请手动核验域名注册时间、历史快照和供应商口碑。'
      : 'Use with small test top-ups only. Domain registration was not retrieved; before large prepaid balances, manually verify domain registration age, archive snapshots, and provider reputation.';
  }
  // Case 3: Full — both available
  else if (level === 'high') {
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
  }
  // Case 4: Unknown
  else {
    summary = zh
      ? '未能自动获取域名注册时间或证书历史。建议手动查询公开记录后再考虑大额充值。'
      : 'Failed to automatically retrieve domain registration time or certificate history. Manual verification of public records is advised before large top-ups.';
    recommendation = zh
      ? '建议手动复核域名注册时间、证书历史和历史快照后再决定。'
      : 'Please manually verify domain registration, certificate history, and snapshots before deciding on larger amounts.';
  }

  return { summary, recommendation, levelLabel: labels[level] || labels.unknown };
}

function escH(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPartialEvidenceUI(domainSignal, certSignal, zh, opts) {
  opts = opts || {};
  const domainAvailable = domainSignal && domainSignal.available === true;
  const certAvailable = certSignal && certSignal.available === true;
  const passedConfidence = opts && opts.confidence !== undefined ? opts.confidence : 'none';
  const confidence = passedConfidence;
  const isPartial = confidence === 'partial';
  const isUnknown = confidence === 'none';
  const isFull = confidence === 'full';

  const scoreResult = calcOperationalRiskScore(domainSignal, certSignal);
  const levelForSummary = isPartial ? 'high' : scoreResult.level;
  const summaryResult = buildOperationalRiskSummary(levelForSummary, domainSignal, certSignal, zh, { confidence });

  const levelColors = {
    high: { color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
    medium: { color: '#d97706', bg: '#fef9c3', border: '#fde68a' },
    low: { color: '#16a34a', bg: '#dcfce7', border: '#bbf7d0' },
    unknown: { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' }
  };
  const lc = levelColors[scoreResult.level] || levelColors.unknown;

  const domainText = domainSignal.available
    ? `${domainSignal.ageDays} ${zh ? '天前' : 'days ago'}`
    : (zh ? '自动查询失败，请手动复核' : 'Auto-lookup failed — please verify manually');
  const certText = certSignal.available
    ? `${certSignal.firstSeenDays} ${zh ? '天前' : 'days ago'}`
    : (zh ? '自动查询失败，请手动复核' : 'Auto-lookup failed — please verify manually');

  let scoreDisplay = '';
  let signalDetails = '';

  if (isUnknown) {
    scoreDisplay = `<span style="font-weight:700;color:#94a3b8">${zh ? '未评分' : 'Not Scored'}</span>`;
    signalDetails = `<div style="margin-bottom:3px"><span style="font-weight:600;color:#64748b">${zh ? '完整运营风险评分：' : 'Full Operational Score: '}</span><span style="color:#94a3b8">${zh ? '未评分' : 'Not available'}</span></div>`;
  } else if (isPartial && domainAvailable && !certAvailable) {
    const domainScore = scoreResult.domainScore || 0;
    scoreDisplay = `<span style="font-weight:700;color:#d97706">${zh ? '部分证据' : 'Partial Evidence'}</span>`;
    signalDetails = `
      <div style="margin-bottom:3px"><span style="font-weight:600;color:#64748b">${zh ? '域名注册时间信号：' : 'Domain Age Signal: '}</span><span style="font-weight:700;color:${lc.color}">${domainScore}/10</span></div>
      <div style="margin-bottom:3px"><span style="font-weight:600;color:#64748b">${zh ? '完整运营风险评分：' : 'Full Operational Score: '}</span><span style="color:#94a3b8">${zh ? '未评分（需证书历史）' : 'Not available (cert history required)'}</span></div>`;
  } else if (isPartial && !domainAvailable && certAvailable) {
    const certScore = scoreResult.certScore || 0;
    scoreDisplay = `<span style="font-weight:700;color:#d97706">${zh ? '部分证据' : 'Partial Evidence'}</span>`;
    signalDetails = `
      <div style="margin-bottom:3px"><span style="font-weight:600;color:#64748b">${zh ? '证书历史信号：' : 'Cert History Signal: '}</span><span style="font-weight:700;color:${lc.color}">${certScore}/8</span></div>
      <div style="margin-bottom:3px"><span style="font-weight:600;color:#64748b">${zh ? '完整运营风险评分：' : 'Full Operational Score: '}</span><span style="color:#94a3b8">${zh ? '未评分（需域名注册时间）' : 'Not available (domain reg required)'}</span></div>`;
  } else if (isFull) {
    scoreDisplay = `<span style="font-weight:700">${scoreResult.score}/${scoreResult.max}</span>`;
  } else {
    scoreDisplay = `<span style="font-weight:700">${scoreResult.score}/${scoreResult.max}</span>`;
  }

  const titleSuffix = isPartial ? (zh ? '（部分证据）' : ' (Partial Evidence)') : '';
  const title = `${zh ? '短期运营风险信号' : 'Short-term Operational Risk Signals'}${titleSuffix}`;

  const noticeBg = isPartial ? '#fef9c3' : '#fff';
  const noticeBorder = isPartial ? '#fde68a' : '#e2e8f0';
  const noticeColor = isPartial ? '#92400e' : '#94a3b8';

  const html = `
    <div>
      <div>${title}</div>
      <div>${summaryResult.levelLabel}</div>
      <div>${scoreDisplay}</div>
      <div>${domainAvailable || !certAvailable ? domainText : ''}</div>
      <div>${certAvailable || !domainAvailable ? certText : ''}</div>
      ${signalDetails}
      <div>${summaryResult.summary}</div>
      <div>${summaryResult.recommendation}</div>
      <div>${zh ? '注意：' : 'Note: '}${zh ? '本模块不影响 API 技术总分。' : 'This module does not affect the API technical score.'}</div>
    </div>
  `;

  return { title, scoreDisplay, signalDetails, domainText, certText, summary: summaryResult.summary, recommendation: summaryResult.recommendation, html, level: scoreResult.level };
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
function assertContains(s, n, msg) { if (s && s.includes && s.includes(n)) { console.log(`  PASS: ${msg}`); passed++; } else { console.log(`  FAIL: ${msg} - "${n}" not found in "${s}"`); failed++; } }
function assertNotContains(s, n, msg) { if (!s || !s.includes || !s.includes(n)) { console.log(`  PASS: ${msg}`); passed++; } else { console.log(`  FAIL: ${msg} - "${n}" should NOT be in output`); failed++; } }

console.log('\n=== AI API Doctor v1.10.5 Operational Risk Partial Evidence UI Tests ===\n');

// ── Case 1: Partial — domain available, cert unavailable (aizhongzhuan.com) ───────

console.log('\n--- Case 1: Partial - aizhongzhuan.com (domain ok, cert fail) ---');

const partialDomain = {
  domainSignal: { available: true, ageDays: 65 },
  certSignal: { available: false }
};

const partial65 = renderPartialEvidenceUI(partialDomain.domainSignal, partialDomain.certSignal, true, { confidence: 'partial' });
const partial65En = renderPartialEvidenceUI(partialDomain.domainSignal, partialDomain.certSignal, false, { confidence: 'partial' });

assertContains(partial65.title, '部分证据', 'ZH: Title contains 部分证据');
assertContains(partial65En.title, 'Partial Evidence', 'EN: Title contains Partial Evidence');
assertContains(partial65.html, '65 天前', 'ZH: Domain shows 65 天前');
assertContains(partial65En.html, '65 days ago', 'EN: Domain shows 65 days ago');
assertContains(partial65.html, '域名注册时间信号：', 'ZH: Shows Domain Age Signal label');
assertContains(partial65.html, '2/10', 'ZH: Shows 2/10 score');
assertContains(partial65En.html, 'Domain Age Signal:', 'EN: Shows Domain Age Signal label');
assertContains(partial65En.html, '2/10', 'EN: Shows 2/10 score');
assertContains(partial65.html, '未评分（需证书历史）', 'ZH: Shows not scored (cert required)');
assertContains(partial65En.html, 'Not available (cert history required)', 'EN: Shows not available (cert required)');
assertNotContains(partial65.html, '3/20', 'ZH: Should NOT show 3/20');
assertNotContains(partial65En.html, '3/20', 'EN: Should NOT show 3/20');
assertNotContains(partial65.html, 'HTTPS site history is very short', 'ZH: Should NOT say HTTPS site history is short');
assertNotContains(partial65En.html, 'HTTPS site history is very short', 'EN: Should NOT say HTTPS site history is very short');
assertContains(partial65.html, '证书历史未能自动获取', 'ZH: Summary mentions cert not retrieved');
assertContains(partial65En.html, 'Certificate history was not retrieved', 'EN: Summary mentions cert not retrieved');
assertContains(partial65.html, '本模块不影响 API 技术总分', 'ZH: Notice says does not affect score');
assertContains(partial65En.html, 'does not affect the API technical score', 'EN: Notice says does not affect score');

// ── Case 2: Partial — cert available, domain unavailable ────────────────────────

console.log('\n--- Case 2: Partial - cert ok, domain unavailable ---');

const partialCert = renderPartialEvidenceUI(
  { available: false },
  { available: true, firstSeenDays: 100 },
  true,
  { confidence: 'partial' }
);
const partialCertEn = renderPartialEvidenceUI(
  { available: false },
  { available: true, firstSeenDays: 100 },
  false,
  { confidence: 'partial' }
);

assertContains(partialCert.title, '部分证据', 'ZH: Title contains 部分证据');
assertContains(partialCert.html, '证书历史信号：', 'ZH: Shows 证书历史信号 label');
assertContains(partialCert.html, '4/8', 'ZH: Shows 4/8 score');
assertContains(partialCertEn.html, 'Cert History Signal:', 'EN: Shows Cert History Signal label');
assertContains(partialCertEn.html, '4/8', 'EN: Shows 4/8 score');
assertContains(partialCert.html, '未评分（需域名注册时间）', 'ZH: Shows not scored (domain required)');
assertNotContains(partialCert.html, '4/20', 'ZH: Should NOT show 4/20');
assertContains(partialCert.html, '域名注册信息未能自动获取', 'ZH: Summary mentions domain not retrieved');
assertContains(partialCertEn.html, 'Domain registration was not retrieved', 'EN: Summary mentions domain not retrieved');

// ── Case 3: Full — both available ──────────────────────────────────────────────

console.log('\n--- Case 3: Full - both available ---');

const fullResp = renderPartialEvidenceUI(
  { available: true, ageDays: 200 },
  { available: true, firstSeenDays: 100 },
  true,
  { confidence: 'full' }
);
const fullEn = renderPartialEvidenceUI(
  { available: true, ageDays: 200 },
  { available: true, firstSeenDays: 100 },
  false,
  { confidence: 'full' }
);

// 200 days = 6, 100 days = 4, both = 2 → 12/20 = medium
assertNotContains(fullResp.title, '部分证据', 'ZH: Full title should NOT have partial evidence');
assertNotContains(fullResp.title, '部分确认', 'ZH: Full title should NOT have partial');
assertContains(fullResp.html, '12/20', 'ZH: Full score shows 12/20');
assertContains(fullEn.html, '12/20', 'EN: Full score shows 12/20');
assertNotContains(fullResp.html, '域名注册时间信号：', 'ZH: Full should NOT show domain signal');
assertNotContains(fullResp.html, 'Not available', 'ZH: Full should NOT show not available');

// ── Case 4: Unknown — both unavailable ─────────────────────────────────────────

console.log('\n--- Case 4: Unknown - both unavailable ---');

const unknownResp = renderPartialEvidenceUI(
  { available: false },
  { available: false },
  true,
  { confidence: 'none' }
);
const unknownEn = renderPartialEvidenceUI(
  { available: false },
  { available: false },
  false,
  { confidence: 'none' }
);

assertNotContains(unknownResp.title, '部分证据', 'ZH: Unknown should NOT have partial');
assertNotContains(unknownResp.title, '部分确认', 'ZH: Unknown should NOT have partial confirmed');
assertContains(unknownResp.html, '未评分', 'ZH: Shows 未评分');
assertContains(unknownEn.html, 'Not Scored', 'EN: Shows Not Scored');
assertNotContains(unknownResp.html, '9/20', 'ZH: Should NOT show 9/20');
assertNotContains(unknownEn.html, '9/20', 'EN: Should NOT show 9/20');
assertContains(unknownResp.html, '完整运营风险评分', 'ZH: Shows Full Operational Score');
assertContains(unknownEn.html, 'Full Operational Score', 'EN: Shows Full Operational Score');
assertContains(unknownResp.html, '未能自动获取', 'ZH: Summary mentions failed to retrieve');
assertContains(unknownEn.html, 'Failed to automatically retrieve', 'EN: Summary mentions failed to retrieve');

// ── Case 5: English wording - cert failure should NOT say "HTTPS site history is short" ─

console.log('\n--- Case 5: English wording - cert failure not called short history ---');

const enPartialCert = renderPartialEvidenceUI(
  { available: true, ageDays: 65 },
  { available: false },
  false,
  { confidence: 'partial' }
);

assertNotContains(enPartialCert.html, 'HTTPS site history is very short', 'EN: Should NOT say HTTPS site history is very short');
assertNotContains(enPartialCert.html, 'certificate history is short', 'EN: Should NOT say certificate history is short');
assertContains(enPartialCert.html, 'Certificate history was not retrieved', 'EN: Should say certificate history was not retrieved');
assertContains(enPartialCert.html, 'Use with small test top-ups only', 'EN: Should recommend small test top-ups');

// ── Case 6: Chinese wording - cert failure ──────────────────────────────────────

console.log('\n--- Case 6: Chinese wording - cert failure ---');

const zhPartialCert = renderPartialEvidenceUI(
  { available: true, ageDays: 65 },
  { available: false },
  true,
  { confidence: 'partial' }
);

assertNotContains(zhPartialCert.html, '证书历史很短', 'ZH: Should NOT say 证书历史很短');
assertContains(zhPartialCert.html, '证书历史未能自动获取', 'ZH: Should say 证书历史未能自动获取');
assertContains(zhPartialCert.html, '仅建议小额测试充值', 'ZH: Should recommend small test');

// ── Case 7: Notice is prominent ─────────────────────────────────────────────────

console.log('\n--- Case 7: Notice is prominent in partial UI ---');

assertContains(partial65.html, '本模块不影响 API 技术总分', 'ZH: Notice is in partial UI');
assertContains(partial65En.html, 'does not affect the API technical score', 'EN: Notice is in partial UI');

// ── Case 8: Scoring boundary - 65 days = 2/10 ───────────────────────────────────

console.log('\n--- Case 8: 65 days = 2/10 domain score ---');

const score65 = calcOperationalRiskScore({ available: true, ageDays: 65 }, { available: false });
assertEqual(score65.domainScore, 2, '65 days = 2 domain points');
assertEqual(score65.certScore, 0, 'no cert = 0 cert points');
assertEqual(score65.verifiabilityScore, 1, 'one available = 1 verif point');
assertEqual(score65.score, 3, 'total = 3/20');
assertEqual(score65.level, 'high', '3 < 10 = high');

// ── Case 9: Summary for partial domain < 30 days ───────────────────────────────

console.log('\n--- Case 9: Partial - domain < 30 days ---');

const veryNewDomain = renderPartialEvidenceUI(
  { available: true, ageDays: 15 },
  { available: false },
  true,
  { confidence: 'partial' }
);
const veryNewDomainEn = renderPartialEvidenceUI(
  { available: true, ageDays: 15 },
  { available: false },
  false,
  { confidence: 'partial' }
);

assertContains(veryNewDomain.html, '15 天', 'ZH: Shows 15 days');
assertContains(veryNewDomainEn.html, '15 days ago', 'EN: Shows 15 days');
assertContains(veryNewDomain.html, '域名注册仅 15 天', 'ZH: Summary mentions registered only 15 days');
assertContains(veryNewDomainEn.html, 'registered only 15 days ago', 'EN: Summary mentions registered only 15 days');
assertContains(veryNewDomain.html, '证书历史未能自动获取', 'ZH: Summary also mentions cert not retrieved');

// ── Summary ────────────────────────────────────────────────────────────────────

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All v1.10.5 partial evidence UI tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}
