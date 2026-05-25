/**
 * API Doctor v1.10 — Public Signals Worker
 * Fetches domain registration, certificate history, and Wayback data
 * via server-side proxy to avoid browser CORS and reliability issues.
 * 
 * Replaces direct browser fetches to rdap.org / crt.sh / archive.org.
 * 
 * @version 1.10.0
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const GLOBAL_TIMEOUT_MS = 7000;
const RDAP_TIMEOUT_MS = 4000;
const CRTSH_TIMEOUT_MS = 5000;
const WAYBACK_TIMEOUT_MS = 2500;

const CACHE_TTL_SECONDS = 86400; // 24 hours
const CACHE_KEY_PREFIX = 'https://aiapidoctor.com/api/public-signals-cache/';

const PUBLIC_SIGNALS_VERSION = 'v1.10-public-signals-worker';

// ── SSRF Prevention: hostname validation ─────────────────────────────────────

/**
 * Normalize and validate a hostname for SSRF prevention.
 * @param {string} input
 * @returns {{ok: boolean, hostname: string|null, error: string|null}}
 */
function normalizeHostname(input) {
  if (!input || typeof input !== 'string') {
    return { ok: false, hostname: null, error: 'Hostname is required' };
  }

  let hostname = input.trim().toLowerCase();

  // Remove protocol if present
  hostname = hostname.replace(/^https?:\/\//, '');

  // Remove path, query, fragment, auth
  hostname = hostname.replace(/[/?#].*$/, '');

  // Remove port
  hostname = hostname.replace(/:\d+$/, '');

  // Remove leading/trailing dots and spaces
  hostname = hostname.replace(/^\.+|\.+$/g, '');

  if (!hostname) {
    return { ok: false, hostname: null, error: 'Hostname is empty after normalization' };
  }

  // Basic length check (hostname max 253 chars)
  if (hostname.length > 253) {
    return { ok: false, hostname: null, error: 'Hostname too long (max 253 chars)' };
  }

  // Check for illegal characters (only allow a-z, 0-9, -, .)
  if (!/^[a-z0-9.-]+$/.test(hostname)) {
    return { ok: false, hostname: null, error: 'Hostname contains illegal characters' };
  }

  // Check for spaces
  if (hostname.includes(' ')) {
    return { ok: false, hostname: null, error: 'Hostname contains whitespace' };
  }

  // Block localhost and variations
  if (hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0') {
    return { ok: false, hostname: null, error: 'Localhost not allowed' };
  }

  // Block IP addresses
  if (/^(?:10\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.)/.test(hostname)) {
    return { ok: false, hostname: null, error: 'Private IP range not allowed' };
  }

  // Block *.local
  if (hostname.endsWith('.local') || hostname === 'local') {
    return { ok: false, hostname: null, error: '.local domain not allowed' };
  }

  // Block IPv4 addresses
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return { ok: false, hostname: null, error: 'IP address not allowed' };
  }

  // Validate each label (part between dots)
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
    if (!/^[a-z0-9-]+$/.test(label)) {
      return { ok: false, hostname: null, error: 'Label contains illegal characters' };
    }
  }

  return { ok: true, hostname, error: null };
}

// ── Domain extraction ─────────────────────────────────────────────────────────

const MULTI_SEGMENT_TLDS = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'co.uk', 'org.uk', 'co.jp', 'ne.jp', 'or.jp', 'ac.jp',
  'com.au', 'net.au', 'org.au', 'com.br', 'net.br', 'org.br',
  'com.mx', 'net.mx', 'org.mx', 'com.ar', 'net.ar', 'org.ar',
  'com.sg', 'net.sg', 'org.sg', 'com.hk', 'net.hk', 'org.hk',
  'co.nz', 'net.nz', 'org.nz', 'com.tw', 'net.tw', 'org.tw'
]);

/**
 * Extract registrable domain from hostname.
 * @param {string} hostname
 * @returns {string}
 */
