/**
 * API Doctor v1.10.1 — Public Signals Worker (Data Source Stability Fix)
 * 
 * Improved RDAP strategy:
 * 1. Verisign RDAP for .com/.net/.name/.cc (direct)
 * 2. IANA bootstrap for other TLDs
 * 3. rdap.org as fallback only
 * 
 * crt.sh is best-effort only, failures don't affect status.
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const VERSION = 'v1.10.4-public-signals-worker';

// Cache TTLs (seconds)
const TTL_FULL = 86400;      // 24 hours
const TTL_PARTIAL = 21600;   // 6 hours
const TTL_UNKNOWN = 1800;    // 30 minutes

// Timeouts (ms)
const GLOBAL_TIMEOUT_MS = 8000;
const RDAP_DIRECT_TIMEOUT_MS = 3500;
const RDAP_BOOTSTRAP_TIMEOUT_MS = 3000;
const RDAP_FALLBACK_TIMEOUT_MS = 2500;
const CRTSH_TIMEOUT_MS = 4000;
const WAYBACK_TIMEOUT_MS = 2000;

const IANA_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const IANA_BOOTSTRAP_TTL = 604800; // 7 days

const CACHE_KEY_PREFIX = 'https://aiapidoctor.com/api/public-signals-cache/v1104/';

// ── SSRF Prevention ──────────────────────────────────────────────────────────

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
    return { ok: false, hostname: null, error: 'Hostname is empty' };
  }
  if (hostname.length > 253) {
    return { ok: false, hostname: null, error: 'Hostname too long' };
  }
  if (!/^[a-z0-9.-]+$/.test(hostname)) {
    return { ok: false, hostname: null, error: 'Illegal characters' };
  }
  if (hostname.includes(' ')) {
    return { ok: false, hostname: null, error: 'Contains whitespace' };
  }
  if (hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0') {
    return { ok: false, hostname: null, error: 'Localhost not allowed' };
  }
  if (/^(?:10\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.)/.test(hostname)) {
    return { ok: false, hostname: null, error: 'Private IP not allowed' };
  }
  if (hostname.endsWith('.local') || hostname === 'local') {
    return { ok: false, hostname: null, error: '.local not allowed' };
  }
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return { ok: false, hostname: null, error: 'IP address not allowed' };
  }

  const labels = hostname.split('.');
  for (const label of labels) {
    if (!label) return { ok: false, hostname: null, error: 'Empty label' };
    if (label.length > 63) return { ok: false, hostname: null, error: 'Label too long' };
    if (label.startsWith('-') || label.endsWith('-')) {
      return { ok: false, hostname: null, error: 'Label cannot start/end with hyphen' };
    }
  }

  return { ok: true, hostname, error: null };
}

// ── Domain extraction ────────────────────────────────────────────────────────

const MULTI_SEGMENT_TLDS = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'co.uk', 'org.uk', 'co.jp', 'ne.jp', 'or.jp', 'ac.jp',
  'com.au', 'net.au', 'org.au', 'com.br', 'net.br', 'org.br',
  'com.mx', 'net.mx', 'org.mx', 'com.ar', 'net.ar', 'org.ar',
  'com.sg', 'net.sg', 'org.sg', 'com.hk', 'net.hk', 'org.hk',
  'co.nz', 'net.nz', 'org.nz', 'com.tw', 'net.tw', 'org.tw'
]);

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

function getTld(hostname) {
  const parts = hostname.split('.');
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

// ── IANA Bootstrap Cache (in-memory, short-lived) ───────────────────────────

let bootstrapCache = null;
let bootstrapCacheTime = 0;

// ── IANA Bootstrap ──────────────────────────────────────────────────────────

async function getRdapBaseUrlsForTld(tld) {
  if (!tld) return [];

  // Check in-memory cache first
  if (bootstrapCache && (Date.now() - bootstrapCacheTime) < IANA_BOOTSTRAP_TTL * 1000) {
    return bootstrapCache[tld] || [];
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RDAP_BOOTSTRAP_TIMEOUT_MS);

    const resp = await fetch(IANA_BOOTSTRAP_URL, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AI-API-Doctor/1.10.1 (+https://aiapidoctor.com)'
      }
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      return [];
    }

    const data = await resp.json();

    if (!data.services || !Array.isArray(data.services)) {
      return [];
    }

    // Build lookup map
    const lookup = {};
    for (const [tlds, baseUrls] of data.services) {
      if (Array.isArray(tlds) && Array.isArray(baseUrls)) {
        for (const t of tlds) {
          lookup[t] = baseUrls;
        }
      }
    }

    // Cache the result
    bootstrapCache = lookup;
    bootstrapCacheTime = Date.now();

    return lookup[tld] || [];

  } catch (err) {
    // Bootstrap failed, return empty
    return [];
  }
}

// ── RDAP Query ──────────────────────────────────────────────────────────────

function buildRdapHeaders() {
  return {
    'Accept': 'application/rdap+json, application/json;q=0.9, */*;q=0.8',
    'User-Agent': 'AI-API-Doctor/1.10.1 (+https://aiapidoctor.com)'
  };
}

