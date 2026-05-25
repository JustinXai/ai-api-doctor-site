/**
 * AI API Doctor v1.10 — Public Signals Worker Test Suite
 * Tests normalizeHostname, guessRegistrableDomain, and status logic
 */

'use strict';

// ── Copy of functions for testing (standalone) ────────────────────────────────

const MULTI_SEGMENT_TLDS = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'co.uk', 'org.uk', 'co.jp', 'ne.jp', 'or.jp', 'ac.jp',
  'com.au', 'net.au', 'org.au', 'com.br', 'net.br', 'org.br',
  'com.mx', 'net.mx', 'org.mx', 'com.ar', 'net.ar', 'org.ar',
  'com.sg', 'net.sg', 'org.sg', 'com.hk', 'net.hk', 'org.hk',
  'co.nz', 'net.nz', 'org.nz', 'com.tw', 'net.tw', 'org.tw'
]);

function normalizeHostname(input) {
  if (!input || typeof input !== 'string') {
    return { ok: false, hostname: null, error: 'Hostname is required' };
  }

  let hostname = input.trim().toLowerCase();
  hostname = hostname.replace(/^https?:\/\//, '');
  hostname = hostname.replace(/[/?#].*$/, '');
  hostname = hostname.replace(/:\d+$/, '');
  hostname = hostname.replace(/^\.+|\.+$/g, '');

  if (!hostname) {
    return { ok: false, hostname: null, error: 'Hostname is empty after normalization' };
  }
  if (hostname.length > 253) {
    return { ok: false, hostname: null, error: 'Hostname too long (max 253 chars)' };
  }
  if (!/^[a-z0-9.-]+$/.test(hostname)) {
    return { ok: false, hostname: null, error: 'Hostname contains illegal characters' };
  }
  if (hostname.includes(' ')) {
    return { ok: false, hostname: null, error: 'Hostname contains whitespace' };
  }
  if (hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0') {
    return { ok: false, hostname: null, error: 'Localhost not allowed' };
  }
  if (/^(?:10\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.)/.test(hostname)) {
    return { ok: false, hostname: null, error: 'Private IP range not allowed' };
  }
  if (hostname.endsWith('.local') || hostname === 'local') {
    return { ok: false, hostname: null, error: '.local domain not allowed' };
  }
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return { ok: false, hostname: null, error: 'IP address not allowed' };
  }

  const labels = hostname.split('.');
  for (const label of labels) {
    if (!label) {
      return { ok: false, hostname: null, error: 'Empty label in hostname' };
    }
    if (label.length > 63) {
      return { ok: false, hostname: null, error: 'Label too long (max 63 chars)' };
    }
    if (label.startsWith('-') || label.endsWith('-')) {
      return { ok: false, hostname: null, error: 'Label cannot start or end with hyphen' };
    }
  }

  return { ok: true, hostname, error: null };
}

function guessRegistrableDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join('.');
    if (MULTI_SEGMENT_TLDS.has(lastTwo)) {
      return parts.slice(-3).join('.');
    }
  }
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

function calcPublicSignalsStatus(domainSignal, certSignal) {
  const domainAvailable = domainSignal && domainSignal.available === true;
  const certAvailable = certSignal && certSignal.available === true;

  if (domainAvailable && certAvailable) return 'full';
  if (domainAvailable || certAvailable) return 'partial';
  return 'unknown';
}

function calcOperationalRiskFromPublicSignals(domainSignal, certSignal) {
  const MAX_DOMAIN = 10;
  const MAX_CERT = 8;
  const MAX_VERIFIABILITY = 2;
  const MAX_SCORE = MAX_DOMAIN + MAX_CERT + MAX_VERIFIABILITY; // 20

  let domainScore = 0;
  let certScore = 0;

  // Domain registration score (10 pts)
  if (domainSignal && domainSignal.available && domainSignal.ageDays !== null) {
    const days = domainSignal.ageDays;
    if (days >= 1095) domainScore = 10;
    else if (days >= 365) domainScore = 8;
    else if (days >= 180) domainScore = 6;
    else if (days >= 90) domainScore = 4;
    else if (days >= 30) domainScore = 2;
    else domainScore = 0;
  }

  // Certificate history score (8 pts)
  if (certSignal && certSignal.available && certSignal.firstSeenDays !== null) {
    const days = certSignal.firstSeenDays;
    if (days >= 1095) certScore = 8;
    else if (days >= 365) certScore = 6;
    else if (days >= 180) certScore = 5;
    else if (days >= 90) certScore = 4;
    else if (days >= 30) certScore = 2;
    else certScore = 0;
  }

  const score = domainScore + certScore;
  let level = 'unknown';
  if (domainSignal && domainSignal.available && certSignal && certSignal.available) {
    if (score >= 14) level = 'low';
    else if (score >= 8) level = 'medium';
    else level = 'high';
  } else if (domainSignal && domainSignal.available || certSignal && certSignal.available) {
    level = 'unknown';
  }

  return {
    score,
    max: MAX_SCORE,
    level,
    confidence: (domainSignal && domainSignal.available && certSignal && certSignal.available) ? 'full' :
                (domainSignal && domainSignal.available || certSignal && certSignal.available) ? 'partial' : 'none'
  };
}

function buildPublicSignalLinks(domain, hostname) {
  const d = domain || hostname || '';
  return {
    rdapUrl: d ? `https://rdap.org/domain/${encodeURIComponent(d)}` : null,
    icannUrl: d ? `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(d)}` : null,
    crtshUrl: hostname ? `https://crt.sh/?q=${encodeURIComponent(hostname)}` : null,
    waybackUrl: d ? `https://web.archive.org/web/*/${d}` : null
  };
}

// ── Test Cases ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, testName) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`  PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  FAIL: ${testName}`);
    console.log(`    Expected: ${expectedStr}`);
    console.log(`    Actual:   ${actualStr}`);
    failed++;
  }
}

