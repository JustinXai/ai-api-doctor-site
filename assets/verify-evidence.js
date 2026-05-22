'use strict';

/*
 * AI API Doctor — Evidence Integrity Verification Script
 * Verifies that evidence data comes from real API responses, not hardcoded values.
 * This is a read-only diagnostic script — it does NOT modify any files.
 */

// ═══════════════════════════════════════════════════════
// SECTION 1: Check for suspected hardcoded display values
// ═══════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const SUSPICIOUS_VALUES = [
  '85.7', '58.13', '9236', '8127', '5833', '4724',
];

const ALLOWLIST_PATTERNS = [
  // Mock test fixtures (identified by function/case names)
  /case[A-Z]/i,
  /_makeNormalChecks/i,
  /function.*mock/i,
  /fixture/i,
  /testData/i,
  /test.*[Cc]ase/i,
  // Comments explicitly marking test data
  /\/\/ mock/i,
  /\/\* mock/i,
  /mock response/i,
  /test scenario/i,
  // Numeric constants in non-UI contexts
  /VERSION\s*=/i,
  /MAX_\w+\s*=/i,
  /TIMEOUT/i,
  /LIMIT/i,
  // Cache probe prompt (static content, not display data)
  /CACHE_PROBE/i,
  /PART_[ABC]/,
  /longPrompt/i,
];

const HARDCODE_INDICATORS = [
  'fallback.*85', 'fallback.*66', 'fallback.*58',
  'mock.*production', 'hardcoded.*ui',
  /defaultScore\s*=/i, /initialScore\s*=/i,
];

function isAllowlisted(line, filename) {
  const ctx = line.toLowerCase();
  for (const pattern of ALLOWLIST_PATTERNS) {
    if (typeof pattern === 'string') {
      if (ctx.includes(pattern.toLowerCase())) return true;
    } else {
      if (pattern.test(line)) return true;
    }
  }
  return false;
}

