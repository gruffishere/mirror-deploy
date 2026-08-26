// DATA AUDIT for the WRAPPED engine. Run it after any change to the reader.
//
//   node wrapped/audit.cjs
//
// Four distinct diseases have already been caught in this engine and every one of them was a MISSING
// value read as a REAL one: an Etherscan refusal read as "transacted today", a token list read
// positionally so the wrong decimals hit the wrong token, an absent deployer field read as "never
// deployed", and a part-finished history read as a whole life. This file exists so the next one is
// found by a check rather than by gruff noticing an odd number on his own wallet.
'use strict';
const fs = require('fs'), path = require('path');
const E = require(path.join(__dirname, 'facet_engine_v2.cjs'));
const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'baseline_v2.json'), 'utf8'));
const rows = Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, 'signals_v2.json'), 'utf8')));
const N = rows.length;
const pc = n => (100 * n / N).toFixed(1) + '%';
let problems = 0;
const bad = (label, n, note) => { if (n) { problems++; console.log('  ⛔ ' + label + ': ' + n + ' (' + pc(n) + ')' + (note ? '   ' + note : '')); } };
const warn = (label, n, note) => { if (n) console.log('  ⚠️  ' + label + ': ' + n + ' (' + pc(n) + ')' + (note ? '   ' + note : '')); };

console.log('FACETS WRAPPED data audit — ' + N + ' wallets\n');

// ── 1. impossible values. These cannot happen if the reader is correct ───────────────────────────
console.log('1. IMPOSSIBLE VALUES');
bad('deploys below directDeploys', rows.filter(r => (r.deploys || 0) < (r.directDeploys || 0)).length);
bad('bluePieces above nfts', rows.filter(r => (r.bluePieces || 0) > (r.nfts || 0)).length);
bad('clean collections above raw', rows.filter(r => r.collsRaw != null && (r.colls || 0) > r.collsRaw).length);
bad('idle longer than the wallet is old', rows.filter(r => r.idleDays != null && r.ageDays != null && r.idleDays > r.ageDays + 1).length);
bad('sent plus received not equal to rows', rows.filter(r => r.rowCount != null && r.sent != null && r.received != null && r.sent + r.received !== r.rowCount).length);
bad('negative or NaN anywhere', rows.filter(r => Object.values(r).some(v => typeof v === 'number' && (v < 0 || Number.isNaN(v)))).length);
bad('gas burned but nothing sent', rows.filter(r => (r.gasEth || 0) > 0 && r.sent === 0).length);
bad('failCount above sent', rows.filter(r => (r.failCount || 0) > (r.sent || 0)).length);
bad('first transaction in the future', rows.filter(r => r.firstTs && r.firstTs * 1000 > Date.now()).length);
bad('age but no first timestamp', rows.filter(r => r.ageDays != null && !r.firstTs).length);
if (!problems) console.log('  none');

// ── 2. how often each field is unknown, and whether a zero could be hiding a failure ─────────────
console.log('\n2. UNKNOWN AND SUSPICIOUS ZERO');
const FIELDS = ['eth', 'txs', 'ageDays', 'idleDays', 'recentRate', 'failShare', 'gasRate', 'gasEth',
  'maxValueEth', 'volumeEth', 'inRatio', 'nfts', 'colls', 'bluePieces', 'nftValue', 'tokenEth',
  'whaleEth', 'directDeploys', 'rowCount', 'sent', 'received', 'ens'];
console.log('  field            null      zero      note');
FIELDS.forEach(f => {
  const nulls = rows.filter(r => r[f] === null || r[f] === undefined).length;
  const zeros = rows.filter(r => r[f] === 0).length;
  if (nulls || zeros > N * 0.5) {
    console.log('    ' + f.padEnd(16) + String(nulls).padStart(5) + '     ' + String(zeros).padStart(5) +
      '     ' + (nulls > N * 0.02 ? 'unknown on more than 2%, check the source' : ''));
  }
});
warn('history truncated at the call ceiling', rows.filter(r => r.historyComplete === false).length,
  'lifetime totals are floors for these');
