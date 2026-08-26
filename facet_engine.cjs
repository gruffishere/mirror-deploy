// FACETS WRAPPED — the wallet-to-facet engine.
//
//   node exp/wrapped/facet_engine.cjs <wallets.csv|0xaddr...> [--refresh]
//
// ⚠️ THIS IS NOT THE MINT. It reads a wallet, leans a weighted draw, and tells a story. The facet it
// returns has nothing to do with what the contract will assign, and every surface that shows its output
// has to say so. See the note on the SURPRISE branch at the bottom of `pick`.
//
// ⚠️ KEYLESS AND FAST IS THE WHOLE BRIEF. Three RPC calls (~300 ms measured) plus a coarse binary search
// for the wallet's first outbound transaction. No API key, no NFT provider, nothing to sign up for.
//   ⛔ THE PRICE OF THAT: BUILDER and COLLECTOR have no real signal here. Deploy count lives behind
//   Etherscan and holdings behind an NFT provider, so those two facets can currently only arrive through
//   the floor, i.e. at random. The calibration run is expected to show exactly that, and it is the
//   concrete argument for adding one free Etherscan key rather than a hand-wave.
'use strict';
const fs = require('fs'), path = require('path');

const RPCS = ['https://ethereum-rpc.publicnode.com'];
const ARCHIVE = ['https://eth.drpc.org', 'https://eth-mainnet.public.blastapi.io', 'https://eth.merkle.io'];
const CACHE = path.join(__dirname, 'wallet_signals.json');
const CONC = 8;
const FACETS = ['NEWBIE', 'COLLECTOR', 'DEGEN', 'BUILDER', 'OG', 'WHALE', 'GHOST'];

let rr = 0, ar = 0, calls = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function rpc(pool, which, method, params, tries = 5) {
  for (let t = 0; t < tries; t++) {
    const url = pool[(which === 'a' ? ar++ : rr++) % pool.length];
    calls++;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const txt = await res.text();
      if (txt.trim().startsWith('<')) { await sleep(250 * (t + 1)); continue; }
      const j = JSON.parse(txt);
      if (j.result !== undefined) return j.result;
    } catch {}
    await sleep(250 * (t + 1));
  }
  return null;
}

// ⚠️ WALLET AGE WITHOUT AN API KEY. A wallet's nonce at block N is how many transactions it had SENT by
// then, so the first block where nonce > 0 is its first outbound move. Binary search finds it. Stopping
// at ~50k blocks (about a week) instead of the exact block turns ~25 archive calls into ~9, and a week
// of precision is far more than a facet score needs.
// ⛔ A wallet that only ever RECEIVED has nonce 0 forever and gets age null, which is honest: it has no
// outbound history to read. That is itself a strong GHOST signal.
async function firstBlock(addr, head) {
  const now = await rpc(ARCHIVE, 'a', 'eth_getTransactionCount', [addr, 'latest']);
  if (now === null || Number(BigInt(now)) === 0) return null;
  let lo = 0, hi = head;
  while (hi - lo > 50000) {
    const mid = Math.floor((lo + hi) / 2);
    const n = await rpc(ARCHIVE, 'a', 'eth_getTransactionCount', [addr, '0x' + mid.toString(16)]);
    if (n === null) return null;
    if (Number(BigInt(n)) > 0) hi = mid; else lo = mid;
  }
  return hi;
}

// ── the keyed signals, which are what make BUILDER, COLLECTOR and GHOST real ──────────────────────
// The keyless run proved the point rather than argued it: with only balance/nonce/age, BUILDER and
// COLLECTOR won on data for **0 of 635 wallets** and GHOST for 2.7%. Three of seven facets could only
// ever arrive by luck. These four calls fix that.
// ⚠️ Keys live in `.keys.json` beside this file and are never printed.
const KEYS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '.keys.json'), 'utf8')); }
  catch { return null; } })();

// ⚠️ ETHERSCAN'S FREE TIER IS 5 CALLS PER SECOND AND THE FIRST RUN IGNORED IT. With 8 wallets in flight
// and 2 calls each, 16 requests hit a 5/s limit at once; most were refused, and because a refusal was
// being read as data, 522 of 635 wallets came back claiming they had transacted TODAY. The call works
// perfectly in isolation, which is exactly what made it look fine. Serialise it instead.
let esGate = Promise.resolve();
const esThrottle = fn => { const r = esGate.then(fn); esGate = r.catch(() => {}).then(() => sleep(230)); return r; };