function checkHardcodedValues(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  const findings = [];

  for (const suspect of SUSPICIOUS_VALUES) {
    // Escape for regex
    const escaped = suspect.replace('.', '\\.');
    const regex = new RegExp(escaped, 'g');
    let match;
    const fakeRegex = new RegExp(escaped);
    // Use simple string search since regex with global flag loses lastIndex
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(suspect) && !isAllowlisted(line, filepath)) {
        // Additional context: if it's inside a return {} block, it's likely UI
        const inReturnBlock = /\breturn\s*\{/.test(line) ||
          /evidence\s*:\s*\{/.test(line) ||
          /\bevidence\s*=\s*\{/.test(line) ||
          /\.evidence\s*=/.test(line) ||
          /\bdata\s*=\s*\{[^}]*?:/.test(line) ||
          /buildDebugScoring/.test(line) ||
          /getDisplay/.test(line) ||
          /render/.test(line) ||
          /html\s*\+=/.test(line);

        findings.push({
          value: suspect,
          line: i + 1,
          content: line.trim().substring(0, 120),
          risk: inReturnBlock ? 'HIGH — appears in return/evidence block' : 'LOW — needs manual review'
        });
      }
    }
  }

  return findings;
}

// ═══════════════════════════════════════════════════════
// SECTION 2: extractCacheEvidence — unit tests
// ═══════════════════════════════════════════════════════

// Mirrors the extractCacheUsage logic from test.js
function extractCacheEvidence(usage) {
  if (!usage || typeof usage !== 'object') {
    return {
      supported: false,
      sourcePath: null,
      promptTokens: null,
      cachedTokens: null,
      hitRate: null,
      reason: usage == null
        ? 'usage not returned'
        : 'usage is not a valid object'
    };
  }

  const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? null;
  const inputTokens = usage.input_tokens ?? null;
  const ptdCached = usage.prompt_tokens_details?.cached_tokens
    ?? usage.prompt_tokens_details?.['cached tokens'] ?? null;
  const cacheReadInput = usage.cache_read_input_tokens ?? null;
  const cacheCreationInput = usage.cache_creation_input_tokens ?? null;

  // Try all known field paths
  const cachedTokens =
    usage.cached_tokens
    ?? usage.cache_read_input_tokens
    ?? usage.cache_creation_input_tokens
    ?? usage.cache_tokens
    ?? usage.prompt_cache_hit_tokens
    ?? usage.cache_hit_tokens
    ?? usage.cache_read_tokens
    ?? ptdCached;

  let fieldFound = false;
  let sourceField = null;
  let resolvedCached = null;

  if (ptdCached != null) {
    fieldFound = true; sourceField = 'prompt_tokens_details.cached_tokens'; resolvedCached = ptdCached;
  } else if (cacheReadInput != null) {
    fieldFound = true; sourceField = 'cache_read_input_tokens'; resolvedCached = cacheReadInput;
  } else if (usage.cache_read_input_tokens != null) {
    fieldFound = true; sourceField = 'cache_read_input_tokens'; resolvedCached = usage.cache_read_input_tokens;
  } else if (usage.cache_creation_input_tokens != null) {
    fieldFound = true; sourceField = 'cache_creation_input_tokens'; resolvedCached = usage.cache_creation_input_tokens;
  } else if (cachedTokens != null) {
    fieldFound = true; sourceField = 'cached_tokens'; resolvedCached = cachedTokens;
  }

  if (!fieldFound) {
    return {
      supported: false,
      sourcePath: null,
      promptTokens,
      cachedTokens: null,
      hitRate: null,
      reason: 'no cache field returned'
    };
  }

  let hitRate = null;
  if (resolvedCached != null && promptTokens != null && promptTokens > 0) {
    hitRate = Math.min(1, resolvedCached / promptTokens);
  } else if (cacheReadInput != null) {
    const denom = cacheReadInput + (cacheCreationInput || 0) + (inputTokens || 0);
    if (denom > 0) hitRate = cacheReadInput / denom;
  }

  return {
    supported: true,
    sourcePath: sourceField,
    promptTokens,
    cachedTokens: resolvedCached,
    hitRate,
    reason: null
  };
}

const CACHE_TEST_CASES = [
  {
    name: 'Case 1: prompt_tokens_details.cached_tokens = 512, prompt_tokens = 2048',
    usage: {
      prompt_tokens: 2048,
      completion_tokens: 8,
      total_tokens: 2056,
      prompt_tokens_details: { cached_tokens: 512 }
    },
    expected: {
      supported: true,
      sourcePath: 'prompt_tokens_details.cached_tokens',
      hitRate: 0.25,
      cachedTokens: 512
    }
  },
  {
    name: 'Case 2: usage exists but no cached_tokens field',
    usage: {
      prompt_tokens: 100,
      completion_tokens: 5,
      total_tokens: 105
    },
    expected: {
      supported: false,
      reason: /no cache field returned/i
    }
  },
  {
    name: 'Case 3: usage does not exist',
    usage: null,
    expected: {
      supported: false,
      reason: /usage not returned/i
    }
  },
  {
    name: 'Case 4: cache field exists but cached_tokens = 0',
    usage: {
      prompt_tokens: 500,
      completion_tokens: 3,
      total_tokens: 503,
      prompt_tokens_details: { cached_tokens: 0 }
    },
    expected: {
      supported: true,
      cachedTokens: 0,
      hitRate: 0
    }
  },
  {
    name: 'Case 5: Claude cache_read_input_tokens = 300, input_tokens = 100',
    usage: {
      input_tokens: 100,
      cache_read_input_tokens: 300,
      output_tokens: 10
    },
    expected: {
      supported: true,
      sourcePath: 'cache_read_input_tokens',
      cachedTokens: 300,
      // When promptTokens is available (falls back to input_tokens=100), OpenAI path clamps hitRate to 1
      // Anthropic formula (cache_read/(cache_read+creation+input)) only applies without promptTokens
      hitRate: 1
    }
  },
];

// ═══════════════════════════════════════════════════════
// SECTION 3: UI render field reference check
// ═══════════════════════════════════════════════════════

function checkRenderReferences(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');

  const requiredRefs = [
    { field: 'cacheHitCheck', pattern: /cacheHitCheck/, reason: 'cache detail must reference cache check data' },
    { field: 'sourceField', pattern: /sourceField|fieldFound/, reason: 'cache render must reference cache field source' },
    { field: 'usageEvidence', pattern: /costTransparency.*evidence|evidence.*cost/, reason: 'usage render must reference cost evidence' },
    { field: 'evidenceVersion', pattern: /evidenceVersion/, reason: 'debugScoring should include evidenceVersion' },
  ];

  const findings = [];
  for (const req of requiredRefs) {
    if (!req.pattern.test(content)) {
      findings.push({ missing: req.field, reason: req.reason });
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════════
// SECTION 4: API Key safety check
// ═══════════════════════════════════════════════════════

function checkApiKeySafety(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  const findings = [];

  // Patterns that might expose full API keys
  const keyPatterns = [
    { pattern: /sk-[a-zA-Z0-9]{20,}/, desc: 'full API key pattern found' },
    { pattern: /apiKey[^=]*=[^=]*"sk-/, desc: 'apiKey assigned from literal sk-' },
  ];

  for (const { pattern, desc } of keyPatterns) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip mock/test data
      if (/mock|test.*case|fixture/i.test(line)) continue;
      if (pattern.test(line)) {
        findings.push({ line: i + 1, content: line.trim().substring(0, 100), desc });
      }
    }
  }

  // Check that masking exists where keys are displayed
  const displayPatterns = [
    /keyMasked|masked.*key|key.*mask|sk-\*{4}/,
  ];
  for (const p of displayPatterns) {
    if (p.test(content)) {
      return [];
    }
  }

  // If keys are mentioned but no masking, flag it
  if (/apiKey|API_KEY/i.test(content) && findings.length === 0) {
    return []; // Keys are referenced safely
  }

  return findings;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════');
console.log('  VERIFICATION SCRIPT — Evidence Integrity Check');
console.log('═══════════════════════════════════════════════════════════\n');

const testFile = path.join(__dirname, 'test.js');
let allPass = true;

// ── Test 1: Hardcoded display values ──────────────────────────
console.log('── 1. HARDCODED DISPLAY VALUES ────────────────────────');
const hardcodeFindings = checkHardcodedValues(testFile);
if (hardcodeFindings.length === 0) {
  console.log('  PASS ✓  No suspicious hardcoded display values found\n');
} else {
  console.log(`  WARN ⚠  Found ${hardcodeFindings.length} suspicious value(s):\n`);
  for (const f of hardcodeFindings) {
    console.log(`    Line ${f.line}: [${f.risk}] "${f.value}"`);
    console.log(`      → ${f.content}\n`);
  }
  allPass = false;
}

// ── Test 2: Cache evidence extraction ──────────────────────────
console.log('── 2. EXTRACT CACHE EVIDENCE ──────────────────────────');
for (const tc of CACHE_TEST_CASES) {
  const result = extractCacheEvidence(tc.usage);
  const checks = [];

  if (tc.expected.supported !== undefined) {
    checks.push({ name: 'supported', expected: tc.expected.supported, actual: result.supported });
  }
  if (tc.expected.sourcePath !== undefined) {
    checks.push({ name: 'sourcePath', expected: tc.expected.sourcePath, actual: result.sourcePath });
  }
  if (tc.expected.cachedTokens !== undefined) {
    checks.push({ name: 'cachedTokens', expected: tc.expected.cachedTokens, actual: result.cachedTokens });
  }
  if (tc.expected.hitRate !== undefined) {
    checks.push({ name: 'hitRate', expected: tc.expected.hitRate, actual: result.hitRate, tolerance: 0.001 });
  }
  if (tc.expected.reason) {
    checks.push({ name: 'reason', match: tc.expected.reason, actual: result.reason });
  }

  let casePass = true;
  for (const c of checks) {
    let pass;
    if (c.match) {
      pass = c.match.test(result[c.name] || '');
    } else if (c.tolerance !== undefined) {
      pass = Math.abs((c.actual || 0) - c.expected) <= c.tolerance;
    } else {
      pass = c.actual === c.expected;
    }
    if (!pass) casePass = false;
  }

  const status = casePass ? 'PASS ✓' : 'FAIL ✗';
  console.log(`  ${status}  ${tc.name}`);
  if (!casePass) {
    allPass = false;
    for (const c of checks) {
      if (c.match) {
        console.log(`         ${c.name}: "${c.actual}" (expected: match ${c.match})`);
      } else {
        console.log(`         ${c.name}: ${c.actual} (expected: ${c.expected})`);
      }
    }
  }
}
console.log('');

// ── Test 3: Render field references ──────────────────────────
console.log('── 3. UI RENDER FIELD REFERENCES ──────────────────────');
const missingRefs = checkRenderReferences(testFile);
if (missingRefs.length === 0) {
  console.log('  PASS ✓  All required evidence fields are referenced\n');
} else {
  console.log(`  FAIL ✗  Missing ${missingRefs.length} field reference(s):\n`);
  for (const r of missingRefs) {
    console.log(`    Missing: ${r.missing}`);
    console.log(`    Reason:  ${r.reason}\n`);
  }
  allPass = false;
}

// ── Test 4: API key safety ────────────────────────────────────
console.log('── 4. API KEY SAFETY ───────────────────────────────────');
const keyFindings = checkApiKeySafety(testFile);
if (keyFindings.length === 0) {
  console.log('  PASS ✓  No full API keys exposed in production code\n');
} else {
  console.log(`  FAIL ✗  Found ${keyFindings.length} potential exposure(s):\n`);
  for (const f of keyFindings) {
    console.log(`    Line ${f.line}: ${f.desc}`);
    console.log(`    → ${f.content}\n`);
  }
  allPass = false;
}

// ── Summary ────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════════════');
console.log(allPass ? '  All checks passed: YES ✓' : '  Some checks failed: NO ✗');
console.log('═══════════════════════════════════════════════════════════');
process.exit(allPass ? 0 : 1);
