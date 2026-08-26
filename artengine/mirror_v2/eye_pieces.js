/* FACETS — EYES attribute pieces (NEW set). 41x41 grid, NEUTRAL pose. Left eye ~cells (15-18, 19-22),
   right ~(23-26, 19-22). v3 2026-07-13 (user review): Shades kept; Rainbow=frame+contour+reversed bottom row;
   3D=tonal colour blocks (not flat); Cyclops=warped socket rim; Flame=fire FROM the eye rising w/ gradient;
   Eyepatch=two straps wrapping the head. accent cells keep colour; plain cells get PIXEL_SHADE shading.
   DEDUP KEEPS FIRST -> push FOREGROUND cells first. Pose-shift + per-pose deform is render_v7 (phase 2b). */
(function () {
  const box = (s, c0, c1, r0, r1, col) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) s.push(col ? [c, r, col] : [c, r]); };
  const dot = (s, c, r, col) => s.push(col ? [c, r, col] : [c, r]);
  const K = '#141821', W = '#e6ecf5', SOCK = '#0c0f14';

  const DEF = {
    'Shades': { tier: 'Uncommon', color: '#24262e', seed: 2, shadow: true, shape() { const s = [];
      dot(s, 15, 20, '#8791a0'); dot(s, 23, 20, '#8791a0');
      dot(s, 19, 20, '#1a1b22'); dot(s, 20, 20, '#1a1b22'); dot(s, 21, 20, '#1a1b22');
      box(s, 14, 18, 20, 21); box(s, 22, 26, 20, 21);
      box(s, 14, 18, 19, 19, '#15161c'); box(s, 22, 26, 19, 19, '#15161c'); return s; } },

    'Rainbow Shades': { tier: 'Rare', color: '#f2f5fa', seed: 3, shadow: true, shape() { const s = [];
      const RB = ['#fe0000', '#ff7a00', '#fcdf00', '#16d34c', '#2f9ad3', '#8a2be2'], RV = [...RB].reverse();
      for (let c = 14; c <= 18; c++) { dot(s, c, 20, RB[(c - 14) % 6]); dot(s, c, 21, RV[(c - 14) % 6]); }   // top rainbow, bottom reversed rainbow
      for (let c = 22; c <= 26; c++) { dot(s, c, 20, RB[(c - 22) % 6]); dot(s, c, 21, RV[(c - 22) % 6]); }
      dot(s, 19, 20); dot(s, 20, 20); dot(s, 21, 20);                            // bridge (plain -> tonal white, not flat)
      box(s, 14, 18, 19, 19); box(s, 22, 26, 19, 19); box(s, 14, 18, 22, 22, '#eef2f8'); box(s, 22, 26, 22, 22, '#eef2f8');   // TOP frame plain->white; BOTTOM frame explicit WHITE (was cold-blue) to match the top
      [19, 20, 21, 22].forEach(r => { dot(s, 13, r); dot(s, 27, r); }); return s; } },

    '3D Glasses': { tier: 'Uncommon', color: '#e2e2e6', seed: 4, shadow: true, shape() { const s = [];
      const RED = ['#ff3a3a', '#e01414', '#c20e0e', '#ff5555', '#d81212', '#b81010'];
      const CY = ['#3ce8f5', '#17cfe6', '#0fb0c8', '#5cf0fa', '#12bcd6', '#0aa0ba'];
      let i = 0; for (let r = 20; r <= 21; r++) for (let c = 14; c <= 18; c++) dot(s, c, r, RED[(i++) % RED.length]);   // tonal red blocks
      let j = 0; for (let r = 20; r <= 21; r++) for (let c = 22; c <= 26; c++) dot(s, c, r, CY[(j++) % CY.length]);     // tonal cyan blocks
      box(s, 14, 26, 19, 19); dot(s, 19, 20); dot(s, 20, 20); dot(s, 21, 20); return s; } },   // frame plain -> tonal white

    'Crying': { tier: 'Rare', color: '#3a3f4a', seed: 6, perEye: true, shape() { const s = [];
      dot(s, 15, 18, 'FDARK'); dot(s, 16, 18, 'FDARK'); dot(s, 24, 18, 'FDARK'); dot(s, 25, 18, 'FDARK');   // top lid = facet tone (was grey #2a2f38) — 2026-07-24 user
      box(s, 15, 17, 19, 20, W); dot(s, 16, 20, 'FDARK'); box(s, 23, 25, 19, 20, W); dot(s, 24, 20, 'FDARK');   // pupils = facet tone (was K)
      const T = ['#7cc8ff', '#a8dcff', '#5ab0f5', '#c8e8ff'];
      for (let r = 21; r <= 40; r++) { const solid = r >= 36; if (solid || r % 5 !== 0) dot(s, 16, r, T[r % 4]); if (solid || r % 5 !== 2) dot(s, 24, r, T[(r + 1) % 4]); }   // tears run down, SOLID for the last rows so they reach + touch the canvas bottom edge
      return s; } },

    'Cyclops': { tier: 'Legendary', color: '#16a04c', seed: 8, shape() { const s = [];
      dot(s, 20, 20, 'FDARK'); dot(s, 20, 21, 'FDARK'); dot(s, 19, 20, '#ffffff'); dot(s, 21, 22, '#bfeecb');   // pupil = facet tone (was pitch-black #0a0c10) — 2026-07-24 user
      dot(s, 18, 19, 'FDARK'); dot(s, 19, 18, 'FDARK'); dot(s, 20, 18, 'FDARK'); dot(s, 21, 19, 'FDARK'); dot(s, 22, 19, 'FDARK');  // warped lid shadow (facet-harmonised)
      box(s, 19, 21, 20, 22, 'FDARK'); box(s, 17, 23, 19, 23, '#eef2f8');       // iris (facet tone) + white sclera
      const R = 'FDARK';                                                        // WARPED socket rim (facet-harmonised, irregular)
      [[16, 18], [17, 17], [18, 17], [19, 17], [20, 17], [21, 17], [22, 18], [23, 18], [24, 19]].forEach(p => s.push([p[0], p[1], R]));
      [[15, 20], [16, 19], [16, 21], [16, 22], [24, 20], [24, 21], [25, 22]].forEach(p => s.push([p[0], p[1], R]));
      [[17, 24], [18, 24], [19, 24], [20, 24], [21, 23], [22, 24], [23, 24]].forEach(p => s.push([p[0], p[1], R])); return s; } },

    'Flame Eyes': { tier: 'Rare', color: '#ff5510', seed: 12, perEye: true, shape() { const s = [];
      [16, 24].forEach(cx => {                                                 // unified flame ball at the EYE LINE: black-red base -> red -> orange -> yellow tip (2 balls, bigger)
        dot(s, cx - 1, 21, '#3a0c0c'); dot(s, cx, 21, '#1a0808'); dot(s, cx + 1, 21, '#3a0c0c');   // black-red core (base = the "eye")
        dot(s, cx - 1, 20, '#e02010'); dot(s, cx, 20, '#8a1010'); dot(s, cx + 1, 20, '#e02010');   // dark red (eye line)
        dot(s, cx - 1, 19, '#ff4510'); dot(s, cx, 19, '#ff6510'); dot(s, cx + 1, 19, '#ff4510');   // red-orange
        dot(s, cx - 1, 18, '#ff7515'); dot(s, cx, 18, '#ff9020'); dot(s, cx + 1, 18, '#ffa828');   // orange
        dot(s, cx - 1, 17, '#ffb020'); dot(s, cx, 17, '#ffcc38'); dot(s, cx + 1, 17, '#ffb828');   // yellow-orange
        dot(s, cx, 16, '#ffe850'); dot(s, cx, 15, '#fff5a0');                                      // yellow tip
        dot(s, cx - 2, 19, '#e02010'); dot(s, cx + 2, 18, '#ff9020');                              // flicker
      }); return s; } },

    'Eyepatch': { tier: 'Uncommon', color: '#1c1c22', seed: 18, clip: true, shape() { const s = [];   // clip=true: straps OVERSHOOT + render_v7 clips to the head circle -> always touch the edge, never outside (any pose)
      const STR = '#101014';
      box(s, 14, 18, 19, 22);                                                  // patch over the left eye
      [13, 12, 11, 10, 9, 8].forEach(c => dot(s, c, 20, STR));                  // LEFT strap (overshoots -> clipped to left head edge)
      dot(s, 18, 18, STR); [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31].forEach(c => dot(s, c, 17, STR));   // RIGHT strap across forehead (overshoots -> clipped to right head edge)
      box(s, 23, 25, 20, 20, W); dot(s, 24, 20, K); dot(s, 23, 19, '#ffffff');  // right eye
      [[22, 20], [26, 20], [24, 19], [24, 21]].forEach(p => dot(s, p[0], p[1], SOCK)); return s; } },

    'Cyber Visor': { tier: 'Rare', color: '#0e0e14', seed: 21, shadow: true, shape() { const s = [];   // SLIMMED 2026-07-24 (user): dropped top/bottom contour rim (rows 18/22) + black under-blocks (row 23) -> clean 3-row visor (19-21). scan line + facet-dark body + button
      for (let c = 14; c <= 26; c++) dot(s, c, 20, '#48ecf6');                        // bright cyan scan line (pushed first -> survives)
      dot(s, 16, 20, '#ffffff'); dot(s, 24, 20, '#ffffff');                           // two scan glints
      dot(s, 12, 20);                                                                 // 2026-07-24 (user): dropped left rim top/bottom (12,19)/(12,21) + the 2 red button blocks (28,19)/(28,20) — unnecessary
      box(s, 13, 27, 19, 21, 'FDARK'); return s; } },                                  // visor BODY (facet-dark, auto colour harmony)

    // ---- basic TYPE eyes (B&W shapes; socket:true => facet-aware dark recess drawn under them for depth) ----
    'Human': { tier: 'Common', color: '#141821', socket: true, perEye: true, shape() { const s = [];
      [16, 24].forEach(cx => { dot(s, cx, 20, 'FDARK'); dot(s, cx - 1, 20, W); dot(s, cx + 1, 20, W); }); return s; } },   // white-facetdark-white — pupil harmonises to the facet tone

    'Kohl': { tier: 'Uncommon', color: '#0a0a0e', socket: true, deepSocket: true, perEye: true, shape() { const s = [];   // "sürmeli" — heavy kohl/eyeliner bars with white pupils + subtle recess ring
      dot(s, 15, 20, W); dot(s, 17, 20, W); dot(s, 23, 20, W); dot(s, 25, 20, W);           // white pupils first (survive dedup)
      box(s, 14, 18, 19, 21, 'FDARK'); box(s, 22, 26, 19, 21, 'FDARK'); return s; } },       // full mask over each eye (5 wide x 3 tall, facet-dark tone blocks)

    'Big Eyes': { tier: 'Uncommon', color: '#141821', socket: true, perEye: true, shape() { const s = [];
      [16, 24].forEach(cx => { dot(s, cx, 20, 'FDARK'); dot(s, cx, 21, 'FDARK'); dot(s, cx - 1, 19, '#ffffff');
        for (let r = 19; r <= 21; r++) for (let c = cx - 1; c <= cx + 1; c++) dot(s, c, r, W); }); return s; } },

    'Cross-eyed': { tier: 'Rare', color: '#141821', socket: true, perEye: true, shape() { const s = [];
      dot(s, 17, 20, 'FDARK'); dot(s, 15, 19, W); dot(s, 16, 19, W); dot(s, 17, 19, W); dot(s, 15, 20, W); dot(s, 16, 20, W);
      dot(s, 23, 20, 'FDARK'); dot(s, 23, 19, W); dot(s, 24, 19, W); dot(s, 25, 19, W); dot(s, 24, 20, W); dot(s, 25, 20, W); return s; } },

    'Long': { tier: 'Uncommon', color: '#141821', socket: true, perEye: true, shape() { const s = [];
      dot(s, 16, 20, 'FDARK'); dot(s, 24, 20, 'FDARK');
      for (let c = 14; c <= 18; c++) { dot(s, c, 19, 'FDARK'); dot(s, c, 20, W); }
      for (let c = 22; c <= 26; c++) { dot(s, c, 19, 'FDARK'); dot(s, c, 20, W); } return s; } }
  };
  // NOTE: Dot + piece Sharp/Wink/Calm/Sleepy removed — the OLD face-eye versions (engine) are kept instead (user preferred them).

  const cache = {}; for (const k in DEF) cache[k] = window.PIXEL_SHADE.build(DEF[k].shape(), DEF[k].color, DEF[k].seed);
  window.FACET_EYES = { order: ['None', ...Object.keys(DEF)], defs: DEF, cells: n => cache[n] || [], tierOf: n => (DEF[n] && DEF[n].tier) || '-', clipOf: n => !!(DEF[n] && DEF[n].clip), socketOf: n => !!(DEF[n] && DEF[n].socket), shadowOf: n => !!(DEF[n] && DEF[n].shadow), deepSocketOf: n => !!(DEF[n] && DEF[n].deepSocket), perEyeOf: n => !!(DEF[n] && DEF[n].perEye) };
})();
