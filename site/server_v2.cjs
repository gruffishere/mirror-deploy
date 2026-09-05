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
const crypto = require('crypto');
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
// ⛔ EVERYTHING THAT CHANGES THE PICTURE, IN ONE FINGERPRINT.
// The stamp carried the reading date and the signed name and nothing else, so when the art engine
// changed, every card already on disk kept its old filename and went on being served unchanged: the
// board would show last month's art while the page drew this month's, on two separate pages, and
// nobody would notice. The card layout counts too. A change to faz1_layouts.js or the stylesheet
// moves the picture just as surely as a new eye does.
const ART_VERSION = (() => {
  const parts = [];
  const add = p => {
    try { parts.push(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')); }
    catch { parts.push('missing:' + p); }
  };
  add(path.join(__dirname, '..', 'artengine', 'MANIFEST.json'));
  // ⛔ THE FILE THAT CHOOSES THE PIECE BELONGS IN THE FINGERPRINT OF THE PICTURE.
  // It was missing, and it is not a detail: changing a pin or the scoring here changes what is
  // drawn without touching a single file listed below, so every card already on disk would have
  // survived the change and gone on being served. Found when repinning one wallet's art.
  add(path.join(__dirname, '..', 'mirror_piece.cjs'));
  for (const f of ['faz1_layouts.js', 'facetword.js', 'faz1.css', 'one.html'])
    add(path.join(__dirname, '..', 'cards', f));
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 8);
})();

// ⛔ EVERY PAGE IS TOLD THE ART VERSION, IN ITS OWN HTML, BEFORE ANY SCRIPT RUNS.
// Two separate image URLs went stale for the same reason and neither was caught by the other's
// fix. /api/card.png carried a version the board had to FETCH from /api/status first, so whichever
// of the two requests lost the race left every tile asking for &v=0 and caching that for a year.
// /api/art.svg, which is the piece on the card page, carried no version at all: after Adam
// Weitsman's piece was repinned the server served the new one correctly and gruff's browser went
// on showing the old one out of its own cache. Both are immutable for a year, which is right for
// a fixed picture and only works when the URL changes as the picture does.
// Injected server-side so it is a fact the page has, not one it has to go and ask for.
const withArtVersion = html => String(html).replace('</head>',
  '<script>window.ART_VERSION="' + ART_VERSION + '";</scr' + 'ipt></head>');

fs.mkdirSync(CACHE_DIR, { recursive: true });

// ⚠️ CARDS DRAWN BY AN OLDER ART VERSION ARE DEAD WEIGHT, and they accumulate: every art update
// leaves a full set behind, ~270kB each. They are matched by the version segment in the filename,
// which is why the stamp puts it in a fixed position. Only files that are clearly a card AND carry
// a different version are removed, so nothing else on the disk can be caught by this.
(function sweepOldCards() {
  let gone = 0;
  try {
    for (const f of fs.readdirSync(CARDPNG.OUT)) {
      // ⚠️ NOT 'a different version' BUT 'not THIS version', which is what catches the cards drawn
      // before the stamp carried a version at all. Those have no version segment to compare, so the
      // first sweep skipped every one of them and 341 files would have sat there forever.
      if (!/^0x[0-9a-f]{40}_/.test(f)) continue;         // not a card at all, leave it alone
      if (f.indexOf('-' + ART_VERSION) >= 0) continue;   // current, keep
      try { fs.unlinkSync(path.join(CARDPNG.OUT, f)); gone++; } catch {}
    }
  } catch (e) { console.log('card sweep could not run: ' + e.message); }
  if (gone) console.log('removed ' + gone + ' card(s) drawn by an older art version');
})();
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

// EVERYTHING THAT CHANGES THE PICTURE, IN ONE PLACE.
// ⚠️ The route and the pre-renderer BOTH need this and they must agree. If they drift, the
// background draws files under names the route never looks for and the board stays empty while the
// disk fills up with cards nobody can reach.
function stampOf(a) {
  const row = cache.get(a);
  if (!row) return null;
  const c = CLAIMED.get(a);
  // the version sits in a fixed position, so a card drawn by an older one is recognisable on sight
  // ⛔ THE READ COUNT IS NOT IN HERE, AND MUST NOT COME BACK.
  // It was, from when the count was printed on the card. The badge left the picture this morning
  // and this half stayed behind, so every single read still renamed that wallet's card. The file
  // on disk then no longer matched, the route treated a drawn card as missing and rendered it
  // again, and past fourteen of those a minute the board came back 429 and drew nothing.
  // Measured on the live board: 242 cards on disk, none of them served, 96 rate-limited requests.
  // What names the file must be exactly what changes the picture. The count changes neither.
  return (row.at || '0').replace(/[^0-9]/g, '').slice(0, 14) + '-' + ART_VERSION +
    (c ? '_' + Buffer.from((c.name || '') + '|' + (c.handle || '')).toString('hex').slice(0, 16) : '');
}

// ── A READING GOES OUT OF DATE ────────────────────────────────────────────────────────────────────
// ⚠️ THE CACHE USED TO BE FOREVER. A wallet read once was served from that reading for the life of
// the volume, so a card could say READ August 17 and print August 17's holdings in September. The
// card admitted it in words, THIS WALLET MAY HAVE MOVED SINCE, which is honest and is not the same
// thing as being right. gruff asked for it, 2026-09-05.
//
// ⛔ IT MUST SWITCH ITSELF OFF UNDER LOAD. Etherscan is the ceiling here, not the code: a fresh
// read is about three calls and takes seconds to well over a minute. So a stale row is refreshed
// only when a PERSON asks for that wallet AND the queue is completely empty AND their own uncached
// ration allows it. The moment anybody is waiting, the cached answer goes out instantly, exactly as
// before. A spike therefore costs nothing, which is the whole point of doing it this way round.
//
// ⚠️ NOT for the renderer's own reads: a card being drawn must never block on a chain walk.
// ⚠️ A failed refresh falls back to the cached row. Stale beats nothing.
const STALE_DAYS = +(process.env.MIRROR_STALE_DAYS || 7);
const STALE_MS = STALE_DAYS * 24 * 3600e3;
let staleRefreshed = 0, staleSeen = 0;

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
// ⚠️ RAISED FROM 40 AFTER THE FIRST NIGHT. The busiest minute brought 11 new wallets and the busiest
// hour 217, and a refusal is worse than a wait: the queue tells you where you are, the wall tells
// you nothing. Reads are seconds for a normal wallet, so 120 deep is minutes, not hours.
const MAX_QUEUE = 120;
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
                png: { n: 14, per: 60e3 } };
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

