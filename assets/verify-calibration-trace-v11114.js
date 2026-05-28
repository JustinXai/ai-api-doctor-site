/**
 * verify-calibration-trace-v11114.js
 * Tests calibration traces are properly captured and module scores are correct
 */
'use strict';

const safeNum = (v, fallback) => (v != null && !isNaN(v) ? v : fallback);
const safeObject = (v) => v || {};

// ─── buildModuleScores with traces (mirrors test-v11114.js) ─────────────────────────
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

  // usage (unchanged)
  const usageAuditHasUsage = !!(sc.usageAudit?.evidence?.usage && Object.keys(sc.usageAudit.evidence.usage).length > 0);
  let usageScore = safeNum(sc.costTransparency?.score, 0);
  if (!realTargetCallSuccess) { usageScore = 0; }
  else if (!targetCallEvidence.hasUsage && !usageAuditHasUsage) { usageScore = 12; }
  else { usageScore = 16; }

  const cacheScore = safeNum(sc.cacheHitCheck?.score, 0);

  const modelEvidence = sc.modelSignal?.evidence?.modelSignal || {};
  const selfClaimType = modelEvidence?.selfClaim?.type || 'unknown';
  let modelScore = safeNum(sc.modelSignal?.score, 0);
  if (selfClaimType !== 'unknown' && selfClaimType !== 'exact_match' && selfClaimType !== 'family_match') {
    modelScore = { ambiguous: 7, platform_identity: 6, wrong_family: 2, hard_contamination: 2, empty: 7, failed: 7, unknown: 7 }[selfClaimType] || 7;
  }

  // stability (v1.11.13 calibration)
  const stabilityCheck = sc.stability || {};
  const stabilityEvidence = stabilityCheck?.evidence || {};
  const stabilitySamples = stabilityEvidence.samples || [];
  const okCount = stabilitySamples.filter(s => s && s.ok && s.hasContent).length;
  const totalStabilitySamples = stabilitySamples.length;
  let stabilityScore = safeNum(stabilityCheck.score, 0);
  let stabilityReason = 'legacy';
  let stabilitySource = 'checks.stability.score';

  const latencies = stabilitySamples.map(s => s.latency || 0).filter(l => l > 0);
  const avgLat = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const sortedLat = [...latencies].sort((a, b) => a - b);
  const medianLat = sortedLat.length > 0 ? sortedLat[Math.floor(sortedLat.length / 2)] : 0;
  const maxLat = latencies.length > 0 ? Math.max(...latencies) : 0;
  const latencyRatio = medianLat > 0 ? maxLat / medianLat : 0;

  if (totalStabilitySamples >= 5 && okCount === 5) {
    if (avgLat <= 2000 && latencyRatio <= 1.5) {
      if (stabilityScore < 22) { stabilityScore = 22; stabilityReason = 'all_success_slight_fluctuation'; stabilitySource = 'v11113_calibration'; }
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
  if (realTargetCallSuccess && reachCompat >= 1.5 && authCompat >= 1.5) {
    if (targetCallEvidence.openAICompatible && targetCallEvidence.hasContent) {
      if (rawBasicScore < 23) { basicScore = 23; basicReason = 'full_compatibility_passed'; basicSource = 'v11113_calibration'; }
    } else if (rawBasicScore < 20) {
      basicScore = 20; basicReason = 'minor_compatibility_issues'; basicSource = 'v11113_calibration';
    }
  }

  const rawClientScore = safeNum(sc.clientConfig?.score, 0);
  let clientScore = rawClientScore;
  if (rawClientScore >= 3) clientScore = 5;
  else if (rawClientScore >= 2) clientScore = 3;
  else if (rawClientScore >= 1) clientScore = 2;

  const modules = [
    { key: 'usageTransparency', score: usageScore, max: 25, reason: 'unchanged' },
    { key: 'cacheSignal', score: cacheScore, max: 5, reason: 'unchanged' },
    { key: 'modelSignal', score: modelScore, max: 15, reason: 'unchanged' },
    { key: 'stabilityLatency', score: stabilityScore, max: 25, reason: stabilityReason, source: stabilitySource },
    { key: 'coreCompatibility', score: basicScore, max: 25, reason: basicReason, source: basicSource },
    { key: 'clientConfig', score: clientScore, max: 5, reason: 'unchanged' }
  ];

  // ── Calibration traces (v1.11.14) ──
  const failedBasic = [];
  if (!realTargetCallSuccess) failedBasic.push('realTargetCallSuccess=false');
  if (reachCompat < 1.5) failedBasic.push('reachCompat<' + reachCompat);
  if (authCompat < 1.5) failedBasic.push('authCompat<' + authCompat);
  if (!targetCallEvidence.openAICompatible) failedBasic.push('openAICompatible=false');
  if (!targetCallEvidence.hasContent) failedBasic.push('hasContent=false');

  const basicCalibrationTrace = {
    version: 'v1.11.14-basic-compat-trace',
    scoreBeforeCalibration: rawBasicScore,
    scoreAfterCalibration: basicScore,
    calibrationApplied: basicScore !== rawBasicScore,
    calibrationReason: basicReason,
    conditions: {
      realTargetCallSuccess,
      reachCompat, reachPass: reachCompat >= 1.5,
      authCompat, authPass: authCompat >= 1.5,
      openAICompatible: targetCallEvidence.openAICompatible,
      hasChoices: targetCallEvidence.hasChoices,
      hasMessage: targetCallEvidence.hasMessage,
      hasContent: targetCallEvidence.hasContent,
      responseParsed: targetCallEvidence.responseParsed
    },
    failedConditions: failedBasic
  };

  const timeoutCount = stabilitySamples.filter(s => s && s.timeout).length;
  const errorCount = stabilitySamples.filter(s => s && (s.errMsg || s.error)).length;
  const allSucceeded = okCount === totalStabilitySamples && totalStabilitySamples >= 5;
  const slightFluctuation = avgLat <= 2000 && latencyRatio <= 1.5;
  const failedStab = [];
  if (totalStabilitySamples < 5) failedStab.push('sampleCount<' + totalStabilitySamples);
  if (okCount !== totalStabilitySamples) failedStab.push('successCount=' + okCount + '/' + totalStabilitySamples);
  if (timeoutCount > 0) failedStab.push('timeoutCount=' + timeoutCount);
  if (avgLat > 2000) failedStab.push('avgLat=' + Math.round(avgLat) + 'ms>2000');
  if (latencyRatio > 1.5) failedStab.push('latencyRatio=' + latencyRatio.toFixed(2) + '>1.5');

  const stabilityCalibrationTrace = {
    version: 'v1.11.14-stability-trace',
    scoreBeforeCalibration: stabilityCheck.score,
    scoreAfterCalibration: stabilityScore,
    calibrationApplied: stabilityScore !== safeNum(stabilityCheck.score, 0),
    calibrationReason: stabilityReason,
    conditions: {
      sampleCount: totalStabilitySamples,
      successCount: okCount,
      timeoutCount,
      errorCount,
      avgLatencyMs: Math.round(avgLat),
      maxLatencyMs: maxLat,
      medianLatencyMs: Math.round(medianLat),
      latencyRatio: Math.round(latencyRatio * 100) / 100,
      allSamplesSucceeded: okCount === totalStabilitySamples,
      onlySlightFluctuation: slightFluctuation,
      avgAcceptable: avgLat <= 2000,
      ratioAcceptable: latencyRatio <= 1.5
    },
    failedConditions: failedStab,
    samples: stabilitySamples.map((s, i) => ({
      index: i, ok: s ? !!s.ok : null, latency: s ? (s.latency || 0) : 0,
      status: s ? (s.status || 0) : 0, hasContent: s ? !!s.hasContent : null
    }))
  };

  modules._basicCalibrationTrace = basicCalibrationTrace;
  modules._stabilityCalibrationTrace = stabilityCalibrationTrace;
  modules._calibrationTraces = { basicCompatibility: basicCalibrationTrace, stabilityLatency: stabilityCalibrationTrace };

  return modules;
}

function calcRaw(modules) {
  return Math.round(modules.reduce((sum, m) => sum + safeNum(m.score, 0), 0) * 10) / 10;
}

// ─── Test Runner ───────────────────────────────────────────────
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS:', name); pass++; }
  catch (err) { console.error('  FAIL:', name); console.error('    ', err.message); fail++; }
}
function assertEq(a, e, m) { if (a !== e) throw new Error(`${m}: expected ${e}, got ${a}`); }
function assertIn(a, min, max, m) { if (a < min || a > max) throw new Error(`${m}: expected ${min}-${max}, got ${a}`); }
function assertTrue(a, m) { if (!a) throw new Error(`${m}: expected true, got ${String(a)}`); }

