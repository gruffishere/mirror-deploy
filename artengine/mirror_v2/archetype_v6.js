// MIRROR · v6 · Archetype Profiles (Phigures palette aligned)
// ---------------------------------------------------------
// 9 archetypes use one of Phigures 8 PALETTE_MODES.
// 2 archetypes use thematic special render modes:
//   - DEGEN  → RGB_GLITCH (triple-layer chromatic offset)
//   - GHOST  → GRAY_PHANTOM (white + gray tones)
//   - GHOST → INVERTED (photographic negative)
//
// Phigures base colors:
//   RED #fe0000 · BLUE #0101ef · YELLOW #fcb913
//   BLACK #0a0a0a · WHITE #f0f0f0 · CREAM #efdfc8

const PHIGURES = {
  RED:    '#fe0000',
  BLUE:   '#0101ef',
  YELLOW: '#fcb913',
  BLACK:  '#0a0a0a',
  WHITE:  '#f0f0f0',
  CREAM:  '#efdfc8'
};

const ARCHETYPE_V6 = {

  BUILDER: {
    label: 'BUILDER',
    description: 'RED face · Phigures multicolor bg bands (experiment 2026-06-01)',
    palette_mode: 'RED_MULTICOLOR_BG',
    render_mode: 'standard',
    bg: PHIGURES.BLACK, fg: PHIGURES.RED, accent_color: PHIGURES.YELLOW,
    // Multicolor bg: Phigures palette in row-bands (RLE-safe, free). Face stays solid RED.
    bg_palette: [PHIGURES.RED, PHIGURES.BLUE, PHIGURES.YELLOW, PHIGURES.WHITE, PHIGURES.CREAM],
    block_on_face: true,          // deploy count → GOLD blocks scattered ON the face (creations woven in)
    block_color: PHIGURES.YELLOW, // gold
    block_size: 14,
    // BASELINE LOCKED 2026-05-28
    yaw: -22, pitch: -5, roll: 0,
    eye_size_extra: 0.50,
    brow_intensity: 0.80, mouth_intensity: 1.50, chin_intensity: 1.50,
    cheekbone_intensity: 1.00, forehead_intensity: 1.50,
    shimmer: 1.00, highlight_chance: 0.00, aging_strength: 0.15,
    echo_trails: 1, base_line: 8, token_stack: 4,
    halo_rings: 1, geo_overlay: 2, splatters: 0, color_blocks: 12,
    has_ens: true,
    grain_shape: 'stroke'        // diagonal short brushstroke — artistic gesture
  },

  COLLECTOR: {
    label: 'COLLECTOR',
    description: 'Phigures BLUE · white face framed by a COLLECTION WALL (mosaic of holdings); archetype = wall structure + color (2026-06-02)',
    palette_mode: 'BLUE_FIELD',
    render_mode: 'standard',
    bg: PHIGURES.BLUE, fg: PHIGURES.WHITE, accent_color: PHIGURES.YELLOW,
    block_size: 14,
    bg_solid: true,               // clean blue field
    // 2 visual triggers via color_blocks: collection count → block COUNT · item count → block SIZE.
    // archetype = block palette + subtle arrangement (set by collectorParamsFromRaw).
    // BASELINE LOCKED 2026-05-28
    yaw: 0, pitch: 12, roll: 0,
    eye_size_extra: 0.35,
    brow_intensity: 0.00, mouth_intensity: 0.00, chin_intensity: 0.55,
    cheekbone_intensity: 1.50, forehead_intensity: 1.50,
    shimmer: 1.00, highlight_chance: 0.00, aging_strength: 0.20,
    echo_trails: 3, base_line: 0, token_stack: 3,
    halo_rings: 2, geo_overlay: 0, splatters: 0, color_blocks: 8,
    has_ens: true,
    grain_shape: 'filled_square'  // tiny solid blocks — curator/label feel
  },

  OG: {
    label: 'OG',
    description: 'Phigures BLACK_RED · weathered white on black with red accent',
    palette_mode: 'BLACK_RED',
    render_mode: 'standard',
    bg: PHIGURES.BLACK, fg: PHIGURES.WHITE, accent_color: PHIGURES.RED,
    block_size: 16,
    // BASELINE LOCKED 2026-05-28
    yaw: 0, pitch: 0, roll: 0,
    eye_size_extra: -0.20,
    brow_intensity: 1.50, mouth_intensity: 1.50, chin_intensity: 1.50,
    cheekbone_intensity: 1.00, forehead_intensity: 1.50,
    shimmer: 0.15, highlight_chance: 0.08, aging_strength: 0.85,
    echo_trails: 2, base_line: 0, token_stack: 2,
    halo_rings: 6, geo_overlay: 0, splatters: 0, color_blocks: 5,
    has_ens: true,
    grain_shape: 'hollow_square'  // blueprint outline — weathered grid
  },

  WHALE: {
    label: 'WHALE',
    description: 'Gilded royal ornament · heavy gold face on solid black · gold/white halo rings + symmetric gold studs (re-locked 2026-06-01)',
    palette_mode: 'BLACK_YELLOW',
    render_mode: 'standard',
    bg: PHIGURES.BLACK, fg: PHIGURES.YELLOW, accent_color: PHIGURES.WHITE,
    block_size: 19,               // heavy, monumental blocks ("ağır", fewer rects = cheaper)
    bg_solid: true,               // NO bg pattern — clean black field (negative space = luxury)
    halo_palette: [PHIGURES.YELLOW, PHIGURES.WHITE],   // alternating gilded halo rings
    geo_outside: true,            // motifs placed OUTSIDE the head, symmetric (gold studs)
    geo_color: PHIGURES.YELLOW,   // gold studs
    // BASELINE RE-LOCKED 2026-06-01 (was RED... 2026-05-28). Stronger, more imposing face.
    yaw: 0, pitch: -12, roll: 0,  // looking-down = authority
    eye_size_extra: 0.25,
    brow_intensity: 0.50, mouth_intensity: 0.70, chin_intensity: 1.30,
    cheekbone_intensity: 0.95, forehead_intensity: 1.10,
    shimmer: 0.35, highlight_chance: 0.09, aging_strength: 0.30,
    echo_trails: 2, base_line: 0, token_stack: 8,
    halo_rings: 4, geo_overlay: 8, splatters: 0, color_blocks: 18,
    has_ens: true,
    grain_shape: 'diamond'        // hollow diamonds — royal jewel
  },

  PHIG_PATRON: {
    label: 'PHIG_PATRON',
    description: 'Phigures CREAM_RED · red face on cream, refined dramatic',
    palette_mode: 'CREAM_RED',
    render_mode: 'standard',
    bg: PHIGURES.CREAM, fg: PHIGURES.RED, accent_color: PHIGURES.BLACK,
    block_size: 13,
    yaw: 18, pitch: -8, roll: 0,
    eye_size_extra: -0.10,
    brow_intensity: 0.4, mouth_intensity: 0.5, chin_intensity: 0.5,
    cheekbone_intensity: 0.3, forehead_intensity: 1.0,
    shimmer: 0.4, highlight_chance: 0.04, aging_strength: 0.40,
    echo_trails: 4, base_line: 0, token_stack: 2,
    halo_rings: 3, geo_overlay: 0, splatters: 0, color_blocks: 6,
    has_ens: true
  },

  PHIG_BUILDER: {
    label: 'PHIG_BUILDER',
    description: 'Phigures BLUE_FIELD · white blueprint figure on blue',
    palette_mode: 'BLUE_FIELD',
    render_mode: 'standard',
    bg: PHIGURES.BLUE, fg: PHIGURES.WHITE, accent_color: PHIGURES.YELLOW,
    block_size: 12,
    yaw: 0, pitch: 0, roll: 0,
    eye_size_extra: -0.30,
    brow_intensity: 0.9, mouth_intensity: 0.7, chin_intensity: 0.9,
    cheekbone_intensity: 0.6, forehead_intensity: 0.6,
    shimmer: 0.3, highlight_chance: 0.03, aging_strength: 0.20,
    echo_trails: 0, base_line: 15, token_stack: 4,
    halo_rings: 2, geo_overlay: 5, splatters: 0, color_blocks: 5,
    has_ens: true
  },

  PHIG_NOMAD: {
    label: 'PHIG_NOMAD',
    description: 'Phigures CREAM_BLUE · blue face on cream, drifter',
    palette_mode: 'CREAM_BLUE',
    render_mode: 'standard',
    bg: PHIGURES.CREAM, fg: PHIGURES.BLUE, accent_color: PHIGURES.BLACK,
    block_size: 15,
    yaw: 30, pitch: 0, roll: -4,
    eye_size_extra: -0.10,
    brow_intensity: 0.5, mouth_intensity: 0.55, chin_intensity: 0.6,
    cheekbone_intensity: 0.4, forehead_intensity: 0.5,
    shimmer: 0.4, highlight_chance: 0.025, aging_strength: 0.30,
    echo_trails: 3, base_line: 0, token_stack: 5,
    halo_rings: 1, geo_overlay: 0, splatters: 0, color_blocks: 25,
    has_ens: false
  },

  NEWBIE: {
    label: 'NEWBIE',
    description: 'GENESIS · emerging newcomer · green face materializing from a dark void (solid core + contour highlights, 2026-06-01)',
    palette_mode: 'GENESIS_GREEN',
    render_mode: 'contour',          // hybrid: solid core bands + contour highlight bands
    contour_solid_bands: 3,          // bands 0-2 SOLID (formed body), bands 3-4 = contour (still forming)
    bg: '#0e1714', fg: '#37c878', accent_color: '#cdf7e0',
    block_size: 18,
    // GENESIS palette: deep ink-green void → vibrant spring-green body → pale glow contour highlights.
    // Green = new growth / sprout (unique in the collection). Hybrid solid+outline = "not fully formed yet".
    face_palette: ['#1d6e4d', '#2a9560', '#37c878', '#9bf0c0', '#cdf7e0'],
    yaw: 0, pitch: 21, roll: 0,    // looking up = naive / fresh
    eye_size_extra: -0.40,
    brow_intensity: 0.00, mouth_intensity: 1.50, chin_intensity: 1.50,
    cheekbone_intensity: 1.50, forehead_intensity: 1.50,
    shimmer: 0.10, highlight_chance: 0.00, aging_strength: 0,
    echo_trails: 0, base_line: 0, token_stack: 0,
    halo_rings: 0, geo_overlay: 0, splatters: 0, color_blocks: 0,
    has_ens: false,
    grain_shape: 'hollow_circle', // clean outlined circles — fresh
    eye_fill_color: '#3ddc84'      // bright spring-green eye (alive, focal anchor)
  },

  // ---- SPECIAL RENDER MODES ----

  GHOST: {
    label: 'GHOST',
    description: 'INVERTED rare mode · alien cyan · bioluminescent aura + hologram scanlines (shaped 2026-06-01)',
    palette_mode: 'INVERTED',
    render_mode: 'standard',
    // Inverted from BLACK_RED:
    //   BLACK #0a0a0a → #f5f5f5  (near-white bg)
    //   WHITE #f0f0f0 → #0f0f0f  (near-black face)
    //   RED   #fe0000 → #01ffff  (cyan accent)
    bg: '#f5f5f5', fg: '#0f0f0f', accent_color: '#01ffff',
    block_size: 18,
    // BASELINE shaped 2026-06-01: amplified alien theme (aura + scanlines + BIG alien eyes).
    yaw: -28, pitch: 5, roll: 0,
    eye_size_extra: 0.40,         // big almond grey-alien eyes (cyan glow) — iconic alien stare
    brow_intensity: 0.00, mouth_intensity: 1.50, chin_intensity: 0.00,
    cheekbone_intensity: 0.40, forehead_intensity: 0.55,
    shimmer: 0.30, highlight_chance: 0.00, aging_strength: 0.50,
    echo_trails: 0, base_line: 0, token_stack: 1,
    halo_rings: 4, geo_overlay: 0, splatters: 0, color_blocks: 0,
    halo_palette: ['#01ffff', '#4dffff', '#8cffff', '#c2ffff'],  // bright→pale cyan bioluminescent glow
    scanlines: '#01ffff',         // hologram transmission scanlines (alien / rare signal)
    has_ens: false,
    grain_shape: 'cross',         // tiny plus marks — faded census/tally
    eye_fill_color: '#01ffff'     // fill entire eye region with cyan (ghost stare)
  },

  DEGEN: {
    label: 'DEGEN',
    description: 'RGB_GLITCH · triple-layer chromatic offset (Red+Green+Blue)',
    palette_mode: 'RGB_GLITCH',
    render_mode: 'rgb_glitch',
    bg: PHIGURES.BLACK, fg: PHIGURES.WHITE, accent_color: PHIGURES.YELLOW,
    // For RGB glitch we use pure R/G/B layers
    rgb_red:   '#ff0000',
    rgb_green: '#00ff00',
    rgb_blue:  '#0000ff',
    block_size: 14,
    // BASELINE LOCKED 2026-05-28
    yaw: -25, pitch: 2, roll: -6,
    eye_size_extra: 0.50,
    brow_intensity: 0.50, mouth_intensity: 1.50, chin_intensity: 0.70,
    cheekbone_intensity: 1.30, forehead_intensity: 1.25,
    shimmer: 0.70, highlight_chance: 0.04, aging_strength: 0.10,
    echo_trails: 1, base_line: 0, token_stack: 12,
    halo_rings: 1, geo_overlay: 0, splatters: 8, color_blocks: 45,
    has_ens: false,
    grain_shape: 'filled_circle', // solid noise dots — chaotic flicker
    halo_rainbow: true            // DEGEN multicolor halo
  },

  // PHANTOM was keyed GHOST until 2026-07-31, when the facet's internal name LURKER was retired and Ghost became
  // Ghost everywhere. It is NOT the Ghost facet's profile — that is the INVERTED entry above, which the facet reaches
  // via ARCHETYPE_V6[lens]. This one is legacy and UNREACHABLE, like PHIG_PATRON / PHIG_BUILDER / PHIG_NOMAD: nothing produces a lens
  // with this name. Renamed rather than deleted so ARCHETYPE_V6_LIST keeps its length for the v6_archetypes lab.
  // ⚠️ Leaving it as a second GHOST key would have SILENTLY overwritten the facet's profile — object literals keep the
  // last duplicate — which is exactly what the blanket rename did before this was caught.
  PHANTOM: {
    label: 'PHANTOM',
    description: 'GRAY_PHANTOM special · white + grayscale tones, ethereal',
    palette_mode: 'GRAY_PHANTOM',
    render_mode: 'gray_phantom',
    bg: PHIGURES.BLACK, fg: PHIGURES.WHITE, accent_color: '#aaaaaa',
    gray_pool: ['#ffffff', '#cccccc', '#999999', '#666666'],
    block_size: 22,
    yaw: 35, pitch: -2, roll: 0,
    eye_size_extra: 0.30,
    brow_intensity: 0.1, mouth_intensity: 0, chin_intensity: 0.3,
    cheekbone_intensity: 0, forehead_intensity: 0.2,
    shimmer: 0.5, highlight_chance: 0.10, aging_strength: 0.40,
    echo_trails: 1, base_line: 0, token_stack: 0,
    halo_rings: 4, geo_overlay: 0, splatters: 0, color_blocks: 0,
    has_ens: false
  }
};