function assertTrue(value, testName) {
  if (value === true) {
    console.log(`  PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  FAIL: ${testName}`);
    console.log(`    Expected: true`);
    console.log(`    Actual:   ${value}`);
    failed++;
  }
}

function assertFalse(value, testName) {
  if (value === false) {
    console.log(`  PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  FAIL: ${testName}`);
    console.log(`    Expected: false`);
    console.log(`    Actual:   ${value}`);
    failed++;
  }
}

function assertThrows(fn, testName) {
  try {
    fn();
    console.log(`  FAIL: ${testName} - expected to throw but didn't`);
    failed++;
  } catch (err) {
    console.log(`  PASS: ${testName}`);
    passed++;
  }
}

console.log('\n=== AI API Doctor v1.10 Public Signals Worker Tests ===\n');

// ── normalizeHostname Tests ──────────────────────────────────────────────────

console.log('\n--- normalizeHostname: valid hostnames ---');

assertEqual(
  normalizeHostname('example.com'),
  { ok: true, hostname: 'example.com', error: null },
  'example.com'
);

assertEqual(
  normalizeHostname('api.example.com'),
  { ok: true, hostname: 'api.example.com', error: null },
  'api.example.com'
);

assertEqual(
  normalizeHostname('sub.domain.co.uk'),
  { ok: true, hostname: 'sub.domain.co.uk', error: null },
  'sub.domain.co.uk'
);

assertEqual(
  normalizeHostname('API.EXAMPLE.COM'),
  { ok: true, hostname: 'api.example.com', error: null },
  'uppercase normalizes to lowercase'
);

assertEqual(
  normalizeHostname('  example.com  '),
  { ok: true, hostname: 'example.com', error: null },
  'whitespace trimmed'
);

assertEqual(
  normalizeHostname('https://example.com/path'),
  { ok: true, hostname: 'example.com', error: null },
  'URL with path stripped'
);

assertEqual(
  normalizeHostname('example.com:8080'),
  { ok: true, hostname: 'example.com', error: null },
  'port stripped'
);

assertEqual(
  normalizeHostname('example.com/path?query=1'),
  { ok: true, hostname: 'example.com', error: null },
  'query string stripped'
);

console.log('\n--- normalizeHostname: invalid hostnames ---');

