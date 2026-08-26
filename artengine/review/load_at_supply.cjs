// LOAD THE ENGINE AS THE COLLECTION WE ARE ACTUALLY SHIPPING.
//
// ⚠️ WHY A PATCHED LOADER EXISTS AT ALL. `facets_gen.js` still hard-codes `SUPPLY = 10000`, and its
// `facetOf` is still the RETIRED probabilistic weighted roll — the chain moved to the keyed permutation
// (`alloc_perm.js` / `FacetsAllocPermV7`) on 2026-08-06. Load it plain and you get a 10,000-piece
// collection under a rule the contract no longer follows: right art, right proportions, WRONG id -> facet
// map and wrong counts. Every review page in this repo was built that way.
//
// This loader patches a COPY in memory. The live file is untouched, deliberately — changing it moves
// GLOBAL FINGERPRINT and changes which id shows which art, which is gruff's call, not a cleanup.
//
// ⚠️ THE PATCHES ARE ASSERTED, NOT HOPED FOR. A `.replace` that silently matches nothing would hand back
// a 10000-supply engine that LOOKS right, and every number downstream would be quietly wrong. Each one
// throws if it did not apply.
'use strict';
const fs = require('fs'), path = require('path');
const MIR = path.join(__dirname, '..', 'mirror_v2');
const AP = require(path.join(MIR, 'alloc_perm.js'));

/// `supply` — the working supply (gruff, 2026-08-08: build as if 6969).
/// `seed`   — the reveal seed to simulate. On mainnet this is the Chainlink VRF word.
/// Returns { G, V7, alloc, supply, seed }.  `alloc.of(id)` is the chain's own allocation.
function loadAtSupply(supply, seed) {
  seed = (seed === undefined ? 0xFACE7777 : seed) >>> 0;
  global.window = {}; global.self = global.window;
  const Lf = f => fs.readFileSync(path.join(MIR, f), 'utf8');
  eval(Lf('pixel_shade.js') + '\n' + Lf('eye_pieces.js') + '\n' + Lf('mouth_pieces.js') + '\n' + Lf('combo_pieces.js'));
  global.FACET_EYES = global.window.FACET_EYES; global.FACET_MOUTHS = global.window.FACET_MOUTHS;
  global.FACET_COMBO = global.window.FACET_COMBO; global.PIXEL_SHADE = global.window.PIXEL_SHADE;

  const alloc = AP.allocate(seed, supply);
  global.__ALLOC = id => alloc.of(id).facet;

  let gsrc = Lf('facets_gen.js')
    .replace('window.FACETS_GEN = {', 'window.FACETS_GEN = { facetOf, vomitOf, ghostGrailOf,')
    .replace('const SUPPLY = 10000;', 'const SUPPLY = ' + supply + ';')
    .replace('const REVEAL_SEED = 0xFACE7777;', 'const REVEAL_SEED = ' + seed + ';')
    .replace(/function facetOf\(tokenId\) \{[^\n]*\n/, 'function facetOf(tokenId) { return global.__ALLOC(_cid(tokenId)); }\n');
  if (!/global\.__ALLOC/.test(gsrc)) throw new Error('load_at_supply: the facetOf patch did not apply — the line moved');
  if (!gsrc.includes('const SUPPLY = ' + supply)) throw new Error('load_at_supply: the SUPPLY patch did not apply');
  if (!gsrc.includes('const REVEAL_SEED = ' + seed)) throw new Error('load_at_supply: the REVEAL_SEED patch did not apply');

  eval(Lf('portrait_v6.js') + '\nglobal.P=MIRROR_PORTRAIT_V6;\n' + Lf('archetype_v6.js') + '\n' + Lf('signal_model.js')
    + '\nvar MIRROR_SIGNALS=window.MIRROR_SIGNALS;\nvar FACET_EYES=global.FACET_EYES,FACET_MOUTHS=global.FACET_MOUTHS,'
    + 'FACET_COMBO=global.FACET_COMBO,PIXEL_SHADE=global.PIXEL_SHADE;\n' + gsrc + '\nglobal.G=window.FACETS_GEN;');
  eval(Lf('render_v7.js'));
  const V7 = global.window.RENDER_V7; V7.enabled = true; V7.install({}, 35);

  // sanity: the engine's facet must now agree with the chain's allocation, or the patch went in wrong
  for (const id of [1, 2, 7, 69, 1000, supply]) {
    const g = global.G.generate(id, ownerOf(id));
    const got = ((g.attributes.find(a => a.trait === 'Facet') || {}).value || '').toUpperCase();
    if (got !== alloc.of(id).facet) throw new Error('load_at_supply: #' + id + ' is ' + got + ' but the permutation says ' + alloc.of(id).facet);
  }
  return { G: global.G, V7, alloc, supply, seed };
}

/// One pseudo-wallet per token — pose and the owner colour blocks are OWNER-derived, so a single constant
/// wallet would give all 6,969 tokens one pose and one accent hue, nothing like a real mint.
/// Same function `review/anim.cjs` uses, so every tool shows the same collection.
function ownerOf(id) {
  let h = ((id >>> 0) * 2654435761) >>> 0, out = '';
  for (let i = 0; i < 5; i++) { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; out += h.toString(16).padStart(8, '0'); }
  return '0x' + out;
}

module.exports = { loadAtSupply, ownerOf };