// ⛔ THE RENDERER IS NOT A VISITOR.
// Drawing a card points a headless browser at this server's own loopback address, and that page
// reads the wallet like any visitor would. So redrawing 242 cards after an art change wrote 242
// 'visits' into reads.jsonl, which is one of the two lists this whole exercise exists to keep. It
// looked like a crowd arriving before anything had been posted.
// ⚠️ NOT SPOOFABLE FROM OUTSIDE: anything arriving over the internet comes through the platform's
// proxy, which always sets x-forwarded-for. Only a connection made from inside the box has none.
const isOwnRenderer = req => {
  if (req.headers['x-forwarded-for']) return false;
  const a = String(req.socket.remoteAddress || '');
  return a === '::1' || a.indexOf('127.') === 0 || a.indexOf('::ffff:127.') === 0;
};

// ⛔ THE RENDERER MUST NOT BE RATIONED AGAINST ITSELF.
// Drawing one card is a headless browser that fetches /api/read and /api/art.svg back from this
// same server over the loopback. Every one of those arrives from 127.0.0.1, so they all share ONE
// bucket: 60 a minute, two per card, thirty cards a minute for the whole machine. During a mass
// redraw after an art change, with the board also asking for missing cards, that bucket empties,
// the renderer's own request comes back 429, the page it is photographing has no data, and the
// card fails. Three failures and the wallet is given up on. Measured: cardsGivenUp went 0 to 45
// during one redraw, with 'the renderer produced nothing usable' on four of twelve sampled cards.
// ⚠️ SAFE because only this machine's own Chrome reaches the socket without an x-forwarded-for;
// everything from outside arrives through Railway's edge, which always sets it.
const rateLimit = (req, ip, kind) => isOwnRenderer(req) ? 0 : allow(ip, kind);

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

  // A SHORT LINK IS THE SAME PAGE, REACHED BY A NUMBER.
  // ⚠️ DIGITS ONLY, which is what keeps it from colliding with anything: every other route on this
  // server begins with a letter, so /247 can never be mistaken for /signed or /live.
  // It rewrites the request rather than repeating the page: the unfurl tags, the cache headers and
  // everything else then come from the one place that already does them.
  {
    const seg = u.pathname.slice(1);
    if (seg.length > 0 && seg.length < 12 && [...seg].every(ch => ch >= '0' && ch <= '9')) {
      // ⚠️ A NUMBER NOBODY RECOGNISES SHOWS THE SITE, NOT A JSON ERROR. A mistyped or made-up link
      // is a person, and handing them {"error":"no such card"} reads as a broken site rather than
      // a wrong address. They land on the front page and can type a wallet.
      const hit = CLAIMS.addrForId(seg);
      if (hit) u.searchParams.set('addr', hit);
      u.pathname = '/';
    }
  }

  if (u.pathname === '/' || u.pathname === '/index.html') {
    let page = withArtVersion(fs.readFileSync(PAGE, 'utf8'));
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
      // ⛔ THE VERSION HAS TO BE IN THE URL. The card is served immutable for a year, which is
      // right for a fixed picture and wrong for a URL whose picture can change: after an art
      // update every browser that had seen a card went on showing the old one and never asked
      // again. The address alone is not the identity of the image; the address AND the art that
      // drew it are.
      const img = origin + '/api/card.png?addr=' + q + '&v=' + ART_VERSION;
      page = page.replace('</head>',
        '<meta property="og:title" content="' + title + '">' +
        '<meta property="og:description" content="' + desc + '">' +
        '<meta property="og:image" content="' + img + '">' +
        '<meta property="og:url" content="' + origin + '/?addr=' + q + '">' +
        '<meta name="twitter:card" content="summary_large_image">' +
        '<meta name="twitter:title" content="' + title + '">' +
        '<meta name="twitter:description" content="' + desc + '">' +
        '<meta name="twitter:image" content="' + img + '">' +
        // ⛔ THE PAGE HAS TO BE TOLD, TOO. A short link is rewritten HERE, on the server, so the
        // browser's own URL stays /5 and location.search is empty. The unfurl was therefore
        // perfect and the page a human landed on was the blank form: every shared card link
        // opened nothing. Checking the og tags with curl proved the half that worked.
        // `q` has already been matched against ^0x[0-9a-f]{40}$, so it is safe to inline.
        '<script>window.MIRROR_ADDR="' + q + '";</scr' + 'ipt></head>');
    }
    return send(res, 200, page, 'text/html; charset=utf-8');
  }
  if (u.pathname === '/bench')
    return send(res, 200, fs.readFileSync(BENCH), 'text/html; charset=utf-8');

  // what the page needs in order to tell somebody WHY they are waiting
  if (u.pathname === '/api/status')
    return json(res, 200, { cached: cache.size, queue: depth, lanes: LANES, maxQueue: MAX_QUEUE,
                            keys: E.hasKeys(), pinDrift: PIECE.pinDrift(),
                            staleDays: STALE_DAYS, staleSeen: staleSeen, staleRefreshed: staleRefreshed,
                            renderFailRun: preFailRun,
                            // ⚠️ TO FIND OUT WHY THE RENDERER DIES, not to look busy. Every render
                            // is a whole browser; if the machine is running out of memory this is
                            // where it will show, and if it is not, that rules memory out.
                            mem: { rssMB: Math.round(process.memoryUsage().rss / 1048576),
                                   freeMB: Math.round(require('os').freemem() / 1048576),
                                   totalMB: Math.round(require('os').totalmem() / 1048576) },
                            rendersThisProcess: CARDPNG.shots(),
                            claimsOpen: claimsOpen(), closesAt: deadlineAt(), signed: CLAIMED.size,
                            walletsRead: CLAIMS.walletsRead(),
                            turnedAway: turnedAway, artVersion: ART_VERSION, cardsDrawn: preDrawn,
                            cardsGivenUp: [...preFails.values()].filter(x => x.n >= PRE_GIVE_UP &&
                                            Date.now() - x.at < PRE_COOLDOWN).length,
                            // ⚠️ THE PATHS, BECAUSE "IT SHOULD BE ON THE DISK" IS NOT A MEASUREMENT.
                            // If the card store is not on the mounted volume, every deploy wipes it
                            // and the board goes blank again. This makes that answerable from outside
                            // in one request, instead of being discovered by a blank board.
                            paths: { cards: CARDPNG.OUT, cache: CACHE_DIR, lists: CLAIMS.DIR || null },
                            // ⚠️ a full disk broke every render while the site went on serving what
                            // it already had, so nothing looked wrong from outside. Now it is one
                            // request away.
                            diskMB: (() => {
                              let b = 0;
                              const walk = d => { try { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
                                const p = path.join(d, f.name);
                                if (f.isDirectory()) walk(p); else { try { b += fs.statSync(p).size; } catch {} }
                              } } catch {} };
                              walk(path.dirname(CARDPNG.OUT));
                              return Math.round(b / 1048576);
                            })(),
                            cardsOnDisk: (() => { try { return fs.readdirSync(CARDPNG.OUT).length; } catch { return -1; } })(),
                            // ⛔ HEADROOM, NOT USAGE. diskMB above adds up what is stored, which is
                            // what a full volume also looks like: 92MB used, and no way to tell
                            // whether that is 9% or 100%. A full disk fails EVERY render while the
                            // cards already written go on serving, so the site looks alive and
                            // simply stops gaining cards. Both filesystems matter: the volume holds
                            // the cards, and Chrome builds a fresh profile under tmp for every
                            // single render.
                            freeMB: (() => {
                              const of = p => { try { const t = fs.statfsSync(p);
                                return { freeMB: Math.round(t.bavail * t.bsize / 1048576),
                                         totalMB: Math.round(t.blocks * t.bsize / 1048576) }; }
                                catch (e) { return { error: e.message.slice(0, 40) }; } };
                              return { data: of(path.dirname(CARDPNG.OUT)), tmp: of(require('os').tmpdir()) };
                            })() });

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
    // ⛔ THE RATION IS CHARGED FOR A RENDER, NOT FOR A REQUEST, and it used to be charged here,
    // before anything had looked to see whether the card already existed. The signed board asks for
    // one card per signer in a single page load, so the ninth image onward came back 429 and drew a
    // broken-image mark: some cards appeared and some did not, which is exactly what gruff saw.
    // Serving a file that is already on disk costs nothing and is now free. Only a browser launch
    // spends the allowance, which is what the allowance was protecting.
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
    const stamp = stampOf(a);
    // already drawn: hand it over, charge nothing
    const ready = CARDPNG.cachedFile(a, stamp);
    if (fs.existsSync(ready)) {
      return send(res, 200, fs.readFileSync(ready), 'image/png',
        { 'Cache-Control': 'public, max-age=31536000, immutable' });
    }
    const wait = allow(ip, 'png');
    if (wait) return json(res, 429, { error: 'one card at a time, try again in ' + wait + 's' },
      { 'Retry-After': wait });
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
    const wait = rateLimit(req, ip, 'any');
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
                   reads: CLAIMS.readsOf(r.addr), id: CLAIMS.shortId(r.addr),
                   // shown, but marked: on the board and not in the draw
                   eligible: !CLAIMS.EXCLUDED.has(r.addr),
                   // ⛔ THE FACET THE CARD IS SHOWING, not the one that was true at signing.
                   // signed.jsonl records the facet somebody signed with and must keep it: it is
                   // evidence. But the board prints that label BESIDE the card, and once readings
                   // started being refreshed after a week a wallet could move: the chip said
                   // COLLECTOR next to a card that said DEGEN, and the facet filters put it in the
                   // wrong bucket. Measured on two of sixteen sampled wallets within minutes of
                   // the refresh landing. The live reading wins here; the signed row is untouched.
                   facet: ((cache.get(r.addr) || {}).profile || {}).dominant || r.facet || null,
                   t: r.t }))
      .sort((a, b) => (a.t < b.t ? 1 : -1));               // newest first
    return json(res, 200, { n: rows.length, rows: rows });
  }

  if (u.pathname === '/signed')
    return send(res, 200, withArtVersion(fs.readFileSync(path.join(__dirname, 'signed.html'), 'utf8')),
                'text/html; charset=utf-8');

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

  // open or close signing, without a deploy
  if (u.pathname === '/api/admin/claims') {
    if (!ADMIN || u.searchParams.get('token') !== ADMIN) return json(res, 403, { error: 'no' });
    const want = u.searchParams.get('open');
    if (want === '1') {
      try { fs.unlinkSync(CLOSED_FLAG); } catch {}
      // ?hours=48 opens the door and starts the clock in one action, so the two cannot disagree
      const hrs = Number(u.searchParams.get('hours') || 0);
      fs.mkdirSync(path.dirname(DEADLINE_FILE), { recursive: true });
      if (hrs > 0) fs.writeFileSync(DEADLINE_FILE, new Date(Date.now() + hrs * 3600e3).toISOString());
      else if (u.searchParams.get('hours') === '0') { try { fs.unlinkSync(DEADLINE_FILE); } catch {} }
    }
    else if (want === '0') { fs.mkdirSync(path.dirname(CLOSED_FLAG), { recursive: true });
                             fs.writeFileSync(CLOSED_FLAG, new Date().toISOString()); }
    console.log('admin claims -> ' + (claimsOpen() ? 'OPEN' : 'CLOSED'));
    return json(res, 200, { claimsOpen: claimsOpen(), closesAt: deadlineAt() });
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
    // ⚠️ html only: injecting into a font or a png would corrupt it
    if (path.extname(file).toLowerCase() === '.html')
      return send(res, 200, withArtVersion(fs.readFileSync(file, 'utf8')), type);
    return send(res, 200, fs.readFileSync(file), type);
  }

  if (req.method === 'OPTIONS') return send(res, 204, '');

  // ── the claim ───────────────────────────────────────────────────────────────────────────────────
  if (u.pathname === '/api/nonce' && req.method === 'POST') {
    if (!claimsOpen()) return json(res, 403, { error: 'signing is closed' });
    const wait = allow(ip, 'any');
    if (wait) return json(res, 429, { error: 'too many requests, try again in ' + wait + 's' }, { 'Retry-After': wait });
    let b; try { b = await body(req); } catch (e) { return json(res, 400, { error: e.message }); }
    const a = String(b.address || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return json(res, 400, { error: 'give a 0x address' });
    return json(res, 200, CLAIMS.issueNonce(a));
  }

  if (u.pathname === '/api/claim' && req.method === 'POST') {
    // ⚠️ CHECKED HERE TOO. A nonce handed out a second before the close is still a valid nonce,
    // and without this it could be spent afterwards.
    if (!claimsOpen()) return json(res, 403, { error: 'signing is closed' });
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
    // rows logged before ens was recorded still get a name, out of the reading the cache holds
    const ensOf = a => { const r = cache.get(a); return (r && r.signals && r.signals.ens) || ''; };
    if (u.pathname === '/api/lists/wallets.csv') return csvOut(CLAIMS.uniqueReadsCsv(ensOf), 'wallets.csv');
    if (u.pathname === '/api/lists/signed.csv') return csvOut(CLAIMS.signedCsv(), 'signed.csv');
    return json(res, 404, { error: 'no such list' });
  }

  if (u.pathname === '/api/read') {
    const wait = rateLimit(req, ip, 'any');
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
      let row = cache.get(addr), wasFresh = false;
      const at = Date.parse((row && row.at) || '') || 0;
      if (at && Date.now() - at > STALE_MS && !isOwnRenderer(req)) {
        staleSeen++;
        // ⚠️ allow() only spends the ration when it says yes, so asking costs nothing when it says no
        if (depth === 0 && allow(ip, 'fresh') === 0) {
          try {
            const out = await queue(() => read(addr, true));
            if (!out.partial) { row = cache.get(addr) || row; staleRefreshed++; wasFresh = true; }
          } catch (e) { /* stale beats nothing */ }
        }
      }
      // ⚠️ SAYS WHAT HAPPENED, not what usually happens. Answering `cached` after re-reading the
      // chain would put a false line in the one list this whole exercise exists to keep.
      if (!isOwnRenderer(req)) CLAIMS.logRead(addr, { facet: row.profile && row.profile.dominant, cached: !wasFresh,
                             ens: (row.signals && row.signals.ens) || null });
      return json(res, 200, { ...row, cached: !wasFresh, refreshed: wasFresh, resolvedFrom,
        claimed: CLAIMED.get(addr) || null, claimsOpen: claimsOpen(), id: CLAIMS.shortId(addr), reads: CLAIMS.readsOf(addr),
        mirror: extras(row.profile) });
    }

    const fw = allow(ip, 'fresh');
    if (fw) { turnedAway.rateLimited++;
      return json(res, 429, { error: 'that is a lot of new wallets. try again in ' + fw + 's' },
        { 'Retry-After': fw }); }
    if (depth >= MAX_QUEUE) { turnedAway.queueFull++;
      return json(res, 503, { error: 'the queue is full, try again shortly', queue: depth },
        { 'Retry-After': 60 }); }

    const place = depth + 1;
    try {
      const out = await queue(() => read(addr, refresh));
      if (!isOwnRenderer(req)) CLAIMS.logRead(addr, { facet: out.profile && out.profile.dominant, cached: false,
                             ens: (out.signals && out.signals.ens) || null });
      return json(res, 200, { ...out, resolvedFrom, queuedAt: place,
        claimed: CLAIMED.get(addr) || null, claimsOpen: claimsOpen(), id: CLAIMS.shortId(addr), reads: CLAIMS.readsOf(addr),
        mirror: extras(out.profile) });
    } catch (e) {
      return json(res, 500, { error: String(e && e.message || e) });
    }
  }

  json(res, 404, { error: 'not found' });

}).listen(PORT, () => {
  console.log('THE MIRROR api  ->  http://localhost:' + PORT);
  console.log('baseline ' + base.n + ' wallets, built ' + base.built);
  console.log('cards drawn ahead of time into ' + CARDPNG.OUT + ', one every ' + (PRE_EVERY / 1000) + 's');
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
  // ⚠️ LOUD, because a pin that stopped drawing what it promised looks exactly like a pin that
  // is working: the trait names still read correctly. Only the picture changes.
  const drift = PIECE.pinDrift();
  if (drift.length) {
    console.log('');
    console.log('⛔ A PINNED WALLET NO LONGER DRAWS WHAT IT WAS PINNED TO:');
    drift.forEach(d => console.log('   ' + d.addr + ' — ' + (d.error || d.wrong.join(' · '))));
    console.log('');
  } else console.log('pins: ' + PIECE.pinDrift().length + ' drifted, all drawing what they promise');
  console.log('png renderer: ' + (CARDPNG.chrome || '⛔ NONE FOUND, downloads will fail. set MIRROR_CHROME'));
  console.log('lists: ' + st.reads + ' reads (' + st.readsUnique + ' unique) · ' + st.signed +
    ' signed' + (st.signedFailingVerification ? '  ⛔ ' + st.signedFailingVerification +
    ' FAILING VERIFICATION' : ''));
});

