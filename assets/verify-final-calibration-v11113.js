/**
 * verify-final-calibration-v11113.js
 * Final calibration verification for v1.11.13
 */
'use strict';

const safeNum = (v, fallback) => (v != null && !isNaN(v) ? v : fallback);
const safeObject = (v) => v || {};

function buildModuleScores_v11113(checks, locale) {
  const sc = safeObject(checks);
  const zh = locale !== 'en';

  const targetCallEvidence = {
    ok: sc.targetCall?.ok ?? null,
    timeout: !!(sc.targetCall?.timeout),
    fallbackUsed: !!(sc.targetCall?.fallback),
    responseParsed: !!(sc.targetCall?.evidence?.responseParsed),
    openAICompatible: !!(sc.targetCall?.evidence?.formatChoices || sc.targetCall?.evidence?.formatMessage),
    hasChoices: !!(sc.targetCall?.evidence?.formatChoices),
    hasMessage: !!(sc.targetCall?.evidence?.formatMessage),
    hasContent: !!(sc.targetCall?.evidence?.output && sc.targetCall.evidence.output !== 'absent'),
    hasUsage: !!(sc.targetCall?.evidence?.usage && Object.keys(sc.targetCall.evidence.usage).length > 0),
  };

  const realTargetCallSuccess = targetCallEvidence.ok === true &&
    targetCallEvidence.timeout !== true &&
    targetCallEvidence.fallbackUsed !== true;

  const getRisk = (score, max) => {
    const ratio = max > 0 ? score / max : 0;
    if (ratio >= 0.8) return 'low';
    if (ratio >= 0.5) return 'medium';
    return 'high';
  };

  // usageTransparency (unchanged)
  const usageCheck = sc.costTransparency || {};
  const usageAuditCheck = sc.usageAudit || {};
  const usageAuditHasUsage = !!(usageAuditCheck?.evidence?.usage && Object.keys(usageAuditCheck.evidence.usage).length > 0);
  let usageScore = safeNum(usageCheck.score, 0);
  if (!realTargetCallSuccess) { usageScore = 0; }
  else if (!targetCallEvidence.hasUsage && !usageAuditHasUsage) { usageScore = 12; }
  else { usageScore = 16; }

  // cacheHitCheck (unchanged)
  const cacheScore = safeNum(sc.cacheHitCheck?.score, 0);

  // modelSignal (unchanged)
  const modelEvidence = sc.modelSignal?.evidence?.modelSignal || {};
  const selfClaimType = modelEvidence?.selfClaim?.type || 'unknown';
  let modelScore = safeNum(sc.modelSignal?.score, 0);
  if (selfClaimType !== 'unknown' && selfClaimType !== 'exact_match' && selfClaimType !== 'family_match') {
    modelScore = { ambiguous: 7, platform_identity: 6, wrong_family: 2, hard_contamination: 2, empty: 7, failed: 7, unknown: 7 }[selfClaimType] || 7;
  }

  // stabilityLatency (v1.11.13 calibration)
  const stabilityCheck = sc.stability || {};
  const stabilityEvidence = stabilityCheck?.evidence || {};
  const stabilitySamples = stabilityEvidence.samples || [];
  const okCount = stabilitySamples.filter(s => s && s.ok && s.hasContent).length;
  const totalStabilitySamples = stabilitySamples.length;
  let stabilityScore = safeNum(stabilityCheck.score, 0);
  let stabilityReason = 'legacy';
  let stabilitySource = 'checks.stability.score';

  if (totalStabilitySamples >= 5 && okCount === 5) {
    const latencies = stabilitySamples.map(s => s.latency || 0).filter(l => l > 0);
    const avgLat = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const sortedLat = [...latencies].sort((a, b) => a - b);
    const medianLat = sortedLat.length > 0 ? sortedLat[Math.floor(sortedLat.length / 2)] : 0;
    const maxLat = latencies.length > 0 ? Math.max(...latencies) : 0;
    const latencyRatio = medianLat > 0 ? maxLat / medianLat : 0;

    if (avgLat <= 2000 && latencyRatio <= 1.5) {
      if (stabilityScore < 22) {
        stabilityScore = 22;
        stabilityReason = 'all_success_slight_fluctuation';
        stabilitySource = 'v11113_calibration: all success + slight fluctuation → 22';
      }
    }
  }

  // basicCompatibility (v1.11.13 calibration)
  const basicCheck = sc.basicCompatibility || {};
  const basicEvidence = basicCheck?.evidence || {};
  const rawBasicScore = safeNum(basicCheck.score, 0);
  const reachCompat = basicEvidence.reachCompat || 0;
  const authCompat = basicEvidence.authCompat || 0;
  let basicScore = rawBasicScore;
  let basicReason = 'legacy';
  let basicSource = 'checks.basicCompatibility.score';

  // v1.11.14 calibration: use responseParsed (HTTP+JSON success) not openAICompatible+hasContent
  // FIX: responseParsed=true means API call succeeded with valid JSON, regardless of content extraction
  if (realTargetCallSuccess && reachCompat >= 1.5 && authCompat >= 1.5) {
    if (targetCallEvidence.responseParsed) {
      if (rawBasicScore < 23) { basicScore = 23; basicReason = 'full_compatibility_passed'; basicSource = 'v11114_calibration: responseParsed → 23'; }
    } else if (rawBasicScore < 20) {
      basicScore = 20; basicReason = 'minor_compatibility_issues'; basicSource = 'v11114_calibration: minor issues → 20';
    }
  }

  // clientConfig (unchanged)
  const rawClientScore = safeNum(sc.clientConfig?.score, 0);
  let clientScore = rawClientScore;
  if (rawClientScore >= 3) clientScore = 5;
  else if (rawClientScore >= 2) clientScore = 3;
  else if (rawClientScore >= 1) clientScore = 2;

  return [
    { key: 'usageTransparency', score: usageScore, max: 25, reason: 'unchanged' },
    { key: 'cacheSignal', score: cacheScore, max: 5, reason: 'unchanged' },
    { key: 'modelSignal', score: modelScore, max: 15, reason: 'unchanged' },
    { key: 'stabilityLatency', score: stabilityScore, max: 25, reason: stabilityReason, source: stabilitySource },
    { key: 'coreCompatibility', score: basicScore, max: 25, reason: basicReason, source: basicSource },
    { key: 'clientConfig', score: clientScore, max: 5, reason: 'unchanged' }
  ];
}

