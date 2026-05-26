/**
 * v1.10.12: Score Diagnosis Script
 * Diagnoses why the current case shows low scores.
 * Run: node assets/diagnose-score-v1112.js
 */

(function() {
  'use strict';

  console.log('=== API Doctor v1.10.12 Score Diagnosis ===\n');

  // Current case data (from screenshot)
  const currentCase = {
    usageTransparency: 0,
    cacheHitCheck: 2.5,
    modelSignal: 2,
    stabilityLatency: 21,
    basicCompatibility: 24.6,
    clientConfig: 5
  };

  console.log('Current Case Module Scores:');
  console.log(`  usageTransparency: ${currentCase.usageTransparency}/25`);
  console.log(`  cacheHitCheck:     ${currentCase.cacheHitCheck}/5`);
  console.log(`  modelSignal:       ${currentCase.modelSignal}/15`);
  console.log(`  stabilityLatency:  ${currentCase.stabilityLatency}/25`);
  console.log(`  basicCompatibility:${currentCase.basicCompatibility}/25`);
  console.log(`  clientConfig:      ${currentCase.clientConfig}/5`);
  console.log('');

  // Calculate raw module score
  const rawModuleScore = 
    currentCase.usageTransparency +
    currentCase.cacheHitCheck +
    currentCase.modelSignal +
    currentCase.stabilityLatency +
    currentCase.basicCompatibility +
    currentCase.clientConfig;

  console.log(`Raw Module Score: ${rawModuleScore.toFixed(1)}`);
  console.log('');

  // Simulate current calcFinalScore
  console.log('--- Simulating calcFinalScore ---');
  
  // basicCompatibility
  const basicCompatScore = currentCase.basicCompatibility;
  const coreCompatMax = 25;
  const coreCompatNorm = (basicCompatScore / coreCompatMax) * 100;
  
  // usage (costTransparency)
  const usageScore = currentCase.usageTransparency;
  const usageMax = 25;
  const usageNorm = (usageScore / usageMax) * 100;
  
  // stability
  const stabilityScore = currentCase.stabilityLatency;
  const stabilityMax = 25;
  const stabilityNorm = (stabilityScore / stabilityMax) * 100;
  
  // modelSignal
  const modelSignalScore = currentCase.modelSignal;
  const modelSignalMax = 15;
  const modelSignalNorm = (modelSignalScore / modelSignalMax) * 100;
  
  // cache
  const cacheScore = currentCase.cacheHitCheck;
  const cacheMax = 5;
  const cacheNorm = (cacheScore / cacheMax) * 100;
  
  // client
  const clientScore = currentCase.clientConfig;
  const clientMax = 5;
  const clientNorm = (clientScore / clientMax) * 100;

  console.log(`  coreCompatNorm:   ${coreCompatNorm.toFixed(1)}%`);
  console.log(`  usageNorm:        ${usageNorm.toFixed(1)}%`);
  console.log(`  stabilityNorm:     ${stabilityNorm.toFixed(1)}%`);
  console.log(`  modelSignalNorm:  ${modelSignalNorm.toFixed(1)}%`);
  console.log(`  cacheNorm:        ${cacheNorm.toFixed(1)}%`);
  console.log(`  clientNorm:       ${clientNorm.toFixed(1)}%`);

  // v1.8 weighted formula for grade
  const gradeScore = Math.min(98,
    coreCompatNorm * 0.25 +
    usageNorm * 0.25 +
    stabilityNorm * 0.25 +
    modelSignalNorm * 0.15 +
    cacheNorm * 0.05 +
    clientNorm * 0.05
  );

  console.log(`\nGrade Score (weighted): ${gradeScore.toFixed(1)}`);

  // Current cap simulation
  console.log('\n--- Simulating applyCaps ---');
  
  // Assume basicCompatibility >= 20, so no response_not_json cap
  const basicCompatTcJson = 1; // Assume JSON check passed
  const targetResponseParsed = true; // Assume response is parseable
  const targetHttpStatus = 200; // Assume success
  
  const trulyIncompatibleResponse =
    basicCompatScore < 20 &&
    !targetResponseParsed &&
    targetHttpStatus === 200;

  console.log(`  basicCompatScore:  ${basicCompatScore} (>= 20, no cap)`);
  console.log(`  targetResponseParsed: ${targetResponseParsed}`);
  console.log(`  trulyIncompatibleResponse: ${trulyIncompatibleResponse}`);
  console.log(`  Cap would be applied: ${trulyIncompatibleResponse}`);

  // Calculate final score after potential cap
  const capLimit = trulyIncompatibleResponse ? 45 : 98;
  const cappedGradeScore = Math.min(gradeScore, capLimit);
  
  console.log(`\n  gradeScore: ${gradeScore.toFixed(1)}`);
  console.log(`  capLimit:   ${capLimit}`);
  console.log(`  cappedGradeScore: ${cappedGradeScore.toFixed(1)}`);

  // Calculate display score
  const displayScore = cappedGradeScore < gradeScore
    ? Math.round((cappedGradeScore / 100) * rawModuleScore * 10) / 10
    : rawModuleScore;

  console.log(`\nFinal Display Score: ${displayScore.toFixed(1)}`);

  // Problem Analysis
  console.log('\n=== PROBLEM ANALYSIS ===\n');

  console.log('1. WHY usageTransparency = 0/25?');
  console.log('   Current cost transparency score includes:');
  console.log('   - usage field presence (J1-J2)');
  console.log('   - short reply test (J5) - if this fails, can bring score to 0');
  console.log('   - max_tokens test (J6) - if this fails, additional penalty');
  console.log('   - usage stability (J7)');
  console.log('   - prompt token overhead (J8)');
  console.log('   FIX: usageTransparency should primarily reflect "usage field presence"');
  console.log('   and NOT be heavily penalized by short reply test failure alone.\n');

  console.log('2. WHY modelSignal = 2/15?');
  console.log('   Possible reasons:');
  console.log('   - capabilitySmokeResult.passedCount < 2 triggers risk=medium');
  console.log('   - selfClaimResult may have scored low due to "no answer" being treated as ambiguous');
  console.log('   FIX: "no answer" should be treated as 7/15, not 2/15\n');

  console.log('3. WHY cap being triggered?');
  console.log('   Current code may still trigger cap incorrectly.');
  console.log('   FIX: Ensure basicCompatibility >= 20 blocks response_not_json cap.\n');

  console.log('4. WHY display score = 24.8?');
  console.log('   If cap IS applied with limit 45:');
  console.log('   displayScore = (45/100) * 55.1 = 24.8');
  console.log('   This means the cap IS being triggered incorrectly!\n');

  // Expected Scores After Fix
  console.log('=== EXPECTED SCORES AFTER FIX ===\n');

  console.log('Current Case:');
  console.log('  - targetCall: success (assumed)');
  console.log('  - basicCompatibility: 24.6/25');
  console.log('  - stability: 21/25');
  console.log('  - clientConfig: 5/5');
  console.log('  - cacheHitCheck: 2.5/5');
  console.log('  - usage: missing (no usage field)');
  console.log('  - model identity: no answer\n');

  console.log('Expected fixed scores:');
  console.log('  - usageTransparency: 8/25 (no usage field = 8, not 0)');
  console.log('  - cacheHitCheck: 2.5/5 (cannot verify = 2.5)');
  console.log('  - modelSignal: 7/15 (no answer = 7/15, not 2/15)');
  console.log('  - stabilityLatency: 21/25');
  console.log('  - basicCompatibility: 24.6/25');
  console.log('  - clientConfig: 5/5\n');

  const fixedRawScore = 8 + 2.5 + 7 + 21 + 24.6 + 5;
  console.log(`Fixed Raw Module Score: ${fixedRawScore.toFixed(1)}`);
  console.log('Expected Final Score: ~68-72 (C grade - usable, needs review)');
  console.log('');

  console.log('=== ROOT CAUSES ===');
  console.log('1. FATAL CAP MIS-TRIGGER: response_not_json cap still triggering despite basicCompat >= 20');
  console.log('2. USAGE SCORE TOO LOW: short reply test failure brings entire usage score to 0');
  console.log('3. MODEL SIGNAL TOO LOW: "no answer" incorrectly penalized to 2/15');
  console.log('4. SCORE SOURCE CONFUSION: Using cappedGradeScore to drive display instead of rawModuleScore');
  console.log('');

  console.log('=== RECOMMENDED FIXES ===');
  console.log('1. FIX cap rule: Ensure basicCompatibility < 20 is required for response_not_json cap');
  console.log('2. FIX usage scoring: Separate "usage field presence" from "usage quality tests"');
  console.log('3. FIX modelSignal: Ensure "no answer" = 7/15, not penalized below 6/15');
  console.log('4. FIX score source: Use rawModuleScore as finalScore when no fatal cap');
  console.log('5. UNIFY score calculation: One source of truth for all score displays');

})();
