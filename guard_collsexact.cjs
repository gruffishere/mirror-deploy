// GUARD for the "did we read the whole holding" rule.
//
//   node wrapped/guard_collsexact.cjs
//
// The rule changed on 2026-08-26 from `rows.length >= alchemy totalCount` to `pages < MAX_PAGES`,
// because alchemy's totalCount is systematically 1-4 rows higher than what it will page out and the
// old rule therefore called 954 wallets (19.1%) incomplete when nothing was missing.
//
// ⚠️ A guard that only watches the rule say yes is worthless. Every case below states the answer it
// demands, the file asserts BOTH directions, and it ends by re-running the cases through the OLD rule
// to prove they are not all trivially true. If a change makes the old and new rule agree everywhere,
// this guard says so instead of printing a green line over a rule that stopped mattering.
'use strict';
const path = require('path');
const E = require(path.join(__dirname, 'facet_engine_v2.cjs'));
const NEW = E.walkComplete;                     // the live rule, imported, never re-typed here
const MAX = E.MAX_PAGES;
const OLD = (rows, total) => total === null || rows >= total;

// pages, rows paged, alchemy totalCount, what the answer MUST be, why
const CASES = [
  [3,  325, 328,  true,  'measured: gap 3 of 328, walk ended on its own. 0x6c9486f5…'],
  [2,  105, 106,  true,  'measured: gap 1 of 106, walk ended on its own. 0xc7f8df7b…'],
  [5,  443, 447,  true,  'measured: gap 4 of 447, the widest gap seen in 24 wallets'],
  [1,   17,  17,  true,  'small wallet, no gap at all'],
  [1,    0,   0,  true,  'holds nothing; totalCount 0 is an answer, not a failure'],
  [MAX, 4000, 4000, false, 'hit OUR ceiling exactly on the boundary, even with no gap'],
  [MAX, 4000, 9821, false, 'hit OUR ceiling on a wallet that really is bigger than we read'],
  [MAX + 3, 4000, 9821, false, 'past the ceiling, if a caller ever loosens the loop'],
];

let fail = 0, sawTrue = 0, sawFalse = 0, disagreed = 0;
console.log('rule under test: pages < ' + MAX + '   (MAX_PAGES imported from the engine)\n');
for (const [pages, rows, total, want, why] of CASES) {
  const got = NEW(pages);
  const old = OLD(rows, total);
  if (got !== old) disagreed++;
  want ? sawTrue++ : sawFalse++;
  const ok = got === want;
  if (!ok) fail++;
  console.log((ok ? '  ok  ' : '  ⛔  ') + 'pages ' + String(pages).padStart(3) +
    '  rows ' + String(rows).padStart(5) + '  total ' + String(total).padStart(5) +
    '   want ' + String(want).padEnd(5) + ' got ' + String(got).padEnd(5) +
    ' | old rule said ' + String(old).padEnd(5) + '   ' + why);
}

console.log();
// ⚠️ the checks that make this guard able to fail rather than merely able to pass
if (!sawTrue || !sawFalse) {
  console.log('  ⛔ the cases do not exercise both answers; this guard could not catch a rule stuck on one');
  fail++;
}
if (!disagreed) {
  console.log('  ⛔ the new rule agrees with the old one on every case, so nothing here tests the change');
  fail++;
} else {
  console.log('  ok  the two rules disagree on ' + disagreed + ' case(s), so the change is what is being measured');
}
// and a deliberately broken rule must be caught, or the assertions above prove nothing
const BROKEN = () => true;
const caught = CASES.some(c => BROKEN(c[0]) !== c[3]);
console.log((caught ? '  ok  ' : '  ⛔  ') + 'a rule hardcoded to true is rejected by these cases');
if (!caught) fail++;

console.log('\n' + (fail ? '⛔ ' + fail + ' FAILURE(S)' : '✅ collsExact rule guarded, both directions'));
process.exit(fail ? 1 : 0);
