/* FACETS — COMBO attribute pieces: cover BOTH the eyes AND the mouth (a full mask/overlay). 41x41, NEUTRAL pose.
   Applied via p.combo_piece -> render_v7 suppresses the face's OWN eyes AND mouth, then draws this on top,
   pose-shifted by the eye-region offset. First one: an APE mask (heavy brow, deep amber eyes, broad nose +
   nostrils, protruding light muzzle + mouth). accent cells keep colour; plain cells get PIXEL_SHADE shading. */
(function () {
  const box = (s, c0, c1, r0, r1, col) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) s.push(col ? [c, r, col] : [c, r]); };
  const dot = (s, c, r, col) => s.push(col ? [c, r, col] : [c, r]);

  const DEF = {
    'Ape': { tier: 'Legendary', color: '#4a3420', seed: 40, shape() { const s = [];
      // FOREGROUND details first (dedup keeps first)
      [16, 24].forEach(cx => { dot(s, cx, 20, '#d89020'); dot(s, cx, 19, '#1a1008'); dot(s, cx - 1, 20, '#1a1008'); dot(s, cx + 1, 20, '#1a1008'); });   // deep amber eyes
      [18, 19, 21, 22].forEach(c => dot(s, c, 25, '#100a06'));                  // wide nostrils
      dot(s, 17, 29, '#eae0d0'); dot(s, 23, 29, '#eae0d0');                      // teeth hint
      box(s, 16, 24, 29, 30, '#4a2e1a');                                        // mouth line
      // FILLS
      box(s, 15, 25, 26, 31, '#a0805a');                                        // protruding light muzzle
      box(s, 18, 22, 22, 25);                                                   // broad nose bridge (shaded brown)
      box(s, 13, 27, 16, 18);                                                   // heavy brow ridge
      box(s, 13, 15, 19, 26); box(s, 25, 27, 19, 26);                           // side fur (cheeks)
      return s; } }
  };

  const cache = {}; for (const k in DEF) cache[k] = window.PIXEL_SHADE.build(DEF[k].shape(), DEF[k].color, DEF[k].seed);
  window.FACET_COMBO = { order: ['None', ...Object.keys(DEF)], defs: DEF, cells: n => cache[n] || [], tierOf: n => (DEF[n] && DEF[n].tier) || '-' };
})();
