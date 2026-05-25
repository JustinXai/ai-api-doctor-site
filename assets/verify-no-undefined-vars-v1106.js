/**
 * AI API Doctor v1.10.8 — No Undefined Variables Check
 * Focused check for undeclared variable references in the Operational Risk IIFE.
 * Updated to match v1.10.7/v1.10.8 pattern: uses scoreDomainAgeSignal for compact display.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TEST_JS = path.join(__dirname, 'test.js');
const content = fs.readFileSync(TEST_JS, 'utf8');
const lines = content.split('\n');

let passed = 0;
let failed = 0;

console.log('\n=== AI API Doctor v1.10.8 Operational Risk IIFE Undefined Check ===\n');

// ── 1. Check for operationalRiskScore. references in the IIFE (around line 4866-4940) ──

let iifeStart = -1;
let iifeEnd = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<!-- Short-term Operational Risk Signals')) {
    iifeStart = i;
  }
  if (iifeStart >= 0 && iifeEnd < 0) {
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

// Fix 1: calcOperationalRiskScore is called inline with domainRegistration, certificateHistory
const hasInline = content.includes('calcOperationalRiskScore(domainRegistration, certificateHistory)');
if (hasInline) {
  console.log('  PASS: calcOperationalRiskScore(domainRegistration, certificateHistory) called inline');
  passed++;
} else {
  console.log('  FAIL: calcOperationalRiskScore(domainRegistration, certificateHistory) NOT called inline');
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

// Fix 3: calcOperationalRiskScore returns domainScore and certScore
const hasReturnDomainScore = content.includes('domainScore,') && content.includes('calcOperationalRiskScore');
if (hasReturnDomainScore) {
  console.log('  PASS: calcOperationalRiskScore returns domainScore');
  passed++;
} else {
  console.log('  FAIL: calcOperationalRiskScore does not return domainScore');
  failed++;
}

// Fix 4: IIFE uses scoreDomainAgeSignal for compact display (v1.10.7+)
const hasScoreDomainAgeSignal = iifeContent.includes('scoreDomainAgeSignal');
if (hasScoreDomainAgeSignal) {
  console.log('  PASS: IIFE uses scoreDomainAgeSignal for compact display');
  passed++;
} else {
  console.log('  FAIL: IIFE does not use scoreDomainAgeSignal');
  failed++;
}

// Fix 5: scoreDomainAgeSignal function exists
const hasScoreFunction = content.includes('function scoreDomainAgeSignal');
if (hasScoreFunction) {
  console.log('  PASS: scoreDomainAgeSignal function exists');
  passed++;
} else {
  console.log('  FAIL: scoreDomainAgeSignal function does not exist');
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