// ⛔ THIS LIVES AT THE END OF THE FILE ON PURPOSE.
// It was first placed against the "}).listen(PORT" line, whose leading brace closes the REQUEST
// HANDLER rather than opening the server, so the whole block ended up INSIDE the handler: the
// constant was invisible to the startup log, and setInterval would have been armed again on every
// request. The server refused to boot at all, which is the only reason it was noticed.
// ── DRAW THE CARDS BEFORE ANYBODY ASKS FOR THEM ───────────────────────────────────────────────────
// ⛔ A BOARD OF A HUNDRED CARDS CANNOT BE DRAWN WHILE SOMEBODY WATCHES IT. Each card is a browser
// launch of about three seconds and they are serialised, so a board that draws on demand always has
// a tail nobody ever sees. gruff opened it to twenty blank tiles, and it gets worse as more people
// sign: the newest signer is always last in the queue.
// The signed list is known in advance, so the cards are drawn here instead and the board only ever
// reads finished files off disk. Nothing about a visitor's own card changes; that path is unchanged.
//
// ⚠️ ONE AT A TIME, SPACED. A visitor asking for their own card shares this renderer, and must never
// wait behind more than one of these.
// ⚠️ AND A CARD THAT REFUSES TO DRAW IS GIVEN UP ON. Without the counter, one wallet that throws
// would be retried every four seconds forever and no other card would ever be reached.
const PRE_EVERY = 4000, PRE_GIVE_UP = 3;
// ⚠️ A COUNT AND A TIME, NOT JUST A COUNT. Three strikes used to retire a wallet for the lifetime
// of the process, so a render that failed while the box was busy left that person's card missing
// forever and nothing ever looked again. Eleven cards were lost that way on the first night. The
// count now expires, and the loop comes back to them.
// ⛔ SIGNING IS CLOSED AT THE SERVER, NOT IN THE PAGE. Hiding the button would leave /api/claim
// open to anyone who has seen the network tab, and the list this gates is the mint list. The flag
// is a file on the MOUNTED disk on purpose: a restart or a deploy must not quietly reopen it.
const CLOSED_FLAG = path.join(process.env.MIRROR_LISTS_DIR ||
  path.join(__dirname, '..', 'site', 'lists'), 'claims.closed');
