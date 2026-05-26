/**
 * diagnose-score-regression-v1114.js
 * Score regression diagnosis script - analyzes why scores dropped from 84 to current
 * 
 * This script helps diagnose score regressions by examining:
 * 1. Score breakdown components
 * 2. Timeout/fallback conditions
 * 3. Cap application logic
 * 4. Evidence sources
 * 
 * Usage: node diagnose-score-regression-v1114.js
 */

const fs = require('fs');
const path = require('path');

// Timeout constants
const TIMEOUT_CONSTANTS = {
  GLOBAL_TIMEOUT_MS: 150000,
  TARGET_CALL_TIMEOUT_MS: 20000,
  USAGE_AUDIT_TIMEOUT_MS: 20000,
  CACHE_PROBE_TIMEOUT_MS: 15000,
  CACHE_PROBE_TOTAL_TIMEOUT_MS: 35000,
  MODEL_SIGNAL_TIMEOUT_MS: 30000,
  STABILITY_TIMEOUT_MS: 45000,
  PUBLIC_SIGNALS_TIMEOUT_MS: 6000,
  JSON_READ_TIMEOUT_MS: 8000
};

// Risk calculation
function getRiskByRatio(score, max) {
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return 'unknown';
  const ratio = score / max;
  if (ratio >= 0.8) return 'low';
  if (ratio >= 0.5) return 'medium';
  return 'high';
}

function getRiskLabel(risk) {
  const labels = { low: '低风险', medium: '中风险', high: '高风险', unknown: '未验证' };
  return labels[risk] || '未验证';
}

