// FACETS WRAPPED — the site.
//
//   node exp/wrapped/site/server.cjs [--port 8140] [--cap 600]
//
// ⚠️ THE CARD IS COMPOSITED IN THE BROWSER, NOT HERE. Rendering one card server-side takes ~20 s (a
// headless browser plus ffmpeg), which is fine for one at a time and hopeless for a launch. The page
// draws the base, the art and the three fields onto a canvas itself and gets a PNG instantly, so this
// server only ever answers two small questions and writes one line to disk.
//
// ⚠️ THE CAP IS A HARD LOCK, BY gruff'S DECISION. When the spots run out the whole thing closes: no
// submissions, no facet, no card. The locked screen is the point, because reopening is its own
// announcement. Do not "helpfully" let late arrivals still play.
//
// ⛔ X LOGIN IS STUBBED. Until the OAuth app exists this accepts a handle typed in the body and marks the
// row `verified: false`. Every row written in that state is a row that proves nothing, and the GTD list
// must not be built from them. The wallet signature IS checked, because that part needs no approval.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ENGINE = require(path.join(__dirname, '..', 'facet_engine.cjs'));

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(flag('--port', 8140));
const CAP = Number(flag('--cap', 600));
const DB = path.join(__dirname, 'submissions.json');
const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'baseline.json'), 'utf8'));
const GEO = require(path.join(__dirname, '..', 'card_geometry.json'));

const load = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return []; } };
const save = rows => fs.writeFileSync(DB, JSON.stringify(rows, null, 1));

// ⚠️ The live crowd is scored against the FROZEN 635-wallet baseline, not against itself. Percentiles
// computed from nine early submissions are meaningless, and they would also drift for everyone as the
// day went on: the same wallet would get a different facet in the morning and the evening.
const POP = { eth: BASE.eth, txs: BASE.txs, rate: BASE.rate, nfts: BASE.nfts,
              colls: BASE.colls, idle: BASE.idle, age: BASE.age };

