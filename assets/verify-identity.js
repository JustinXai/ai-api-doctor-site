'use strict';

/*
 * AI API Doctor — Identity Classification Verification Script
 * Verifies evaluateModelIdentity and target consistency logic.
 * Mirrors the functions from test.js for isolated testing.
 */

// ─── Helpers ───────────────────────────────────────────────

function getDocLang() { return 'zh'; }

function normalizeModelId(id) {
  return String(id || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const STRONG_PLATFORM_ENTITIES = [
  'windsurf', 'windsurf cascade', 'windsurf editor',
  'cursor', 'cursor ide', 'cursor agent', 'cursor composer',
  'cline', 'cline agent',
  'continue', 'continue.dev', 'continue agent',
  'codeium', 'cognition', 'devin', 'devin agent',
  'agent command center',
  'github copilot', 'copilot', 'copilot chat', 'copilot coding agent', 'copilot agent',
  'azure', 'azure openai', 'azure ai', 'azure ai foundry',
  'microsoft foundry', 'foundry models', 'foundry agent',
  'microsoft copilot',
  'aws', 'amazon web services', 'aws bedrock', 'amazon bedrock',
  'bedrock', 'bedrock marketplace', 'sagemaker', 'amazon sagemaker',
  'amazon q', 'amazon q developer', 'q developer', 'aws q', 'aws agent',
  'vertex', 'vertex ai', 'google vertex', 'google cloud vertex',
  'google ai studio', 'ai studio', 'gemini api', 'model garden',
  'google cloud', 'gemini cli', 'antigravity',
  'claude code', 'claude-code',
  'anthropic console', 'anthropic workbench',
  'replit', 'replit agent',
  'lovable', 'bolt', 'bolt.new', 'v0', 'vercel v0',
  'stackblitz', 'codesandbox',
  'kiro', 'kiro ide', 'kiro cli',
  'vscode agent', 'vs code agent',
  'zed', 'zed ai', 'zed assistant',
  'trae', 'trae ai',
  'tabnine', 'sourcegraph cody', 'cody', 'supermaven',
  'augment', 'augment code', 'aider',
  'roo code', 'roocode', 'kilocode', 'kilo code',
  'openrouter', 'openrouter.ai',
];

const NEGATIVE_IDENTITY_PATTERNS = [
  "i don't have access", 'i do not have access', 'i cannot access',
  "i can't access", "i can't verify", 'i cannot verify', "i can't confirm",
  "i can't determine", 'i cannot determine', "i can't identify",
  "i don't know", 'i do not know', "i don't",
  "i don't have information", 'i do not have information', 'no information about',
  "i'm an ai", 'i am an ai',
  'ai language model', 'language model', 'ai assistant',
  'ai model', 'a language model',
  "can't provide", "cannot provide", 'unable to provide', 'not able to provide',
  'not available', 'not applicable', 'not provided',
  'no access to', 'without access to',
  'unknown model', 'model unknown', 'model is unknown',
  'cannot confirm', 'unable to confirm',
  '保密', '无法确认', '不确定', '不知道', '无权限', '无法访问',
  '不知道模型', '不知道运行', '无法判断',
];

const CONTAMINATION_PATTERNS = [
  'i am a kiro', 'i am cursor', 'i am cline', 'i am continue',
  'i am an ide',
  'i am a plugin', 'i am an extension', 'i am a wrapper',
  // 'i am windsurf' intentionally excluded → "I am Windsurf" should be platform_or_proxy_identity, not hard_contamination
  'i am running in',
  'responsible for managing your project',
  'i can manage your project files',
  'i can modify your codebase',
  'i can execute commands',
  'i can read your workspace',
  'i can access your working directory',
  'i can edit your codebase',
  'as a kiro development environment',
  'as a cursor agent',
  'as a cline agent',
  'as a replit agent',
  'as a coding assistant i can',
  'tool personality',
  '系统提示', 'system prompt', 'wrapper prompt', 'tool prompt',
  '内部 wrapper', '人格污染', '开发环境污染',
];

function extractDetectedSource(text) {
  const t = text.toLowerCase();
  for (const src of STRONG_PLATFORM_ENTITIES) {
    if (t.includes(src)) return src;
  }
  return null;
}

function isNegativeUnknownResponse(text) {
  const t = text.toLowerCase();
  return NEGATIVE_IDENTITY_PATTERNS.some(p => t.includes(p));
}

function hasStrongEntity(text) {
  const t = text.toLowerCase();
  return STRONG_PLATFORM_ENTITIES.some(e => t.includes(e));
}

function hasWeakPlatformWord(text) {
  const t = text.toLowerCase();
  const WEAK_PLATFORM_WORDS = [
    'gateway', 'api gateway', 'openai-compatible', 'openai compatible',
    'relay', 'proxy', 'reverse proxy', 'router', 'route',
    'model router', 'llm router',
    'serving platform', 'model platform', 'inference platform',
    'gateway model',
    '中转', '中转站', '转发', '反代', '代理', '网关', '路由',
    '模型平台', '推理平台',
  ];
  return WEAK_PLATFORM_WORDS.some(w => t.includes(w));
}

function hasContamination(text) {
  const t = text.toLowerCase();
  return CONTAMINATION_PATTERNS.some(p => t.includes(p));
}

function detectFamilyFromText(text) {
  const t = text.toLowerCase();
  if (t.includes('claude') || t.includes('anthropic')) return 'claude';
  if (t.includes('gpt') || t.includes('chatgpt') || t.includes('openai')) return 'gpt';
  if (t.includes('gemini') || t.includes('google')) return 'gemini';
  if (t.includes('llama') || t.includes('meta')) return 'llama';
  if (t.includes('qwen') || t.includes('alibaba')) return 'qwen';
  if (t.includes('deepseek')) return 'deepseek';
  if (t.includes('mistral') || t.includes('mixtral')) return 'mistral';
  if (t.includes('grok') || t.includes('xai')) return 'grok';
  if (/^o[1-4]/.test(t)) return 'oai';
  return 'unknown';
}

function extractVariant(text) {
  const t = text.toLowerCase();
  if (t.includes('opus')) return 'opus';
  if (t.includes('sonnet')) return 'sonnet';
  if (t.includes('haiku')) return 'haiku';
  if (/\b4o(?:-mini)?/.test(t)) return '4o-mini';
  if (/\bgpt-4\b/.test(t) && !/\b4o\b/.test(t)) return '4';
  if (/\bgpt-3/.test(t)) return '3';
  if (/\b5\.\d+(?:-pro|-mini|-codex)?/.test(t)) {
    const m = t.match(/\b(5\.\d+(?:-pro|-mini|-codex)?)/);
    if (m) return m[1];
  }
  if (/[qo]\d(?:\.\d+)?/.test(t)) {
    const m = t.match(/([qo]\d(?:\.\d+)?)/);
    if (m) return m[1];
  }
  if (t.includes('gemini')) {
    if (t.includes('flash')) return 'flash';
    if (t.includes('pro')) return 'pro';
    if (t.includes('ultra')) return 'ultra';
    return 'gemini';
  }
  if (t.includes('deepseek')) return 'deepseek';
  if (t.includes('qwen')) return 'qwen';
  return null;
}

function computeTargetConsistency(t, targetLower) {
  const respFamily = detectFamilyFromText(t);
  const targetFamily = detectFamilyFromText(targetLower);
  const respVariant = extractVariant(t);
  const targetVariant = extractVariant(targetLower);
  const respVersion = t.match(/\d+(?:\.\d+)+/)?.[0] || null;
  const targetVersion = targetLower.match(/\d+(?:\.\d+)+/)?.[0] || null;

  if (respFamily !== 'unknown' && targetFamily !== 'unknown' && respFamily !== targetFamily) {
    return {
      targetConsistency: 'version_mismatch',
      detectedVariant: respVariant,
      detectedVersion: respVersion,
      detectedFamily: respFamily,
    };
  }

  if (respVariant && targetVariant) {
    const sameVariant = respVariant === targetVariant ||
      respVariant.includes(targetVariant) ||
      targetVariant.includes(respVariant) ||
      (respFamily === 'gpt' && respVariant.startsWith('4') && targetVariant.startsWith('4')) ||
      (respFamily === 'gpt' && respVariant.startsWith('5') && targetVariant.startsWith('5')) ||
      (respFamily === 'gemini' && respVariant === 'gemini' && targetVariant === 'gemini');
    if (!sameVariant) {
      return {
        targetConsistency: 'variant_mismatch',
        detectedVariant: respVariant,
        detectedVersion: respVersion,
        detectedFamily: respFamily,
      };
    }
  }

  if (respVersion && targetVersion && respVersion !== targetVersion) {
    return {
      targetConsistency: 'version_mismatch',
      detectedVariant: respVariant,
      detectedVersion: respVersion,
      detectedFamily: respFamily,
    };
  }

  if (respVariant && targetVariant) {
    return {
      targetConsistency: 'match',
      detectedVariant: respVariant,
      detectedVersion: respVersion,
      detectedFamily: respFamily,
    };
  }

  if (respFamily !== 'unknown' && targetFamily !== 'unknown') {
    return {
      targetConsistency: 'family_match',
      detectedVariant: respVariant,
      detectedVersion: respVersion,
      detectedFamily: respFamily,
    };
  }

  return {
    targetConsistency: 'unknown',
    detectedVariant: respVariant,
    detectedVersion: respVersion,
    detectedFamily: respFamily,
  };
}

function evaluateModelIdentity(identityText, finalTestModelId) {
  const zh = getDocLang() !== 'en';
  const t = identityText.toLowerCase().trim();
  const targetLower = normalizeModelId(finalTestModelId).toLowerCase();
  const rawResponse = identityText.trim();

  if (hasContamination(rawResponse)) {
    const tc = computeTargetConsistency(t, targetLower);
    return {
      category: 'hard_contamination',
      score: 0,
      reason: 'Model response shows development environment, tool persona or system prompt contamination',
      detectedSource: extractDetectedSource(rawResponse),
      targetConsistency: tc.targetConsistency,
      detectedVariant: tc.detectedVariant,
      detectedVersion: tc.detectedVersion,
      detectedFamily: tc.detectedFamily,
    };
  }

  if (isNegativeUnknownResponse(rawResponse)) {
    const tc = computeTargetConsistency(t, targetLower);
    return {
      category: 'ambiguous',
      score: 1.5,
      reason: `Model self-reported identity is vague: ${rawResponse}`,
      detectedSource: null,
      targetConsistency: tc.targetConsistency,
      detectedVariant: tc.detectedVariant,
      detectedVersion: tc.detectedVersion,
      detectedFamily: tc.detectedFamily,
    };
  }

  const respFamily = detectFamilyFromText(t);
  const targetFamily = detectFamilyFromText(targetLower);
  const isWrongFamily = respFamily !== 'unknown' && targetFamily !== 'unknown' && respFamily !== targetFamily;
  const explicitFamilyConflict = (
    (targetLower.includes('claude') && (t.includes('gpt') || t.includes('openai') || t.includes('gemini'))) ||
    (targetLower.includes('gpt') && (t.includes('claude') || t.includes('anthropic'))) ||
    (targetLower.includes('gemini') && (t.includes('gpt') || t.includes('claude'))) ||
    (targetLower.includes('llama') && t.includes('gpt')) ||
    (targetLower.includes('qwen') && (t.includes('gpt') || t.includes('claude')))
  );

  if (isWrongFamily || explicitFamilyConflict) {
    const tc = computeTargetConsistency(t, targetLower);
    return {
      category: 'wrong_family',
      score: 0,
      reason: 'Model self-reported family conflicts with target Model ID',
      detectedSource: extractDetectedSource(rawResponse),
      targetConsistency: tc.targetConsistency,
      detectedVariant: tc.detectedVariant,
      detectedVersion: tc.detectedVersion,
      detectedFamily: tc.detectedFamily,
    };
  }

  const exactMatch = t.includes(targetLower) ||
    targetLower.includes(t) ||
    (targetLower.startsWith('gpt') && (t.startsWith('gpt') || t.includes('gpt') || t.includes('chatgpt'))) ||
    (targetLower.includes('claude') && t.includes('claude')) ||
    (targetLower.startsWith('o') && t.includes(targetLower.split(/\s/)[0])) ||
    (targetLower.includes('gemini') && t.includes('gemini')) ||
    (targetLower.includes('gpt') && t.includes('openai') && !hasStrongEntity(rawResponse) && !hasWeakPlatformWord(rawResponse)) ||
    t.split(/\s/)[0].split('-')[0] === targetLower.split(/\s/)[0].split('-')[0];

  if (exactMatch) {
    const tc = computeTargetConsistency(t, targetLower);
    if (tc.targetConsistency === 'match') {
      return {
        category: 'exact_match',
        score: 6,
        reason: 'Model identity matches target',
        detectedSource: null,
        targetConsistency: tc.targetConsistency,
        detectedVariant: tc.detectedVariant,
        detectedVersion: tc.detectedVersion,
        detectedFamily: tc.detectedFamily,
      };
    } else {
      return {
        category: 'family_match',
        score: 4,
        reason: 'Model in same family but version inconsistent',
        detectedSource: null,
        targetConsistency: tc.targetConsistency,
        detectedVariant: tc.detectedVariant,
        detectedVersion: tc.detectedVersion,
        detectedFamily: tc.detectedFamily,
      };
    }
  }

  const hasStrong = hasStrongEntity(rawResponse);
  if (hasStrong) {
    const tc = computeTargetConsistency(t, targetLower);
    return {
      category: 'platform_or_proxy_identity',
      score: 3,
      reason: `Platform proxy layer identity detected (${extractDetectedSource(rawResponse)})`,
      detectedSource: extractDetectedSource(rawResponse),
      targetConsistency: tc.targetConsistency,
      detectedVariant: tc.detectedVariant,
      detectedVersion: tc.detectedVersion,
      detectedFamily: tc.detectedFamily,
    };
  }

  if (respFamily !== 'unknown') {
    const tc = computeTargetConsistency(t, targetLower);
    return {
      category: 'family_match',
      score: 4,
      reason: 'Model self-reported as same family',
      detectedSource: null,
      targetConsistency: tc.targetConsistency,
      detectedVariant: tc.detectedVariant,
      detectedVersion: tc.detectedVersion,
      detectedFamily: tc.detectedFamily,
    };
  }

  const tc = computeTargetConsistency(t, targetLower);
  return {
    category: 'ambiguous',
    score: 1.5,
    reason: `Model self-reported identity unclear: ${rawResponse}`,
    detectedSource: null,
    targetConsistency: tc.targetConsistency,
    detectedVariant: tc.detectedVariant,
    detectedVersion: tc.detectedVersion,
    detectedFamily: tc.detectedFamily,
  };
}

// ─── Test Cases ───────────────────────────────────────────────

const TEST_CASES = [
  {
    name: 'Case 1: target=claude-opus-4-7, answer=Claude 3.5 Sonnet',
    target: 'claude-opus-4-7',
    answer: 'Claude 3.5 Sonnet (Anthropic)',
    checks: [
      { field: 'category', expected: 'family_match', desc: 'status must NOT be platform_or_proxy_identity' },
      { field: 'category', forbidden: 'platform_or_proxy_identity', desc: 'must NOT be platform_or_proxy_identity' },
      { field: 'targetConsistency', oneOf: ['variant_mismatch', 'version_mismatch'], desc: 'targetConsistency should be mismatch' },
    ]
  },
  {
    name: 'Case 2: target=claude-sonnet-4-6, answer=Claude 3.5 Sonnet',
    target: 'claude-sonnet-4-6',
    answer: 'Claude 3.5 Sonnet (Anthropic)',
    checks: [
      { field: 'category', forbidden: 'platform_or_proxy_identity', desc: 'must NOT be platform_or_proxy_identity' },
      { field: 'category', forbidden: 'wrong_family', desc: 'must NOT be wrong_family' },
      { field: 'detectedFamily', expected: 'claude', desc: 'detectedFamily should be claude' },
      { field: 'detectedVariant', expected: 'sonnet', desc: 'detectedVariant should be sonnet' },
    ]
  },
  {
    name: 'Case 3: target=claude-opus-4-7, answer=Claude',
    target: 'claude-opus-4-7',
    answer: 'Claude',
    checks: [
      { field: 'category', expected: 'family_match', desc: 'should be family_match, not failure' },
      { field: 'category', forbidden: 'failed', desc: 'must NOT be failed' },
      { field: 'targetConsistency', expected: 'family_match', desc: 'bare Claude → family_match (no variant detected)' },
    ]
  },
  {
    name: 'Case 4: target=claude-opus-4-7, answer=I am Windsurf',
    target: 'claude-opus-4-7',
    answer: 'I am Windsurf, an AI coding assistant',
    checks: [
      { field: 'category', expected: 'platform_or_proxy_identity', desc: 'should be platform_or_proxy_identity' },
      { field: 'detectedSource', expected: 'windsurf', desc: 'detectedSource should be windsurf' },
      { field: 'category', forbidden: 'wrong_family', desc: 'must NOT be wrong_family (windsurf is not claude)' },
    ]
  },
  {
    name: 'Case 5: target=gpt-5.2-pro, answer=I am GPT-4o',
    target: 'gpt-5.2-pro',
    answer: 'I am GPT-4o',
    checks: [
      { field: 'category', forbidden: 'platform_or_proxy_identity', desc: 'must NOT be platform_or_proxy_identity' },
      { field: 'category', oneOf: ['family_match', 'exact_match'], desc: 'should be family or exact match (same family GPT)' },
      { field: 'detectedFamily', expected: 'gpt', desc: 'detectedFamily should be gpt' },
    ]
  },
  {
    name: 'Case 6: target=gemini-2.5-pro, answer=I am Gemini, by Google',
    target: 'gemini-2.5-pro',
    answer: 'I am Gemini, by Google',
    checks: [
      { field: 'category', oneOf: ['family_match', 'exact_match'], desc: 'should be family or exact match' },
      { field: 'category', forbidden: 'platform_or_proxy_identity', desc: 'must NOT be platform_or_proxy_identity' },
      { field: 'detectedFamily', expected: 'gemini', desc: 'detectedFamily should be gemini' },
    ]
  },
  {
    name: 'Case 7: target=gpt-4o-mini, answer=I cannot access my model name',
    target: 'gpt-4o-mini',
    answer: 'I cannot access my model name',
    checks: [
      { field: 'category', expected: 'ambiguous', desc: 'should be ambiguous, not platform_or_proxy_identity' },
      { field: 'category', forbidden: 'platform_or_proxy_identity', desc: 'must NOT be platform_or_proxy_identity' },
    ]
  },
  {
    name: 'Case 8: "sonnet" must NOT be classified as GPT family',
    target: 'gpt-4o',
    answer: 'Sonnet 3.5',
    checks: [
      { field: 'category', forbidden: 'wrong_family', desc: 'must NOT be wrong_family — sonnet without claude prefix is ambiguous, not GPT' },
    ]
  },
  {
    name: 'Case 9: target=claude-3-haiku, answer=Claude 3 Haiku',
    target: 'claude-3-haiku',
    answer: 'Claude 3 Haiku',
    checks: [
      { field: 'category', expected: 'exact_match', desc: 'should be exact_match' },
      { field: 'targetConsistency', expected: 'match', desc: 'targetConsistency should be match' },
      { field: 'detectedVariant', expected: 'haiku', desc: 'detectedVariant should be haiku' },
    ]
  },
  {
    name: 'Case 10: target=claude-opus-4-7, answer=Windsurf',
    target: 'claude-opus-4-7',
    answer: 'Windsurf',
    checks: [
      { field: 'category', expected: 'platform_or_proxy_identity', desc: 'Windsurf alone → platform_or_proxy_identity' },
      { field: 'detectedSource', expected: 'windsurf', desc: 'detectedSource should be windsurf' },
    ]
  },
  // ─── New RC test cases ───────────────────────────────────
  {
    name: 'Case 11: answer=Windsurf, target=claude-opus-4-7 (RC)',
    target: 'claude-opus-4-7',
    answer: 'Windsurf',
    checks: [
      { field: 'category', expected: 'platform_or_proxy_identity', desc: 'should be platform_or_proxy_identity' },
      { field: 'detectedSource', expected: 'windsurf', desc: 'should be windsurf' },
    ]
  },
  {
    name: 'Case 12: answer=I am Kiro, target=claude-sonnet-4-6 (RC)',
    target: 'claude-sonnet-4-6',
    answer: 'I am Kiro, an AI coding assistant',
    checks: [
      { field: 'category', expected: 'platform_or_proxy_identity', desc: 'should be platform_or_proxy_identity' },
      { field: 'detectedSource', expected: 'kiro', desc: 'should be kiro' },
    ]
  },
  {
    name: 'Case 13: answer=Azure OpenAI GPT-4, target=gpt-4o-mini (RC)',
    target: 'gpt-4o-mini',
    answer: 'Azure OpenAI GPT-4',
    checks: [
      { field: 'category', oneOf: ['exact_match', 'platform_or_proxy_identity'], desc: 'should be exact_match or platform_or_proxy_identity' },
      { field: 'category', forbidden: 'wrong_family', desc: 'must NOT be wrong_family' },
      { field: 'category', forbidden: 'failed', desc: 'must NOT be failed' },
    ]
  },
  {
    name: 'Case 14: answer=AWS Bedrock Claude, target=claude-sonnet-4-6 (RC)',
    target: 'claude-sonnet-4-6',
    answer: 'AWS Bedrock Claude',
    checks: [
      { field: 'category', oneOf: ['exact_match', 'family_match', 'platform_or_proxy_identity'], desc: 'should be family_match or platform_or_proxy_identity' },
      { field: 'category', forbidden: 'wrong_family', desc: 'must NOT be wrong_family' },
      { field: 'category', forbidden: 'failed', desc: 'must NOT be failed' },
    ]
  },
  {
    name: 'Case 15: answer=Claude, target=claude-opus-4-7 (RC)',
    target: 'claude-opus-4-7',
    answer: 'Claude',
    checks: [
      { field: 'category', expected: 'family_match', desc: 'should be family_match' },
      { field: 'targetConsistency', expected: 'family_match', desc: 'should be family_match' },
      { field: 'category', forbidden: 'platform_or_proxy_identity', desc: 'must NOT be platform_or_proxy_identity' },
    ]
  },
  {
    name: 'Case 16: answer=Claude 3.5 Sonnet, target=claude-opus-4-7 (RC)',
    target: 'claude-opus-4-7',
    answer: 'Claude 3.5 Sonnet',
    checks: [
      { field: 'category', expected: 'family_match', desc: 'should be family_match (same family)' },
      { field: 'category', forbidden: 'platform_or_proxy_identity', desc: 'must NOT be platform_or_proxy_identity' },
      { field: 'detectedVariant', expected: 'sonnet', desc: 'should detect sonnet' },
    ]
  },
  {
    name: 'Case 17: answer=I cannot access my model name, target=gpt-4o-mini (RC)',
    target: 'gpt-4o-mini',
    answer: 'I cannot access my model name',
    checks: [
      { field: 'category', expected: 'ambiguous', desc: 'should be ambiguous' },
      { field: 'category', forbidden: 'platform_or_proxy_identity', desc: 'must NOT be platform_or_proxy_identity' },
    ]
  },
];

// ─── Run Tests ───────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════');
console.log('  VERIFICATION SCRIPT — Identity Classification Tests');
console.log('═══════════════════════════════════════════════════════════\n');

let allPass = true;

for (const tc of TEST_CASES) {
  const result = evaluateModelIdentity(tc.answer, tc.target);
  let casePass = true;
  const reasons = [];

  for (const check of tc.checks) {
    const actual = result[check.field];
    let pass = false;

    if (check.forbidden) {
      pass = actual !== check.forbidden;
      if (!pass) reasons.push(`FAIL: ${check.field}=${actual} (forbidden: ${check.forbidden})`);
    } else if (check.expected !== undefined) {
      pass = actual === check.expected;
      if (!pass) reasons.push(`FAIL: ${check.field}=${actual} (expected: ${check.expected})`);
    } else if (check.oneOf) {
      pass = check.oneOf.includes(actual);
      if (!pass) reasons.push(`FAIL: ${check.field}=${actual} (expected one of: ${check.oneOf.join(', ')})`);
    }

    if (!pass) casePass = false;
  }

  const status = casePass ? 'PASS ✓' : 'FAIL ✗';
  console.log(`${status}  ${tc.name}`);
  console.log(`       category=${result.category}  tc=${result.targetConsistency}  family=${result.detectedFamily}  variant=${result.detectedVariant}`);
  if (!casePass) {
    allPass = false;
    for (const r of reasons) console.log(`       ${r}`);
  }
  console.log('');
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════════════');
console.log(allPass ? '  All tests passed: YES ✓' : '  Some tests failed: NO ✗');
console.log('═══════════════════════════════════════════════════════════');
process.exit(allPass ? 0 : 1);