// Diagnosis function
function diagnoseScore(mockResult) {
  const output = [];
  const divider = '═'.repeat(60);
  
  output.push('\n' + divider);
  output.push('  API DOCTOR SCORE REGRESSION DIAGNOSIS v1.11.4');
  output.push(divider);
  
  // 1. Raw and Final Scores
  output.push('\n[1] SCORE OVERVIEW');
  output.push(`  rawModuleScore: ${mockResult.rawModuleScore || 'N/A'}`);
  output.push(`  finalScore: ${mockResult.finalScore || 'N/A'}`);
  output.push(`  capDetected: ${mockResult.capDetected || false}`);
  output.push(`  capEffective: ${mockResult.capEffective || false}`);
  output.push(`  capReason: ${mockResult.capReason || 'none'}`);
  output.push(`  capLimit: ${mockResult.capLimit || 'N/A'}`);
  
  // 2. Module Scores
  output.push('\n[2] MODULE SCORES');
  const moduleScores = mockResult.moduleScores || {};
  const moduleKeys = ['usageTransparency', 'cacheSignal', 'modelSignal', 'stabilityLatency', 'coreCompatibility', 'clientConfig'];
  const moduleMax = { usageTransparency: 25, cacheSignal: 5, modelSignal: 15, stabilityLatency: 25, coreCompatibility: 25, clientConfig: 5 };
  
  moduleKeys.forEach(key => {
    const score = moduleScores[key] ?? 'N/A';
    const max = moduleMax[key];
    const ratio = typeof score === 'number' ? (score / max * 100).toFixed(1) + '%' : 'N/A';
    const risk = typeof score === 'number' ? getRiskByRatio(score, max) : 'unknown';
    output.push(`  ${key}: ${score}/${max} (${ratio}) → ${getRiskLabel(risk)}`);
  });
  
  // 3. Step Diagnostics
  output.push('\n[3] STEP DIAGNOSTICS');
  const stepDiag = mockResult.stepDiagnostics || {};
  
  Object.entries(stepDiag).forEach(([step, info]) => {
    const timeout = info.timeout ? '⏱ TIMEOUT' : '';
    const ok = info.ok === true ? '✓' : (info.ok === false ? '✗' : '?');
    output.push(`  ${step}: ${ok} ${timeout} | status=${info.status || 'N/A'} | duration=${info.durationMs || 'N/A'}ms`);
    if (info.evidenceSource && info.evidenceSource !== 'none') {
      output.push(`    evidenceSource: ${info.evidenceSource}`);
    }
    if (info.error) {
      output.push(`    error: ${info.error}`);
    }
  });
  
  // 4. Timeout Analysis
  output.push('\n[4] TIMEOUT ANALYSIS');
  let hasTimeout = false;
  Object.entries(stepDiag).forEach(([step, info]) => {
    if (info.timeout) {
      hasTimeout = true;
      output.push(`  ⏱ ${step} TIMED OUT`);
    }
  });
  if (!hasTimeout) {
    output.push('  ✓ No step timeouts detected');
  }
  
  // 5. Fallback Analysis
  output.push('\n[5] FALLBACK ANALYSIS');
  let hasFallback = false;
  Object.entries(stepDiag).forEach(([step, info]) => {
    if (info.fallbackUsed) {
      hasFallback = true;
      output.push(`  ⚠ ${step} used fallback`);
    }
  });
  if (!hasFallback) {
    output.push('  ✓ No fallbacks detected');
  }
  
  // 6. Cap Effectiveness Analysis
  output.push('\n[6] CAP EFFECTIVENESS');
  if (mockResult.capDetected) {
    output.push(`  capDetected: true (reason: ${mockResult.capReason})`);
    output.push(`  capEffective: ${mockResult.capEffective}`);
    output.push(`  capLimit: ${mockResult.capLimit}`);
    if (!mockResult.capEffective && mockResult.rawModuleScore < mockResult.capLimit) {
      output.push(`  ⚠ Cap detected but NOT effective: raw(${mockResult.rawModuleScore}) < capLimit(${mockResult.capLimit})`);
    }
    if (mockResult.capEffective) {
      output.push(`  ✓ Cap effective: finalScore=${mockResult.finalScore} (capped from ${mockResult.rawModuleScore})`);
    }
  } else {
    output.push('  ✓ No cap detected');
  }
  
  // 7. Module-specific diagnosis
  output.push('\n[7] MODULE-SPECIFIC ANALYSIS');
  
  // usageTransparency
  const usageScore = moduleScores.usageTransparency;
  if (usageScore === 0) {
    output.push('  ⚠ usageTransparency = 0/25');
    const diag = stepDiag.usageTransparency || stepDiag.targetCall;
    if (diag?.timeout) {
      output.push('    → Cause: target call or usage audit timed out');
    } else if (!diag?.hasUsage) {
      output.push('    → Cause: usage field missing from response');
    }
    output.push('    → Check: Is targetCall.httpStatus === 200?');
    output.push('    → Check: Is targetCall.usage present?');
    output.push('    → Recommendation: If targetCall succeeded, usage=0 is incorrect');
  }
  
  // modelSignal
  const modelScore = moduleScores.modelSignal;
  if (modelScore !== null && modelScore < 7) {
    output.push(`  ⚠ modelSignal = ${modelScore}/15 (${(modelScore/15*100).toFixed(1)}%)`);
    const selfClaimType = stepDiag.modelSignal?.selfClaimType || 'unknown';
    output.push(`    → selfClaimType: ${selfClaimType}`);
    if (selfClaimType === 'ambiguous' || selfClaimType === 'unknown') {
      output.push('    → Cause: Model unable/unwilling to confirm identity');
      output.push('    → Check: Is this a refusal or genuine unknown?');
      output.push('    → Recommendation: unable_to_confirm should not cause severe penalty');
    } else if (selfClaimType === 'wrong_family' || selfClaimType === 'hard_contamination') {
      output.push('    → Cause: Identity mismatch or contamination detected');
      output.push('    → This is a valid low score reason');
    }
  }
  
  // coreCompatibility
  const compatScore = moduleScores.coreCompatibility;
  if (compatScore !== null && compatScore < 15) {
    output.push(`  ⚠ coreCompatibility = ${compatScore}/25 (${(compatScore/25*100).toFixed(1)}%)`);
    const diag = stepDiag.coreCompatibility || stepDiag.targetCall;
    if (diag?.timeout) {
      output.push('    → Cause: Target call timed out during compatibility check');
    } else if (!diag?.responseParsed) {
      output.push('    → Cause: Response not JSON parseable');
    }
    output.push('    → Check: Is basicCompatibility >= 10?');
    output.push('    → Check: Is capReason = response_format_incompatible?');
  }
  
  // 8. Regression Analysis
  output.push('\n[8] REGRESSION ANALYSIS');
  const previousScore = 84; // Historical high
  const currentScore = mockResult.finalScore || mockResult.rawModuleScore || 0;
  const drop = previousScore - currentScore;
  if (drop > 10) {
    output.push(`  ⚠ Score dropped ${drop} points (${previousScore} → ${currentScore})`);
    output.push('');
    output.push('  Possible causes:');
    output.push('  1. Cap applied: Check capReason and capEffective');
    output.push('  2. Module scores decreased: Check each module above');
    output.push('  3. Timeout: Check if any critical step timed out');
    output.push('  4. Fallback: Check if fallback was used incorrectly');
    output.push('  5. Evidence source: Check if auxiliary failures = core failures');
  } else {
    output.push(`  ✓ Score change is within normal range (${drop} points)`);
  }
  
  // 9. Timeout Constants Reference
  output.push('\n[9] TIMEOUT CONSTANTS (Reference)');
  Object.entries(TIMEOUT_CONSTANTS).forEach(([key, value]) => {
    output.push(`  ${key}: ${value}ms (${(value/1000).toFixed(0)}s)`);
  });
  
  output.push('\n' + divider);
  output.push('  DIAGNOSIS COMPLETE');
  output.push(divider + '\n');
  
  return output.join('\n');
}