function calcRaw(modules) {
  return Math.round(modules.reduce((sum, m) => sum + safeNum(m.score, 0), 0) * 10) / 10;
}

// Cap check
function checkCap(checks, raw) {
  const rawBasicScore = checks.basicCompatibility?.score;
  const targetResponseParsed = checks.targetCall?.evidence?.responseParsed === true;
  const targetHttpStatus = checks.targetCall?.evidence?.httpStatus ?? null;
  if (rawBasicScore < 20 && !targetResponseParsed && targetHttpStatus === 200)
    return { capEffective: raw > 45, capReason: 'response_not_json', capLimit: 45 };
  if (checks.reachability?.score < 3)
    return { capEffective: raw > 25, capReason: 'reachability_failed', capLimit: 25 };
  if (checks.auth?.evidence?.modelsStatus === 401 || checks.auth?.evidence?.chatStatus === 401)
    return { capEffective: raw > 35, capReason: 'auth_401', capLimit: 35 };
  return { capEffective: false, capReason: null, capLimit: null };
}

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS:', name); pass++; }
  catch (err) { console.error('  FAIL:', name); console.error('    ', err.message); fail++; }
}
function assertEq(a, e, m) { if (a !== e) throw new Error(`${m}: expected ${e}, got ${a}`); }
function assertIn(a, min, max, m) { if (a < min || a > max) throw new Error(`${m}: expected ${min}-${max}, got ${a}`); }

// Test 1: Full OpenAI-compatible → basicCompat = 23
test('Test 1: full OpenAI-compatible + reach+auth pass → basicCompat=23', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 10, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 20 },
    clientConfig: { score: 3 }
  };
  const mods = buildModuleScores_v11113(checks, 'zh');
  const b = mods.find(m => m.key === 'coreCompatibility');
  assertEq(b.score, 23, 'basicCompat');
  assertEq(b.reason, 'full_compatibility_passed', 'basicCompat reason');
});

// Test 2: responseParsed=true → basicCompat=23 even if content extraction failed (v1.11.14)
test('Test 2: responseParsed=true → basicCompat=23 even if content extraction failed', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: false, formatMessage: false, output: 'absent' } },
    basicCompatibility: { score: 10, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 20 },
    clientConfig: { score: 3 }
  };
  const mods = buildModuleScores_v11113(checks, 'zh');
  const b = mods.find(m => m.key === 'coreCompatibility');
  // v1.11.14: responseParsed=true means HTTP+JSON success → 23
  assertEq(b.score, 23, 'basicCompat');
});

// Test 3: All success + slight fluctuation → stability = 22
test('Test 3: all success + avg<2000ms + ratio<=1.5 → stability=22', () => {
  const samples = [
    { ok: true, hasContent: true, latency: 900 },
    { ok: true, hasContent: true, latency: 950 },
    { ok: true, hasContent: true, latency: 1000 },
    { ok: true, hasContent: true, latency: 1050 },
    { ok: true, hasContent: true, latency: 1100 },
  ];
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 23, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 },
    modelSignal: { score: 7 },
    stability: { score: 20, evidence: { samples } },
    clientConfig: { score: 3 }
  };
  const mods = buildModuleScores_v11113(checks, 'zh');
  const s = mods.find(m => m.key === 'stabilityLatency');
  assertEq(s.score, 22, 'stability');
  assertEq(s.reason, 'all_success_slight_fluctuation', 'stability reason');
});

