// THE CLAIM — proving a wallet is yours, and the two lists that come out of it.
//
// gruff, 2026-08-26: "2 liste: sadece cüzdan giren ve cüzdan girip approve/sign gibi bir şey
// yapanlar." And: everyone who signs goes on FCFS; the GTD raffle is drawn from among them later.
//
// ⛔ THE TWO LISTS ARE NOT THE SAME KIND OF THING AND MUST NEVER BE MERGED.
//   A · READS   every address someone typed in. NOT people. Pasting an address proves nothing, so
//               this is demand data and can never be an allowlist. One script could paste 50,000.
//   B · SIGNED  addresses whose owner produced a signature. These are people. THIS is the FCFS CSV.
//               If A were used instead, the ceiling method the whole mint waterfall rests on dies,
//               because a presale stage's ceiling is the sum of the per-wallet limits in its file.
//
// ⚠️ THE EXACT MESSAGE IS STORED WITH THE SIGNATURE. A signature alone cannot be re-verified later:
// recovery needs the bytes that were signed. Storing only "0xabc... signed" is a claim, not proof.
//
// ⚠️ THE ADDRESS IS RECOVERED FROM THE SIGNATURE, NEVER TAKEN FROM THE REQUEST. What the caller says
// its address is has no standing; only what the signature recovers to does.
'use strict';
const fs = require('fs'), path = require('path');
const crypto = require('crypto');
// ⚠️ A DECLARED DEPENDENCY, not a path into the contract project next door. Reaching into a
// sibling's node_modules worked on this machine and would have thrown on the first signature
// anywhere else, because nothing ships exp/contract to a server.
const ethers = require('ethers');

// The guard needs somewhere throwaway to write. An override here means the guard can load THIS file
// rather than a rewritten copy of it, which would be testing something that does not ship.
const DIR = process.env.MIRROR_LISTS_DIR || path.join(__dirname, 'site', 'lists');
fs.mkdirSync(DIR, { recursive: true });
const READS = path.join(DIR, 'reads.jsonl');
const SIGNED = path.join(DIR, 'signed.jsonl');

// ⛔ THE ADDRESS THAT MUST NEVER REACH A MINT LIST.
// `FacetsTurn.excludedAtLaunch` is gruff's own wallet, it holds the 369 token reserve, and it was
// already removed by hand from the Kat 2 CSV and the 612 wallet DM list for the same reason. He will
// certainly test the Mirror with it. Excluded at export, and the export says so out loud.
const EXCLUDED = new Set(['0x4730497622bdfd6eafe1f09fa22b3a0aca94a646']);

// ── the message ───────────────────────────────────────────────────────────────────────────────────
// Plain enough to read inside a wallet popup, and it binds BOTH the address and a one-shot nonce, so
// a signature cannot be replayed for a different wallet or captured and reused later.
// ⚠️ No em dashes and no smart quotes: this string is shown verbatim by the wallet and some wallets
// render unusual characters as escapes, which makes an honest message look like an attack.
const MESSAGE = (addr, nonce) =>
  'FACETS: THE MIRROR\n\n' +
  'I am signing to prove this wallet is mine.\n\n' +
  'This puts it on the FCFS list and enters it in the draw for guaranteed spots.\n' +
  'It costs no gas, moves nothing, and grants no permission over anything I own.\n\n' +
  'Wallet: ' + addr + '\n' +
  'Nonce: ' + nonce;

// ── nonces ────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ single use and short lived, held in memory. A restart invalidates outstanding ones, which is
// correct: the page asks for a fresh nonce immediately before it asks the wallet to sign.
const NONCES = new Map();
const NONCE_TTL = 10 * 60e3;
// ⛔ THE MESSAGE IS STORED, NOT REBUILT. The first version handed out a message built from the
// address AS GIVEN (checksummed, because that is what a wallet shows) and then rebuilt it from the
// LOWERCASED address at verification time. Two different strings, so recovery returned a different
// address and every honest signature was rejected as a forgery. Caught by guard_claims.cjs on its
// first run. Never reconstruct something that was signed: keep the bytes.
function issueNonce(addr) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const message = MESSAGE(addr, nonce);
  NONCES.set(nonce, { addr: addr.toLowerCase(), message, at: Date.now() });
  return { nonce, message, expiresIn: NONCE_TTL / 1000 };
}
function takeNonce(nonce) {
  const n = NONCES.get(nonce);
  if (!n) return null;
  NONCES.delete(nonce);                                   // one shot, consumed on first use
  if (Date.now() - n.at > NONCE_TTL) return null;
  return n;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of NONCES) if (now - v.at > NONCE_TTL) NONCES.delete(k);
}, 60e3).unref();

