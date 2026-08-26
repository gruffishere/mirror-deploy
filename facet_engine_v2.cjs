// FACETS WRAPPED — engine v2. Deterministic, no draw, seven axes.
//
//   node facet_engine_v2.cjs baseline <wallets.csv>   fetch the population, write signals_v2 + baseline_v2
//   node facet_engine_v2.cjs read <0xaddr|name.eth>   one profile, printed
//   node facet_engine_v2.cjs report                   the distribution over the frozen population
//
// The full rationale, and every measurement behind the weights, is in ENGINE_V2_SPEC.md.
//
// ⚠️ THIS IS STILL NOT THE MINT. The contract cannot read any of this: every input here is off chain.
// The page must say so, and the spec says why the honest argument is game theory rather than gas.
//
// ⚠️ THE ONE RULE THAT COST US MOST IN v1: null means UNKNOWN and must stay null all the way to the
// scorer. `idleDays: null -> 0` turned an API refusal into "transacted today" on 522 of 635 wallets.
// Every fetch here returns null on failure and every consumer checks.
'use strict';
const fs = require('fs'), path = require('path');
const ENS = require(path.join(__dirname, 'ens.cjs'));
// ★ The narrative layer reads the same history the axes are built from, so it costs nothing extra.
// It is computed HERE, at the only point where the full transaction list exists, because the walk
// throws the rows away immediately afterwards.
const { timeShape } = require(path.join(__dirname, 'timeshape.cjs'));

const FACETS = ['NEWBIE', 'COLLECTOR', 'DEGEN', 'BUILDER', 'OG', 'WHALE', 'GHOST'];
const RPCS = ['https://ethereum-rpc.publicnode.com', 'https://eth.merkle.io'];
const SIGNALS = path.join(__dirname, 'signals_v2.json');
const BASELINE = path.join(__dirname, 'baseline_v2.json');
// ⚠️ ENV FIRST, FILE SECOND. On a host there is no .keys.json and there must not be: the keys
// arrive as environment variables. The file stays as the local fallback so nothing about running
// this on the author's machine changes. null when neither exists, exactly as before.
const KEYS = (() => {
  const file = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '.keys.json'), 'utf8')); }
                        catch { return {}; } })() || {};
  const k = { etherscan: process.env.ETHERSCAN_KEY || file.etherscan,
              alchemy:   process.env.ALCHEMY_KEY   || file.alchemy };
  return (k.etherscan || k.alchemy) ? k : null;
})();

const sleep = ms => new Promise(r => setTimeout(r, ms));
let rr = 0, calls = { rpc: 0, es: 0, al: 0 };