let failEs = 0, failAl = 0;
async function getJSON(url, tries = 5, kind = '') {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url);
      if (r.status === 429) { await sleep(800 * (t + 1)); continue; }
      const j = await r.json();
      // ⚠️ Etherscan answers HTTP 200 with status "0" for rate limiting and for genuine errors alike, so
      // the HTTP code alone is not the answer. NOTOK must be retried, not banked.
      if (j && j.status === '0' && /rate limit|max .* rate/i.test(String(j.result || j.message))) { await sleep(800 * (t + 1)); continue; }
      if (j) return j;
    } catch {}
    await sleep(400 * (t + 1));
  }
  if (kind === 'es') failEs++; else if (kind === 'al') failAl++;
  return null;                       // ⛔ null means UNKNOWN. Never let a caller read it as a value.
}

async function enrich(addr) {
  if (!KEYS) return {};
  const es = 'https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=' + addr;
  // ⚠️ ONE PAGE, NOT THE WHOLE HISTORY. A 33,000-transaction wallet would be thousands of calls, and the
  // question here is "has this person ever deployed", not "exactly how many times". The first 100
  // transactions catch anyone who was building early, which is what BUILDER actually means.
  const [asc, desc] = [
    await esThrottle(() => getJSON(es + '&startblock=0&endblock=99999999&page=1&offset=100&sort=asc&apikey=' + KEYS.etherscan, 5, 'es')),
    await esThrottle(() => getJSON(es + '&startblock=0&endblock=99999999&page=1&offset=1&sort=desc&apikey=' + KEYS.etherscan, 5, 'es')),
  ];
  const [nfts, contracts] = await Promise.all([
    getJSON('https://eth-mainnet.g.alchemy.com/nft/v3/' + KEYS.alchemy + '/getNFTsForOwner?owner=' + addr + '&withMetadata=false&pageSize=1', 5, 'al'),
    getJSON('https://eth-mainnet.g.alchemy.com/nft/v3/' + KEYS.alchemy + '/getContractsForOwner?owner=' + addr + '&pageSize=1', 5, 'al'),
  ]);
  const list = asc && Array.isArray(asc.result) ? asc.result : null;
  const firstTs = list && list.length ? Number(list[0].timeStamp) : null;
  const lastTs = desc && Array.isArray(desc.result) && desc.result[0] ? Number(desc.result[0].timeStamp) : null;
  const now = Date.now() / 1000;
  // ⚠️ null means UNKNOWN and stays null all the way to the scorer. `idleDays: 0` for a failed lookup is
  // the exact bug that wiped out GHOST: it reads as "active today", the strongest possible anti-Ghost
  // signal, on a wallet we simply failed to ask about.
  return {
    deploys: list ? list.filter(t => !t.to || t.to === '').length : null,
    contactsTouched: list ? new Set(list.map(t => (t.to || '').toLowerCase()).filter(Boolean)).size : null,
    firstDays: firstTs ? Math.round((now - firstTs) / 86400) : null,
    idleDays: lastTs ? Math.round((now - lastTs) / 86400) : null,
    nfts: nfts && nfts.totalCount !== undefined ? nfts.totalCount : null,
    colls: contracts && contracts.totalCount !== undefined ? contracts.totalCount : null,
  };
}

async function signals(addr, head) {
  const [bal, nonce, code] = await Promise.all([
    rpc(RPCS, 'r', 'eth_getBalance', [addr, 'latest']),
    rpc(RPCS, 'r', 'eth_getTransactionCount', [addr, 'latest']),
    rpc(RPCS, 'r', 'eth_getCode', [addr, 'latest']),
  ]);
  const ex = await enrich(addr);
  const txs = nonce === null ? 0 : Number(BigInt(nonce));
  // ⚠️ Etherscan's first-transaction timestamp is exact, so it wins; the keyless binary search stays as
  // the fallback for when the key is missing or the call fails. Cross-checked on one wallet: the search
  // said 964 days, Etherscan says 975. The approximation was doing its job.
  let ageDays = ex.firstDays;
  if (ageDays == null) {
    const fb = await firstBlock(addr, head);
    ageDays = fb === null ? 0 : Math.round((head - fb) / 7200);
  }
  return {
    addr,
    eth: bal === null ? 0 : Number(BigInt(bal)) / 1e18,
    txs,
    smart: !!(code && code !== '0x'),
    ageDays,
    txRate: ageDays > 30 ? txs / (ageDays / 365) : txs,   // transactions per year
    noOutbound: txs === 0,
    deploys: ex.deploys,                 // may be null = unknown
    touched: ex.contactsTouched,
    idleDays: ex.idleDays,               // may be null = unknown, and MUST NOT become 0
    nfts: ex.nfts,
    colls: ex.colls,
  };
}