// ⛔ THE DEADLINE CLOSES THE DOOR ITSELF.
// A countdown that runs out and changes nothing teaches people the next one is theatre too. The
// server holds the time and refuses on its own, so honouring it is not a thing anyone has to
// remember to do.
const DEADLINE_FILE = path.join(path.dirname(CLOSED_FLAG), 'claims.deadline');
const deadlineAt = () => {
  try { const t = Date.parse(fs.readFileSync(DEADLINE_FILE, 'utf8').trim()); return isNaN(t) ? null : t; }
  catch { return null; }
};
const claimsOpen = () => {
  if (fs.existsSync(CLOSED_FLAG)) return false;
  const d = deadlineAt();
  return d === null || Date.now() < d;
};

// ⚠️ REFUSALS ARE INVISIBLE OTHERWISE. reads.jsonl only records reads that HAPPENED, so after the
// first night I could say the site absorbed 217 wallets in an hour and could NOT say whether anyone
// was turned away. This counts them.
let turnedAway = { queueFull: 0, rateLimited: 0, since: new Date().toISOString() };

const preFails = new Map();
const PRE_COOLDOWN = 10 * 60e3;
// ⛔ THE RENDERER GOES BAD OVER A CONTAINER'S LIFETIME, AND A RESTART CURES IT.
// Measured twice: renders succeed at the normal rate up to about 173 in one process, then EVERY
// one fails with 'the renderer produced nothing usable' while cards already on disk serve
// perfectly. It is not the disk (320MB free of 433 when it happened, measured) and not the rate
// limiter (the renderer is exempt). A deploy cleared it instantly, twice.
//
// The cause is not found. What IS known is that the failure is total, silent from outside, and
// ends at a restart, so the site quietly stops gaining cards while looking perfectly healthy.
// This turns that into a self-heal: after a run of failures on a process that has proven it can
// render, exit and let the platform bring it back. State lives on the volume, so nothing is lost.
//
// ⚠️ IT CANNOT CRASH-LOOP. It refuses unless this process has already drawn cards successfully
// (so a genuinely broken build cannot use it), and a timestamp on the volume keeps it to once
// every 30 minutes across restarts.
const HEAL_AFTER = 8, HEAL_NEEDS = 20, HEAL_EVERY = 30 * 60e3;
const HEAL_FILE = path.join(path.dirname(CLOSED_FLAG), 'renderer.healed');
let preFailRun = 0;
function renderFailed(where, msg) {
  preFailRun++;
  if (preFailRun < HEAL_AFTER || preDrawn < HEAL_NEEDS) return;
  let last = 0;
  try { last = Date.parse(fs.readFileSync(HEAL_FILE, 'utf8').trim()) || 0; } catch {}
  if (Date.now() - last < HEAL_EVERY) return;
  try { fs.mkdirSync(path.dirname(HEAL_FILE), { recursive: true });
        fs.writeFileSync(HEAL_FILE, new Date().toISOString()); } catch {}
  console.log('');
  console.log('⛔ THE RENDERER HAS STOPPED WORKING IN THIS PROCESS.');
  console.log('   ' + preFailRun + ' failures in a row after ' + preDrawn + ' good cards (' + where + '): ' + msg);
  console.log('   restarting so it comes back; all state is on the volume.');
  console.log('');
  setTimeout(() => process.exit(1), 250);
}

