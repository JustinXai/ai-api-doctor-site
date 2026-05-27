/**
 * dump-real-score-path-v1116.js
 * Dumps the actual score path for the current case
 */
const fs = require('fs');
const path = require('path');

console.log('=== v1.11.6 Score Path Dump ===\n');
console.log('This script shows the score path for a typical case.\n');

// Simulate the buildModuleScores function logic
function simulateBuildModuleScores(checks) {
  const results = [];

  // Build targetCallEvidence
  const targetCallEvidence = {
    attempted: !!(checks.targetCall),
    ok: checks.targetCall?.ok ?? null,
    httpStatus: checks.targetCall?.evidence?.httpStatus ?? null,
    timeout: !!(checks.targetCall?.timeout),
    fallbackUsed: !!(checks.targetCall?.fallback),
    responseParsed: !!(checks.targetCall?.evidence?.responseParsed),
    openAICompatible: !!(checks.targetCall?.evidence?.formatChoices || checks.targetCall?.evidence?.formatMessage),
    hasChoices: !!(checks.targetCall?.evidence?.formatChoices),
    hasMessage: !!(checks.targetCall?.evidence?.formatMessage),
    hasContent: !!(checks.targetCall?.evidence?.output && checks.targetCall.evidence.output !== 'absent'),
    hasUsage: !!(checks.targetCall?.evidence?.usage && Object.keys(checks.targetCall.evidence.usage).length > 0),
    evidenceSource: 'targetCall'
  };

  // Real targetCall success
  const realTargetCallSuccess = targetCallEvidence.ok === true &&
    targetCallEvidence.timeout !== true &&
    targetCallEvidence.fallbackUsed !== true;

  results.push('targetCallEvidence:');
  results.push(`  attempted: ${targetCallEvidence.attempted}`);
  results.push(`  ok: ${targetCallEvidence.ok}`);
  results.push(`  httpStatus: ${targetCallEvidence.httpStatus}`);
  results.push(`  timeout: ${targetCallEvidence.timeout}`);
  results.push(`  fallbackUsed: ${targetCallEvidence.fallbackUsed}`);
  results.push(`  responseParsed: ${targetCallEvidence.responseParsed}`);
  results.push(`  openAICompatible: ${targetCallEvidence.openAICompatible}`);
  results.push(`  hasUsage: ${targetCallEvidence.hasUsage}`);
  results.push(`  realTargetCallSuccess: ${realTargetCallSuccess}`);
  results.push('');

  // Usage
  const rawUsageScore = checks.costTransparency?.score ?? 0;
  const usageAuditHasUsage = !!(checks.usageAudit?.evidence?.usage && Object.keys(checks.usageAudit.evidence.usage).length > 0);
  let usageScore = rawUsageScore;
  let usageReason = 'legacy';
  let usageSource = 'checks.costTransparency.score';

  if (realTargetCallSuccess && !targetCallEvidence.hasUsage && !usageAuditHasUsage) {
    usageScore = Math.max(usageScore, 8);
    usageReason = 'target_call_success_usage_missing';
    usageSource = 'v1116_calibration: target success + usage missing → 8';
  }

  if (realTargetCallSuccess && targetCallEvidence.hasUsage) {
    usageScore = Math.max(usageScore, 14);
    usageReason = 'target_call_has_usage';
    usageSource = 'v1116_calibration: target has usage → use score';
  }

  results.push('usageTransparency:');
  results.push(`  raw: ${rawUsageScore}/25`);
  results.push(`  calibrated: ${usageScore}/25`);
  results.push(`  source: ${usageSource}`);
  results.push(`  reason: ${usageReason}`);
  results.push('');

  // ModelSignal
  const selfClaimType = checks.modelSignal?.evidence?.modelSignal?.selfClaim?.type || 'unknown';
  const rawModelScore = checks.modelSignal?.score ?? 0;
  const expectedScoreByType = {
    exact_match: 15,
    family_match: 11,
    platform_identity: 6,
    ambiguous: 7,
    wrong_family: 2,
    hard_contamination: 2,
    empty: 7,
    failed: 7,
    unknown: 7
  };

  let modelScore = rawModelScore;
  let modelReason = 'legacy';
  let modelSource = 'checks.modelSignal.score';

  if (selfClaimType !== 'unknown' && selfClaimType !== 'exact_match' && selfClaimType !== 'family_match') {
    const expectedScore = expectedScoreByType[selfClaimType] || 7;
    if (rawModelScore !== expectedScore) {
      modelScore = expectedScore;
      modelReason = `selfClaim_type=${selfClaimType}`;
      modelSource = `v1116_calibration: ${selfClaimType} → ${expectedScore}`;
    }
  }

  results.push('modelSignal:');
  results.push(`  selfClaimType: ${selfClaimType}`);
  results.push(`  raw: ${rawModelScore}/15`);
  results.push(`  calibrated: ${modelScore}/15`);
  results.push(`  source: ${modelSource}`);
  results.push(`  reason: ${modelReason}`);
  results.push('');

  // CoreCompatibility
  const rawBasicScore = checks.basicCompatibility?.score ?? 0;
  let basicScore = rawBasicScore;
  let basicReason = 'legacy';
  let basicSource = 'checks.basicCompatibility.score';

  if (realTargetCallSuccess) {
    if (rawBasicScore < 20) {
      basicScore = Math.max(rawBasicScore, 20);
      basicReason = 'target_call_real_success';
      basicSource = 'v1116_calibration: target success → min 20';
    }
  }

  results.push('coreCompatibility:');
  results.push(`  raw: ${rawBasicScore}/25`);
  results.push(`  calibrated: ${basicScore}/25`);
  results.push(`  source: ${basicSource}`);
  results.push(`  reason: ${basicReason}`);
  results.push('');

  // Calculate rawModuleScore
  const rawModuleScore = rawUsageScore + (checks.cacheHitCheck?.score ?? 0) + rawModelScore + (checks.stability?.score ?? 0) + rawBasicScore + (checks.clientConfig?.score ?? 0);
  const calibratedModuleScore = usageScore + (checks.cacheHitCheck?.score ?? 0) + modelScore + (checks.stability?.score ?? 0) + basicScore + (checks.clientConfig?.score ?? 0);

  results.push('Score Summary:');
  results.push(`  raw rawModuleScore: ${rawModuleScore}`);
  results.push(`  calibrated rawModuleScore: ${calibratedModuleScore}`);
  results.push(`  improvement: +${(calibratedModuleScore - rawModuleScore).toFixed(1)}`);

  return results.join('\n');
}