const ARCHETYPE_V6_LIST = Object.keys(ARCHETYPE_V6);

// ---------------------------------------------------------
// COLLECTOR sub-themes (taste-driven accent variants)
// ---------------------------------------------------------
// COLLECTOR baseline (BLUE bg + WHITE face) is locked. Only ACCENT_COLOR
// shifts between sub-themes. Pose, face geometry, block_size, grain shape
// are identical across all 4 variants — every portrait reads as COLLECTOR.
//
// Phase 1 (NOW): accent-only swap.
// Phase 2 (LATER): each sub-theme gets an "artistic counterpart" (Vera Molnar,
// Murakami, Rothko, Gursky) that fully changes the base palette + texture
// while still inheriting the COLLECTOR pose/face skeleton.
//
// Auto-classification (TODO, Phase 1.5): owned collection address → category
//   PFP        → ARENA      red accent       (Murakami / Hirst)
//   GENERATIVE → STUDIO     yellow accent    (Molnar / LeWitt) — default
//   ONE_OF_ONE → GALLERY    black accent     (Rothko / Martin)
//   PHOTO+niche→ DARKROOM   cream accent     (Gursky / Sherman)
const COLLECTOR_SUB_THEMES = {
  STUDIO:   { accent_color: PHIGURES.YELLOW },   // GENERATIVE — default, no real change
  ARENA:    { accent_color: PHIGURES.RED    },   // PFP
  GALLERY:  { accent_color: PHIGURES.BLACK  },   // 1-of-1
  DARKROOM: { accent_color: PHIGURES.CREAM  }    // PHOTO + niche
};

const COLLECTOR_SUB_THEME_LIST = Object.keys(COLLECTOR_SUB_THEMES);

// Apply a sub-theme override on top of COLLECTOR baseline.
// Returns the profile unchanged for non-COLLECTOR lenses or STUDIO theme.
function applyCollectorSubTheme(profile, themeName) {
  if (!themeName || themeName === 'STUDIO') return profile;
  const theme = COLLECTOR_SUB_THEMES[themeName];
  if (!theme) return profile;
  return Object.assign({}, profile, theme);
}

function archetypeV6Params(name, seed) {
  const profile = ARCHETYPE_V6[name] || ARCHETYPE_V6.COLLECTOR;
  return Object.assign({}, profile, { seed: seed || 1 });
}
