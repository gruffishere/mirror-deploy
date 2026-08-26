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
  };

  const cache = {}; for (const k in DEF) { let cl = window.PIXEL_SHADE.build(DEF[k].shape(), DEF[k].color, DEF[k].seed); const nd = DEF[k].nudge; if (nd) cl = cl.map(c => [c[0] + nd[0], c[1] + nd[1], c[2]]); cache[k] = cl; }   // nudge = static design offset [dx,dy]
  window.FACET_MOUTHS = { order: ['None', ...Object.keys(DEF)], defs: DEF, cells: n => cache[n] || [], tierOf: n => (DEF[n] && DEF[n].tier) || '-' };
})();
