/**
 * verify-golden-cases-v11112.js
 * Golden case verification for v1.11.12 scoring rules
 * Logic matches buildModuleScores in test-v11112.js
 */
'use strict';

const safeNum = (v, fallback) => (v != null && !isNaN(v) ? v : fallback);
const safeObject = (v) => v || {};

// ─── buildModuleScores (inline, mirrors test-v11112.js exactly) ─────────────────
function buildModuleScores(checks, locale) {
  const sc = safeObject(checks);
  const zh = locale !== 'en';

  const targetCallEvidence = {
    attempted: !!(sc.targetCall),
    ok: sc.targetCall?.ok ?? null,
    httpStatus: sc.targetCall?.evidence?.httpStatus ?? null,
    timeout: !!(sc.targetCall?.timeout),
    fallbackUsed: !!(sc.targetCall?.fallback),
    responseParsed: !!(sc.targetCall?.evidence?.responseParsed),
    openAICompatible: !!(sc.targetCall?.evidence?.formatChoices || sc.targetCall?.evidence?.formatMessage),
    hasChoices: !!(sc.targetCall?.evidence?.formatChoices),
    hasMessage: !!(sc.targetCall?.evidence?.formatMessage),
    hasContent: !!(sc.targetCall?.evidence?.output && sc.targetCall.evidence.output !== 'absent'),
    hasUsage: !!(sc.targetCall?.evidence?.usage && Object.keys(sc.targetCall.evidence.usage).length > 0),
    evidenceSource: 'targetCall'
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

  // ── usageTransparency (v1.11.12 calibration) ──
  const usageCheck = sc.costTransparency || {};
  const usageAuditCheck = sc.usageAudit || {};
  const rawUsageScore = safeNum(usageCheck.score, 0);
  const usageTimeout = !!(usageCheck.timeout || usageAuditCheck.timeout);
  const usageAuditHasUsage = !!(usageAuditCheck?.evidence?.usage && Object.keys(usageAuditCheck.evidence.usage).length > 0);
  const usageAuditEvidence = usageAuditCheck?.evidence?.usage || {};

  let usageScore = rawUsageScore;
  let usageReason = 'legacy';
  let usageSource = 'checks.costTransparency.score';

  // A. targetCall failed → 0/25
  if (!realTargetCallSuccess) {
    usageScore = 0; usageReason = 'target_call_failed'; usageSource = 'v11112_calibration: target failed → 0';
  }
  // B. targetCall success + usage missing + timeout → 12/25
  else if (!targetCallEvidence.hasUsage && !usageAuditHasUsage) {
    usageScore = 12; usageReason = 'target_call_success_usage_missing'; usageSource = 'v11112_calibration: target success + usage missing → 12';
  }
  // C/D/E: has usage → tiered score
  else {
    const hasPrompt = !!(usageAuditEvidence.prompt_tokens || usageAuditEvidence.input_tokens);
    const hasCompletion = !!(usageAuditEvidence.completion_tokens || usageAuditEvidence.output_tokens);
    const hasTotal = !!(usageAuditEvidence.total_tokens);
    const hasCacheDetails = !!(usageAuditEvidence.cached_tokens || usageAuditEvidence.prompt_tokens_details?.cached_tokens || usageAuditEvidence.cache_read);
    const usageFields = [hasPrompt, hasCompletion, hasTotal].filter(Boolean).length;
    if (hasCacheDetails) { usageScore = 25; usageReason = 'usage_complete_with_cache_details'; usageSource = 'v11112_calibration: usage + cache details → 25'; }
    else if (usageFields >= 3) { usageScore = 21; usageReason = 'usage_complete'; usageSource = 'v11112_calibration: complete usage → 21'; }
    else { usageScore = 16; usageReason = 'usage_partial'; usageSource = 'v11112_calibration: partial usage → 16'; }
  }

  // ── cacheHitCheck ──
  const cacheScore = safeNum(sc.cacheHitCheck?.score, 0);

  // ── modelSignal (unchanged from v1.11.6) ──
  const modelCheck = sc.modelSignal || {};
  const modelEvidence = modelCheck?.evidence?.modelSignal || {};
  const selfClaimType = modelEvidence?.selfClaim?.type || 'unknown';
  const rawModelScore = safeNum(modelCheck.score, 0);
  const expectedScoreByType = {
    exact_match: 15, family_match: 11, platform_identity: 6,
    ambiguous: 7, wrong_family: 2, hard_contamination: 2, empty: 7, failed: 7, unknown: 7
  };
  let modelScore = rawModelScore;
  let modelSource = 'checks.modelSignal.score';
  if (selfClaimType !== 'unknown' && selfClaimType !== 'exact_match' && selfClaimType !== 'family_match') {
    const expected = expectedScoreByType[selfClaimType] || 7;
    modelScore = expected;
    modelSource = `v11112_calibration: ${selfClaimType} → ${expected}`;
  }

  // ── stabilityLatency ──
  const stabilityScore = safeNum(sc.stability?.score, 0);

  // ── basicCompatibility (v1.11.12 calibration) ──
  const rawBasicScore = safeNum(sc.basicCompatibility?.score, 0);
  let basicScore = rawBasicScore;
  let basicReason = 'legacy';
  let basicSource = 'checks.basicCompatibility.score';
  if (realTargetCallSuccess) {
    if (targetCallEvidence.openAICompatible && targetCallEvidence.hasContent) {
      if (rawBasicScore < 23) { basicScore = 23; basicReason = 'openai_compatible_response'; basicSource = 'v11112_calibration: openai compatible → 23'; }
    } else if (rawBasicScore < 20) {
      basicScore = 20; basicReason = 'minor_compatibility_issues'; basicSource = 'v11112_calibration: minor issues → 20';
    }
  }

  // ── clientConfig (v1.11.12 calibration) ──
  const rawClientScore = safeNum(sc.clientConfig?.score, 0);
  let clientScore = rawClientScore;
  let clientSource = 'checks.clientConfig.score';
  if (rawClientScore >= 3) { clientScore = 5; clientSource = 'v11112_calibration: raw 3 → 5'; }
  else if (rawClientScore >= 2) { clientScore = 3; clientSource = 'v11112_calibration: raw 2 → 3'; }
  else if (rawClientScore >= 1) { clientScore = 2; clientSource = 'v11112_calibration: raw 1 → 2'; }
  else { clientScore = 0; clientSource = 'v11112_calibration: raw 0 → 0'; }

  return [
    { key: 'usageTransparency', score: usageScore, max: 25, reason: usageReason, source: usageSource },
    { key: 'cacheSignal', score: cacheScore, max: 5, reason: 'legacy' },
    { key: 'modelSignal', score: modelScore, max: 15, reason: 'selfClaim_type=' + selfClaimType },
    { key: 'stabilityLatency', score: stabilityScore, max: 25, reason: 'legacy' },
    { key: 'coreCompatibility', score: basicScore, max: 25, reason: basicReason, source: basicSource },
    { key: 'clientConfig', score: clientScore, max: 5, reason: 'full_config_exportable' }
  ];
}

function calcRawModuleScore(modules) {
  return Math.round(modules.reduce((sum, m) => sum + safeNum(m.score, 0), 0) * 10) / 10;
}

// Cap check (mirrors applyFatalCapsToRaw — uses safeNum pattern from test.js)
function checkCap(checks, rawModuleScore) {
  // Use safeNum pattern: undefined fields don't trigger caps (unlike || 0)
  const rawBasicScore = checks.basicCompatibility?.score;
  const targetResponseParsed = checks.targetCall?.evidence?.responseParsed === true;
  const targetHttpStatus = checks.targetCall?.evidence?.httpStatus ?? null;
  if (rawBasicScore < 20 && !targetResponseParsed && targetHttpStatus === 200)
    return { capEffective: rawModuleScore > 45, capReason: 'response_not_json', capLimit: 45 };
  // reachability check: only triggers if explicitly set < 3 (undefined does NOT trigger)
  if (checks.reachability?.score < 3)
    return { capEffective: rawModuleScore > 25, capReason: 'reachability_failed', capLimit: 25 };
  if (checks.auth?.evidence?.modelsStatus === 401 || checks.auth?.evidence?.chatStatus === 401)
    return { capEffective: rawModuleScore > 35, capReason: 'auth_401', capLimit: 35 };
  if (checks.targetCall?.evidence?.httpStatus === 403)
    return { capEffective: rawModuleScore > 45, capReason: 'target_call_403', capLimit: 45 };
  if (checks.targetCall?.evidence?.httpStatus === 404)
    return { capEffective: rawModuleScore > 50, capReason: 'model_not_found', capLimit: 50 };
  const samples = checks.stability?.evidence?.samples || [];
  const totalSamples = samples.length;
  const successSamples = samples.filter(s => s.ok && s.hasContent).length;
  const successRate = totalSamples > 0 ? successSamples / totalSamples : 0;
  if (totalSamples >= 5 && successRate <= 0.4)
    return { capEffective: rawModuleScore > 60, capReason: 'stability_failed', capLimit: 60 };
  return { capEffective: false, capReason: null, capLimit: null };
}

// ─── Test Runner ───────────────────────────────────────────────
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS:', name); pass++; }
  catch (err) { console.error('  FAIL:', name); console.error('    ', err.message); fail++; }
}
function assertIn(actual, min, max, msg) {
  if (actual < min || actual > max) throw new Error(`${msg}: expected ${min}-${max}, got ${actual}`);
}
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`);
}

// Case A: golden case
test('Case A: golden case → usage=12, compat=23, client=5, score=71.5', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 22 }, basicCompatibility: { score: 10 }, clientConfig: { score: 3 }
  };
  const mods = buildModuleScores(checks, 'zh');
  const raw = calcRawModuleScore(mods);
  const cap = checkCap(checks, raw);
  assertEq(raw, 71.5, 'rawModuleScore');
  assertEq(mods.find(m => m.key === 'usageTransparency').score, 12, 'usage');
  assertEq(mods.find(m => m.key === 'coreCompatibility').score, 23, 'basicCompat');
  assertEq(mods.find(m => m.key === 'clientConfig').score, 5, 'clientConfig');
  if (cap.capEffective) throw new Error('capEffectiv should be false');
});

// Case B: auth 401
test('Case B: auth 401 → cap applies', () => {
  const checks = {
    targetCall: { ok: false, evidence: { httpStatus: 401 } },
    auth: { evidence: { modelsStatus: 401, chatStatus: 401 } },
    reachability: { score: 20 }, costTransparency: { score: 20 },
    usageAudit: { evidence: { usage: { total_tokens: 100 } } },
    cacheHitCheck: { score: 5 }, modelSignal: { score: 15 },
    stability: { score: 25 }, basicCompatibility: { score: 25 }, clientConfig: { score: 5 }
  };
  const mods = buildModuleScores(checks, 'zh');
  const raw = calcRawModuleScore(mods);
  const cap = checkCap(checks, raw);
  if (!cap.capEffective) throw new Error('cap should apply');
});

// Case C: truly incompatible response
test('Case C: non-JSON response + low compat → cap applies', () => {
  const checks = {
    targetCall: { ok: true, evidence: { httpStatus: 200, responseParsed: false, output: '<html>garbage</html>' } },
    costTransparency: { score: 20 }, cacheHitCheck: { score: 5 },
    modelSignal: { score: 15 }, stability: { score: 25 },
    basicCompatibility: { score: 5 }, clientConfig: { score: 5 }
  };
  const mods = buildModuleScores(checks, 'zh');
  const raw = calcRawModuleScore(mods);
  const cap = checkCap(checks, raw);
  if (!cap.capEffective) throw new Error('cap should apply');
});

// Case D: wrong_family stays low
test('Case D: wrong_family → modelSignal=2', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    costTransparency: { score: 0 }, usageAudit: { evidence: { usage: { prompt_tokens: 10, completion_tokens: 90, total_tokens: 100 } } },
    cacheHitCheck: { score: 5 },
    modelSignal: { score: 10, evidence: { modelSignal: { selfClaim: { type: 'wrong_family' } } } },
    stability: { score: 25 }, basicCompatibility: { score: 23 }, clientConfig: { score: 5 }
  };
  const mods = buildModuleScores(checks, 'zh');
  assertEq(mods.find(m => m.key === 'modelSignal').score, 2, 'modelSignal');
});

// Case E: complete usage + family_match + stable
test('Case E: complete usage + family_match + stable → score >= 80', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi', usage: { prompt_tokens: 10, completion_tokens: 90, total_tokens: 100 } } },
    costTransparency: { score: 0 }, usageAudit: { evidence: { usage: { prompt_tokens: 10, completion_tokens: 90, total_tokens: 100 } } },
    cacheHitCheck: { score: 5 },
    modelSignal: { score: 11, evidence: { modelSignal: { selfClaim: { type: 'family_match' } } } },
    stability: { score: 25 }, basicCompatibility: { score: 23 }, clientConfig: { score: 5 }
  };
  const mods = buildModuleScores(checks, 'zh');
  const raw = calcRawModuleScore(mods);
  const cap = checkCap(checks, raw);
  if (cap.capEffective) throw new Error('no cap should apply');
  assertIn(raw, 80, 100, 'score');
});

// Case F: targetCall failed → usage=0
test('Case F: targetCall failed → usage=0, basicCompat stays raw', () => {
  const checks = {
    targetCall: { ok: false, evidence: { httpStatus: 403, responseParsed: false, output: 'forbidden' } },
    costTransparency: { score: 20 }, usageAudit: { evidence: { usage: { total_tokens: 100 } } },
    cacheHitCheck: { score: 5 }, modelSignal: { score: 15 },
    stability: { score: 25 }, basicCompatibility: { score: 5 }, clientConfig: { score: 5 }
  };
  const mods = buildModuleScores(checks, 'zh');
  assertEq(mods.find(m => m.key === 'usageTransparency').score, 0, 'usage');
  assertEq(mods.find(m => m.key === 'coreCompatibility').score, 5, 'basicCompat');
});

// Case G: partial usage → 16/25
test('Case G: partial usage → usage=16/25', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    costTransparency: { score: 0 }, usageAudit: { evidence: { usage: { total_tokens: 100 } } },
    cacheHitCheck: { score: 0 }, modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 22 }, basicCompatibility: { score: 10 }, clientConfig: { score: 3 }
  };
  const mods = buildModuleScores(checks, 'zh');
  assertEq(mods.find(m => m.key === 'usageTransparency').score, 16, 'usage');
});

// Case H: cache details → 25/25
test('Case H: cache details → usage=25/25', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    costTransparency: { score: 0 }, usageAudit: { evidence: { usage: { prompt_tokens: 10, completion_tokens: 90, total_tokens: 100, cached_tokens: 8 } } },
    cacheHitCheck: { score: 0 }, modelSignal: { score: 7 },
    stability: { score: 22 }, basicCompatibility: { score: 10 }, clientConfig: { score: 3 }
  };
  const mods = buildModuleScores(checks, 'zh');
  assertEq(mods.find(m => m.key === 'usageTransparency').score, 25, 'usage');
});

// Summary
console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