const send = (res, code, type, body, extra) => {
  res.writeHead(code, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store' }, extra || {}));
  res.end(body);
};
const json = (res, code, obj) => send(res, code, 'application/json', JSON.stringify(obj));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

// ── wallet ownership ──────────────────────────────────────────────────────────────────────────────
// ⚠️ X PROVES THE PERSON, IT DOES NOT PROVE THE WALLET. Without this anyone can paste any address into
// the box and burn a guaranteed spot on a wallet they do not hold. Recovering the signer is free, needs
// no approval and takes the visitor five seconds.
let recover = null;
try { const { ethers } = require(path.join(__dirname, '..', '..', 'contract', 'node_modules', 'ethers'));
  recover = (msg, sig) => ethers.utils.verifyMessage(msg, sig).toLowerCase(); } catch {}

const nonces = new Map();                       // address -> {nonce, at}

// ── the art pool ──────────────────────────────────────────────────────────────────────────────────
// ⚠️ Built ONCE at boot and cached per facet. Loading the render stack costs ~10 s and rendering is fast
// afterwards, so the cost belongs at startup rather than in a visitor's request. Only tokens that
// actually ANIMATE go in the pool: a card that says "animated" and shows a still is the same class of
// lie the films refuse.
const EXPDIR = path.join(__dirname, '..', '..');
let ART = null;
function artPool(facet) {
  if (!ART) {
    const t0 = Date.now();
    const { loadAtSupply, ownerOf } = require(path.join(EXPDIR, 'review', 'load_at_supply.cjs'));
    const { cycleOf } = require(path.join(EXPDIR, 'mirror_v2', 'tools', '_animphases.cjs'));
    const NP = require(path.join(EXPDIR, 'mirror_v2', 'names_perm.js'));
    const { G, V7, alloc } = loadAtSupply(6969, 0xFACE7777);
    const census = NP.census(6969, 0xFACE7777);
    ART = {};
    // a small strided sample per facet is plenty; walking all 6,969 would take minutes for no gain
    for (let id = 1, n = 0; id <= 6969 && n < 700; id += 7, n++) {
      const f = alloc.of(id).facet;
      (ART[f] = ART[f] || []);
      if (ART[f].length >= 24) continue;
      V7.animate = true; V7.cache.clear();
      const svg = V7.render(G.generate(id, ownerOf(id)));
      if (!cycleOf(svg)) continue;
      ART[f].push({ id, facet: f, name: NP.nameOf(0xFACE7777, id, census.alloc.of(id).facet, census.assigned).name, svg });
    }
    console.log('  art pool ready in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's: ' +
      Object.entries(ART).map(([k, v]) => k.slice(0, 3) + ' ' + v.length).join(' · '));
  }
  return ART[facet] || [];
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  try {
    if (p === '/api/status') {
      const rows = load();
      return json(res, 200, { taken: rows.length, cap: CAP, locked: rows.length >= CAP,
        recent: rows.slice(-12).reverse().map(r => ({ handle: r.handle, facet: r.facet })) });
    }

    if (p === '/api/nonce' && req.method === 'POST') {
      const body = await read(req);
      const addr = String(body.wallet || '').toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(addr)) return json(res, 400, { error: 'bad wallet' });
      const nonce = 'FACETS WRAPPED\n\nSign to prove this wallet is yours.\nNothing is spent. Nothing goes on chain.\n\nnonce: ' + crypto.randomBytes(12).toString('hex');
      nonces.set(addr, { nonce, at: Date.now() });
      return json(res, 200, { nonce });
    }

    if (p === '/api/submit' && req.method === 'POST') {
      const rows = load();
      // the lock is checked FIRST, before any work, so a full list costs nothing and reveals nothing
      if (rows.length >= CAP) return json(res, 423, { locked: true, taken: rows.length, cap: CAP });

      const body = await read(req);
      const wallet = String(body.wallet || '').toLowerCase();
      const handle = String(body.handle || '').replace(/^@/, '').slice(0, 40);
      if (!/^0x[0-9a-f]{40}$/.test(wallet)) return json(res, 400, { error: 'bad wallet' });
      if (!/^[A-Za-z0-9_]{1,20}$/.test(handle)) return json(res, 400, { error: 'bad handle' });

      const n = nonces.get(wallet);
      if (!n || Date.now() - n.at > 10 * 60 * 1000) return json(res, 400, { error: 'nonce expired, reload' });
      if (recover) {
        let who = null;
        try { who = recover(n.nonce, String(body.sig || '')); } catch {}
        if (who !== wallet) return json(res, 401, { error: 'signature does not match the wallet' });
      }
      nonces.delete(wallet);

      if (rows.some(r => r.wallet === wallet)) return json(res, 409, { error: 'this wallet is already in' });
      if (rows.some(r => r.handle.toLowerCase() === handle.toLowerCase())) return json(res, 409, { error: 'this X account is already in' });

      const head = 0;
      const s = await ENGINE.signals(wallet, head);
      const sc = ENGINE.score(s, POP);
      const seed = parseInt(wallet.slice(2, 10), 16);
      const p2 = ENGINE.pick(sc, seed);

      const row = { wallet, handle, facet: p2.facet, lean: p2.lean, surprise: p2.surprise,
        verified: false,                      // ⛔ true only once real X OAuth is wired
        at: new Date().toISOString(),
        signals: { eth: s.eth, txs: s.txs, ageDays: s.ageDays, nfts: s.nfts, colls: s.colls,
                   deploys: s.deploys, idleDays: s.idleDays } };
      rows.push(row); save(rows);
      console.log('  +' + String(rows.length).padStart(4) + '/' + CAP + '  @' + handle.padEnd(18) +
        p2.facet.padEnd(10) + (p2.surprise ? '(data said ' + p2.lean + ')' : ''));
      return json(res, 200, { ok: true, taken: rows.length, cap: CAP,
        locked: rows.length >= CAP, facet: p2.facet, lean: p2.lean, surprise: p2.surprise,
        signals: row.signals });
    }

    if (p === '/api/geometry') return json(res, 200, GEO);

    // ⚠️ THE ART IS A REAL TOKEN OF THAT FACET, not a mock-up. The visitor is looking at something the
    // contract can actually draw, which is the only reason showing it is honest at all.
    // ⛔ It is a token of the facet, NOT the token they will mint. Nothing here reserves an id.
    if (p === '/api/art') {
      const want = String(u.searchParams.get('facet') || '').toUpperCase();
      const pool = artPool(want);
      if (!pool.length) return json(res, 404, { error: 'no art for ' + want });
      const pickArt = pool[Math.floor(Math.random() * pool.length)];
      return json(res, 200, pickArt);
    }

    // static
    let f = p === '/' ? '/index.html' : p;
    if (f.startsWith('/cards/')) {
      const g = path.join(__dirname, '..', 'cards', path.basename(f));
      if (fs.existsSync(g)) return send(res, 200, 'image/png', fs.readFileSync(g), { 'Cache-Control': 'max-age=3600' });
    }
    const local = path.join(__dirname, path.normalize(f).replace(/^([/\\])+/, ''));
    if (fs.existsSync(local) && fs.statSync(local).isFile())
      return send(res, 200, MIME[path.extname(local)] || 'application/octet-stream', fs.readFileSync(local));
    send(res, 404, 'text/plain', 'not found');
  } catch (e) { json(res, 500, { error: String(e && e.message || e) }); }
}).listen(PORT, () => {
  const rows = load();
  console.log('\n  FACETS WRAPPED   http://127.0.0.1:' + PORT + '/');
  console.log('  cap ' + CAP + ', taken ' + rows.length + (rows.length >= CAP ? '   ⛔ LOCKED' : ''));
  console.log('  wallet signature: ' + (recover ? 'ENFORCED' : '⛔ ethers not found, NOT enforced'));
  console.log('  X login: ⛔ STUBBED — every row is verified:false until OAuth is wired\n');
});

function read(req) {
  return new Promise((res, rej) => {
    let b = ''; req.on('data', d => { b += d; if (b.length > 1e5) req.destroy(); });
    req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch { res({}); } });
    req.on('error', rej);
  });
}
