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
      dot(s, 24, 20, 'FDARK'); dot(s, 23, 20, W); dot(s, 25, 20, W);  // right eye = the HUMAN eye, so the iris carries the facet
      return s; } },

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
,

    // ══════ FINAL SKETCH SET 2026-08-29 ══════

    // ── homage · ultra ── ALIEN. gruff, 2026-09-02: cyan family, covers the whole facet, and then, in order:
    //    "tekil bloklar" = MORE detail (I read that backwards once and flattened it - the note is here so it
    //    does not happen twice), and then: the drawn details in TONES not one flat colour, and the eyes as
    //    two white cells fading out to cyan so they read blurred from a distance.
    // ⛔ EVERY VARIATION HERE IS DETERMINISTIC, from (c, r) only - never a token seed, never random. The
    //    Solidity port reproduces it cell for cell, and a per-token texture would break the parity prints.
    // ⛔ CLIP WINDOW = AUTHORED ROWS 13..27, output = authored - 3. FOREGROUND FIRST: the eyes and the face
    //    detail are drawn BEFORE the skin field or dedup buries them.
    // ⛔ DRAWN WIDER THAN THE HEAD; the clip trims the excess. Without the extra columns the far cheek goes
    //    bare at yaw -18/+18 - the piece slides with the pose, the head silhouette does not.
    'Alien': { tier: 'Legendary', color: '#43a9d8', seed: 71, clip: true, socket: true, deepSocket: true, shape() { const s = [];
      const C = ['#d8f7fd', '#aeeefa', '#7fdcf2', '#5cc2e6', '#43a9d8', '#3489c2', '#2a6ea3', '#215480', '#193c5e', '#12283d'];
      const W = '#f6feff';
      // 1. the eyes: two white cells at each core, then a fade out through the cyan ramp. No outline - the
      //    edge dissolves, which is what makes them read as blurred rather than cut out.
      // ⚠️ The fade tone matters: at near-white the two haloes met and the upper face became one white mass.
      const CORE = [[15, 20], [16, 20], [24, 20], [25, 20]];
      for (let c = 11; c <= 29; c++) for (let r = 16; r <= 24; r++) {
        let d = 99;
        for (const k of CORE) d = Math.min(d, Math.hypot((c - k[0]) / 1.45, (r - k[1]) / 1.0));
        if (d < 0.35) dot(s, c, r, W);
        else if (d < 1.15) dot(s, c, r, C[0]);
        else if (d < 1.75) dot(s, c, r, C[1]);
        else if (d < 2.35) dot(s, c, r, C[2]);
        else if (d < 2.95) dot(s, c, r, C[3]);
      }
      // 2. the drawn detail, each line broken across two or three tones so it reads as surface, not as ink
      for (let c = 13; c <= 27; c++) dot(s, c, 18, C[5 + ((c * 3) % 3)]);                 // the brow
      [[13, 17], [14, 17], [26, 17], [27, 17]].forEach((q, i) => dot(s, q[0], q[1], C[7 + (i % 2)]));   // temples
      [[13, 23], [14, 23], [26, 23], [27, 23]].forEach((q, i) => dot(s, q[0], q[1], C[6 + (i % 2)]));   // cheek hollows
      [[19, 23], [21, 23]].forEach((q, i) => dot(s, q[0], q[1], C[8 + (i % 2)]));         // nostril slits
      for (let c = 18; c <= 22; c++) dot(s, c, 25, C[8 + ((c + 1) % 2)]);                 // the closed mouth
      [[17, 25], [23, 25]].forEach((q, i) => dot(s, q[0], q[1], C[7 + (i % 2)]));
      // 3. the skin: a zoned base, then INDIVIDUAL blocks lifted or dropped one step so the surface reads as
      //    plated rather than airbrushed. n is a fixed lattice, identical on every token.
      for (let c = 9; c <= 31; c++) for (let r = 9; r <= 31; r++) {
        const v = (c - 17.5) * 0.34 + (r - 17.5) * 0.92;
        let i = v < -4.6 ? 1 : v < -1.6 ? 2 : v < 1.4 ? 3 : v < 4.0 ? 4 : v < 6.2 ? 6 : 7;
        const n = (c * 7 + r * 13) % 11;
        if (n === 0 || n === 3) i -= 1; else if (n === 5 || n === 8) i += 1;
        dot(s, c, r, C[i < 0 ? 0 : i > 9 ? 9 : i]);
      }
      return s; } },

    // ── homage · ultra ── SKULL. A legendary has to look expensive at 35px, and the way to do that is not
    //    more detail, it is FORM: one light direction, a ridge that catches it, a recess that loses it.
    // ⛔ CLIP WINDOW = AUTHORED ROWS 13..27, output = authored - 3. Row 13 is the crown, row 27 the chin.
    // ⛔ FOREGROUND FIRST. dedup keeps the FIRST cell written, so every socket, gap and shadow is drawn
    //    BEFORE the bone field. Written after, they are silently buried.
    // ⛔ The sockets straddle row 20 because the piece is anchored to the EYES.
    'Skull': { tier: 'Legendary', color: '#cdc9b4', seed: 69, clip: true, socket: true, deepSocket: true, shape() { const s = [];
      // seven tones, lit from the upper left. Cool ivory into warm umber - a flat 4-tone field is what made
      // the first version read as a common trait.
      const T = ['#f3f1e0', '#e4dfc7', '#cdc4a6', '#b3a789', '#96886b', '#786a52', '#584b3a'];
      const VOID = '#08090a', DEEP = '#14150f', GLOW = '#2c2d22';
      // form: a base ramp from the light, then the skull's own relief pushes cells lighter or darker
      const RELIEF = {};
      const rel = (list, d) => list.forEach(p => RELIEF[p[0] + ',' + p[1]] = (RELIEF[p[0] + ',' + p[1]] || 0) + d);
      const row = (r, c0, c1, d) => { for (let c = c0; c <= c1; c++) rel([[c, r]], d); };
      row(14, 16, 24, -2); row(15, 15, 25, -2);                 // the crown catches the light
      row(17, 14, 26, -2); row(18, 13, 14, -1); row(18, 26, 27, -1);   // brow ridge
      row(22, 14, 26, -1);                                      // cheekbones
      row(24, 15, 25, -1);                                      // the maxilla above the teeth
      row(16, 13, 15, 2); row(16, 25, 27, 2);                   // temples sink
      row(19, 13, 14, 1); row(19, 26, 27, 1);
      row(23, 14, 16, 2); row(23, 24, 26, 2);                   // under the cheekbone
      row(26, 14, 26, 2); row(27, 13, 27, 4);                   // the jaw falls away into shadow
      // 1. sockets: not flat holes. Darkest under the brow, a breath of bounced light at the floor.
      [15, 22].forEach(x0 => {
        for (let c = x0; c <= x0 + 3; c++) {
          dot(s, c, 18, VOID); dot(s, c, 19, VOID);
          dot(s, c, 20, DEEP); dot(s, c, 21, (c === x0 || c === x0 + 3) ? DEEP : GLOW);
        }
      });
      // 2. nasal aperture, an inverted triangle, with its own lit left edge
      [19, 21].forEach(c => dot(s, c, 22, VOID)); [19, 20, 21].forEach(c => dot(s, c, 23, VOID));
      dot(s, 18, 22, T[1]); dot(s, 18, 23, T[2]);
      // 3. teeth: bone, thin gaps, and a shadow line where they meet
      [16, 18, 20, 22, 24].forEach(c => { dot(s, c, 24, DEEP); dot(s, c, 25, DEEP); });
      // the bite line is not one flat bar: darkest under the front teeth, opening at the jaw corners where
      // a little light still reaches, and the bone under it turns instead of just ending.
      for (let c = 18; c <= 22; c++) dot(s, c, 26, VOID);
      [[17, 26], [23, 26]].forEach(q => dot(s, q[0], q[1], '#2a281f'));
      [[16, 26], [24, 26]].forEach(q => dot(s, q[0], q[1], '#5c5342'));
      [[19, 27], [20, 27], [21, 27]].forEach(q => dot(s, q[0], q[1], '#8e8168'));
      [[17, 27], [18, 27], [22, 27], [23, 27]].forEach(q => dot(s, q[0], q[1], '#6b5f4a'));
      // 5. the facet, in the temples. One side always turns away - that is the pose doing its job.
      [[13, 19], [13, 20], [27, 19], [27, 20]].forEach(p => dot(s, p[0], p[1], 'FDARK'));
      // 6. the bone, shaded by light direction + relief
      // ⛔ DRAWN WIDER THAN THE HEAD ON PURPOSE. The clip trims whatever falls outside the circle, so the
      //    extra columns cost nothing - but without them the far rim is bare at yaw -18/+18, because the
      //    PIECE slides with the pose while the head silhouette does not. Authored 12..28 stopped two
      //    columns short of the rim exactly when the head turned - and the SAME thing happens vertically
      //    with pitch, which is why the rows run 9..31: at pitch -10 the crown row was bare. Testing only
      //    pitch 0 hid that completely. The tone ramp still counts from 12/13 so the shading is unchanged.
      for (let c = 8; c <= 32; c++) for (let r = 9; r <= 31; r++) {
        let i = Math.round((c - 12) * 0.16 + (r - 13) * 0.30) + (RELIEF[c + ',' + r] || 0);
        dot(s, c, r, T[i < 0 ? 0 : i > 6 ? 6 : i]);
      }
      return s; } },

    // ── homage · ultra ── APE. gruff, 2026-09-02: "facet = kurk, ape = yuz". The piece draws NO fur - the
    //    token's own head IS the fur, and this is the bare face on it. So it must read as SKIN, not a mask:
    //    no hard border, no fittings at the edges, and the outer ring darkens into the head.
    // ⛔ NO FDARK ANCHORS, NO STRAPS, NO OUTLINE. Anything that reads as an edge fitting turns it back into a
    //    mask, which is the one thing this piece must not be.
    // ⛔ DRAWN WIDER THAN THE HEAD; the clip trims the excess. Without the extra columns the far cheek goes
    //    bare at yaw -18/+18 - the piece slides with the pose, the head silhouette does not.
    // ⚠️ THE OUTLINE IS gruff's, drawn in red over a render: a heart with TWIN BROW PEAKS and a shallow dip
    //    between them, not a plain dome. The face runs low - the muzzle reaches the bottom of the window and
    //    the Ape Jaw carries it one row further.
    // ⚠️ The darks do the work: rings at the eyes, the hollows beside the nose, the temples, the cheek
    //    hollows. A flat tan oval with two dots is not a face.
    'Ape': { tier: 'Legendary', color: '#c7a375', seed: 67, clip: true, socket: true, deepSocket: true, shape() { const s = [];
      const K = ['AS0', 'AS1', 'AS2', 'AS3', 'AS4', 'AS5', 'AS6', 'AS7'];   // resolved per token: see APE_SKIN
      const VOID = '#140c06';
      const REL = {};
      const put = (l, d) => l.forEach(p => REL[p[0] + ',' + p[1]] = (REL[p[0] + ',' + p[1]] || 0) + d);
      const row = (r, c0, c1, d) => { const l = []; for (let c = c0; c <= c1; c++) l.push([c, r]); put(l, d); };
      row(18, 15, 25, -2); row(19, 14, 26, -1);            // the brow, lit along its twin peaks
      row(20, 13, 27, 2); row(21, 13, 27, 1);              // and the shadow it throws over the eyes
      row(23, 17, 23, -2); row(24, 17, 23, -1);            // the muzzle projects: top plane lit
      row(27, 15, 25, 2); row(28, 15, 25, 3);              // and falls away under the mouth
      put([[14, 18], [15, 18], [14, 19], [15, 19], [25, 18], [26, 18], [25, 19], [26, 19]], 3);   // temples
      put([[14, 22], [15, 22], [14, 23], [15, 23], [25, 22], [26, 22], [25, 23], [26, 23]], 3);   // cheek hollows
      const t = (c, r) => { const i = Math.round((c - 13) * 0.14 + (r - 17) * 0.30) + (REL[c + ',' + r] || 0);
        return K[i < 0 ? 0 : i > 7 ? 7 : i]; };
      // 1. the eyes: amber, small and soft. A 5x4 dark block per eye merged into one bar and read as
      //    sunglasses - on the reference the darks around the eye are shading, not a ring of paint.
      [16, 24].forEach(cx => {
        dot(s, cx, 20, 'ASI');                                                  // the amber iris
        dot(s, cx, 19, K[6]); dot(s, cx, 21, 'AS7');                             // lid above, crease below
        dot(s, cx - 1, 20, K[7]); dot(s, cx + 1, 20, K[7]);
        [[cx - 1, 19], [cx + 1, 19], [cx - 1, 21], [cx + 1, 21]].forEach(q => dot(s, q[0], q[1], K[5]));
      });
      // 2. the nose: a lit bridge, dark hollows either side, the nostrils
      [[20, 22], [20, 23]].forEach(p => dot(s, p[0], p[1], K[1]));
      [[18, 23], [22, 23], [18, 24], [22, 24]].forEach(p => dot(s, p[0], p[1], K[6]));
      [[19, 24], [21, 24]].forEach(p => dot(s, p[0], p[1], 'AS7'));
      dot(s, 20, 24, K[5]);
      // 3. the mouth, wide and low: a dark line with a lit lip under it
      for (let c = 15; c <= 25; c++) dot(s, c, 26, 'AS7');
      [14, 26].forEach(c => dot(s, c, 26, K[6]));                                   // the corners fade, not stop
      for (let c = 16; c <= 24; c++) dot(s, c, 27, K[3]);                           // the lower lip, lit
      // 4. the skin, following gruff's outline. Twin brow peaks at 16-18 and 22-24, a dip at 19-21.
      const TOP = { 12:22, 13:21, 14:19, 15:18, 16:17, 17:17, 18:17, 19:18, 20:18, 21:18, 22:17, 23:17, 24:17, 25:18, 26:19, 27:21, 28:22 };
      const BOT = { 12:23, 13:24, 14:25, 15:26, 16:27, 17:27, 18:27, 19:27, 20:27, 21:27, 22:27, 23:27, 24:27, 25:26, 26:25, 27:24, 28:23 };
      for (let c = 12; c <= 28; c++) for (let r = TOP[c]; r <= BOT[c]; r++) dot(s, c, r, t(c, r));
      return s; } },
    'Hi-Vis': { tier: 'Rare', color: '#c9d24a', seed: 45, clip: true, socket: true, shape() { const s = [];
      dot(s, 15, 19, '#ffffff'); dot(s, 23, 19, '#ffffff');
      [14, 22].forEach(x0 => { for (let c = x0; c <= x0 + 4; c++) { dot(s, c, 19, '#eef2a8'); dot(s, c, 20, '#d8e46a'); dot(s, c, 21, '#a8b53a'); } });
      [14, 22].forEach(x0 => { for (let c = x0; c <= x0 + 4; c++) { dot(s, c, 18, '#4a5210'); dot(s, c, 22, '#2e330a'); } });
      [19, 20, 21].forEach(c => dot(s, c, 19, '#4a5210'));
      [12, 13].forEach(c => { dot(s, c, 19, 'FDARK'); dot(s, c, 20, '#2e330a'); });   // arm, one cell shorter: it now ends INSIDE the skull
      [27, 28].forEach(c => { dot(s, c, 19, 'FDARK'); dot(s, c, 20, '#2e330a'); });
      return s; } },

    // ── GHOST · rare ──
    'Blindfold': { tier: 'Rare', color: '#cfcabc', seed: 59, clip: true, socket: true, deepSocket: true, shape() { const s = [];
      [15, 19, 23].forEach(c => dot(s, c, 19, '#a89f8c'));
      [17, 21, 25].forEach(c => dot(s, c, 21, '#a89f8c'));
      box(s, 10, 30, 19, 19, '#e8e2d4'); box(s, 10, 30, 20, 21); box(s, 10, 30, 22, 22, '#8a8171');
      dot(s, 10, 20, 'FDARK'); dot(s, 30, 21, 'FDARK');            // facet accent kept, the left tail dropped (gruff)
      return s; } },

    // ── universal · rare ── the crackle row is gone: three marks, not a dotted line (gruff).
    'Pit Viper': { tier: 'Rare', color: '#1a1d24', seed: 63, clip: true, socket: true, shape() { const s = [];
      const MIR2 = ['#ff2f6e', '#f0327a', '#e8321f', '#f04a14', '#ff7a1f', '#ffb02f', '#ff7a1f', '#f04a14', '#e8321f', '#f0327a', '#ff2f6e'];
      const ROW = { 20: [12, 28], 21: [12, 28], 22: [13, 27], 23: [15, 25] };
      [[20, 19], [20, 20], [19, 20], [21, 20]].forEach(p => dot(s, p[0], p[1], '#141414'));
      dot(s, 15, 21, '#ffd8e8');
      for (const r of [20, 21, 22, 23]) { const [a, b] = ROW[r];
        for (let c = a; c <= b; c++) { if (r === 23 && c >= 19 && c <= 21) continue;
          dot(s, c, r, MIR2[(c - 12 + (r - 20)) % 11]); } }
      // ⛔ CYAN FIRST. dedup keeps the FIRST cell, so writing the black bar before these marks deleted
      //    every one of them and the row came out solid black.
      [19, 20, 21].forEach(c => dot(s, c, 18, '#3ad6e0'));                                 // three in the middle
      dot(s, 13, 18, '#3ad6e0'); dot(s, 27, 18, '#3ad6e0');                 // one at each end - cols 13/27, because the head clips anything wider on this row
      box(s, 11, 29, 18, 18, '#141414'); box(s, 11, 29, 19, 19, '#141414');   // the rest of the frame, black
      [11, 20, 29].forEach(c => dot(s, c, 18, '#141414'));                               // three marks only
      dot(s, 11, 20, '#141414'); dot(s, 29, 20, '#141414');
      dot(s, 10, 19, 'FDARK'); dot(s, 30, 19, 'FDARK');
      return s; } },

    'Scanner': { tier: 'Rare', color: '#22262e', seed: 51, clip: true, socket: true, shape() { const s = [];
      const TOP = ['#8d939d', '#6f7682', '#9aa1ab', '#5f6672', '#7d848f', '#69707c'];
      dot(s, 24, 20, 'FDARK'); dot(s, 23, 20, W); dot(s, 25, 20, W);
      [14, 15, 16, 17].forEach(c => dot(s, c, 20, '#ff3a4a')); dot(s, 18, 20, '#ffd0d4');
      box(s, 13, 18, 19, 19, '#11151b'); box(s, 13, 18, 21, 21, '#11151b');
      for (let c = 11; c <= 19; c++) dot(s, c, 18, TOP[c % 6]);
      box(s, 11, 19, 19, 21); box(s, 11, 19, 22, 22, '#0b0d12');
      dot(s, 19, 19, '#8d939d'); dot(s, 19, 20, '#8d939d'); dot(s, 19, 21, '#8d939d');   // inner bezel, still on the device side
      // ⚠️ the bracket that used to climb to the middle of the forehead is gone (gruff): the piece belongs
      //    to ONE eye, and anything crossing the centre line made it read as a full mask instead.
      dot(s, 11, 19, 'FDARK'); dot(s, 11, 21, 'FDARK');                // facet accent moved out to the temple
      return s; } },

    'Diving Mask': { tier: 'Rare', color: '#2a2f3a', seed: 43, socket: true, shape() { const s = [];
      const GL = '#bcd8e8', GH = '#e8f5fc', GD = '#7ea6bc', FR = '#0b0d12';
      dot(s, 15, 19, '#ffffff'); dot(s, 23, 19, '#ffffff'); dot(s, 16, 19, GH); dot(s, 24, 19, GH);
      [14, 22].forEach(x0 => { [x0 + 1, x0 + 2, x0 + 3].forEach(c => { dot(s, c, 19, GL); dot(s, c, 21, GD); });
        for (let c = x0; c <= x0 + 4; c++) dot(s, c, 20, GL); });
      [14, 22].forEach(x0 => { [x0 + 1, x0 + 2, x0 + 3].forEach(c => { dot(s, c, 18, FR); dot(s, c, 22, FR); });
        dot(s, x0, 19, FR); dot(s, x0 + 4, 19, FR); dot(s, x0, 21, FR); dot(s, x0 + 4, 21, FR); });
      dot(s, 13, 20, FR); dot(s, 27, 20, FR);
      [19, 20, 21].forEach(c => dot(s, c, 20, FR));
      dot(s, 19, 19, 'FDARK'); dot(s, 21, 19, 'FDARK');
      return s; } },

    'Frog': { tier: 'Rare', color: '#3f7d3a', seed: 65, socket: true, shape() { const s = [];
      [17, 23].forEach(cx => {
        dot(s, cx, 19, '#0a0d0a'); dot(s, cx - 1, 19, '#ffffff'); dot(s, cx + 1, 19, '#f2f7f2');
        [cx - 1, cx, cx + 1].forEach(c => { dot(s, c, 18, '#f2f7f2'); dot(s, c, 20, '#cfe0cf'); });
        [cx - 2, cx + 2].forEach(c => { dot(s, c, 18, '#5aa054'); dot(s, c, 19, '#5aa054'); dot(s, c, 20, '#5aa054'); });
        [cx - 1, cx, cx + 1].forEach(c => { dot(s, c, 17, '#78c470'); dot(s, c, 21, '#2f5c2c'); });
      });
      return s; } },

    'Noggles': { tier: 'Rare', color: '#d5d7e0', seed: 73, socket: true, shape() { const s = [];
      [14, 22].forEach(x0 => {
        for (let c = x0; c <= x0 + 4; c++) { dot(s, c, 18, '#0b0d12'); dot(s, c, 22, '#0b0d12'); }
        [19, 20, 21].forEach(r => { dot(s, x0, r, '#0b0d12'); dot(s, x0 + 4, r, '#0b0d12'); });
        for (let c = x0 + 1; c <= x0 + 3; c++) [19, 20, 21].forEach(r => dot(s, c, r, '#f2f4f8'));
        [19, 20, 21].forEach(r => dot(s, x0 + 2, r, '#0b0d12'));
      });
      [19, 20, 21].forEach(c => dot(s, c, 20, '#0b0d12'));
      return s; } },

    'Static': { tier: 'Rare', color: '#9aa0aa', seed: 79, clip: true, socket: true, deepSocket: true, shape() { const s = [];
      const N = ['#f2f4f8', '#20242c', '#c8ccd4', '#3b4048', '#e0e4ea', '#12161c', '#a8aeb8', '#2a2f36'];
      [15, 21].forEach(x0 => {
        for (let r = 19; r <= 21; r++) for (let c = x0; c <= x0 + 4; c++) dot(s, c, r, N[(c * 3 + r * 5) % 8]);
        for (let c = x0; c <= x0 + 4; c++) { dot(s, c, 18, '#0b0d12'); dot(s, c, 22, '#0b0d12'); }
      });
      return s; } },

    'Furious': { tier: 'Rare', color: '#141821', seed: 85, socket: true, deepSocket: true, perEye: true, shape() { const s = [];
      [16, 24].forEach(cx => { dot(s, cx, 21, '#e8321f'); dot(s, cx - 1, 21, W); dot(s, cx + 1, 21, W); });
      [[14, 18], [15, 18], [16, 19], [17, 19], [18, 20]].forEach(p => dot(s, p[0], p[1], 'FDARK'));
      [[26, 18], [25, 18], [24, 19], [23, 19], [22, 20]].forEach(p => dot(s, p[0], p[1], 'FDARK'));
      return s; } },

    // ── NEWBIE · mid ──
    'Borrowed Goggles': { tier: 'Uncommon', color: '#3a4048', seed: 61, socket: true, shape() { const s = [];
      dot(s, 15, 20, '#fff2cc'); dot(s, 24, 21, '#fff2cc');
      [14, 15, 16, 17].forEach(c => { dot(s, c, 20, '#e8a838'); dot(s, c, 21, '#b87d1c'); });
      [23, 24, 25, 26].forEach(c => { dot(s, c, 21, '#e8a838'); dot(s, c, 22, '#b87d1c'); });
      [14, 15, 16, 17].forEach(c => { dot(s, c, 19, '#0b0d12'); dot(s, c, 22, '#0b0d12'); });
      [23, 24, 25, 26].forEach(c => { dot(s, c, 20, '#0b0d12'); dot(s, c, 23, '#0b0d12'); });
      dot(s, 13, 20, '#0b0d12'); dot(s, 13, 21, '#0b0d12'); dot(s, 27, 21, '#0b0d12'); dot(s, 27, 22, '#0b0d12');
      [18, 19, 20, 21, 22].forEach(c => dot(s, c, 21, 'FDARK'));
      return s; } },

    // ⚠️ was 'Diamond Eyes'. It rendered as a pair of round tinted lenses, so the name was describing an
    //    intention rather than the picture. Renamed, and given the bridge and arms to make it deliberate.
    'Round Frames': { tier: 'Uncommon', color: '#bfe9f5', seed: 77, clip: true, socket: true, deepSocket: true, shape() { const s = [];
      [16, 24].forEach(cx => {
        dot(s, cx, 18, '#ffffff');
        dot(s, cx - 1, 19, '#dff6ff'); dot(s, cx, 19, '#a8dcf0'); dot(s, cx + 1, 19, '#7cc0da');
        dot(s, cx - 1, 20, '#a8dcf0'); dot(s, cx, 20, '#7cc0da'); dot(s, cx + 1, 20, '#4f93ad');
        dot(s, cx, 21, '#2f6b82');
        [cx - 2, cx + 2].forEach(c => dot(s, c, 20, '#0b0d12'));
        dot(s, cx - 1, 18, '#0b0d12'); dot(s, cx + 1, 18, '#0b0d12');
        dot(s, cx - 1, 21, '#0b0d12'); dot(s, cx + 1, 21, '#0b0d12');
      });
      [19, 20, 21].forEach(c => dot(s, c, 20, 'FDARK'));
      return s; } },

    'Squint': { tier: 'Uncommon', color: '#141821', seed: 81, socket: true, deepSocket: true, perEye: true, shape() { const s = [];
      [16, 24].forEach(cx => {
        dot(s, cx, 20, 'FDARK');
        [cx - 2, cx - 1, cx + 1, cx + 2].forEach(c => dot(s, c, 20, W));
        [cx - 2, cx - 1, cx, cx + 1, cx + 2].forEach(c => dot(s, c, 19, 'FDARK'));
        [cx - 1, cx, cx + 1].forEach(c => dot(s, c, 21, 'FDARK'));
      }); return s; } },

    'Side Eye': { tier: 'Uncommon', color: '#141821', seed: 83, socket: true, perEye: true, shape() { const s = [];
      [16, 24].forEach(cx => {
        dot(s, cx + 1, 20, 'FDARK');
        [cx - 2, cx - 1, cx, cx + 2].forEach(c => dot(s, c, 20, W));
        [cx - 2, cx - 1, cx, cx + 1, cx + 2].forEach(c => dot(s, c, 19, 'FDARK'));
      }); return s; } },

    // ── homage · ultra ── HOCKEY MASK. Covers the face down to the jaw, the way a worn mask does, with the
    //    scattered vent holes and the three head straps of the real thing.
    // ⛔ THE CLIP WINDOW IS AUTHORED ROWS 13..27, AND THE MAP IS EXACTLY output = authored - 3. Measured one
    //    authored row at a time (rowmap.cjs), because the colour-coded probe that said "13..25" was wrong -
    //    render_v7 groups equal fills in <g fill="X"> and the decode collided. Authored 27 is the chin.
    //    Cutting the plate at 22 is what made the mask look half-finished; it ended at output row 19 while
    //    the head runs to 24. Per-row width, authored: 24 -> 14..26, 25 -> 15..25, 26 -> 16..24, 27 -> 17..23.
    // ⛔ THE PLATE CARRIES THE JAWLINE, NOT THE BAND. The head silhouette does not move with yaw at all -
    //    output rows 20..24 are cols 10-24 / 11-23 / 12-22 / 13-21 / 14-20 at EVERY yaw, because the skull is
    //    a constant and the pose rolls the field. What slides is the BAND, which pairEye anchors to the eye
    //    midpoint. So anything that must hug the rim belongs in the CLIPPED eye piece, where the engine
    //    trims it for free.
    'Hockey Mask': { tier: 'Legendary', color: '#e8e4d8', seed: 89, clip: true, socket: true, deepSocket: true, shape() { const s = [];
      const HOLE = '#3f3d36', STRAP = '#141416';
      [16, 24].forEach(cx => {
        dot(s, cx, 20, 'PUPIL');   // FIRST: dedup keeps the first cell, so the socket below must not claim it
        for (let r = 19; r <= 21; r++) for (let c = cx - 1; c <= cx + 1; c++) dot(s, c, r, '#07090c');
        [cx - 2, cx + 2].forEach(c => { dot(s, c, 19, '#f0ece0'); dot(s, c, 20, '#c4bfb0'); dot(s, c, 21, '#9a9587'); });
        [cx - 1, cx, cx + 1].forEach(c => { dot(s, c, 18, '#f0ece0'); dot(s, c, 22, '#9a9587'); });
      });   // Skull's eye: a black socket inside a bone rim
      // the three straps, over the plate. Top one crosses the crown ABOVE the plate, on bare head, exactly
      // like the reference; the side ones run off the rim and read as passing behind the head.
      [[19, 13], [20, 13], [21, 13], [19, 14], [20, 14], [21, 14]].forEach(q => dot(s, q[0], q[1], STRAP));
      [[12, 19], [13, 19], [12, 20], [13, 20], [12, 21], [13, 21],
       [27, 19], [28, 19], [27, 20], [28, 20], [27, 21], [28, 21]].forEach(q => dot(s, q[0], q[1], STRAP));
      [[20, 15], [14, 20], [26, 20]].forEach(q => dot(s, q[0], q[1], 'FDARK'));   // the rivets = facet accent
      // vent holes: dots, not bars. Scattered over the brow and around the mouth, as on the moulded mask.
      [[20, 16], [17, 17], [23, 17], [15, 18], [25, 18], [18, 16], [22, 16]]
        .forEach(q => dot(s, q[0], q[1], HOLE));                                  // brow cluster
      dot(s, 20, 23, HOLE);                                                       // the nose hole
      [[16, 24], [19, 24], [21, 24], [24, 24],
       [15, 25], [18, 25], [22, 25], [25, 25],
       [17, 26], [20, 26], [23, 26]].forEach(q => dot(s, q[0], q[1], HOLE));      // the mouth cluster
      for (let c = 13; c <= 27; c++) dot(s, c, 15, '#f4f0e4');                    // lit top edge
      for (let c = 16; c <= 24; c++) dot(s, c, 27, '#b3afa3');                    // the mask turns under at the chin
      for (let c = 12; c <= 28; c++) for (let r = 16; r <= 27; r++) dot(s, c, r); // the plate, tonal, clipped to the rim
      return s; } },

    // ── common · expression ── BLANK. No pupils at all. The cheapest unsettling thing on this grid.
    'Blank': { tier: 'Common', color: '#141821', seed: 93, socket: true, deepSocket: true, perEye: true, shape() { const s = [];
      [16, 24].forEach(cx => {
        [cx - 2, cx - 1, cx, cx + 1, cx + 2].forEach(c => dot(s, c, 20, W));
        [cx - 1, cx, cx + 1].forEach(c => { dot(s, c, 19, 'FDARK'); dot(s, c, 21, 'FDARK'); });
      }); return s; } },
    // ── COLLECTOR · rare ── a loupe held TO the eye. Three tries to get here: a barrel read as nothing,
    //    a plain rimmed circle over the eye read as another eye, and hanging it on the cheek read as a
    //    growth. What makes it an object is the GOLD rim - a colour the face never wears - and a chain
    //    leaving the frame. Position was never the problem; contrast was.
    // ⚠️ NO clip HERE, on purpose. The chain is supposed to fall past the jaw; with clip on, everything
    //    below the head circle was deleted and the chain read as a two-cell stub. Same reasoning that let
    //    the Crown rise above the skull, pointed the other way.
    'Loupe': { tier: 'Rare', color: '#2c3038', seed: 95, socket: true, shape() { const s = [];
      dot(s, 16, 20, 'FDARK'); dot(s, 15, 20, W); dot(s, 17, 20, W);   // the free eye
      dot(s, 24, 20, '#dff4ff'); dot(s, 23, 20, '#a8cfe4'); dot(s, 25, 20, '#a8cfe4');
      dot(s, 24, 19, '#ffffff'); dot(s, 24, 21, '#7ea6bc');
      [23, 24, 25].forEach(c => { dot(s, c, 18, '#ffd24a'); dot(s, c, 22, '#8a6a14'); });   // thick gold rim
      dot(s, 22, 19, '#ffd24a'); dot(s, 26, 19, '#e8bd45');
      dot(s, 22, 21, '#a8811c'); dot(s, 26, 21, '#8a6a14');
      dot(s, 22, 20, '#c9a227'); dot(s, 26, 20, '#c9a227');
      dot(s, 22, 20, '#8a6a14');                                       // the little hook on the free side
      for (let r = 22; r <= 32; r++) dot(s, 27, r, (r % 2) ? '#ffd24a' : '#e8bd45');   // the chain: one straight bright line, no curve (gruff)
      return s; } },

    // ── WHALE · rare ── gold shades. The crown is gone but gold is still the whale signature, so the
    //    facet keeps it in a form that lives in the eye band instead of fighting the halo above the head.
    'Gold Shades': { tier: 'Rare', color: '#c9a227', seed: 97, clip: true, socket: true, shape() { const s = [];
      const GOLD = ['#ffe07a', '#e8bd45', '#ffd24a', '#c9971f', '#f0c862'];
      dot(s, 15, 20, '#fff6d0'); dot(s, 23, 20, '#fff6d0');
      [14, 22].forEach(x0 => { for (let c = x0; c <= x0 + 4; c++) for (let r = 20; r <= 21; r++) dot(s, c, r, '#151013'); });
      [14, 22].forEach(x0 => { for (let c = x0; c <= x0 + 4; c++) { dot(s, c, 19, GOLD[c % 5]); dot(s, c, 22, GOLD[(c + 3) % 5]); } });
      [14, 18, 22, 26].forEach(c => { dot(s, c, 20, GOLD[(c + 1) % 5]); dot(s, c, 21, GOLD[(c + 4) % 5]); });
      [13, 27].forEach(c => { dot(s, c, 19, GOLD[c % 5]); dot(s, c, 20, GOLD[(c + 2) % 5]);
        dot(s, c, 21, GOLD[(c + 3) % 5]); dot(s, c, 22, GOLD[(c + 1) % 5]); });        // outer edges closed (gruff)
      [19, 20, 21].forEach(c => dot(s, c, 19, GOLD[(c + 2) % 5]));
      [11, 12, 13].forEach(c => dot(s, c, 19, GOLD[(c + 3) % 5]));
      [27, 28, 29].forEach(c => dot(s, c, 19, GOLD[(c + 1) % 5]));
      dot(s, 10, 19, 'FDARK'); dot(s, 30, 19, 'FDARK');
      return s; } },

    // ── expressions. The wearables piled into the rare band, so these are written for mid and common,
    //    where the collection actually needs volume.
    'Shocked': { tier: 'Uncommon', color: '#141821', seed: 101, socket: true, deepSocket: true, perEye: true, shape() { const s = [];
      [16, 24].forEach(cx => {
        dot(s, cx, 20, 'FDARK');                                      // a tiny pupil in a wide white
        [cx - 2, cx - 1, cx + 1, cx + 2].forEach(c => { dot(s, c, 19, W); dot(s, c, 20, W); dot(s, c, 21, W); });
        dot(s, cx, 19, W); dot(s, cx, 21, W);
      }); return s; } },

    'Curious': { tier: 'Uncommon', color: '#141821', seed: 103, socket: true, perEye: true, shape() { const s = [];
      [16, 24].forEach(cx => { dot(s, cx, 20, 'FDARK'); dot(s, cx - 1, 20, W); dot(s, cx + 1, 20, W); });
      [[14, 18], [15, 17], [16, 17], [17, 17], [18, 18]].forEach(q => dot(s, q[0], q[1], 'FDARK'));   // left brow RAISED
      [[22, 19], [23, 19], [24, 19], [25, 19], [26, 19]].forEach(q => dot(s, q[0], q[1], 'FDARK'));   // right brow flat - the asymmetry IS the expression
      return s; } },


    // ── DEGEN · common ── the one meant to be seen often.
    'Miner': { tier: 'Common', color: '#2b2f36', seed: 47, clip: true, socket: true, shape() { const s = [];
      [16, 24].forEach(cx => { dot(s, cx, 21, 'FDARK'); dot(s, cx - 1, 21, W); dot(s, cx + 1, 21, W); });
      dot(s, 20, 15, '#fffbe0'); dot(s, 19, 15, '#ffe98a'); dot(s, 21, 15, '#ffe98a'); dot(s, 20, 14, '#fff6cc');
      box(s, 18, 22, 13, 16, '#0b0d12');
      dot(s, 18, 14, 'FDARK'); dot(s, 22, 14, 'FDARK');
      box(s, 10, 30, 17, 17, '#8f96a3'); box(s, 10, 30, 18, 18); box(s, 10, 30, 19, 19, '#0b0d12');
      return s; } },
  };
  // NOTE: Dot + piece Sharp/Wink/Calm/Sleepy removed — the OLD face-eye versions (engine) are kept instead (user preferred them).

  const cache = {}; for (const k in DEF) cache[k] = window.PIXEL_SHADE.build(DEF[k].shape(), DEF[k].color, DEF[k].seed);
  window.FACET_EYES = { order: ['None', ...Object.keys(DEF)], defs: DEF, cells: n => cache[n] || [], tierOf: n => (DEF[n] && DEF[n].tier) || '-', clipOf: n => !!(DEF[n] && DEF[n].clip), socketOf: n => !!(DEF[n] && DEF[n].socket), shadowOf: n => !!(DEF[n] && DEF[n].shadow), deepSocketOf: n => !!(DEF[n] && DEF[n].deepSocket), perEyeOf: n => !!(DEF[n] && DEF[n].perEye) };
})();
