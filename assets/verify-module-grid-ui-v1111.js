/**
 * v1.10.11: Module grid UI verification script
 * Tests that the two-column module layout doesn't have chevron wrapping issues.
 * Run: node assets/verify-module-grid-ui-v1111.js
 */

(function() {
  'use strict';

  const results = [];
  let passCount = 0;
  let failCount = 0;

  function test(name, fn) {
    try {
      fn();
      results.push({ name, status: 'PASS' });
      passCount++;
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      results.push({ name, status: 'FAIL', error: err.message });
      failCount++;
      console.log(`  [FAIL] ${name}: ${err.message}`);
    }
  }

  function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${msg || ''} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  function assertTrue(condition, msg) {
    if (!condition) throw new Error(msg || 'Expected true');
  }

  function assertFalse(condition, msg) {
    if (condition) throw new Error(msg || 'Expected false');
  }

  // Read the test.js file and extract CSS
  const fs = require('fs');
  const path = require('path');

  let testJsContent;
  try {
    testJsContent = fs.readFileSync(path.join(__dirname, 'test.js'), 'utf-8');
  } catch (err) {
    console.error('Could not read test.js:', err.message);
    process.exit(1);
  }

  console.log('\n=== v1.10.11 Module Grid UI Verification ===\n');

  // Case 1: Verify module-cell CSS uses 4-column grid
  test('Case 1: module-cell CSS uses 4-column grid (includes chevron column)', () => {
    const moduleCellMatch = testJsContent.match(/\.module-cell\s*\{[^}]+display:\s*grid[^}]+grid-template-columns:\s*([^;]+)/);
    assertTrue(moduleCellMatch !== null, 'Should find .module-cell CSS');
    const gridTemplate = moduleCellMatch[1].trim();
    // Should have 4 columns: name, score, pill, chevron
    const columnCount = gridTemplate.split(/\s+/).filter(c => c && c !== 'auto' && c !== '!' && !c.startsWith('minmax')).length;
    // Count the actual columns
    const columns = gridTemplate.split(/\s+/).filter(c => c.trim());
    // We expect something like: minmax(96px, 1fr) auto auto 14px
    const hasChevronColumn = columns.length >= 4;
    assertTrue(hasChevronColumn, `Should have 4 columns for chevron. Found: ${gridTemplate}`);
  });

  // Case 2: Verify module-cell doesn't have separate chevron elements causing wrapping
  test('Case 2: chevron is in 4th grid column, not separate block', () => {
    // The CSS should define 4 columns: name, score, pill, chevron
    const moduleCellSection = testJsContent.match(/\.module-cell\s*\{[\s\S]*?\n\s*\}/);
    assertTrue(moduleCellSection !== null, 'Should find .module-cell CSS block');
    const css = moduleCellSection[0];
    // Check that grid-template-columns has 4 values
    const gridMatch = css.match(/grid-template-columns:\s*([^;]+)/);
    assertTrue(gridMatch !== null, 'Should find grid-template-columns');
    const columns = gridMatch[1].trim().split(/\s+/).filter(c => c.trim());
    // 4 columns = 4 items for name, score, pill, chevron
    assertTrue(columns.length >= 4 || (columns.length === 3 && css.includes('14px')), 
      `Should have chevron as 4th column. Found ${columns.length} columns: ${columns.join(', ')}`);
  });

  // Case 3: Verify module-cell HTML structure has chevron inline
  test('Case 3: buildModuleCell returns chevron in same element, not separate block', () => {
    const buildModuleCellMatch = testJsContent.match(/function buildModuleCell\([\s\S]*?return\s+'<button[^>]*>[^']*';/);
    // Find the return statement in buildModuleCell
    const functionStart = testJsContent.indexOf('function buildModuleCell');
    const functionEnd = testJsContent.indexOf('\n  }\n\n  //', functionStart);
    const functionBody = testJsContent.substring(functionStart, functionEnd);
    
    // The function should return a single <button> with chevron inside
    const hasSingleButton = functionBody.includes("return '<button") && functionBody.includes("</button>'");
    assertTrue(hasSingleButton, 'Should return single button element');
    
    // Chevron should be inside the button, not as separate HTML after the button
    const chevronIndex = functionBody.indexOf("module-arrow");
    const buttonEndIndex = functionBody.lastIndexOf("</button>'");
    assertTrue(chevronIndex > 0 && chevronIndex < buttonEndIndex, 
      'Chevron should be inside the button element');
  });

  // Case 4: Verify 6 modules exist in the grid
  test('Case 4: 6 module cells exist in module-grid HTML', () => {
    const moduleGridMatch = testJsContent.match(/module-grid[\s\S]*?buildModuleCell\([^)]+\)[\s\S]*?<\/div>\s*<!-- Module detail panel/);
    assertTrue(moduleGridMatch !== null, 'Should find module-grid with 6 cells');
    
    // Count buildModuleCell calls in the module-grid section
    const gridSectionMatch = testJsContent.match(/<div class="module-grid"[^>]*>([\s\S]*?)<\/div>\s*<!-- Module detail panel/);
    assertTrue(gridSectionMatch !== null, 'Should find module-grid section');
    
    const buildModuleCount = (gridSectionMatch[1].match(/buildModuleCell\(/g) || []).length;
    assertEqual(buildModuleCount, 6, 'Should have exactly 6 buildModuleCell calls');
  });

  // Case 5: Verify module names are correct
  test('Case 5: Module labels match expected names', () => {
    const expectedModules = [
      'usageTransparency', 'cacheSignal', 'modelSignal', 'stabilityLatency',
      'coreCompatibility', 'clientConfig'
    ];
    const gridSectionMatch = testJsContent.match(/<div class="module-grid"[^>]*>([\s\S]*?)<\/div>\s*<!-- Module detail panel/);
    assertTrue(gridSectionMatch !== null, 'Should find module-grid section');
    
    for (const moduleName of expectedModules) {
      const hasModule = gridSectionMatch[1].includes(`'${moduleName}'`);
      assertTrue(hasModule, `Should include ${moduleName}`);
    }
  });

  // Case 6: Verify module-arrow CSS doesn't cause wrapping
  test('Case 6: module-arrow has appropriate sizing', () => {
    const moduleArrowMatch = testJsContent.match(/\.module-arrow\s*\{([^}]+)\}/);
    assertTrue(moduleArrowMatch !== null, 'Should find .module-arrow CSS');
    const css = moduleArrowMatch[1];
    
    // Should have explicit width/fixed size to prevent wrapping
    const hasFixedWidth = css.includes('width:') || css.includes('min-width:') || css.includes('14px');
    const hasFontSize = css.includes('font-size:');
    
    assertTrue(hasFixedWidth || hasFontSize, 
      'module-arrow should have fixed width to prevent wrapping');
  });

  // Case 7: Verify two-column grid on desktop
  test('Case 7: module-grid uses 1fr 1fr for two columns', () => {
    const moduleGridMatch = testJsContent.match(/\.module-grid\s*\{([^}]+)\}/);
    assertTrue(moduleGridMatch !== null, 'Should find .module-grid CSS');
    const css = moduleGridMatch[1];
    
    const hasTwoColumns = css.includes('grid-template-columns: 1fr 1fr') || 
                          css.includes('grid-template-columns:1fr 1fr');
    assertTrue(hasTwoColumns, 'Should use 1fr 1fr for two columns');
  });

  // Case 8: Verify module-cell min-height prevents too much vertical space
  test('Case 8: module-cell has reasonable min-height', () => {
    const moduleCellMatch = testJsContent.match(/\.module-cell\s*\{[\s\S]*?min-height:\s*(\d+)px/);
    assertTrue(moduleCellMatch !== null, 'Should find min-height in .module-cell');
    const minHeight = parseInt(moduleCellMatch[1], 10);
    
    assertTrue(minHeight >= 40 && minHeight <= 50, 
      `min-height should be 40-50px, found ${minHeight}px`);
  });

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total: ${passCount + failCount} tests`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);

  if (failCount > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    process.exit(0);
  }
})();