// Simulate a mock result for testing
const mockResult = {
  rawModuleScore: 33.1,
  finalScore: 33.1,
  capDetected: true,
  capEffective: false,
  capReason: 'response_format_incompatible',
  capLimit: 35,
  moduleScores: {
    usageTransparency: 0,
    cacheSignal: 2.5,
    modelSignal: 2,
    stabilityLatency: 20,
    coreCompatibility: 5.6,
    clientConfig: 3
  },
  stepDiagnostics: {
    reachability: { ok: true, status: 'ok', durationMs: 1200, timeout: false, fallbackUsed: false, evidenceSource: 'probe', error: null },
    auth: { ok: true, status: 'ok', durationMs: 2500, timeout: false, fallbackUsed: false, evidenceSource: 'probe', error: null },
    targetCall: { ok: true, status: 'ok', durationMs: 8500, timeout: false, fallbackUsed: false, evidenceSource: 'probe', error: null, httpStatus: 200, responseParsed: true, hasUsage: false },
    usageTransparency: { ok: false, status: 'timeout', durationMs: null, timeout: true, fallbackUsed: false, evidenceSource: 'none', error: 'timeout' },
    cacheHitCheck: { ok: true, status: 'ok', durationMs: 15000, timeout: false, fallbackUsed: false, evidenceSource: 'probe', error: null, cacheHitRate: 0.1 },
    modelSignal: { ok: true, status: 'ok', durationMs: 22000, timeout: false, fallbackUsed: false, evidenceSource: 'selfClaim', error: null, selfClaimType: 'ambiguous' },
    stability: { ok: true, status: 'ok', durationMs: 35000, timeout: false, fallbackUsed: false, evidenceSource: 'samples', error: null, successRate: 0.8 },
    basicCompatibility: { ok: true, status: 'ok', durationMs: null, timeout: false, fallbackUsed: false, evidenceSource: 'probe', error: null },
    clientConfig: { ok: true, status: 'ok', durationMs: null, timeout: false, fallbackUsed: false, evidenceSource: 'default', error: null }
  }
};

// Run diagnosis
console.log(diagnoseScore(mockResult));

// Export for use
module.exports = { diagnoseScore, TIMEOUT_CONSTANTS };
