// ADD THE TIME SHAPE TO THE POPULATION, AND NOTHING ELSE.
//
//   node wrapped/add_shape_pop.cjs [--dry]
//
// After fetch_shape.cjs has collected the time shape, the story layer can only use it if the
// population file carries the same arrays. This puts them there.
//
// ⛔ IT MUST NOT TOUCH `ceil`, `centroid` OR `dists`. Those three decide which facet every wallet is,
// and rebuilding the whole baseline to add a story-only field would put 5,000 facets at risk for the
// sake of a beat ordering. Only `pop` gains keys, and only keys no axis reads.
// The script proves that afterwards rather than promising it: it re-scores every wallet with the old
// and the new baseline and refuses to write if a single dominant facet moved.
'use strict';
const fs = require('fs'), path = require('path');
const E = require(path.join(__dirname, 'facet_engine_v2.cjs'));

const DRY = process.argv.includes('--dry');
const BASE = path.join(__dirname, 'baseline_v2.json');
const SIG = path.join(__dirname, 'signals_v2.json');

const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
const sig = JSON.parse(fs.readFileSync(SIG, 'utf8'));
const rows = Object.values(sig);

const withShape = rows.filter(r => r.shape && Object.keys(r.shape).length);
console.log(withShape.length.toLocaleString('en-US') + ' of ' + rows.length.toLocaleString('en-US') +
  ' wallets have a time shape');
if (withShape.length < rows.length * 0.9) {
  console.log('⛔ fewer than 90% are collected. Let fetch_shape.cjs finish first, or the percentiles ' +
    'would be built from whichever wallets happened to be done.');
  process.exit(1);
}

// the new arrays, built by the engine's own buildPop so there is one definition of each
const fresh = E.buildPop(rows);
const before = JSON.parse(JSON.stringify(base.pop));
const next = Object.assign({}, base.pop);
let added = 0;
for (const k of E.SHAPE_KEYS) {
  if (!fresh[k] || !fresh[k].length) { console.log('  ⚠️ nothing collected for ' + k); continue; }
  next[k] = fresh[k];
  added++;
  const a = fresh[k];
  const q = p => a[Math.floor(p * (a.length - 1))];
  console.log('  ' + k.padEnd(17) + a.length.toLocaleString('en-US').padStart(6) + ' values   ' +
    'p10 ' + (+q(.1)).toFixed(2) + '   median ' + (+q(.5)).toFixed(2) + '   p90 ' + (+q(.9)).toFixed(2));
}

// ⚠️ THE CHECK THAT MAKES THIS SAFE. Every existing key must be byte-identical, and every wallet must
// keep the facet it had. If either fails, nothing is written.
let changedKeys = 0;
for (const k of Object.keys(before)) {
  if (JSON.stringify(before[k]) !== JSON.stringify(next[k])) { console.log('  ⛔ existing key changed: ' + k); changedKeys++; }
}
const after = Object.assign({}, base, { pop: next });
let moved = 0;
for (const r of rows) {
  if (E.profile(r, base).dominant !== E.profile(r, after).dominant) moved++;
}
console.log('\nexisting population keys altered : ' + changedKeys + '   (must be 0)');
console.log('wallets whose facet moved        : ' + moved + '   (must be 0)');

if (changedKeys || moved) { console.log('\n⛔ NOT WRITTEN.'); process.exit(1); }
if (DRY) { console.log('\ndry run, nothing written. ' + added + ' key(s) would be added.'); process.exit(0); }

fs.writeFileSync(BASE + '.writing', JSON.stringify(after));
fs.renameSync(BASE + '.writing', BASE);
console.log('\n✅ wrote ' + added + ' new population key(s). Nothing else in the baseline changed.');
