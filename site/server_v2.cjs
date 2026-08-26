// FACETS WRAPPED / THE MIRROR — the API.
//
//   node wrapped/site/server_v2.cjs --port 8141 [--admin <token>] [--lanes 1]
//
// ⚠️ EVERY GUARD BELOW EXISTS BECAUSE A LOAD TEST MEASURED THE PROBLEM IT FIXES, 2026-08-26.
// Re-run `node wrapped/loadtest.cjs --port 8141` after any change here. What it found:
//
//   cached read       200 at once -> 37 ms, 200/200 ok.  The server itself was never the problem.
//   /api/population   10 at once -> 1,002 ms each, AND it stalled an unrelated cached read that
//                     arrived 30 ms later from 1 ms to 84 ms. It re-read 5.9 MB and re-scored 5,000
//                     wallets synchronously ON EVERY CALL, unlimited and unauthenticated.
//                     ⇒ computed once, and rationed.
//   ?refresh=1        skipped the cache with nothing in its way, so one script could spend the
//                     Etherscan quota on addresses that had already been answered. ⇒ admin only.
//   uncached read     1.6 s / 19.9 s / 11.6 s for 26 / 530 / 6,798 rows. NOT driven by history
//                     length: the 530 row wallet was the slowest of the three. It is Alchemy
//                     returning `contractDeployer` cold and the engine retrying up to four times
//                     with long waits. That retry is deliberate and fixes a real bug, so it must
//                     not be "optimised" without measuring what it was put there for.
//   the queue         one address in flight, so 50 first-time visitors meant the last waited 9.7
//                     minutes with no idea why. ⇒ the queue is BOUNDED and reports its own depth.
//
// ⚠️ Etherscan's free tier is 5 calls per second and one read costs about 3, so roughly 1.5 reads a
// second is the ceiling however clever the queue gets. Raising it is a paid plan, not a code change.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const E = require(path.join(__dirname, '..', 'facet_engine_v2.cjs'));
const STORY = require(path.join(__dirname, '..', 'story.cjs'));
const CLAIMS = require(path.join(__dirname, '..', 'claims.cjs'));
const PIECE = require(path.join(__dirname, '..', 'mirror_piece.cjs'));
const CARDPNG = require(path.join(__dirname, '..', 'cardpng.cjs'));

const argOf = k => {
  const eq = (process.argv.find(a => a.startsWith('--' + k + '=')) || '').split('=')[1];
  const i = process.argv.indexOf('--' + k);
  return eq != null ? eq : (i >= 0 ? process.argv[i + 1] : undefined);
};
// ⚠️ process.env.PORT is how every host tells an app where to listen; without it the container
// binds 8141, the platform health-checks a different port, and the deploy is marked dead.
const PORT = Number(argOf('port') || process.env.PORT || 8141);
const LANES = Math.max(1, Number(argOf('lanes') || 1));
const ADMIN = argOf('admin') || process.env.MIRROR_ADMIN || null;

const BASELINE = path.join(__dirname, '..', 'baseline_v2.json');
// ⚠️ MUST BE MOVABLE. On a host the working directory is wiped on every deploy, so if the cache
// lives beside the code it is thrown away each time and thousands of API calls are burnt to
// rebuild it. Point MIRROR_CACHE_DIR at the persistent disk in production.
const CACHE_DIR = process.env.MIRROR_CACHE_DIR || path.join(__dirname, 'cache');
const LEGACY = path.join(__dirname, 'cache_v2.json');
const PAGE = path.join(__dirname, 'mirror.html');
const BENCH = path.join(__dirname, 'index_v2.html');   // the old rig, kept reachable at /bench

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