// Test 4: Obvious fluctuation → stability <= 21
test('Test 4: high fluctuation (ratio>2.0) → stability not raised to 22', () => {
  const samples = [
    { ok: true, hasContent: true, latency: 500 },
    { ok: true, hasContent: true, latency: 600 },
    { ok: true, hasContent: true, latency: 1000 },
    { ok: true, hasContent: true, latency: 1500 },
    { ok: true, hasContent: true, latency: 3000 },
  ];
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 23, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 },
    modelSignal: { score: 7 },
    stability: { score: 18, evidence: { samples } },
    clientConfig: { score: 3 }
  };
  const mods = buildModuleScores_v11113(checks, 'zh');
  const s = mods.find(m => m.key === 'stabilityLatency');
  assertEq(s.score, 18, 'stability should stay at raw 18');
});

// Test 5: Golden case → 70-72
test('Test 5: golden case → score 70-72', () => {
  const samples = [
    { ok: true, hasContent: true, latency: 900 },
    { ok: true, hasContent: true, latency: 1000 },
    { ok: true, hasContent: true, latency: 1100 },
    { ok: true, hasContent: true, latency: 1200 },
    { ok: true, hasContent: true, latency: 1300 },
  ];
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 10, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 20, evidence: { samples } },
    clientConfig: { score: 3 }
  };
  const mods = buildModuleScores_v11113(checks, 'zh');
  const raw = calcRaw(mods);
  const cap = checkCap(checks, raw);
  const final = cap.capEffective ? Math.min(raw, cap.capLimit) : raw;
  assertIn(final, 70, 72, 'finalScore');
  const u = mods.find(m => m.key === 'usageTransparency');
  const b = mods.find(m => m.key === 'coreCompatibility');
  const s = mods.find(m => m.key === 'stabilityLatency');
  const cl = mods.find(m => m.key === 'clientConfig');
  assertEq(u.score, 12, 'usage');
  assertEq(b.score, 23, 'basicCompat');
  assertEq(s.score, 22, 'stability');
  assertEq(cl.score, 5, 'clientConfig');
});

// Test 6: usage/model/cache/client unchanged by this round
test('Test 6: usage/model/cache/client unaffected by v1.11.13', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 23, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 20, evidence: { samples: [] } },
    clientConfig: { score: 3 }
  };
  const mods = buildModuleScores_v11113(checks, 'zh');
  assertEq(mods.find(m => m.key === 'usageTransparency').score, 12, 'usage unchanged');
  assertEq(mods.find(m => m.key === 'modelSignal').score, 7, 'model unchanged');
  assertEq(mods.find(m => m.key === 'cacheSignal').score, 2.5, 'cache unchanged');
  assertEq(mods.find(m => m.key === 'clientConfig').score, 5, 'client unchanged');
});

// Test 7: finalScore = rawModuleScore
test('Test 7: finalScore = rawModuleScore for normal case', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 10, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 },
    modelSignal: { score: 7 },
    stability: { score: 20 },
    clientConfig: { score: 3 }
  };
  const mods = buildModuleScores_v11113(checks, 'zh');
  const raw = calcRaw(mods);
  const cap = checkCap(checks, raw);
  const final = cap.capEffective ? Math.min(raw, cap.capLimit) : raw;
  assertEq(final, raw, 'finalScore should equal rawModuleScore');
});

// Test 8: No response_format_incompatible cap
test('Test 8: no response_format_incompatible for compatible response', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 10, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 },
    modelSignal: { score: 7 },
    stability: { score: 20 },
    clientConfig: { score: 3 }
  };
  const mods = buildModuleScores_v11113(checks, 'zh');
  const raw = calcRaw(mods);
  const cap = checkCap(checks, raw);
  if (cap.capReason === 'response_not_json') throw new Error('should not trigger response_format_incompatible');
});

// Test 9: targetCall failed → basicCompat stays low
test('Test 9: targetCall failed → basicCompat stays at raw score', () => {
  const checks = {
    targetCall: { ok: false, evidence: { httpStatus: 403, responseParsed: false } },
    basicCompatibility: { score: 5, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 },
    cacheHitCheck: { score: 0 },
    modelSignal: { score: 7 },
    stability: { score: 20 },
    clientConfig: { score: 5 }
  };
  const mods = buildModuleScores_v11113(checks, 'zh');
  const b = mods.find(m => m.key === 'coreCompatibility');
  assertEq(b.score, 5, 'basicCompat should stay at raw 5');
});

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
