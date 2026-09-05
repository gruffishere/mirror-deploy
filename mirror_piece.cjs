// THE MIRROR PIECE — a FACETS artwork generated from a wallet address, for the Mirror card.
//
//   node wrapped/mirror_piece.cjs <0xaddr> <FACET> [--scale 30] [--out file.png]
//
// The reading says which of the seven you lean toward. This draws that facet with YOUR address as the
// seed, so the card carries a piece nobody else has.
//
// ⛔ IT MUST NEVER BE MISTAKEN FOR A TOKEN YOU WILL OWN. Two things enforce that here, and the copy on
// the card has to say the third:
//   1. The token id is pushed far outside the real range (1..6969) into the billions, so a Mirror
//      piece can never share an id with a real FACETS token.
//   2. The facet is FORCED to the reading's answer instead of being drawn from the collection's exact
//      allocation, so this piece is not part of any published count.
//   3. The card says it: this is your reflection, not your mint. The chain has not chosen yet.
'use strict';
const path = require('path');
// ⚠️ artengine/ is a VENDORED COPY of exp/review + exp/mirror_v2, kept in step by
// sync_artengine.cjs. Reaching two directories up worked here and took the server down at boot
// anywhere else. `node sync_artengine.cjs --check` fails if the copy falls behind the real art.
const { loadAtSupply } = require(path.join(__dirname, 'artengine', 'review', 'load_at_supply.cjs'));

const FACETS = ['NEWBIE', 'COLLECTOR', 'DEGEN', 'BUILDER', 'OG', 'WHALE', 'GHOST'];

// a stable integer from the address, far above any real token id
function seedOf(addr) {
  const s = String(addr).toLowerCase();
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return 1000000000 + (h % 900000000);
}

let ENGINE = null;
function engine(supply, seed) {
  if (!ENGINE) ENGINE = loadAtSupply(supply || 6969, seed || 0xFACE7777);
  return ENGINE;
}

// Returns { svg, cells, grid, tokenId, facet }
// ⛔ ONE HAND-PICKED PIECE, gruff's call, declared where anyone reading this file will see it.
// Every other wallet's art is whatever its address draws. This address gets a chosen candidate:
// adamweitsman.eth, for a launch post. nudge 1961 out of 30,000 searched is Laser eyes, Sealed
// mouth, black contour on Aurora, measured at 0.1% for the eyes.
// ⚠️ IT LIVES HERE, in the one function every path goes through, so the page and the rendered card
// cannot disagree about what this wallet looks like.
// ⛔ A NUDGE ALONE IS NOT A PIN, it is a coordinate in a space that moves.
// 1961 was chosen against the engine of 2026-08-27 and described in writing as Laser eyes on
// Aurora. When the new eyes and the homage pieces landed, that same number still returned a
// piece whose Eyes trait SAID Laser while the picture had become two flat red squares lost in
// Ghost's own colour flecks. The traits matched their description perfectly and the art was
// wrong, so nothing that reads trait names could have caught it. gruff did, by looking.
// So the pin now carries what it is supposed to draw, and pinDrift() checks it.
//
// ⚠️ MEASURED WHILE CHOOSING THIS ONE: the Laser eye only renders with a socket under it, which
// is what makes it read as an eye at all, when Veil is Shadow AND Contour is Color. Every other
// combination flattens it into a red square. 1961 was Shadow + Black, which is exactly why it
// went dull. 47 of 30,000 candidates carry Laser; this is one of the two that also has a halo,
// a clean background and the eyes reading properly. gruff picked it on sight.
const PINNED = {
  '0x250dc85178fb6859e9ee02c925d46aab946a55e7': {
    nudge: 690,
    expect: { Eyes: 'Laser', Mouth: 'Smile', Halo: 5, Background: 'Bare',
              Veil: 'Shadow', Contour: 'Color' },
  },
};

const pinNudge = addr => {
  const p = PINNED[String(addr).toLowerCase()];
  return p == null ? null : p.nudge;
};

// ⚠️ CALLED AT BOOT AND REPORTED BY /api/status, so a pin that has quietly stopped drawing what
// it promised is visible in one request instead of in somebody's timeline.
function pinDrift() {
  const out = [];
  for (const [addr, p] of Object.entries(PINNED)) {
    let got;
    try { got = mirrorPiece(addr, 'GHOST', { nudge: p.nudge }).traits; }
    catch (e) { out.push({ addr: addr, error: e.message }); continue; }
    const wrong = [];
    for (const [k, want] of Object.entries(p.expect)) {
      const t = got.find(x => x.trait === k);
      const has = t ? t.value : null;
      if (String(has) !== String(want)) wrong.push(k + ' is ' + has + ', not ' + want);
    }
    if (wrong.length) out.push({ addr: addr, wrong: wrong });
  }
  return out;
}

function mirrorPiece(addr, facet, opts) {
  opts = opts || {};
  const pin = pinNudge(addr);
  if (pin != null && opts.nudge == null) opts = Object.assign({}, opts, { nudge: pin });
  if (!FACETS.includes(facet)) throw new Error('unknown facet ' + facet);
  const E = engine(opts.supply, opts.seed);
  const { G, V7 } = E;
  // ⚠️ A weights object that is NOT the module's own FACET_WEIGHTS switches the generator from the
  // collection's exact allocation to a weighted roll. One facet at 1 and the rest at 0 makes that
  // roll deterministic, which is how the reading's answer gets drawn.
  const weights = {};
  FACETS.forEach(f => weights[f] = f === facet ? 1 : 0);
  const tokenId = seedOf(addr) + (opts.nudge || 0) * 7919;
  const g = G.generate(tokenId, String(addr).toLowerCase(), weights);
  V7.animate = false;
  V7.cache.clear();
  return { svg: V7.render(g), grid: V7.GRID, tokenId, facet, traits: g.attributes || [] };
}