// ── what a person may type onto a card that carries the FACETS mark ───────────────────────────────
// ⚠️ This is a NAME FIELD ON AN IMAGE WE PUT OUR LOGO ON, so it needs a length cap and a floor of
// decency. The list below is short and deliberately not presented as complete: it stops the laziest
// abuse, and anything past that is a moderation problem, not a regex problem.
const BANNED = ['nigger', 'nigga', 'faggot', 'kike', 'retard', 'rape', 'hitler', 'nazi'];
function cleanText(s, max) {
  if (s == null) return null;
  // strip control characters and anything that lets one field pretend to be two
  // ⚠️ NO REGEX LITERAL HERE. The first version put the control characters themselves inside a
  // character class, and a regex literal containing raw control characters does not survive being
  // written to a file and read back. Filtering by code point is the same rule with no literals.
  let t = String(s).split('').filter(function (ch) {
    const c = ch.codePointAt(0);
    return !(c < 0x20 || c === 0x7f ||           // C0 controls, including newline and tab
             (c >= 0x200b && c <= 0x200f) ||     // zero width and bidi marks
             c === 0x2028 || c === 0x2029 ||     // line and paragraph separators
             c === 0xfeff);                      // byte order mark
  }).join('').trim();
  if (!t) return null;
  if (t.length > max) t = t.slice(0, max);
  const flat = t.toLowerCase().replace(/[^a-z]/g, '');
  if (BANNED.some(b => flat.includes(b))) return { bad: true };
  return t;
}
const cleanHandle = h => {
  if (h == null) return null;
  const t = String(h).trim().replace(/^@+/, '');
  // X handles are 1-15 of [A-Za-z0-9_]. Anything else is not a handle and is dropped rather than
  // stored, because this field is how a raffle winner gets told they won.
  return /^[A-Za-z0-9_]{1,15}$/.test(t) ? t : null;
};

// ── the append only logs ──────────────────────────────────────────────────────────────────────────
// ⚠️ JSONL and append only on purpose. A rewritten file can lose rows to a crash or a race, and these
// two are the evidence behind a mint list. Nothing here is ever edited in place.
const append = (file, row) => fs.appendFile(file, JSON.stringify(row) + '\n', () => {});

const logRead = (addr, meta) => append(READS, {
  t: new Date().toISOString(), addr: addr.toLowerCase(),
  facet: meta && meta.facet || null, cached: !!(meta && meta.cached)
});

// ── the claim ─────────────────────────────────────────────────────────────────────────────────────
function claim(body) {
  const sig = String(body && body.signature || '');
  const nonce = String(body && body.nonce || '');
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) return { error: 'that is not a signature' };

  const n = takeNonce(nonce);
  if (!n) return { error: 'this nonce is unknown or has expired, ask for a new one' };

  const message = n.message;                              // the exact bytes that were handed out
  let recovered;
  try { recovered = ethers.utils.verifyMessage(message, sig).toLowerCase(); }
  catch (e) { return { error: 'the signature could not be read' }; }

  // ⚠️ the recovered address is the ONLY address with any standing here
  if (recovered !== n.addr) return { error: 'that signature is not from the wallet it claims' };

  const name = cleanText(body.name, 24);
  if (name && name.bad) return { error: 'pick another name' };
  const handle = cleanHandle(body.handle);

  const row = {
    t: new Date().toISOString(),
    addr: recovered,
    // ⚠️ the signature AND the exact bytes that were signed, or none of this can be checked again
    message, nonce, signature: sig,
    name: name || null, handle: handle || null,
    facet: body.facet || null, rank: body.rank == null ? null : Number(body.rank)
  };
  append(SIGNED, row);
  return { ok: true, addr: recovered, name: row.name, handle: row.handle };
}

// ── reading the lists back ────────────────────────────────────────────────────────────────────────
function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// last row wins, so re-signing updates a name or a handle without losing the earlier evidence
function signedLatest() {
  const by = new Map();
  for (const r of readJsonl(SIGNED)) by.set(r.addr, r);
  return [...by.values()];
}

// ⚠️ EVERY ROW IS RE-VERIFIED FROM ITS OWN STORED MESSAGE before it can reach a CSV. The file is
// append only and nothing edits it, but a list that gates real value should not be trusted because
// of how it was written; it should be checkable, and this is the check.
function verifyAll() {
  const rows = signedLatest();
  const good = [], bad = [];
  for (const r of rows) {
    let ok = false;
    try { ok = ethers.utils.verifyMessage(r.message, r.signature).toLowerCase() === r.addr; } catch {}
    (ok ? good : bad).push(r);
  }
  return { good, bad };
}

// the Studio presale format: address,limit,price · no header · lowercase 0x · one row per wallet
function fcfsCsv(limit, price) {
  const { good, bad } = verifyAll();
  const excluded = good.filter(r => EXCLUDED.has(r.addr));
  const rows = good.filter(r => !EXCLUDED.has(r.addr));
  const csv = rows.map(r => r.addr + ',' + (limit || 1) + ',' + (price == null ? 0 : price)).join('\n');
  return { csv, count: rows.length, rejected: bad.length, excluded: excluded.map(r => r.addr) };
}