function guessRegistrableDomain(hostname) {
  if (!hostname) return '';

  const parts = hostname.split('.');

  // Handle multi-segment TLDs (e.g., co.uk, com.cn)
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join('.');
    if (MULTI_SEGMENT_TLDS.has(lastTwo)) {
      return parts.slice(-3).join('.');
    }
  }

  // Standard case: return last two parts
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }

  return hostname;
}

// ── RDAP Query ────────────────────────────────────────────────────────────────

/**
 * Query RDAP for domain registration info.
 * @param {string} domain
 * @returns {Promise<object>}
 */
async function queryRdap(domain) {
  if (!domain) {
    return {
      available: false,
      domainQueried: domain || '',
      createdAt: null,
      ageDays: null,
      source: 'rdap.org',
      error: 'No domain provided'
    };
  }

  const rdapUrl = `https://rdap.org/domain/${encodeURIComponent(domain)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);

    const resp = await fetch(rdapUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/rdap+json' }
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      return {
        available: false,
        domainQueried: domain,
        createdAt: null,
        ageDays: null,
        source: 'rdap.org',
        error: `HTTP ${resp.status}`
      };
    }

    const data = await resp.json();

    // Find registration date from events
    let createdAt = null;
    if (data.events && Array.isArray(data.events)) {
      const regEvents = data.events.filter(e => {
        const action = (e.eventAction || '').toLowerCase();
        return action.includes('registration') ||
               action.includes('registered') ||
               action.includes('domain creation');
      });

      if (regEvents.length > 0) {
        // Sort by date and take earliest
        regEvents.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
        createdAt = regEvents[0].eventDate;
      }
    }

    // Also try "network" object for CIDR-based registrations
    if (!createdAt && data.network && data.network.events) {
      const regEvents = data.network.events.filter(e => {
        const action = (e.eventAction || '').toLowerCase();
        return action.includes('registration') || action.includes('registered');
      });
      if (regEvents.length > 0) {
        regEvents.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
        createdAt = regEvents[0].eventDate;
      }
    }

    if (!createdAt) {
      return {
        available: false,
        domainQueried: domain,
        createdAt: null,
        ageDays: null,
        source: 'rdap.org',
        error: 'No registration date found in RDAP response'
      };
    }

    const createdDate = new Date(createdAt);
    const ageMs = Date.now() - createdDate.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    return {
      available: true,
      domainQueried: domain,
      createdAt,
      ageDays,
      source: 'rdap.org'
    };

  } catch (err) {
    const errorType = err.name === 'AbortError' ? 'timeout' : 'fetch_error';
    return {
      available: false,
      domainQueried: domain,
      createdAt: null,
      ageDays: null,
      source: 'rdap.org',
      error: `${errorType}: ${err.message}`
    };
  }
}

// ── Certificate History Query ────────────────────────────────────────────────

/**
 * Query crt.sh for certificate transparency logs.
 * @param {string} domain
 * @param {string} hostname
 * @returns {Promise<object>}
 */
async function queryCertificateHistory(domain, hostname) {
  if (!domain && !hostname) {
    return {
      available: false,
      firstSeenAt: null,
      firstSeenDays: null,
      source: 'crt.sh',
      error: 'No domain or hostname provided'
    };
  }

  // Build crt.sh lookup URL (without output=json to get human-readable page)
  const crtshLookupUrl = `https://crt.sh/?q=${encodeURIComponent(domain || hostname)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CRTSH_TIMEOUT_MS);

    const resp = await fetch(crtshLookupUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      return {
        available: false,
        firstSeenAt: null,
        firstSeenDays: null,
        source: 'crt.sh',
        error: `HTTP ${resp.status}`
      };
    }

    const text = await resp.text();

    // Try to parse as JSON first
    let entries = null;
    try {
      entries = JSON.parse(text);
    } catch (_) {
      // Not JSON, need to extract from HTML or plain text
      // This is a simplified approach - try to find dates in the response
      entries = null;
    }

    let firstSeenAt = null;

    if (Array.isArray(entries) && entries.length > 0) {
      // Sort by not_before and get earliest
      const validEntries = entries
        .filter(e => e.not_before || e['not_before (GMT)'])
        .map(e => new Date(e.not_before || e['not_before (GMT)']))
        .filter(d => !isNaN(d.getTime()))
        .sort((a, b) => a - b);

      if (validEntries.length > 0) {
        firstSeenAt = validEntries[0].toISOString();
      }
    }

    if (!firstSeenAt) {
      // Fallback: try JSON API endpoint
      const jsonUrl = `https://crt.sh/?q=${encodeURIComponent(domain || hostname)}&output=json`;
      try {
        const jsonController = new AbortController();
        const jsonTimeoutId = setTimeout(() => jsonController.abort(), 2500);
        const jsonResp = await fetch(jsonUrl, { signal: jsonController.signal });
        clearTimeout(jsonTimeoutId);

        if (jsonResp.ok) {
          const jsonText = await jsonResp.text();
          const jsonEntries = JSON.parse(jsonText);
          if (Array.isArray(jsonEntries) && jsonEntries.length > 0) {
            const validEntries = jsonEntries
              .filter(e => e.not_before)
              .map(e => new Date(e.not_before))
              .filter(d => !isNaN(d.getTime()))
              .sort((a, b) => a - b);

            if (validEntries.length > 0) {
              firstSeenAt = validEntries[0].toISOString();
            }
          }
        }
      } catch (_) {
        // Ignore fallback errors
      }
    }

    if (!firstSeenAt) {
      return {
        available: false,
        firstSeenAt: null,
        firstSeenDays: null,
        source: 'crt.sh',
        error: 'Could not parse certificate data'
      };
    }

    const firstSeenDate = new Date(firstSeenAt);
    const ageMs = Date.now() - firstSeenDate.getTime();
    const firstSeenDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    return {
      available: true,
      firstSeenAt,
      firstSeenDays,
      source: 'crt.sh',
      lookupUrl: crtshLookupUrl
    };

  } catch (err) {
    const errorType = err.name === 'AbortError' ? 'timeout' : 'fetch_error';
    return {
      available: false,
      firstSeenAt: null,
      firstSeenDays: null,
      source: 'crt.sh',
      error: `${errorType}: ${err.message}`
    };
  }
}

