// COLLECT THE TIME SHAPE FOR THE REFERENCE POPULATION.
//
//   node wrapped/fetch_shape.cjs [--limit N] [--only-missing]
//
// The story layer scores every beat by how far it sits from the population, which is what makes
// "most striking first" mean anything. That works for age, holdings, gas, reverts, deploys and
// volume, and it does NOT work for silence, streaks, peak year, your hour, busiest day or top gas,
// because those numbers were never collected for the 5,000. Their scores come from hand-set bands
// instead, so the NUMBERS are real and their RANKING is a guess.
//
// ⚠️ CHECKED BEFORE PROMISING IT WAS CHEAP: 0 of the 5,000 have a `shape`. This needs the full
// history walk again, about 15,300 Etherscan calls, roughly an hour at the free tier's 5/s.
//
// ⚠️ IT REUSES `timeShape()` FROM THE ENGINE. Re-implementing the same fields here would give the
// population one definition of "peak year" and a live visitor another, and the comparison between
// them is the entire point.
//
// ⚠️ RESUMABLE, AND IT NEVER LEAVES A HALF WRITTEN FILE. Progress is saved to a temp file and
// renamed over the real one, so a crash costs at most the last batch. Re-running picks up where it
// stopped.
'use strict';
const fs = require('fs'), path = require('path');
const { timeShape } = require(path.join(__dirname, 'timeshape.cjs'));
const KEYS = JSON.parse(fs.readFileSync(path.join(__dirname, '.keys.json'), 'utf8'));

const SIG = path.join(__dirname, 'signals_v2.json');
const TMP = SIG + '.writing';
const PAGE = 1000;                 // ⛔ Etherscan V2's real cap, whatever `offset` says
const SLEEP = 235;                 // ~4.3 calls a second, under the free tier's 5
const SAVE_EVERY = 25;

const arg = k => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : undefined; };
const LIMIT = Number(arg('limit') || 0);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let calls = 0;

async function es(params, tries) {
  tries = tries || 5;
  for (let i = 0; i < tries; i++) {
    try {
      calls++;
      const r = await fetch('https://api.etherscan.io/v2/api?chainid=1&' + params + '&apikey=' + KEYS.etherscan);
      const j = await r.json();
      if (Array.isArray(j.result)) return j.result;
      if (/rate limit|Max calls/i.test(String(j.result) + j.message)) { await sleep(1400); continue; }
      return [];                                   // "No transactions found" is an answer
    } catch (e) { if (i === tries - 1) throw e; await sleep(1200); }
  }
  return [];
}

// the whole life, by block range. page= cannot reach the end of a busy wallet; advancing startblock can
async function history(addr) {
  const rows = [];
  const seen = new Set();
  let start = 0, guard = 0;
  for (;;) {
    if (++guard > 90) return { rows, complete: false };
    const batch = await es('module=account&action=txlist&address=' + addr +
      '&startblock=' + start + '&endblock=99999999&page=1&offset=' + PAGE + '&sort=asc');
    if (!batch.length) break;
    for (const r of batch) if (!seen.has(r.hash)) { seen.add(r.hash); rows.push(r); }
    if (batch.length < PAGE) break;
    const last = Number(batch[batch.length - 1].blockNumber);
    if (last === start) break;
    start = last;
    await sleep(SLEEP);
  }
  return { rows, complete: true };
}

(async () => {
  const sig = JSON.parse(fs.readFileSync(SIG, 'utf8'));
  const keys = Object.keys(sig);
  const todo = keys.filter(k => sig[k] && sig[k].addr && !(sig[k].shape && Object.keys(sig[k].shape).length));
  const work = LIMIT ? todo.slice(0, LIMIT) : todo;

  console.log(keys.length + ' wallets · ' + (keys.length - todo.length) + ' already have a shape · ' +
    work.length + ' to fetch');
  if (!work.length) { console.log('nothing to do'); return; }
  const t0 = Date.now();
  let done = 0, failed = 0;

  const save = () => {
    fs.writeFileSync(TMP, JSON.stringify(sig));
    fs.renameSync(TMP, SIG);                       // atomic-ish: never a half written signals file
  };

  for (const k of work) {
    const a = sig[k].addr;
    try {
      const h = await history(a);
      sig[k].shape = timeShape(h.rows, a);
      sig[k].shapeComplete = h.complete;
    } catch (e) {
      failed++;
      sig[k].shape = null;
    }
    done++;
    if (done % SAVE_EVERY === 0) {
      save();
      const per = (Date.now() - t0) / done;
      const left = ((work.length - done) * per / 60000).toFixed(0);
      console.log('  ' + done + '/' + work.length + '   ' + calls + ' calls   ' +
        (per / 1000).toFixed(2) + ' s each   ~' + left + ' min left' + (failed ? '   ' + failed + ' failed' : ''));
    }
    await sleep(SLEEP);
  }
  save();
  console.log('done: ' + done + ' wallets, ' + calls + ' calls, ' +
    ((Date.now() - t0) / 60000).toFixed(1) + ' min' + (failed ? ', ' + failed + ' failed' : ''));
})();