function parseRdapCreatedAt(rdapJson) {
  if (!rdapJson || typeof rdapJson !== 'object') return null;

  // Try events array
  if (rdapJson.events && Array.isArray(rdapJson.events)) {
    const regEvents = rdapJson.events.filter(e => {
      const action = (e.eventAction || '').toLowerCase();
      return action.includes('registration') ||
             action.includes('registered') ||
             action.includes('domain creation');
    });

    if (regEvents.length > 0) {
      regEvents.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
      return regEvents[0].eventDate;
    }

    // Fallback: any event with "created"
    const createdEvents = rdapJson.events.filter(e => {
      const action = (e.eventAction || '').toLowerCase();
      return action.includes('created');
    });

    if (createdEvents.length > 0) {
      createdEvents.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
      return createdEvents[0].eventDate;
    }
  }

  return null;
}

async function queryRdap(domain) {
  if (!domain) {
    return { available: false, domainQueried: domain || '', createdAt: null, ageDays: null, source: 'rdap', error: 'No domain' };
  }

  const tld = getTld(domain);
  const errors = [];

  // Strategy A: Verisign direct for known TLDs
  const verisignTlds = {
    'com': 'https://rdap.verisign.com/com/v1/domain/',
    'net': 'https://rdap.verisign.com/net/v1/domain/',
    'name': 'https://rdap.verisign.com/name/v1/domain/',
    'cc': 'https://rdap.nic.cc/cc/domain/'
  };

  if (verisignTlds[tld]) {
    const result = await tryRdapUrl(verisignTlds[tld] + encodeURIComponent(domain), RDAP_DIRECT_TIMEOUT_MS, 'Verisign');
    if (result.available) return result;
    errors.push(result.error);
  }

  // Strategy B: IANA bootstrap
  const bootstrapUrls = await getRdapBaseUrlsForTld(tld);
  for (const baseUrl of bootstrapUrls) {
    const cleanBase = baseUrl.replace(/\/$/, '');
    const result = await tryRdapUrl(`${cleanBase}/domain/${encodeURIComponent(domain)}`, RDAP_BOOTSTRAP_TIMEOUT_MS, 'IANA bootstrap');
    if (result.available) return result;
    errors.push(result.error);
  }

  // Strategy C: rdap.org fallback (only if Verisign/bootstrap failed)
  const fallbackResult = await tryRdapUrl(
    `https://rdap.org/domain/${encodeURIComponent(domain)}`,
    RDAP_FALLBACK_TIMEOUT_MS,
    'rdap.org'
  );
  if (fallbackResult.available) return fallbackResult;
  errors.push(fallbackResult.error);

  // All strategies failed
  return {
    available: false,
    domainQueried: domain,
    createdAt: null,
    ageDays: null,
    source: 'rdap',
    error: errors[errors.length - 1] || 'All RDAP strategies failed'
  };
}

async function tryRdapUrl(url, timeoutMs, source) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: buildRdapHeaders()
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      return {
        available: false,
        domainQueried: '',
        createdAt: null,
        ageDays: null,
        source,
        error: `HTTP ${resp.status}`
      };
    }

    const data = await resp.json();
    const createdAt = parseRdapCreatedAt(data);

    if (!createdAt) {
      return {
        available: false,
        domainQueried: '',
        createdAt: null,
        ageDays: null,
        source,
        error: 'No registration date found'
      };
    }

    const createdDate = new Date(createdAt);
    const ageDays = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

    return {
      available: true,
      domainQueried: '',
      createdAt,
      ageDays,
      source
    };

  } catch (err) {
    const errorType = err.name === 'AbortError' ? 'timeout' : 'fetch_error';
    return {
      available: false,
      domainQueried: '',
      createdAt: null,
      ageDays: null,
      source,
      error: `${errorType}: ${err.message}`
    };
  }
}

// ── Certificate History (crt.sh) ───────────────────────────────────────────