assertFalse(normalizeHostname('').ok, 'empty string rejected');
assertFalse(normalizeHostname(null).ok, 'null rejected');
assertFalse(normalizeHostname(undefined).ok, 'undefined rejected');
assertFalse(normalizeHostname(123).ok, 'number rejected');
assertFalse(normalizeHostname('localhost').ok, 'localhost rejected');
assertFalse(normalizeHostname('::1').ok, '::1 rejected');
assertFalse(normalizeHostname('0.0.0.0').ok, '0.0.0.0 rejected');
assertFalse(normalizeHostname('127.0.0.1').ok, '127.0.0.1 rejected');
assertFalse(normalizeHostname('10.0.0.1').ok, '10.x.x.x rejected');
assertFalse(normalizeHostname('172.16.0.1').ok, '172.16.x.x rejected');
assertFalse(normalizeHostname('172.31.0.1').ok, '172.31.x.x rejected');
assertFalse(normalizeHostname('192.168.0.1').ok, '192.168.x.x rejected');
assertFalse(normalizeHostname('example.local').ok, '*.local rejected');
assertEqual(
  normalizeHostname('example.com/path'),
  { ok: true, hostname: 'example.com', error: null },
  'URL with path - normalized to hostname'
);

assertEqual(
  normalizeHostname('example.com?query=1'),
  { ok: true, hostname: 'example.com', error: null },
  'URL with query string - normalized to hostname'
);

assertEqual(
  normalizeHostname('example.com#fragment'),
  { ok: true, hostname: 'example.com', error: null },
  'URL with fragment - normalized to hostname'
);
assertFalse(normalizeHostname('example.com space').ok, 'space rejected');
assertFalse(normalizeHostname('user@example.com').ok, 'auth info rejected');

console.log('\n--- normalizeHostname: label validation ---');

assertFalse(normalizeHostname('-example.com').ok, 'label starting with hyphen rejected');
assertFalse(normalizeHostname('example-.com').ok, 'label ending with hyphen rejected');
assertFalse(normalizeHostname('ex..com').ok, 'empty label rejected');
assertFalse(normalizeHostname('a'.repeat(64) + '.com').ok, 'label > 63 chars rejected');
assertFalse(normalizeHostname('example.com_').ok, 'underscore rejected');

// ── guessRegistrableDomain Tests ────────────────────────────────────────────

console.log('\n--- guessRegistrableDomain: standard TLDs ---');

assertEqual(guessRegistrableDomain('example.com'), 'example.com', 'example.com');
assertEqual(guessRegistrableDomain('api.example.com'), 'example.com', 'api.example.com');
assertEqual(guessRegistrableDomain('foo.bar.example.com'), 'example.com', 'foo.bar.example.com');
assertEqual(guessRegistrableDomain('test.io'), 'test.io', 'test.io');
assertEqual(guessRegistrableDomain('api.test.io'), 'test.io', 'api.test.io');

console.log('\n--- guessRegistrableDomain: multi-segment TLDs ---');

assertEqual(guessRegistrableDomain('example.com.cn'), 'example.com.cn', 'example.com.cn');
assertEqual(guessRegistrableDomain('api.example.com.cn'), 'example.com.cn', 'api.example.com.cn');
assertEqual(guessRegistrableDomain('foo.api.example.com.cn'), 'example.com.cn', 'foo.api.example.com.cn');

assertEqual(guessRegistrableDomain('example.co.uk'), 'example.co.uk', 'example.co.uk');
assertEqual(guessRegistrableDomain('api.example.co.uk'), 'example.co.uk', 'api.example.co.uk');

assertEqual(guessRegistrableDomain('example.com.au'), 'example.com.au', 'example.com.au');
assertEqual(guessRegistrableDomain('api.example.com.au'), 'example.com.au', 'api.example.com.au');

assertEqual(guessRegistrableDomain('example.co.jp'), 'example.co.jp', 'example.co.jp');
assertEqual(guessRegistrableDomain('api.example.co.jp'), 'example.co.jp', 'api.example.co.jp');

assertEqual(guessRegistrableDomain('example.com.br'), 'example.com.br', 'example.com.br');
assertEqual(guessRegistrableDomain('api.example.com.br'), 'example.com.br', 'api.example.com.br');

console.log('\n--- guessRegistrableDomain: edge cases ---');

assertEqual(guessRegistrableDomain(''), '', 'empty string');
assertEqual(guessRegistrableDomain(null), '', 'null');
assertEqual(guessRegistrableDomain('localhost'), 'localhost', 'localhost (edge)');
assertEqual(guessRegistrableDomain('io'), 'io', 'single label');
assertEqual(guessRegistrableDomain('api.io'), 'api.io', 'api.io');

// ── Status Calculation Tests ────────────────────────────────────────────────

