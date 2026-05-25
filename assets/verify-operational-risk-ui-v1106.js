/**
 * AI API Doctor v1.10.6 — Operational Risk UI ReferenceError Fix Tests
 * Tests that the Operational Risk card renders without undefined errors
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
  } else if (isPartial && !domainAvailable && certAvailable) {
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
  } else if (level === 'high') {
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

  return { summary, recommendation, levelLabel: labels[level] || labels.unknown };
}

function escH(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Simulate the IIFE rendering logic from test.js (v1.10.6) ──────────────
// This mirrors the actual code structure in the template literal IIFE

function renderOperationalRiskCard(operationalRisk, zh) {
  if (!operationalRisk || !operationalRisk.enabled) return '';

  const domainSignal = operationalRisk.domainRegistration || {};
  const certSignal = operationalRisk.certificateHistory || {};
  const hostname = operationalRisk.hostname || '';

  const levelColors = {
    high: { color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
    medium: { color: '#d97706', bg: '#fef9c3', border: '#fde68a' },
    low: { color: '#16a34a', bg: '#dcfce7', border: '#bbf7d0' },
    unknown: { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' }
  };

  const level = operationalRisk.level || 'unknown';
  const lc = levelColors[level] || levelColors.unknown;
  const levelLabel = operationalRisk.levelLabel || level;

  const domainText = domainSignal.available
    ? `${domainSignal.ageDays} ${zh ? '天前' : 'days ago'}`
    : (zh ? '自动查询失败，请手动复核' : 'Auto-lookup failed — please verify manually');
  const certText = certSignal.available
    ? `${certSignal.firstSeenDays} ${zh ? '天前' : 'days ago'}`
    : (zh ? '自动查询失败，请手动复核' : 'Auto-lookup failed — please verify manually');

  // v1.10.6: compute score inline, NO external variable refs
  const scored = operationalRisk.scored !== false;
  const confidence = operationalRisk.confidence || 'none';
  const isPartial = confidence === 'partial';
  const isUnknown = !scored || confidence === 'none';
  const domainAvailable = domainSignal.available === true;
  const certAvailable = certSignal.available === true;

  let scoreDisplay = '';
  let signalDetails = '';

  if (isUnknown) {
    scoreDisplay = `<span style="font-weight:700;color:#94a3b8">${zh ? '未评分' : 'Not Scored'}</span>`;
    signalDetails = `<div style="margin-bottom:3px"><span style="font-weight:600;color:#64748b">${zh ? '完整运营风险评分：' : 'Full Operational Score: '}</span><span style="color:#94a3b8">${zh ? '未评分' : 'Not available'}</span></div>`;
  } else if (isPartial && domainAvailable && !certAvailable) {
    // Partial: domain only — compute inline
    const domainScoreResult = calcOperationalRiskScore(domainSignal, certSignal);
    const domainScore = domainScoreResult.domainScore || 0;
    scoreDisplay = `<span style="font-weight:700;color:#d97706">${zh ? '部分证据' : 'Partial Evidence'}</span>`;
    signalDetails = `<div style="margin-bottom:3px"><span style="font-weight:600;color:#64748b">${zh ? '域名注册时间信号：' : 'Domain Age Signal: '}</span><span style="font-weight:700;color:${lc.color}">${domainScore}/10</span></div><div style="margin-bottom:3px"><span style="font-weight:600;color:#64748b">${zh ? '完整运营风险评分：' : 'Full Operational Score: '}</span><span style="color:#94a3b8">${zh ? '未评分（需证书历史）' : 'Not available (cert history required)'}</span></div>`;
  } else if (isPartial && !domainAvailable && certAvailable) {
    const certScoreResult = calcOperationalRiskScore(domainSignal, certSignal);
    const certScore = certScoreResult.certScore || 0;
    scoreDisplay = `<span style="font-weight:700;color:#d97706">${zh ? '部分证据' : 'Partial Evidence'}</span>`;
    signalDetails = `<div style="margin-bottom:3px"><span style="font-weight:600;color:#64748b">${zh ? '证书历史信号：' : 'Cert History Signal: '}</span><span style="font-weight:700;color:${lc.color}">${certScore}/8</span></div><div style="margin-bottom:3px"><span style="font-weight:600;color:#64748b">${zh ? '完整运营风险评分：' : 'Full Operational Score: '}</span><span style="color:#94a3b8">${zh ? '未评分（需域名注册时间）' : 'Not available (domain reg required)'}</span></div>`;
  } else {
    scoreDisplay = `<span style="font-weight:700">${operationalRisk.score}/${operationalRisk.max}</span>`;
  }

  const titleSuffix = isPartial ? (zh ? '（部分证据）' : ' (Partial Evidence)') : '';
  const title = `${zh ? '短期运营风险信号' : 'Short-term Operational Risk Signals'}${titleSuffix}`;

  const noticeBg = isPartial ? '#fef9c3' : '#fff';
  const noticeBorder = isPartial ? '#fde68a' : '#e2e8f0';
  const noticeColor = isPartial ? '#92400e' : '#94a3b8';

  const summary = buildOperationalRiskSummary(level, domainSignal, certSignal, zh, { confidence });
  const recommendation = summary.recommendation;

  return {
    title,
    levelLabel,
    scoreDisplay,
    domainText,
    certText,
    signalDetails,
    summary: summary.summary,
    recommendation,
    html: `<div style="background:${lc.bg};border:1px solid ${lc.border};border-radius:12px;padding:12px 14px;margin-bottom:10px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><div style="font-size:12px;font-weight:700;color:${lc.color}">${title}</div><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;color:${lc.color};background:#fff;border:1px solid ${lc.border}">${levelLabel}</span>${scoreDisplay}</div><div style="font-size:10px;color:#374151;margin-bottom:6px"><div style="margin-bottom:3px"><span style="font-weight:600;color:#64748b">${zh ? '检测域名：' : 'Domain: '}</span>${escH(hostname)}</div>${domainAvailable || !certAvailable ? `<div style="margin-bottom:3px"><span style="font-weight:600;color:#64748b">${zh ? '域名注册时间：' : 'Domain Registered: '}</span>${escH(domainText)}</div>` : ''}${certAvailable || !domainAvailable ? `<div style="margin-bottom:3px"><span style="font-weight:600;color:#64748b">${zh ? '证书首次发现：' : 'Cert First Seen: '}</span>${escH(certText)}</div>` : ''}${signalDetails}</div><div style="font-size:11px;color:#374151;line-height:1.5;margin-bottom:6px"><b>${zh ? '结论：' : 'Conclusion: '}</b>${escH(summary.summary)}</div>${recommendation ? `<div style="font-size:11px;color:#374151;line-height:1.5;margin-bottom:6px"><b>${zh ? '建议：' : 'Recommendation: '}</b>${escH(recommendation)}</div>` : ''}<div style="margin-top:8px;padding:6px 8px;background:${noticeBg};border-radius:6px;font-size:9px;color:${noticeColor};line-height:1.4;border:1px solid ${noticeBorder}"><b>${zh ? '注意：' : 'Note: '}</b>${zh ? '本模块不影响 API 技术总分。' : 'This module does not affect the API technical score.'}${zh ? '' : ' '}${zh ? '提供短期运营风险提示，不证明平台一定会或不会发生运营问题。首次使用仍建议小额测试。' : 'It provides short-term operational risk hints only and does not prove whether a provider will or will not have operational issues. Small test top-ups are still recommended for first-time use.'}</div></div>`,
    htmlWithoutError: true
  };
}

// ── Test Cases ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let errorCount = 0;

function assertEqual(a, e, n) {
  if (JSON.stringify(a) === JSON.stringify(e)) { console.log(`  PASS: ${n}`); passed++; }
  else { console.log(`  FAIL: ${n}`); console.log(`    Expected: ${JSON.stringify(e)}`); console.log(`    Actual:   ${JSON.stringify(a)}`); failed++; }
}
function assertTrue(v, n) { if (v === true) { console.log(`  PASS: ${n}`); passed++; } else { console.log(`  FAIL: ${n} - Expected true, got ${v}`); failed++; } }
function assertFalse(v, n) { if (v === false) { console.log(`  PASS: ${n}`); passed++; } else { console.log(`  FAIL: ${n} - Expected false, got ${v}`); failed++; } }
function assertNotThrow(fn, n) {
  try { fn(); console.log(`  PASS: ${n}`); passed++; }
  catch (e) { console.log(`  FAIL: ${n} - Threw: ${e.message}`); failed++; }
}
function assertContains(s, n, msg) { if (s && s.includes && s.includes(n)) { console.log(`  PASS: ${msg}`); passed++; } else { console.log(`  FAIL: ${msg} - "${n}" not found in "${s}"`); failed++; } }
function assertNotContains(s, n, msg) { if (!s || !s.includes || !s.includes(n)) { console.log(`  PASS: ${msg}`); passed++; } else { console.log(`  FAIL: ${msg} - "${n}" should NOT be in output`); failed++; } }

console.log('\n=== AI API Doctor v1.10.6 Operational Risk UI ReferenceError Fix Tests ===\n');

// ── Case 1: Partial — domain available, cert unavailable (aizhongzhuan.com) ──────

console.log('\n--- Case 1: Partial - aizhongzhuan.com (domain ok, cert fail) ---');

let renderError = null;
let partial65Result = null;
try {
  partial65Result = renderOperationalRiskCard({
    enabled: true,
    level: 'high',
    levelLabel: '高',
    score: 3,
    max: 20,
    scored: true,
    confidence: 'partial',
    hostname: 'aizhongzhuan.com',
    domainRegistration: { available: true, ageDays: 65 },
    certificateHistory: { available: false }
  }, true);
} catch (e) {
  renderError = e;
}

assertNotThrow(() => { if (renderError) throw renderError; }, 'Should NOT throw ReferenceError');
assertTrue(partial65Result !== null, 'Result should not be null');
assertContains(partial65Result.html, '部分证据', 'ZH: Title contains 部分证据');
assertContains(partial65Result.html, '65 天前', 'ZH: Domain shows 65 天前');
assertContains(partial65Result.html, '2/10', 'ZH: Shows domain signal 2/10');
assertContains(partial65Result.html, '未评分（需证书历史）', 'ZH: Shows not available (cert required)');
assertNotContains(partial65Result.html, '3/20', 'ZH: Should NOT show 3/20');
assertNotContains(partial65Result.html, 'undefined', 'Should NOT contain undefined');
assertNotContains(partial65Result.html, 'operationalRiskScore', 'Should NOT contain operationalRiskScore variable name');

// ── Case 2: Full — both available ──────────────────────────────────────────────

console.log('\n--- Case 2: Full - both available ---');

let fullError = null;
let fullResult = null;
try {
  fullResult = renderOperationalRiskCard({
    enabled: true,
    level: 'medium',
    levelLabel: '中',
    score: 12,
    max: 20,
    scored: true,
    confidence: 'full',
    hostname: 'github.com',
    domainRegistration: { available: true, ageDays: 6802 },
    certificateHistory: { available: true, firstSeenDays: 3650 }
  }, false);
} catch (e) {
  fullError = e;
}

assertNotThrow(() => { if (fullError) throw fullError; }, 'Full should NOT throw');
assertTrue(fullResult !== null, 'Full result should not be null');
assertContains(fullResult.html, '12/20', 'ZH: Shows full score 12/20');
assertNotContains(fullResult.html, 'Partial Evidence', 'Full should NOT have Partial Evidence');
assertNotContains(fullResult.html, 'Not available', 'Full should NOT show Not available');
assertNotContains(fullResult.html, 'undefined', 'Should NOT contain undefined');

// ── Case 3: Unknown — both unavailable ──────────────────────────────────────────

console.log('\n--- Case 3: Unknown - both unavailable ---');

let unknownError = null;
let unknownResult = null;
try {
  unknownResult = renderOperationalRiskCard({
    enabled: true,
    level: 'unknown',
    levelLabel: '未确认',
    score: null,
    max: 20,
    scored: false,
    confidence: 'none',
    hostname: 'test.xyz',
    domainRegistration: { available: false },
    certificateHistory: { available: false }
  }, true);
} catch (e) {
  unknownError = e;
}

assertNotThrow(() => { if (unknownError) throw unknownError; }, 'Unknown should NOT throw');
assertTrue(unknownResult !== null, 'Unknown result should not be null');
assertContains(unknownResult.html, '未评分', 'ZH: Shows 未评分');
assertNotContains(unknownResult.html, '9/20', 'Should NOT show 9/20');
assertNotContains(unknownResult.html, 'undefined', 'Should NOT contain undefined');

// ── Case 4: English unknown ──────────────────────────────────────────────────────────

console.log('\n--- Case 3b: Unknown - English ---');

let unknownEnResult = null;
try {
  unknownEnResult = renderOperationalRiskCard({
    enabled: true,
    level: 'unknown',
    levelLabel: 'Unconfirmed',
    score: null,
    max: 20,
    scored: false,
    confidence: 'none',
    hostname: 'test.xyz',
    domainRegistration: { available: false },
    certificateHistory: { available: false }
  }, false);
} catch (e) {
  unknownError = e;
}

assertTrue(unknownEnResult !== null, 'EN Unknown result not null');
assertContains(unknownEnResult.html, 'Not Scored', 'EN: Shows Not Scored');

// ── Case 4: operationalRisk missing score field ───────────────────────────────────

console.log('\n--- Case 4: Missing score field ---');

let missingScoreError = null;
let missingScoreResult = null;
try {
  missingScoreResult = renderOperationalRiskCard({
    enabled: true,
    level: 'high',
    scored: true,
    confidence: 'partial',
    hostname: 'test.com',
    domainRegistration: { available: true, ageDays: 65 },
    certificateHistory: { available: false }
  }, true);
} catch (e) {
  missingScoreError = e;
}

assertNotThrow(() => { if (missingScoreError) throw missingScoreError; }, 'Missing score field should NOT throw');
assertTrue(missingScoreResult !== null, 'Result should not be null');

// ── Case 5: operationalRisk missing domainRegistration ─────────────────────────────

console.log('\n--- Case 5: Missing domainRegistration field ---');

let missingDomainError = null;
let missingDomainResult = null;
try {
  missingDomainResult = renderOperationalRiskCard({
    enabled: true,
    level: 'unknown',
    scored: false,
    confidence: 'none',
    hostname: 'test.com'
    // domainRegistration and certificateHistory missing
  }, true);
} catch (e) {
  missingDomainError = e;
}

assertNotThrow(() => { if (missingDomainError) throw missingDomainError; }, 'Missing domainRegistration should NOT throw');
assertTrue(missingDomainResult !== null, 'Result should not be null');

// ── Case 6: English wording - cert unavailable should NOT say HTTPS site history is short ─

console.log('\n--- Case 6: English wording - cert unavailable ---');

let enWordingError = null;
let enWordingResult = null;
try {
  enWordingResult = renderOperationalRiskCard({
    enabled: true,
    level: 'high',
    levelLabel: 'High',
    score: 3,
    max: 20,
    scored: true,
    confidence: 'partial',
    hostname: 'aizhongzhuan.com',
    domainRegistration: { available: true, ageDays: 65 },
    certificateHistory: { available: false }
  }, false);
} catch (e) {
  enWordingError = e;
}

assertNotThrow(() => { if (enWordingError) throw enWordingError; }, 'EN wording should NOT throw');
assertNotContains(enWordingResult.html, 'HTTPS site history is very short', 'EN: Should NOT say HTTPS site history is very short');
assertContains(enWordingResult.html, 'Certificate history was not retrieved', 'EN: Should say certificate history was not retrieved');
assertContains(enWordingResult.html, 'does not affect the API technical score', 'EN: Should mention does not affect score');

// ── Case 7: Chinese wording - cert unavailable should NOT say 证书历史很短 ─────────────

console.log('\n--- Case 7: Chinese wording - cert unavailable ---');

let zhWordingError = null;
let zhWordingResult = null;
try {
  zhWordingResult = renderOperationalRiskCard({
    enabled: true,
    level: 'high',
    levelLabel: '高',
    score: 3,
    max: 20,
    scored: true,
    confidence: 'partial',
    hostname: 'aizhongzhuan.com',
    domainRegistration: { available: true, ageDays: 65 },
    certificateHistory: { available: false }
  }, true);
} catch (e) {
  zhWordingError = e;
}

assertNotThrow(() => { if (zhWordingError) throw zhWordingError; }, 'ZH wording should NOT throw');
assertNotContains(zhWordingResult.html, '证书历史很短', 'ZH: Should NOT say 证书历史很短');
assertContains(zhWordingResult.html, '证书历史未能自动获取', 'ZH: Should say 证书历史未能自动获取');
assertContains(zhWordingResult.html, '本模块不影响 API 技术总分', 'ZH: Should mention does not affect score');

// ── Case 8: Partial - cert available, domain unavailable ─────────────────────────

console.log('\n--- Case 8: Partial - cert ok, domain unavailable ---');

let certOnlyError = null;
let certOnlyResult = null;
try {
  certOnlyResult = renderOperationalRiskCard({
    enabled: true,
    level: 'high',
    levelLabel: '高',
    score: 5,
    max: 20,
    scored: true,
    confidence: 'partial',
    hostname: 'test.com',
    domainRegistration: { available: false },
    certificateHistory: { available: true, firstSeenDays: 100 }
  }, true);
} catch (e) {
  certOnlyError = e;
}

assertNotThrow(() => { if (certOnlyError) throw certOnlyError; }, 'Cert-only partial should NOT throw');
assertContains(certOnlyResult.html, '部分证据', 'ZH: Shows 部分证据');
assertContains(certOnlyResult.html, '证书历史信号', 'ZH: Shows 证书历史信号');
assertContains(certOnlyResult.html, '域名注册信息未能自动获取', 'ZH: Summary mentions domain not retrieved');
assertNotContains(certOnlyResult.html, 'undefined', 'Should NOT contain undefined');

// ── Case 9: No operationalRisk object at all ─────────────────────────────────────

console.log('\n--- Case 9: No operationalRisk object ---');

let noOrError = null;
let noOrResult = null;
try {
  noOrResult = renderOperationalRiskCard(null, true);
} catch (e) {
  noOrError = e;
}

assertNotThrow(() => { if (noOrError) throw noOrError; }, 'Null operationalRisk should NOT throw');
assertEqual(noOrResult, '', 'Null should return empty string');

// ── Case 10: operationalRisk.enabled = false ─────────────────────────────────────

console.log('\n--- Case 10: operationalRisk.enabled = false ---');

let disabledError = null;
let disabledResult = null;
try {
  disabledResult = renderOperationalRiskCard({ enabled: false }, true);
} catch (e) {
  disabledError = e;
}

assertNotThrow(() => { if (disabledError) throw disabledError; }, 'Disabled should NOT throw');
assertEqual(disabledResult, '', 'Disabled should return empty string');

// ── Case 11: 65 days = 2/10 boundary ───────────────────────────────────────────

console.log('\n--- Case 11: Score boundary - 65 days = 2/10 ---');

let boundaryError = null;
let boundaryResult = null;
try {
  boundaryResult = renderOperationalRiskCard({
    enabled: true,
    level: 'high',
    levelLabel: '高',
    score: 3,
    max: 20,
    scored: true,
    confidence: 'partial',
    hostname: 'aizhongzhuan.com',
    domainRegistration: { available: true, ageDays: 65 },
    certificateHistory: { available: false }
  }, false);
} catch (e) {
  boundaryError = e;
}

assertNotThrow(() => { if (boundaryError) throw boundaryError; }, 'Boundary should NOT throw');
assertContains(boundaryResult.html, 'Domain Age Signal:', 'EN: Shows Domain Age Signal');
assertContains(boundaryResult.html, '2/10', 'EN: Shows 2/10');
assertNotContains(boundaryResult.html, '3/10', 'Should NOT show 3/10');
assertNotContains(boundaryResult.html, '3/20', 'Should NOT show 3/20');

// ── Summary ────────────────────────────────────────────────────────────────────

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All v1.10.6 operational risk UI ReferenceError fix tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}
