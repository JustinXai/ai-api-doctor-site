/**
 * verify-risk-label-mapping-v11116.js
 * Verifies v1.11.16 semantic risk label mappings (labels only; no score changes).
 */

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// Basic ratio-based fallback used elsewhere
function getRiskByRatio(score, max) {
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return 'unknown';
  const ratio = score / max;
  if (ratio >= 0.8) return 'low';
  if (ratio >= 0.5) return 'medium';
  return 'high';
}

function riskLabel(risk) {
  const map = {
    low: { zh: '低风险', en: 'Low Risk' },
    medium: { zh: '中风险', en: 'Medium Risk' },
    high: { zh: '高风险', en: 'High Risk' },
    unknown: { zh: '未验证', en: 'Unverified' },
  };
  return map[risk] || map.unknown;
}

function riskLevelByModelSignal(score, max, category) {
  const cat = String(category || 'unknown');
  const severe = new Set(['wrong_family', 'hard_contamination', 'capability_failed', 'severe_mismatch']);
  const mediumCats = new Set(['ambiguous', 'unable_to_confirm', 'no_answer', 'platform_or_proxy_identity', 'partial_match']);
  const familyCats = new Set(['family_match', 'likely_same_family']);
  const lowCats = new Set(['exact_match', 'strong_match']);

  if (severe.has(cat)) return 'high';
  if (mediumCats.has(cat)) return 'medium';
  if (lowCats.has(cat)) return 'low';
  if (familyCats.has(cat)) {
    const ratio = max > 0 ? score / max : 0;
    return ratio >= 0.8 ? 'low' : 'medium';
  }
  return getRiskByRatio(score, max);
}

function riskLevelByBasicCompatibility(score, max, reason, tcEv) {
  const r = String(reason || '');
  const mediumReasons = new Set(['parsed_json_but_nonstandard_schema', 'nonstandard_but_parseable', 'openai_schema_partial']);
  const lowReasons = new Set(['openai_compatible_basic', 'target_call_success_minor_warning', 'openai_compatible_with_minor_issues', 'full_compatibility_passed']);

  if (mediumReasons.has(r)) return 'medium';
  if (lowReasons.has(r)) return 'low';

  const responseParsed = tcEv && tcEv.responseParsed === true;
  const openAICompatible = tcEv && tcEv.openAICompatible === true;
  if (responseParsed && !openAICompatible) return 'medium';
  if (openAICompatible) return 'low';

  return getRiskByRatio(score, max);
}

function riskLabelOperationalByAgeDays(ageDays) {
  if (ageDays == null || !Number.isFinite(ageDays)) return { zh: '未确认', en: 'Unconfirmed' };
  if (ageDays < 30) return { zh: '高风险', en: 'High Risk' };
  if (ageDays < 60) return { zh: '中高风险', en: 'Medium-High Risk' };
  if (ageDays < 120) return { zh: '中风险', en: 'Medium Risk' };
  if (ageDays < 365) return { zh: '中低风险', en: 'Medium-Low Risk' };
  return { zh: '低风险', en: 'Low Risk' };
}

function run() {
  const results = [];

  // Case 1
  {
    const risk = riskLevelByModelSignal(7, 15, 'ambiguous');
    const label = riskLabel(risk);
    assert(label.zh === '中风险', 'Case 1: modelSignal ambiguous should be 中风险');
    assert(label.en === 'Medium Risk', 'Case 1: modelSignal ambiguous should be Medium Risk');
    results.push('PASS Case 1');
  }

  // Case 2
  {
    const risk = riskLevelByModelSignal(7, 15, 'no_answer');
    const label = riskLabel(risk);
    assert(label.zh === '中风险', 'Case 2: modelSignal no_answer should be 中风险');
    results.push('PASS Case 2');
  }

  // Case 3
  {
    const risk = riskLevelByModelSignal(2, 15, 'wrong_family');
    const label = riskLabel(risk);
    assert(label.zh === '高风险', 'Case 3: modelSignal wrong_family should be 高风险');
    results.push('PASS Case 3');
  }

  // Case 4
  {
    const risk = riskLevelByBasicCompatibility(20, 25, 'parsed_json_but_nonstandard_schema', { responseParsed: true, openAICompatible: false });
    const label = riskLabel(risk);
    assert(label.zh === '中风险', 'Case 4: basicCompatibility parsed_json_but_nonstandard_schema should be 中风险');
    results.push('PASS Case 4');
  }

  // Case 5
  {
    const risk = riskLevelByBasicCompatibility(20, 25, 'openai_compatible_basic', { responseParsed: true, openAICompatible: true, hasContent: true });
    const label = riskLabel(risk);
    assert(label.zh === '低风险', 'Case 5: basicCompatibility openai_compatible_basic should be 低风险');
    results.push('PASS Case 5');
  }

  // Case 6
  {
    const label = riskLabelOperationalByAgeDays(68);
    assert(label.zh === '中风险', 'Case 6: operationalRisk 68 days should be 中风险');
    results.push('PASS Case 6');
  }

  // Case 7
  {
    const label = riskLabelOperationalByAgeDays(null);
    assert(label.zh === '未确认', 'Case 7: operationalRisk unavailable should be 未确认');
    results.push('PASS Case 7');
  }

  // Case 8 (current case aggregate expectations)
  {
    const usage = riskLabel(getRiskByRatio(12, 25));
    const cache = riskLabel(getRiskByRatio(2.5, 5));
    const model = riskLabel(riskLevelByModelSignal(7, 15, 'ambiguous'));
    const stability = riskLabel(getRiskByRatio(20, 25));
    const basic = riskLabel(riskLevelByBasicCompatibility(20, 25, 'parsed_json_but_nonstandard_schema', { responseParsed: true, openAICompatible: false }));
    const client = riskLabel(getRiskByRatio(5, 5));
    const op = riskLabelOperationalByAgeDays(68);

    assert(usage.zh === '高风险', 'Case 8: usage 12/25 should be 高风险 or worse (ratio-based high)');
    assert(cache.zh === '中风险', 'Case 8: cache 2.5/5 should be 中风险');
    assert(model.zh === '中风险', 'Case 8: model 7/15 ambiguous should be 中风险');
    assert(stability.zh === '低风险', 'Case 8: stability 20/25 should be 低风险');
    assert(basic.zh === '中风险', 'Case 8: basic 20/25 nonstandard schema should be 中风险');
    assert(client.zh === '低风险', 'Case 8: client 5/5 should be 低风险');
    assert(op.zh === '中风险', 'Case 8: operational 68 days should be 中风险');

    results.push('PASS Case 8');
  }

  console.log('=== verify-risk-label-mapping-v11116.js ===');
  for (const r of results) console.log(r);
  console.log('\nALL TESTS PASSED');
}

try {
  run();
  process.exit(0);
} catch (e) {
  console.error('FAIL:', e && e.message ? e.message : String(e));
  process.exit(1);
}