// ── THE PORTRAIT GETS BETTER AS THE READING DOES ──────────────────────────────────────────────────
// gruff, 2026-08-26: punk6529 should get laser eyes on his whale; a serious collector should get the
// Completionist. The piece is a portrait of the wallet, so a heavier wallet should look heavier.
//
// ⛔ THE COLLECTION'S GENERATOR IS NOT TOUCHED. `generate()` has no rarity lever and adding one to
// facets_gen.js would put the real collection's determinism at risk for the sake of a marketing page.
// Instead this SEARCHES: it walks candidate token ids seeded from the address and keeps the best one
// it is allowed to look at. The generator stays exactly as it ships.
//
// ⚠️ IT IS STILL DETERMINISTIC. The candidates come from the address, so the same wallet gets the
// same piece forever, which is the rule every other value on the card follows.
//
// ⚠️ IT MUST NOT TEACH THAT THE MINT WORKS THIS WAY. The card says a facet you can compute is a
// facet you can farm and that FACETS assigns faces by VRF, so the page has to keep saying that this
// is the MIRROR's portrait and not a preview of anything. See the note at the top of this file.
//
// ⚠️ MEASURED before it was built: 0.76 ms per candidate, and on the Mirror's forced weights the only
// traits that actually move are Gild (Matte 62% / Gilded 28% / Bullion 10%) and Halo (0 at 60%, up to
// 5). Background comes back Bare every time, so it is not a lever and is not scored.
const GILD_TIER = { Matte: 0, Gilded: 2, Bullion: 4 };
const RARE_EYES = ['Laser', 'Heterochromia', 'Flame', 'Cross-eyed'];

function pieceScore(traits) {
  let s = 0;
  for (const t of traits || []) {
    if (t.trait === 'Halo') s += Number(t.value) || 0;
    else if (t.trait === 'Gild') s += GILD_TIER[t.value] || 0;
    else if (t.trait === 'Eyes' && RARE_EYES.indexOf(t.value) >= 0) s += 3;
  }
  return s;
}

// heat is 0..1, taken from how far the wallet sits along its own facet
function bestPiece(addr, facet, heat) {
  // ⚠️ THE PIN HAS TO BE CAUGHT HERE TOO. Everything that draws a card comes through bestPiece,
  // and it passes an explicit nudge for every candidate, so the guard inside mirrorPiece (which
  // only fires when no nudge was given) never saw it and the pinned wallet kept its old art.
  const pin = pinNudge(addr);
  if (pin != null) return mirrorPiece(addr, facet, { nudge: pin });
  const h = Math.max(0, Math.min(1, Number(heat) || 0));
  const tries = 1 + Math.round(h * 180);
  let best = null, bestS = -1;
  for (let i = 0; i < tries; i++) {
    const p = mirrorPiece(addr, facet, { nudge: i });
    const s = pieceScore(p.traits);
    if (s > bestS) { bestS = s; best = p; }
  }
  return best;
}

module.exports = { mirrorPiece, seedOf, FACETS, pieceScore, bestPiece, pinDrift };

if (require.main !== module) return;

const argv = process.argv.slice(2);
const addr = argv[0], facet = (argv[1] || 'NEWBIE').toUpperCase();
if (!/^0x[0-9a-fA-F]{40}$/.test(addr || '')) { console.error('usage: mirror_piece.cjs <0xaddr> <FACET>'); process.exit(1); }
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const r = mirrorPiece(addr, facet);
console.log('address   ' + addr);
console.log('facet     ' + r.facet + '   (forced, not drawn from the collection allocation)');
console.log('seed id   ' + r.tokenId + '   (far above the real range, cannot collide with a token)');
console.log('grid      ' + r.grid + ' x ' + r.grid);
console.log('traits    ' + r.traits.slice(0, 6).map(a => a.trait + '=' + a.value).join('  '));

const out = arg('--out', path.join(__dirname, '..', 'out', 'mirror_' + addr.slice(2, 10) + '_' + facet + '.png'));
const scale = +arg('--scale', 30);
const { writeCellsPng } = (() => {
  const fs = require('fs'), zlib = require('zlib');
  const CELLS = require(path.join(__dirname, 'artengine', 'onchain', '_svgcells.cjs'));
  const CRCT = (() => { const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
    return t; })();
  const crc32 = b => { let c = -1; for (let i = 0; i < b.length; i++) c = CRCT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const prgb = h => h[0] === '#' ? [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
    : (h.match(/\d+/g) || [0, 0, 0]).map(Number);
  return { writeCellsPng: (svg, grid, sc, file) => {
    const cells = CELLS.cellsOf(svg, grid).map(c => c == null ? '#0a0a0a' : c);
    const W = grid * sc, raw = Buffer.alloc(W * (W * 3 + 1));
    let o = 0;
    for (let y = 0; y < W; y++) { raw[o++] = 0; const row = ((y / sc) | 0) * grid;
      for (let x = 0; x < W; x++) { const c = prgb(cells[row + ((x / sc) | 0)]); raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2]; } }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
    return W;
  } };
})();
const px = writeCellsPng(r.svg, r.grid, scale, out);
console.log('wrote     ' + out + '   ' + px + ' x ' + px + ' px');
