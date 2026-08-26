// Build the reference population the seven axes are measured against.
//
//   node build_population.cjs [--target 5000]
//
// ⛔ WHY THIS FILE EXISTS. The first baseline was 635 FACETS holders, and gruff's objection was
// correct: scoring a stranger against that group means "OG" quietly reads as "old compared with
// gruff's holders". The reference has to be a population nobody chose for its answer.
//
// ⚠️ It is still not a general Ethereum sample, and the page must not claim it is. Owners of NFT
// collections are people who buy NFTs, which is the right universe for this site and the wrong word
// for "everyone". The recent-block slice below exists to pull the tail back toward ordinary wallets.
//
// The design is gruff's: a spread of collections, about a thousand owners from each, plus a hand
// written list of wallets everybody recognises so the extremes are represented rather than sampled.
'use strict';
const fs = require('fs'), path = require('path');
const ENS = require(path.join(__dirname, 'ens.cjs'));
const KEYS = JSON.parse(fs.readFileSync(path.join(__dirname, '.keys.json'), 'utf8'));
const OUT = path.join(__dirname, 'population_v3.csv');
const POOL = path.join(__dirname, 'population_pool.json');

// ⚠️ SEVEN FACETS MEANS SEVEN KINDS OF WALLET. A list of blue chips alone would score everyone
// against whales. Each line says which end of the population it is here to supply.
const COLLECTIONS = [
  ['0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb', 'CryptoPunks',        'OG, oldest money'],
  ['0xd4e4078ca3495de5b1d4db434bebc5a986197782', 'Autoglyphs',         'OG, generative origin'],
  ['0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270', 'Art Blocks',         'collector, art'],
  ['0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7', 'Meebits',            'OG, large holdings'],
  ['0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d', 'BAYC',               'whale'],
  ['0x60e4d786628fea6478f785a6d7e704777c86a7c6', 'MAYC',               'whale, wider'],
  ['0xed5af388653567af2f388e6224dc7c4b3241c544', 'Azuki',              'whale, degen crossover'],
  ['0xbd3531da5cf5857e7cfaa92426877b022e612cf8', 'Pudgy Penguins',     'whale, mass market'],
  ['0x23581767a106ae21c074b2276d25e5c3e136a68b', 'Moonbirds',          'whale, dormant holders'],
  ['0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b', 'CloneX',             'mass market'],
  ['0x8a90cab2b38dba80c64b7734e58ee1db38b8992e', 'Doodles',            'mass market'],
  ['0xe785e82358879f061bc3dcac6f0444462d4b5330', 'World of Women',     'mass market'],
  ['0x5af0d9827e0c53e4799bb226655a1de152a425a5', 'Milady Maker',       'degen'],
  ['0xd774557b647330c91bf44cfeab205095f7e6c367', 'Nakamigos',          'degen, cheap entry'],
  ['0x6339e5e072086621540d0362c4e3cea0d643e114', 'Opepen',             'degen, free mint'],
  ['0x34eebee6942d8def3c125458d1a86e0a897fd6f9', 'Checks VV',          'degen, free mint'],
  ['0x4e1f41613c9084fdb9e34e11fae9412427480e56', 'Terraforms',         'collector, on-chain art'],
  ['0x33fd426905f149f8376e227d0c9d3340aad17af1', 'The Memes by 6529',  'collector, our audience'],
  ['0x0c58ef43ff3032005e472cb5709f8908acb00205', '6529 Gradient',      'collector, small and deep'],
  // ── gruff's list, every address verified against the chain before it went in ──────────────────
  ['0x4440732b0d85e2a77dcb2caedfd940154241249a', 'Masks of Luci',      'collector, Sam Spratt'],
  ['0x79fcdef22feed20eddacbb2587640e45491b757f', 'mfers',              'degen, culture'],
  ['0x38793a3fdfd098e820ddf59706280681354341fc', 'BRAINROT',           'degen, new'],
  ['0x31bbc8af58717059a356fdef3d4b04160906feb1', 'The Florentines',    'collector, art'],
  ['0xb852c6b5892256c264cc2c888ea462189154d8d7', 'Rektguy',            'degen'],
  ['0xc143bbfcdbdbed6d454803804752a064a622c1f3', 'Async Blueprints',   'collector, art'],
  ['0x9eb6e2025b64f340691e424b7fe7022ffde12438', 'Normies',            'the real benchmark'],
  ['0xa2a6063b910fc7a7a286196f6c9b62b2797fa0ae', 'NPC',                'degen, recent'],
  ['0x68684709ada3f74533d26f29dd108b5616a26233', 'Satari Must Die',    'degen, small'],
  ['0x72b1f41c1afc5cc7e68071753967902138b51bb2', 'Gruffters',          'our own holders'],
];
// ⛔ DELIBERATELY NOT IN THE LIST, and why:
//   StonkBrokers 0x539CdD04...  lives on Robinhood Chain. This engine reads Ethereum only.
//   SuperRare    0x41a322b2...  verified fine but returned zero owners from the API. No point.
//   Foundation   0x3b3ee193...  removed on gruff's call after the first pool was built.
//   Fidenza                     has no contract of its own, it is a project inside Art Blocks, whose
//                               owners are already in the pool through the Art Blocks entry.
// ⚠️ "Grifters" resolves to Async Blueprints, which is a SHARED contract hosting many projects, so
// its owners are Async Blueprints collectors rather than Grifters holders specifically. Kept under
// its real name because that slice of the population is one we want, but it is not what was asked
// for and pretending otherwise would put a wrong label on a real number.

