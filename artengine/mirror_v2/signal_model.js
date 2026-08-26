// MIRROR · SIGNAL MODEL — single source of truth
// =================================================
// Both lens_design_lab.html and random_grid.html consume THIS file.
// Nothing about signal→visual mapping lives anywhere else. If a signal is
// not 'done' here, it has NO visual and must NOT appear in any grid/lab output.
//
// Each signal: { name, mapsTo, state, type, min, max, step, default, convert?, valueLabel? }
//   state: 'done' = real visual mapping ; 'todo' = placeholder, no visual yet
//   mapsTo: portrait param key, or '__gas_multi__' special, or null (todo)
//
// Requires archetype_v6.js loaded first (ARCHETYPE_V6, applyCollectorSubTheme).

// ============================================================
// UNIVERSAL SIGNALS (8) — every lens
// ============================================================
const UNIVERSAL_SIGNALS = [
  { name: 'wallet_age_days', mapsTo: 'block_size', state: 'done',
    type: 'range', min: 10, max: 24, step: 1, default: 14,
    valueLabel: (v) => v + 'px block' },
  { name: 'total_tx', mapsTo: 'halo_rings', state: 'done',
    type: 'range', min: 0, max: 40000, step: 100, default: 0,
    convert: (tx) => tx < 10 ? 0 : tx < 50 ? 1 : tx < 200 ? 2 : tx < 500 ? 3 : tx < 1000 ? 4 : tx < 2000 ? 5 : tx < 4000 ? 6 : tx < 8000 ? 7 : tx < 15000 ? 8 : tx < 25000 ? 9 : tx < 40000 ? 10 : 11,
    valueLabel: (v) => v + ' tx → halo' },
  { name: 'has_ens', mapsTo: 'has_ens', state: 'done',
    type: 'checkbox', default: false },
  { name: 'eth_balance', mapsTo: 'eth_blocks', state: 'done',
    type: 'range', min: -1, max: 10, step: 1, default: -1,
    valueLabel: (v) => v < 0 ? 'meter off' : v + '/10 (' + ['0','<0.1','0.1-0.25','0.25-0.5','0.5-0.75','0.75-1.5','1.5-3','3-5','5-10','10-20','20+'][v] + ' ETH)' },
  { name: 'last_activity_days', mapsTo: 'halo_opacity', state: 'done',
    type: 'range', min: 0, max: 730, step: 1, default: 0,
    convert: (days) => {
      const brackets = [[0,1.00],[1,0.95],[3,0.88],[5,0.80],[7,0.72],[14,0.60],[30,0.48],[90,0.35],[180,0.25],[365,0.15]];
      for (let i = brackets.length - 1; i >= 0; i--) {
        if (days >= brackets[i][0]) return brackets[i][1];
      }
      return 1.00;
    },
    valueLabel: (v) => {
      const names = ['today','1d','3d','5d','1w','2w','1m','3m','6m','1yr+'];
      const stops = [0,1,3,5,7,14,30,90,180,365];
      let idx = 0;
      for (let i = 0; i < stops.length; i++) { if (v >= stops[i]) idx = i; }
      return v + 'd → ' + names[idx];
    } },
];