async function queryCertificateHistory(domain, hostname) {
  const query = domain || hostname || '';
  if (!query) {
    return { available: false, firstSeenAt: null, firstSeenDays: null, source: 'crt.sh', error: 'No query' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CRTSH_TIMEOUT_MS);

    const resp = await fetch(
      `https://crt.sh/?q=${encodeURIComponent(query)}&output=json`,
      {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json,text/plain,*/*',
          'User-Agent': 'AI-API-Doctor/1.10.1 (+https://aiapidoctor.com)'
        }
      }
    );

    clearTimeout(timeoutId);

    if (!resp.ok) {
      return { available: false, firstSeenAt: null, firstSeenDays: null, source: 'crt.sh', error: `HTTP ${resp.status}` };
    }

    const text = await resp.text();
    let entries = [];

    try {
      entries = JSON.parse(text);
    } catch (_) {
      return { available: false, firstSeenAt: null, firstSeenDays: null, source: 'crt.sh', error: 'JSON parse failed' };
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return { available: false, firstSeenAt: null, firstSeenDays: null, source: 'crt.sh', error: 'No entries' };
    }

    // Find earliest not_before
    const validEntries = entries
      .filter(e => e.not_before)
      .map(e => new Date(e.not_before))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a - b);

    if (validEntries.length === 0) {
      return { available: false, firstSeenAt: null, firstSeenDays: null, source: 'crt.sh', error: 'No valid dates' };
    }

    const firstSeenAt = validEntries[0].toISOString();
    const firstSeenDays = Math.floor((Date.now() - validEntries[0].getTime()) / (1000 * 60 * 60 * 24));

    return { available: true, firstSeenAt, firstSeenDays, source: 'crt.sh' };

  } catch (err) {
    const errorType = err.name === 'AbortError' ? 'timeout' : 'fetch_error';
    return {
      available: false,
      firstSeenAt: null,
      firstSeenDays: null,
      source: 'crt.sh',
      error: `${errorType}`
    };
  }
}

// ── Wayback ──────────────────────────────────────────────────────────────────

async function queryWaybackAvailability(domain) {
  if (!domain) return { available: false, closestUrl: null, timestamp: null };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WAYBACK_TIMEOUT_MS);

    const resp = await fetch(
      `https://archive.org/wayback/available?url=${encodeURIComponent(domain)}`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!resp.ok) return { available: false, closestUrl: null, timestamp: null };

    const data = await resp.json();

    if (data.archived_snapshots && data.archived_snapshots.closest) {
      const snap = data.archived_snapshots.closest;
      return {
        available: true,
        closestUrl: snap.url || null,
        timestamp: snap.timestamp || null
      };
    }

    return { available: false, closestUrl: null, timestamp: null };

  } catch (_) {
    return { available: false, closestUrl: null, timestamp: null };
  }
}

// ── Status calculation ──────────────────────────────────────────────────────

function buildPublicSignalsStatus(domainRegistration, certificateHistory) {
  const domainOk = domainRegistration && domainRegistration.available === true;
  const certOk = certificateHistory && certificateHistory.available === true;

  let status = 'unknown';
  let confidence = 'none';

  if (domainOk && certOk) {
    status = 'full';
    confidence = 'full';
  } else if (domainOk || certOk) {
    status = 'partial';
    confidence = 'partial';
  }

  return { status, confidence };
}

function getCacheTtl(status) {
  switch (status) {
    case 'full': return TTL_FULL;
    case 'partial': return TTL_PARTIAL;
    default: return TTL_UNKNOWN;
  }
}

// ── Cache helpers ───────────────────────────────────────────────────────────

function getCacheKey(domain) {
  return `${CACHE_KEY_PREFIX}${domain}`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context;
  const cache = caches.default;

  const url = new URL(request.url);
  const hostname = url.searchParams.get('hostname');
  const noCache = url.searchParams.get('nocache') === '1';
  const debugMode = url.searchParams.get('debug') === '1';

  // Build debug info skeleton (populated during execution)
  const debug = debugMode ? {
    version: VERSION,
    cacheKeyPrefix: CACHE_KEY_PREFIX,
    domain: null,
    hostname: null,
    normalizedHostname: null,
    cacheBypass: noCache,
    cacheKey: null,
    cached: false,
    rdapUrlsTried: [],
    rdapSelectedSource: null,
    crtshTried: false,
    crtshSuccess: false
  } : null;

  // Validate hostname
  const validation = normalizeHostname(hostname);
  if (!validation.ok) {
    const resp = {
      ok: false,
      status: 'invalid_hostname',
      error: validation.error || 'Invalid hostname',
      version: VERSION
    };
    if (debug) resp.debug = debug;
    return new Response(JSON.stringify(resp), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });
  }

  const normalizedHostname = validation.hostname;
  const registrableDomain = guessRegistrableDomain(normalizedHostname);

  if (debug) {
    debug.domain = registrableDomain;
    debug.hostname = hostname;
    debug.normalizedHostname = normalizedHostname;
  }

  // Check cache (skip if noCache)
  const cacheKey = getCacheKey(registrableDomain);
  if (debug) debug.cacheKey = cacheKey;

  let cachedResponse = null;
  if (!noCache) {
    cachedResponse = await cache.match(cacheKey);
  } else if (debug) {
    debug.cacheBypass = true;
  }

  if (cachedResponse) {
    const cachedData = await cachedResponse.json();
    const resp = {
      ...cachedData,
      cached: true,
      fetchedAt: new Date().toISOString()
    };
    if (debug) {
      debug.cached = true;
      resp.debug = debug;
    }
    return new Response(JSON.stringify(resp), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=' + (cachedData.cacheTtlSeconds || 3600),
        'X-Cache': 'HIT'
      }
    });
  }

  if (debug) debug.cached = false;

  // Execute queries with overall timeout
  const errors = [];
  let domainRegistration = {
    available: false,
    domainQueried: registrableDomain,
    createdAt: null,
    ageDays: null,
    source: 'rdap',
    lookupUrl: `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(registrableDomain)}`,
    rdapUrl: `https://rdap.org/domain/${encodeURIComponent(registrableDomain)}`,
    error: 'Not queried'
  };

  let certificateHistory = {
    available: false,
    firstSeenAt: null,
    firstSeenDays: null,
    source: 'crt.sh',
    lookupUrl: `https://crt.sh/?q=${encodeURIComponent(registrableDomain)}`,
    error: 'Not queried'
  };

  let wayback = {
    lookupUrl: `https://web.archive.org/web/*/${registrableDomain}`,
    available: false,
    closestUrl: null,
    timestamp: null
  };

  const overallController = new AbortController();
  const overallTimeoutId = setTimeout(() => overallController.abort(), GLOBAL_TIMEOUT_MS);

  try {
    // Run queries in parallel
    const [rdapResult, certResult, waybackResult] = await Promise.allSettled([
      queryRdap(registrableDomain),
      queryCertificateHistory(registrableDomain, normalizedHostname),
      queryWaybackAvailability(registrableDomain)
    ]);

    // Process RDAP result
    if (rdapResult.status === 'fulfilled') {
      domainRegistration = {
        ...rdapResult.value,
        domainQueried: registrableDomain,
        lookupUrl: `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(registrableDomain)}`,
        rdapUrl: `https://rdap.org/domain/${encodeURIComponent(registrableDomain)}`
      };
      if (debug) debug.rdapSelectedSource = domainRegistration.source || 'unknown';
      if (!domainRegistration.available && domainRegistration.error) {
        errors.push({ source: 'rdap', code: 'lookup_failed', message: domainRegistration.error });
      }
    } else {
      errors.push({ source: 'rdap', code: 'exception', message: String(rdapResult.reason) });
    }

    // Process certificate result
    if (certResult.status === 'fulfilled') {
      certificateHistory = {
        ...certResult.value,
        lookupUrl: `https://crt.sh/?q=${encodeURIComponent(registrableDomain)}`
      };
      if (debug) debug.crtshSuccess = certificateHistory.available === true;
      if (!certificateHistory.available && certificateHistory.error) {
        errors.push({ source: 'crt.sh', code: 'lookup_failed', message: certificateHistory.error });
      }
    } else {
      errors.push({ source: 'crt.sh', code: 'exception', message: 'Certificate lookup exception' });
    }

    // Process Wayback result
    if (waybackResult && waybackResult.status === 'fulfilled') {
      wayback = {
        lookupUrl: wayback.lookupUrl,
        ...waybackResult.value
      };
    }

  } finally {
    clearTimeout(overallTimeoutId);
  }

  // Calculate status
  const { status, confidence } = buildPublicSignalsStatus(domainRegistration, certificateHistory);
  const cacheTtlSeconds = getCacheTtl(status);

  const responseData = {
    ok: true,
    status,
    confidence,
    hostname: normalizedHostname,
    domain: registrableDomain,
    fetchedAt: new Date().toISOString(),
    cached: false,
    cacheTtlSeconds,
    domainRegistration,
    certificateHistory,
    wayback,
    errors,
    version: VERSION
  };

  if (debug) responseData.debug = debug;

  // Cache response (skip if noCache)
  const response = new Response(JSON.stringify(responseData), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${cacheTtlSeconds}`
    }
  });

  if (!noCache) {
    waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}

// ── CORS preflight ───────────────────────────────────────────────────────────

export async function onRequestOptions(context) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}