// Test case 1: aizhongzhuan.com case (usage missing, ambiguous model)
console.log('=== Test Case 1: aizhongzhuan.com (usage missing, ambiguous) ===\n');
const case1 = {
  targetCall: {
    ok: true,
    evidence: {
      httpStatus: 200,
      responseParsed: true,
      formatChoices: true,
      formatMessage: true,
      output: 'some response',
      usage: null // Usage missing
    }
  },
  costTransparency: { score: 4 },
  cacheHitCheck: { score: 2.5 },
  modelSignal: {
    score: 2,
    evidence: {
      modelSignal: {
        selfClaim: { type: 'ambiguous' }
      }
    }
  },
  stability: { score: 20 },
  basicCompatibility: { score: 5.6 },
  clientConfig: { score: 3 }
};
console.log(simulateBuildModuleScores(case1));

console.log('\n\n=== Test Case 2: Target call timeout fallback ===\n');
const case2 = {
  targetCall: {
    ok: true, // Fallback returns ok=true
    timeout: true,
    fallback: true,
    evidence: {
      httpStatus: 200,
      responseParsed: true,
      formatChoices: true,
      formatMessage: true,
      usage: null
    }
  },
  costTransparency: { score: 4 },
  cacheHitCheck: { score: 2.5 },
  modelSignal: {
    score: 7,
    evidence: {
      modelSignal: {
        selfClaim: { type: 'ambiguous' }
      }
    }
  },
  stability: { score: 20 },
  basicCompatibility: { score: 5.6 },
  clientConfig: { score: 3 }
};
console.log(simulateBuildModuleScores(case2));

console.log('\n\n=== Test Case 3: Target call success + usage complete ===\n');
const case3 = {
  targetCall: {
    ok: true,
    evidence: {
      httpStatus: 200,
      responseParsed: true,
      formatChoices: true,
      formatMessage: true,
      output: 'some response',
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      }
    }
  },
  costTransparency: { score: 21 },
  cacheHitCheck: { score: 2.5 },
  modelSignal: {
    score: 15,
    evidence: {
      modelSignal: {
        selfClaim: { type: 'exact_match' }
      }
    }
  },
  stability: { score: 20 },
  basicCompatibility: { score: 5.6 }, // Even if raw is low, should be calibrated
  clientConfig: { score: 3 }
};
console.log(simulateBuildModuleScores(case3));