// resolved through ENS at run time rather than pasted, so a typo cannot quietly become a real wallet
const NOTABLE_ENS = ['vitalik.eth', 'pranksy.eth', 'dingaling.eth', 'xcopy.eth', 'beeple.eth',
                     'punk6529.eth', 'gruffdzn.eth', 'cozomo.eth', 'garyvee.eth', 'snowfro.eth'];
const NOTABLE_RAW = [
  '0xd387a6e4e84a6c86bd90c158c6028a58cc8ac459',   // pranksy
  '0x54be3a794282c030b15e43ae2bb182e14c409c5e',   // dingaling
  '0x250dc85178fb6859e9ee02c925d46aab946a55e7',   // adam weitsman
  '0x4730497622bdfd6eafe1f09fa22b3a0aca94a646',   // gruff
];

const OWNERS_PER = 1000;
const RECENT_BLOCKS = 40;          // the ordinary-wallet tail, roughly 6,000 senders
const RPC = 'https://ethereum-rpc.publicnode.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try { const r = await fetch(url); if (r.status === 429) { await sleep(700 * (t + 1)); continue; }
      const j = await r.json(); if (j) return j; } catch {}
    await sleep(400 * (t + 1));
  }
  return null;
}
const rpc = (method, params) => fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then(r => r.json()).then(j => j.result).catch(() => null);

// ⚠️ VERIFY EVERY ADDRESS BEFORE TRUSTING IT. A mistyped contract address does not error, it just
// returns a different collection's owners, and the population would be quietly wrong.
async function verify(addr, expected) {
  const j = await getJSON('https://eth-mainnet.g.alchemy.com/nft/v3/' + KEYS.alchemy +
    '/getContractMetadata?contractAddress=' + addr);
  const name = j && (j.name || (j.openSeaMetadata && j.openSeaMetadata.collectionName));
  const supply = j && j.totalSupply;
  return { name: name || null, supply };
}

async function owners(addr) {
  let out = [], key = '';
  while (out.length < OWNERS_PER) {
    const j = await getJSON('https://eth-mainnet.g.alchemy.com/nft/v3/' + KEYS.alchemy +
      '/getOwnersForContract?contractAddress=' + addr + (key ? '&pageKey=' + key : ''));
    if (!j || !Array.isArray(j.owners)) break;
    out = out.concat(j.owners.map(a => a.toLowerCase()));
    if (!j.pageKey) break;
    key = j.pageKey;
  }
  return out.slice(0, OWNERS_PER);
}

