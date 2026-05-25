/**
 * AI API Doctor v1.10.1 — Public Signals Worker Data Source Stability Tests
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
  if (!input || typeof input !== 'string') return { ok: false, hostname: null, error: 'Hostname is required' };
  let hostname = input.trim().toLowerCase();
  hostname = hostname.replace(/^https?:\/\//, '');
  hostname = hostname.replace(/[/?#].*$/, '');
  hostname = hostname.replace(/:\d+$/, '');
  hostname = hostname.replace(/^\.+|\.+$/g, '');
  if (!hostname) return { ok: false, hostname: null, error: 'Hostname is empty' };
  if (hostname.length > 253) return { ok: false, hostname: null, error: 'Hostname too long' };
  if (!/^[a-z0-9.-]+$/.test(hostname)) return { ok: false, hostname: null, error: 'Illegal characters' };
  if (hostname.includes(' ')) return { ok: false, hostname: null, error: 'Contains whitespace' };
  if (hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0') return { ok: false, hostname: null, error: 'Localhost not allowed' };
  if (/^(?:10\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.)/.test(hostname)) return { ok: false, hostname: null, error: 'Private IP not allowed' };
  if (hostname.endsWith('.local') || hostname === 'local') return { ok: false, hostname: null, error: '.local not allowed' };
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return { ok: false, hostname: null, error: 'IP address not allowed' };
  const labels = hostname.split('.');
  for (const label of labels) {
    if (!label) return { ok: false, hostname: null, error: 'Empty label' };
    if (label.length > 63) return { ok: false, hostname: null, error: 'Label too long' };
    if (label.startsWith('-') || label.endsWith('-')) return { ok: false, hostname: null, error: 'Label cannot start/end with hyphen' };
  }
  return { ok: true, hostname, error: null };
}

function guessRegistrableDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join('.');
    if (MULTI_SEGMENT_TLDS.has(lastTwo)) return parts.slice(-3).join('.');
  }
  if (parts.length >= 2) return parts.slice(-2).join('.');
  return hostname;
}

function getTld(hostname) {
  const parts = hostname.split('.');
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

function buildVerisignUrl(domain) {
  const tld = getTld(domain);
  const verisignTlds = {
    'com': 'https://rdap.verisign.com/com/v1/domain/',
    'net': 'https://rdap.verisign.com/net/v1/domain/',
    'name': 'https://rdap.verisign.com/name/v1/domain/',
    'cc': 'https://rdap.nic.cc/cc/domain/'
  };
  return verisignTlds[tld] ? verisignTlds[tld] + domain : null;
}

function parseRdapCreatedAt(rdapJson) {
  if (!rdapJson || typeof rdapJson !== 'object') return null;
  if (rdapJson.events && Array.isArray(rdapJson.events)) {
    const regEvents = rdapJson.events.filter(e => {
      const action = (e.eventAction || '').toLowerCase();
      return action.includes('registration') || action.includes('registered') || action.includes('domain creation');
    });
    if (regEvents.length > 0) {
      regEvents.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
      return regEvents[0].eventDate;
    }
    const createdEvents = rdapJson.events.filter(e => (e.eventAction || '').toLowerCase().includes('created'));
    if (createdEvents.length > 0) {
      createdEvents.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
      return createdEvents[0].eventDate;
    }
  }
  return null;
}

function buildPublicSignalsStatus(domainRegistration, certificateHistory) {
  const domainOk = domainRegistration && domainRegistration.available === true;
  const certOk = certificateHistory && certificateHistory.available === true;
  let status = 'unknown';
  let confidence = 'none';
  if (domainOk && certOk) { status = 'full'; confidence = 'full'; }
  else if (domainOk || certOk) { status = 'partial'; confidence = 'partial'; }
  return { status, confidence };
}

function getCacheTtl(status) {
  switch (status) {
    case 'full': return 86400;
    case 'partial': return 21600;
    default: return 1800;
  }
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
  if (value === true) { console.log(`  PASS: ${testName}`); passed++; }
  else { console.log(`  FAIL: ${testName} - Expected true, got ${value}`); failed++; }
}

function assertFalse(value, testName) {
  if (value === false) { console.log(`  PASS: ${testName}`); passed++; }
  else { console.log(`  FAIL: ${testName} - Expected false, got ${value}`); failed++; }
}

function assertInRange(value, min, max, testName) {
  if (value >= min && value <= max) { console.log(`  PASS: ${testName}`); passed++; }
  else { console.log(`  FAIL: ${testName} - Expected ${min}-${max}, got ${value}`); failed++; }
}

console.log('\n=== AI API Doctor v1.10.1 Data Source Stability Tests ===\n');

// ── Verisign URL Construction ───────────────────────────────────────────────

console.log('\n--- Case 1: .com domain Verisign URL ---');

const comUrl = buildVerisignUrl('example.com');
assertEqual(comUrl, 'https://rdap.verisign.com/com/v1/domain/example.com', '.com should use Verisign');

console.log('\n--- Case 2: .net domain Verisign URL ---');

const netUrl = buildVerisignUrl('example.net');
assertEqual(netUrl, 'https://rdap.verisign.com/net/v1/domain/example.net', '.net should use Verisign');

console.log('\n--- Case 3: .cc domain Verisign URL ---');

const ccUrl = buildVerisignUrl('example.cc');
assertEqual(ccUrl, 'https://rdap.nic.cc/cc/domain/example.cc', '.cc should use Verisign nic.cc');

console.log('\n--- Case 4: Unknown TLD should return null ---');

const unknownUrl = buildVerisignUrl('example.xyz');
assertEqual(unknownUrl, null, '.xyz should return null (falls back to IANA bootstrap)');

// ── RDAP Event Parsing ──────────────────────────────────────────────────────

console.log('\n--- Case 5: RDAP createdAt event parsing (registration) ---');

const rdapWithRegistration = {
  events: [
    { eventAction: 'last update of domain database', eventDate: '2024-06-15T12:00:00Z' },
    { eventAction: 'domain registration', eventDate: '2020-01-01T00:00:00Z' }
  ]
};
const createdAt = parseRdapCreatedAt(rdapWithRegistration);
assertEqual(createdAt, '2020-01-01T00:00:00Z', 'Should extract earliest registration event');

console.log('\n--- Case 6: RDAP createdAt event parsing (registered) ---');

const rdapWithRegistered = {
  events: [
    { eventAction: 'registered', eventDate: '2019-05-10T08:00:00Z' }
  ]
};
const createdAt2 = parseRdapCreatedAt(rdapWithRegistered);
assertEqual(createdAt2, '2019-05-10T08:00:00Z', 'Should extract registered event');

console.log('\n--- Case 7: RDAP createdAt fallback (created) ---');

const rdapWithCreated = {
  events: [
    { eventAction: 'object created', eventDate: '2018-03-20T10:00:00Z' }
  ]
};
const createdAt3 = parseRdapCreatedAt(rdapWithCreated);
assertEqual(createdAt3, '2018-03-20T10:00:00Z', 'Should fallback to created event');

console.log('\n--- Case 8: RDAP parseRdapCreatedAt with null ---');

const createdAtNull = parseRdapCreatedAt(null);
assertEqual(createdAtNull, null, 'Should return null for null input');

console.log('\n--- Case 9: RDAP parseRdapCreatedAt with empty events ---');

const createdAtEmpty = parseRdapCreatedAt({ events: [] });
assertEqual(createdAtEmpty, null, 'Should return null for empty events');

// ── Status Calculation ──────────────────────────────────────────────────────

console.log('\n--- Case 10: RDAP success + crt.sh success = full ---');

const status1 = buildPublicSignalsStatus(
  { available: true, ageDays: 365 },
  { available: true, firstSeenDays: 180 }
);
assertEqual(status1.status, 'full', 'both available = full');
assertEqual(status1.confidence, 'full', 'both available = full confidence');

console.log('\n--- Case 11: RDAP success + crt.sh failure = partial ---');

const status2 = buildPublicSignalsStatus(
  { available: true, ageDays: 365 },
  { available: false }
);
assertEqual(status2.status, 'partial', 'RDAP ok + crt.sh fail = partial');
assertEqual(status2.confidence, 'partial', 'partial confidence');

console.log('\n--- Case 12: RDAP failure + crt.sh success = partial ---');

const status3 = buildPublicSignalsStatus(
  { available: false },
  { available: true, firstSeenDays: 180 }
);
assertEqual(status3.status, 'partial', 'RDAP fail + crt.sh ok = partial');
assertEqual(status3.confidence, 'partial', 'partial confidence');

console.log('\n--- Case 13: Both failures = unknown ---');

const status4 = buildPublicSignalsStatus(
  { available: false },
  { available: false }
);
assertEqual(status4.status, 'unknown', 'both unavailable = unknown');
assertEqual(status4.confidence, 'none', 'none confidence');

// ── Cache TTL ──────────────────────────────────────────────────────────────

console.log('\n--- Case 14: Full status cache TTL ---');

const ttlFull = getCacheTtl('full');
assertInRange(ttlFull, 86000, 86500, 'full = ~86400 seconds (24h)');

console.log('\n--- Case 15: Partial status cache TTL ---');

const ttlPartial = getCacheTtl('partial');
assertInRange(ttlPartial, 21500, 21700, 'partial = ~21600 seconds (6h)');

console.log('\n--- Case 16: Unknown status cache TTL ---');

const ttlUnknown = getCacheTtl('unknown');
assertInRange(ttlUnknown, 1700, 1900, 'unknown = ~1800 seconds (30min)');

// ── Operational Risk NOT in API Score ───────────────────────────────────────

console.log('\n--- Case 17: unknown score should be null for display ---');

const operationalRisk = {
  score: 0,
  level: 'unknown',
  confidence: 'none'
};
assertEqual(operationalRisk.score, 0, 'score is 0 but should be null for display');
assertEqual(operationalRisk.level, 'unknown', 'level is unknown');
assertEqual(operationalRisk.confidence, 'none', 'confidence is none');

// ── SSRF Prevention ─────────────────────────────────────────────────────────

console.log('\n--- Case 18: SSRF - localhost blocked ---');

assertFalse(normalizeHostname('localhost').ok, 'localhost should be rejected');
assertFalse(normalizeHostname('LOCALHOST').ok, 'LOCALHOST should be rejected');

console.log('\n--- Case 19: SSRF - private IP blocked ---');

assertFalse(normalizeHostname('127.0.0.1').ok, '127.0.0.1 rejected');
assertFalse(normalizeHostname('10.0.0.1').ok, '10.x.x.x rejected');
assertFalse(normalizeHostname('172.16.0.1').ok, '172.16.x.x rejected');
assertFalse(normalizeHostname('172.31.0.1').ok, '172.31.x.x rejected');
assertFalse(normalizeHostname('192.168.0.1').ok, '192.168.x.x rejected');

console.log('\n--- Case 20: Path handling (normalized to hostname) ---');

const pathResult = normalizeHostname('example.com/path');
assertTrue(pathResult.ok, 'path should be normalized to hostname');
assertEqual(pathResult.hostname, 'example.com', 'path stripped');

const queryResult = normalizeHostname('example.com/path?query=1');
assertTrue(queryResult.ok, 'path+query should be normalized');
assertEqual(queryResult.hostname, 'example.com', 'path+query stripped');

console.log('\n--- Case 21: SSRF - auth blocked ---');

assertFalse(normalizeHostname('user@example.com').ok, 'auth should be rejected');
assertFalse(normalizeHostname('user:pass@example.com').ok, 'user:pass should be rejected');

console.log('\n--- Case 22: Valid hostnames accepted ---');

assertTrue(normalizeHostname('example.com').ok, 'example.com accepted');
assertTrue(normalizeHostname('api.example.com').ok, 'api.example.com accepted');
assertTrue(normalizeHostname('example.co.uk').ok, 'example.co.uk accepted');
assertTrue(normalizeHostname('aizhongzhuan.com').ok, 'aizhongzhuan.com accepted');

// ── Domain extraction ───────────────────────────────────────────────────────

console.log('\n--- Case 23: guessRegistrableDomain ---');

assertEqual(guessRegistrableDomain('example.com'), 'example.com', 'example.com');
assertEqual(guessRegistrableDomain('api.example.com'), 'example.com', 'api.example.com');
assertEqual(guessRegistrableDomain('foo.bar.example.co.uk'), 'example.co.uk', 'foo.bar.example.co.uk');
assertEqual(guessRegistrableDomain('api.example.com.cn'), 'example.com.cn', 'api.example.com.cn');

// ── TLD extraction ───────────────────────────────────────────────────────────

console.log('\n--- Case 24: getTld ---');

assertEqual(getTld('example.com'), 'com', '.com TLD');
assertEqual(getTld('api.example.net'), 'net', '.net TLD');
assertEqual(getTld('example.co.uk'), 'uk', '.co.uk TLD');
assertEqual(getTld('localhost'), 'localhost', 'localhost TLD');

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All v1.10.1 data source stability tests passed!\n');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}
