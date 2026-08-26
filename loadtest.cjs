// LOAD TEST for the MIRROR API. What actually happens when more than one person shows up, and
// whether each guard added on 2026-08-26 can still say no.
//
//   node wrapped/loadtest.cjs --port 8141 [--fresh 0]
//
// ⚠️ THIS SPENDS ALMOST NO API QUOTA ON PURPOSE. Etherscan's free tier is 5 calls a second and the
// key is gruff's, so a test that hammers real wallets is a test that can get it throttled. Everything
// measurable against the cache is measured against the cache, and `--fresh N` is the only part that
// costs anything. It defaults to 0 now that the cache is pre-warmed.
//
// ⚠️ THE ORDER OF THE SECTIONS MATTERS. The rate limiter is per IP and this whole file is one IP, so
// the section that deliberately exhausts the bucket runs LAST. Put it earlier and everything after it
// fails for the wrong reason and the run looks like a broken server.
'use strict';
const http = require('http');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', 8141));
const FRESH = Number(arg('fresh', 0));

function get(path) {
  const t = Date.now();
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: 180000 }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ ms: Date.now() - t, code: res.statusCode, body: body }));
    });
    req.on('error', e => resolve({ ms: Date.now() - t, code: 0, err: e.code || e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ms: Date.now() - t, code: 0, err: 'TIMEOUT' }); });
  });
}
const burst = (n, p) => Promise.all(Array.from({ length: n }, () => get(p)));
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok  ' : '  ⛔  ') + msg); if (!cond) fails++; };

function timing(name, rs) {
  const good = rs.filter(r => r.code === 200).map(r => r.ms).sort((x, y) => x - y);
  const by = {};
  rs.filter(r => r.code !== 200).forEach(b => { const k = b.err || ('HTTP ' + b.code); by[k] = (by[k] || 0) + 1; });
  console.log('  ' + name.padEnd(30) +
    (good.length ? 'p50 ' + String(q(good, .5)).padStart(6) + ' ms   max ' + String(good[good.length - 1]).padStart(6) + ' ms' : '                          ') +
    '   ' + good.length + '/' + rs.length + ' ok' +
    (Object.keys(by).length ? '   ' + Object.entries(by).map(([k, v]) => v + ' x ' + k).join(', ') : ''));
  return { good, by };
}

const CACHED = '/api/read?addr=0x4730497622bdfd6eafe1f09fa22b3a0aca94a646';

(async () => {
  const up = await get('/api/status');
  if (up.code !== 200) { console.log('server not answering on ' + PORT + ': ' + (up.err || up.code)); process.exit(1); }
  const st = JSON.parse(up.body);
  console.log('MIRROR API load test, port ' + PORT);
  console.log('cache ' + st.cached.toLocaleString('en-US') + ' addresses · lanes ' + st.lanes +
    ' · max queue ' + st.maxQueue + '\n');

  console.log('1. THE GUARDS — can each one still say no?');
  const r1 = await get(CACHED + '&refresh=1');
  ok(r1.code === 403, 'refresh=1 without a token is refused        (got ' + r1.code + ')');
  const r2 = await get(CACHED + '&refresh=1&token=wrong');
  ok(r2.code === 403, 'refresh=1 with the wrong token is refused   (got ' + r2.code + ')');
  const r3 = await get('/api/read?addr=notanaddress');
  ok(r3.code === 400, 'a junk address is refused                   (got ' + r3.code + ')');
  const r4 = await get('/cards/../../.keys.json');
  ok(r4.code === 403 || r4.code === 404, 'path traversal out of /cards is refused     (got ' + r4.code + ')');

  console.log('\n2. /api/population — it used to re-read 5.9 MB and re-score 5,000 wallets per call');
  const pop = [];
  for (let i = 0; i < 5; i++) pop.push(await get('/api/population'));
  timing('5 in series', pop);
  // ⚠️ the question is NOT 'was the slowest call fast'. The slowest call IS the first one, which does
  // the work once on purpose. The question is whether the ones after it are free.
  const first = pop[0].ms, rest = pop.slice(1).map(r => r.ms);
  const restMax = Math.max.apply(null, rest);
  ok(pop.every(r => r.code === 200) && restMax < 20,
    'the first call does the work (' + first + ' ms), the next four are memoised (max ' + restMax + ' ms, all were ~111 ms before)');

  console.log('\n   does it still stall an unrelated read that arrives during it?');
  const [p, rd] = await Promise.all([get('/api/population'),
    (async () => { await new Promise(r => setTimeout(r, 30)); return get(CACHED); })()]);
  ok(rd.ms < 20, 'a cached read 30 ms into a population call took ' + rd.ms + ' ms  (was 84)');

  console.log('\n3. A CACHED READ under concurrency');
  timing('10 at once', await burst(10, CACHED));
  timing('30 at once', await burst(30, CACHED));

  if (FRESH > 0) {
    console.log('\n4. UNCACHED READS — ' + FRESH + ' real ones, and that is all');
    const fs = require('fs'), path = require('path');
    const sig = JSON.parse(fs.readFileSync(path.join(__dirname, 'signals_v2.json'), 'utf8'));
    const dir = path.join(__dirname, 'site', 'cache');
    const have = new Set(fs.readdirSync(dir).map(f => f.slice(0, -5)));
    const pool = Object.values(sig).filter(r => r.addr && !have.has(r.addr.toLowerCase()));
    if (!pool.length) console.log('   nothing left uncached in the reference set; skipping');
    for (const w of pool.slice(0, FRESH)) {
      const r = await get('/api/read?addr=' + w.addr);
      console.log('   ' + w.addr.slice(0, 12) + '…  ' + String(w.rowCount).padStart(6) + ' rows  ->  ' +
        String(r.ms).padStart(7) + ' ms   ' + (r.code === 200 ? 'ok' : '⛔ ' + (r.err || r.code)));
    }
  }

  // ⚠️ LAST, because it empties this IP's bucket for the next minute.
  console.log('\n5. THE RATE LIMIT — 80 requests from one address, ceiling is 60 a minute');
  const many = await burst(80, CACHED);
  const t5 = timing('80 at once', many);
  ok((t5.by['HTTP 429'] || 0) > 0, 'the limiter turned some away          (' + (t5.by['HTTP 429'] || 0) + ' x 429)');
  ok(t5.good.length <= 62, 'and it let no more than ~60 through    (' + t5.good.length + ' ok)');
  const after = await get(CACHED);
  ok(after.code === 429, 'the next request is still refused      (got ' + after.code + ')');

  console.log('\n' + (fails ? '⛔ ' + fails + ' CHECK(S) FAILED' : '✅ every guard held'));
  process.exit(fails ? 1 : 0);
})();