let preBusy = false, preDrawn = 0;

async function prerenderTick() {
  if (preBusy || !CARDPNG.chrome) return;
  preBusy = true;
  try {
    for (const r of CLAIMS.signedLatest()) {
      const a = String(r.addr || '').toLowerCase();
      const f = preFails.get(a);
      if (f && f.n >= PRE_GIVE_UP && Date.now() - f.at < PRE_COOLDOWN) continue;
      if (f && f.n >= PRE_GIVE_UP) preFails.delete(a);      // cooldown over, it gets another chance
      const stamp = stampOf(a);
      if (!stamp) continue;                                   // never read, nothing to draw from
      // ⛔ THE EXACT FILE THE ROUTE WILL LOOK FOR, AND NOTHING LOOSER.
      // This used to accept ANY card for the wallet carrying the current art version, because the
      // stamp moved on every read and an exact match would have redrawn all 242 forever. The read
      // count has since left the stamp, so it is stable again and the loose test is now the
      // danger: it was satisfied by files the route could no longer find, so the loop drew nothing
      // while every visitor's board rendered on demand and hit the rate limit. The pre-renderer
      // and the route must ask the same question or the board stays empty while the disk looks full.
      if (fs.existsSync(CARDPNG.cachedFile(a, stamp))) continue;
      try {
        await CARDPNG.cardPng('http://127.0.0.1:' + PORT, a, stamp);
        preDrawn++;
        preFailRun = 0;                                        // it works, so nothing is wrong
        preFails.delete(a);
      } catch (e) {
        preFails.set(a, { n: ((preFails.get(a) || {}).n || 0) + 1, at: Date.now() });
        console.log('pre-draw failed for ' + a + ': ' + e.message.slice(0, 60));
        renderFailed('pre-draw', e.message.slice(0, 60));
      }
      break;                                                  // exactly one per tick
    }
  } catch (e) { console.log('pre-draw loop: ' + e.message.slice(0, 60)); }
  preBusy = false;
}
setInterval(prerenderTick, PRE_EVERY);