// ── Wayback Info ─────────────────────────────────────────────────────────────

/**
 * Build Wayback lookup URL (optional, non-blocking).
 * @param {string} domain
 * @returns {object}
 */
function buildWaybackInfo(domain) {
  const lookupUrl = domain ? `https://web.archive.org/web/*/${domain}` : null;
  return {
    lookupUrl,
    available: false,
    closestUrl: null,
    timestamp: null
  };
}

/**
 * Query Wayback Availability API (optional enhancement).
 * @param {string} domain
 * @returns {Promise<object>}
 */
async function queryWaybackAvailability(domain) {
  if (!domain) {
    return { available: false, closestUrl: null, timestamp: null };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WAYBACK_TIMEOUT_MS);

    const resp = await fetch(
      `https://archive.org/wayback/available?url=${encodeURIComponent(domain)}`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!resp.ok) {
      return { available: false, closestUrl: null, timestamp: null };
    }

    const data = await resp.json();

    if (data.archived_snapshots && data.archived_snapshots.closest) {
      const snapshot = data.archived_snapshots.closest;
      return {
        available: true,
        closestUrl: snapshot.url || null,
        timestamp: snapshot.timestamp || null
      };
    }

    return { available: false, closestUrl: null, timestamp: null };

  } catch (err) {
    return { available: false, closestUrl: null, timestamp: null };
  }
}

// ── Cache helpers ────────────────────────────────────────────────────────────

/**
 * Get cache key for a domain.
 * @param {string} domain
 * @returns {string}
 */