// ── THE CACHE ─────────────────────────────────────────────────────────────────────────────────────
// ⚠️ ONE FILE PER ADDRESS. It used to be a single JSON rewritten IN FULL on every uncached read,
// which is invisible at 8 addresses and 62 KB and becomes 18 MB written per visitor once the 5,000
// reference wallets are pre-warmed in (`node wrapped/prewarm.cjs`).
fs.mkdirSync(CACHE_DIR, { recursive: true });
const cache = new Map();
const cfile = a => path.join(CACHE_DIR, a + '.json');
(function loadCache() {
  let n = 0, dropped = 0;
  for (const f of fs.readdirSync(CACHE_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const row = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
      // ⛔ DROP ANY READING THAT WAS NEVER ACTUALLY READ, AND DELETE IT.
      // While the keys were not reaching the container the server stored 'this wallet has never
      // transacted' for every wallet anyone looked up, then served it from cache forever after.
      // Measured on the live site: gunslinger.eth, 4,101 transactions and 2,000 days old, sat on
      // disk as empty. read() can no longer write one, but the ones already written have to go.
      // A wallet that genuinely never transacted has rowCount 0; null means the walk never happened.
      if (row && row.signals && row.signals.rowCount == null) {
        fs.unlinkSync(path.join(CACHE_DIR, f));
        dropped++;
        continue;
      }
      cache.set(f.slice(0, -5), row); n++;
    } catch {}
  }
  // the old single-file cache is still read, so nothing already answered is lost in the move
  try {
    const old = JSON.parse(fs.readFileSync(LEGACY, 'utf8'));
    for (const a of Object.keys(old)) if (!cache.has(a)) { cache.set(a, old[a]); n++; }
  } catch {}
  console.log(n + ' addresses in the cache' + (dropped ? '  (dropped ' + dropped + ' that had never actually been read)' : ''));
})();
const remember = (a, row) => { cache.set(a, row); fs.writeFile(cfile(a), JSON.stringify(row), () => {}); };

let price = null, priceAt = 0;

// ── WHAT THE CARD NEEDS THAT THE READING DOES NOT CONTAIN ─────────────────────────────────────────
// The rank, the closest twin and the neighbour count are positions IN A POPULATION, so they cannot
// live inside a single wallet's reading. They are computed here, per request, against the frozen
// 5,000 wallet index.
// ⚠️ COMPUTED, NEVER STORED. A pre-warmed row has no rank in it, and if it did, rebuilding the index
// would leave 5,000 stale numbers behind. O(5,000) of float maths per read is not worth caching.
// ⚠️ THE DENOMINATOR THE CARD PRINTS IS THIS FILE'S LENGTH. If the index ever changes size, the card
// says the new number, because it reads it from here rather than carrying "5,000" as a literal.
const TWINS = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'twin_index.json'), 'utf8')); }
  catch { console.log('⚠️  no twin_index.json: run node wrapped/twins.cjs --build'); return []; }
})();
const NEAR_R = 0.15;   // measured, not chosen: see the note in twins.cjs