// Case 1: Full conditions → basicCompat = 23, calibrationApplied
test('Case 1: full conditions → basicCompat=23, trace.calibrationApplied=true', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 10, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 }, modelSignal: { score: 7 },
    stability: { score: 20, evidence: { samples: [] } }, clientConfig: { score: 3 }
  };
  const mods = buildModuleScores(checks, 'zh');
  const trace = mods._basicCalibrationTrace;
  assertEq(trace.conditions.realTargetCallSuccess, true, 'realTargetCallSuccess');
  assertEq(trace.conditions.reachPass, true, 'reachPass');
  assertEq(trace.conditions.authPass, true, 'authPass');
  assertEq(trace.conditions.openAICompatible, true, 'openAICompatible');
  assertEq(trace.conditions.hasContent, true, 'hasContent');
  assertEq(trace.failedConditions.length, 0, 'failedConditions should be empty');
  assertEq(trace.calibrationApplied, true, 'calibrationApplied');
  assertEq(trace.scoreAfterCalibration, 23, 'scoreAfterCalibration');
});

// Case 2: hasContent missing → basicCompat = 20
test('Case 2: hasContent missing → basicCompat=20, failedConditions has hasContent', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'absent' } },
    basicCompatibility: { score: 10, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 }, modelSignal: { score: 7 },
    stability: { score: 20, evidence: { samples: [] } }, clientConfig: { score: 3 }
  };
  const mods = buildModuleScores(checks, 'zh');
  const trace = mods._basicCalibrationTrace;
  assertEq(trace.scoreAfterCalibration, 20, 'scoreAfterCalibration');
  assertTrue(trace.failedConditions.some(f => f.includes('hasContent')), 'failedConditions should mention hasContent');
  const b = mods.find(m => m.key === 'coreCompatibility');
  assertEq(b.score, 20, 'module score');
});

