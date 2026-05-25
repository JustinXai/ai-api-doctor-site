/**
 * AI API Doctor v1.10.6 — No Undefined Variables Check
 * Focused check for undeclared variable references in the Operational Risk IIFE.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TEST_JS = path.join(__dirname, 'test.js');
const content = fs.readFileSync(TEST_JS, 'utf8');
const lines = content.split('\n');

let passed = 0;
let failed = 0;

console.log('\n=== AI API Doctor v1.10.6 Operational Risk IIFE Undefined Check ===\n');

// ── 1. Check for operationalRiskScore. references in the IIFE (around line 4838-4960) ──
// We know the Operational Risk IIFE is roughly between "<!-- Short-term Operational Risk Signals"
// and the closing `})()}` pattern after the card HTML.

let iifeStart = -1;
let iifeEnd = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<!-- Short-term Operational Risk Signals')) {
    iifeStart = i;
  }
  if (iifeStart >= 0 && iifeEnd < 0) {
    // Look for the closing of the IIFE
    if (lines[i].trim() === '})()}') {
      iifeEnd = i;
      break;
    }
  }
}

console.log(`Operational Risk IIFE: lines ${iifeStart + 1}-${iifeEnd + 1}`);

const iifeContent = lines.slice(iifeStart, iifeEnd + 1).join('\n');

// Check 1: No bare operationalRiskScore. references in IIFE
const orsBare = (iifeContent.match(/operationalRiskScore\.[a-zA-Z]/g) || []).length;
if (orsBare === 0) {
  console.log('  PASS: No bare operationalRiskScore.xxx in IIFE');
  passed++;
} else {
  console.log(`  FAIL: Found ${orsBare} bare operationalRiskScore.xxx in IIFE`);
  failed++;
}

// Check 2: No bare domainAgeSignalScore in IIFE
const daisBare = (iifeContent.match(/domainAgeSignalScore[^a-zA-Z]/g) || []).length;
if (daisBare === 0) {
  console.log('  PASS: No bare domainAgeSignalScore in IIFE');
  passed++;
} else {
  console.log(`  FAIL: Found bare domainAgeSignalScore in IIFE`);
  failed++;
}

// Check 3: No bare fullOperationalScore in IIFE
const fosBare = (iifeContent.match(/fullOperationalScore/g) || []).length;
if (fosBare === 0) {
  console.log('  PASS: No bare fullOperationalScore in IIFE');
  passed++;
} else {
  console.log(`  FAIL: Found bare fullOperationalScore in IIFE`);
  failed++;
}

console.log('\n--- Checking fix patterns ---\n');

// Fix 1: calcOperationalRiskScore is called inline with domainSignal, certSignal
const hasInline = content.includes('calcOperationalRiskScore(domainSignal, certSignal)');
if (hasInline) {
  console.log('  PASS: calcOperationalRiskScore(domainSignal, certSignal) called inline');
  passed++;
} else {
  console.log('  FAIL: calcOperationalRiskScore(domainSignal, certSignal) NOT called inline');
  failed++;
}

// Fix 2: Old buggy pattern removed
const oldDomainScore = content.includes('const domainScore = operationalRiskScore ?');
const oldCertScore = content.includes('const certScore = operationalRiskScore ?');
if (!oldDomainScore) {
  console.log('  PASS: Old "const domainScore = operationalRiskScore ?" pattern removed');
  passed++;
} else {
  console.log('  FAIL: Old buggy pattern still exists');
  failed++;
}
if (!oldCertScore) {
  console.log('  PASS: Old "const certScore = operationalRiskScore ?" pattern removed');
  passed++;
} else {
  console.log('  FAIL: Old certScore buggy pattern still exists');
  failed++;
}

// Fix 3: domainScore should be declared with calc result
const domainScoreInline = content.includes('const domainScore = domainScoreResult.domainScore');
if (domainScoreInline) {
  console.log('  PASS: domainScore declared from domainScoreResult');
  passed++;
} else {
  console.log('  FAIL: domainScore NOT declared from domainScoreResult');
  failed++;
}

const certScoreInline = content.includes('const certScore = certScoreResult.certScore');
if (certScoreInline) {
  console.log('  PASS: certScore declared from certScoreResult');
  passed++;
} else {
  console.log('  FAIL: certScore NOT declared from certScoreResult');
  failed++;
}

console.log(`\n=== Summary ===`);
console.log(`Checks passed: ${passed}`);
console.log(`Checks failed: ${failed}`);

if (failed === 0) {
  console.log('\n✓ All Operational Risk IIFE variable checks passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Issues found in Operational Risk IIFE!\n');
  process.exit(1);
}