// ── transport ─────────────────────────────────────────────────────────────────────────────────────
async function rpc(method, params, tries = 4) {
  for (let t = 0; t < tries; t++) {
    calls.rpc++;
    try {
      const res = await fetch(RPCS[rr++ % RPCS.length], { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

// ⚠️ Etherscan's free tier is 5 calls per second and it answers HTTP 200 with status "0" when it
// refuses, so the status code alone is not the answer. Serialise, and retry a refusal instead of
// banking it as data.
// ⛔ THE FIRST VERSION CHAINED ON COMPLETION AND THAT IS NOT A RATE LIMIT, IT IS A QUEUE OF ONE.
// `gate.then(fn)` starts the next call only after the previous one RESOLVES, then waits another
// 230 ms. Once the pages grew from 100 rows to 1,000 each call took about 2.3 s to fetch and parse,
// so the real throughput was 0.39 calls per second against a 5 per second allowance: measured at
// 1,558 calls in 4,000 s. The population fetch was on course for 18 hours instead of 2.
// ★ A rate limit spaces call STARTS. Concurrency then happens on its own and the limit still holds.
let esNext = 0;
const esThrottle = async fn => {
  const now = Date.now();
  const at = Math.max(now, esNext);
  esNext = at + 230;                 // 4.3 per second, just under Etherscan's free tier ceiling
  if (at > now) await sleep(at - now);
  return fn();
};

async function getJSON(url, kind, tries = 5) {
  for (let t = 0; t < tries; t++) {
    calls[kind]++;
    try {
      const r = await fetch(url);
      if (r.status === 429) { await sleep(800 * (t + 1)); continue; }
      const txt = await r.text();
      if (txt.trim().startsWith('<') || txt.trim().startsWith('The ')) { await sleep(500 * (t + 1)); continue; }
      const j = JSON.parse(txt);
      if (j && j.status === '0' && /rate limit|max .* rate/i.test(String(j.result || j.message))) {
        await sleep(800 * (t + 1)); continue;
      }
      if (j) return j;
    } catch {}
    await sleep(400 * (t + 1));
  }
  return null;                     // ⛔ UNKNOWN. Never read as a value.
}

const alUrl = (p, q) => 'https://eth-mainnet.g.alchemy.com/nft/v3/' + KEYS.alchemy + '/' + p + '?' + q;
async function alRpc(method, params) {
  calls.al++;
  try {
    const r = await fetch('https://eth-mainnet.g.alchemy.com/v2/' + KEYS.alchemy, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json();
    return j.result !== undefined ? j.result : null;
  } catch { return null; }
}

// ── D3: ETH balance alone is a browsing habit. Population median is 0.008 ETH. ────────────────────
// A fixed list of majors and stables, priced crudely on purpose: stables at 1 USD, the staked and
// wrapped ETH derivatives at 1 ETH. wstETH actually trades above 1 ETH, and that approximation is
// accepted here because this is a percentile input, not an accounting figure.
const TOKENS = [
  ['USDC',   '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 6,  'usd'],
  ['USDT',   '0xdac17f958d2ee523a2206206994597c13d831ec7', 6,  'usd'],
  ['DAI',    '0x6b175474e89094c44da98b954eedeac495271d0f', 18, 'usd'],
  ['WETH',   '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 18, 'eth'],
  ['stETH',  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', 18, 'eth'],
  ['wstETH', '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', 18, 'eth'],
  ['rETH',   '0xae78736cd615f374d3085123a210448e74fc6393', 18, 'eth'],
  ['cbETH',  '0xbe9895146f7af43049ca1c1ae358b0541ea49704', 18, 'eth'],
];

async function ethUsd() {
  try {
    const j = await (await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')).json();
    const p = Number(j && j.data && j.data.amount);
    if (p > 0) return p;
  } catch {}
  return null;                     // ⛔ unknown price means the stable leg is dropped, not guessed
}

// ⛔ ALCHEMY RETURNS THESE SORTED BY CONTRACT ADDRESS, NOT IN THE ORDER REQUESTED. Reading the
// response positionally applied the wrong decimals to the wrong token on every single wallet: 5,778
// DAI came back as 5.78e15 "USDC" and would have owned the WHALE percentile outright. Map by
// contractAddress, never by index.
const BY_ADDR = Object.fromEntries(TOKENS.map(t => [t[1], t]));
async function tokenEth(addr, price) {
  const r = await alRpc('alchemy_getTokenBalances', [addr, TOKENS.map(t => t[1])]);
  if (!r || !Array.isArray(r.tokenBalances)) return null;
  let eth = 0;
  for (const b of r.tokenBalances) {
    if (!b || b.error || !b.tokenBalance || !b.contractAddress) continue;
    const t = BY_ADDR[b.contractAddress.toLowerCase()];
    if (!t) continue;
    const v = Number(BigInt(b.tokenBalance)) / Math.pow(10, t[2]);
    const inEth = t[3] === 'eth' ? v : (price ? v / price : 0);
    // a single leg above this is not wealth, it is a broken token or a burn sink
    if (inEth > 0 && inEth < 1e6) eth += inEth;
  }
  return eth;
}

// ── D2: the descending page was fetched with offset=1 for one timestamp. offset=100 is the same call.
//
// ⛔ A FUNCTION-NAME REGEX FOR "TRADING" WAS BUILT HERE AND THEN MEASURED AND REMOVED. A heavy
// trader's normal transaction list is dominated by transfer, approve and setApprovalForAll, because
// the actual marketplace fills arrive as internal transactions. Pranksy's last 100 matched a
// swap/buy/fulfil pattern 4 times out of 66. The signal was thin and the regex was a guess.
// ★ Replaced with GAS BURNED, which is free from the same rows, has no vocabulary to guess at, and is
// a better description of a Degen anyway: not how often you move, but how much you have set on fire.
function readWindow(rows, addr) {
  if (!rows || !rows.length) return null;
  const me = addr.toLowerCase();
  const out = rows.filter(t => (t.from || '').toLowerCase() === me);
  const newest = Number(rows[0].timeStamp), oldest = Number(rows[rows.length - 1].timeStamp);
  const spanDays = Math.max(1, (newest - oldest) / 86400);
  const gasEth = out.reduce((a, t) => a + Number(t.gasUsed || 0) * Number(t.gasPrice || 0) / 1e18, 0);
  // ⚠️ the LAST OUTBOUND move, not the last row. Anyone can be airdropped into looking active, and
  // Ghost is precisely the wallet that receives without answering.
  const lastOut = out.length ? Number(out[0].timeStamp) : null;
  return {
    lastTs: newest,
    lastOutTs: lastOut,
    // ⚠️ the rate of THIS window, which is what "how you behave now" means. The lifetime average
    // flatters a wallet that was busy in 2021 and has not moved since.
    recentRate: rows.length / (spanDays / 365),
    failShare: out.length ? out.filter(t => t.isError === '1').length / out.length : 0,
    failCount: out.filter(t => t.isError === '1').length,
    gasEth,
    gasRate: gasEth / (spanDays / 365),
    maxValueEth: Math.max(0, ...rows.map(t => Number(t.value || 0) / 1e18)),
    inRatio: rows.length ? (rows.length - out.length) / rows.length : 0,
    deploysHere: rows.filter(t => !t.to || t.to === '' || (t.contractAddress && t.contractAddress !== '')).length,
  };
}

// ⛔ THE WINDOW WAS 100 ROWS AND IT MISSED REAL DEPLOYMENTS. gruff has deployed 8 contracts, all of
// them in 2023, in the middle of a 1,294 row history. The first 100 and the last 100 rows both missed
// every one of them and BUILDER read 0.
// ★ Measured: Etherscan v2 caps a page at 1,000 rows whatever offset you ask for (offset=5000 still
// returns 1,000). So one ascending page plus one descending page covers any wallet up to 2,000 rows
// COMPLETELY, at the same two calls we were already making. Beyond that the deploy count is a lower
// bound and says so.
// ★ THE WHOLE LIFE OF THE WALLET, NOT A WINDOW. gruff's rule and he is right: a 100 row window missed
// all 11 of his contract deployments because every one of them sat in the middle of a 1,294 row
// history. A window can only ever answer questions about its own edges.
//
// ⛔ AND PAGING CANNOT DO IT. Etherscan's txlist stops at 10,000 records total: measured, pranksy and
// the busiest wallet in the population both returned exactly 10,000 rows at page 11 and then nothing.
// So we walk BLOCK RANGES instead, always asking for page 1 and moving `startblock` to the last block
// seen. The 10,000 ceiling never applies, and the call count is identical to paging.
// ⚠️ startblock moves to the last block SEEN, not that block plus one, because a wallet can have
// several transactions in one block. That re-reads the boundary block, so rows are de-duplicated by
// hash. Off by one in the other direction would silently drop transactions.
const PAGE = 1000;
const MAX_CALLS = 40;              // 40,000 transactions, far past anything measured in the population
const isDeploy = t => !t.to || t.to === '' || (t.contractAddress && t.contractAddress !== '');

// ⛔ EVERY RETRY GOES THROUGH THE LIMITER TOO. getJSON retried five times on its own, outside the
// throttle, so a refused call became six unspaced requests and pushed the real rate well past the
// allowance under sixteen workers. That is what made the failures cascade in the first place.
const esGet = async url => {
  for (let t = 0; t < 6; t++) {
    const j = await esThrottle(() => getJSON(url, 'es', 1));
    if (j && Array.isArray(j.result)) return j;
    await sleep(500 * (t + 1));
  }
  return null;
};

async function history(addr) {
  const rows = [];
  const seen = new Set();
  let startblock = 0, complete = false;
  for (let i = 0; i < MAX_CALLS; i++) {
    const url = 'https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=' + addr +
      '&startblock=' + startblock + '&endblock=99999999&page=1&offset=' + PAGE +
      '&sort=asc&apikey=' + KEYS.etherscan;
    const j = await esGet(url);
    // ⛔ A FAILURE PART WAY THROUGH IS NOT A SHORT HISTORY. The first version returned whatever it had
    // collected so far, so a refused page in the middle of a walk was stored as the whole life of the
    // wallet: gruff's deployments read 11, then 8, then 11 again across identical requests, because
    // the tail of his history was sometimes simply missing. Partial is a FAILED read, not a small one.
    if (!j) return { rows: [], complete: false, failed: true };
    if (!Array.isArray(j.result)) return { rows, complete: rows.length > 0 && complete, failed: !rows.length };
    const batch = j.result;
    let added = 0;
    for (const t of batch) { if (!seen.has(t.hash)) { seen.add(t.hash); rows.push(t); added++; } }
    if (batch.length < PAGE) { complete = true; break; }
    const lastBlock = Number(batch[batch.length - 1].blockNumber);
    // ⛔ a single block holding 1,000+ transactions for one address would loop forever otherwise
    if (lastBlock === startblock && added === 0) { complete = true; break; }
    startblock = lastBlock;
  }
  return { rows, complete, failed: false };
}

async function etherscan(addr) {
  if (!KEYS) return {};
  const { rows, complete, failed } = await history(addr);
  if (failed) return { firstTs: null, deploys: null, earlyDeploy: null, win: null, life: null };

  const me = addr.toLowerCase();
  const out = rows.filter(t => (t.from || '').toLowerCase() === me);
  const deployTxs = out.filter(isDeploy);
  const firstTs = rows.length ? Number(rows[0].timeStamp) : null;
  const firstDeployTs = deployTxs.length ? Number(deployTxs[0].timeStamp) : null;
  const deployedAddrs = deployTxs.map(t => (t.contractAddress || '').toLowerCase()).filter(Boolean);

  // ⚠️ The BEHAVIOURAL window stays at the most recent 100 rows even though the whole history is in
  // hand. Rates over a lifetime answer "who were you", and DEGEN is a question about who you are now.
  // ⛔ AND ON A TRUNCATED HISTORY THE TAIL OF THE WALK IS NOT THE RECENT END. The ascending walk stops
  // at the call ceiling, so its last rows are from the MIDDLE of a heavy wallet's life. pranksy came
  // back with "last move 2,439 days ago" while he had traded that week. When the walk was cut short,
  // ask for the recent end directly.
  let win = readWindow(rows.slice(-100).reverse(), addr);
  if (!complete) {
    const tail = await esThrottle(() => getJSON(
      'https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=' + addr +
      '&startblock=0&endblock=99999999&page=1&offset=100&sort=desc&apikey=' + KEYS.etherscan, 'es'));
    if (tail && Array.isArray(tail.result) && tail.result.length) win = readWindow(tail.result, addr);
  }

  return {
    shape: timeShape(rows, addr),
    firstTs,
    rowCount: rows.length,
    historyComplete: complete,
    directDeploys: deployTxs.length,
    deployedAddrs,
    firstDeployTs,
    // deploying early is a different thing from deploying often, and it is the stronger signal
    earlyDeploy: !deployTxs.length ? 0
      : (firstDeployTs && new Date(firstDeployTs * 1000).getUTCFullYear() <= 2021 ? 1 : 0.5),
    // ── lifetime aggregates, now that the whole history is actually here ──────────────────────────
    life: {
      sent: out.length,
      received: rows.length - out.length,
      failCount: out.filter(t => t.isError === '1').length,
      gasEth: out.reduce((a, t) => a + Number(t.gasUsed || 0) * Number(t.gasPrice || 0) / 1e18, 0),
      maxValueEth: rows.length ? Math.max(0, ...rows.map(t => Number(t.value || 0) / 1e18)) : 0,
      // ⚠️ BOTH DIRECTIONS. A vault wallet sends almost nothing and would look empty on outbound
      // volume alone, which is exactly how Adam Weitsman came back a Newbie. What has passed through
      // the wallet is the honest measure, and unlike a floor price it is a fact rather than a guess.
      volumeEth: rows.reduce((a, t) => a + Number(t.value || 0) / 1e18, 0),
    },
    win,
  };
}

// ⛔ THE PIECE COUNT WAS WRONG AND gruff CAUGHT IT ON HIS OWN WALLET. v2 first scaled the total NFT
// count by the COLLECTION spam rate. Measured on that wallet: collections are 33.1% spam but pieces
// are only 22.8% spam, because a spam collection usually contains a single airdropped token. Scaling
// one by the other removed 100 pieces instead of 66.
// ★ The fix needs no estimate at all: every contract row already carries numDistinctTokensOwned, so
// the non-spam pieces are a SUM, not a projection. Measured result 249 against the 248 OpenSea shows.
// The separate getNFTsForOwner call is gone; it was the source of the wrong number.
//
// ★ And openSeaMetadata.floorPrice is already in these same rows (81 of 100 carry one), which buys a
// real portfolio value for WHALE and a holdings list ranked by what things are worth instead of by
// how many copies you hold. Ranking by copies surfaced a 0.0009 ETH floor collection above a 1.7 ETH
// one, which is exactly backwards for the wallets people want to show off.
// ⛔ THIS WAS 6 PAGES AND THE EXTRAPOLATION BUILT ON IT WAS NONSENSE. pranksy holds 3,801
// collections, so 600 of them is a 16% sample, and scaling a heavy-tailed sum of piece counts up from
// 16% returned 153,080 pieces for a wallet holding roughly ten thousand. Page order is not random and
// the first pages carry the deepest holdings, so linear scaling cannot work here at any sample size.
// ⇒ Read far enough to actually count (40 pages covers every wallet measured), and where a wallet is
// still bigger than that, report what was counted rather than inventing the rest.
const MAX_PAGES = 40;              // 4,000 collections
// The one definition of "did we read the whole holding". See the note at its use site.
const walkComplete = pages => pages < MAX_PAGES;

async function fetchContracts(addr) {
  let rows = [], total = null, pages = 0, key = '';
  for (let p = 0; p < MAX_PAGES; p++) {
    const j = await getJSON(alUrl('getContractsForOwner',
      'owner=' + addr + '&pageSize=100' + (key ? '&pageKey=' + key : '')), 'al');
    if (!j || !Array.isArray(j.contracts)) break;
    if (total === null) total = j.totalCount;
    rows = rows.concat(j.contracts);
    pages++;
    if (!j.pageKey || !j.contracts.length) break;
    key = j.pageKey;
  }
  return { rows, total, pages };
}

async function alchemy(addr) {
  if (!KEYS) return {};
  // ⛔ `contractDeployer` IS NOT ALWAYS THERE, AND AN ABSENT FIELD IS NOT A ZERO. Measured on one
  // wallet over four identical calls: the same 139 rows came back every time, but the field was
  // populated on 35 rows in the first call and 123 in the next three. Alchemy fills it from a cache
  // that warms up. Read cold, gruff had 2 deployments; read warm, 7. The same wallet read twice gave
  // BUILDER and then COLLECTOR, which is the one thing a deterministic engine may never do.
  // ⇒ A sparse field means the response was cold, so fetch it again. Warm responses were identical
  // across three runs, so one retry is enough to reach the stable answer.
  // ⚠️ ONE RETRY WAS NOT ENOUGH. Under twelve parallel workers the second request came back cold too
  // on 117 wallets, and the cold answer was then kept as if it were data. Try up to three times with
  // a pause, and keep the densest response seen rather than the last one.
  let { rows, total, pages } = await fetchContracts(addr);
  const density = rs => rs.length ? rs.filter(c => c.contractDeployer).length / rs.length : 1;
  // ⚠️ Alchemy appears to compute this field lazily per owner and it stays warm afterwards, so the
  // waits have to be long enough for that to happen. Measured: 600 ms and 1.2 s were not enough on a
  // cold wallet, while the very next call a few seconds later was warm.
  let cold = false;
  for (let attempt = 0; attempt < 4 && rows.length >= 20 && density(rows) < 0.5; attempt++) {
    cold = true;
    await sleep(1200 * (attempt + 1));
    const again = await fetchContracts(addr);
    if (again.rows.length >= rows.length && density(again.rows) > density(rows)) ({ rows, total, pages } = again);
  }
  // A WALLET THAT HOLDS NOTHING IS NOT A WALLET WE FAILED TO READ. Measured: 772 rows in the
  // reference carried a null collection count, and every one sampled came back from the API with
  // totalCount 0. They hold no NFTs. Reporting that as unknown pushed each of them to the 0.5 default
  // in the middle of the very population they were supposed to define. An answer of zero is an answer.
  if (!rows.length) return total === 0
    ? { colls: 0, nfts: 0, bluePieces: 0, blueColls: 0, nftValue: 0, selfDeployed: [], collsRaw: 0,
        spamRate: 0, collsExact: true, collsGap: 0, pagesRead: 1, deployerKnown: 0, deployerCold: false, names: [] }
    : { colls: null, nfts: null, names: null };
  // ⚠️ Still a floor, not a total: some rows carry no deployer even when warm, and those stay UNKNOWN
  // rather than being counted as "not yours".
  const deployerKnown = rows.filter(c => c.contractDeployer).length;

  const clean = rows.filter(c => !c.isSpam);
  const held = c => Number(c.numDistinctTokensOwned || 0);
  const floor = c => Number(c.openSeaMetadata && c.openSeaMetadata.floorPrice || 0);
  const blue = c => /verified|approved/.test((c.openSeaMetadata && c.openSeaMetadata.safelistRequestStatus) || '');
  // ⛔ DIAGNOSED 2026-08-26. The old rule was `rows.length >= total`, and it cried wolf on 954
  // wallets (19.1%), downgrading each of their piece counts to "at least N".
  // Measured live on 24 flagged wallets spread across the size range: alchemy's own totalCount is
  // systematically HIGHER than the number of rows it will page out. Gap min 1, median 1, max 4, and
  // never as much as 1% of totalCount. NONE of them hit MAX_PAGES — no wallet ever has, out of 5,000.
  // The missing rows are overwhelmingly spam (277 of 282 on one), so they are filtered out anyway.
  // ⇒ There is exactly one way this walk can be incomplete: OUR OWN ceiling. Alchemy ending the walk
  // means alchemy has nothing more to give, and no threshold on its self-disagreement changes that.
  // The discrepancy is kept as `collsGap` rather than thrown away, so it stays checkable.
  // The rule lives in one place so `guard_collsexact.cjs` can break-test it in both directions.
  const seenAll = walkComplete(pages);
  const collsGap = total === null ? null : Math.max(0, total - rows.length);

  const piecesSeen = clean.reduce((a, c) => a + held(c), 0);
  const bluePieces = clean.filter(blue).reduce((a, c) => a + held(c), 0);
  const spamRate = rows.length ? (rows.length - clean.length) / rows.length : 0;

  // ⛔ FLOOR PRICE CANNOT VALUE A WALLET AND THIS IS NOT A TUNING PROBLEM. Measured on gruff's wallet:
  // the rule said 22.82 ETH where OpenSea puts the whole wallet at $1,343, and 21.19 of those 22.82
  // came from two rows. One was KnownOriginDigitalAsset, a SHARED contract holding thousands of
  // unrelated artists behind a single "floor". The other was a piece he minted cheaply and listed at
  // 4.20 ETH himself so that it would never sell, which the floor then read back as its value.
  // Five candidate rules were measured and the strictest still landed 38x high, because both problems
  // survive every filter: the shared contract is verified, and a defensive listing IS the floor.
  // ⇒ The value is not scored and not shown. `nftValue` is kept for diagnostics only.
  const valueSeen = clean.reduce((a, c) => a + floor(c) * held(c), 0);

  // ★ AND THE SIGNAL I WRONGLY THREW AWAY. contractDeployer names the wallet that sent the creating
  // transaction, so it catches collections made THROUGH a factory, which the txlist test cannot see.
  // Measured on pranksy: the txlist test found 1, this finds 8. I had killed this idea after measuring
  // it at 1 in 1,693 on COLLECTOR wallets, which was the right number read the wrong way round: it is
  // rare among collectors, and that is exactly what makes it discriminating.
  // ⚠️ It only sees collections the wallet still HOLDS. A creator who sold everything stays invisible.
  const selfDeployed = clean.concat(rows.filter(c => c.isSpam))
    .filter(c => (c.contractDeployer || '').toLowerCase() === addr.toLowerCase())
    .map(c => (c.address || '').toLowerCase());

  return {
    // ⚠️ COUNTED, NEVER PROJECTED. Every wallet is read to the same ceiling, so a truncated count is
    // a floor for that wallet and the comparison between wallets stays consistent. `collsExact` says
    // which it is and the page prints "at least" when it is a floor.
    colls: clean.length,
    nfts: piecesSeen,
    bluePieces,
    blueColls: clean.filter(blue).length,
    nftValue: valueSeen,
    selfDeployed,
    collsRaw: total, spamRate, collsExact: seenAll, collsGap: collsGap, pagesRead: pages,
    deployerKnown, deployerCold: cold,
    // ⚠️ WHAT you hold, not what it is worth. Ranking by floor times copies put a 0.0009 ETH floor
    // collection above a 1.7 ETH one and then presented the product as a value, which is the number
    // that came out 38x high. This lists the notable collections a wallet is in, ordered by the
    // collection's own floor, and the floor is labelled as the collection's rather than the holder's.
    // Safelisted only, which is also what removes a piece somebody listed against themselves.
    names: clean.filter(c => c.name && blue(c))
      .sort((a, b) => floor(b) - floor(a))
      .slice(0, 12)
      .map(c => ({ name: c.name, held: held(c), floor: floor(c) })),
  };
}

const ethCall = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const resolveName = name => ENS.resolve(name, ethCall);

async function signals(addr, price) {
  addr = addr.toLowerCase();
  const [bal, nonce, code, es, al, tok, ens] = await Promise.all([
    rpc('eth_getBalance', [addr, 'latest']),
    rpc('eth_getTransactionCount', [addr, 'latest']),
    rpc('eth_getCode', [addr, 'latest']),
    etherscan(addr),
    alchemy(addr),
    tokenEth(addr, price),
    // ⚠️ display only. A reverse record is claimed by whoever owns the name and proves nothing.
    ENS.reverse(addr, ethCall).catch(() => null),
  ]);
  const now = Date.now() / 1000;
  const L = es.life;
  const txs = nonce === null ? null : Number(BigInt(nonce));
  const ageDays = es.firstTs ? Math.round((now - es.firstTs) / 86400) : null;
  const eth = bal === null ? null : Number(BigInt(bal)) / 1e18;
  const w = es.win;
  return {
    addr,
    ens,
    eth, txs,
    smart: code === null ? null : code !== '0x',
    ageDays,
    firstTs: es.firstTs,
    idleDays: w && w.lastOutTs ? Math.round((now - w.lastOutTs) / 86400) : null,
    touchedDays: w ? Math.round((now - w.lastTs) / 86400) : null,
    lifeRate: ageDays && ageDays > 30 && txs !== null ? txs / (ageDays / 365) : null,
    recentRate: w ? w.recentRate : null,
    failShare: w ? w.failShare : null,
    gasRate: w ? w.gasRate : null,
    inRatio: w ? w.inRatio : null,
    noOutbound: txs === 0,
    // ── lifetime, from the whole history rather than a window ────────────────────────────────────
    rowCount: es.rowCount === undefined ? null : es.rowCount,
    historyComplete: es.historyComplete === undefined ? null : es.historyComplete,
    sent: L ? L.sent : null,
    received: L ? L.received : null,
    failCount: L ? L.failCount : null,
    gasEth: L ? L.gasEth : null,
    maxValueEth: L ? L.maxValueEth : null,
    volumeEth: L ? L.volumeEth : null,
    // ★ the union of the two, de-duplicated by contract address: a contract created directly and one
    // created through a factory are both things this wallet brought into existence.
    deploys: (es.directDeploys === undefined && !al.selfDeployed) ? null
      : new Set([...(es.deployedAddrs || []), ...(al.selfDeployed || [])]).size ||
        (es.directDeploys || 0),
    directDeploys: es.directDeploys === undefined ? null : es.directDeploys,
    factoryDeploys: al.selfDeployed ? al.selfDeployed.length : null,
    // ⚠️ PERSISTED, because the union is over ADDRESSES and a later pass cannot rebuild it from two
    // counts. Leaving it out is what let a repair pass silently drop eleven direct deployments and
    // leave 42 wallets claiming fewer creations than they had direct ones.
    deployedAddrs: es.deployedAddrs || [],
    heldDeployedAddrs: al.selfDeployed || [],
    earlyDeploy: es.earlyDeploy,
    firstDeployTs: es.firstDeployTs,
    shape: es.shape || null,
    tokenEth: tok,
    whaleEth: eth === null ? null : eth + (tok || 0),
    nfts: al.nfts, colls: al.colls, bluePieces: al.bluePieces, blueColls: al.blueColls,
    nftValue: al.nftValue,                 // ⚠️ diagnostics only, never scored and never shown
    collsRaw: al.collsRaw, spamRate: al.spamRate, collsExact: al.collsExact, collsGap: al.collsGap, pagesRead: al.pagesRead,
    deployerKnown: al.deployerKnown, deployerCold: al.deployerCold,
    names: al.names,
  };
}

// ── population ────────────────────────────────────────────────────────────────────────────────────
// ⚠️ PERCENTILES, NEVER ABSOLUTE THRESHOLDS. "Over 500 transactions is a Degen" puts 90% of real
// visitors under the bar and hands almost everyone the same facet.
const NUMERIC = ['eth', 'whaleEth', 'txs', 'ageDays', 'lifeRate', 'recentRate', 'failShare',
                 'gasRate', 'gasEth', 'maxValueEth', 'volumeEth', 'inRatio', 'idleDays',
                 'nfts', 'colls', 'bluePieces'];

// ⚠️ MIDPOINT PERCENTILE, because several of these signals have a large tie mass at zero. Measured:
// most wallets have zero reverted transactions in their last 100 and 624 of 635 have never deployed.
// A plain "count of values <= mine" hands every one of those tied wallets the whole block of ties,
// so having done nothing scores as having beaten everyone who also did nothing.
const pctAt = (sorted, v) => {
  if (v === null || v === undefined || !sorted || !sorted.length) return null;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
  const less = lo;
  lo = 0; hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; }
  return (less + lo) / (2 * sorted.length);
};
const pct = pctAt;

// ⚠️ THE TIME SHAPE LIVES ONE LEVEL DOWN, in r.shape, so the original version never collected it and
// the six beats built on it had to fall back to hand-set thresholds. Collected here, they can be
// ranked against the population like everything else.
// ⚠️ These keys feed the STORY only. No axis reads them, so adding them cannot move a single facet.
const SHAPE_KEYS = ['peakShare', 'peakYearCount', 'silenceDays', 'streakDays', 'loudShare',
                    'busiestDayCount', 'topGwei', 'distinctContacts', 'yearsActive'];

function buildPop(rows) {
  const pop = {};
  NUMERIC.forEach(k => { pop[k] = rows.map(r => r[k]).filter(v => v !== null && v !== undefined).sort((a, b) => a - b); });
  SHAPE_KEYS.forEach(k => {
    pop[k] = rows.map(r => r.shape && r.shape[k]).filter(v => v !== null && v !== undefined && isFinite(v))
      .sort((a, b) => a - b);
  });
  return pop;
}

// ── the seven axes ────────────────────────────────────────────────────────────────────────────────
// A missing signal contributes its weight at the population midpoint (0.5) rather than at zero, so an
// API failure cannot silently push someone toward Newbie or Ghost.
function axes(s, pop) {
  const P = {};
  // ⛔ NOTHING HAPPENED IS NOT THE SAME AS NOTHING WAS READ. gruff, 2026-08-26: he typed a brand new
  // empty wallet and it came back NEWBIE 73 with DEGEN 46 and OG 53, over a report that said "0
  // transactions sent, ever" and "0 ETH burned on gas, and not one reverted transaction".
  // The cause is the line below: a null percentile falls back to 0.5, the population MIDDLE. For a
  // wallet with no history at all, recentRate / failShare / gasRate / inRatio are null because there
  // was nothing to compute them from, so the wallet was being scored as an AVERAGELY active wallet on
  // every axis built out of activity. DEGEN is 0.40 recentRate + 0.20 failShare + 0.20 gasRate, so
  // three quarters of it came out of thin air.
  // ⇒ A wallet that has never transacted has a transaction rate of ZERO, a failure share of ZERO and
  // a gas rate of ZERO. Those are facts, not gaps, so they are scored at the bottom rather than the
  // middle. Measured blast radius: 104 wallets of 5,000 (2.1%), and it only moves wallets that were
  // being scored on numbers nobody measured.
  // ⚠️ The 0.5 fallback STAYS for everything else, because a genuinely failed read is a different
  // thing and `gaps` is what says so.
  const noHistory = !s.rowCount;
  const ZERO_WHEN_EMPTY = ['recentRate', 'lifeRate', 'failShare', 'gasRate', 'inRatio'];
  NUMERIC.forEach(k => {
    let raw = s[k];
    if (noHistory && raw == null && ZERO_WHEN_EMPTY.indexOf(k) >= 0) raw = 0;
    const v = pct(pop[k], raw);
    P[k] = v === null ? 0.5 : v;
  });
  const era = (() => {
    if (!s.firstTs) return 0.5;
    const y = new Date(s.firstTs * 1000).getUTCFullYear();
    return y <= 2017 ? 1 : y <= 2019 ? 0.75 : y === 2020 ? 0.5 : y === 2021 ? 0.25 : 0;
  })();
  const stillHere = s.idleDays === null ? 0.5 : s.idleDays <= 180 ? 1 : s.idleDays <= 365 ? 0.5 : 0;
  const breadth = (s.colls && s.nfts) ? Math.min(1, s.colls / Math.max(1, s.nfts) * 2) : 0.5;
  // DIRECT DEPLOYMENTS ONLY, decided 2026-08-17 after the count refused to hold still. The factory
  // half came from Alchemy's contractDeployer, which is served from a cache and flapped in BOTH
  // directions: the same wallet returned 14, 14, 12, 12 across four identical reads. A number that
  // changes between two readings of one wallet is worse than one that is knowingly partial. This half
  // we compute ourselves by walking the entire history, and it held across every test.
  const deployCount = (s.directDeploys === null || s.directDeploys === undefined) ? 0 : s.directDeploys;
  // ⚠️ Derived here rather than trusted from the stored flag. Adam Weitsman's nonce is 1 but his
  // whole history contains ZERO outbound normal transactions, so `txs === 0` said he had spoken when
  // he never has, and the Ghost line came out blank on the purest Ghost in the set.
  const silent = s.sent === 0 || s.txs === 0;

  return {
    OG:        0.55 * P.ageDays + 0.20 * era + 0.25 * stillHere,
    // ⛔ NEWBIE USED TO BE YOUNG PLUS QUIET AND NOTHING ELSE, AND IT CALLED A MEGA COLLECTOR A NEWBIE.
    // Adam Weitsman's vault is 259 days old and has sent exactly ONE transaction in its life, so both
    // terms pinned at maximum and he scored 98. He also holds 4,000 pieces. In an additive score a
    // single term can carry the whole facet, which is wrong here: Newbie means young AND small, an
    // AND that a sum cannot express. The geometric mean makes both factors necessary, so holding a
    // collection at all collapses it however new the wallet is. The tagline was always the test:
    // the story has not just begun if you hold four thousand pieces.
    NEWBIE:    Math.sqrt(Math.max(0, 1 - P.ageDays) *
                 Math.max(0, 0.45 * (1 - P.txs) + 0.40 * (1 - P.nfts) + 0.15 * (1 - P.whaleEth))),
    DEGEN:     0.40 * P.recentRate + 0.20 * P.failShare + 0.20 * P.gasRate + 0.20 * P.txs,
    // ⛔ THE SMART-ACCOUNT TERM IS GONE. It paid 0.20 of this facet for using an ERC-4337 or 7702
    // wallet, which is a wallet choice, not evidence of having built anything. Measured earlier at
    // 18% of a holder list, all of them ordinary people.
    // ⚠️ THE SCALE IS 30, NOT 3. Measured over 5,000 wallets: of the 239 that ever created a
    // contract the median created 2, p90 created 10, the top created 354. A ceiling of three meant
    // anyone who had ever shipped anything maxed the axis instantly and BUILDER beat every other
    // facet they had. gruff's rule: Builder should win only when the builder side really does
    // outweigh the rest.
    BUILDER:   Math.min(1, 0.70 * Math.min(1, deployCount / 30) +
                           0.30 * (s.earlyDeploy == null ? 0 : s.earlyDeploy)),
    // ⚠️ NO ESTIMATED VALUATION IN HERE, ON PURPOSE. Every term is a fact the chain or the marketplace
    // states outright: what has passed through the wallet, what is liquid in it now, the largest
    // single move it has ever made, and how many pieces it holds in collections OpenSea has actually
    // safelisted. The floor-price valuation that used to sit here was measured at 38x reality.
    WHALE:     0.35 * P.volumeEth + 0.25 * P.whaleEth + 0.25 * P.maxValueEth + 0.15 * P.bluePieces,
    COLLECTOR: 0.50 * P.colls + 0.30 * P.nfts + 0.20 * breadth,
    // ⚠️ NOT dormancy alone. Anyone filling in this page is by definition awake, so "asleep" can never
    // fire on a live visitor. Ghost is someone who HOLDS and leaves no trace.
    GHOST:     0.35 * P.idleDays + 0.30 * (P.nfts * (1 - P.recentRate)) + 0.20 * P.inRatio +
               0.15 * (silent ? 1 : 0),
  };
}

// ── calibration B: equalise the ceilings, invent nothing ──────────────────────────────────────────
// ⛔ Percentile ranking and z scoring were both measured and both manufacture Builders out of wallets
// that merely transact often, because the BUILDER axis has a narrow spread. See ENGINE_V2_SPEC.md.
// ⛔ AND IT IS NOT CLAMPED AT 1. Clamping was the first version and it destroyed the ordering for
// exactly the wallets most likely to be shared: pranksy came back with COLLECTOR, OG and WHALE all at
// a flat 1.000 and a dominant facet picked arbitrarily between three ties. The ranking runs on the
// uncapped ratio; only the BAR is capped, in `bars`.
const calibrate = (raw, ceil) => Object.fromEntries(
  FACETS.map(f => [f, raw[f] / (ceil[f] || 1)]));

function profile(s, base) {
  const raw = axes(s, base.pop);
  const cal = calibrate(raw, base.ceil);
  const ordered = FACETS.slice().sort((a, b) => cal[b] - cal[a]);
  const sum = FACETS.reduce((a, f) => a + cal[f], 0) || 1;
  const top = cal[ordered[0]] || 1;
  const dist = Math.sqrt(FACETS.reduce((a, f) => a + Math.pow(cal[f] - base.centroid[f], 2), 0));
  const fx = facts(s);
  return {
    addr: s.addr,
    dominant: ordered[0],
    runnerUp: ordered[1],
    margin: cal[ordered[0]] - cal[ordered[1]],
    axes: cal,
    bars: Object.fromEntries(FACETS.map(f => [f, Math.min(1, Math.max(0, cal[f]))])),
    share: Object.fromEntries(FACETS.map(f => [f, cal[f] / sum])),
    ordered,
    spread: sum / top,                                  // "you are X of 7"
    rarity: base.dists ? pct(base.dists, dist) : null,  // "rarer than N% of the wallets read"
    distance: dist,
    facts: fx,
    // ⛔ 1 wallet of 5,000 (0x8ef5751d…, DEGEN) has no fact line for its OWN dominant facet, because
    // its Etherscan read came back empty. Anything that leads with the facet word then had a hole
    // underneath it. A card may not have a blank where its explanation goes, so say what happened.
    // The story layer's own rule: when a wallet does not have a beat, the absence is the line.
    dominantFact: fx[ordered[0]] || 'we could not read enough of this wallet to explain it.',
    // A FAILED READ HAS TO BE VISIBLE, NOT QUIETLY AVERAGED. Every missing percentile defaults to the
    // population midpoint, which produces a confident looking profile out of nothing. The page shows
    // this list so a wallet we could not read says so instead of pretending.
    gaps: [
      s.rowCount == null ? 'transaction history' : null,
      s.nfts == null ? 'collections' : null,
      s.eth == null ? 'balance' : null,
      s.historyComplete === false ? 'history truncated at the call ceiling' : null,
      // ⚠️ a wallet with no history is not an error, but a reading of one is thin and has to say so
      !s.rowCount ? 'this wallet has never sent or received a transaction' : null,
    ].filter(Boolean),
  };
}

// ── the facts, one per axis: a plain sentence with a number in it ─────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                'September', 'October', 'November', 'December'];
// ⚠️ ALWAYS 'en-US'. This machine's default locale renders 1757 as "1.757", and the card copy is
// English. A number that reads as one point seven five seven is worse than no number.
const num = v => Number(v).toLocaleString('en-US');
function facts(s) {
  const d = s.firstTs ? new Date(s.firstTs * 1000) : null;
  const has = v => v !== null && v !== undefined;
  return {
    OG: d ? 'first move: ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : null,
    NEWBIE: has(s.ageDays) ? 'your chain is ' + num(s.ageDays) + ' days old'
      : has(s.txs) ? num(s.txs) + (s.txs === 1 ? ' transaction sent, ever' : ' transactions sent, ever')
      : null,
    // now a lifetime number, not a window: every reverted transaction the wallet has ever sent
    DEGEN: !has(s.failCount) ? null : s.failCount === 0
      ? (has(s.gasEth) ? num(s.gasEth.toFixed(2)) + ' ETH burned on gas, and not one reverted transaction' : null)
      : s.failCount + (s.failCount === 1 ? ' transaction' : ' transactions') + ' reverted. you paid for nothing ' +
        s.failCount + (s.failCount === 1 ? ' time.' : ' times.'),
    // ⚠️ "deployed" is precise on purpose. A collection created through Manifold, Zora or OpenSea's
    // shared storefront is deployed by the factory, and one lazy minted on a shared storefront
    // deploys nothing at all, so OpenSea can show a Created tab where the chain shows no contract.
    BUILDER: !has(s.directDeploys) ? null : s.directDeploys === 0
      ? 'no contract has ever been created from this wallet'
      : s.directDeploys + (s.directDeploys === 1 ? ' contract' : ' contracts') + ' created from this wallet' +
        (s.firstDeployTs ? ', the first in ' + new Date(s.firstDeployTs * 1000).getUTCFullYear() : ''),
    // ⚠️ A fact that contradicts its own bar costs more trust than a missing one, so this falls
    // through. Every option is a stated fact, never an estimated valuation.
    // ⚠️ A vault wallet moves almost no ETH because it is fed by transfers, so the holdings line has
    // to win before the liquid line, or Adam Weitsman is told he has 0.08 ETH and nothing else.
    WHALE: has(s.bluePieces) && s.bluePieces >= 50 ? num(s.bluePieces) + ' pieces in verified collections'
      : has(s.volumeEth) && s.volumeEth >= 1 ? num(s.volumeEth.toFixed(1)) + ' ETH has moved through this wallet'
      : has(s.whaleEth) && s.whaleEth >= 0.05 ? num(s.whaleEth.toFixed(2)) + ' ETH liquid in this wallet'
      : has(s.bluePieces) && s.bluePieces > 0 ? num(s.bluePieces) + ' pieces in verified collections'
      : has(s.maxValueEth) && s.maxValueEth >= 0.01 ? 'largest move ever: ' + s.maxValueEth.toFixed(2) + ' ETH'
      : null,
    COLLECTOR: (has(s.colls) && has(s.nfts))
      ? num(s.colls) + ' collections, ' + num(s.nfts) + ' pieces' : null,
    GHOST: (s.sent === 0 || s.txs === 0) ? 'you have never sent a transaction'
      : !has(s.idleDays) ? null
      : s.idleDays === 0 ? 'you moved today' : 'last move ' + num(s.idleDays) + ' days ago',
  };
}

// ⚠️ EXPORTED SO THE SITE RUNS THE SAME CODE THE CALIBRATION RAN ON. A second scoring implementation
// living in the server is exactly how a one rule, two copies bug happens.
module.exports = { FACETS, signals, axes, calibrate, profile, facts, buildPop, pct, ethUsd, TOKENS, walkComplete, MAX_PAGES, SHAPE_KEYS,
                   resolveName, ethCall };

if (require.main !== module) return;

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
const loadBaseline = () => JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

function makeBaseline(allRows) {
  // THE REFERENCE MUST BE MADE OF WALLETS THAT CAN DEFINE SOMETHING. Two groups cannot:
  //   - the ones a leg failed on, which are scored on 0.5 defaults and then sit in the middle of the
  //     distribution they are supposed to shape;
  //   - the ones that are not people. Binance 14 is in this sample with 17.8 million transactions and
  //     218,997 ETH, and it owned 38 of the top 50 by transaction count. A real whale compared against
  //     an exchange hot wallet reads as a minnow.
  // Contract code is NOT the test: 8% of this population are ordinary people on smart wallets.
  const robot = r => (r.txs || 0) > 100000 || (r.maxValueEth || 0) > 10000 || (r.whaleEth || 0) > 5000;
  const unread = r => r.rowCount == null || r.nfts == null;
  const rows = allRows.filter(r => !robot(r) && !unread(r));
  console.log('  reference: ' + rows.length + ' usable of ' + allRows.length +
    '  (dropped ' + allRows.filter(unread).length + ' unreadable, ' +
    allRows.filter(r => robot(r) && !unread(r)).length + ' non human)');
  const pop = buildPop(rows);
  const raws = rows.map(r => axes(r, pop));
  // ⚠️ A ZERO-INFLATED AXIS CANNOT TAKE ITS CEILING FROM THE WHOLE POPULATION. 95% of wallets score
  // zero on BUILDER, so the 99th percentile of everyone lands on a wallet with two deployments, and
  // dividing by that hands every genuine builder 120 to 150 and lets BUILDER beat facets that are
  // genuinely stronger. The ceiling has to mean "what a strong example of this looks like", so for a
  // sparse axis it is taken from the wallets that have the quality at all.
  const SPARSE = { BUILDER: 0.90 };
  const ceil = {};
  FACETS.forEach(f => {
    const all = raws.map(x => x[f]).sort((x, y) => x - y);
    if (SPARSE[f]) {
      const held = all.filter(v => v > 0.05);
      ceil[f] = held.length >= 20 ? held[Math.floor(SPARSE[f] * (held.length - 1))]
        : all[Math.floor(0.99 * (all.length - 1))] || 1;
    } else {
      ceil[f] = all[Math.floor(0.99 * (all.length - 1))] || 1;
    }
  });
  const cals = raws.map(r => calibrate(r, ceil));
  const centroid = Object.fromEntries(FACETS.map(f => [f, cals.reduce((a, c) => a + c[f], 0) / cals.length]));
  const dists = cals.map(c => Math.sqrt(FACETS.reduce((a, f) => a + Math.pow(c[f] - centroid[f], 2), 0)))
    .sort((a, b) => a - b);
  return { n: rows.length, built: new Date().toISOString(), pop, ceil, centroid, dists };
}

(async () => {
  const cmd = process.argv[2];

  if (cmd === 'baseline') {
    const csv = process.argv[3];
    if (!csv) { console.error('give a csv of addresses'); process.exit(1); }
    const addrs = fs.readFileSync(csv, 'utf8').trim().split(/\r?\n/)
      .map(l => l.split(',')[0].trim().toLowerCase()).filter(a => /^0x[0-9a-f]{40}$/.test(a));
    let cache = {};
    if (fs.existsSync(SIGNALS) && !process.argv.includes('--refresh')) cache = JSON.parse(fs.readFileSync(SIGNALS, 'utf8'));
    const todo = addrs.filter(a => !cache[a]);
    const price = await ethUsd();
    console.log(addrs.length + ' wallets, ' + todo.length + ' to fetch, eth price ' + (price ? '$' + price.toFixed(0) : 'UNKNOWN'));
    const t0 = Date.now();
    // ⚠️ Etherscan is the bottleneck and its limiter now spaces call starts rather than chaining on
    // completion, so this concurrency is what actually fills the 4.3 per second allowance. A heavy
    // wallet needs up to 40 sequential calls of its own, so keep enough wallets in flight that the
    // limiter never goes idle waiting for one of them.
    // ⛔ THIS WAS A BATCH BARRIER AND IT WASTED MOST OF THE ALLOWANCE. Firing 12 wallets and awaiting
    // all 12 means one heavy wallet needing 40 sequential pages holds the other 11 slots empty for a
    // minute and a half. A worker pool keeps exactly CONC wallets in flight at all times, so the rate
    // limiter never sits idle waiting for a straggler.
    // ⚠️ 16 was too many once every retry started going through the limiter as well: the queue grew
    // faster than 4.3 per second could drain it and wallets began timing out mid-walk.
    const CONC = 10;
    let next = 0, done = 0;
    const worker = async () => {
      while (next < todo.length) {
        const a = todo[next++];
        const s = await signals(a, price).catch(() => null);
        // ★ A DEPLOYMENT CAN ONLY EVER BE DISCOVERED, NEVER UNDISCOVERED. An absent contractDeployer
        // means unknown, so a later read that finds more is new information rather than a change,
        // and a read that finds fewer is a colder cache rather than a smaller wallet. Keep the best
        // evidence seen for this address instead of the most recent.
        if (s) {
          const old = cache[s.addr];
          if (old && Array.isArray(old.heldDeployedAddrs)) {
            const united = new Set([...(s.deployedAddrs || []), ...(s.heldDeployedAddrs || []),
                                    ...(old.heldDeployedAddrs || []), ...(old.deployedAddrs || [])]);
            if (united.size > (s.deploys || 0)) {
              s.heldDeployedAddrs = [...new Set([...(s.heldDeployedAddrs || []), ...(old.heldDeployedAddrs || [])])];
              s.factoryDeploys = s.heldDeployedAddrs.length;
              s.deploys = united.size;
            }
          }
          cache[s.addr] = s;
        }
        done++;
        const eta = Math.round((Date.now() - t0) / done * (todo.length - done) / 1000);
        process.stdout.write('\r  ' + done + '/' + todo.length + '   ~' + eta + 's left   ');
        if (done % 100 === 0) fs.writeFileSync(SIGNALS, JSON.stringify(cache));
      }
    };
    await Promise.all(Array.from({ length: CONC }, worker));
    fs.writeFileSync(SIGNALS, JSON.stringify(cache));
    console.log('\nfetched in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's   calls ' + JSON.stringify(calls));
    const rows = addrs.map(a => cache[a]).filter(Boolean);
    fs.writeFileSync(BASELINE, JSON.stringify(makeBaseline(rows)));
    console.log('baseline_v2.json written from ' + rows.length + ' wallets');
    return;
  }

  // ── repair the Alchemy leg only ───────────────────────────────────────────────────────────────
  // The 5,000 wallet population was collected before the cold-cache retry existed, so an unknown
  // number of rows recorded a deployer count that was simply not populated yet. Re-reading only the
  // collections call costs no Etherscan quota at all, which is the scarce one.
  if (cmd === 'repair') {
    const cache = JSON.parse(fs.readFileSync(SIGNALS, 'utf8'));
    const addrs = Object.keys(cache);
    console.log('repairing the collections leg for ' + addrs.length + ' wallets, Alchemy only');
    const t0 = Date.now();
    let next = 0, done = 0, changed = 0, colds = 0;
    const worker = async () => {
      while (next < addrs.length) {
        const a = addrs[next++];
        const al = await alchemy(a).catch(() => null);
        done++;
        if (al && al.colls !== null && al.colls !== undefined) {
          const before = cache[a].deploys;
          if (al.deployerCold) colds++;
          const united = new Set([...(cache[a].deployedAddrs || []), ...(al.selfDeployed || [])]);
          Object.assign(cache[a], {
            nfts: al.nfts, colls: al.colls, bluePieces: al.bluePieces, blueColls: al.blueColls,
            nftValue: al.nftValue, collsRaw: al.collsRaw, spamRate: al.spamRate,
            collsExact: al.collsExact, collsGap: al.collsGap, pagesRead: al.pagesRead, names: al.names,
            factoryDeploys: al.selfDeployed ? al.selfDeployed.length : null,
            deployerKnown: al.deployerKnown, deployerCold: al.deployerCold,
            deploys: united.size || cache[a].directDeploys || 0,
          });
          if (cache[a].deploys !== before) changed++;
        }
        const eta = Math.round((Date.now() - t0) / done * (addrs.length - done) / 1000);
        process.stdout.write('\r  ' + done + '/' + addrs.length + '   ~' + eta + 's left   changed ' + changed + '   ');
        if (done % 200 === 0) fs.writeFileSync(SIGNALS, JSON.stringify(cache));
      }
    };
    await Promise.all(Array.from({ length: 12 }, worker));
    fs.writeFileSync(SIGNALS, JSON.stringify(cache));
    const rows = addrs.map(a => cache[a]).filter(Boolean);
    fs.writeFileSync(BASELINE, JSON.stringify(makeBaseline(rows)));
    console.log('\ndeploy count changed on ' + changed + ' wallets, ' + colds +
      ' needed a second request   calls ' + JSON.stringify(calls));
    console.log('baseline rebuilt from ' + rows.length + ' wallets');
    return;
  }

  if (cmd === 'report') {
    const base = loadBaseline();
    const rows = Object.values(JSON.parse(fs.readFileSync(SIGNALS, 'utf8')));
    const win = {}, margins = [], spreads = [];
    FACETS.forEach(f => win[f] = 0);
    rows.forEach(r => { const p = profile(r, base); win[p.dominant]++; margins.push(p.margin); spreads.push(p.spread); });
    console.log('\n-- dominant facet over ' + rows.length + ' wallets --');
    FACETS.forEach(f => console.log('  ' + f.padEnd(10) + String(win[f]).padStart(4) + '  %' +
      (100 * win[f] / rows.length).toFixed(1).padStart(5) + '  ' + '#'.repeat(Math.round(60 * win[f] / rows.length))));
    const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(p * (a.length - 1))];
    console.log('\n  margin   p10 ' + q(margins, .1).toFixed(3) + '  median ' + q(margins, .5).toFixed(3) + '  p90 ' + q(margins, .9).toFixed(3));
    console.log('  spread   min ' + q(spreads, 0).toFixed(2) + '  median ' + q(spreads, .5).toFixed(2) + '  max ' + q(spreads, 1).toFixed(2));
    const uniq = new Set(rows.map(r => (100 * profile(r, base).rarity).toFixed(1)));
    console.log('  distinct rarity values at 0.1%: ' + uniq.size + ' of ' + rows.length);
    return;
  }

  if (cmd === 'read') {
    let a = process.argv[3];
    if (!a) { console.error('give an address'); process.exit(1); }
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
      const r = await resolveName(a);
      if (!r) { console.error('could not resolve ' + a); process.exit(1); }
      console.log('  ' + a + ' -> ' + r);
      a = r;
    }
    const base = loadBaseline();
    const price = await ethUsd();
    const s = await signals(a, price);
    const p = profile(s, base);
    console.log('\n  ' + p.addr + (s.ens ? '   ' + s.ens : ''));
    console.log('  history ' + (s.rowCount === null ? '?' : s.rowCount.toLocaleString('en-US')) +
      ' transactions' + (s.historyComplete === false ? ' (TRUNCATED)' : '') +
      ', ' + (s.pagesRead || 0) + ' collection page(s)');
    console.log('  DOMINANT  ' + p.dominant + '   (runner up ' + p.runnerUp + ', margin ' + p.margin.toFixed(3) + ')');
    console.log('  rarer than %' + (100 * p.rarity).toFixed(2) + ' of the wallets read');
    console.log('  you are ' + p.spread.toFixed(1) + ' of 7 facets\n');
    p.ordered.forEach(f => console.log('  ' + f.padEnd(10) + (100 * p.axes[f]).toFixed(0).padStart(4) + '  ' +
      '#'.repeat(Math.round(40 * p.bars[f])).padEnd(41) + (p.facts[f] || '')));
    console.log('\n  calls ' + JSON.stringify(calls));
    if (s.names && s.names.length) {
      console.log('\n  top holdings by floor value');
      s.names.slice(0, 8).forEach(n => console.log('    ' + n.value.toFixed(2).padStart(8) + ' ETH  ' +
        String(n.held + 'x').padStart(5) + '  ' + n.name));
    }
    if (s.collsExact === false) console.log('\n  ⚠️ only ' + (s.pagesRead * 100) + ' of ' + s.collsRaw +
      ' collections inspected, piece count and value are scaled from that share');
    return;
  }

  console.error('usage: baseline <csv> | read <0xaddr> | report');
  process.exit(1);
})().catch(e => { console.error('\nFAILED: ' + e.message); process.exit(1); });