// ── THE ARTWORK, ON DEMAND ────────────────────────────────────────────────────────────────────────
// The card needs a piece for whatever address was typed, and only five were ever pre-rendered by
// hand. Measured: 27 ms for the first render while the engine warms, 1.6 ms after, 17 KB of SVG.
// ⚠️ SVG, NOT PNG. The renderer's native output is a 35x35 viewBox of 1x1 rects; rasterising it would
// need a headless browser on the server for no gain, and an <img> of the SVG scales to any card size.
// ⚠️ It is DETERMINISTIC from the address, so unlike everything else here it may be cached hard by
// the browser. The memory cache is bounded: an unbounded one is a way to fill the process from outside.
const ART = new Map();
const ART_MAX = 3000;
// ⚠️ THE HEAT COMES FROM THE SERVER, NOT THE QUERY STRING. If the page could ask for its own heat,
// anyone could request a fully gilded portrait for an empty wallet, and the one thing this piece has
// to be is a picture of the wallet it belongs to.
function heatOf(addr) {
  const row = cache.get(addr);
  if (!row || !row.profile) return 0;
  return Math.max(0, Math.min(1, row.profile.axes[row.profile.dominant] || 0));
}
function art(addr, facet) {
  const heat = heatOf(addr);
  // heat is in the key: a wallet that gets read again after moving gets the portrait it earned now
  const k = addr + '|' + facet + '|' + heat.toFixed(2);
  if (ART.has(k)) return ART.get(k);
  const svg = PIECE.bestPiece(addr, facet, heat).svg;
  if (ART.size >= ART_MAX) ART.delete(ART.keys().next().value);
  ART.set(k, svg);
  return svg;
}
function extras(p) {
  if (!TWINS.length) return null;
  const me = E.FACETS.map(f => p.axes[f]);
  const self = String(p.addr || '').toLowerCase();
  const ai = E.FACETS.indexOf(p.dominant);
  const mine = p.axes[p.dominant];
  let best = null, bd = Infinity, near = 0, above = 0;
  for (const r of TWINS) {
    if (r.v[ai] > mine) above++;
    if (r.a === self) continue;
    let sum = 0;
    for (let i = 0; i < 7; i++) { const d = me[i] - r.v[i]; sum += d * d; }
    const dist = Math.sqrt(sum);
    if (dist < NEAR_R) near++;
    if (dist < bd) { bd = dist; best = r; }
  }
  return {
    n: TWINS.length,
    rank: { n: above + 1, pct: +(100 * (above + 1) / TWINS.length).toFixed(2) },
    near,
    twin: best ? { who: best.e || (best.a.slice(0, 10) + '...' + best.a.slice(-4)),
                   facet: best.d, d: +bd.toFixed(4) } : null
  };
}

// ── THE QUEUE ─────────────────────────────────────────────────────────────────────────────────────
// ⚠️ ONE ADDRESS IN FLIGHT PER LANE. Two visitors arriving together would otherwise put four
// Etherscan calls on the wire at once against a 5 per second ceiling, and a refusal read as data is
// the exact bug that wiped out GHOST in v1. `--lanes` exists so a paid plan can raise it. On the free
// tier, leave it at 1.
// ⚠️ AND IT IS BOUNDED. Unbounded, the 60th arrival is told nothing and waits eleven minutes at a
// spinner, which reads as a dead site. Past the bound they get turned away with a number instead.
const MAX_QUEUE = 40;
let depth = 0;
const lanes = Array.from({ length: LANES }, () => Promise.resolve());
let turn = 0;
function queue(fn) {
  const i = turn++ % LANES;
  depth++;
  const r = lanes[i].then(fn, fn).finally(() => { depth--; });
  lanes[i] = r.catch(() => {});
  return r;
}

async function read(addr, refresh) {
  addr = addr.toLowerCase();
  if (!refresh && cache.has(addr)) return { ...cache.get(addr), cached: true };
  if (!price || Date.now() - priceAt > 15 * 60e3) { price = await E.ethUsd(); priceAt = Date.now(); }
  const s = await E.signals(addr, price);
  const p = E.profile(s, base);
  // ⚠️ The story is built on the server so the page cannot invent a line the engine never produced.
  // Every sentence has to trace back to a number this file measured.
  const all = STORY.beats(s, s.shape, p, base.pop);
  const row = { profile: p, signals: s, at: new Date().toISOString(),
                story: { card: STORY.card(all, 4), report: all, closing: STORY.closing(s, p) } };
  // ⛔ A FAILED FETCH MUST NEVER BE STORED AS AN ANSWER.
  // rowCount is 0 for a wallet that genuinely never transacted and null when the walk could not be
  // made at all; collsRaw is the same for the holdings leg. Both render identically as "you hold
  // nothing at all", so writing the second one to disk turns a passing outage into a permanent wrong
  // answer for that wallet. Measured on the live site: with the keys not reaching the container,
  // gunslinger.eth — 4,101 transactions, 2,000 days old, 205 collections — was stored as empty and
  // then served from cache, which is how it was found.
  const unread = s.rowCount == null || s.collsRaw == null;
  if (!unread) remember(addr, row);
  return { ...row, cached: false, partial: unread };
}