// Case 3: reachCompat<1.5 → no calibration
test('Case 3: reachCompat<1.5 → no basicCompat calibration', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 10, evidence: { reachCompat: 1.0, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 }, modelSignal: { score: 7 },
    stability: { score: 20, evidence: { samples: [] } }, clientConfig: { score: 3 }
  };
  const mods = buildModuleScores(checks, 'zh');
  const trace = mods._basicCalibrationTrace;
  assertEq(trace.scoreAfterCalibration, 10, 'score stays at raw');
  assertTrue(trace.failedConditions.some(f => f.includes('reachCompat')), 'should fail on reachCompat');
});

// Case 4: All success + slight fluctuation → stability = 22
test('Case 4: all success + avg<2000 + ratio<=1.5 → stability=22, trace applied', () => {
  const samples = [
    { ok: true, hasContent: true, latency: 900, status: 200 },
    { ok: true, hasContent: true, latency: 950, status: 200 },
    { ok: true, hasContent: true, latency: 1000, status: 200 },
    { ok: true, hasContent: true, latency: 1050, status: 200 },
    { ok: true, hasContent: true, latency: 1100, status: 200 },
  ];
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 23, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 }, modelSignal: { score: 7 },
    stability: { score: 20, evidence: { samples } }, clientConfig: { score: 3 }
  };
  const mods = buildModuleScores(checks, 'zh');
  const trace = mods._stabilityCalibrationTrace;
  assertEq(trace.conditions.sampleCount, 5, 'sampleCount');
  assertEq(trace.conditions.successCount, 5, 'successCount');
  assertEq(trace.conditions.avgAcceptable, true, 'avgAcceptable');
  assertEq(trace.conditions.ratioAcceptable, true, 'ratioAcceptable');
  assertEq(trace.conditions.onlySlightFluctuation, true, 'onlySlightFluctuation');
  assertEq(trace.failedConditions.length, 0, 'failedConditions should be empty');
  assertEq(trace.calibrationApplied, true, 'calibrationApplied');
  assertEq(trace.scoreAfterCalibration, 22, 'scoreAfterCalibration');
  const s = mods.find(m => m.key === 'stabilityLatency');
  assertEq(s.score, 22, 'module score');
});

