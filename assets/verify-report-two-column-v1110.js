/**
 * verify-report-two-column-v1110.js
 * Tests that the report has the correct two-column module layout.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function testTwoColumnLayout() {
  console.log('=== v1.10.10 Two-Column Layout Test ===\n');

  const testJsPath = path.join(__dirname, 'test.js');
  const testJsContent = fs.readFileSync(testJsPath, 'utf8');

  let passed = true;
  const results = [];

  // 1. Check for module-grid CSS class
  const hasModuleGridCSS = testJsContent.includes('.module-grid {');
  results.push({ test: 'CSS: .module-grid defined', passed: hasModuleGridCSS });
  console.log(hasModuleGridCSS ? 'PASS' : 'FAIL', '- CSS: .module-grid defined');

  // 2. Check for two-column grid-template-columns
  const hasTwoColumnCSS = testJsContent.includes('grid-template-columns: 1fr 1fr');
  results.push({ test: 'CSS: Two-column grid', passed: hasTwoColumnCSS });
  console.log(hasTwoColumnCSS ? 'PASS' : 'FAIL', '- CSS: grid-template-columns: 1fr 1fr');

  // 3. Check for module-cell class
  const hasModuleCellCSS = testJsContent.includes('.module-cell {');
  results.push({ test: 'CSS: .module-cell defined', passed: hasModuleCellCSS });
  console.log(hasModuleCellCSS ? 'PASS' : 'FAIL', '- CSS: .module-cell defined');

  // 4. Check for risk-pill class
  const hasRiskPillCSS = testJsContent.includes('.risk-pill {');
  results.push({ test: 'CSS: .risk-pill defined', passed: hasRiskPillCSS });
  console.log(hasRiskPillCSS ? 'PASS' : 'FAIL', '- CSS: .risk-pill defined');

  // 5. Check for module-detail-panel class
  const hasDetailPanelCSS = testJsContent.includes('.module-detail-panel {');
  results.push({ test: 'CSS: .module-detail-panel defined', passed: hasDetailPanelCSS });
  console.log(hasDetailPanelCSS ? 'PASS' : 'FAIL', '- CSS: .module-detail-panel defined');

  // 6. Check for mobile responsive CSS
  const hasMobileCSS = testJsContent.includes('@media (max-width: 640px)');
  results.push({ test: 'CSS: Mobile responsive @media', passed: hasMobileCSS });
  console.log(hasMobileCSS ? 'PASS' : 'FAIL', '- CSS: @media (max-width: 640px)');

  // 7. Check for buildModuleCell function
  const hasBuildModuleCell = testJsContent.includes('function buildModuleCell(');
  results.push({ test: 'Function: buildModuleCell exists', passed: hasBuildModuleCell });
  console.log(hasBuildModuleCell ? 'PASS' : 'FAIL', '- Function: buildModuleCell exists');

  // 8. Check for buildModuleDetailHTML function
  const hasBuildModuleDetailHTML = testJsContent.includes('function buildModuleDetailHTML(');
  results.push({ test: 'Function: buildModuleDetailHTML exists', passed: hasBuildModuleDetailHTML });
  console.log(hasBuildModuleDetailHTML ? 'PASS' : 'FAIL', '- Function: buildModuleDetailHTML exists');

  // 9. Check for bindModuleGridHandlers function
  const hasBindModuleGridHandlers = testJsContent.includes('function bindModuleGridHandlers(');
  results.push({ test: 'Function: bindModuleGridHandlers exists', passed: hasBindModuleGridHandlers });
  console.log(hasBindModuleGridHandlers ? 'PASS' : 'FAIL', '- Function: bindModuleGridHandlers exists');

  // 10. Check that showResult calls bindModuleGridHandlers
  const showResultMatch = testJsContent.match(/showResult\(result\)[\s\S]*?^\s*\}/m);
  const callsBind = showResultMatch && showResultMatch[0].includes('bindModuleGridHandlers');
  results.push({ test: 'Function: showResult calls bindModuleGridHandlers', passed: !!callsBind });
  console.log(callsBind ? 'PASS' : 'FAIL', '- Function: showResult calls bindModuleGridHandlers');

  // 11. Check for module-grid div in the template
  const hasModuleGridTemplate = testJsContent.includes('class="module-grid"');
  results.push({ test: 'Template: module-grid div exists', passed: hasModuleGridTemplate });
  console.log(hasModuleGridTemplate ? 'PASS' : 'FAIL', '- Template: module-grid div exists');

  // 12. Check for module-detail-panel div in the template
  const hasDetailPanelTemplate = testJsContent.includes('class="module-detail-panel"');
  results.push({ test: 'Template: module-detail-panel div exists', passed: hasDetailPanelTemplate });
  console.log(hasDetailPanelTemplate ? 'PASS' : 'FAIL', '- Template: module-detail-panel div exists');

  // 13. Check that module-detail-panel is hidden by default
  const detailPanelHiddenByDefault = testJsContent.includes('style="display:none"') &&
    testJsContent.includes('module-detail-panel');
  results.push({ test: 'Template: module-detail-panel hidden by default', passed: detailPanelHiddenByDefault });
  console.log(detailPanelHiddenByDefault ? 'PASS' : 'FAIL', '- Template: module-detail-panel hidden by default');

  // 14. Check for buildModuleCell calls in the template (6 times)
  // Count all occurrences of buildModuleCell(' in the file (function def + 6 calls = 7, but we look for the quote pattern)
  const cellCallCount = (testJsContent.match(/buildModuleCell\('/g) || []).length;
  // 1 function definition + 6 actual calls = 7, but we count the quote pattern which is 6
  const has6Cells = cellCallCount === 6;
  results.push({ test: 'Template: 6 buildModuleCell calls', passed: has6Cells });
  console.log(has6Cells ? 'PASS' : 'FAIL', `- Template: ${cellCallCount} buildModuleCell calls (expected 6)`);

  // 15. Check for the correct module keys in the template
  const hasCorrectOrder =
    testJsContent.includes("buildModuleCell('usageTransparency'") &&
    testJsContent.includes("buildModuleCell('cacheSignal'") &&
    testJsContent.includes("buildModuleCell('modelSignal'") &&
    testJsContent.includes("buildModuleCell('stabilityLatency'") &&
    testJsContent.includes("buildModuleCell('coreCompatibility'") &&
    testJsContent.includes("buildModuleCell('clientConfig'");
  results.push({ test: 'Template: All 6 modules defined', passed: hasCorrectOrder });
  console.log(hasCorrectOrder ? 'PASS' : 'FAIL', '- Template: All 6 modules defined');

  // 16. Check that module-detail-panel uses hidden attribute
  const usesHiddenAttr = testJsContent.includes('hidden') &&
    testJsContent.includes('module-detail-panel');
  results.push({ test: 'Template: Uses hidden attribute', passed: usesHiddenAttr });
  console.log(usesHiddenAttr ? 'PASS' : 'FAIL', '- Template: module-detail-panel uses hidden');

  // Summary
  console.log('\n=== Summary ===');
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  console.log(`${passedCount}/${totalCount} tests passed`);

  if (passedCount === totalCount) {
    console.log('\nAll two-column layout tests PASSED');
    return true;
  } else {
    console.log('\nSome two-column layout tests FAILED:');
    for (const r of results.filter(r => !r.passed)) {
      console.log('  -', r.test);
    }
    return false;
  }
}

const passed = testTwoColumnLayout();
process.exit(passed ? 0 : 1);
