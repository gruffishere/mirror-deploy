// INDEPENDENT VERIFICATION of a stored WRAPPED reading, against the chain, right now.
//
//   node wrapped/verify.cjs 0xaddr [0xaddr ...]
//
// gruff, 2026-08-26: "birkaç örnek cüzdanı yaptığın çıktıyla audit et, etherscan'inden ve os
// adresinden karşılaştır, sıfır hata olması gerek."
//
// ⚠️ THIS DELIBERATELY DOES NOT IMPORT THE ENGINE. A checker that calls the same reader as the thing
// it checks can only ever agree with it. Every number below is recomputed here from raw Etherscan
// rows with its own arithmetic, so a shared bug shows up as a disagreement instead of hiding.
//
// ⚠️ A stored reading is a snapshot. The chain has moved since, so a live total is expected to be
// GREATER, never smaller. Fields are therefore compared with the rule that fits them:
//   EXACT   must match to the digit (first transaction, its block, its timestamp)
//   FLOOR   live must be >= stored (counts and sums that only grow)
//   ASOF    recomputed from live rows truncated to the stored read date, must match EXACTLY
// ASOF is the real test: it replays history to the moment of the snapshot and asks whether the
// engine counted it right.
'use strict';
const fs = require('fs'), path = require('path');
const K = JSON.parse(fs.readFileSync(path.join(__dirname, '.keys.json'), 'utf8'));

// ⛔ FOUND 2026-08-26: the V1 host answers every request with
//    "You are using a deprecated V1 endpoint, switch to Etherscan API V2".
// The same key works on V2, which needs the host, `/v2/api` and an explicit chainid.
const ES = 'https://api.etherscan.io/v2/api?chainid=1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PAGE = 1000;              // the real cap, measured; see the note on wholeLife

async function es(params, tries) {
  tries = tries || 4;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(ES + '&' + params + '&apikey=' + K.etherscan);
      const j = await r.json();
      if (j.status === '1' || (j.message || '').indexOf('No transactions') === 0) return j;
      if (/rate limit|Max calls/i.test(String(j.result) + j.message)) { await sleep(1200); continue; }
      // "No transactions found" arrives as status 0 with an empty array, which is an answer
      if (Array.isArray(j.result)) return j;
      throw new Error(j.result || j.message);
    } catch (e) { if (i === tries - 1) throw e; await sleep(900); }
  }
}

// Walk the whole life by block range.
// ⛔ MEASURED 2026-08-26, AND IT BIT THIS FILE FIRST: Etherscan V2 caps txlist at 1,000 rows whatever
// `offset` says, and reports the truncated page as status 1, "OK". Asking for 10,000 returns 1,000 with
// no error, so a walk that stops when a batch is "short" stops after one page and reports a complete
// history. The first run of this checker did exactly that and accused the engine of losing 294 rows.
// The engine was right: it has always paged at 1,000 and advanced startblock.
async function wholeLife(addr, cap) {
  const rows = [];
  let start = 0, guard = 0;
  for (;;) {
    if (++guard > (cap || 90)) { return { rows: rows, complete: false }; }
    const j = await es('module=account&action=txlist&address=' + addr +
      '&startblock=' + start + '&endblock=99999999&page=1&offset=' + PAGE + '&sort=asc');
    const batch = Array.isArray(j.result) ? j.result : [];
    if (!batch.length) break;
    // the last block of a batch may be half read, so re-request from it and drop what we already have
    const seen = new Set(rows.map(r => r.hash));
    for (const r of batch) if (!seen.has(r.hash)) rows.push(r);
    if (batch.length < PAGE) break;
    const last = Number(batch[batch.length - 1].blockNumber);
    if (last === start) break;
    start = last;
    await sleep(260);
  }
  return { rows: rows, complete: true };
}

const F = n => Number(n).toLocaleString('en-US');
const day = ts => new Date(ts * 1000).toISOString().slice(0, 10);

// ⚠️ raw values in, formatting only on the way to the screen. The first version compared the
// FORMATTED strings, so Number("1,295") was NaN and every FLOOR row failed no matter what.
function line(rule, label, stored, live, fmt) {
  const show = fmt || (x => x);
  const ok = rule === 'FLOOR' ? Number(live) >= Number(stored)
                              : String(show(stored)) === String(show(live));
  const mark = ok ? '  ok  ' : '  ⛔  ';
  console.log(mark + rule.padEnd(6) + label.padEnd(26) +
    'stored ' + String(show(stored)).padStart(14) + '   live ' + String(show(live)).padStart(14));
  return ok;
}