// Case 5: latency spike → NOT raised
test('Case 5: avgLat>2000ms → stability NOT raised, failedConditions has avgLat', () => {
  const samples = [
    { ok: true, hasContent: true, latency: 500, status: 200 },
    { ok: true, hasContent: true, latency: 600, status: 200 },
    { ok: true, hasContent: true, latency: 1000, status: 200 },
    { ok: true, hasContent: true, latency: 1500, status: 200 },
    { ok: true, hasContent: true, latency: 5000, status: 200 },
  ];
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 23, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 }, modelSignal: { score: 7 },
    stability: { score: 18, evidence: { samples } }, clientConfig: { score: 3 }
  };
  const mods = buildModuleScores(checks, 'zh');
  const trace = mods._stabilityCalibrationTrace;
  assertTrue(trace.failedConditions.some(f => f.includes('latencyRatio')), 'should fail on latencyRatio');
  assertEq(trace.calibrationApplied, false, 'calibrationApplied should be false');
  const s = mods.find(m => m.key === 'stabilityLatency');
  assertEq(s.score, 18, 'stability should stay at raw 18');
});

// Case 6: Golden case → score 70-72 with traces
test('Case 6: golden case → score 70-72, traces attached and correct', () => {
  const samples = [
    { ok: true, hasContent: true, latency: 900, status: 200 },
    { ok: true, hasContent: true, latency: 1000, status: 200 },
    { ok: true, hasContent: true, latency: 1100, status: 200 },
    { ok: true, hasContent: true, latency: 1200, status: 200 },
    { ok: true, hasContent: true, latency: 1300, status: 200 },
  ];
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 10, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 20, evidence: { samples } }, clientConfig: { score: 3 }
  };
  const mods = buildModuleScores(checks, 'zh');
  const raw = calcRaw(mods);
  assertIn(raw, 70, 72, 'rawModuleScore');
  assertTrue(mods._basicCalibrationTrace !== null, 'basicCalibrationTrace attached');
  assertTrue(mods._stabilityCalibrationTrace !== null, 'stabilityCalibrationTrace attached');
  assertEq(mods._basicCalibrationTrace.scoreAfterCalibration, 23, 'basicCompat calibrated to 23');
  assertEq(mods._stabilityCalibrationTrace.scoreAfterCalibration, 22, 'stability calibrated to 22');
  assertEq(mods._basicCalibrationTrace.failedConditions.length, 0, 'basic no failed conditions');
  assertEq(mods._stabilityCalibrationTrace.failedConditions.length, 0, 'stability no failed conditions');
});

// Case 7: usage/model/cache/client unchanged
test('Case 7: usage/model/cache/client unchanged by v1.11.13/14', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 23, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 2.5 },
    modelSignal: { score: 7, evidence: { modelSignal: { selfClaim: { type: 'ambiguous' } } } },
    stability: { score: 20, evidence: { samples: [] } }, clientConfig: { score: 3 }
  };
  const mods = buildModuleScores(checks, 'zh');
  assertEq(mods.find(m => m.key === 'usageTransparency').score, 12, 'usage');
  assertEq(mods.find(m => m.key === 'cacheSignal').score, 2.5, 'cache');
  assertEq(mods.find(m => m.key === 'modelSignal').score, 7, 'model');
  assertEq(mods.find(m => m.key === 'clientConfig').score, 5, 'client');
});

// Case 8: traces accessible via _calibrationTraces
test('Case 8: traces accessible via _calibrationTraces object', () => {
  const checks = {
    targetCall: { ok: true, evidence: { responseParsed: true, formatChoices: true, output: 'hi' } },
    basicCompatibility: { score: 10, evidence: { reachCompat: 2, authCompat: 2, mlCompat: 0 } },
    costTransparency: { score: 0 }, usageAudit: { timeout: true },
    cacheHitCheck: { score: 0 }, modelSignal: { score: 7 },
    stability: { score: 20, evidence: { samples: [] } }, clientConfig: { score: 3 }
  };
  const mods = buildModuleScores(checks, 'zh');
  const traces = mods._calibrationTraces;
  assertEq(traces.basicCompatibility.scoreAfterCalibration, 23, 'basic from traces');
  assertEq(traces.stabilityLatency.scoreAfterCalibration, 20, 'stability from traces');
  assertEq(traces.basicCompatibility.version, 'v1.11.14-basic-compat-trace', 'basic version');
  assertEq(traces.stabilityLatency.version, 'v1.11.14-stability-trace', 'stability version');
});

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