const stats = () => {
  const reads = readJsonl(READS);
  const { good, bad } = verifyAll();
  return {
    reads: reads.length,
    readsUnique: new Set(reads.map(r => r.addr)).size,
    signed: good.length,
    signedFailingVerification: bad.length,
    withHandle: good.filter(r => r.handle).length
  };
};

// REMOVE ONE SIGNATURE, BY ADDRESS.
// ⛔ THE RULES ARE unsign.cjs's RULES, and they exist because I destroyed a real signature once:
//   1. never blank the file. The list is rebuilt from the rows that do NOT match, so a row nobody
//      named cannot be lost even if this function is called wrong.
//   2. a timestamped backup before anything is written.
//   3. an address that is not on the list changes nothing and says so.
// A signature cannot be reconstructed once gone: it can only be re-verified against the exact bytes
// that were signed, and those bytes live in the row.
function unsign(addr) {
  addr = String(addr || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return { error: 'that is not an address' };
  let lines;
  try { lines = fs.readFileSync(SIGNED, 'utf8').split('\n').filter(Boolean); }
  catch { return { error: 'there is no signed list yet' }; }
  const keep = [], going = [];
  for (const l of lines) {
    let r = null; try { r = JSON.parse(l); } catch {}
    if (r && String(r.addr).toLowerCase() === addr) going.push(r); else keep.push(l);
  }
  if (!going.length) return { error: 'that address is not on the list', removed: 0 };
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const backup = SIGNED + '.' + stamp + '.bak';
  fs.copyFileSync(SIGNED, backup);
  fs.writeFileSync(SIGNED, keep.join('\n') + (keep.length ? '\n' : ''));
  return { ok: true, removed: going.length, remaining: keep.length,
           who: going.map(r => ({ name: r.name || null, handle: r.handle || null, t: r.t })),
           backup: path.basename(backup) };
}

// EVERY WALLET EVER ENTERED, AND EVERY WALLET THAT SIGNED, AS CSV.
// ⚠️ These two lists are the point of the exercise and they live only on the mounted disk, so there
// has to be a way to take a copy off the box. Admin only: reads.jsonl is who looked up whom.
// `readsCsv` gives one row per READ, which is deliberately not deduplicated: how often a wallet was
// looked at is itself the signal. `uniqueReadsCsv` collapses it to one row per address.
const csvCell = v => {
  const s = v == null ? '' : String(v);
  const CR = String.fromCharCode(13), LF = String.fromCharCode(10), QT = String.fromCharCode(34);
  const needs = s.indexOf(',') >= 0 || s.indexOf(QT) >= 0 || s.indexOf(CR) >= 0 || s.indexOf(LF) >= 0;
  return needs ? QT + s.split(QT).join(QT + QT) + QT : s;
};
const csvOf = (head, rows) => [head.join(',')].concat(rows.map(r => r.map(csvCell).join(','))).join(String.fromCharCode(10)) + String.fromCharCode(10);

function readsCsv() {
  const rows = readJsonl(READS).map(r => [r.t, r.addr, r.facet || '', r.cached ? 'cached' : 'fresh']);
  return { csv: csvOf(['read_at', 'address', 'facet', 'source'], rows), count: rows.length };
}

function uniqueReadsCsv() {
  const by = new Map();
  for (const r of readJsonl(READS)) {
    const a = String(r.addr || '').toLowerCase();
    if (!a) continue;
    const e = by.get(a) || { first: r.t, last: r.t, n: 0, facet: r.facet || '' };
    e.n++; e.last = r.t; if (r.facet) e.facet = r.facet;
    by.set(a, e);
  }
  const rows = [...by.entries()].sort((x, y) => y[1].n - x[1].n)
    .map(([a, e]) => [a, e.facet, e.n, e.first, e.last]);
  return { csv: csvOf(['address', 'facet', 'times_read', 'first_read', 'last_read'], rows), count: rows.length };
}

// the signed list as itself, not as a mint file: fcfsCsv is shaped by price and per-wallet limit
function signedCsv() {
  const rows = signedLatest().sort((a, b) => (a.t < b.t ? -1 : 1))
    .map(r => [r.t, r.addr, r.name || '', r.handle || '', r.facet || '',
               EXCLUDED.has(String(r.addr).toLowerCase()) ? 'excluded' : 'eligible']);
  return { csv: csvOf(['signed_at', 'address', 'name', 'x_handle', 'facet', 'status'], rows), count: rows.length };
}

module.exports = { MESSAGE, issueNonce, claim, stats, fcfsCsv, verifyAll, signedLatest, unsign,
                   readsCsv, uniqueReadsCsv, signedCsv,
                   logRead, cleanText, cleanHandle, EXCLUDED, READS, SIGNED };