// ── scoring ───────────────────────────────────────────────────────────────────────────────────────
// ⚠️ PERCENTILES, NEVER ABSOLUTE THRESHOLDS. Wallet data is violently skewed: "over 500 transactions is a
// Degen" puts 90% of real visitors under the bar and hands almost everyone the same facet. A wallet is
// scored against the population it arrived with, so the seven stay reachable whatever the crowd looks like.
const pct = (arr, v) => { let c = 0; for (const x of arr) if (x <= v) c++; return c / arr.length; };

function score(s, pop) {
  const P = {
    eth:   pct(pop.eth, s.eth),
    txs:   pct(pop.txs, s.txs),
    age:   s.ageDays ? pct(pop.age, s.ageDays) : 0,
    rate:  pct(pop.rate, s.txRate),
    nfts:  pct(pop.nfts, s.nfts),
    colls: pct(pop.colls, s.colls),
    idle:  pct(pop.idle, s.idleDays),
  };
  return {
    OG:        0.80 * P.age + 0.20 * P.txs,
    NEWBIE:    0.65 * (1 - P.age) + 0.35 * (1 - P.txs),
    DEGEN:     0.70 * P.rate + 0.30 * P.txs,
    WHALE:     0.85 * P.eth + 0.15 * P.nfts,
    // now real: a deploy is a deliberate act almost nobody performs by accident
    BUILDER:   Math.min(1, 0.55 * Math.min(1, s.deploys / 3) + 0.25 * P.rate + 0.20 * (s.smart ? 1 : 0)),
    COLLECTOR: 0.55 * P.colls + 0.45 * P.nfts,
    // ⚠️ NOT dormancy alone. The people filling in this form are by definition awake, so "asleep" can
    // never fire on a live visitor. Ghost is someone who HOLDS and leaves no trace: quiet relative to
    // what they own, idle between moves, no outbound history at all in the extreme.
    GHOST:     0.35 * (1 - P.rate) + 0.30 * P.idle + 0.20 * P.nfts * (1 - P.rate) + 0.15 * (s.noOutbound ? 1 : 0),
  };
}

// ⚠️ EVERY FACET KEEPS A FLOOR. gruff's rule: Ghost has to be able to come up for anyone. The data leans
// the dice, it never removes a side. FLOOR is the share of the weight split evenly across all seven no
// matter what the wallet looks like.
const FLOOR = Number(process.env.FLOOR || 0.15);   // LOCKED 2026-08-16
// ⚠️ THE LEVER THAT WAS MISSING. Percentile sums land near 0.5 for a typical wallet, so seven scores of
// 0.45-0.55 normalise to seven near-equal weights and the draw comes out uniform no matter how low the
// floor goes. Halving the floor changed the surprise rate by 1.3 points, which is what proved it. Raising
// the scores to a power separates them BEFORE the floor is added; SHARP 1 is the old flat behaviour.
const SHARP = Number(process.env.SHARP || 4);   // LOCKED 2026-08-16: 56% surprise, all seven still reachable   // lowered once BUILDER/COLLECTOR/GHOST gained real signals
function pick(sc, seed) {
  const vals = FACETS.map(f => Math.pow(Math.max(0, sc[f]), SHARP));
  const sum = vals.reduce((a, b) => a + b, 0) || 1;
  const w = vals.map(v => (1 - FLOOR) * (v / sum) + FLOOR / FACETS.length);
  let r = seed, x = (r = (r * 1664525 + 1013904223) >>> 0) / 4294967296;
  let acc = 0, chosen = FACETS[FACETS.length - 1];
  for (let i = 0; i < FACETS.length; i++) { acc += w[i]; if (x <= acc) { chosen = FACETS[i]; break; } }
  const lean = FACETS[vals.indexOf(Math.max(...vals))];
  // ★ When the draw disagrees with the data we do NOT hide it. "Your data says Degen, the mirror showed
  // Ghost" is the project's own thesis rather than a bug, and it pre-empts the mint feeling like a
  // downgrade when the chain assigns something else again.
  return { facet: chosen, lean, surprise: chosen !== lean, weights: w };
}

// ── run ───────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ EXPORTED SO THE SITE USES THE SAME CODE THE CALIBRATION RAN ON. A second scoring implementation
// living in the server is how the mint waterfall's whale-halo bug happened: one rule, two copies, one
// of them updated. The CLI below only runs when this file IS the entry point.
module.exports = { FACETS, signals, score, pick, pct, SHARP, FLOOR };

