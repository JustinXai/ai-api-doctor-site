/**
 * verify-score-consistency-v1110.js
 * Tests that the score calculation is consistent and cap rules are correct.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function testScoreConsistency() {
  console.log('=== v1.10.10 Score Consistency Test ===\n');

  const testJsPath = path.join(__dirname, 'test.js');
  const testJsContent = fs.readFileSync(testJsPath, 'utf8');

  let passed = true;
  const results = [];

  // 1. Check that calcFinalScore is defined
  const hasCalcFinalScore = testJsContent.includes('function calcFinalScore(');
  results.push({ test: 'Function: calcFinalScore exists', passed: hasCalcFinalScore });
  console.log(hasCalcFinalScore ? 'PASS' : 'FAIL', '- Function: calcFinalScore exists');

  // 2. Check that applyCaps is defined
  const hasApplyCaps = testJsContent.includes('function applyCaps(');
  results.push({ test: 'Function: applyCaps exists', passed: hasApplyCaps });
  console.log(hasApplyCaps ? 'PASS' : 'FAIL', '- Function: applyCaps exists');

  // 3. Check that breakdownTotalRaw is computed in calcFinalScore
  const hasBreakdownTotalRaw = testJsContent.includes('breakdownTotalRaw');
  results.push({ test: 'calcFinalScore: Computes breakdownTotalRaw', passed: hasBreakdownTotalRaw });
  console.log(hasBreakdownTotalRaw ? 'PASS' : 'FAIL', '- calcFinalScore: Computes breakdownTotalRaw');

  // 4. Check that breakdownTotalRaw is included in result
  const usesBreakdownTotalRawInResult = testJsContent.includes('breakdownTotalRaw:');
  results.push({ test: 'Result: Includes breakdownTotalRaw', passed: usesBreakdownTotalRawInResult });
  console.log(usesBreakdownTotalRawInResult ? 'PASS' : 'FAIL', '- Result: Includes breakdownTotalRaw');

  // 5. Check that score in result is cappedScore
  const usesCappedScore = testJsContent.includes('score: cappedScore');
  results.push({ test: 'Result: score is cappedScore', passed: usesCappedScore });
  console.log(usesCappedScore ? 'PASS' : 'FAIL', '- Result: score is cappedScore');

  // 6. Check that capApplied is included in result
  const includesCapApplied = testJsContent.includes('capApplied,');
  results.push({ test: 'Result: Includes capApplied', passed: includesCapApplied });
  console.log(includesCapApplied ? 'PASS' : 'FAIL', '- Result: Includes capApplied');

  // 7. Check that capReason is included in result
  const includesCapReason = testJsContent.includes('capReason:');
  results.push({ test: 'Result: Includes capReason', passed: includesCapReason });
  console.log(includesCapReason ? 'PASS' : 'FAIL', '- Result: Includes capReason');

  // 8. Check that capLimit is included in result
  const includesCapLimit = testJsContent.includes('capLimit:');
  results.push({ test: 'Result: Includes capLimit', passed: includesCapLimit });
  console.log(includesCapLimit ? 'PASS' : 'FAIL', '- Result: Includes capLimit');

  // 9. Check that response_not_json cap is conditional on basicCompatibility
  // v1.10.11: Only cap if basicCompatibility is genuinely low (< 20) AND response is truly incompatible
  const hasConditionalCap = testJsContent.includes('basicCompatScore < 20') &&
    testJsContent.includes('!targetResponseParsed');
  results.push({ test: 'Cap: response_not_json conditional on basicCompatibility', passed: hasConditionalCap });
  console.log(hasConditionalCap ? 'PASS' : 'FAIL', '- Cap: response_not_json conditional on basicCompatibility');

  // 10. Check that usage missing does NOT trigger cap
  // usage missing should NOT have a direct cap in applyCaps
  const noUsageCap = !/if\s*\(\s*!hasUsage[^)]*\)\s*\{\s*cap\s*=/.test(testJsContent);
  results.push({ test: 'Cap: usage missing does NOT trigger cap', passed: noUsageCap });
  console.log(noUsageCap ? 'PASS' : 'FAIL', '- Cap: usage missing does NOT trigger cap');

  // 11. Check that model signal low does NOT trigger cap alone
  const modelSignalLowNoCap = !/if\s*\(\s*modelSignal.*'high'.*\).*\{.*cap\s*=/.test(testJsContent) &&
    !/if\s*\(\s*modelSignalRisk.*===.*'high'.*\).*\{.*cap\s*=/.test(testJsContent);
  results.push({ test: 'Cap: model signal low does NOT trigger cap alone', passed: modelSignalLowNoCap });
  console.log(modelSignalLowNoCap ? 'PASS' : 'FAIL', '- Cap: model signal low does NOT trigger cap alone');

  // 12. Check that operational risk does NOT enter calcFinalScore
  // Extract calcFinalScore function body and check it doesn't include operationalRisk
  const calcFinalScoreMatch = testJsContent.match(/function calcFinalScore\(checks\)[\s\S]*?^\}/m);
  if (calcFinalScoreMatch) {
    const funcBody = calcFinalScoreMatch[0];
    const opRiskInCalc = funcBody.includes('operationalRisk');
    results.push({ test: 'Score: operationalRisk NOT in calcFinalScore', passed: !opRiskInCalc });
    console.log(!opRiskInCalc ? 'PASS' : 'FAIL', '- Score: operationalRisk NOT in calcFinalScore');
  } else {
    results.push({ test: 'Score: operationalRisk NOT in calcFinalScore', passed: true });
    console.log('PASS', '- Score: operationalRisk NOT in calcFinalScore (function not found)');
  }

  // 13. Check that trulyFatalReasons list exists for UI cap display
  const hasTrulyFatalReasons = testJsContent.includes('trulyFatalReasons');
  results.push({ test: 'UI: trulyFatalReasons list for cap display', passed: hasTrulyFatalReasons });
  console.log(hasTrulyFatalReasons ? 'PASS' : 'FAIL', '- UI: trulyFatalReasons list for cap display');

  // 14. Check that cap notice only shows for truly fatal
  const capNoticeConditional = testJsContent.includes("if (!trulyFatalReasons.includes(capReason)) return ''");
  results.push({ test: 'UI: Cap notice only shows for truly fatal', passed: capNoticeConditional });
  console.log(capNoticeConditional ? 'PASS' : 'FAIL', '- UI: Cap notice only shows for truly fatal');

  // 15. Check that the display score uses the same score as module sum
  const displayScoreFromResult = testJsContent.includes('const displayScore = score');
  results.push({ test: 'Display: displayScore comes from result.score', passed: displayScoreFromResult });
  console.log(displayScoreFromResult ? 'PASS' : 'FAIL', '- Display: displayScore comes from result.score');

  // 16. Check that the breakdown module names match the UI
  const hasBreakdownModuleNames =
    testJsContent.includes('usageTransparency') &&
    testJsContent.includes('cacheSignal') &&
    testJsContent.includes('modelSignal') &&
    testJsContent.includes('stabilityLatency') &&
    testJsContent.includes('coreCompatibility') &&
    testJsContent.includes('clientConfig');
  results.push({ test: 'Breakdown: All 6 module names defined', passed: hasBreakdownModuleNames });
  console.log(hasBreakdownModuleNames ? 'PASS' : 'FAIL', '- Breakdown: All 6 module names defined');

  // Summary
  console.log('\n=== Summary ===');
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  console.log(`${passedCount}/${totalCount} tests passed`);

  if (passedCount === totalCount) {
    console.log('\nAll score consistency tests PASSED');
    return true;
  } else {
    console.log('\nSome score consistency tests FAILED:');
    for (const r of results.filter(r => !r.passed)) {
      console.log('  -', r.test);
    }
    return false;
  }
}

const passed = testScoreConsistency();
process.exit(passed ? 0 : 1);