function getCacheKey(domain) {
  return `${CACHE_KEY_PREFIX}${domain}`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

/**
 * Cloudflare Pages Function handler.
 * GET /api/public-signals?hostname=example.com
 */
export async function onRequestGet(context) {
  const { request, env, waitUntil, next } = context;
  const cache = caches.default;

  // Parse query parameters
  const url = new URL(request.url);
  const hostname = url.searchParams.get('hostname');

  // Validate hostname
  const validation = normalizeHostname(hostname);
  if (!validation.ok) {
    return new Response(JSON.stringify({
      ok: false,
      status: 'invalid_hostname',
      error: validation.error || 'Invalid hostname'
    }), {
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

  // Check cache first
  const cacheKey = getCacheKey(registrableDomain);
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    const cachedData = await cachedResponse.json();
    return new Response(JSON.stringify({
      ...cachedData,
      cached: true,
      fetchedAt: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'HIT'
      }
    });
  }

  // Execute queries in parallel with overall timeout
  const errors = [];
  let domainRegistration = {
    available: false,
    domainQueried: registrableDomain,
    createdAt: null,
    ageDays: null,
    source: 'rdap.org',
    lookupUrl: `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(registrableDomain)}`,
    rdapUrl: `https://rdap.org/domain/${encodeURIComponent(registrableDomain)}`,
    error: 'Query not executed'
  };
  let certificateHistory = {
    available: false,
    firstSeenAt: null,
    firstSeenDays: null,
    source: 'crt.sh',
    lookupUrl: `https://crt.sh/?q=${encodeURIComponent(registrableDomain)}`,
    error: 'Query not executed'
  };
  let wayback = buildWaybackInfo(normalizedHostname);

  // Execute with overall timeout
  const overallController = new AbortController();
  const overallTimeoutId = setTimeout(() => overallController.abort(), GLOBAL_TIMEOUT_MS);

  try {
    // Run all queries in parallel
    const [rdapResult, certResult, waybackResult] = await Promise.allSettled([
      queryRdap(registrableDomain),
      queryCertificateHistory(registrableDomain, normalizedHostname),
      queryWaybackAvailability(normalizedHostname)
    ]);

    // Process RDAP result
    if (rdapResult.status === 'fulfilled') {
      domainRegistration = {
        ...rdapResult.value,
        lookupUrl: `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(registrableDomain)}`,
        rdapUrl: `https://rdap.org/domain/${encodeURIComponent(registrableDomain)}`
      };
      if (!domainRegistration.available && domainRegistration.error) {
        errors.push({ source: 'rdap.org', message: domainRegistration.error });
      }
    } else {
      errors.push({ source: 'rdap.org', message: String(rdapResult.reason) });
    }

    // Process certificate result
    if (certResult.status === 'fulfilled') {
      certificateHistory = {
        ...certResult.value,
        lookupUrl: `https://crt.sh/?q=${encodeURIComponent(registrableDomain)}`
      };
      if (!certificateHistory.available && certificateHistory.error) {
        errors.push({ source: 'crt.sh', message: certificateHistory.error });
      }
    } else {
      errors.push({ source: 'crt.sh', message: String(certResult.reason) });
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

  // Determine overall status
  const status = errors.length === 0 ? 'full' :
                 errors.length < 2 ? 'partial' : 'unknown';

  const responseData = {
    ok: true,
    status,
    hostname: normalizedHostname,
    domain: registrableDomain,
    fetchedAt: new Date().toISOString(),
    cached: false,
    domainRegistration,
    certificateHistory,
    wayback,
    errors,
    version: PUBLIC_SIGNALS_VERSION
  };

  // Build and cache response
  const response = new Response(JSON.stringify(responseData), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    }
  });

  // Cache the response for future requests
  waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}

// ── CORS preflight ───────────────────────────────────────────────────────────

/**
 * Handle CORS preflight requests.
 */
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
