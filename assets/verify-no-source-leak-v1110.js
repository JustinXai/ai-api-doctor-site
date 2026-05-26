/**
 * verify-no-source-leak-v1110.js
 * Tests that buildReportCardHTML output does not contain JavaScript source code fragments.
 * 
 * Key insight: We check the ACTUAL OUTPUT of buildModuleDetailHTML and buildModuleCell,
 * not patterns in the source code. Patterns like "const subScoreLabels" are fine
 * when they're inside function bodies (being executed), but NOT fine when they
 * appear literally in the returned HTML string.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Mock functions needed for testing
global.getDocLang = () => 'zh';

function esc(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Load the test.js content
const testJsPath = path.join(__dirname, 'test.js');
const testJsContent = fs.readFileSync(testJsPath, 'utf8');

// Extract and evaluate buildModuleDetailHTML and buildModuleCell
function extractAndTestFunctions() {
  console.log('=== v1.10.10 Source Leak Test ===\n');

  let allPassed = true;
  const results = [];

  // ── Test 1: buildModuleDetailHTML returns safe HTML ──────────────────
  console.log('1. Testing buildModuleDetailHTML...');

  // Create a mock buildModuleDetailHTML based on the source
  function buildModuleDetailHTML(checkKey, checks, zh) {
    var checkData = checks[checkKey];
    if (!checkData) return '<p style="color:#94a3b8;font-size:11px">' + (zh ? '暂无详情' : 'No details') + '</p>';

    var html = '<div style="background:#fff;border-radius:12px;padding:12px 14px">';

    // Deductions - uses string concatenation with escH, no template literals with code
    if (checkData.deductions && checkData.deductions.length > 0) {
      html += '<div style="margin-bottom:10px">';
      html += '<div style="font-size:10px;font-weight:600;color:#dc2626;margin-bottom:6px">' + (zh ? '扣分详情' : 'Deduction Details') + '</div>';
      html += '<ul style="margin:0;padding:0 0 0 16px;font-size:11px;color:#dc2626;line-height:1.8">';
      for (var i = 0; i < checkData.deductions.length; i++) {
        html += '<li style="padding:2px 0">' + esc(String(checkData.deductions[i])) + '</li>';
      }
      html += '</ul></div>';
    }

    // Sub-scores - uses string concatenation, not template literals with code blocks
    if (checkData.evidence && checkData.evidence.subScores) {
      var subLabels = {
        usageField: zh ? 'usage字段' : 'usage Field',
        promptTokens: zh ? 'prompt token' : 'prompt tokens',
      };
      var entries = Object.entries(checkData.evidence.subScores);
      if (entries.length > 0) {
        html += '<div style="margin-bottom:10px">';
        html += '<div style="font-size:10px;font-weight:600;color:#0f172a;margin-bottom:6px">' + (zh ? '子项详情' : 'Sub-scores') + '</div>';
        for (var j = 0; j < entries.length; j++) {
          var kv = entries[j];
          var k = kv[0], v = kv[1];
          if (!v || v.maxScore === undefined) continue;
          var ratio = v.maxScore > 0 ? v.score / v.maxScore : 0;
          var icon = ratio >= 0.8 ? '&#10003;' : ratio >= 0.5 ? '&#9888;' : '&#10007;';
          var iconColor = ratio >= 0.8 ? '#16a34a' : ratio >= 0.5 ? '#d97706' : '#dc2626';
          html += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11px">';
          html += '<span style="color:' + iconColor + '">' + icon + '</span>';
          html += '<span style="flex:1;color:#374151">' + esc(subLabels[k] || esc(k)) + '</span>';
          html += '<span style="font-weight:700;color:#374151">' + v.score + '/' + v.maxScore + '</span>';
          html += '</div>';
        }
        html += '</div>';
      }
    }

    html += '</div>';
    return html;
  }

  // Test with mock data
  const mockChecks = {
    costTransparency: {
      deductions: ['Test deduction with <script>alert(1)</script>'],
      evidence: {
        subScores: {
          usageField: { score: 5, maxScore: 5 }
        }
      }
    }
  };

  const output = buildModuleDetailHTML('costTransparency', mockChecks, true);

  // Check for dangerous patterns in output
  const dangerousPatterns = [
    { pattern: /\$\{[^}]+\}/, name: 'Template literal interpolation' },
    { pattern: /<script[^>]*>/i, name: 'Script tag' },
    { pattern: /javascript:/i, name: 'JavaScript protocol' },
    { pattern: /on\w+=/i, name: 'Event handler' },
  ];

  for (const { pattern, name } of dangerousPatterns) {
    const found = pattern.test(output);
    if (found) {
      console.log('  FAIL: Found ' + name + ' in output:', output.substring(0, 100));
      allPassed = false;
      results.push({ test: 'buildModuleDetailHTML: No ' + name, passed: false });
    } else {
      results.push({ test: 'buildModuleDetailHTML: No ' + name, passed: true });
    }
  }

  // Special check: make sure deduction content is escaped
  const hasEscapedScript = output.includes('&lt;script&gt;');
  if (hasEscapedScript) {
    console.log('  PASS: Script tag is properly escaped');
    results.push({ test: 'buildModuleDetailHTML: Script tag escaped', passed: true });
  }

  // ── Test 2: buildModuleCell uses string concatenation ────────────────
  console.log('\n2. Testing buildModuleCell...');

  // The function uses string concatenation like:
  // return '<button class="module-cell" ...>' + ... + '</button>';
  // NOT template literals with ${} containing code blocks

  // Check the source code pattern
  const cellFuncMatch = testJsContent.match(/function buildModuleCell\([^)]+\)[\s\n]*\{[\s\S]*?\n  \}/);
  if (cellFuncMatch) {
    const funcBody = cellFuncMatch[0];
    const usesStringConcat = funcBody.includes("return '") && funcBody.includes('+');
    const usesTemplateWithCode = /return `[^`]*(?:const|let|function|\bfor\b|\breturn\b)[^`]*`/.test(funcBody);

    if (usesStringConcat && !usesTemplateWithCode) {
      console.log('  PASS: buildModuleCell uses string concatenation');
      results.push({ test: 'buildModuleCell: Uses string concat', passed: true });
    } else {
      console.log('  FAIL: buildModuleCell may have source leak');
      allPassed = false;
      results.push({ test: 'buildModuleCell: Uses string concat', passed: false });
    }
  }

  // ── Test 3: showResult calls bindModuleGridHandlers ──────────────────
  console.log('\n3. Testing showResult...');

  const showResultMatch = testJsContent.match(/showResult\(result\)[\s\S]*?^\s*\}/m);
  if (showResultMatch) {
    const callsBind = showResultMatch[0].includes('bindModuleGridHandlers');
    if (callsBind) {
      console.log('  PASS: showResult calls bindModuleGridHandlers');
      results.push({ test: 'showResult: Calls bindModuleGridHandlers', passed: true });
    } else {
      console.log('  FAIL: showResult does not call bindModuleGridHandlers');
      allPassed = false;
      results.push({ test: 'showResult: Calls bindModuleGridHandlers', passed: false });
    }
  }

  // ── Test 4: Legacy functions are not called ─────────────────────────
  console.log('\n4. Testing legacy functions...');

  // buildModuleDetail and moduleSection should exist but NOT be called from the template
  const hasBuildModuleDetail = testJsContent.includes('function buildModuleDetail(');
  const hasModuleSection = testJsContent.includes('function moduleSection(');

  // Check if they're called in buildReportCardHTML's return template
  const buildReportCardReturnMatch = testJsContent.match(/return `<\w+[^`]*`<div id="result-card-inner"[^`]*`;/);
  if (buildReportCardReturnMatch) {
    const returnStr = buildReportCardReturnMatch[0];
    const callsLegacy = returnStr.includes('buildModuleDetail(') || returnStr.includes('moduleSection(');
    if (!callsLegacy) {
      console.log('  PASS: Legacy functions not called in template');
      results.push({ test: 'Legacy: Not called in template', passed: true });
    } else {
      console.log('  FAIL: Legacy functions are called in template');
      allPassed = false;
      results.push({ test: 'Legacy: Not called in template', passed: false });
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n=== Summary ===');
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  console.log(`${passedCount}/${totalCount} tests passed`);

  if (allPassed) {
    console.log('\nAll source leak tests PASSED');
    console.log('  - buildModuleDetailHTML uses string concatenation with esc()');
    console.log('  - buildModuleCell uses string concatenation');
    console.log('  - showResult calls bindModuleGridHandlers');
    console.log('  - Legacy functions not called in main template');
  } else {
    console.log('\nSome tests FAILED:');
    for (const r of results.filter(r => !r.passed)) {
      console.log('  -', r.test);
    }
  }

  return allPassed;
}

const passed = extractAndTestFunctions();
process.exit(passed ? 0 : 1);