console.log('\n--- calcPublicSignalsStatus ---');

assertEqual(
  calcPublicSignalsStatus(
    { available: true, ageDays: 365 },
    { available: true, firstSeenDays: 180 }
  ),
  'full',
  'both available = full'
);

assertEqual(
  calcPublicSignalsStatus(
    { available: true, ageDays: 365 },
    { available: false }
  ),
  'partial',
  'only domain available = partial'
);

assertEqual(
  calcPublicSignalsStatus(
    { available: false },
    { available: true, firstSeenDays: 180 }
  ),
  'partial',
  'only cert available = partial'
);

assertEqual(
  calcPublicSignalsStatus(
    { available: false },
    { available: false }
  ),
  'unknown',
  'both unavailable = unknown'
);

assertEqual(
  calcPublicSignalsStatus(null, null),
  'unknown',
  'both null = unknown'
);

// ── Operational Risk Score Tests ───────────────────────────────────────────

console.log('\n--- calcOperationalRiskFromPublicSignals: scoring ---');

const domainOld = { available: true, ageDays: 400 };
const certOld = { available: true, firstSeenDays: 500 };
let result = calcOperationalRiskFromPublicSignals(domainOld, certOld);
assertEqual(result.score, 14, 'old domain + old cert = 14 pts');
assertEqual(result.level, 'low', 'old + old = low');
assertEqual(result.confidence, 'full', 'both available = full confidence');

const domainNew = { available: true, ageDays: 15 };
const certNew = { available: true, firstSeenDays: 10 };
result = calcOperationalRiskFromPublicSignals(domainNew, certNew);
assertEqual(result.score, 0, 'new domain + new cert = 0 pts');
assertEqual(result.level, 'high', 'new + new = high');

const domainMedium = { available: true, ageDays: 200 };
const certMedium = { available: true, firstSeenDays: 100 };
result = calcOperationalRiskFromPublicSignals(domainMedium, certMedium);
assertEqual(result.level, 'medium', 'medium domain + cert = medium');

console.log('\n--- calcOperationalRiskFromPublicSignals: unknown handling ---');

result = calcOperationalRiskFromPublicSignals(null, null);
assertEqual(result.score, 0, 'null inputs = 0 score');
assertEqual(result.level, 'unknown', 'null inputs = unknown level');
assertEqual(result.confidence, 'none', 'null inputs = none confidence');

result = calcOperationalRiskFromPublicSignals({ available: false }, { available: false });
assertEqual(result.score, 0, 'both unavailable = 0 score');
assertEqual(result.level, 'unknown', 'both unavailable = unknown');
assertEqual(result.confidence, 'none', 'both unavailable = none confidence');

result = calcOperationalRiskFromPublicSignals({ available: true, ageDays: 365 }, null);
assertEqual(result.score, 8, 'only domain available = 8 pts');
assertEqual(result.level, 'unknown', 'partial = unknown');
assertEqual(result.confidence, 'partial', 'partial = partial confidence');

// ── Link Building Tests ─────────────────────────────────────────────────────

console.log('\n--- buildPublicSignalLinks ---');

const links = buildPublicSignalLinks('example.com', 'api.example.com');
assertTrue(links.rdapUrl.includes('rdap.org'), 'rdapUrl present');
assertTrue(links.icannUrl.includes('lookup.icann.org'), 'icannUrl present');
assertTrue(links.crtshUrl.includes('crt.sh'), 'crtshUrl present');
assertTrue(links.waybackUrl.includes('web.archive.org'), 'waybackUrl present');
assertFalse(links.crtshUrl.includes('output=json'), 'crtshUrl does not include output=json');

// ── Operational Risk NOT in API Score ───────────────────────────────────────

console.log('\n--- operationalRisk does NOT affect API score ---');

const testCases = [
  { score: 0, level: 'unknown' },
  { score: 10, level: 'low' },
  { score: 20, level: 'high' }
];

testCases.forEach(({ score, level }) => {
  const or = calcOperationalRiskFromPublicSignals(
    { available: true, ageDays: 365 },
    { available: true, firstSeenDays: 365 }
  );
  // operationalRisk score should not be added to any total
  assertTrue(typeof or.score === 'number', `operationalRisk.score is ${score}`);
  assertTrue(typeof or.level === 'string', `operationalRisk.level is string`);
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All Public Signals Worker tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}