// ── RATE LIMIT ────────────────────────────────────────────────────────────────────────────────────
// ⚠️ Two buckets per client, because the two costs are not the same. Answering from cache is free and
// can be generous. An uncached read spends about three Etherscan calls out of an allowance that
// belongs to gruff, so it is rationed on its own. This is the guard that does NOT depend on how much
// traffic the site gets: it is one bored person with a loop, not a crowd.
const BUCKETS = new Map();
const LIMIT = { any: { n: 60, per: 60e3 }, fresh: { n: 6, per: 60e3 }, claim: { n: 10, per: 60e3 },
                png: { n: 8, per: 60e3 } };
function allow(ip, kind) {
  const now = Date.now();
  let b = BUCKETS.get(ip);
  if (!b) { b = { any: [], fresh: [], claim: [], png: [] }; BUCKETS.set(ip, b); }
  const L = LIMIT[kind], hits = b[kind];
  while (hits.length && now - hits[0] > L.per) hits.shift();
  if (hits.length >= L.n) return Math.ceil((L.per - (now - hits[0])) / 1000);
  hits.push(now);
  return 0;
}
// ⚠️ the map would otherwise grow for the life of the process, one entry per address that ever visited
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of BUCKETS)
    if (!['any', 'fresh', 'claim', 'png'].some(k => b[k].some(t => now - t < 60e3))) BUCKETS.delete(ip);
}, 120e3).unref();

const clientIp = req =>
  String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
  req.socket.remoteAddress || 'unknown';

const send = (res, code, body, type, extra) => {
  // ⚠️ CORS, because THE MIRROR is read from the FACETS site on another origin. Without it the fetch
  // is blocked by the browser and the failure looks like a dead API rather than a missing header.
  // Wide open on purpose: this is a public read of public chain data with nothing to authorise. The
  // rationing above is what protects it, not the origin header.
  res.writeHead(code, Object.assign({
    'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type' }, extra || {}));
  res.end(body);
};
const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), null, extra);