async function verify(addr) {
  addr = addr.toLowerCase();
  const cache = JSON.parse(fs.readFileSync(path.join(__dirname, 'site', 'cache_v2.json'), 'utf8'));
  const entry = cache[addr];
  if (!entry) { console.log(addr + ' is not in the cache, nothing to check against'); return null; }
  const s = entry.signals, sh = s.shape || {};
  const readAt = Math.floor(new Date(entry.at).getTime() / 1000);

  console.log('\n' + '═'.repeat(96));
  console.log((s.ens || addr) + '   ' + addr);
  console.log('stored reading taken ' + entry.at + '   (' + day(readAt) + ')');
  console.log('═'.repeat(96));

  const w = await wholeLife(addr);
  if (!w.complete) { console.log('  ⚠️  history is longer than this checker walks; skipping'); return null; }
  const all = w.rows;
  const asof = all.filter(r => Number(r.timeStamp) <= readAt);
  console.log('  live rows ' + F(all.length) + '   of which at or before the read date ' + F(asof.length) + '\n');

  // recomputed from raw rows, with arithmetic written here and nowhere else
  const first = asof[0];
  const sent = asof.filter(r => (r.from || '').toLowerCase() === addr).length;
  const recv = asof.length - sent;
  // ⚠️ only the ones this wallet SENT. Counting inbound failures too made this checker report 37
  // against the engine's 30 on gruff's wallet: seven strangers' transactions failed on the way in,
  // and none of them cost him anything. "You paid for nothing" has to mean YOU paid.
  const fail = asof.filter(r => r.isError === '1' && (r.from || '').toLowerCase() === addr).length;
  const failAny = asof.filter(r => r.isError === '1').length;
  const gas = asof.filter(r => (r.from || '').toLowerCase() === addr)
                  .reduce((a, r) => a + Number(r.gasUsed) * Number(r.gasPrice), 0) / 1e18;
  const deploys = asof.filter(r => (r.from || '').toLowerCase() === addr && !r.to).length;
  // ⚠️ ROUND, not floor. The engine rounds and it is right to: 1,902.75 days on chain is 1,903 to
  // anyone who says it out loud. Measured on four wallets, the engine equals Math.round every time.
  // Flooring here reported a one day gap on two of five wallets and the CHECKER was the wrong one.
  const ageDays = Math.round((readAt - Number(first.timeStamp)) / 86400);

  let bad = 0;
  const chk = (rule, label, stored, live, fmt) => { if (!line(rule, label, stored, live, fmt)) bad++; };

  chk('EXACT', 'first transaction date', day(sh.firstTs || s.firstTs), day(Number(first.timeStamp)));
  chk('ASOF',  'rows in history', s.rowCount, asof.length, F);
  chk('ASOF',  'sent', s.sent, sent, F);
  chk('ASOF',  'received', s.received, recv, F);
  chk('ASOF',  'reverted (sent by you)', s.failCount, fail, F);
  chk('ASOF',  'gas burned, ETH', s.gasEth.toFixed(2), gas.toFixed(2));
  chk('ASOF',  'contracts deployed', s.directDeploys, deploys, F);
  chk('ASOF',  'days on chain', s.ageDays, ageDays, F);
  chk('FLOOR', 'rows today', s.rowCount, all.length, F);
  console.log('  --    NOTE  ' + 'inbound failures too'.padEnd(26) + 'stored ' + '-'.padStart(14) +
    '   live ' + String(F(failAny)).padStart(14) + '   (not counted, and correctly so)');

  // Alchemy, for the holdings half. Drift is expected here: people buy and sell.
  const al = await (await fetch('https://eth-mainnet.g.alchemy.com/nft/v3/' + K.alchemy +
    '/getContractsForOwner?owner=' + addr + '&pageSize=100')).json();
  console.log('  --    ALCH  ' + 'collections totalCount'.padEnd(26) +
    'stored ' + String(F(s.collsRaw)).padStart(14) + '   live ' + String(F(al.totalCount)).padStart(14) +
    '   (drift expected, people trade)');

  console.log(bad ? '\n  ⛔ ' + bad + ' FIELD(S) DISAGREE' : '\n  ✅ every field agrees');
  return bad;
}

(async () => {
  const argv = process.argv.slice(2);
  let total = 0, run = 0;
  for (const a of argv) { const b = await verify(a); if (b !== null) { total += b; run++; } }
  console.log('\n' + '═'.repeat(96));
  console.log(run + ' wallet(s) checked · ' + total + ' disagreement(s)');
})();