// ============================================================
// LENS-SPECIFIC SIGNALS — only 'done' ones render
// ============================================================
const LENS_SIGNALS = {
  BUILDER: [
    { name: 'deployments_count', mapsTo: 'color_blocks', state: 'done',
      type: 'range', min: 0, max: 80, step: 1, default: 0,
      valueLabel: (v) => v + ' gold blocks (creations)' },
    { name: 'first_deploy_year', mapsTo: null, state: 'todo',
      type: 'range', min: 2017, max: 2026, step: 1, default: 2026,
      valueLabel: (v) => v + '' },
    { name: 'total_tokens_deployed', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 50000, step: 100, default: 0,
      valueLabel: (v) => v + ' tokens' },
    { name: 'opensea_created_volume_eth', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 10000, step: 50, default: 0,
      valueLabel: (v) => v + ' ETH' },
    { name: 'days_since_last_deploy', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 1825, step: 7, default: 0,
      valueLabel: (v) => v + ' days' },
  ],
  COLLECTOR: [
    { name: 'collection_count', mapsTo: 'color_blocks', state: 'done',
      type: 'range', min: 0, max: 2400, step: 10, default: 0,
      convert: (n) => Math.round(400 * Math.sqrt(Math.min(1, n / 2400))),   // breadth → block count (curve)
      valueLabel: (v) => v + ' collections' },
    { name: 'total_nft_count', mapsTo: 'block_vol', state: 'done',
      type: 'range', min: 0, max: 25000, step: 100, default: 0,
      convert: (n) => Math.min(1, Math.sqrt(n / 20000)),                    // depth → block size (curve)
      valueLabel: (v) => v + ' NFTs (block size ' + (1 + Math.min(1, Math.sqrt(v / 20000)) * 1.8).toFixed(2) + 'x)' },
    { name: 'top_concentration', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 1, step: 0.05, default: 0,
      valueLabel: (v) => (v * 100).toFixed(0) + '%' },
  ],
  OG: [
    { name: 'pre_2018_nft_count', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 20, step: 1, default: 0 },
    { name: 'highest_gas_price_gwei', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 5000, step: 50, default: 0 },
    { name: 'era_span_years', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 11, step: 1, default: 0,
      valueLabel: (v) => v + ' years' },
    { name: 'defi_pioneer_count', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 15, step: 1, default: 0 },
    { name: 'pre_merge_ratio', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 1, step: 0.05, default: 0 },
    { name: 'diamond_hand_ratio', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 1, step: 0.05, default: 0 },
    { name: 'genesis_ens', mapsTo: null, state: 'todo',
      type: 'checkbox', default: false },
  ],
  WHALE: [
    { name: 'eth_balance_precise', mapsTo: 'bg_glow', state: 'done',
      type: 'range', min: 0, max: 1, step: 0.05, default: 0,
      valueLabel: (v) => 'glow ' + v.toFixed(2) + ' (boost)' },
    { name: 'opensea_holdings_usd', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 5000000, step: 10000, default: 0 },
    { name: 'blue_chip_count', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 12, step: 1, default: 0,
      valueLabel: (v) => v + ' blue chips' },
    { name: 'big_ticket_tx_count', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 30, step: 1, default: 0 },
    { name: 'cold_storage_score', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 1, step: 0.05, default: 0 },
    { name: 'stablecoin_count', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 7, step: 1, default: 0 },
    { name: 'wbtc_lsd_count', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 7, step: 1, default: 0 },
  ],
  DEGEN: [
    { name: 'memecoin_count', mapsTo: 'splatters', state: 'done',
      type: 'range', min: 0, max: 30, step: 1, default: 0,
      valueLabel: (v) => v + ' splatters' },
    { name: 'burst_count', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 50, step: 1, default: 0 },
    { name: 'dex_count', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 500, step: 10, default: 0 },
    { name: 'late_night_ratio', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 1, step: 0.05, default: 0 },
    { name: 'unique_token_count', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 50, step: 1, default: 0 },
  ],
  NEWBIE: [
    { name: 'first_nft_collection', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 1, step: 1, default: 0,
      valueLabel: (v) => v ? 'has origin' : 'none' },
    { name: 'nft_receives_total', mapsTo: 'color_blocks', state: 'done',
      type: 'range', min: 0, max: 10, step: 1, default: 0,
      valueLabel: (v) => v + ' markers' },
    { name: 'defi_absence', mapsTo: null, state: 'todo',
      type: 'checkbox', default: true },
  ],
  GHOST: [
    { name: 'longest_silent_days', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 1825, step: 7, default: 0 },
    { name: 'tx_age_ratio', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
    { name: 'receive_send_asymmetry', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 1, step: 0.05, default: 0 },
    { name: 'burst_pattern_count', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 10, step: 1, default: 0 },
    { name: 'wealth_activity_inversion', mapsTo: null, state: 'todo',
      type: 'range', min: 0, max: 1, step: 0.05, default: 0 },
  ],
};

// ============================================================
// CORE LOGIC (pure — operates on passed params, no globals)
// ============================================================

// Production default for per-token micro-pose jitter (LOCKED 2026-05-30 = 1.5).
// Seed-derived, bounded: at 1.5 → yaw ±9°, pitch ±6°, roll ±4.5°. Makes a single
// owner's same-facet siblings read as distinct "shots" while keeping facet identity.
// Single source of truth — every real-token render path applies this. The lab leaves
// it 0 (baseline tuning must stay un-jittered). In the on-chain renderer this becomes
// a config value (upgradeable).
const POSE_JITTER_DEFAULT = 1.5;

// All data-signal params reset to zero/sentinel on the locked baseline.
// MUST mirror exactly what getBaselineProfile zeroed in the lab.
const SIGNAL_ZERO_STATE = {
  bg_glow: 0,
  grain_n: 0,
  halo_opacity: 1,
  halo_rings: 0,
  has_ens: false,
  gas_highlights: 0,
  gas_subdivisions: 0,
  tx_success_rate: -1,  // sentinel: hide meter
  color_blocks: 0,
  base_line: 0,
  splatters: 0,
  geo_overlay: 0,
  echo_trails: 0,
  aging_strength: 0,
  gild_level: 0,
  block_vol: 0,
};

// Build the locked baseline params for a lens, with all data signals zeroed.
// subTheme applies only to COLLECTOR (accent variant).
function buildBaselineParams(lens, seed, subTheme) {
  let profile = ARCHETYPE_V6[lens] || ARCHETYPE_V6.COLLECTOR;
  if (lens === 'COLLECTOR' && subTheme && subTheme !== 'STUDIO'
      && typeof applyCollectorSubTheme === 'function') {
    profile = applyCollectorSubTheme(profile, subTheme);
  }
  return Object.assign({}, profile, SIGNAL_ZERO_STATE, { seed: seed != null ? seed : 1 });
}

// Apply one signal's value to a params object (pure).
function applySignalToParams(params, sig, value) {
  if (!sig.mapsTo) return; // todo: no visual mapping
  if (sig.mapsTo === '__gas_multi__') {
    params.gas_highlights = Math.floor(value * 8);
    params.gas_subdivisions = Math.floor(value * 4);
  } else if (sig.convert) {
    params[sig.mapsTo] = sig.convert(value);
  } else {
    params[sig.mapsTo] = value;
  }
}

// Pick a random value for a signal, respecting its type/range/step and the
// -1 "hidden" sentinel (never randomize into the hidden zone for a showcase).
function randomSignalValue(sig) {
  if (sig.type === 'checkbox') return Math.random() < 0.5;
  // last_activity_days: bracket-uniform on raw days so every halo_opacity
  // fade tier is equally likely (flat 0-730 would bias toward faded).
  if (sig.name === 'last_activity_days') {
    const stops = [0, 1, 3, 5, 7, 14, 30, 90, 180, 365];
    return stops[Math.floor(Math.random() * stops.length)];
  }
  // total_nft_count: realistic skew (most wallets hold few NFTs, few hold thousands)
  // so the showcase shows a SPREAD of frame weights, not all max.
  if (sig.name === 'total_nft_count') {
    const buckets = [5, 20, 50, 120, 300, 600, 1500, 3000];
    return buckets[Math.floor(Math.random() * buckets.length)];
  }
  // total_tx: realistic tx distribution → a SPREAD of halo sizes (active wallets = big halos).
  if (sig.name === 'total_tx') {
    const buckets = [5, 30, 120, 400, 900, 2000, 5000, 12000, 30000];
    return buckets[Math.floor(Math.random() * buckets.length)];
  }
  // Avoid the negative sentinel (eth_balance min -1, tx_success_rate default -1)
  const lo = sig.min < 0 ? 0 : sig.min;
  const raw = lo + Math.random() * (sig.max - lo);
  return Math.round(raw / sig.step) * sig.step;
}

// ---- COLLECTOR ARCHETYPES (objective, from collecting behavior — no curated list) ----
// Data-driven replacement for the (parked) curated sub-themes. Each archetype = a color
// scheme (keyline accent + block palette) + a signature block layout.
const COLLECTOR_ARCHETYPES = {
  // Each = ONE cohesive color family + a dark mat that CONTRASTS the blue bg (so it floats),
  // like MAXI. Cool-silver / gold / red / warm-ivory — all distinct against the blue field.
  KASIF:   { label: 'Explorer',   accent: '#f0f0f0', mat: '#14181f', block_layout: 'scatter', block_palette: ['#fe0000','#0101ef','#fcb913','#f0f0f0','#efdfc8'] },   // silver frame + FULL Phigures multicolor blocks (explorer variety)
  UZMAN:   { label: 'Specialist', accent: '#fcb913', mat: '#241a06', block_layout: 'cluster', block_palette: ['#fcb913','#f0f0f0'] },               // gold
  MAXI:    { label: 'Maxi',       accent: '#fe0000', mat: '#2a0a14', block_layout: 'anchor',  block_palette: ['#fe0000','#f0f0f0'] },               // red
  GENELCI: { label: 'Generalist', accent: '#8b5cf6', mat: '#1a1030', block_layout: 'dense',   block_palette: ['#8b5cf6','#c4b5fd','#f0f0f0'] },   // violet (prestige; distinct from UZMAN gold)
};
// Classify from objective metrics: collections, distinct NFTs, top-collection share (0-1).
function classifyCollector(collections, nfts, concentration) {
  if (concentration >= 0.40) return 'MAXI';
  const ratio = collections > 0 ? nfts / collections : 0;
  const wide = collections >= 600, deep = ratio >= 5;
  if (wide && deep) return 'GENELCI';
  if (deep) return 'UZMAN';
  return 'KASIF';
}
// Set color_blocks (breadth, curved), block_vol (depth, curved), and the archetype scheme
// (accent/keyline + block palette + layout). Single source for randomize + real + test.
function collectorParamsFromRaw(params, collections, nfts, concentration) {
  const archKey = classifyCollector(collections, nfts, concentration);
  const a = COLLECTOR_ARCHETYPES[archKey];
  params.floating_mat = true;       // navy mat behind face + BOLD archetype-color frame
  params.mat_color = '#01014a';     // deep navy → white face pops
  params.accent_color = a.accent;   // the BOLD frame color = archetype (silver/gold/red/ivory)
  params.block_layout = a.block_layout;   // subtle arrangement (scatter/cluster/anchor/dense)
  params.block_palette = a.block_palette; // block color family = archetype palette
  params.collector_arch = a.label;
  params.color_blocks = Math.round(400 * Math.sqrt(Math.min(1, collections / 2400))); // breadth → block count (curve, real max ~2400)
  params.block_vol = Math.min(1, Math.sqrt(nfts / 20000));                            // depth → block size (curve, real max ~20k)
  return archKey;
}

// Produce a finished params object for a wallet: locked baseline + random
// values for ONLY the 'done' signals (universal + lens-specific). TODO signals
// are never applied, so nothing unfinished can leak into the output.
function randomizeWalletParams(lens, opts) {
  opts = opts || {};
  const seed = (opts.seed != null) ? opts.seed : Math.floor(Math.random() * 999999) + 1;
  const subTheme = opts.subTheme || null;
  const params = buildBaselineParams(lens, seed, subTheme);
  const signals = [...UNIVERSAL_SIGNALS, ...(LENS_SIGNALS[lens] || [])];
  for (const sig of signals) {
    if (sig.state !== 'done') continue;
    // COLLECTOR breadth/depth are handled by the archetype step below (needs raw values).
    if (lens === 'COLLECTOR' && (sig.name === 'collection_count' || sig.name === 'total_nft_count')) continue;
    applySignalToParams(params, sig, randomSignalValue(sig));
  }
  if (lens === 'COLLECTOR') {
    const collB = [40, 120, 250, 400, 600, 900, 1400, 2200];
    const nftB  = [200, 600, 1200, 2500, 5000, 9000, 16000, 24000];
    const collections = collB[Math.floor(Math.random() * collB.length)];
    const nfts = nftB[Math.floor(Math.random() * nftB.length)];
    const concentration = Math.random() < 0.18 ? (0.4 + Math.random() * 0.5) : Math.random() * 0.3; // sometimes MAXI
    collectorParamsFromRaw(params, collections, nfts, concentration);
  }

  // SHOWCASE REALISM: a facet IMPLIES plausible ranges for some universal signals
  // (in real data this is automatic — a NEWBIE token goes to a young/low-tx wallet; the grid
  //  randomizes independently, so without this it shows IMPOSSIBLE combos like NEWBIE+7yr+20k tx).
  // block_size: 24=youngest … 10=oldest · halo_rings: 0=no activity … high=very active.
  const ri = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  if (lens === 'NEWBIE')          { params.block_size = ri(20, 24); params.halo_rings = ri(0, 2); params.eth_blocks = ri(0, 3); params.halo_opacity = 0.6 + Math.random() * 0.4; } // young → recent activity (can't be dormant longer than it exists)
  else if (lens === 'OG') { params.block_size = ri(10, 13); }                              // old wallet
  else if (lens === 'WHALE')      { params.eth_blocks = ri(7, 10); }                               // high balance
  else if (lens === 'DEGEN')      { params.halo_rings = ri(6, 11); params.eth_blocks = ri(0, 3); } // high activity, low balance
  else if (lens === 'GHOST')     { params.halo_rings = ri(0, 3); }                                // quiet

  params.pose_jitter = POSE_JITTER_DEFAULT;  // every real-token render gets micro-pose
  params.bg_variety = 1;                     // seed-driven background pattern
  return params;
}

// ---- export ----
window.MIRROR_SIGNALS = {
  UNIVERSAL_SIGNALS,
  LENS_SIGNALS,
  SIGNAL_ZERO_STATE,
  POSE_JITTER_DEFAULT,
  buildBaselineParams,
  applySignalToParams,
  randomSignalValue,
  randomizeWalletParams,
  COLLECTOR_ARCHETYPES,
  classifyCollector,
  collectorParamsFromRaw,
};
