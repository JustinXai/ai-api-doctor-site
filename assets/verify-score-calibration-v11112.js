/**
 * verify-score-calibration-v11112.js
 * Tests the v1.11.12 score calibration rules
 */
'use strict';

// ─── Mock environment ───────────────────────────────────────────
const mkCheck = (overrides) => ({
  id: 'test', label: { zh: '测试', en: 'Test' }, maxScore: 25, score: 0,
  status: 'excellent', summary: '', details: [], deductions: [], evidence: {},
  ...overrides
});

// ─── Inline buildModuleScores (copied from test.js v1.11.12) ─────
const safeObject = (obj) => obj || {};
const safeNum = (val, def) => (val != null && !isNaN(val) ? val : def);

function buildModuleScores_v11112(checks) {
  const sc = safeObject(checks);
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

  // ── usageTransparency (v1.11.12) ──
  const usageCheck = sc.costTransparency || {};
  const usageAuditCheck = sc.usageAudit || {};
  const rawUsageScore = safeNum(usageCheck.score, 0);
  const usageTimeout = !!(usageCheck.timeout || usageAuditCheck.timeout);
  const usageAuditHasUsage = !!(usageAuditCheck?.evidence?.usage && Object.keys(usageAuditCheck.evidence.usage).length > 0);
  const usageAuditEvidence = usageAuditCheck?.evidence?.usage || {};

  let usageScore = rawUsageScore;
  let usageReason = 'legacy';

  if (!realTargetCallSuccess) {
    usageScore = 0; usageReason = 'target_call_failed';
  } else if (!targetCallEvidence.hasUsage && !usageAuditHasUsage) {
    usageScore = 12; usageReason = 'target_call_success_usage_missing';
  } else {
    const hasPrompt = !!(usageAuditEvidence.prompt_tokens || usageAuditEvidence.input_tokens);
    const hasCompletion = !!(usageAuditEvidence.completion_tokens || usageAuditEvidence.output_tokens);
    const hasTotal = !!(usageAuditEvidence.total_tokens);
    const hasCacheDetails = !!(usageAuditEvidence.cached_tokens || usageAuditEvidence.prompt_tokens_details?.cached_tokens || usageAuditEvidence.cache_read);
    const usageFields = [hasPrompt, hasCompletion, hasTotal].filter(Boolean).length;
    if (hasCacheDetails) { usageScore = 25; usageReason = 'usage_complete_with_cache_details'; }
    else if (usageFields >= 3) { usageScore = 21; usageReason = 'usage_complete'; }
    else { usageScore = 16; usageReason = 'usage_partial'; }
  }

  // ── cacheHitCheck ──
  const cacheScore = safeNum(sc.cacheHitCheck?.score, 0);

  // ── modelSignal (unchanged) ──
  const modelCheck = sc.modelSignal || {};
  const modelEvidence = modelCheck?.evidence?.modelSignal || {};
  const selfClaimType = modelEvidence?.selfClaim?.type || 'unknown';
  const rawModelScore = safeNum(modelCheck.score, 0);
  const expectedScoreByType = {
    exact_match: 15, family_match: 11, platform_identity: 6,
    ambiguous: 7, wrong_family: 2, hard_contamination: 2,
    empty: 7, failed: 7, unknown: 7
  };
  let modelScore = rawModelScore;
  if (selfClaimType !== 'unknown' && selfClaimType !== 'exact_match' && selfClaimType !== 'family_match') {
    const expected = expectedScoreByType[selfClaimType] || 7;
    if (rawModelScore !== expected) modelScore = expected;
  }

  // ── stabilityLatency ──
  const stabilityScore = safeNum(sc.stability?.score, 0);

  // ── basicCompatibility (v1.11.12) ──
  const rawBasicScore = safeNum(sc.basicCompatibility?.score, 0);
  let basicScore = rawBasicScore;
  let basicReason = 'legacy';
  // v1.11.14: use responseParsed (HTTP+JSON success) not openAICompatible+hasContent
  if (realTargetCallSuccess) {
    if (targetCallEvidence.responseParsed) {
      if (rawBasicScore < 23) { basicScore = 23; basicReason = 'openai_compatible_response'; }
    } else if (rawBasicScore < 20) {
      basicScore = 20; basicReason = 'minor_compatibility_issues';
    }
  }

  // ── clientConfig (v1.11.12) ──
  const rawClientScore = safeNum(sc.clientConfig?.score, 0);
  let clientScore = rawClientScore;
  let clientReason = 'legacy';
  if (rawClientScore >= 3) { clientScore = 5; clientReason = 'full_config_exportable'; }
  else if (rawClientScore >= 2) { clientScore = 3; clientReason = 'partial_config'; }
  else if (rawClientScore >= 1) { clientScore = 2; clientReason = 'minimal_config'; }
  else { clientScore = 0; clientReason = 'no_config'; }

  return [
    { key: 'usageTransparency', score: usageScore, max: 25, reason: usageReason },
    { key: 'cacheSignal', score: cacheScore, max: 5, reason: 'legacy' },
    { key: 'modelSignal', score: modelScore, max: 15, reason: 'selfClaim_type=' + selfClaimType },
    { key: 'stabilityLatency', score: stabilityScore, max: 25, reason: 'legacy' },
    { key: 'coreCompatibility', score: basicScore, max: 25, reason: basicReason },
    { key: 'clientConfig', score: clientScore, max: 5, reason: clientReason }
  ];
}

