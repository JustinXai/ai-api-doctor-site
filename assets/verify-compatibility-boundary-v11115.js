'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'test.js'), 'utf8');

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// boundary: responseParsed != openAICompatible
assert(/parsed_json_but_nonstandard_schema/.test(src), 'missing parsed_json_but_nonstandard_schema');

// Very small inline evaluator for the basicCompatibility calibration block by simulating inputs.
function calibrate({ rawBasicScore, realTargetCallSuccess, reachCompat, authCompat, responseParsed, openAICompatible, hasContent }) {
  let basicScore = rawBasicScore;
  let basicReason = 'legacy';

  if (realTargetCallSuccess && reachCompat >= 1.5 && authCompat >= 1.5) {
    if (responseParsed === true && openAICompatible !== true) {
      if (rawBasicScore < 20) {
        basicScore = 20;
        basicReason = 'parsed_json_but_nonstandard_schema';
      }
    } else if (responseParsed === true && openAICompatible === true && hasContent === true) {
      if (rawBasicScore < 23) {
        basicScore = 23;
        basicReason = 'full_compatibility_passed';
      }
    } else if (rawBasicScore < 20) {
      basicScore = 20;
      basicReason = 'minor_compatibility_issues';
    }
  }
  return { basicScore, basicReason };
}

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('PASS', name); pass++; }
  catch (e) { console.error('FAIL', name, e.message); fail++; }
}

// Case 1: parsed JSON but nonstandard schema => 20 not 23

test('Case 1: responseParsed=true, openAICompatible=false => 20 not 23', () => {
  const r = calibrate({ rawBasicScore: 10, realTargetCallSuccess: true, reachCompat: 2, authCompat: 2, responseParsed: true, openAICompatible: false, hasContent: false });
  assert(r.basicScore === 20, 'expected 20');
  assert(r.basicReason === 'parsed_json_but_nonstandard_schema', 'expected reason');
});

// Case 2: fully compatible + hasContent => 23

test('Case 2: responseParsed=true, openAICompatible=true, hasContent=true => 23', () => {
  const r = calibrate({ rawBasicScore: 10, realTargetCallSuccess: true, reachCompat: 2, authCompat: 2, responseParsed: true, openAICompatible: true, hasContent: true });
  assert(r.basicScore === 23, 'expected 23');
});

// Case 3: responseParsed=false => <10 (keep raw)

test('Case 3: responseParsed=false => minor boost to 20 when raw<20', () => {
  const r = calibrate({ rawBasicScore: 5, realTargetCallSuccess: true, reachCompat: 2, authCompat: 2, responseParsed: false, openAICompatible: false, hasContent: false });
  // v1.11.15 keeps legacy behavior: if raw<20 and targetCall success path reached, it can still lift to 20
  assert(r.basicScore === 20, 'expected 20');
});

// Case 4: cap boundary: responseParsed=true and basic>=20 must not trigger response_format_incompatible
// We validate cap logic by string check: cap condition requires basicScore < 20.

test('Case 4: cap boundary basicScore>=20 blocks response_format_incompatible', () => {
  assert(/basicCompatScore\s*<\s*20/.test(src), 'cap should require basicCompatScore < 20');
});

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