warn('collections truncated at 40 pages', rows.filter(r => r.collsExact === false).length);
warn('collections read cold at least once', rows.filter(r => r.deployerCold).length,
  'only affects the factory count, which A no longer uses');
warn('no outbound transaction at all', rows.filter(r => r.sent === 0).length);
warn('ENS reverse name present', rows.filter(r => r.ens).length, 'display only');

// ── 3. distributions, so a broken unit shows up as an absurd median ──────────────────────────────
console.log('\n3. DISTRIBUTIONS   min / p25 / median / p75 / p99 / max');
const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))];
['ageDays', 'txs', 'rowCount', 'sent', 'received', 'nfts', 'colls', 'bluePieces', 'idleDays',
 'recentRate', 'lifeRate', 'gasEth', 'volumeEth', 'maxValueEth', 'whaleEth', 'directDeploys'].forEach(f => {
  const a = rows.map(r => r[f]).filter(v => typeof v === 'number' && !Number.isNaN(v)).sort((x, y) => x - y);
  if (!a.length) return console.log('  ' + f.padEnd(15) + 'NO DATA');
  const fmt = v => Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : (Number.isInteger(v) ? v : v.toFixed(3));
  console.log('  ' + f.padEnd(15) + [0, .25, .5, .75, .99, 1].map(p => String(fmt(q(a, p))).padStart(9)).join(' '));
});

// ── 4. the axes themselves ───────────────────────────────────────────────────────────────────────
console.log('\n4. AXES AND CALIBRATION');
const cals = rows.map(r => E.calibrate(E.axes(r, base.pop), base.ceil));
E.FACETS.forEach(f => {
  const a = cals.map(c => c[f]).sort((x, y) => x - y);
  const dead = a.filter(v => v <= 0.005).length;
  console.log('  ' + f.padEnd(10) + 'ceiling ' + base.ceil[f].toFixed(3) +
    '   p50 ' + q(a, .5).toFixed(2) + '   p99 ' + q(a, .99).toFixed(2) + '   max ' + a[a.length - 1].toFixed(2) +
    '   at zero ' + pc(dead));
});
const profs = rows.map(r => E.profile(r, base));
const thin = profs.filter(p => p.margin < 0.02).length;
console.log('  wallets whose top two are within 0.02: ' + thin + ' (' + pc(thin) + ')');
// ⚠️ THE QUESTION CHANGED ON 2026-08-26, AND SO DID WHAT IT LOOKS AT.
// It used to read the raw facts map, where a null is CORRECT: it means the signal behind that line
// was never read. What matters is whether anything that leads with the facet word can end up with a
// blank underneath it, and that is now `profile().dominantFact`, which falls back to a stated
// unknown. Checking the fallback for emptiness alone would be a dead test, so both are reported:
// the count that fell back is a real number that grows if reads start failing, and an empty
// dominantFact is a hard failure meaning the fallback itself broke.
const nanAxis = profs.filter(p => E.FACETS.some(f => !isFinite(p.axes[f]))).length;
bad('a NaN or infinite axis', nanAxis, 'it would poison the sort and the dominant facet with it');
const noHist = rows.filter(r => !r.rowCount).length;
warn('no transaction history at all', noHist,
  'their activity rates are scored at zero, not at the population midpoint');

const noFact = profs.filter(p => !p.facts[p.dominant]).length;
const noDom = profs.filter(p => !p.dominantFact).length;
warn('dominant facet explained by the fallback line', noFact, 'their own signal was never read');
bad('dominant facet with NOTHING to show at all', noDom, 'the fallback itself is broken');

// ── 5. does the same input always give the same output ───────────────────────────────────────────
console.log('\n5. DETERMINISM OF THE SCORER (same stored row scored twice)');
let drift = 0;
rows.slice(0, 500).forEach(r => {
  const a = E.profile(r, base), b = E.profile(r, base);
  if (a.dominant !== b.dominant || Math.abs(a.rarity - b.rarity) > 1e-12) drift++;
});
bad('scoring drift on identical input', drift);
if (!drift) console.log('  stable over 500 rows');

console.log('\n' + (problems ? problems + ' PROBLEM CLASS(ES) FOUND' : 'no impossible values found'));