if (require.main !== module) return;

(async () => {
  const arg = process.argv[2];
  if (!arg) { console.error('give a csv of addresses or one 0x address'); process.exit(1); }
  let addrs;
  if (/^0x[0-9a-fA-F]{40}$/.test(arg)) addrs = [arg.toLowerCase()];
  else addrs = fs.readFileSync(arg, 'utf8').trim().split(/\r?\n/).slice(1)
    .map(l => l.split(',')[0].trim().toLowerCase()).filter(a => /^0x[0-9a-f]{40}$/.test(a));
  console.log(addrs.length + ' wallet(s)\n');

  let cache = {};
  if (fs.existsSync(CACHE) && !process.argv.includes('--refresh')) cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const head = Number(BigInt(await rpc(RPCS, 'r', 'eth_blockNumber', [])));
  console.log('head block ' + head.toLocaleString() + '\n');

  const todo = addrs.filter(a => !cache[a]);
  console.log(todo.length + ' to fetch, ' + (addrs.length - todo.length) + ' cached');
  const t0 = Date.now();
  for (let i = 0; i < todo.length; i += CONC) {
    const slice = todo.slice(i, i + CONC);
    const res = await Promise.all(slice.map(a => signals(a, head)));
    res.forEach(s => cache[s.addr] = s);
    if ((i / CONC) % 5 === 0) {
      const done = Math.min(i + CONC, todo.length);
      const eta = done ? Math.round((Date.now() - t0) / done * (todo.length - done) / 1000) : 0;
      process.stdout.write('\r  ' + done + '/' + todo.length + '   ~' + eta + 's left   ');
      fs.writeFileSync(CACHE, JSON.stringify(cache));
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  process.stdout.write('\r' + ' '.repeat(46) + '\r');
  console.log('signals ready in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's, ' + calls + ' rpc calls\n');

  const rows = addrs.map(a => cache[a]).filter(Boolean);
  const num = k => rows.map(r => r[k] || 0).sort((a, b) => a - b);
  const pop = {
    eth: num('eth'), txs: num('txs'), rate: num('txRate'),
    nfts: num('nfts'), colls: num('colls'), idle: num('idleDays'),
    age: rows.filter(r => r.ageDays).map(r => r.ageDays).sort((a, b) => a - b),
  };

  const count = {}, leanCount = {};
  FACETS.forEach(f => { count[f] = 0; leanCount[f] = 0; });
  let surprises = 0;
  rows.forEach(r => {
    const sc = score(r, pop);
    const seed = parseInt(r.addr.slice(2, 10), 16);
    const p = pick(sc, seed);
    count[p.facet]++; leanCount[p.lean]++;
    if (p.surprise) surprises++;
    r._p = p;
  });

  console.log('── DRAWN facet (what the visitor sees) ──');
  FACETS.forEach(f => console.log('  ' + f.padEnd(11) + String(count[f]).padStart(4) +
    '  %' + (100 * count[f] / rows.length).toFixed(1).padStart(5) + '   ' + '#'.repeat(Math.round(60 * count[f] / rows.length))));
  console.log('\n── what the DATA leaned toward ──');
  FACETS.forEach(f => console.log('  ' + f.padEnd(11) + String(leanCount[f]).padStart(4) +
    '  %' + (100 * leanCount[f] / rows.length).toFixed(1).padStart(5)));
  console.log('\nsurprise (draw != data): ' + surprises + '  %' + (100 * surprises / rows.length).toFixed(1));

  const q = a => a.length ? [a[0], a[Math.floor(a.length / 2)], a[a.length - 1]] : [0, 0, 0];
  console.log('\n── population (min / median / max) ──');
  console.log('  eth      ' + q(pop.eth).map(v => v.toFixed(3)).join('  /  '));
  console.log('  txs      ' + q(pop.txs).join('  /  '));
  console.log('  age days ' + q(pop.age).join('  /  '));
  console.log('  tx/year  ' + q(pop.rate).map(v => v.toFixed(0)).join('  /  '));
  console.log('  nfts     ' + q(pop.nfts).join('  /  '));
  console.log('  koleksiyon ' + q(pop.colls).join('  /  '));
  console.log('  idle days ' + q(pop.idle).join('  /  '));
  console.log('  deploy yapan: ' + rows.filter(r => r.deploys > 0).length + ' cuzdan');
})().catch(e => { console.error('\nFAILED: ' + e.message); process.exit(1); });