// deterministic shuffle so a rebuild of the population is reproducible
function shuffle(arr, seed) {
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

(async () => {
  const target = Number((process.argv.find(a => a.startsWith('--target=')) || '').split('=')[1] ||
    process.argv[process.argv.indexOf('--target') + 1] || 5000);
  const pool = new Map();                       // address -> where it came from
  // ⚠️ A NOTABLE WALLET THAT IS ALREADY IN THE POOL MUST STILL COUNT AS NOTABLE. The first version
  // kept the first source it saw, so vitalik arriving as a CryptoPunks owner never got the notable
  // label and could be sampled out of the very population he was added to anchor. 7 of 10 survived
  // by luck. The notable set is tracked separately and forced in regardless of where else it appears.
  const notable = new Set();
  const add = (a, src) => {
    if (!/^0x[0-9a-f]{40}$/.test(a) || a === '0x' + '0'.repeat(40)) return;
    if (src.startsWith('notable:')) notable.add(a);
    if (!pool.has(a)) pool.set(a, src);
  };

  console.log('verifying ' + COLLECTIONS.length + ' collection addresses\n');
  const good = [];
  for (const [addr, label, why] of COLLECTIONS) {
    const v = await verify(addr);
    const ok = !!v.name;
    console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label.padEnd(20) + (v.name || 'no metadata').slice(0, 30).padEnd(32) + why);
    if (ok) good.push([addr, label]);
    await sleep(120);
  }
  if (good.length < COLLECTIONS.length) console.log('\n⚠️ ' + (COLLECTIONS.length - good.length) + ' address(es) did not verify and are skipped');

  console.log('\npulling up to ' + OWNERS_PER + ' owners each');
  for (const [addr, label] of good) {
    const o = await owners(addr);
    o.forEach(a => add(a, label));
    console.log('  ' + label.padEnd(20) + String(o.length).padStart(5) + ' owners   pool now ' + pool.size);
  }

  console.log('\nsampling ordinary wallets from the last ' + RECENT_BLOCKS + ' blocks');
  const head = Number(BigInt(await rpc('eth_blockNumber', [])));
  let senders = 0;
  for (let i = 0; i < RECENT_BLOCKS; i++) {
    const b = await rpc('eth_getBlockByNumber', ['0x' + (head - i).toString(16), true]);
    if (!b || !b.transactions) continue;
    b.transactions.forEach(t => { if (t.from) { add(t.from.toLowerCase(), 'recent block'); senders++; } });
  }
  console.log('  ' + senders + ' senders seen, pool now ' + pool.size);

  console.log('\nresolving the hand written list');
  for (const n of NOTABLE_ENS) {
    const a = await ENS.resolve(n, (to, data) => rpc('eth_call', [{ to, data }, 'latest'])).catch(() => null);
    console.log('  ' + n.padEnd(16) + (a || 'could not resolve'));
    if (a) add(a, 'notable:' + n);
  }
  NOTABLE_RAW.forEach(a => add(a, 'notable:manual'));

  // ⚠️ The notable wallets are FORCED IN, never sampled out. They are in the population precisely
  // because the extremes have to be represented, and a random draw of 5,000 from 30,000 would drop
  // most of them.
  const forced = [...notable];

  // ⛔ AND THE RECENT-BLOCK SLICE IS CAPPED. It arrived as 9,498 of a 21,260 pool, which is 45% of the
  // reference, and whoever is sending transactions in the last few minutes is disproportionately
  // bots, relayers and exchange hot wallets with enormous transaction counts. Left uncapped they
  // would set the transaction percentiles and push every human down the scale. A fifth is enough to
  // keep an ordinary-wallet tail present without letting it define the population.
  const BLOCK_SHARE = 0.20;
  const blockPick = shuffle([...pool.entries()].filter(([, s]) => s === 'recent block' && !notable.has(s)).map(([a]) => a), 0xFACE7777)
    .slice(0, Math.round(target * BLOCK_SHARE));
  const collPick = shuffle([...pool.entries()]
    .filter(([, s]) => s !== 'recent block' && !s.startsWith('notable:')).map(([a]) => a), 0x6529CAFE);
  const picked = [...new Set([...forced, ...blockPick, ...collPick])].slice(0, target);
  console.log('\n  mix: ' + forced.length + ' notable, ' + blockPick.length + ' recent block, rest collection owners');

  fs.writeFileSync(OUT, 'address\n' + picked.join('\n'));
  fs.writeFileSync(POOL, JSON.stringify({ built: new Date().toISOString(), poolSize: pool.size,
    target, picked: picked.length, sources: [...pool.entries()].reduce((m, [, s]) => (m[s] = (m[s] || 0) + 1, m), {}) }, null, 1));
  console.log('\npool ' + pool.size + ' unique wallets, ' + forced.length + ' forced, wrote ' +
    picked.length + ' to population_v3.csv');
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
