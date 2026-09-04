/* FACETS — MOUTH attribute pieces (NEW set). 41x41 grid, NEUTRAL pose. The FACE mouth line is ~row 27
   (mouth anchor row 28 minus the engine's -34px lift). v3 2026-07-13 (user): pieces were sitting on the
   CHIN -> pulled UP to the mouth line (~row 26-28) + shrunk; Bubblegum/Rose = tiny 2-cell mouth "holding" it.
   accent cells keep colour; plain cells get PIXEL_SHADE shading. Push FOREGROUND cells first (dedup keeps first). */
(function () {
  const box = (s, c0, c1, r0, r1, col) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) s.push(col ? [c, r, col] : [c, r]); };
  const dot = (s, c, r, col) => s.push(col ? [c, r, col] : [c, r]);
  const M = 'FDARK';   // tiny dark mouth -> facet-aware dark (resolved at render: blue-black on Collector, near-black on OG, etc.)

  const DEF = {
    'Bubblegum': { tier: 'Uncommon', color: '#ff7ab0', seed: 8, nudge: [1, 0], shape() { const s = [];
      dot(s, 19, 26, M); dot(s, 20, 26, M);                                    // tiny mouth holding the bubble
      dot(s, 18, 28, '#ffe0ee'); dot(s, 19, 28, '#ffd0e4');                    // shine highlight (upper-left) -> shiny balloon
      [[19, 27], [20, 27], [21, 27],                                           // round INFLATED balloon (plain pink -> PIXEL_SHADE tonal), rounded corners
       [18, 28], [19, 28], [20, 28], [21, 28], [22, 28],
       [18, 29], [19, 29], [20, 29], [21, 29], [22, 29],
       [18, 30], [19, 30], [20, 30], [21, 30], [22, 30],
       [19, 31], [20, 31], [21, 31]].forEach(p => dot(s, p[0], p[1])); return s; } },

    'Screaming': { tier: 'Rare', color: '#1a0e12', seed: 18, nudge: [1, 0], shape() { const s = [];
      [18, 19, 20, 21].forEach(c => dot(s, c, 25, '#eef2f8'));                  // top teeth
      box(s, 19, 20, 28, 29, '#c8324a');                                       // small tongue
      box(s, 18, 21, 25, 29, 'FDARK'); return s; } },                          // open maw -> facet-aware dark (no more clashing brown)

    'Rose': { tier: 'Legendary', color: '#d01030', seed: 16, nudge: [1, -1], shape() { const s = [];
      dot(s, 17, 27, M); dot(s, 18, 27, M);                                    // mouth holding it
      [13, 14, 15, 16].forEach(c => dot(s, c, 27, '#1c8f3a')); dot(s, 12, 28, '#26b04a'); dot(s, 13, 26, '#26b04a');   // stem + leaves
      // rose bloom = concentric petals (NOT a flat block): dark centre -> bright ring -> mid -> dark outer
      dot(s, 22, 27, '#7a0818');
      dot(s, 22, 26, '#ff5a7a'); dot(s, 21, 27, '#ff5a7a'); dot(s, 23, 27, '#ff5a7a'); dot(s, 22, 28, '#ff5a7a');
      dot(s, 21, 26, '#d01838'); dot(s, 23, 26, '#d01838'); dot(s, 20, 27, '#d01838'); dot(s, 24, 27, '#d01838'); dot(s, 21, 28, '#d01838'); dot(s, 23, 28, '#d01838');
      [[21, 25], [22, 25], [23, 25], [20, 26], [24, 26], [20, 28], [24, 28], [21, 29], [22, 29], [23, 29]].forEach(p => s.push([p[0], p[1], '#a00c24'])); return s; } },

    'Party Blower': { tier: 'Rare', color: '#e01c1c', seed: 14, nudge: [2, 0], shape() { const s = [];
      dot(s, 17, 27, M); dot(s, 18, 27, M);                                    // small mouth
      dot(s, 19, 27, '#e01c1c'); dot(s, 20, 27, '#fcb913'); dot(s, 20, 28, '#16d34c');   // horn DROOPING diagonally down-right
      dot(s, 21, 28, '#2f9ad3'); dot(s, 22, 28, '#e01c1c'); dot(s, 22, 29, '#fcb913');
      dot(s, 23, 29, '#16d34c'); dot(s, 24, 29, '#2f9ad3'); dot(s, 24, 30, '#e01c1c');
      dot(s, 25, 30, '#fcb913'); dot(s, 26, 30, '#16d34c'); dot(s, 27, 31, '#2f9ad3'); dot(s, 28, 31, '#e01c1c'); return s; } }  // curl tip
,

    // The lower half of the Alien pair. It exists so the homage occupies a real Mouth trait as well as a real
    // Eyes trait, and so the facet's own mouth expression stays off the face (render_v7 sets
    // mouth_style='none' the moment a mouth_piece is present).
    // ⛔ Slides with the yaw (pairEye) and is never clipped, so it stays narrow, over the middle of the face
    //    where there is room to miss. The silhouette belongs to the clipped eye piece.
    'Alien Jaw': { pairEye: true, tier: 'Legendary', color: '#3a8cc0', seed: 73, shape() { const s = [];
      const LO = '#3a8cc0', DK = '#22537f';
      for (let c = 18; c <= 22; c++) dot(s, c, 25, '#12283d');
      for (let c = 18; c <= 22; c++) dot(s, c, 26, LO);
      for (let c = 19; c <= 21; c++) dot(s, c, 27, DK);
      return s; } },

    // The lower half of the Skull pair. It exists so the homage occupies a real Mouth trait as well as a
    // real Eyes trait, and so the pair rule holds.
    // ⛔ IT DOES NOT NEED TO HIDE ANYTHING. render_v7 sets mouth_style='none' the moment a mouth_piece is
    //    present, so the facet's own mouth is already gone. An earlier note here said this piece's "one job
    //    is to be the last painter over the mouth zone" - that was wrong, and it was the excuse for drawing
    //    a wide skirt that overhung the silhouette by 7.6 cells and painted outside GHOST's contour ring.
    // ⛔ AND IT CANNOT AIM. Measured over 455 poses: an authored cell in this slot lands anywhere from -3 to
    //    +2 columns and -2 to +1 rows from its neutral spot, and clip:true is ignored here. So it stays
    //    narrow, over the middle of the face where there is room to miss. Everything that has to hug the
    //    silhouette is the clipped PLATE's job.
    'Skull Jaw': { pairEye: true, tier: 'Legendary', color: '#cdc9b4', seed: 69, shape() { const s = [];
      const T = ['#f3f1e0', '#e4dfc7', '#cdc4a6', '#b3a789', '#96886b', '#786a52', '#584b3a'];
      const VOID = '#08090a', DEEP = '#14150f';
      [18, 20, 22].forEach(c => { dot(s, c, 24, DEEP); dot(s, c, 25, DEEP); });   // the same tooth gaps the
      for (let c = 19; c <= 21; c++) dot(s, c, 26, VOID);                          //   plate draws - both halves
      const REL = { 24: -1, 25: 0 };                                               //   are eye-anchored, so they
      for (let r = 24; r <= 25; r++) for (let c = 18; c <= 22; c++) {              //   always line up
        let i = Math.round((c - 12) * 0.16 + (r - 13) * 0.30) + REL[r];
        dot(s, c, r, T[i < 0 ? 0 : i > 6 ? 6 : i]);
      }
      return s; } },

    // The chin plate of the Hockey Mask pair. Its ONE job is to be the last painter over the mouth zone -
    // the facet's own mouth is unclipped and drawn after the eye piece, so without this a mouth lands across
    // the mask. Measured: that mouth occupies output rows 21..23 = authored 24..26. Same holes as the plate
    // draws there, so the two are indistinguishable.
    // ⛔ Kept well inside the rim on purpose. pairEye anchors it to the eye midpoint, so it SLIDES with the
    //    yaw while the head silhouette does not - drawn out to 14..26 its far corner hung off the mask as a
    //    grey shard at yaw -18 and +18. The jawline is the PLATE's job, not this one's.
    'Hockey Jaw': { pairEye: true, tier: 'Legendary', color: '#e8e4d8', seed: 89, shape() { const s = [];
      const HOLE = '#3f3d36', P = ['#e8e4d8', '#dcd8cc', '#f0ece0', '#cfcbbf'];
      [[16, 24], [19, 24], [21, 24], [24, 24],
       [18, 25], [22, 25],
       [17, 26], [20, 26], [23, 26]].forEach(q => dot(s, q[0], q[1], HOLE));
      for (let c = 16; c <= 24; c++) { dot(s, c, 24, P[(c * 2 + 24) % 4]); dot(s, c, 25, P[(c * 2 + 25) % 4]); }
      for (let c = 17; c <= 23; c++) dot(s, c, 26, P[(c * 2 + 26) % 4]);
      return s; } },

    // The lower half of the Ape pair - the chin under the mouth. Same ramp and the same light as the face, so
    // it reads as more of the same skin rather than a block stuck underneath. It is also the ONLY way the
    // face reaches output row 25: the clipped eye slot bottoms out one row above it.
    // ⛔ Slides with the yaw (pairEye) and is never clipped, so it stays narrow, over the middle of the face
    //    where there is room to miss. The silhouette belongs to the clipped eye piece.
    'Ape Jaw': { pairEye: true, tier: 'Legendary', color: '#b89163', seed: 42, shape() { const s = [];
      const K = ['AS0', 'AS1', 'AS2', 'AS3', 'AS4', 'AS5', 'AS6', 'AS7'];   // resolved per token: see APE_SKIN
      const t = (c, r, d) => { const i = Math.round((c - 13) * 0.14 + (r - 17) * 0.30) + d;
        return K[i < 0 ? 0 : i > 7 ? 7 : i]; };
      for (let c = 17; c <= 23; c++) dot(s, c, 26, t(c, 26, 0));       // the lower lip
      for (let c = 18; c <= 22; c++) dot(s, c, 27, t(c, 27, 1));       // the chin
      for (let c = 19; c <= 21; c++) dot(s, c, 28, t(c, 28, 3));       // turning into shadow
      return s; } },
  };

  const cache = {}; for (const k in DEF) { let cl = window.PIXEL_SHADE.build(DEF[k].shape(), DEF[k].color, DEF[k].seed); const nd = DEF[k].nudge; if (nd) cl = cl.map(c => [c[0] + nd[0], c[1] + nd[1], c[2]]); cache[k] = cl; }   // nudge = static design offset [dx,dy]
  window.FACET_MOUTHS = { order: ['None', ...Object.keys(DEF)], defs: DEF, cells: n => cache[n] || [], tierOf: n => (DEF[n] && DEF[n].tier) || '-', pairEyeOf: n => !!(DEF[n] && DEF[n].pairEye) };
})();