// ⚠️ CAPPED. Reading a request body without a ceiling lets anyone hand the process as much memory as
// they feel like. 16 KB is far more than a claim needs.
function body(req) {
  return new Promise((resolve, reject) => {
    let n = 0, data = '';
    req.on('data', c => {
      n += c.length;
      if (n > 16384) { reject(new Error('body too large')); req.destroy(); return; }
      data += c;
    });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

// who has signed, in memory, so a read can say so without walking the log every time
const CLAIMED = new Map();
CLAIMS.signedLatest().forEach(r => CLAIMED.set(r.addr, { name: r.name, handle: r.handle }));

// ── /api/population, COMPUTED ONCE ────────────────────────────────────────────────────────────────
// It answers a question about a file that cannot change while the process runs, and it used to
// re-read 5.9 MB and re-score 5,000 wallets on every call, on the single thread that also serves
// everybody else.
let POP = null;
function population() {
  if (POP) return POP;
  const rows = Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'signals_v2.json'), 'utf8')));
  const win = {};
  E.FACETS.forEach(f => win[f] = 0);
  rows.forEach(r => win[E.profile(r, base).dominant]++);
  POP = { n: rows.length, win, built: base.built };
  return POP;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const ip = clientIp(req);

  if (u.pathname === '/' || u.pathname === '/index.html') {
    let page = fs.readFileSync(PAGE, 'utf8');
    // ⚠️ AN INTENT URL CANNOT CARRY AN IMAGE. The only way a shared card reaches a timeline is for the
    // LINK to advertise one, so a /?addr= request gets its own og tags pointing at that wallet's PNG.
    // ⚠️ It needs a PUBLIC host: X's crawler cannot fetch localhost, so this does nothing until the
    // domain exists. It is wired now so that turning it on is a DNS change and not a code change.
    const q = String(u.searchParams.get('addr') || '').trim().toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(q) && cache.has(q)) {
      const row = cache.get(q);
      const claimed = CLAIMED.get(q);
      const who = (claimed && claimed.handle ? '@' + claimed.handle : null) ||
                  row.signals.ens || (q.slice(0, 6) + '…' + q.slice(-4));
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || ('localhost:' + PORT));
      const proto = String(req.headers['x-forwarded-proto'] || (host.indexOf('localhost') === 0 ? 'http' : 'https'));
      const origin = proto + '://' + host;
      const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const title = esc(who) + ' is ' + row.profile.dominant + ' — FACETS: THE MIRROR';
      const desc = 'Read against 5,000 real Ethereum wallets. Who are you on chain?';
      const img = origin + '/api/card.png?addr=' + q;
      page = page.replace('</head>',
        '<meta property="og:title" content="' + title + '">' +
        '<meta property="og:description" content="' + desc + '">' +
        '<meta property="og:image" content="' + img + '">' +
        '<meta property="og:url" content="' + origin + '/?addr=' + q + '">' +
        '<meta name="twitter:card" content="summary_large_image">' +
        '<meta name="twitter:title" content="' + title + '">' +
        '<meta name="twitter:description" content="' + desc + '">' +
        '<meta name="twitter:image" content="' + img + '"></head>');
    }
    return send(res, 200, page, 'text/html; charset=utf-8');
  }
  if (u.pathname === '/bench')
    return send(res, 200, fs.readFileSync(BENCH), 'text/html; charset=utf-8');

  // what the page needs in order to tell somebody WHY they are waiting
  if (u.pathname === '/api/status')
    return json(res, 200, { cached: cache.size, queue: depth, lanes: LANES, maxQueue: MAX_QUEUE,
                            keys: E.hasKeys() });

  // the mascot sprite and its metadata, copied from the FACETS site so the Mirror can carry the same
  // token #1066 that watches you there
  if (u.pathname.startsWith('/img/')) {
    const root = path.resolve(path.join(__dirname, 'img'));
    const file = path.resolve(root, u.pathname.slice(5));
    if (!file.startsWith(root) || !fs.existsSync(file)) return json(res, 404, { error: 'no' });
    const t = { '.png': 'image/png', '.json': 'application/json', '.jpg': 'image/jpeg',
                '.svg': 'image/svg+xml' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
    return send(res, 200, fs.readFileSync(file), t, { 'Cache-Control': 'public, max-age=86400' });
  }

  // ── THE CARD AS A PNG ───────────────────────────────────────────────────────────────────────────
  // ⚠️ It rasterises the real card page, so the file somebody shares is a picture of exactly what
  // they were looking at. Rendering is heavy and serialised, so it gets its own ration rather than
  // sharing the cheap one: a page load costs one read and one art call, but only one PNG.
  if (u.pathname === '/api/card.png') {
    const wait = allow(ip, 'png');
    if (wait) return json(res, 429, { error: 'one card at a time, try again in ' + wait + 's' },
      { 'Retry-After': wait });
    let a = String(u.searchParams.get('addr') || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
      const r = await E.resolveName(a).catch(() => null);
      if (!r) return json(res, 400, { error: 'give a 0x address or an ENS name' });
      a = r;
    }
    a = a.toLowerCase();
    // ⚠️ only a wallet already in the cache can be exported. Otherwise a PNG request would quietly
    // become a full chain read behind a browser launch, which is the most expensive thing here
    // wearing the costume of the cheapest.
    if (!cache.has(a)) return json(res, 409, { error: 'read this wallet first' });
    // the stamp is everything that changes the picture, so a card that gains a name after signing
    // stops serving the anonymous one
    const c = CLAIMED.get(a);
    const stamp = (cache.get(a).at || '0').replace(/[^0-9]/g, '').slice(0, 14) +
      (c ? '_' + Buffer.from((c.name || '') + '|' + (c.handle || '')).toString('hex').slice(0, 16) : '');
    try {
      const file = await CARDPNG.cardPng('http://127.0.0.1:' + PORT, a, stamp);
      const name = (c && c.handle ? c.handle : (cache.get(a).signals.ens || a.slice(0, 10)))
        .replace(/[^A-Za-z0-9_.-]/g, '');
      return send(res, 200, fs.readFileSync(file), 'image/png', {
        'Cache-Control': 'public, max-age=600',
        'Content-Disposition': 'inline; filename="facets-mirror-' + name + '.png"' });
    } catch (e) {
      return json(res, 500, { error: String(e && e.message || e) });
    }
  }

  if (u.pathname === '/api/art.svg') {
    const wait = allow(ip, 'any');
    if (wait) return json(res, 429, { error: 'too many requests' }, { 'Retry-After': wait });
    const a = String(u.searchParams.get('addr') || '').toLowerCase();
    const f = String(u.searchParams.get('facet') || '').toUpperCase();
    if (!/^0x[0-9a-f]{40}$/.test(a)) return json(res, 400, { error: 'bad address' });
    if (E.FACETS.indexOf(f) < 0) return json(res, 400, { error: 'bad facet' });
    try {
      return send(res, 200, art(a, f), 'image/svg+xml; charset=utf-8',
        { 'Cache-Control': 'public, max-age=31536000, immutable' });
    } catch (e) { return json(res, 500, { error: 'could not draw that' }); }
  }

  // ⚠️ PUBLIC, AND DELIBERATELY THIN. /api/lists/* is admin only because it carries signatures and
  // the exact signed message; this carries a name, a handle and a facet and nothing that could be
  // replayed. The address is included because the board renders each person's card from it, and the
  // card is the thing they signed in order to show.
  if (u.pathname === '/api/signed') {
    const wait = allow(ip, 'any');
    if (wait) return json(res, 429, { error: 'too many requests' }, { 'Retry-After': wait });
    const rows = CLAIMS.verifyAll().good
      .map(r => ({ addr: r.addr, name: r.name, handle: r.handle,
                   // shown, but marked: on the board and not in the draw
                   eligible: !CLAIMS.EXCLUDED.has(r.addr),
                   facet: r.facet || (cache.get(r.addr) || {}).profile && cache.get(r.addr).profile.dominant || null,
                   t: r.t }))
      .sort((a, b) => (a.t < b.t ? 1 : -1));               // newest first
    return json(res, 200, { n: rows.length, rows: rows });
  }

  if (u.pathname === '/signed')
    return send(res, 200, fs.readFileSync(path.join(__dirname, 'signed.html')), 'text/html; charset=utf-8');

  if (u.pathname === '/api/population') {
    const wait = allow(ip, 'any');
    if (wait) return json(res, 429, { error: 'too many requests, try again in ' + wait + 's' }, { 'Retry-After': wait });
    return json(res, 200, population());
  }

  // ⛔ REMOVING A SIGNATURE. Admin token, one address, never a sweep.
  // It exists because the lists live on a mounted disk that nothing else can reach: without it the
  // only way to correct a row is a shell on the container, and there is not always one. Every
  // request is printed, so the log says who was removed and when even though the row is gone.
  // the board gruff watches during a launch. The page is admin gated because the list it draws is,
  // and it carries the token in the URL exactly like every other admin route here.
  if (u.pathname === '/live') {
    if (!ADMIN || u.searchParams.get('token') !== ADMIN) return json(res, 403, { error: 'no' });
    return send(res, 200, fs.readFileSync(path.join(__dirname, 'live.html')), 'text/html; charset=utf-8');
  }

  if (u.pathname === '/api/admin/unsign') {
    if (!ADMIN || u.searchParams.get('token') !== ADMIN) return json(res, 403, { error: 'no' });
    const a = String(u.searchParams.get('addr') || '').toLowerCase();
    const out = CLAIMS.unsign(a);
    if (out.ok) CLAIMED.delete(a);        // or the card keeps calling itself signed until a restart
    console.log('admin unsign ' + a + ' -> ' + JSON.stringify(out));
    return json(res, out.ok ? 200 : 400, out);
  }

  // ⚠️ the card renderer lives in wrapped/cards/ and was never reachable from here
  if (u.pathname.startsWith('/cards/')) {
    const rel = u.pathname.slice('/cards/'.length);
    const root = path.resolve(path.join(__dirname, '..', 'cards'));
    const file = path.resolve(root, rel);
    if (!file.startsWith(root)) return json(res, 403, { error: 'no' });   // no traversal
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
      return json(res, 404, { error: 'no such card file: ' + rel });
    const type = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
                   '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                   '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
                   '.woff2': 'font/woff2'
                 }[path.extname(file).toLowerCase()] || 'application/octet-stream';
    return send(res, 200, fs.readFileSync(file), type);
  }

  if (req.method === 'OPTIONS') return send(res, 204, '');

  // ── the claim ───────────────────────────────────────────────────────────────────────────────────
  if (u.pathname === '/api/nonce' && req.method === 'POST') {
    const wait = allow(ip, 'any');
    if (wait) return json(res, 429, { error: 'too many requests, try again in ' + wait + 's' }, { 'Retry-After': wait });
    let b; try { b = await body(req); } catch (e) { return json(res, 400, { error: e.message }); }
    const a = String(b.address || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return json(res, 400, { error: 'give a 0x address' });
    return json(res, 200, CLAIMS.issueNonce(a));
  }

  if (u.pathname === '/api/claim' && req.method === 'POST') {
    const wait = allow(ip, 'claim');
    if (wait) return json(res, 429, { error: 'too many signatures, try again in ' + wait + 's' }, { 'Retry-After': wait });
    let b; try { b = await body(req); } catch (e) { return json(res, 400, { error: e.message }); }
    const r = CLAIMS.claim(b);
    if (r.ok) CLAIMED.set(r.addr, { name: r.name, handle: r.handle });
    return json(res, r.error ? 400 : 200, r);
  }

  // ── the lists, admin only ───────────────────────────────────────────────────────────────────────
  // ⚠️ NOT PUBLIC. reads.jsonl is who looked at whom and signed.jsonl carries signatures and handles.
  // Neither belongs on an open endpoint, and the FCFS CSV is the mint list itself.
  if (u.pathname.startsWith('/api/lists/')) {
    if (!ADMIN || u.searchParams.get('token') !== ADMIN) return json(res, 403, { error: 'no' });
    if (u.pathname === '/api/lists/stats') return json(res, 200, CLAIMS.stats());
    if (u.pathname === '/api/lists/fcfs.csv') {
      const out = CLAIMS.fcfsCsv(Number(u.searchParams.get('limit') || 1), u.searchParams.get('price') || 0);
      // ⚠️ every excluded and every rejected row is NAMED in the headers, never dropped in silence
      return send(res, 200, out.csv, 'text/csv; charset=utf-8', {
        'X-Rows': String(out.count), 'X-Rejected': String(out.rejected),
        'X-Excluded': out.excluded.join(',') || 'none' });
    }
    // the two lists gruff asked to be able to ask for, as files a spreadsheet will open
    const csvOut = (out, name) => send(res, 200, out.csv, 'text/csv; charset=utf-8',
      { 'X-Rows': String(out.count), 'Content-Disposition': 'inline; filename="' + name + '"' });
    if (u.pathname === '/api/lists/reads.csv') return csvOut(CLAIMS.readsCsv(), 'reads.csv');
    if (u.pathname === '/api/lists/wallets.csv') return csvOut(CLAIMS.uniqueReadsCsv(), 'wallets.csv');
    if (u.pathname === '/api/lists/signed.csv') return csvOut(CLAIMS.signedCsv(), 'signed.csv');
    return json(res, 404, { error: 'no such list' });
  }

  if (u.pathname === '/api/read') {
    const wait = allow(ip, 'any');
    if (wait) return json(res, 429, { error: 'too many requests, try again in ' + wait + 's' }, { 'Retry-After': wait });

    let addr = (u.searchParams.get('addr') || '').trim();
    let resolvedFrom = null;
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      // ENS is wired through ens.cjs, keccak-256 and all. "read vitalik.eth" is the share that travels.
      const r = await E.resolveName(addr).catch(() => null);
      if (!r) return json(res, 400, { error: addr.includes('.')
        ? 'could not resolve ' + addr : 'give a 0x address or an ENS name' });
      resolvedFrom = addr; addr = r;
    }
    addr = addr.toLowerCase();

    // ⚠️ REFRESH IS NOT A PUBLIC BUTTON. It skips the cache, so without this anyone could make the
    // server pay full price for an address it had already answered, as often as they liked.
    const wantRefresh = u.searchParams.get('refresh') === '1';
    const refresh = wantRefresh && !!ADMIN && u.searchParams.get('token') === ADMIN;
    if (wantRefresh && !refresh) return json(res, 403, { error: 'refresh is not public' });

    // a cached answer costs nothing, so it never queues and never touches the uncached ration
    if (!refresh && cache.has(addr)) {
      const row = cache.get(addr);
      CLAIMS.logRead(addr, { facet: row.profile && row.profile.dominant, cached: true });
      return json(res, 200, { ...row, cached: true, resolvedFrom,
        claimed: CLAIMED.get(addr) || null, mirror: extras(row.profile) });
    }

    const fw = allow(ip, 'fresh');
    if (fw) return json(res, 429, { error: 'that is a lot of new wallets. try again in ' + fw + 's' },
      { 'Retry-After': fw });
    if (depth >= MAX_QUEUE)
      return json(res, 503, { error: 'the queue is full, try again shortly', queue: depth },
        { 'Retry-After': 60 });

    const place = depth + 1;
    try {
      const out = await queue(() => read(addr, refresh));
      CLAIMS.logRead(addr, { facet: out.profile && out.profile.dominant, cached: false });
      return json(res, 200, { ...out, resolvedFrom, queuedAt: place,
        claimed: CLAIMED.get(addr) || null, mirror: extras(out.profile) });
    } catch (e) {
      return json(res, 500, { error: String(e && e.message || e) });
    }
  }

  json(res, 404, { error: 'not found' });
}).listen(PORT, () => {
  console.log('THE MIRROR api  ->  http://localhost:' + PORT);
  console.log('baseline ' + base.n + ' wallets, built ' + base.built);
  // ⛔ THE LOUDEST LINE IN THIS FILE, because the failure it names is silent everywhere else.
  if (!E.hasKeys()) {
    console.log('');
    console.log('NO API KEYS. Every uncached wallet will read as if it has never transacted,');
    console.log('and that reads exactly like a real answer. Set ETHERSCAN_KEY and ALCHEMY_KEY.');
    console.log('');
  }
  console.log('lanes ' + LANES + ' · max queue ' + MAX_QUEUE +
    ' · limits ' + LIMIT.any.n + '/min any, ' + LIMIT.fresh.n + '/min uncached' +
    ' · refresh ' + (ADMIN ? 'admin only' : 'DISABLED (no --admin token)'));
  const st = CLAIMS.stats();
  console.log('twin index ' + TWINS.length + ' wallets');
  console.log('png renderer: ' + (CARDPNG.chrome || '⛔ NONE FOUND, downloads will fail. set MIRROR_CHROME'));
  console.log('lists: ' + st.reads + ' reads (' + st.readsUnique + ' unique) · ' + st.signed +
    ' signed' + (st.signedFailingVerification ? '  ⛔ ' + st.signedFailingVerification +
    ' FAILING VERIFICATION' : ''));
});