function calcRawModuleScore(modules) {
  return Math.round(modules.reduce((sum, m) => sum + safeNum(m.score, 0), 0) * 10) / 10;
}

// ─── Test Runner ───────────────────────────────────────────────
let pass = 0, fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  PASS:', name);
    pass++;
  } catch (err) {
    console.error('  FAIL:', name);
    console.error('    ', err.message);
    fail++;
  }
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg}: expected ~${expected} (±${tolerance}), got ${actual}`);
  }
}

// Case 1: targetCall success + usage missing → 12/25
test('Case 1: targetCall success + usage missing → usage=12/25', () => {
  const checks = {
    targetCall: { ok: true, timeout: false, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    costTransparency: { score: 0 },
    usageAudit: { timeout: true },
    cacheHitCheck: { score: 0 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 22 },
    basicCompatibility: { score: 10 }
  };
  const mods = buildModuleScores_v11112(checks);
  const u = mods.find(m => m.key === 'usageTransparency');
  assertEq(u.score, 12, 'usage score');
  assertEq(u.reason, 'target_call_success_usage_missing', 'usage reason');
});

// Case 2: targetCall success + partial usage → 16/25
test('Case 2: targetCall success + partial usage → usage=16/25', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi', usage: { total_tokens: 100 } } },
    costTransparency: { score: 0 },
    usageAudit: { evidence: { usage: { total_tokens: 100 } } },
    cacheHitCheck: { score: 0 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 22 },
    basicCompatibility: { score: 10 }
  };
  const mods = buildModuleScores_v11112(checks);
  const u = mods.find(m => m.key === 'usageTransparency');
  assertEq(u.score, 16, 'usage score');
  assertEq(u.reason, 'usage_partial', 'usage reason');
});

// Case 3: targetCall success + complete usage → 21/25
test('Case 3: targetCall success + complete usage → usage=21/25', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi', usage: { prompt_tokens: 10, completion_tokens: 90, total_tokens: 100 } } },
    costTransparency: { score: 0 },
    usageAudit: { evidence: { usage: { prompt_tokens: 10, completion_tokens: 90, total_tokens: 100 } } },
    cacheHitCheck: { score: 0 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 22 },
    basicCompatibility: { score: 10 }
  };
  const mods = buildModuleScores_v11112(checks);
  const u = mods.find(m => m.key === 'usageTransparency');
  assertEq(u.score, 21, 'usage score');
  assertEq(u.reason, 'usage_complete', 'usage reason');
});

// Case 4: targetCall success + complete usage + cache details → 25/25
test('Case 4: complete usage + cache details → usage=25/25', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi', usage: { prompt_tokens: 10, completion_tokens: 90, total_tokens: 100 } } },
    costTransparency: { score: 0 },
    usageAudit: { evidence: { usage: { prompt_tokens: 10, completion_tokens: 90, total_tokens: 100, cached_tokens: 8 } } },
    cacheHitCheck: { score: 0 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 22 },
    basicCompatibility: { score: 10 }
  };
  const mods = buildModuleScores_v11112(checks);
  const u = mods.find(m => m.key === 'usageTransparency');
  assertEq(u.score, 25, 'usage score');
  assertEq(u.reason, 'usage_complete_with_cache_details', 'usage reason');
});

// Case 5: OpenAI-compatible targetCall → basicCompatibility >= 23/25
test('Case 5: openai compatible targetCall → basicCompat=23/25', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi', hasContent: true } },
    basicCompatibility: { score: 10 },
    costTransparency: { score: 0 },
    cacheHitCheck: { score: 0 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 22 },
    clientConfig: { score: 3 }
  };
  const mods = buildModuleScores_v11112(checks);
  const b = mods.find(m => m.key === 'coreCompatibility');
  assertEq(b.score, 23, 'basicCompat score');
  assertEq(b.reason, 'openai_compatible_response', 'basicCompat reason');
});

// Case 6: all success with slight fluctuation → stability=22
test('Case 6: all samples success → stability unchanged', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    costTransparency: { score: 0 },
    cacheHitCheck: { score: 0 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 22 },
    basicCompatibility: { score: 10 },
    clientConfig: { score: 3 }
  };
  const mods = buildModuleScores_v11112(checks);
  const s = mods.find(m => m.key === 'stabilityLatency');
  assertEq(s.score, 22, 'stability score');
});

// Case 7: full config → clientConfig=5/5
test('Case 7: full config (raw=3) → clientConfig=5/5', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    costTransparency: { score: 0 },
    cacheHitCheck: { score: 0 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 22 },
    basicCompatibility: { score: 10 },
    clientConfig: { score: 3 }
  };
  const mods = buildModuleScores_v11112(checks);
  const c = mods.find(m => m.key === 'clientConfig');
  assertEq(c.score, 5, 'clientConfig score');
  assertEq(c.reason, 'full_config_exportable', 'clientConfig reason');
});

// Case 7b: partial config → clientConfig=3/5
test('Case 7b: partial config (raw=2) → clientConfig=3/5', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    costTransparency: { score: 0 },
    cacheHitCheck: { score: 0 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 22 },
    basicCompatibility: { score: 10 },
    clientConfig: { score: 2 }
  };
  const mods = buildModuleScores_v11112(checks);
  const c = mods.find(m => m.key === 'clientConfig');
  assertEq(c.score, 3, 'clientConfig score');
});

// Case 8: golden case - usage=12, cache=2.5, model=7, stability=22, compat=23, client=5 → 71.5
test('Case 8: golden case → rawModuleScore=71.5, no cap', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    costTransparency: { score: 0 },
    usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 22 },
    basicCompatibility: { score: 10 },
    clientConfig: { score: 3 }
  };
  const mods = buildModuleScores_v11112(checks);
  const u = mods.find(m => m.key === 'usageTransparency');
  const c = mods.find(m => m.key === 'cacheSignal');
  const m = mods.find(m => m.key === 'modelSignal');
  const s = mods.find(m => m.key === 'stabilityLatency');
  const b = mods.find(m => m.key === 'coreCompatibility');
  const cl = mods.find(m => m.key === 'clientConfig');

  assertEq(u.score, 12, 'usage');
  assertEq(c.score, 2.5, 'cache');
  assertEq(m.score, 7, 'model');
  assertEq(s.score, 22, 'stability');
  assertEq(b.score, 23, 'basicCompat');
  assertEq(cl.score, 5, 'clientConfig');

  const raw = calcRawModuleScore(mods);
  assertEq(raw, 71.5, 'rawModuleScore');
});

// Case 9: targetCall failed → usage=0
test('Case 9: targetCall failed → usage=0/25', () => {
  const checks = {
    targetCall: { ok: false, evidence: { httpStatus: 403 } },
    costTransparency: { score: 10 },
    usageAudit: { evidence: { usage: { total_tokens: 100 } } },
    cacheHitCheck: { score: 0 },
    modelSignal: { score: 7 },
    stability: { score: 22 },
    basicCompatibility: { score: 10 }
  };
  const mods = buildModuleScores_v11112(checks);
  const u = mods.find(m => m.key === 'usageTransparency');
  assertEq(u.score, 0, 'usage score');
  assertEq(u.reason, 'target_call_failed', 'usage reason');
});

// Case 10: modelSignal wrong_family should stay low
test('Case 10: wrong_family → modelSignal=2, NOT raised', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    costTransparency: { score: 0 },
    cacheHitCheck: { score: 0 },
    modelSignal: { score: 5, evidence: { modelSignal: { selfClaim: { type: 'wrong_family' } } } },
    stability: { score: 22 },
    basicCompatibility: { score: 10 }
  };
  const mods = buildModuleScores_v11112(checks);
  const m = mods.find(m => m.key === 'modelSignal');
  assertEq(m.score, 2, 'modelSignal should be 2, not raised');
});

// Summary
console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
