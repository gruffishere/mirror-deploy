// THE TWIN INDEX — "your closest twin among 5,000 real wallets".
//
//   node wrapped/twins.cjs --build      writes twin_index.json (5,000 x 7 calibrated axes)
//   node wrapped/twins.cjs --measure    is the twin line meaningful, or does everyone have one?
//   node wrapped/twins.cjs 0xaddr ...   the nearest twin of each address given
//
// ⚠️ A "closest twin" is only worth printing if closeness varies. If every wallet has a neighbour at
// the same tiny distance the line says nothing about anybody, so --measure runs before it ships.
'use strict';
const fs = require('fs'), path = require('path');
const E = require(path.join(__dirname, 'facet_engine_v2.cjs'));
const F = E.FACETS;
const P = path.join(__dirname, 'twin_index.json');

function build() {
  const sig = require(path.join(__dirname, 'signals_v2.json'));
  const base = require(path.join(__dirname, 'baseline_v2.json'));
  const rows = [];
  for (const a of Object.keys(sig)) {
    const s = sig[a];
    if (!s || !s.addr) continue;
    const cal = E.calibrate(E.axes(s, base.pop), base.ceil);
    const v = F.map(f => cal[f]);
    if (v.some(x => !isFinite(x))) continue;
    const ord = F.slice().sort((x, y) => cal[y] - cal[x]);
    rows.push({ a, e: s.ens || null, d: ord[0], v: v.map(x => +x.toFixed(5)) });
  }
  fs.writeFileSync(P, JSON.stringify(rows));
  console.log('wrote ' + P + '   ' + rows.length + ' wallets');
  return rows;
}

const load = () => fs.existsSync(P) ? JSON.parse(fs.readFileSync(P, 'utf8')) : build();
const dist = (a, b) => { let s = 0; for (let i = 0; i < 7; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };

function nearest(v, rows, skip) {
  let best = null, bd = Infinity;
  for (const r of rows) {
    if (skip && r.a === skip) continue;
    const d = dist(v, r.v);
    if (d < bd) { bd = d; best = r; }
  }
  return { twin: best, d: bd };
}

const argv = process.argv.slice(2);
if (argv.includes('--build')) { build(); process.exit(0); }

const rows = load();

if (argv.includes('--measure')) {
  // How close is the nearest neighbour, for a random 400 of the population?
  const ds = [];
  for (let i = 0; i < rows.length; i += Math.max(1, Math.floor(rows.length / 400))) {
    ds.push(nearest(rows[i].v, rows, rows[i].a).d);
  }
  ds.sort((a, b) => a - b);
  const q = p => ds[Math.min(ds.length - 1, Math.floor(p * ds.length))].toFixed(4);
  // the scale to compare against: how far apart are two wallets picked at random?
  const rnd = [];
  for (let i = 0; i < 2000; i++) rnd.push(dist(rows[(i * 7919) % rows.length].v, rows[(i * 104729 + 13) % rows.length].v));
  rnd.sort((a, b) => a - b);
  console.log('nearest-neighbour distance, ' + ds.length + ' sampled wallets of ' + rows.length);
  console.log('  min ' + q(0) + '  p10 ' + q(.1) + '  median ' + q(.5) + '  p90 ' + q(.9) + '  max ' + ds[ds.length - 1].toFixed(4));
  console.log('two RANDOM wallets, for scale');
  console.log('  p10 ' + rnd[200].toFixed(4) + '  median ' + rnd[1000].toFixed(4) + '  p90 ' + rnd[1800].toFixed(4));
  const ratio = (+q(.5)) / rnd[1000];
  console.log('\nmedian twin is ' + (100 * ratio).toFixed(1) + '% of the median random distance.');
  console.log('spread of twin distance p90/p10 = ' + ((+q(.9)) / (+q(.1))).toFixed(1) + 'x');
  process.exit(0);
}

// ── HOW MANY WALLETS ARE ANYTHING LIKE YOU ────────────────────────────────────────────────────────
// "rarer than 99.23%" is a percentile of a distance: true, and impossible to picture. The same fact
// said as a count is a sentence. The radius is a choice, so it is MEASURED rather than picked. At
// 0.10 a third of everybody is told nobody is like them, which makes the line worthless; at 0.15
// that is 6.5%, rare enough to mean something on the day it happens. `--radius` reprints the table.
const NEAR_R = 0.15;
const nearCount = (v, skip) => { let n = 0; for (const r of rows) if (r.a !== skip && dist(v, r.v) < NEAR_R) n++; return n; };

if (argv.includes('--radius')) {
  for (const R of [0.10, 0.15, 0.20, 0.25]) {
    const counts = [];
    for (let i = 0; i < rows.length; i += 12) {
      let n = 0; for (const r of rows) if (r.a !== rows[i].a && dist(rows[i].v, r.v) < R) n++;
      counts.push(n);
    }
    counts.sort((a, b) => a - b);
    const q = p => counts[Math.floor(p * (counts.length - 1))];
    const zero = counts.filter(c => c === 0).length;
    console.log('radius ' + R.toFixed(2) + '   min ' + q(0) + '  p10 ' + q(.1) + '  median ' + q(.5) +
      '  p90 ' + q(.9) + '  max ' + q(1) + '   told "nobody" ' + (100 * zero / counts.length).toFixed(1) + '%');
  }
  process.exit(0);
}

// nearest twin + neighbour count for the addresses given
const cache = require(path.join(__dirname, 'site', 'cache_v2.json'));
for (const a of argv) {
  const key = a.toLowerCase();
  const c = cache[key];
  if (!c) { console.log(a + '  not in cache'); continue; }
  const v = F.map(f => c.profile.axes[f]);
  const r = nearest(v, rows, key);
  console.log((c.signals.ens || key.slice(0, 10)) + '  (' + c.profile.dominant + ')');
  console.log('   twin  ' + (r.twin.e || r.twin.a) + '   ' + r.twin.d + '   distance ' + r.d.toFixed(4));
  console.log('   near  ' + nearCount(v, key) + ' of ' + rows.length + ' within ' + NEAR_R);
}
