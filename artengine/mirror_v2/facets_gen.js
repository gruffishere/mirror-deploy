// FACETS generator — address-seeded, Art Blocks style (NO behavior data).
// FROZEN traits (facet type, finish, form) come from the token's permanent hash.
// DYNAMIC layer (owner personalization, e.g. accent color) comes from the current owner address.
// Reuses the existing render engine (portrait_v6) + facet baselines, but assignment is hash-driven.
// Requires: portrait_v6.js, archetype_v6.js, signal_model.js loaded first (bare globals).
(function () {
  const M = MIRROR_SIGNALS, P = MIRROR_PORTRAIT_V6;

  // ---- deterministic hash + PRNG ----
  function hashInt(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // accent_color must be HEX (not an "hsl()" string): the face-blend path uses hexToRgb, which can't parse hsl() and would mis-render those cells as navy (#000032). So owner hue -> hex.
  function hslToHex(h, s, l) { s /= 100; l /= 100; const k = n => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); const x = n => Math.round(f(n) * 255).toString(16).padStart(2, '0'); return '#' + x(0) + x(8) + x(4); }
  function pickWeighted(rng, entries) { let tot = 0; for (const e of entries) tot += e[1]; let r = rng() * tot; for (const e of entries) { r -= e[1]; if (r < 0) return e[0]; } return entries[entries.length - 1][0]; }

  // ---- RARITY (the curve WE control — Phase 2, editable) ----
  const FACET_WEIGHTS = { COLLECTOR: 2188, NEWBIE: 2406, DEGEN: 1617, BUILDER: 1294, OG: 1109, WHALE: 773, GHOST: 613 };   // facet weights in TEN-THOUSANDTHS (sum=10000). Organic (non-round) on purpose.
  // ⚠️ THESE ARE PERCENTAGES, NOT COUNTS, AND THE COUNTS ARE EXACT — NOT approximate.
  // This line used to say "allocation is now PROBABILISTIC ... so real counts land NEAR these, not exactly"
  // (SIMPLIFIED 2026-07-10). That stopped being true on 2026-08-06, when the chain moved to the keyed
  // PERMUTATION (`alloc_perm.js` / `FacetsAllocPermV7`): the band widths ARE the counts, so a supply of
  // 6,969 gives exactly NEWBIE 1681 · COLLECTOR 1524 · DEGEN 1126 · BUILDER 901 · OG 772 · WHALE 538 ·
  // GHOST 427, every time, for any seed. Corrected 2026-08-08.
  // ⚠️ `facetOf` BELOW IS STILL THE RETIRED PROBABILISTIC ROLL and is the last piece not yet aligned —
  // deliberately, because switching it moves GLOBAL FINGERPRINT and changes which id shows which art.
  // Review tools that need the shipping rule use `review/load_at_supply.cjs`, which patches it.
  const TIER = { COLLECTOR: 'common', NEWBIE: 'common', DEGEN: 'uncommon', BUILDER: 'uncommon', OG: 'uncommon', WHALE: 'rare', GHOST: 'rare' };

  // ---- RARITY ALLOCATION (PROBABILISTIC per-token derivation from the reveal seed, SIMPLIFIED 2026-07-10) ----
  // Each token derives its facet independently from the reveal seed by a weighted pick over FACET_WEIGHTS. Counts are
  // PROBABILISTIC (binomial) around the published numbers, NOT exact. Matches on-chain FacetsCore._alloc (same weighted
  // pick from keccak(seed,tokenId)). reveal() on-chain just stores the VRF seed (tiny gas); there is no shuffle.
  const SUPPLY = 10000;
  const REVEAL_SEED = 0xFACE7777;   // PLACEHOLDER reveal seed (prototype). On mainnet this is the Chainlink VRF word.
  const _FACET_ENTRIES = Object.entries(FACET_WEIGHTS);
  const _cid = tokenId => ((((tokenId | 0) - 1) % SUPPLY) + SUPPLY) % SUPPLY + 1;   // normalize any input to a canonical 1..SUPPLY id
  function facetOf(tokenId) { const rng = mulberry32((hashInt('FACET_ALLOC:' + _cid(tokenId)) ^ (REVEAL_SEED >>> 0)) >>> 0); return pickWeighted(rng, _FACET_ENTRIES); }   // weighted facet, probabilistic

  // ---- RAINBOW VOMIT: a fixed per-token probability of 12/10000, ANY facet. ----
  // Deterministic from the reveal seed. Matches on-chain FacetsCore._alloc isVomit (keccak(seed,id,1)%10000<12).
  // ⚠️ IT IS ODDS, NOT A TARGET COUNT, SO IT SHRINKS WITH THE SUPPLY. This line used to say "~12 across the
  // whole collection"; measured over four reveal seeds it is 8·12·8·11 at 10,000 and 7·10·6·7 at 6,969 —
  // the label was optimistic even at 10k. To restore an intended count, raise the 12 (and the contract's).
  function vomitOf(tokenId) { return (mulberry32((hashInt('VOMIT:' + _cid(tokenId)) ^ (REVEAL_SEED >>> 0)) >>> 0)() * 10000) < 12; }
  // ---- GHOST GRAIL: ultra-ethereal ghosts (faded Veil 'Light' + Contour 'None'), 33/10000 among GHOSTS only. ----
  // Deterministic. Matches on-chain _alloc isGrail (facet==Ghost && keccak(seed,id,2)%10000<33).
  // ⚠️ ALSO ODDS, NOT A COUNT. Measured over four seeds: 2·3·1·3 at 10,000, 3·1·1·3 at 6,969 — so "~2" is a
  // range from ONE to THREE, and which one it is gets decided by the VRF word on reveal day.
  function ghostGrailOf(tokenId) { if (facetOf(tokenId) !== 'GHOST') return false; return (mulberry32((hashInt('GRAIL:' + _cid(tokenId)) ^ (REVEAL_SEED >>> 0)) >>> 0)() * 10000) < 33; }

  // ---- LAYERED TRAITS (CloneX/BAYC style: facet → trait categories → weighted options) ----
  // (taxonomy only — NOT visually wired; shown as attributes/rarity. Background is the one applied below.)
  const UNIVERSAL_TRAITS = {
    // Frame trait REMOVED 2026-06-25 (user) — was a thin edge keyline (Etched/Prismatic), low visual function. finish forced 'standard' below.
    Background: [['None', 50], ['Halftone', 21], ['Stripes', 20.5], ['Rays', 19.2], ['Checker', 12.6], ['Gradient', 11.1], ['Scatter', 9.5], ['Diamonds', 9], ['Orbs', 6.2], ['Frames', 11.9], ['Aurora', 4], ['Starfield', 2.7], ['Eclipse', 2.5], ['Rainbow Grid', 2.2], ['Medallion', 1.82], ['Rings', 0.86]],   // 2026-06-26 (user tuner export). None weight = roll over ~7039 bg-eligible; +2961 Collector/Whale forced None -> ~48.6% total None. Compound flags (Checker=blocky · Blocky Frames · Rainbow Grid · Rings=colourful · Medallion=gradient) derived from value in generate().
    Halo:       [[0, 3188], [1, 2094], [2, 1456], [3, 1015], [4, 841], [5, 627], [6, 354], [7, 425]],   // 2026-07-11 (user tuner): was 0..11; 9-11 can't fit bs>=30 so they piled + made it non-monotonic. Clean ladder, weights = target counts /10000.
    // ⚠️ THE LADDER ENDS AT 7 — GLOBAL HALO MAX 7 (gruff 2026-07-20/24: 7 facets, 7 halos), enforced below
    // by `if (+_ha.value > 7) _ha.value = 7`. This table kept an `[8, 160]` row until 2026-08-08 that the
    // clamp could never let through: measured over the whole collection, ZERO tokens ever showed halo 8.
    // It was dead weight that read as a promise — the same fold WHALE_HALO already did on 2026-07-24
    // ("the old [8,0.5] folded into 7"); the universal table was simply missed at the time.
    // ✅ FOLDED, NOT DELETED, and that distinction is the whole point: 8's 160 was merged into 7 (265 -> 425)
    // so every roll lands exactly where it landed before. Deleting the row would have renormalised the
    // other eight weights and CHANGED THE ART. Proof: GLOBAL FINGERPRINT did not move.
    // Block trait REMOVED 2026-07-13 (user) — obsolete under the fixed 41x41 native grid. block_size is pinned to 24 (~native cell 24.39) in generate() only for the halo-fit / whale math; the native renderer uses CELL, not block_size. No longer a trait / not in metadata / not in rarity.
    Eyes:       [['Calm', 797.82], ['Iris Blue', 786.34], ['Iris Green', 810.73], ['Sleepy', 846.61], ['Closed', 767.69], ['Sharp', 370.21], ['Sad', 397.47], ['Skeptical', 375.95], ['Wide', 408.95], ['Wink', 424.74], ['Human', 419], ['Void', 201.01], ['Iris Violet', 175.64], ['Iris Gold', 204.59], ['Kohl', 180.37], ['Long', 189.2], ['Big Eyes', 197.25], ['Cross-eyed', 193.32], ['Heterochromia', 184.89], ['Glow', 154.4], ['Ember', 170.69], ['Spiral', 160.08], ['X Eyes', 142.21], ['Shades', 128.85], ['Eyepatch', 148.44], ['Visor', 135.68], ['Star', 165.51], ['Heart', 114.2], ['Dollar', 61.21], ['3D Glasses', 106.35], ['Crying', 98.14], ['Cyber Visor', 80.52], ['Bandit', 89.53], ['Vault', 71.09], ['Rainbow Shades', 121.69], ['Flame Eyes', 40.04], ['Cyclops', 50.87], ['Laser', 28.7]],
    // ⚠️⚠️ THE ORDER OF THIS ARRAY IS LOAD-BEARING — DO NOT SORT IT. The INDEX is the on-chain eye id:
    // `FacetsGenRoll._wEyes()` is the same 38 slots in the same order and `FacetsGenP` maps index -> name
    // (`if(e==36) return "Cyclops"`). Re-tuning the weights is safe; MOVING A ROW silently renames every
    // eye on chain. The first cut of this retune did sort it by weight, which would have done exactly that.
    // 2026-08-08 (gruff): A LADDER, NOT TIERS — and the reason is measured. The old table was six tiers
    // (32/16/8/4/2/1) which reads tidy and behaves badly at the rare end: EIGHT values shared weight 2, so
    // Bandit 41 · Crying 39 · Rainbow Shades 39 · 3D Glasses 38 · Heart 38 · Cyber Visor 37 all landed
    // inside FOUR tokens of each other. Nobody can chase a 38 over a 39, and the table had no opinion
    // about which of them was rarer. Every value now has its own rung, widest at the bottom where an
    // absolute gap is legible and tightening as it climbs. At 6969, rarest first:
    //   Laser 20 · Flame Eyes 28 · Cyclops 35 · Dollar 43 · Vault 50 · Cyber Visor 56 · Bandit 62 ·
    //   Crying 68 · 3D Glasses 74 · Heart 80 · Rainbow Shades 85 · Shades 90 · Visor 95 · X Eyes 99 ·
    //   Eyepatch 103 · Glow 108 · Spiral 112 · Star 115 · Ember 119 · Iris Violet 122 · Kohl 126 ·
    //   Heterochromia 129 · Long 132 · Cross-eyed 135 · Big Eyes 137 · Void 140 · Iris Gold 143 ·
    //   Sharp 258 · Skeptical 262 · Sad 277 · Wide 285 · Human 292 · Wink 296 ·
    //   Closed 535 · Iris Blue 548 · Calm 556 · Iris Green 565 · Sleepy 590
    // ⚠️ LASER IS THE FLOOR BY DECISION, not by luck. The old table gave Laser / Cyclops / Flame weight 1
    // each and let the roll decide the order — it came out Flame 16 · Laser 20 · Cyclops 27, i.e. the
    // iconic one was not the rarest. It is now, and it is written down rather than rolled.
    // ⚠️ THE COMMONS PAID FOR IT (~7%, e.g. Iris Green 601 -> 565) and the second tier ~5%. With a fixed
    // 6,969 budget you can widen the rare end or the mid, not both, unless the commons give something up.
    // 601 -> 565 is not a difference anyone can feel; 38 -> 20 vs 28 vs 35 is the whole point.
    // ⚠️ Weights are in TEN-THOUSANDTHS, so they are supply-independent — a supply cut rescales them all
    // and the ladder keeps its shape. Do not rewrite this table as counts.
    // Deep + Texture REMOVED as separate traits 2026-06-24 — folded into the Background trait values. Render flags derived from the Background value in generate().
    Mouth:      [['Stoic', 924.09], ['gm', 990.1], ['Open', 981.49], ['Frown', 964.27], ['Surprised', 947.05], ['Sealed', 912.61], ['Smile', 498.47], ['Grin', 473.5], ['Gritted', 447.49], ['Drool', 420.4], ['Kiss', 332.15], ['Cigar', 300.25], ['Gold Grill', 267.02], ['Screaming', 232.41], ['Feral', 362.77], ['Tongue Out', 392.17], ['Party Blower', 196.35], ['Bubblegum', 158.8], ['Rose', 119.67], ['Fangs', 78.92], ['Rainbow Vomit', 0]],   // ⚠️ ORDER FROZEN — the index is the on-chain mouth id (`FacetsGenRoll._wMouth()`, 21 slots). 2026-08-08 (gruff): LADDER, same treatment as Eyes but gentler — "aralığı çok hafif açabiliriz". At 6969: gm 690 · Open 684 · Frown 672 · Surprised 660 · Stoic 644 · Sealed 636 · Smile 347 · Grin 330 · Gritted 312 · Drool 293 · Tongue Out 273 · Feral 253 · Kiss 231 · Cigar 209 · Gold Grill 186 · Screaming 162 · Party Blower 137 · Bubblegum 111 · Rose 83 · Fangs 55. Was six tiers 32/16/8/4/1 with FOUR values tied at the rare end (Party Blower 85 · Rose 84 · Fangs 80 · Bubblegum 79).
    // ⚠️ FANGS IS THE FLOOR BY CHOICE. The old table had Party Blower / Bubblegum / Rose / Fangs all on
    // weight 4, i.e. no opinion about which is rarest; its own note called Fangs "the signature special",
    // so that is the one given the floor. Reorder freely — it is one line — but pick, do not tie.
    // ⚠️ `Rainbow Vomit` IS KEPT AT WEIGHT **0**, not deleted — the slot has to stay so the array length
    // and every index still match `FacetsGenRoll._wMouth()`'s 21. It never produced a token anyway: a
    // roll that landed on it, on a token `vomitOf` had not designated, was thrown away and RE-ROLLED, so
    // the entry only ever spent 1/321 of the mouth mass and handed it straight back. Proof: the `vomitOf`
    // count and the `Mouth = Rainbow Vomit` count were IDENTICAL (7 and 7). At weight 0 nothing can roll
    // it, so the re-roll branch below is unreachable and has been removed. Every vomit mouth now comes
    // from `vomitOf` alone (12/10000 per token, any facet) — one mechanism instead of one-and-a-half.
    // Headpiece trait REMOVED from the collection 2026-06-11 (user: not sure we want a head trait). Engine headpieceTiles() stays DORMANT (only fires if p.headpiece set, which generate no longer does) -> easy to re-enable.
  };
  const FACET_TRAITS = {
    COLLECTOR:  { Archetype: [['Explorer', 45.7], ['Specialist', 31.9], ['Maxi', 14.6], ['Completionist', 7.7]], Holdings: [[1, 46], [2, 37], [3, 29], [4, 22], [5, 20], [6, 16], [7, 13], [8, 9], [9, 8], [10, 3]], Wall: [['Royal Blue', 88], ['Midnight', 15.3]] },   // 2026-06-29 (user targets, ~2188): Archetype rebalanced for visual variety (Explorer 1001 / Specialist 698 / Maxi 320 / Completionist 169 — was 64/23/8/4, too Explorer-heavy). Wall Midnight bumped 7->15.3 (~325, was 157). Holdings = wall FULLNESS 1..10 (fuller=rarer).
    BUILDER:     { Role: [['Artist', 51], ['Dev', 49]], Shipped: [['Few', 60], ['Many', 10], ['Prolific', 5]] },   // 2026-06-26 (user). Role = Artist/Dev · Shipped = output count (Prolific now very rare)
    WHALE:      { 'Halo Pattern': [['Solid', 60], ['Beaded', 25], ['Gradient', 15]], Gild: [['None', 62], ['Low', 25], ['Mid', 11]] },   // 2026-06-26 REDESIGN: Halo Pattern = gold TREATMENT (3 values, dominant Solid) on a uniform halo (was 9 shapes -> over-boosted whales). Gild = face gold only. Now 2x3, balanced like Ghost.   // 2026-06-26 (user) DRAFT: trimmed 15->9 (removed Dotted/Crescent/Star/Sunburst/Crown + Pinstripe[≡Solid at high block]). Weights sum to 773 so weight≈adet, floor ~38 (no accidental 1/1). Tiers: C Solid/Dashed/ArcTop · R Rays/Wings/Flare/Orbit · M Diamond/Pinwheel. (whaleHalo render cases for removed patterns stay dormant.)
    OG: { Patina: [['Crimson', 25], ['Verdigris', 14], ['Rust', 34], ['Azure', 20], ['Gilt', 7]], Cracks:   /* ⚠️ ORDER FROZEN — matches FacetsGenRoll._wF0(4). This exact table already caused a port bug once (2026-07-18: an extra entry shifted Azure/Gilt by one). Re-tune weights freely, never move a row. */ [['None', 80], ['Shattered', 16], ['Kintsugi', 3.5]] },   // Patina 2026-08-08 (gruff: "rust çok fazla kalmış gibi"): Rust was 42/72.5 = 58% of every OG — more than half the facet identical in the one dimension meant to separate them. At 6969: Rust 262 · Crimson 193 · Azure 154 · Verdigris 108 · Gilt 54 (was 451 · 141 · 108 · 49 · 23). Order kept, dominance broken, Gilt still the mythic. Cracks: None common · Shattered rare · Kintsugi mythic (2026-06-27 tuner, untouched).
    DEGEN:      { Glitch: [['None', 62], ['Low', 22]], PnL: [['Flat', 33], ['Chop', 27], ['Printing', 20], ['Bleeding', 12], ['Rekt', 5], ['Up Only', 1]] },   // 2026-06-27 (user tuner): Med 5->8, Rekt 6->5, Up Only 2->1 (Up Only now ultra-rare flex). Glitch = 3 levels.
    NEWBIE:     { Bloom: [['Bright', 53.2], ['Dim', 28.7], ['Nova', 18.1]], Form: [['Whole', 60], ['Forming', 30], ['Scattered', 10]] },   // 2026-06-30 (user): Spark REMOVED (felt decorative). Bloom = colour/radiance (common->rare Bright>Nova>Dim, Dim = zombie vibe = rarest). Form = how assembled (Whole>Forming>Scattered, Scattered = "just materializing" = rarest).
    GHOST:     { Veil: [['Shadow', 55], ['Heavy', 14], ['Light', 2.4]], Contour: [['Color', 60], ['Black', 15], ['None', 3]] },   // 2026-07-01 (user): Veil names REVERSED — Shadow = most present/solid (common 55), Heavy = mid (14), Light = most ethereal/faded (rare 2.4). Weights kept (solid common, faded rare). Contour = silhouette ring (Color/Black/None).
  };
  // WHALE gold-halo treatment = whale_fill, FROZEN from the Halo Pattern trait (set in generate()). NOT owner-derived. (Legacy owner-based WHALE_FILLS array removed 2026-07-16.)
  // MOUTH (universal trait, LIVE 2026-06-11) — rendered INSIDE the face field, integral like the eyes: block-snapped,
  // pose-aware, facet-tinted dark recess + depth shadow. Value -> engine params (portrait_v6 field()/mouthCellColor).
  const MOUTH_DEF = {
    'Stoic':         { style: 'flat', w: 48, shape: 'stoic' },                       // clean flat line
    'gm':            { style: 'flat', w: 54, curve: 42, shape: 'gm' },               // gentle smile (corners up)
    'Smile':         { style: 'flat', w: 64, curve: 58, band: 18, shape: 'smile' },  // big open smile (teeth)
    'Grin':          { style: 'flat', w: 60, curve: 22, band: 16, shape: 'grin' },
    'Frown':         { style: 'flat', w: 54, curve: -48, shape: 'frown' },           // clear downturn
    'Surprised':     { style: 'flat', shape: 'surprised' },                          // shocked "o" (4-block)
    'Open':          { style: 'open', open: 26 },                                    // OLD field render (user preferred it)
    'Gritted':       { style: 'grit', w: 60, shape: 'gritted' },
    'Sealed':        { style: 'seal', w: 54 },                                       // reverted to OLD field design (user preferred it)
    'Tongue Out':    { style: 'tongue', w: 30, shape: 'tongue' },
    'Gold Grill':    { style: 'grit', w: 60, shape: 'grill' },
    'Feral':         { style: 'feral', w: 58, open: 22, shape: 'feral' },
    'Fangs':         { style: 'fangs', w: 34, shape: 'fangs' },
    'Cigar':         { style: 'cigar', w: 30, shape: 'cigar' },
    'Kiss':          { style: 'kiss', w: 24, shape: 'kiss' },
    'Drool':         { style: 'drool', w: 44, shape: 'drool' },
    'Rainbow Vomit': { style: 'vomit', w: 56, open: 16 },
  };
  function applyMouthTrait(p, mv) {
    const d = MOUTH_DEF[mv]; if (!d) return;
    p.mouth_style = d.style; p.mouth_shape = d.shape || null; p.mouth_w = d.w || 56; p.mouth_curve = d.curve || 0; p.mouth_asym = d.asym || 0;
    p.mouth_open = d.open || 0; p.mouth_open_band = d.band || 0;
    p.mouth_teeth_color = d.teeth || '#e8eef7';
    p.mouth_tip_color = d.tip || null;                // cigar ember / vape smoke accent
    if (d.intensity != null) p.mouth_intensity = d.intensity;
  }
  function rollCat(rng, opts) { const v = pickWeighted(rng, opts); const tot = opts.reduce((a, b) => a + b[1], 0); const w = opts.find(o => o[0] === v)[1]; return { value: v, pct: 100 * w / tot }; }
  function rollTraits(hash, facet) {
    const rng = mulberry32((hash ^ 0x9e3779b9) >>> 0);
    const a = [];
    for (const [cat, opts] of Object.entries(UNIVERSAL_TRAITS)) { const r = rollCat(rng, opts); a.push({ trait: cat, value: r.value, pct: r.pct }); }
    // FACET-specific traits: rollCat gives % WITHIN the facet; multiply by the facet's collection share so pct is % of the
    // whole 10000 (consistent with universal traits + the grid panel + correct rarity scoring). 2026-06-26: was % of facet.
    const _fShare = facetPct(facet) / 100;
    for (const [cat, opts] of Object.entries(FACET_TRAITS[facet] || {})) { const r = rollCat(rng, opts); a.push({ trait: cat, value: r.value, pct: r.pct * _fShare }); }
    return a;   // Block is now natively bs 30..38 (UNIVERSAL_TRAITS.Block, gradient 38 common -> 30 rare); no clamp needed
  }
  function facetPct(facet, weights) { weights = weights || FACET_WEIGHTS; const tot = Object.values(weights).reduce((x, y) => x + y, 0); return 100 * (weights[facet] || 0) / tot; }
  // ORBS/HALO COHERENCE (2026-06-29, user): Orbs is a SPARSE "calm" bg; a halo of ORBS_HALO_MAX+1 (=6) or more rings fully
  // occludes it (the orbs vanish). So a token that rolls Orbs + final Halo >= 6 SWAPS its bg to a denser one (re-pick excluding
  // Orbs) in generate() — the halo is kept (big halos are precious). Orbs thus only ever appears with Halo 0..5 (always roomy).
  const ORBS_HALO_MAX = 5;
  // TRUE collection frequency (%) of each Background value. The bg pool is rolled only by the ~7039 bg-eligible facets;
  // Collector+Whale are forced to 'None'. So a value's real % over 10000 = (w/total)*eligible (+ Collector/Whale for None),
  // ADJUSTED for the Orbs decouple: q = P(final Halo >= 6) over the Orbs-eligible (non-Whale) pool; that q-fraction of Orbs is
  // moved onto the OTHER bgs (proportional to weight) exactly as the re-pick does, so declared pct == actual count (validator-clean).
  const _BG_FREQ = (() => {
    const opts = UNIVERSAL_TRAITS.Background, tot = opts.reduce((s, o) => s + (o[1] || 0), 0) || 1;
    const facetTot = Object.values(FACET_WEIGHTS).reduce((s, x) => s + x, 0) || 10000;
    const cw = (FACET_WEIGHTS.COLLECTOR || 0) + (FACET_WEIGHTS.WHALE || 0), elig = facetTot - cw;
    const H = UNIVERSAL_TRAITS.Halo, hTot = H.reduce((s, o) => s + o[1], 0) || 1, _BS = 24;   // block_size pinned to 24 (native cell) since the Block trait was removed
    let q = 0; for (const [hv, hw] of H) { if (Math.min(hv, Math.max(1, Math.floor(228 / _BS) + 1)) > ORBS_HALO_MAX) q += (hw / hTot); }   // P(final Halo >= 6), capped at the fixed native cell (budget 228)
    const cnt = {}; for (const [v, w] of opts) { let c = (w / tot) * elig; if (v === 'None') c += cw; cnt[v] = c; }
    const orbsW = (opts.find(o => o[0] === 'Orbs') || [0, 0])[1] || 0, moved = ((orbsW / tot) * elig) * q, otherTot = tot - orbsW;   // Orbs mass that re-rolls away, redistributed to the other bgs by weight (same as the re-pick)
    cnt['Orbs'] -= moved; for (const [v, w] of opts) { if (v !== 'Orbs') cnt[v] += moved * (w / otherTot); }
    const m = {}; for (const v in cnt) m[v] = 100 * cnt[v] / facetTot; return m;
  })();
  // WHALE-SPECIFIC Halo distribution (2026-06-27, user): the whale's gold CROWN is special, so far rarer than the universal halo —
  // ~64% no halo, big crowns (9-11) only a handful. Whales RE-ROLL Halo from this (in the WHALE facet block); non-whales use UNIVERSAL_TRAITS.Halo.
  const WHALE_HALO = [[0, 54], [1, 14], [2, 10], [3, 8], [4, 5], [5, 1.8], [6, 1.3], [7, 1.4]];   // 2026-07-24 (user): GLOBAL HALO MAX 7 (7 facets / 7 halos). The old [8,0.5] (4 whale tokens) folded into 7. Whale gold crown: bare/small dominate, big crowns rare.
  // TRUE post-cap frequency (%) of each Halo value. Halo is capped to min(rolled, maxFit(block)) so its real distribution differs
  // from the raw roll weights (capped high values pile onto lower ones). final = min(rolled, maxFit), Halo & Block independent.
  const _HALO_FREQ = (() => {
    const H = UNIVERSAL_TRAITS.Halo, FW = FACET_WEIGHTS, _BS = 24;   // block_size pinned to 24 (native cell); Block trait removed
    const hTot = H.reduce((s, o) => s + o[1], 0) || 1, fTot = Object.values(FW).reduce((s, x) => s + x, 0) || 1, m = {};
    const budOf = (f, bs) => f === 'COLLECTOR' ? (172 - 1.5 * bs) : f === 'WHALE' ? (248 - 0.8 * bs) : 228;   // per-facet halo radial budget. COLLECTOR is bs-dependent: the outer TILE extends ~1.5*bs past the ring, so big blocks need a smaller budget to keep the whole tile inside the frame.
    const maxFit = (f, bs) => Math.max(1, Math.floor(budOf(f, bs) / bs) + 1);
    for (const f in FW) { const fw = FW[f] / fTot; const HH = (f === 'WHALE') ? WHALE_HALO : H, hhTot = HH.reduce((s, o) => s + o[1], 0) || 1; for (const [hv, hw] of HH) { const fin = Math.min(hv, maxFit(f, _BS)); m[fin] = (m[fin] || 0) + fw * (hw / hhTot); } }   // whales draw from WHALE_HALO (rarer crown); halo capped at the fixed native cell (24)
    const out = {}; for (const k in m) out[k] = 100 * m[k]; return out;
  })();
  // P(a token has a halo) = 1 - P(Halo 0). Facet-independent: the auto-fit cap only lowers high Halo values, never to 0. Used by
  // every halo-describing facet trait that is CONDITIONAL on a halo existing (Whale's Halo Pattern, Collector's Colors). Real % = weight-fraction x this.
  const _HALO_PRESENT_RATE = (() => { const H = WHALE_HALO, tot = H.reduce((s, o) => s + o[1], 0) || 1, z = (H.find(o => o[0] === 0) || [0, 0])[1]; return 1 - z / tot; })();   // WHALE-only now (only Whale's Halo Pattern uses it): P(whale has a halo) from WHALE_HALO (~36%, much lower than universal)

  // Apply the Background trait to the render params (the one wired layered trait).
  // PATTERN map: each Background value -> its base render pattern. Compound values (Blocky Frames/Rainbow Grid/Lava Rings)
  // map to their base pattern here; the blocky/deep flags are added later in generate() from the same Background value.
  const BG_PAT = { Halftone: 'halftone', Checker: 'checker', Stripes: 'stripes', Rays: 'rays', Gradient: 'gradient', Scatter: 'scatter', Rings: 'rings', Diamonds: 'diamonds', Orbs: 'orbs', Frames: 'frames', Aurora: 'aurora', Starfield: 'starfield', 'Rainbow Grid': 'grid', 'Lava Rings': 'rings' };
  const BG_NO_ORBS = UNIVERSAL_TRAITS.Background.filter(o => o[0] !== 'Orbs');   // re-pick pool for the Orbs/high-halo decouple (Orbs excluded; weights preserved so the redistribution matches _BG_FREQ)
  function applyBackground(p, bg) {
    if (bg === 'None' || bg === 'Void') { p.bg_variety = 0; }   // no pattern (Void renamed -> None)
    else if (bg === 'Medallion') { p.medallion = true; }
    else if (bg === 'Eclipse') { p.bg_variety = 1; p.bg_force_pattern = 'eclipse'; p.bg = '#070710'; }   // dark sky + bright corona
    else { p.bg_variety = 1; p.bg_force_pattern = BG_PAT[bg] || null; }
  }

  // ---- COLLECTOR walls: ARCHETYPE drives the SPREAD (synced metadata<->visual); BLOCK SIZE drives cell size (capped) ----
  const _CX = 500, _CY = 500, _R = 220, _matLo = 80, _matHi = 922;
  const _pick = (rng, a) => a[Math.floor(rng() * a.length)];
  const COLL_PAL = ['#fe0000', '#0101ef', '#fcb913', '#f0f0f0', '#efdfc8'];   // fallback
  // FROZEN archetype wall palettes — each Collector archetype gets a distinct, permanent colour scheme on the wall blocks.
  const COLL_ARCH_PAL = {
    Maxi:          ['#fe0000', '#f0f0f0', '#fcb913'],   // Compass: red arms / white diagonals+tips / gold mini-blocks
    Specialist:    ['#fcb913', '#ffd84d', '#efdfc8'],                       // GOLD-forward (warm, focused)
    Explorer:      ['#01ffff', '#9bd4ff', '#f0f0f0'],                       // CYAN/white (cool, pops on blue)
    Completionist: ['#fe0000', '#0101ef', '#fcb913', '#efdfc8', '#0a0a0a'], // full Phigures Bauhaus (the complete set)
  };
  const ARCH_BY_LAYOUT = { anchor: 'Maxi', cluster: 'Specialist', scatter: 'Explorer', dense: 'Completionist' };
  // DYNAMIC owner accent pool — owner picks halo/frame colours from here (dual-intent: loud + clean for combo rarity).
  const COLLECTOR_POOL = ['#fe0000', '#fcb913', '#16d34c', '#2f9ad3', '#8a2be2', '#f0f0f0'];   // red/gold/green/blue/purple/white (rainbow order). Owner picks the START slice; how many (K) = frozen "Colors" trait.
  const WHALE_BASE_PAL = ['#fe0000', '#16d34c', '#2f9ad3', '#8a2be2', '#f0f0f0', '#ff7a00'];   // shared dynamic palette MINUS gold (the whale face is gold, so gold blocks would be invisible) — owner-coloured FACE blocks.
  const _i = v => v | 0;
  const _solid = (x, y, w, h, c) => '<rect x="' + _i(x) + '" y="' + _i(y) + '" width="' + _i(w) + '" height="' + _i(h) + '" fill="' + c + '"/>';
  const _hollow = (x, y, sz, c) => '<rect x="' + _i(x) + '" y="' + _i(y) + '" width="' + _i(sz) + '" height="' + _i(sz) + '" fill="none" stroke="' + c + '" stroke-width="5"/>';
  function _clr(x, y, w, h) { const nx = Math.max(x, Math.min(_CX, x + w)), ny = Math.max(y, Math.min(_CY, y + h)); return Math.hypot(_CX - nx, _CY - ny) > _R + 8; }
  const _IN_LO = 76, _IN_HI = 926;   // frame interior (mat); Maxi/Explorer blocks go OUTSIDE this (the bg band)
  const _outside = (x, y, w, h) => !(x < _IN_HI && x + w > _IN_LO && y < _IN_HI && y + h > _IN_LO);
  // FRAME SAFETY: keyline sits at the mat boundary. OUTER zone = box fully outside the frame band; INNER zone = fully inside it + clear of head+halo.
  // frame geometry per block size — MUST match floatingMatTiles (integer pitch, centered => symmetric). Content boundary = the frame's
  // INNER edge so the wall fits the frame EXACTLY (never overflows past the blocks). 2026-07-11 (user: eşit aralık + wall'a tam otur).
  const _frGeom = (bs) => { const n = Math.max(8, Math.round(860 / bs)), c = Math.round(860 / n), W = n * c, x0 = Math.round((1000 - W) / 2); return { c, W, x0, inLo: x0 + c, inHi: x0 + W - c, out: x0 }; };
  let _fr = { inLo: 96, inHi: 904, out: 68 };   // set per token in collectorWall()
  const _outerOK = (x, y, w, h) => x >= 2 && y >= 2 && x + w <= 998 && y + h <= 998 && (x + w <= _fr.out || x >= 1000 - _fr.out || y + h <= _fr.out || y >= 1000 - _fr.out);
  const _innerOK = (x, y, w, h, hE) => x >= _fr.inLo && y >= _fr.inLo && x + w <= _fr.inHi && y + h <= _fr.inHi && (Math.hypot((x + w / 2) - _CX, (y + h / 2) - _CY) - Math.hypot(w, h) / 2) > hE + 6;
  // MAXI = TARGET (symmetric, deterministic, NO rng). The HALO stays (owner colours, inner ring); the target sits OUTSIDE
  // the halo edge: gold concentric rings (count from Holdings) + red crosshair + white tips + white diagonals. Bullseye at H10.
  function _wMaxi(rng, bs, pal, tier, hE) {
    tier = tier || 1; const B = bs, t01 = (tier - 1) / 9, half = B / 2; let s = '';
    hE = Math.min(hE, _R + 42);   // 2026-06-29 (user, option A): clamp the target's clearance to the HEAD edge (= the no-halo value), ignoring the actual halo, so the target ALWAYS draws (frames the head, ON TOP of the halo). A big halo no longer suppresses it down to just the centre pip; the halo shows behind/within the target.
    const cellX = i => _CX + i * B - half, cellY = j => _CY + j * B - half;
    const armOK = (x, y) => _innerOK(x, y, B, B, hE);   // 2026-06-25: Maxi target CONTAINED inside the frame (dropped the _outerOK margin tips) — nothing pokes past the frame
    const ins = (x, y) => _innerOK(x, y, B, B, hE);
    const maxCells = Math.floor((_fr.inHi - 24 - _CX - B / 2) / B);          // 2026-07-11 (user): CONSISTENT ~24px+ gap from the frame INNER edge (_fr.inHi) on EVERY block. Nothing touches the frame.
    const startK = Math.min(maxCells, Math.ceil((hE + 10) / B));              // clamp so the edge tips always draw (huge halo + big block never leaves it empty)
    const nRings = tier >= 10 ? 3 : tier >= 9 ? 2 : tier >= 4 ? 1 : 0;        // gold concentric target rings: 3rd ring at H10 (apex), 2nd at H9, 1st at H4
    const bandMax = (_fr.inHi - 24 - 500) - B;   // rings kept the SAME 24px gap from the frame inner edge (2026-07-11)
    for (let ri = 0; ri < nRings && bandMax > hE + B + 8; ri++) {
      const ringR = hE + B + (bandMax - hE - B) * (nRings === 1 ? 0.55 : ri / Math.max(1, nRings - 1) * 0.6 + 0.2);
      const kr = Math.round(ringR / B);
      for (let i = -kr - 1; i <= kr + 1; i++) for (let j = -kr - 1; j <= kr + 1; j++) {
        const d = Math.hypot(i * B, j * B);
        if (d >= ringR - half && d < ringR + half) { const x = cellX(i), y = cellY(j); if (ins(x, y)) s += _solid(x, y, B - 1, B - 1, pal[2]); }
      }
    }
    // CROSSHAIR: inner red length RAMPS with tier; white edge tips ALWAYS (so never empty, every tier differs)
    const innerLen = 1 + Math.round(t01 * (maxCells - startK));
    const innerReach = Math.min(maxCells - 1, startK + innerLen);
    for (let k = startK; k <= innerReach; k++)
      [[0, -k], [0, k], [-k, 0], [k, 0]].forEach(([i, j]) => { const x = cellX(i), y = cellY(j); if (armOK(x, y)) s += _solid(x, y, B - 1, B - 1, pal[0]); });
    [[0, -maxCells], [0, maxCells], [-maxCells, 0], [maxCells, 0]].forEach(([i, j]) => { const x = cellX(i), y = cellY(j); if (armOK(x, y)) s += _solid(x, y, B - 1, B - 1, pal[1]); });
    if (tier >= 3) {                                                          // DIAGONALS (white) ramp from tier 3
      const dLen = 1 + Math.round(((tier - 3) / 7) * (maxCells - startK - 2)), dr = Math.min(maxCells - 1, startK + dLen);
      for (let k = startK; k <= dr; k++) [[-k, -k], [k, -k], [-k, k], [k, k]].forEach(([i, j]) => { const x = cellX(i), y = cellY(j); if (ins(x, y)) s += _solid(x, y, B - 1, B - 1, pal[1]); }); }
    if (tier >= 10) {                                                         // APEX (H10): full 8-point compass — white corner tips. NO centre bull pip (2026-06-29 user: the red centre dot looked silly; removed). The 3rd ring above + these corner tips are the H9->H10 escalation.
      const kc = maxCells;
      [[-kc, -kc], [kc, -kc], [-kc, kc], [kc, kc]].forEach(([i, j]) => { const x = cellX(i), y = cellY(j); if (ins(x, y)) s += _solid(x, y, B - 1, B - 1, pal[1]); }); }   // apex corner tips complete the 8 points
    return s; }
  function _wSpec(rng, bs, pal, hf) { hf = hf || 1; let s = '';   // CROWN — a ring that hugs the head but BREATHES (2026-06-29 user: build-85 was too tight/forced, build-84 too scattered; want a circle/crown, neither tight nor loose). Moderate band + moderate density (some gaps).
    const inset = 14, lo = _matLo + inset, hi = _matHi - inset, span = hi - lo, cols = Math.floor(span / bs), off = lo + (span - cols * bs) / 2;
    const reach = bs * (2.0 + 1.8 * Math.min(1, (hf - 0.1) / 1.7));   // band ~2.0 (Holdings 1) -> ~3.8 (Holdings 10) cells
    for (let gy = 0; gy < cols; gy++) for (let gx = 0; gx < cols; gx++) {
      const x = off + gx * bs, y = off + gy * bs, d = Math.hypot(x + bs / 2 - _CX, y + bs / 2 - _CY) - (_R + 5);
      if (d < 0 || d > reach) continue;
      const t = d / reach;                                       // 0 at the head edge -> 1 at the outer tip
      if (rng() < 0.75 - 0.57 * t) s += _solid(x, y, bs - 1, bs - 1, _pick(rng, pal)); }   // ~0.75 near the head -> ~0.18 tips: reads as a ring but breathes (not solid, not scatter)
    return s; }
  // EXPLORER = CONFETTI: outer scatter (frame-safe) + INNER seep from tier 2 (small, accelerates after 5), shrinking toward the head, halo-safe.
  function _wExpl(rng, bs, pal, tier, hE) {
    tier = tier || 1; let s = '', placed = 0, gg = 0;
    const nOut = 22 + tier * 9;                                              // outer confetti ramps 1..10
    while (placed < nOut && gg < 20000) { gg++;
      const t = rng(); let w = 16, h = 16; if (t < 0.2) w = 32; else if (t < 0.34) h = 32;
      const x = 2 + rng() * (996 - w), y = 2 + rng() * (996 - h);
      if (!_outerOK(x, y, w, h)) continue; s += _solid(x, y, w, h, _pick(rng, pal)); placed++; }
    const nIn = tier < 2 ? 0 : Math.max(0, tier - 1) * 3 + Math.max(0, tier - 4) * 9;   // H2-3 a little, accelerates after 5
    if (nIn > 0) {
      const rMax = _fr.inHi - _CX - 8; let pin = 0; gg = 0;
      while (pin < nIn && gg < 12000) { gg++;
        const a = rng() * Math.PI * 2;
        const d = hE + 14 + rng() * Math.max(16, rMax - hE - 14);
        const rNorm = Math.max(0, Math.min(1, (d - hE) / Math.max(1, rMax - hE)));
        const sz = 6 + rNorm * 12;                                           // shrinks toward the head
        const x = _CX + Math.cos(a) * d - sz / 2, y = _CY + Math.sin(a) * d - sz / 2;
        if (!_innerOK(x, y, sz, sz, hE)) continue;
        s += _solid(x, y, sz, sz, _pick(rng, pal)); pin++; }
    }
    return s; }
  function _wComp(rng, bs, haloR, pal, fill) { fill = fill || 0.8; let s = '';
    // 2026-07-11 (user): Phigures blocks EQUAL gaps + fit the frame. Was cell=(hi-lo)/cols non-integer -> uneven gaps. Now INTEGER cell pitch,
    // centered inside the frame (uses _fr inner edge) with a constant GAP, never touching the frame nor the halo.
    const GAP = 28, lo = _fr.inLo + GAP, hi = _fr.inHi - GAP, span = hi - lo;
    const cols = Math.max(1, Math.round(span / bs)), cell = Math.round(span / cols);   // INTEGER pitch => uniform 1px gaps between phigures blocks
    const off = lo + Math.round((span - cols * cell) / 2);                              // centre the grid in the available span
    const clearR = haloR + bs * 0.85;                                                   // clear the head+halo with a cell margin so blocks never touch the halo
    for (let gy = 0; gy < cols; gy++) for (let gx = 0; gx < cols; gx++) {
      const x = off + gx * cell, y = off + gy * cell;
      if (Math.hypot(x + cell / 2 - _CX, y + cell / 2 - _CY) < clearR) continue;
      if (rng() < fill) s += _solid(x, y, cell - 1, cell - 1, _pick(rng, pal)); }
    return s; }
  const ARCH_LAYOUT = { Maxi: 'anchor', Specialist: 'cluster', Explorer: 'scatter', Completionist: 'dense' };   // Archetype -> spread (defines the archetype)
  function _haloR(p) { const rings = p.halo_rings || 0; if (rings < 1) return _R + 36;   // matches haloRingTiles auto-fit geometry so the Collector wall clears the ACTUAL outer halo ring (no clash)
    const bs = p.block_size || 16, bud = (p.halo_budget != null ? p.halo_budget : 228); let sp = rings > 1 ? bud / (rings - 1) : bs; sp = Math.max(bs, Math.min(sp, 1.3 * bs)); return _R + 20 + (rings - 1) * sp + bs + 8; }
  function collectorWall(g) { const p = g.params || {}; const layout = p.block_layout || 'scatter'; const bs = p.block_size || 16; const rng = mulberry32((g.tokenHash || 1) >>> 0);
    _fr = _frGeom(bs);   // frame boundary for THIS token's block size (all _innerOK/_outerOK below use it)
    const tier = (p.holdings != null) ? p.holdings : 5;            // Holdings = wall fullness 1..10 (frozen; fuller = rarer)
    const t01 = Math.max(0, Math.min(1, (tier - 1) / 9));
    const hE = _haloR(p) + 6;                                      // outer halo edge to clear
    if (layout === 'anchor') return _wMaxi(rng, bs, COLL_ARCH_PAL.Maxi, tier, hE);   // MAXI = compass
    if (layout === 'scatter') return _wExpl(rng, bs, COLLECTOR_POOL, tier, hE);       // EXPLORER = confetti 2.0
    const pal = COLL_ARCH_PAL[ARCH_BY_LAYOUT[layout]] || COLL_PAL;
    const HF = 0.12 + t01 * 1.78, FILL = 0.12 + t01 * 0.88;        // Specialist/Completionist: smooth fullness ramp
    if (layout === 'cluster') return _wSpec(rng, bs, pal, HF);
    if (layout === 'dense') return _wComp(rng, bs, _haloR(p), pal, FILL);
    return _wExpl(rng, bs, COLLECTOR_POOL, tier, hE); }

  // ---- EYES (universal): the trait recolors the face's OWN eye-socket cells, INSIDE the engine ----
  //  No pasted overlay. portrait_v6's renderFaceTiles(cellFill) paints the eye from the FACE grid (same
  //  offset/phase as every other face cell), exactly like Builder's accent_blocks -> aligned, even, integral.
  //  applyEyeTrait just sets the engine params: eye_fill_color (iris), eye_pupil_color, eye_hi_color, eye_size_extra.
  const EYE_DEF = {
    'Calm':         { calm: true, size: 0.6, brow: 0.6 },                                   // explicit 2x2 facet-toned iris blocks (paintCalm) + recess — studio design, NOT the field socket
    'Sharp':        { size: 0.0, brow: 2.2, brow_shape: 'sharp' },                          // longer + sharper angled brow -> piercing gaze
    'Sleepy':       { style: 'sleepy', fill: '#555558', size: 1.6 },                        // droopy half-lid squint (distinct from Calm + Closed)
    'Iris Blue':    { fill: '#3b7fe0', pupil: '#0a1430', hi: '#dff0ff', size: 2.7 },
    'Iris Green':   { fill: '#2fd36a', pupil: '#06230f', hi: '#e6ffe9', size: 2.7 },
    'Iris Gold':    { fill: '#fcd34d', pupil: '#3a2400', hi: '#fff7d6', size: 2.7 },
    'Iris Violet':  { fill: '#a96bff', pupil: '#1c0640', hi: '#efe2ff', size: 2.7 },
    'Glow':         { fill: '#9fe9ff', pupil: '#2a6f86', hi: '#ffffff', size: 2.9 },
    'Laser':        { laser: true, size: 0.6 },                                              // explicit glowing-red 2x2 SQUARE (paintLaser), pose-invariant — rarest eye, stands out
    'Ember':        { fill: '#ff7a1a', pupil: '#5a1500', hi: '#ffe2a0', size: 2.7 },
    'Wide':         { fill: '#eef2f6', pupil: '#0a0a14', hi: '#ffffff', size: 3.4 },
    'Void':         { fill: '#2a2a48', pupil: '#06060c', size: 2.8 },                        // deep indigo void (visible-but-empty, was near-invisible)
    'Closed':       { style: 'closed', fill: '#3a3a42', size: 1.5 },                         // eyes SHUT: dark lid line + socket hole suppressed in render -> truly closed (no open dark eye)
    'Wink':         { style: 'wink', fill: '#eef2f6', pupil: '#0a0a14', hi: '#ffffff', size: 2.9 },   // left open (light iris), right a closed line
    'Star':         { style: 'star', fill: '#ffd24a', size: 3.4 },                           // starstruck — gold star
    'Heart':        { style: 'heart', fill: '#ff4d6d', size: 3.2 },                          // in love — pink heart
    'Dollar':       { style: 'dollar', fill: '#16d34c', size: 3.2 },                         // greedy — green $
    'Spiral':       { style: 'spiral', fill: '#e2e8f0', size: 3.2 },                         // hypnotised — spiral
    'Visor':        { mask: 'visor', size: 0.8 },                                            // scanner: black band + bright horizontal bar
    'Heterochromia':{ style: 'hetero', fill: '#3b7fe0', fill2: '#2fd36a', pupil: '#0a1430', size: 2.7 },   // two-colour irises (owner-driven, DYNAMIC)
    'Bandit':       { mask: 'bandit', maskColor: '#ff2a2a', size: 0.8 },                     // masked-thief: black band + RED glowing eyes
    'Vault':        { mask: 'bandit', maskColor: '#ffd24a', size: 0.8 },                     // masked-thief, GOLD eyes (rarer)
    'X Eyes':       { xcross: true, size: 0.6, brow: 0.6 },                                  // explicit facet-toned + (cross) per eye (paintXEyes) — KO/dead look, studio design
    'Sad':          { size: 0.8, brow: 1.9, brow_shape: 'sad' },                            // colourless worried/sad expression — bold slanted brows (visible on grid)
    'Skeptical':    { size: 0.8, brow: 1.9, brow_shape: 'skeptical' },                      // colourless one-raised-brow expression (studio sketch)
  };
  function applyEyeTrait(p, ev) {                     // wire the trait into the engine's face-cell eye rendering
    const d = EYE_DEF[ev]; if (!d) return;
    p.eye_marker_color = null;                        // universal Eyes trait OWNS the eyes; drop any facet-specific marker/dot
    p.eye_mask = d.mask || null;                      // 'bandit' -> mask band overlay
    p.eye_mask_color = d.maskColor || null;
    p.eye_size_extra = d.size;
    p.eye_fill_color = d.fill || null;
    p.eye_fill2_color = d.fill2 || null;             // Heterochromia: right-eye iris
    p.eye_style = d.style || null;                   // shape style (x/closed/wink/star/heart/dollar/spiral/hetero)
    p.eye_calm = d.calm || false;                    // CALM: explicit 2x2 iris blocks (reset each call so it never leaks)
    p.eye_x = d.xcross || false;                     // X EYES: explicit facet-toned + cross (reset each call)
    p.eye_laser = d.laser || false;                  // LASER: explicit red 2x2 square (reset each call)
    p.eye_pupil_color = d.pupil || null;
    p.eye_hi_color = d.hi || null;
    p.brow_intensity = (d.brow != null) ? d.brow : 0.6;   // reset brow each time (so a previous Sharp doesn't leak)
    p.brow_shape = d.brow_shape || 'flat';                // flat / sharp / sad / skeptical
  }

  // facet key -> display name (Builder/Ghost/OG renames)
  const FACET_DISPLAY = { COLLECTOR: 'Collector', WHALE: 'Whale', DEGEN: 'Degen', BUILDER: 'Builder', OG: 'OG', GHOST: 'Ghost', NEWBIE: 'Newbie' };
  // Metadata DISPLAY rename for absence values: internal logic + rendering keep the raw value ('None'); only the final
  // metadata attribute LABEL is mapped to a thematic name. Applied last in generate(); validator reads this same map.
  // (2026-07-01 user-approved. Halo 0 deliberately NOT renamed — it is a numeric count, not 'None'.)
  const META_RENAME = { Background: { None: 'Bare' }, Gild: { None: 'Matte', Low: 'Gilded', Mid: 'Bullion' }, Glitch: { None: 'Based', Low: 'Cooked' }, Cracks: { None: 'Pristine' }, Contour: { None: 'Vanished' } };

  // Generate a token. tokenId drives FROZEN traits; owner drives the DYNAMIC personalization (accent color).
  function generate(tokenId, owner, weights) {
    weights = weights || FACET_WEIGHTS;
    const h = hashInt('FACET:' + tokenId);            // permanent token hash (Art Blocks style)
    const rng = mulberry32(h);
    // FACET = EXACT deterministic allocation (guarantees the published counts). A caller that passes a DIFFERENT
    // weights object (custom test sims) still gets the old probabilistic roll; default callers get the exact allocation.
    const facet = (weights && weights !== FACET_WEIGHTS) ? pickWeighted(rng, Object.entries(weights)) : facetOf(tokenId);
    // reuse the full facet renderer deterministically by seeding Math.random with the token's PRNG
    const orig = Math.random; Math.random = rng;
    let p;
    try { p = M.randomizeWalletParams(facet, { seed: h % 999983 }); }
    finally { Math.random = orig; }
    // ---- DYNAMIC layer: owner personalization (Tat 3) ----
    const oh = hashInt('OWNER:' + String(owner).toLowerCase());
    const hue = oh % 360;
    p.accent_color = hslToHex(hue, 72, 56);           // accent/keyline = owner color (HEX so the face-blend renders it correctly) → changes on transfer
    // POSE is DYNAMIC + UNIVERSAL (2026-06-13): owner-derived, changes on transfer. yaw ±18°, pitch ±10° (degrees).
    const op = hashInt('POSE:' + String(owner).toLowerCase());
    p.yaw = (op % 37) - 18;
    p.pitch = (Math.floor(op / 37) % 21) - 10;
    p.pose_jitter = 0;                                  // pose is fully owner-driven now (no extra seed jitter)
    // layered traits (FROZEN, rolled from the token hash) — metadata; only Background is applied to render
    const attributes = rollTraits(h, facet);
    // FACET is the PRIMARY trait — the token's whole identity. It was never pushed as an attribute (only used internally as
    // g.facet), so it was missing from metadata/grid. Add it FIRST. Its % is EXACT (allocation manifest, not a roll).
    attributes.unshift({ trait: 'Facet', value: FACET_DISPLAY[facet] || facet, pct: facetPct(facet, weights) });
    const bg = attributes.find(a => a.trait === 'Background');
    if (bg && facet !== 'COLLECTOR' && facet !== 'WHALE') applyBackground(p, bg.value);   // bg-less facets: Background must NEVER touch their params (Eclipse used to leak its dark sky into p.bg)
    p.block_size = 24;   // 2026-07-13: Block trait removed; pin block_size to 24 (~native cell 24.39) for the halo-fit / whale math (native render uses CELL, not this)
    // HALO AUTO-FIT CAP (2026-06-25): the halo is now PROPORTIONAL to the face block size (haloRingTiles). Big-block faces can't
    // fit many rings, so cap the Halo trait to what the block physically fits -> metadata ALWAYS equals the rendered ring count
    // (no more "says 11, shows 7"). maxFit must match the renderer geometry: budget 228px (R0=R+20=240 .. outer ~468) / block.
    { const _ha = attributes.find(a => a.trait === 'Halo'); if (_ha) { if (+_ha.value > 0) { const _bsz = p.block_size || 16, _bud = facet === 'COLLECTOR' ? (172 - 1.5 * _bsz) : facet === 'WHALE' ? 248 - 0.8 * _bsz : 228; const _mf = Math.max(1, Math.floor(_bud / _bsz) + 1); if (+_ha.value > _mf) _ha.value = _mf; if (+_ha.value > 7) _ha.value = 7; }   /* GLOBAL HALO MAX 7 (gruff 2026-07-20). Whale crown re-set later (line ~415), unaffected. */ if (_HALO_FREQ[_ha.value] != null) _ha.pct = _HALO_FREQ[_ha.value]; } }   // facet-aware fit: COLLECTOR bound to gallery frame (170), WHALE starts further out (248-0.8bs), others canvas (228)
    // ORBS/HALO DECOUPLE (2026-06-29, user): a 6+ ring halo fully occludes the sparse Orbs bg. If this token rolled Orbs + final
    // Halo > ORBS_HALO_MAX, swap the bg to a denser one (re-pick excluding Orbs) — the halo stays. Orbs only ever shows with Halo 0..5.
    { const _bgD = attributes.find(a => a.trait === 'Background'); const _hD = +((attributes.find(a => a.trait === 'Halo') || {}).value || 0);
      if (_bgD && _bgD.value === 'Orbs' && _hD > ORBS_HALO_MAX && facet !== 'COLLECTOR' && facet !== 'WHALE') {
        const _nb = pickWeighted(mulberry32((h ^ 0xb9c3) >>> 0), BG_NO_ORBS); _bgD.value = _nb;
        p.bg_variety = 0; p.bg_force_pattern = null; p.medallion = false; p.bg_deep = false; applyBackground(p, _nb);   // clean the stale Orbs state, then apply the new bg; its pct is re-set from _BG_FREQ at the late Background-pct fix
      } }
    // GAS GOVERNOR (2026-07-22): replaces the Degen/Ghost-only b1 guard with an ALL-FACET per-token cost budget.
    // The tokenURI must render under the 50M eth_call cap for EVERY token. Estimate the gas (in "M") from the heavy
    // traits; if it would exceed BUDGET, drop the single biggest variable layer (the bg pattern) to None. Collector(0)
    // and Whale(5) already carry no bg pattern (set below), so only facets 1/2/3/4/6 can trip this. Costs are CALIBRATED
    // to the on-chain gas sweep (Orbs heaviest after byte-opt; Scatter/Rays field-noise are heavy; Stripes/Checker/etc.
    // are cheap modulo). MIRRORED EXACTLY in FacetsGen._bgAttr + FacetsRenderV7.renderToken (must match for trait-parity
    // + render/metadata consistency). AFTER the Orbs decouple so a re-picked bg is scored too.
    if (!globalThis.FACETS_GOV_OFF) { const _FLOOR = { NEWBIE: 26, DEGEN: 28, BUILDER: 26, OG: 26, GHOST: 33 };   // 35-GRID floors (~12M below the 41 values — the 41->35 grid shrink cut ~12M/token). Ghost is a normal facet now (Ghost+bg ~44M at 35, safe). FACETS_GOV_OFF is a TOOLING-only escape hatch; never set in production.
      const _COST = { 'Orbs': 10, 'Rainbow Grid': 8, 'Gradient': 7, 'Eclipse': 7, 'Rings': 7, 'Scatter': 6, 'Rays': 5, 'Starfield': 5, 'Medallion': 3 };   // 35-grid bg costs (~0.73x the 41 values)
      const _BG = v => (_COST[v] != null ? _COST[v] : (v === 'None' ? 0 : 3));
      const _bgG = attributes.find(a => a.trait === 'Background');
      const _bgVal = _bgG ? _bgG.value : 'None';
      let _drop = false;
      if (_bgVal !== 'None' && _FLOOR[facet] != null) {
        const _hv = +((attributes.find(a => a.trait === 'Halo') || {}).value || 0);
        const _cooked = facet === 'DEGEN' && (attributes.find(a => a.trait === 'Glitch') || {}).value === 'Low';
        if (_FLOOR[facet] + _BG(_bgVal) + _hv + (_cooked ? 5 : 0) > 48) _drop = true;
      }
      if (_bgG && _drop) {
        _bgG.value = 'None'; p.bg_variety = 0; p.bg_force_pattern = null; p.medallion = false; p.bg_deep = false; } }
    // FRAME trait (renamed from Finish) drives the visual edge frame (metadata == visual). Internal param stays p.finish.
    p.finish = 'standard';   // Frame trait removed 2026-06-25 -> no edge keyline on base tokens (forge sets its own finish separately)
    // CLEAN SLATE: zero EVERY behaviour-era / archetype leftover that is NOT part of an approved trait, so ONLY the approved
    // facet systems + universal traits ever render (the facet blocks below re-set what they actually need). Nothing
    // uncontrolled (random halo brightness, ghost trails, stray block scatters, studs, base lines, meters...) reaches the art.
    p.eth_blocks = -1; p.has_ens = false; p.tx_success_rate = -1; p.grain_n = 0; p.gas_highlights = 0; p.gas_subdivisions = 0;
    p.halo_opacity = 1; p.echo_trails = 0; p.token_stack = 0; p.geo_overlay = 0; p.base_line = 0; p.color_blocks = 0;
    p.splatters = 0; p.scanlines = null; p.floating_mat = false; p.collection_wall = false; p.gallery_frame = false;
    // UNIVERSAL HALO: ring COUNT (0..11) straight from the Halo trait for EVERY facet (metadata == visual). Each facet keeps
    // its own halo COLOUR (archetype halo_palette / Degen rainbow / OG patina). WHALE overrides below (halo_rings=0 + custom gold halo).
    p.halo_rings = +((attributes.find(a => a.trait === 'Halo') || {}).value || 0);
    if (facet === 'COLLECTOR') {
      p.collection_wall = false; p.color_blocks = 0;
      p.bg_variety = 0; p.bg_force_pattern = null; p.bg_deep = false; p.medallion = false;   // COLLECTOR has its own gallery wall, not a universal bg pattern
      const _bgi = attributes.findIndex(a => a.trait === 'Background'); if (_bgi >= 0) attributes[_bgi].value = 'None';   // metadata 'None' (uniform Background trait -> correct rarity); art = its own wall
      p.bg = ((attributes.find(a => a.trait === 'Wall') || {}).value === 'Midnight') ? '#070710' : '#0101ef';   // Wall trait = gallery backdrop colour (frozen; Midnight also silvers the face tint)
      const arch = (attributes.find(a => a.trait === 'Archetype') || {}).value || 'Explorer';
      p.block_layout = ARCH_LAYOUT[arch] || 'scatter';   // Archetype = the spread (FROZEN); wall COLOUR = the archetype palette (collectorWall)
      p.holdings = +((attributes.find(a => a.trait === 'Holdings') || {}).value || 5);   // wall fullness tier 1..10 (FROZEN rarity; fuller = rarer)
      // HALO COLOUR = a SINGLE owner-derived colour (DYNAMIC, shifts on transfer). 2026-06-27 (user): the old multi-colour "Colors" COUNT trait was REMOVED — its colours were random (meaningless) and competed with the busy gallery wall; one clean colour reads more premium and drops Collector to 3 facet traits (helps rarity balance).
      const start = oh % COLLECTOR_POOL.length;            // DYNAMIC = owner -> the halo colour shifts on transfer
      p.halo_palette = [COLLECTOR_POOL[start]]; p.halo_rainbow = false;
      p.accent_color = COLLECTOR_POOL[start];             // frame + bg-accent = owner's colour
      p.floating_mat = true; p.mat_color = '#01014a';     // COLLECTOR's gallery mat + accent-colour frame (its approved frame)
      p.halo_budget = 172 - 1.5 * (p.block_size || 16);   // 2026-06-25 (Issue 1): bound the halo (incl. the outer tile ~1.5*bs overhang) INSIDE the gallery frame so it never pokes outside; the Halo count is capped to this budget at generation -> metadata == visual.
    }
    if (facet === 'BUILDER') {   // BUILDER = Artist + Dev twin (integral accent blocks in the face)
      const disc = (attributes.find(a => a.trait === 'Role') || {}).value || 'Artist';
      const out = (attributes.find(a => a.trait === 'Shipped') || {}).value || 'Few';
      const _bsz = p.block_size || 16, _faceCells = Math.PI * 220 * 220 / (_bsz * _bsz);   // ~face cell count at this block size
      const _frac = out === 'Prolific' ? 0.42 : out === 'Many' ? 0.21 : 0.105;   // Many = 1/2 Prolific, Few = 1/4 Prolific (fixed pixel-grid made Few/Many read too dense)              // 2026-06-27: count is now a FRACTION of the face (scales with block size) so Prolific densely WRAPS the base at every block size (was a fixed 24 -> sparse on small blocks, weak ladder)
      const count = Math.max(3, Math.round(_faceCells * _frac));
      p.block_on_face = false; p.color_blocks = 0;   // drop the old floating gold overlay
      // IDENTITY works = FROZEN (Dev = green deploy LINES, Artist = gold work SCATTER); count = Output.
      if (disc === 'Dev') { p.fg = '#1f44ff'; p.art_blocks = { colors: ['#16d34c', '#39ff14', '#0a8a3a', '#bdffd6'], count: count, run: 4 }; }   // FROZEN token art ('the works') - NOT owner-derived
      else { p.art_blocks = { colors: ['#fcb913', '#ffd84d', '#e8a51e', '#fff3c4'], count: count }; }   // FROZEN token art ('the works') - NOT owner-derived
      // DYNAMIC: separate owner-coloured blocks (shared palette) that change on transfer — the works are NOT touched.
      const _bs = hashInt('BUILDACC:' + String(owner).toLowerCase()) % COLLECTOR_POOL.length;
      p.owner_blocks = { colors: [COLLECTOR_POOL[_bs], COLLECTOR_POOL[(_bs + 2) % COLLECTOR_POOL.length]], count: 8 };
    }
    if (facet === 'WHALE') {   // WHALE = gold halo/aura signature. Ring count from universal Halo, size from Block, drawn custom.
      p.bg_variety = 0; p.bg_force_pattern = null; p.bg_deep = false; p.medallion = false;   // WHALE has its own gold aura, not a universal bg pattern
      const _wbgi = attributes.findIndex(a => a.trait === 'Background'); if (_wbgi >= 0) attributes[_wbgi].value = 'None';   // metadata 'None' (uniform Background trait -> correct rarity); art = its own gold aura
      // 2026-06-27 (user): WHALE halo is its OWN rarer distribution (gold crown special: ~2/3 no halo, big crowns very rare). Re-roll the Halo for whales only (FROZEN by token hash), then apply the whale fit cap. Metadata pct = blended-global _HALO_FREQ (validator-consistent).
      { const _wr = mulberry32((h ^ 0xca11) >>> 0); let _whv = pickWeighted(_wr, WHALE_HALO); const _wbs = p.block_size || 16, _wmf = Math.max(1, Math.floor((248 - 0.8 * _wbs) / _wbs) + 1); if (_whv > _wmf) _whv = _wmf; const _wha = attributes.find(a => a.trait === 'Halo'); if (_wha) { _wha.value = _whv; if (_HALO_FREQ[_whv] != null) _wha.pct = _HALO_FREQ[_whv]; } p.whale_halo_rings = _whv; }   // gold halo ring COUNT from the WHALE-specific distribution
      p.halo_rings = 0;                                                      // engine's own halo off; Whale draws its custom gold halo
      p.whale_pattern = 'Solid';   // 2026-06-26 REDESIGN: halo SHAPE is now UNIFORM (plain gold ring) like every facet's halo. The "Halo Pattern" trait picks the gold TREATMENT (3 values), not the shape -> Whale = 2 facet traits x 3 values, balanced with the rest.
      const _hpV = (attributes.find(a => a.trait === 'Halo Pattern') || {}).value || 'Solid';
      p.whale_fill = ({ Solid: 'Solid', Beaded: 'Radiant', Gradient: 'Gradient' })[_hpV] || 'Solid';   // gold treatment: flat gold / white+gold blocks / gold gradient
      if (p.whale_halo_rings <= 0) { const _hpi = attributes.findIndex(a => a.trait === 'Halo Pattern'); if (_hpi >= 0) attributes.splice(_hpi, 1); }   // Halo 0 = no halo -> no Halo Pattern (conditional)
      else { const _hp = attributes.find(a => a.trait === 'Halo Pattern'); if (_hp) _hp.pct *= _HALO_PRESENT_RATE; }   // pct over whales WITH a halo
      // DYNAMIC base: owner-coloured accent blocks on the GOLD FACE. Positions are frozen by the token seed ("determined blocks"); the COLOUR comes from the shared palette and changes on transfer. Halo stays gold.
      const _ws = hashInt('WHALEACC:' + String(owner).toLowerCase()) % WHALE_BASE_PAL.length;
      p.owner_blocks = { colors: [WHALE_BASE_PAL[_ws], WHALE_BASE_PAL[(_ws + 2) % WHALE_BASE_PAL.length]], count: 11, seed: 7919 };   // DYNAMIC (owner). seed pins the original placement so the rename is visually identical.
      p.whale_glow = 1.0;   // FIXED brightness (Glow is no longer a trait) — matches other facets' halo_opacity default; per-ring fade handled in whaleHalo
      // GILD reverted 2026-06-26: affects ONLY the FACE gold richness (the halo treatment moved to the Halo Pattern trait above).
      const gildV = (attributes.find(a => a.trait === 'Gild') || {}).value || 'None';
      p.gild_min = ({ None: null, Low: 0.62, Mid: 0.44 })[gildV];   // 2026-07-18 (user): Gilded = ~1/3 of Bullion, "the middle of Matte and Bullion". Low 0.70->0.62 (~58 cells ≈ 1/3 of Bullion's ~166). Was top-12%/dim -> read like Matte.
      p.gild_level = ({ None: 0, Low: 2, Mid: 2 })[gildV];           // brightness tier: Low now 1->2 = same SHINY gold as Bullion, just fewer cells (coverage is the only difference). Was DIM (half) which made Gilded invisible.
    }
    if (facet === 'DEGEN') {   // DEGEN = RGB chromatic glitch + PnL tx-history orbit.
      const glitch = (attributes.find(a => a.trait === 'Glitch') || {}).value || 'None';
      p.rgb_offset = ({ None: 0, Low: 0.9 })[glitch];   // 2026-07-16 (user): Glitch now 2 levels only — None (clean "good" degen) / Low (strong "fried" degen, str 0.9). Extreme shift-2/multi-bar reserved for FORGE.   // 2026-06-30 (user): REVERTED to the old chromatic look (corrupt redesign undone, owner blocks restored), tuned CLEARER — None clean / Low mild readable / Med stronger but the face still reads (not the muddy 2.0). Part-whole = the face stays whole, R/G/B channels are the parts.
      if (p.rgb_offset == null) p.rgb_offset = 0.6;
      // PnL = the trader's fate (rarity spine). green = won tx, red = lost; extreme states are DRAMATIC + flood the face.
      const pnl = (attributes.find(a => a.trait === 'PnL') || {}).value || 'Flat';
      const M = { Flat: [3, 2, 0], Chop: [8, 8, 0], Printing: [20, 3, 0], Bleeding: [3, 20, 0], Rekt: [2, 22, 0], 'Up Only': [28, 0, 0] };
      const v = M[pnl] || [6, 6, 0];
      p.splatters = 0;
      const _onFace = (pnl === 'Printing' || pnl === 'Bleeding' || pnl === 'Rekt');
      if (_onFace) {   // 2026-06-27 FIX (user): on-face flood is now INTEGRATED as shaded FACE cells (like OG cracks), not a flat pasted overlay that looked "extra" and didn't fill the base blocks
        p.face_splat = { green: v[0], red: v[1], gold: v[2] };
        p.splat_green = 0; p.splat_red = 0; p.splat_gold = 0; p.splat_on_face = false;   // overlay off -> the flood is drawn inside renderFaceTiles
      } else {
        p.splat_green = v[0]; p.splat_red = v[1]; p.splat_gold = v[2]; p.splat_on_face = false;   // Flat/Chop/Up Only = off-face cloud (overlay kept)
      }
      if (pnl === 'Rekt') { p.cracks = { count: 4, goldFrac: 0 }; p.crack_color = '#fe0000'; p.crack_solid = true; }   // LIQUIDATED -> red fractures CARVED into the face, solid (no gaps)
      else if (pnl === 'Up Only') { p.splat_gold_varied = true; }   // UP ONLY -> varied-size GREEN confetti (mini->full) AROUND the head only; nothing on the face
      // DYNAMIC (c): owner rotates the rainbow halo START + owner-coloured accent blocks on the face (shared palette)
      p.halo_rot = hashInt('HALOROT:' + String(owner).toLowerCase()) % 10;
      const _ds = hashInt('DEGENACC:' + String(owner).toLowerCase()) % COLLECTOR_POOL.length;
      p.owner_blocks = { colors: [COLLECTOR_POOL[_ds], COLLECTOR_POOL[(_ds + 2) % COLLECTOR_POOL.length]], count: 10, seed: 7919 };   // DYNAMIC (owner). seed pins the original placement so the rename is visually identical.
    }
    if (facet === 'OG') {   // OG = weathered venerated bust. Patina = oxidation FLECK colour (base kept), Cracks = kintsugi fissures.
      p.fg = '#dcdcd4'; p.aging_strength = 0.6; p.highlight_chance = 0.13; p.color_blocks = 0; p.echo_trails = 0;
      const pat = (attributes.find(a => a.trait === 'Patina') || {}).value || 'Crimson';
      p.accent_color = ({ Crimson: '#d83030', Verdigris: '#2fd39a', Rust: '#e07020', Azure: '#2f9ad3', Gilt: '#ffd24a' })[pat] || '#d83030';   // Gilt = rich gold (reverted); Bronze removed (too close to Rust)
      const cr = (attributes.find(a => a.trait === 'Cracks') || {}).value || 'None';
      p.cracks = ({ None: null, Shattered: { count: 3, goldFrac: 0 }, Kintsugi: { count: 4, goldFrac: 1.0 } })[cr];   // 2026-06-25: Hairline + Gilded REMOVED (3 dark variants read identical); Kintsugi buffed (count 3->4, bright gold) so it stands out
      // halo COUNT now set universally above; OG draws it in the PATINA colour (no rainbow / no archetype palette).
      p.halo_rainbow = false; p.halo_palette = null;
      // DYNAMIC: pose (universal) + owner-hued oxidation flecks. Bumped 2026-07-16 (user, "sadece a"): count 4→7, saturation 32/26→48/40 so the owner hue READS on transfer, but kept earthy/aged (not neon; still muted vs other facets' vivid pool). Patina + Cracks stay FROZEN.
      const _oh = hashInt('OWNER:' + String(owner).toLowerCase()) % 360;
      p.owner_blocks = { colors: [hslToHex(_oh, 48, 46), hslToHex((_oh + 22) % 360, 40, 40)], count: 7 };
    }
    if (facet === 'NEWBIE') {   // GENESIS: green newcomer materializing from the void. Bloom = colour/radiance; Form = how assembled (whole vs still-fragmented).
      p.color_blocks = 0; p.echo_trails = 0;
      const bloom = (attributes.find(a => a.trait === 'Bloom') || {}).value || 'Bright';
      // BLOOM = radiance ramp: each level its own green palette (Dim dark/muted -> Bright clear -> Nova radiant near-white).
      p.face_palette = ({
        Dim:    ['#123a28', '#1a5238', '#246b48', '#327d58', '#46906a'],   // faint, just materializing — dark/muted green
        Bright: ['#1d6e44', '#27905a', '#38b06e', '#5fd090', '#92e6b8'],   // formed — clear bright green
        Nova:   ['#2a9560', '#37c878', '#5fe39a', '#b8f5d4', '#eafff5'],   // fully bloomed — radiant, near-white glow
      })[bloom] || null;
      // FORM = how FORMED vs fragmented (2026-06-30, replaces Spark): Whole = clean/solid; Forming = some cells dissolved + a few drifting fragments; Scattered = heavily fragmented + many drifting pieces (caught mid-materialization).
      const form = (attributes.find(a => a.trait === 'Form') || {}).value || 'Whole';
      p.face_disperse = ({ Whole: null, Forming: 0.88, Scattered: 0.68 })[form];   // null = solid; lower = more face/contour cells dropped (gappy, dissolving) — reuses the FORGE scatter mechanism
      p.contour_solid_bands = ({ Whole: 5, Forming: 4, Scattered: 3 })[form] || 5;  // whole = full solid contour; scattered = more outline (skeletal)
      p.spark_count = ({ Whole: 0, Forming: 5, Scattered: 13 })[form] || 0;          // detached fragments — rendered (sparkTiles) as bs-cells in the figure's OWN face_palette colours, flung randomly
      // DYNAMIC (standard model): a few owner-coloured face blocks (shared palette) + pose.
      const _ns = hashInt('NEWBIEACC:' + String(owner).toLowerCase()) % COLLECTOR_POOL.length;
      p.owner_blocks = { colors: [COLLECTOR_POOL[_ns], COLLECTOR_POOL[(_ns + 2) % COLLECTOR_POOL.length]], count: 7 };
    }
    if (facet === 'GHOST') {   // GHOST: drop archetype bits that clash with UNIVERSAL traits + remove scanlines (user). Base discussed next.
      p.scanlines = null;                                                                       // hologram scanlines OFF (halo COUNT set universally above; Ghost keeps its archetype cyan halo palette)
      // CONTOUR: 1-cell silhouette ring, colour varies by token id (placeholder). RULE: Medallion bg has its own strong
      // self-frame (royal seal) -> skip the contour so the two don't clutter/overlap.
      const ghBg = (attributes.find(a => a.trait === 'Background') || {}).value;
      // GHOST GRAIL (2026-07-01 user): guarantee >=2 ultra-ethereal ghosts = most-faded Veil ('Light') + no Contour ('None'). Deterministic (reveal-seeded, like the vomit allocation). pct recomputed from weights so consistency/accuracy hold.
      if (ghostGrailOf(tokenId)) {
        const _vw = FACET_TRAITS.GHOST.Veil, _cw = FACET_TRAITS.GHOST.Contour, _fs = facetPct('GHOST', weights) / 100;
        const _va = attributes.find(a => a.trait === 'Veil'); if (_va) { _va.value = 'Light'; _va.pct = 100 * ((_vw.find(o => o[0] === 'Light') || [0, 0])[1] / _vw.reduce((s, o) => s + o[1], 0)) * _fs; }
        const _ca = attributes.find(a => a.trait === 'Contour'); if (_ca) { _ca.value = 'None'; _ca.pct = 100 * ((_cw.find(o => o[0] === 'None') || [0, 0])[1] / _cw.reduce((s, o) => s + o[1], 0)) * _fs; }
      }
      const cont = (attributes.find(a => a.trait === 'Contour') || {}).value || 'Color';   // CONTOUR (frozen): Color = token-hued ring / Black / None (Medallion bg still suppresses it — has its own frame)
      p.ghost_outline = (ghBg === 'Medallion' || cont === 'None') ? null : cont === 'Black' ? '#0a0a0a' : 'hsl(' + (h % 360) + ',72%,55%)';
      // HALO CLEARANCE (2026-08-12, gruff). The contour is a 1-cell band just outside the silhouette and it is
      // painted AFTER the halo (render_v7 :2116 vs :2106), while the halo's inner ring sits at R+20 — inside that
      // band, since a cell is 1000/35 = 28.57. So the contour ate the inner ring: at 1 ring the whole halo vanished,
      // at 2+ only the inner one, which is why it read as "a few blocks depending on the pose". 281 of 6,969 tokens.
      // ⚠️ DERIVED FROM `ghost_outline` ON PURPOSE, on the line below it. The gate is "does this token have a
      //    contour", and that question already has exactly one answer above. A second copy of the Medallion/None
      //    condition would be the _wWhaleHalo shape all over again: a rule in two places, updated in one.
      p.halo_clear_contour = !!p.ghost_outline;
      // REVERSE BG: Ghost is the NEGATIVE facet. White base + soft dark pattern (legible on white, keeps the pale/ghost feel).
      // The Background trait VALUE (Grid/Rays/Rings/Halftone/Spectrum) is preserved by applyBackground; here we only INVERT the colour treatment.
      p.bg = '#f4f4f2';                                     // clean soft-white base (Void ghosts stay pure white)
      if (p.bg_variety) p.bg_palette = ['#34343a', '#44444c', '#262629'];   // soft cool charcoals — NOT full black, so the pattern stays ghostly
      // VEIL: how visible the ghost is. Face interior fades; contour stays crisp.
      const veilV = (attributes.find(a => a.trait === 'Veil') || {}).value || 'Shadow';
      p.veil_opacity = ({ Shadow: 1.0, Heavy: 0.5, Light: 0.28 })[veilV] || 1.0;   // 2026-07-01 (user): names REVERSED — Shadow = most present/solid (1.0), Heavy = mid (0.5), Light = most ethereal/faded (0.28). All 3 read distinctly.
      // DYNAMIC (like most facets): a few owner-coloured face blocks (shared palette) + pose. Veil + Contour stay FROZEN.
      const _gs = hashInt('GHOSTACC:' + String(owner).toLowerCase()) % COLLECTOR_POOL.length;
      p.owner_blocks = { colors: [COLLECTOR_POOL[_gs], COLLECTOR_POOL[(_gs + 2) % COLLECTOR_POOL.length]], count: 7 };
    }
    // BACKGROUND compound flags (set LATE so facet blocks don't override). The Background VALUE is the single source:
    //   Checker / Blocky Frames -> blocky mosaic fill ; Rainbow Grid / Lava Rings -> deep colour-riot ; Medallion -> ~half get a shadow+light gradient coin (Leviathan-style).
    if (p.bg_variety && !p.medallion) {
      const _bgv = (attributes.find(a => a.trait === 'Background') || {}).value || '';
      if (_bgv === 'Checker') p.bg_blocky = true;
      if (_bgv === 'Rainbow Grid') { p.bg_deep = true; p.bg_deep_scheme = 'rainbow'; p.bg_deep_bands = [8, 12, 16][hashInt('DEEP:' + tokenId) % 3]; }
      else if (_bgv === 'Rings') { p.bg_deep = true; p.bg_deep_scheme = ['rainbow', 'lava', 'aqua', 'verdant'][hashInt('RINGSCHEME:' + tokenId) % 4]; p.bg_deep_bands = [8, 12, 16][hashInt('DEEP:' + tokenId) % 3]; }   // RINGS = colourful (4 schemes per token), user 2026-06-24
    }
    if (p.medallion) {   // EVERY medallion = shadow+light gradient coin in a per-token COLOUR (not just gold), user 2026-06-24
      const _mh = hashInt('MEDAL:' + tokenId) % 360;
      p.medallion_pal = [hslToHex(_mh, 60, 22), hslToHex(_mh, 66, 38), hslToHex(_mh, 72, 54), hslToHex(_mh, 74, 70), hslToHex(_mh, 78, 86)];
      p.medallion_ring = hslToHex(_mh, 72, 56); p.medallion_outer = '#0a0a0a';
    }
    // FIX (2026-06-25): Background pct = TRUE collection frequency. Collector/Whale forced to None kept their rolled value's
    // pct -> None showed an inconsistent 0-13% per token. Now every token's Background pct is the real % over 10000.
    { const _bgA = attributes.find(a => a.trait === 'Background'); if (_bgA && _BG_FREQ[_bgA.value] != null) _bgA.pct = _BG_FREQ[_bgA.value]; }
    // EYES (universal): wire the trait into the face's own eye socket (integral + proportional to Block)
    const _eyesV = (attributes.find(a => a.trait === 'Eyes') || {}).value || 'Calm';
    p.eye_piece = null;
    if (typeof FACET_EYES !== 'undefined' && FACET_EYES.defs && FACET_EYES.defs[_eyesV]) {
      p.eye_piece = _eyesV;   // the Eyes value is an overlay PIECE (Shades/Cyclops/...) -> render the piece; engine eye suppressed
    } else {
      applyEyeTrait(p, _eyesV);
      if (_eyesV === 'Heterochromia') {   // DYNAMIC: the two iris colours come from the OWNER (change on transfer)
        const _eh = hashInt('EYEHET:' + String(owner).toLowerCase()) % 360;
        p.eye_fill_color = hslToHex(_eh, 70, 56); p.eye_fill2_color = hslToHex((_eh + 150) % 360, 70, 56);
      }
    }
    // MOUTH (universal): wire the trait into the face's own mouth (integral, block-snapped, pose-aware, facet-tinted).
    // RAINBOW VOMIT is a small ~12-token PROBABILISTIC allocation (vomitOf, deterministic from the reveal seed, ANY facet).
    // Designated tokens are FORCED to vomit; any non-designated token that rolled it is re-rolled. Placement is unrestricted
    // because the rainbow stream is a TOP layer over everything (a busy bg behind it does not matter -> no clean-bg gating needed).
    let mouthV = (attributes.find(a => a.trait === 'Mouth') || {}).value || 'Stoic';
    const _mi = attributes.findIndex(a => a.trait === 'Mouth');
    if (vomitOf(tokenId)) {
      mouthV = 'Rainbow Vomit';
      if (_mi >= 0) { attributes[_mi].value = 'Rainbow Vomit'; attributes[_mi].pct = 100 * 12 / SUPPLY; }   // ~12 expected -> ~0.12%
    }
    // ⚠️ THE `else if (mouthV === 'Rainbow Vomit')` RE-ROLL LIVED HERE AND IS GONE (2026-08-08).
    // `Rainbow Vomit` used to sit in the Mouth weight table AND be forced by `vomitOf`, so a token could
    // roll it without being designated — and then it was thrown away and re-rolled from the pool minus
    // that entry. Net effect: the table entry never produced a single token, it just spent 1/321 of the
    // mouth probability and gave it back through a second hash. Measured: `vomitOf` count and
    // `Mouth = Rainbow Vomit` count were IDENTICAL (7 and 7), which is what proves the entry was inert.
    // The entry is out of the table now, so nothing can roll it and this branch is unreachable.
    p.mouth_piece = null;
    if (typeof FACET_MOUTHS !== 'undefined' && FACET_MOUTHS.defs && FACET_MOUTHS.defs[mouthV]) {
      p.mouth_piece = mouthV; p.mouth_style = 'none'; p.mouth_shape = null;   // the Mouth value is a PIECE (Bubblegum/...) -> render the piece; engine mouth suppressed
    } else {
      applyMouthTrait(p, mouthV);
    }
    // HEADPIECE (universal): block-snapped silhouette on the head top (engine headpieceTiles). Finish drives the colour
    // treatment; for Solid/Gradient we pick colours from the token hash. When None, splice the Finish attr (no phantom).
    const hpV = (attributes.find(a => a.trait === 'Headpiece') || {}).value || 'None';
    const _fiIdx = attributes.findIndex(a => a.trait === 'Headpiece Finish');
    if (hpV !== 'None') {
      p.headpiece = hpV;
      const hpFin = (_fiIdx >= 0 ? attributes[_fiIdx].value : 'Solid');
      p.headpiece_finish = hpFin;
      const hr = mulberry32(hashInt('HP:' + tokenId));
      if (hpFin === 'Solid') { const PAL = ['#15151c', '#f0f0f0', '#fe0000', '#2f9ad3', '#fcb913', '#16d34c', '#8a2be2']; p.headpiece_color = PAL[Math.floor(hr() * PAL.length)]; }
      else if (hpFin === 'Gradient') { const GP = [['#3a2c6e', '#cfd8ff'], ['#5a0a0a', '#ff9a9a'], ['#0a3a2a', '#9dffd0'], ['#3a2a00', '#ffe08a'], ['#0a2a4a', '#9ad8ff']]; const g2 = GP[Math.floor(hr() * GP.length)]; p.headpiece_color = g2[0]; p.headpiece_color2 = g2[1]; }
    } else if (_fiIdx >= 0) { attributes.splice(_fiIdx, 1); }
    for (const a of attributes) { const r = META_RENAME[a.trait]; if (r && r[a.value] != null) a.value = r[a.value]; }   // DISPLAY rename of absence values (Bare/Matte/Clean/Pristine/Vanished) — LAST step, after all internal 'None' reads/forcing above; rendering uses params, not labels, so visuals unaffected
    return { name: 'Facet #' + tokenId, id: tokenId, facet, facetPct: facetPct(facet, weights), tier: TIER[facet], attributes, params: p, tokenHash: h, ownerHue: hue, owner: owner };   // `id` added 2026-07-30: the FORGE seeds off the burned tokenIds ALONE (owner-independent), so it needs the id without parsing the name
  }

  // WHALE: custom GOLD halo/aura. Ring COUNT from the universal Halo trait, ring SIZE from Block, look from
  // Halo Pattern (Rows/Diagonal/Spokes/Dashed) + Glow (opacity gradient, inner bright -> outer fade). Ported 1:1
  // from the studio design. Gold base tiles + white accent tiles per the pattern.
  function _pip(x, y, poly) {   // point-in-polygon (ray cast)
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  }
  function whaleHalo(g) {
    const p = g.params || {};
    const rings = p.whale_halo_rings || 0; if (rings <= 0) return '';
    const pat = p.whale_pattern || 'Solid';      // FROZEN rarity: the halo SHAPE (16 forms)
    const fill = p.whale_fill || 'Gold';         // FROZEN: gold treatment from the Halo Pattern trait (Solid/Radiant/Gradient); extra fills only via facet_tester
    const baseOp = (p.whale_glow != null) ? p.whale_glow : 0.62;
    const bs = p.block_size || 16;
    // The halo is built by GRID ITERATION using the SAME basis as the face (each cell's CENTRE distance from the head
    // centre, exactly like the face's inFace test) -> the halo is CONCENTRIC with the face at EVERY block size and can
    // never have angular-aliasing gaps. The jaw polygon clips the chin so the halo opens naturally at the bottom.
    const A = P.getAnchors(p.yaw || 0, p.pitch || 0);
    const jaw = [A.hingeL, A.gonialL, A.chin, A.gonialR, A.hingeR];
    const clearR = _R + bs * 0.8;                                                     // face-clear radius: head circle + face-mosaic overhang (~0.7bs past _R)
    // INFLATE the jaw outward ~1.3 cells from its centroid so the halo keeps a 1-cell gap from the chin/jaw too (the jaw swings with the dynamic pose).
    const _jcx = (jaw[0][0] + jaw[1][0] + jaw[2][0] + jaw[3][0] + jaw[4][0]) / 5, _jcy = (jaw[0][1] + jaw[1][1] + jaw[2][1] + jaw[3][1] + jaw[4][1]) / 5;
    const jawInf = jaw.map(pt => { const dx = pt[0] - _jcx, dy = pt[1] - _jcy, d = Math.hypot(dx, dy) || 1, m = (d + bs * 1.3) / d; return [_jcx + dx * m, _jcy + dy * m]; });
    // ROBUST overlap guard: test the cell BOX, not just its centre. Circle = exact box->centre nearest distance (catches corner pokes); jaw = centre + 4 corners.
    function nearFace(x, y) {
      const nx = Math.max(x, Math.min(_CX, x + bs)), ny = Math.max(y, Math.min(_CY, y + bs));
      if (Math.hypot(nx - _CX, ny - _CY) < clearR) return true;
      const c = [[x + bs / 2, y + bs / 2], [x, y], [x + bs, y], [x, y + bs], [x + bs, y + bs]];
      for (let k = 0; k < c.length; k++) if (_pip(c[k][0], c[k][1], jawInf)) return true;   // inflated jaw -> keeps a gap
      return false;
    }
    const GOLD = '#fcb913', WHITE = '#fff6d8', CREAM = '#fff2c4';   // halo stays GOLD family only (no owner colour)
    const RAYS = 12;
    // ---- SHAPE (frozen): ring spacing ----
    const spm  = pat === 'Pinstripe' ? 2.1 : pat === 'Orbit' ? 1.65 : 1.3;
    let sp = Math.round(bs * spm);
    const _wbud = 468 - (_R + bs * 0.8); if (rings > 1) sp = Math.max(bs, Math.min(sp, Math.floor(_wbud / (rings - 1))));   // 2026-06-25: compress spacing so rings ALWAYS fit the canvas (no off-canvas clip); count capped at generation so visible == Halo trait
    // SHAPE: does a cell exist at slot k (of N cells around the ring), ring i, angle a?  (y is DOWN, so top of head = sin(a) < 0)
    function cellExists(k, N, i, a) {
      const f = k / N;
      switch (pat) {
        case 'Dashed':   return k % 3 !== 2;                                 // 2 on, 1 off
        case 'Dotted':   return k % 2 === 0;                                 // bead every other cell
        case 'Orbit':    return k % 2 === 0;                                 // sparse, on an ellipse (see radial)
        case 'Crescent': return Math.sin(a) <= 0.45;                         // open at the bottom
        case 'Wings':    return Math.abs(Math.cos(a)) > 0.5;                 // two side lobes
        case 'ArcTop':   return Math.sin(a) < -0.35;                         // thin band above the head
        case 'Flare':    return Math.sin(a) > -0.05;                         // dense lower half -> uplight
        case 'Rays':     return (f * RAYS) % 1 < 0.30;                       // 12 radial spokes
        case 'Star':     return (f * 6) % 1 < 0.16;                          // 6 narrow long points
        case 'Pinwheel': return ((f * 8) + i * 0.6) % 1 < 0.26;             // 8 spiralled arms
        case 'Sunburst': { const s6 = f * 12, seg = s6 % 1; return seg < 0.28 && (Math.floor(s6) % 2 === 0 || i < Math.ceil(rings / 2)); }   // alt long/short
        case 'Crown':    return Math.sin(a) < -0.15 && ((f * 9) % 1) < 0.34; // spikes on the top arc
        default:         return true;                                        // Solid, Pinstripe, Diamond
      }
    }
    // SHAPE metric distance (circle / diamond / ellipse): a cell belongs to a ring by its distance in this metric.
    const r0 = _R + Math.round(bs * 2.0);                       // inner ring radius (concentric; grid-iteration keeps it complete at this radius)
    const tol = (pat === 'Diamond') ? bs * 0.72 : bs * 0.55;    // ring thickness (~1 cell), gaps remain between rings via sp
    function metric(dx, dy) {
      if (pat === 'Diamond') return Math.abs(dx) + Math.abs(dy);
      if (pat === 'Orbit')   return Math.hypot(dx / 1.32, dy / 0.72);
      return Math.hypot(dx, dy);
    }
    function lerpHex(h1, h2, u) {
      const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
      const r = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * u);
      const g = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * u);
      const bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * u);
      return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
    }
    // FILL (dynamic): colour of an existing cell
    function cellColor(k, i) {
      switch (fill) {
        case 'Beaded':   return k % 2 === 0 ? WHITE : GOLD;
        case 'Banded':   return i % 2 === 1 ? CREAM : GOLD;
        case 'Sparkle':  return ((k * 7 + i * 13) % 9 === 0) ? WHITE : GOLD;
        case 'Tipped':   return i >= rings - 1 ? WHITE : GOLD;
        case 'Gradient': return lerpHex('#ffd24a', '#e0a400', ((k * 7 + i * 3) % 5) / 4);   // GRADIENT: per-block gold mosaic around the BASE gold (#fcb913), rich not dim (saf altin bloklu)
        case 'Radiant':  return (k + i) % 2 === 0 ? WHITE : GOLD;   // BEADED: alternating white + gold blocks (beyaz bloklu)
        default:         return GOLD;                                         // SOLID: flat full gold
      }
    }
    // GRID ITERATION: walk every grid cell in the halo's bbox, assign it to the nearest ring by metric distance.
    // SAME cell-centre basis as the face -> concentric at ANY block size; full band coverage -> no aliasing gaps.
    const maxR = r0 + (rings - 1) * sp + bs;
    const gx0 = Math.max(0, Math.floor((_CX - maxR) / bs)), gx1 = Math.min(Math.floor(999 / bs), Math.ceil((_CX + maxR) / bs));
    const gy0 = Math.max(0, Math.floor((_CY - maxR) / bs)), gy1 = Math.min(Math.floor(999 / bs), Math.ceil((_CY + maxR) / bs));
    const buckets = [];
    for (let i = 0; i < rings; i++) buckets.push({});
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      const x = gx * bs, y = gy * bs, cx = x + bs / 2, cy = y + bs / 2;
      const d = metric(cx - _CX, cy - _CY);
      const i = Math.round((d - r0) / sp);
      if (i < 0 || i >= rings) continue;
      if (Math.abs(d - (r0 + i * sp)) > tol) continue;             // keep ~1-cell-thick rings (gaps between)
      if (nearFace(x, y)) continue;                                // never overlap the base (head circle + face mosaic + jaw)
      const a = Math.atan2(cy - _CY, cx - _CX);
      const N = Math.max(8, Math.round(2 * Math.PI * (r0 + i * sp) / bs));
      const k = Math.round(((a + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * N) % N;   // stable per-cell index 0..N-1
      if (!cellExists(k, N, i, a)) continue;
      const col = cellColor(k, i);
      if (!buckets[i][col]) buckets[i][col] = '';
      buckets[i][col] += '<rect x="' + x + '" y="' + y + '" width="' + (bs - 1) + '" height="' + (bs - 1) + '"/>';
    }
    let s = '';
    for (let i = 0; i < rings; i++) {
      const op = (Math.max(0.14, 0.80 - i * 0.055) * baseOp).toFixed(2);
      for (const col in buckets[i]) s += '<g fill="' + col + '" opacity="' + op + '">' + buckets[i][col] + '</g>';
    }
    return s;
  }

  function svg(g) {
    const over   = (g.facet === 'COLLECTOR') ? collectorWall(g)
                 : (g.facet === 'WHALE')     ? whaleHalo(g)
                 : '';                                                   // wall/halo sits around the head
    const vom = P.vomitTiles(g.params), roll = g.params.roll || 0;   // vomit drawn LAST (on top of wall/halo). Align it with a rolled face (DEGEN, roll=-6) via the SAME wrap the bg uses (portrait_v6:1876); roll==0 or empty vomit => unchanged.
    const vomW = (roll && vom) ? '<g transform="rotate(' + roll + ' 500 500)">' + vom + '</g>' : vom;
    return '<svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">' + P.buildSVG(g.params) + over + vomW + '</svg>';
  }

  window.FACETS_GEN = { generate, svg, collectorWall, whaleHalo, applyEyeTrait, EYE_DEF, applyMouthTrait, MOUTH_DEF, FACET_DISPLAY, FACET_WEIGHTS, TIER, hashInt, mulberry32, pickWeighted, rollTraits, facetPct, UNIVERSAL_TRAITS, FACET_TRAITS, META_RENAME, COLLECTOR_POOL, COLL_ARCH_PAL, WHALE_BASE_PAL, hslToHex };
})();
