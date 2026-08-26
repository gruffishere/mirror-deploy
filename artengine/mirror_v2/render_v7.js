/* FACETS v7 NATIVE pixel-grid renderer (JS reference for the on-chain render).
   The generative logic decides each of the 41x41 cells DIRECTLY (no rasterization, no old-engine rects).
   Geometry is evaluated in PIXEL space (centre 500,500, head R=220 -> identical to the old art) but PAINTED
   into cells, so every cell is one deliberate colour aligned to the grid: clean frames, no gap/notch artefacts,
   and cheap enough to port to Solidity (per-cell integer math + row-scan RLE).
   Exposes window.RENDER_V7 = { render, install, enabled, GRID }. install(G) wraps G.svg.

   PORTED 1:1 from portrait_v6.js + facets_gen.js. The ONLY change vs the old engine is that every `bs`
   (block_size, 30..38) is RE-PINNED to the fixed CELL = 1000/41 = 24.3902px (spec §NATIVE NOTES: the Block
   trait no longer sets grid resolution). Feature sizes, halo spacing, collector frame/wall pitch, mouth/eye
   geometry all use CELL so they stay native + consistent on the 41-grid.

   APPROXIMATIONS (flagged, see final report):
   - DEGEN rgb_glitch: the screen-space R/G/B chromatic split (feColorMatrix/feOffset) is a filter effect that
     is not expressible per-cell. We render the CLEAN white face (== rgb_offset None path) + apply the -6deg roll.
     The chromatic fringe is DROPPED. (Most Degen tokens are Glitch=None anyway -> byte-identical for those.)
   - bg patterns 'scatter' + 'starfield': the old engine consumes its rng sequentially per pattern-cell (order-
     dependent). Native samples per 41-cell, so those two are approximated with a position-hash test (density
     preserved, exact speckle differs). All OTHER bg patterns are deterministic -> byte-faithful.
   - bg_blocky sub-cell gap ignored (cell filled fully; at 41-grid the gap is sub-pixel anyway).
   - headpiece/geo/echo/scanlines/pnlOverlay (dead for FACETS) omitted. crownHalo was never ported and the forge
     retired its crown halo on 2026-07-28, so the halo_shape/halo_crown_* plumbing was dropped here on 2026-07-29. */
(function () {
  const V7 = { GRID: 35, S: 1000, enabled: false, cache: new Map() };
  const CX = 500, CY = 500, R = 220;
  let CELL = V7.S / V7.GRID;                       // 24.3902px  (recomputed in install if GRID changes)
  const idx = (c, r) => r * V7.GRID + c;
  const inb = (c, r) => c >= 0 && c < V7.GRID && r >= 0 && r < V7.GRID;

  // ── ANIMATION TAG LAYER (opt-in) ────────────────────────────────────────────────────────
  // A parallel array holding, per cell, the CSS class that cell animates under (or 0).
  // rleSVG then breaks runs on the tag as well as the colour and emits class="...".
  // EVERYTHING here is gated on V7.animate, which is FALSE by default: with the flag off
  // not one byte of output changes, so GLOBAL FINGERPRINT 1246017024 cannot move.
  // `REC` is the class currently being recorded — render() sets it around a painter and the
  // write helpers below stamp every cell that painter touches. That is how a whole layer
  // (splatter, sparks, wall, background) gets tagged without editing the painter itself.
  // OVR is the LIT layer: a brightened copy of a cell, drawn ON TOP, whose opacity animates
  // from 0. That way a moving trait ADDS light and never loses its own colour — dimming the
  // base cell instead was the thing gruff rejected (gold going grey while it shimmers).
  // It costs one extra rect per lit cell, which is the whole price of the effect.
  let TAG = null, OVR = null, REC = 0, LIT = 0, LITH = 0;   // LITH: hue-locked lift, whale crown only
  function newTags() {
    const on = !!V7.animate, n = V7.GRID * V7.GRID;
    TAG = on ? new Array(n).fill(0) : null;
    OVR = on ? new Array(n).fill(null) : null;
    REC = 0; LIT = 0; LITH = 0;
  }
  function _prgb(s) { if (!s) return [0, 0, 0]; if (s[0] === '#') return hexToRgb(s); const m = s.match(/\d+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; }
  // multiplicative lift, NOT a mix toward white: mixing washed a red cell out to near-white,
  // which is how the confetti lost its hue. Scaling the channels keeps the ratios, so the hue holds.
  // ⚠️ BOTH LIFTS ARE INTEGER-EXACT ON PURPOSE, 2026-08-04. They used to evaluate in doubles.
  // These two feed the ANIMATION OVERLAY only — never the static art — so the canonical algorithm was
  // ours to choose, and choosing the integer form means the Solidity port can mirror them BIT FOR BIT
  // instead of fighting the usual "algebraically identical but the JS ran doubles" rounding war that has
  // cost this port so many days. Measured over 7,632,672 samples (every 3rd RGB value x every lit amount
  // the engine uses): the integer forms differ from the old doubles on 0.29% / 0.11% of samples and the
  // worst channel delta is 1 of 255. Gold is unchanged to the digit (#fcb913 at lit .9 -> #f9de9b, hue 43).
  // FIX = 1e6. Every lit amount in the engine is a multiple of 0.05, so amtF*135/100, amtF*10/100 and
  // amtF*62/100 all divide exactly — there is no hidden truncation in the constant folding.
  const _LFIX = 1000000, _amtF = amt => Math.round(amt * _LFIX);
  function _lift(col, amt) {
    const c = _prgb(col), aF = _amtF(amt), mul = _LFIX + aF * 135 / 100, add = aF * 34;
    const ch = v => { const x = Math.floor((v * mul + add + _LFIX / 2) / _LFIX); return x > 255 ? 255 : x < 0 ? 0 : x; };
    return rgbToHex(ch(c[0]), ch(c[1]), ch(c[2]));
  }
  // ⚠️ HUE-LOCKED LIFT — WHALE CROWN ONLY, 2026-08-04. Do not make this the default.
  // gruff on the crown: "the yellow has run off to lemonade-lime, I want the gold-cult yellow, the bright
  // Bullion tones". The cause is that `_lift` above scales each channel ON ITS OWN and clips at 255.
  // Gold's RED is already 252, so it pins immediately while GREEN keeps climbing until it pins too — and
  // once R == G == 255 the hue is 60 degrees BY DEFINITION, whatever colour went in. Measured: #fcb913
  // (hue 43) -> #ffff49 (hue 60) at EVERY lit level; #ffd24a and #e8a80f collapse the same way.
  // Lifting in HSL holds the hue and spends the brightness on LIGHTNESS, which is what a real bullion
  // highlight does: pale warm gold, never lemon. #fcb913 at lit .9 gives #f9de9b, hue 43.
  // ⚠️ SCOPE, and it is deliberate: gruff saw this applied everywhere and rejected it for Rainbow Shades —
  // the old clipped near-white gleam is the look he locked. So the plain `_lift` stays the default for the
  // face loop, the shades gleam and every other painter, and only the whale crown opts in, through the
  // fourth argument of rec(). Both feed the OVERLAY layer only, so neither can move GLOBAL FINGERPRINT.
  // Integer HSL round trip. Two rounding sites from the double version are GONE rather than reproduced:
  //  · l and s never divide by 255 first. 2l-1 = (mx+mn-255)/255, so 1-|2l-1| = (255-|mx+mn-255|)/255 and
  //    s collapses to d / (255 - |mx+mn-255|) — one division instead of a compounding chain.
  //  · hue is kept as H6 = hue/60. hslHex only ever wants h/30, which is 2*H6, so the *60 and the /30
  //    that the double version performs (and rounds twice in) simply never happen.
  function _liftHue(col, amt) {
    const c = _prgb(col), R = c[0], G = c[1], B = c[2], aF = _amtF(amt);
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
    let lF = Math.floor((mx + mn) * _LFIX / 510);
    const den = 255 - Math.abs(mx + mn - 255);
    let sF = (d === 0 || den === 0) ? 0 : Math.floor(d * _LFIX / den);
    let H6 = 0;
    if (d !== 0) {
      if (mx === R)      H6 = Math.trunc((G - B) * _LFIX / d) % (6 * _LFIX);
      else if (mx === G) H6 = Math.trunc((B - R) * _LFIX / d) + 2 * _LFIX;
      else               H6 = Math.trunc((R - G) * _LFIX / d) + 4 * _LFIX;
      H6 = ((H6 % (6 * _LFIX)) + 6 * _LFIX) % (6 * _LFIX);
    }
    sF = Math.floor(sF * (_LFIX - Math.min(_LFIX / 2, aF * 10 / 100)) / _LFIX);          // ease saturation off
    lF = lF + Math.floor((_LFIX - lF) * Math.min(85 * _LFIX / 100, aF * 62 / 100) / _LFIX);  // spend brightness on LIGHTNESS
    const aa = Math.floor(sF * Math.min(lF, _LFIX - lF) / _LFIX);
    const f = n => {
      const kF = (((n * _LFIX + 2 * H6) % (12 * _LFIX)) + 12 * _LFIX) % (12 * _LFIX);
      let t = Math.min(kF - 3 * _LFIX, Math.min(9 * _LFIX - kF, _LFIX));
      if (t < -_LFIX) t = -_LFIX;
      const v = lF - Math.trunc(aa * t / _LFIX);
      const o = Math.floor((v * 255 + _LFIX / 2) / _LFIX);
      return o > 255 ? 255 : o < 0 ? 0 : o;
    };
    return rgbToHex(f(0), f(8), f(4));
  }
  // 2026-08-03 (gruff spotted it on a COLLECTOR target): a cell that is ALREADY near-white cannot be lit.
  // #f0f0f0 lifted is #ffffff — a 240->255 step nobody can see, so the target's four white alignment ticks and
  // its white diagonals looked dead while the red arms and gold rings moved. The grid even listed the motion.
  // Fix: when the colour has nowhere left to go UP, the moving highlight becomes a moving SHADE instead.
  // Same overlay rect that was already being emitted, just a colour that reads -> zero extra bytes.
  // ⚠️ the test is the MIN channel, not the max. Gold #fcb913 has a max of 252 but a blue of 19, so it lifts
  // beautifully (it goes pale-gold) and must keep its highlight. Only a colour whose DARKEST channel is already
  // high — #f0f0f0, white, pale grey — has nowhere to go and needs the shade instead.
  // `hue` routes to the hue-locked lift. Only the whale crown passes it (see rec's 4th argument);
  // the near-white SHADE branch below is shared, because a cell with nowhere to go up has nowhere to go
  // up in either colour space.
  function _litCol(col, amt, hue) {
    const c = _prgb(col), mn = Math.min(c[0], c[1], c[2]);
    if (mn <= 200) return hue ? _liftHue(col, amt) : _lift(col, amt);
    // INTEGER, same reason as the two lifts: this feeds the overlay only, so the canonical form is ours
    // to choose and Solidity can then transcribe it instead of chasing doubles.
    const fF = _LFIX - Math.min(550000, 320000 + _amtF(amt) * 3 / 10);
    const ch = v => Math.floor((v * fF + _LFIX / 2) / _LFIX);
    return rgbToHex(ch(c[0]), ch(c[1]), ch(c[2]));
  }
  // REC may be a plain class name, or a FUNCTION of the cell — that is how a layer gets a
  // travelling / rotating band: neighbouring cells land in different phase classes.
  //
  // ⚠️ LAST WRITER OWNS THE CELL. A painter running with no class (REC = 0) must CLEAR any
  // tag an earlier layer left there. Without this a sweep tagged on the face keeps animating
  // a cell that now shows an eye, a mouth or a trait piece — which is exactly the "the light
  // runs across my cigar / visor / bubblegum / crying eyes" problem. One rule, all of it.
  function stamp(c, r, col) {
    if (!TAG || !inb(c, r)) return;
    const i = idx(c, r);
    if (!REC) { TAG[i] = 0; OVR[i] = null; return; }
    const t = (typeof REC === 'function') ? REC(c, r) : REC;
    if (!t) { TAG[i] = 0; OVR[i] = null; return; }
    if (LIT) { OVR[i] = { c: _litCol(col, LIT, LITH), k: t }; TAG[i] = 0; }
    else { TAG[i] = t; OVR[i] = null; }
  }
  // `hue` (4th arg) opts this painter into the hue-locked lift. WHALE CROWN ONLY — see _liftHue.
  function rec(cls, fn, lit, hue) { if (!TAG) return fn(); REC = cls; LIT = lit || 0; LITH = hue ? 1 : 0;
    try { fn(); } finally { REC = 0; LIT = 0; LITH = 0; } }
  // Which halo RING is being painted right now. paintHalo sets it per ring so a tag function can give
  // ring 0 one direction and ring 1 the other (the "wheel" the user asked for: right / left / right).
  // Assigned unconditionally, read only when the tag layer is on -> zero effect with V7.animate false.
  let HRING = 0;
  // Write the LIT overlay DIRECTLY, with a colour of our own rather than a lift of the base cell.
  // The overlay layer already draws "an extra rect on top with an animated opacity"; a moving PUPIL
  // needs exactly that, except the colour is the pupil's, not a brightened copy of what is underneath.
  function ovrSet(c, r, col, cls) { if (!OVR || !inb(c, r) || !cls) return; OVR[idx(c, r)] = { c: col, k: cls }; }
  // DIAGNOSTIC ONLY — completely inert unless a harness sets V7._snap = [] before rendering. Records the
  // grid (and the tag layers) after each painter so a probe can NAME the painter that last changed a cell.
  // Every animation bug so far has been "who wrote this cell last, and did the tag survive"; inferring that
  // from the output is what cost this port days. Allocates nothing and emits nothing when _snap is unset.
  function _sn(n, g) { if (V7._snap) V7._snap.push([n, g.slice(), TAG ? TAG.slice() : null, OVR ? OVR.slice() : null]); }

  function newGrid(bg) { const n = V7.GRID * V7.GRID, a = new Array(n); a.fill(bg); return a; }
  function setCell(g, c, r, col) { if (col && inb(c, r)) { g[idx(c, r)] = col; stamp(c, r, col); } }

  // DEPTH RECESS — darken the cell that is ALREADY there, in place: the socket ring behind an eye block,
  // the shadow under a mouth, the depth behind a trait piece. The cell keeps its OWN colour, scaled down,
  // so the feature reads as inset instead of pasted on (gruff's standing rule: recess + mixed tones, never flat).
  //
  // ⚠️ IT MUST CLEAR THE TAG, and until 2026-08-04 the eight sites that do this wrote g[] DIRECTLY and never
  // told the tag layer. A face motion that had already tagged the cell therefore kept animating it with the
  // colour it had BEFORE being darkened, so at the top of every animation cycle the socket ring lit up to
  // exactly its neighbours' value and the depth VANISHED for that frame. That is precisely the "the light
  // runs across my visor" problem the LAST WRITER OWNS THE CELL rule above exists to stop — the recess was
  // simply not going through the rule. Found 2026-08-04 as the last 2 failures of anim_e2e_parity
  // (#2494 OG patina, #3325 BUILDER shipFew): the chain darkens through GR.setCell, which writes plain RGB
  // and so zeroes the tag byte, and the two sides disagreed on those cells and nowhere else.
  //
  // This is the twin of that contract writer: a plain RGB write with the tag cleared. The COLOUR is
  // byte-identical to the eight copies it replaces (same hex/rgb parse, same `|0` truncation, same string
  // form), and stamp() is inert with V7.animate false, so no static output and no fingerprint can move.
  function recess(g, c, r, f) {
    if (!inb(c, r)) return;
    const i = idx(c, r), s = '' + g[i];
    const rc = (s[0] === '#')
      ? [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
      : (m => [+m[0], +m[1], +m[2]])(s.match(/\d+/g) || [0, 0, 0]);
    g[i] = 'rgb(' + ((rc[0] * f) | 0) + ',' + ((rc[1] * f) | 0) + ',' + ((rc[2] * f) | 0) + ')';
    if (TAG) { TAG[i] = 0; OVR[i] = null; }
  }

  // ============================================================================================
  //  PORTED MATH (verbatim from portrait_v6.js)
  // ============================================================================================
  function project(x, y, z, yaw, pitch) {
    let x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
    let z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    let y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
    let z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
    return [x1, y2, z2];
  }
  function getAnchors(yawDeg, pitchDeg) {
    const yaw = yawDeg * Math.PI / 180, pitch = pitchDeg * Math.PI / 180;
    const toScr = (q) => [CX + q[0], CY - q[1], q[2]];
    const eyeLat = -0.02, eyeLon = 0.44;
    const eyeY3 = R * Math.sin(eyeLat), eyeXZ = R * Math.cos(eyeLat);
    const eyeL = toScr(project(-eyeXZ * Math.sin(eyeLon), eyeY3, eyeXZ * Math.cos(eyeLon), yaw, pitch));
    const eyeR = toScr(project(eyeXZ * Math.sin(eyeLon), eyeY3, eyeXZ * Math.cos(eyeLon), yaw, pitch));
    const nose = toScr(project(0, -R * 0.42, R * 0.95, yaw, pitch));
    const mouth = toScr(project(0, -R * 0.85, R * 0.50, yaw, pitch));
    const chin = toScr(project(0, -R * 1.08, R * 0.30, yaw, pitch));
    const hingeLat = -0.38, hingeXZ = R * Math.cos(hingeLat), hingeY3 = R * Math.sin(hingeLat);
    const hingeL = toScr(project(-hingeXZ, hingeY3, 0, yaw, pitch));
    const hingeR = toScr(project(hingeXZ, hingeY3, 0, yaw, pitch));
    const gonialL = toScr(project(-R * 0.66, -R * 0.80, R * 0.22, yaw, pitch));
    const gonialR = toScr(project(R * 0.66, -R * 0.80, R * 0.22, yaw, pitch));
    return { eyeL, eyeR, nose, mouth, chin, hingeL, hingeR, gonialL, gonialR, yaw, pitch };
  }
  function mulberry32(seed) {
    let s = (seed | 0) || 1;
    return function () { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  function hashNoise(x, y, seed) {
    const ix = Math.floor(x) | 0, iy = Math.floor(y) | 0;
    let h = (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ (seed | 0)) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) | 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // hashNoise as the INTEGER the contract computes: FacetsMath.hnF is `hu32 * 1e6 / 2^32`, floored.
  // ⚠️ Do NOT write `Math.floor(hashNoise(...) * 1e6)`. hashNoise returns u32/2^32 (exact, the divisor is a
  // power of two), but multiplying that double by 1e6 can round, so the two sides would disagree on the
  // cells that land within 1e-6 of the threshold — a handful across 10,000 tokens, i.e. exactly the kind of
  // residue this port keeps spending days on. Recovering the u32 first keeps every step exact: u32 * 1e6 is
  // under 2^53, and dividing by 2^32 is a power-of-two scale, so the floor is the true one.
  const hnF = (x, y, seed) => Math.floor(hashNoise(x, y, seed) * 4294967296 * 1000000 / 4294967296);
  function _snapCell(cx, cy, fx, fy, bs) { return Math.round(cx / bs - 0.5) === Math.round(fx / bs - 0.5) && Math.round(cy / bs - 0.5) === Math.round(fy / bs - 0.5); }

  // ---- colour helpers ----
  function hslHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return '#' + to(f(0)) + to(f(8)) + to(f(4));
  }
  function hexToRgb(hex) {
    hex = hex || '#000000';
    if (hex[0] !== '#') { const m = /hsl\(\s*([\d.]+)[ ,]+([\d.]+)%?[ ,]+([\d.]+)%?/i.exec(hex); hex = m ? hslHex(+m[1], +m[2], +m[3]) : '#000000'; }
    const h = hex.replace('#', '');
    return [parseInt(h.substring(0, 2), 16) || 0, parseInt(h.substring(2, 4), 16) || 0, parseInt(h.substring(4, 6), 16) || 0];
  }
  function rgbToHex(r, g, b) { const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); return '#' + c(r) + c(g) + c(b); }
  function blendOverBg(fgHex, bgHex, op) {
    const [fr, fg, fb] = hexToRgb(fgHex), [br, bg2, bb] = hexToRgb(bgHex);
    return rgbToHex(fr * op + br * (1 - op), fg * op + bg2 * (1 - op), fb * op + bb * (1 - op));
  }
  function shadeHex(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
    const k = 1 + amt; return rgbToHex(r * k, g * k, b * k);
  }
  function quantize5(b) { return Math.max(0.2, Math.round(b * 5) / 5); }
  const toHex = (c) => (!c ? c : (c[0] === '#' ? c : rgbToHex.apply(null, hexToRgb(c))));

  // ============================================================================================
  //  BRIGHTNESS FIELD (the crux) — verbatim port; bsM/_bbs resolve to CELL via p._bs / p.block_size
  // ============================================================================================
  function computeBrightnessField(anchors, p) {
    const jawPoly = [anchors.hingeL, anchors.gonialL, anchors.chin, anchors.gonialR, anchors.hingeR];
    const lightSign = Math.sin(anchors.yaw);
    const _eLx = lightSign * 0.9, _eLy = -0.62 + Math.sin(anchors.pitch) * 0.35, _eLm = Math.hypot(_eLx, _eLy) || 1;
    const eyeLightX = _eLx / _eLm, eyeLightY = _eLy / _eLm;
    const banditOn = (p.eye_mask === 'bandit' || p.eye_mask === 'visor') && !p.eye_piece && !p.combo_piece;   // an eye PIECE fully replaces the eyes -> no bandit/visor band on top
    const _bbs = p.block_size || 14;
    const _bMy = (anchors.eyeL[1] + anchors.eyeR[1]) / 2;
    const _bH2 = Math.max(_bbs * 2.0, 60) / 2;   // thicker bandit/visor band (~2.5 cells, was ~1 line)
    const _bX0 = Math.min(anchors.eyeL[0], anchors.eyeR[0]) - _bbs * 2.4;
    const _bX1 = Math.max(anchors.eyeL[0], anchors.eyeR[0]) + _bbs * 2.4;
    const _bRedR = Math.max(_bbs * 0.55, 9);
    const cosY = Math.cos(anchors.yaw), sinY = Math.sin(anchors.yaw), cosP = Math.cos(anchors.pitch), sinP = Math.sin(anchors.pitch);

    return function (x, y) {
      let b = 0, kind = 'fg';
      let eyeDx = 0, eyeDy = 0, eyeRR = 0, eyeSide = 0;
      let mouthT = false, mouthD = false, mouthU = 0;
      const dxS = x - CX, dyS = y - CY, rS = Math.sqrt(dxS * dxS + dyS * dyS);
      const inSkull = rS < R, inJaw = pointInPoly(x, y, jawPoly), inFace = inSkull || inJaw;
      if (!inFace) return { b: 0, kind };
      b = 0.55;
      const dEL = Math.hypot(x - anchors.eyeL[0], y - anchors.eyeL[1]);
      const dER = Math.hypot(x - anchors.eyeR[0], y - anchors.eyeR[1]);
      const eyeReach = 38 + p.eye_size_extra * 12;
      if (!p.eye_piece && !p.combo_piece) {   // suppress the face's own eyes when a NEW eye trait piece (or combo mask) replaces them
      const _closed = p.eye_style === 'closed', _calm = p.eye_calm || p.eye_x || p.eye_laser;   // CLOSED: lid line only. CALM/X/LASER: explicit blocks/cross/square. All suppress the field socket.
      if (dEL < eyeReach) { const t = 1 - dEL / eyeReach; if (!_closed && !_calm) b -= 0.85 * t; if (t > 0.15 && !_closed && !_calm) eyeRR = eyeReach; if (t > 0.45 && !_calm && !_closed) { eyeDx = x - anchors.eyeL[0]; eyeDy = y - anchors.eyeL[1]; eyeSide = -1; if (t > 0.6) kind = 'eye'; } }
      if (dER < eyeReach) { const t = 1 - dER / eyeReach; if (!_closed && !_calm) b -= 0.85 * t; if (t > 0.15 && !_closed && !_calm) eyeRR = eyeReach; if (t > 0.45 && !_calm && !_closed) { eyeDx = x - anchors.eyeR[0]; eyeDy = y - anchors.eyeR[1]; eyeSide = 1; if (t > 0.6) kind = 'eye'; } }
      }
      const mst = p.mouth_style || null;
      if (!mst) {
        const dM = Math.hypot(x - anchors.mouth[0], (y - anchors.mouth[1]) * 2.5);
        if (dM < 38) { const t = 1 - dM / 38; b -= 0.55 * t * p.mouth_intensity; }
      } else if (mst !== 'none' && !p.mouth_shape) {   // mouth_shape mouths are drawn as explicit BLOCK shapes (paintMouth); skip the faint field mouth
        const bsM = p._bs || 16;
        const mdx = x - anchors.mouth[0];
        const mw = p.mouth_w || 56;
        const u = Math.max(-1, Math.min(1, mdx / mw)); mouthU = u;
        const yEff = anchors.mouth[1] - 34 + (p.mouth_curve || 0) * (u * u - 0.5) + (p.mouth_asym || 0) * u;
        const mdy = y - yEff;
        const hThin = Math.max(11, bsM * 0.55), toothPer = Math.max(26, bsM * 1.5);
        const toothHit = w => Math.abs(((mdx % toothPer) + toothPer) % toothPer) < toothPer * w;
        const deep = ((mst === 'open' || mst === 'vomit' || mst === 'feral' || mst === 'grit' || mst === 'seal' || (p.mouth_open_band || 0) > 0) ? 0.62 : 0.45) * (p.mouth_shadow != null ? p.mouth_shadow : 1);
        const dShadow = Math.hypot(mdx / (mw * 1.25), mdy / Math.max(26, hThin * 2.3));
        if (dShadow < 1) b -= deep * (1 - dShadow);
        if (mst === 'vomit') { const sh = bsM * 2.0; if (Math.abs(mdx) < sh && Math.abs(mdy) < Math.max(hThin * 1.3, p.mouth_open || 14)) mouthD = true; }
        else if (mst === 'open') { const orad = p.mouth_open || 22; if (Math.hypot(mdx, mdy * 1.15) < Math.max(orad, hThin)) mouthD = true; }
        else if (mst === 'seal') { if (Math.abs(mdx) <= mw && Math.abs(mdy) < hThin) mouthD = true; else if (Math.abs(mdx) <= mw && toothHit(0.3) && Math.abs(mdy) < hThin * 1.9) mouthT = true; }   // ONLY open/seal/vomit reach the field mouth (all other mouths have a shape -> paintMouth). Dead grit/feral/fangs/tongue/tool/cigar/kiss/zipper/drool branches removed.
      }
      if ((p.brow_shape || 'flat') === 'flat') {   // faint FLAT brow for normal eyes; sharp/sad/skeptical -> explicit BOLD cells (paintBrows)
        const browY = (anchors.eyeL[1] + anchors.eyeR[1]) / 2 - 28;
        if (Math.abs(y - browY) < 8 && Math.abs(x - CX) < R * 0.65) b -= 0.20 * p.brow_intensity;
      }
      const ckXl = anchors.eyeL[0] - 25, ckYl = anchors.eyeL[1] + 35, ckXr = anchors.eyeR[0] + 25, ckYr = anchors.eyeR[1] + 35;
      const dCheekL = distToSegment(x, y, ckXl, ckYl, anchors.gonialL[0], anchors.gonialL[1]);
      const dCheekR = distToSegment(x, y, ckXr, ckYr, anchors.gonialR[0], anchors.gonialR[1]);
      if (dCheekL < 12) b += 0.30 * p.cheekbone_intensity * (1 - dCheekL / 12);
      if (dCheekR < 12) b += 0.30 * p.cheekbone_intensity * (1 - dCheekR / 12);
      const dChin = Math.hypot(x - anchors.chin[0], (y - anchors.chin[1] - 20));
      if (dChin < 60) b -= 0.30 * (1 - dChin / 60) * p.chin_intensity;
      const dFh = Math.hypot(x - CX, y - (CY - R * 0.6));
      if (dFh < 50) b += 0.15 * (1 - dFh / 50) * p.forehead_intensity;
      const sideN = dxS / R;
      if (lightSign * sideN > 0.4) b += 0.25 * Math.abs(sideN) * Math.abs(lightSign);
      const localX = dxS * cosY + dyS * sinY;
      const localY = (-dxS * sinY + dyS * cosY) * cosP;
      const shimN = hashNoise(localX / 6, localY / 6, p.seed);
      b += (shimN - 0.5) * (0.25 + p.shimmer * 0.20);
      if (p.aging_strength > 0) {
        const ageN = hashNoise(localX / 11, localY / 11, p.seed + 41);
        if (ageN < p.aging_strength * 0.25) { b -= hashNoise(localX, localY, p.seed + 17) * 0.35; if (hashNoise(localX, localY, p.seed + 23) < 0.5) kind = 'shadow'; }
      }
      const hlN = hashNoise(localX / 8, localY / 8, p.seed + 137);
      if (hlN < p.highlight_chance) { b += 0.30 + hashNoise(localX, localY, p.seed + 71) * 0.25; kind = 'accent'; }
      let maskBand = false, maskEye = false, scanBar = false;
      if (banditOn) {
        // Bandit/Vault red eyes = EXACTLY the one snapped cell per anchor (set in the snap loop below), never the
        // radius blob (caught 1-2 cells depending on pose -> asymmetric 1|2 eyes). User 2026-07-18: always 1+1.
        if (Math.abs(y - _bMy) <= _bH2 && x >= _bX0 && x <= _bX1) { maskBand = true; if (p.eye_mask === 'visor' && Math.abs(y - _bMy) <= _bbs * 0.65) scanBar = true; }
      }
      { const _gbs = p._bs || 16;
        for (const [ex, ey, side] of [[anchors.eyeL[0], anchors.eyeL[1], -1], [anchors.eyeR[0], anchors.eyeR[1], 1]]) {
          if (!_snapCell(x, y, ex, ey, _gbs)) continue;
          if (banditOn && p.eye_mask === 'bandit') maskEye = true;
          else if (!p.eye_piece && !p.combo_piece && kind !== 'eye' && (p.eye_fill_color || p.eye_style)) { kind = 'eye'; eyeDx = 0; eyeDy = 0; eyeRR = eyeReach; eyeSide = side; }   // no in-face eye under a piece
        }
      }
      return { b: Math.max(0, Math.min(1, b)), kind, eyeDx, eyeDy, eyeRR, eyeSide, eyeLX: eyeLightX, eyeLY: eyeLightY, maskBand, maskEye, scanBar, mouthT, mouthD, mouthU };
    };
  }

  // ---- eye / mouth cell colour (verbatim) ----
  const VOMIT_PAL = ['#fe0000', '#ff7a00', '#fcdf00', '#16d34c', '#2f9ad3', '#3b3bff', '#a020f0'];
  // VEILED faces (Ghost) fade the skin but keep features full-opacity, so a light eye fill (Glow cyan / Sleepy grey)
  // washes out next to the near-black mouth. On veiled faces only, the eye's DARK parts (expression line + pupil)
  // switch to the same normalized facet eye tone the explicit expressions use -> equally crisp. 2026-07-25 (user).
  function _eyeToneOf(p) {
    const b = hexToRgb(p.bg || '#0a0a1e'), f = hexToRgb(p.fg || '#888888');
    const d = (b[0] + b[1] + b[2]) <= (f[0] + f[1] + f[2]) ? b : f;
    const bf = Math.min(0.5, 90 / (d[0] + d[1] + d[2] || 1));
    return (gx, gy) => { const k = bf * (0.7 + (((gx * 13 + gy * 7) % 6) / 6) * 0.6); return 'rgb(' + ((d[0] * k) | 0) + ',' + ((d[1] * k) | 0) + ',' + ((d[2] * k) | 0) + ')'; };
  }
  function eyeCellColor(res, gx, gy, bs, p) {
    if (res.scanBar) return shadeHex('#eef2f8', (hashNoise(gx, gy, p.seed + 47) - 0.5) * 0.12);
    if (res.maskEye) return shadeHex(p.eye_mask_color || '#ff2a2a', (hashNoise(gx, gy, p.seed + 91) - 0.5) * 0.3);
    if (res.maskBand) return shadeHex(p.eye_mask_band || '#121212', (hashNoise(gx, gy, p.seed + 71) - 0.5) * 0.5 + Math.max(0, res.b - 0.5) * 0.3);
    if (res.kind === 'eye') {
      const er = res.eyeRR || 50, dxe = res.eyeDx, dye = res.eyeDy, style = p.eye_style;
      let fillCol = (style === 'hetero') ? (res.eyeSide > 0 ? (p.eye_fill2_color || p.eye_fill_color) : p.eye_fill_color) : p.eye_fill_color;
      if (style && style !== 'hetero') {
        const winkIris = (style === 'wink' && res.eyeSide < 0);
        if (!winkIris) {
          const nu = dxe / er / 0.4, nv = dye / er / 0.4, r = Math.hypot(nu, nv), ang = Math.atan2(nv, nu);
          const sc = p.eye_fill_color || '#eef2f8'; let on = false;
          if (style === 'wink') on = (nv > 0.02 && nv < 0.24) && Math.abs(nu) < 1.0;   // wink's shut-eye line (CLOSED itself -> simple explicit bars in paintClosedEyes)
          else if (style === 'sleepy') on = (nv > -0.06 && nv < 0.44) && Math.abs(nu) < (nv < 0.14 ? 1.0 : 0.66);   // droopy half-lid (heavy top, tapered) -> distinct sleepy squint
          // spiral: field draws ONLY the dark socket (depth, like Iris Blue); the 4 white spiral blocks are explicit (paintSpiral)
          // star/heart/dollar are now drawn as crisp block ICONS (paintEyeIcons) -> socket only here
          if (!on) return null;
          return (p.veil_opacity != null && p.veil_opacity < 1) ? _eyeToneOf(p)(gx, gy) : shadeHex(sc, (hashNoise(gx, gy, p.seed + 131) - 0.5) * 0.18);   // veiled face -> crisp facet tone (matches the mouth); other facets unchanged
        }
      }
      if (!fillCol) return null;
      const nd = Math.hypot(dxe, dye) / er;
      const fillFrac = Math.max(0.5, Math.min(1, 0.5 + (bs - 14) * 0.05));
      const irisEdge = 0.4 * fillFrac;
      if (nd > irisEdge) return null;
      if (nd > irisEdge * 0.78 && hashNoise(gx, gy, p.seed + 313) < 0.40) return null;
      if (p.eye_pupil_color && irisEdge * er >= bs * 1.4 && nd < irisEdge * 0.4) return (p.veil_opacity != null && p.veil_opacity < 1) ? _eyeToneOf(p)(gx, gy) : p.eye_pupil_color;   // veiled face -> crisp facet-tone pupil (Glow etc. no longer wash out)
      const contrast = Math.max(0.65, Math.min(1, (bs - 6) / 14));
      const ndot = Math.max(-1, Math.min(1, (dxe * res.eyeLX + dye * res.eyeLY) / er / 0.4));
      let amt = ndot * 0.52 * contrast;
      if (p.veil_opacity != null && p.veil_opacity < 1) amt -= 0.30;   // veiled face: deepen the iris so a light fill (Glow cyan) reads as solid against the pale skin instead of washing out. Hue kept.
      return (amt > 0.02 || amt < -0.02) ? shadeHex(fillCol, amt) : fillCol;
    }
    return undefined;
  }
  function mouthDarkBase(p) {   // UNIFIED 2026-07-24 (user): facet SIGNATURE dark (saturated bg/fg tone) — same tone paintMouth solid()/dark() + FDARK pieces use, so the "lip / mouth-line" reads identical across ALL mouths (field seal/open no longer pitch-black; harmonises per facet).
    const bg = hexToRgb(p.bg || '#0a0a1e'), fg = hexToRgb(p.fg || '#888888');
    const sat = c => { const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx ? (mx - mn) / mx : 0; };
    const idc = sat(bg) > sat(fg) + 0.08 ? bg : fg;   // the facet's saturated signature colour (Collector navy / Builder red / Whale gold / Newbie green ...)
    const mx = Math.max(idc[0], idc[1], idc[2]), warm = mx ? Math.max(0, (mx - idc[2]) / mx) : 0;
    const baseF = Math.min(0.5, (90 - warm * warm * 58) / (idc[0] + idc[1] + idc[2] || 1));   // warm signatures darken toward black so they don't wash out; cool (navy) stays ~90 brt
    return rgbToHex(idc[0] * baseF, idc[1] * baseF, idc[2] * baseF);
  }
  function mouthCellColor(res, gx, gy, bs, p) {
    const mu = res.mouthU || 0;
    const horiz = 0.5 - Math.min(1, Math.abs(mu - (res.eyeLX || 0) * 0.45));
    if (res.mouthT) return shadeHex(p.mouth_teeth_color || '#e8eef7', horiz * 0.5 + (hashNoise(gx, gy, p.seed + 53) - 0.5) * 0.1);   // vomit-field-colour + mouthTip + mouthR branches removed (res.vomit was never set; mouthTip/mouthR only came from now-deleted field branches)
    if (res.mouthD) { const teethMouth = p.mouth_style === 'grit' || p.mouth_style === 'seal' || (p.mouth_open_band || 0) > 0; const lift = teethMouth ? 0.1 : 0; const varAmt = teethMouth ? 0.42 : 0.22; return shadeHex(mouthDarkBase(p), lift + horiz * 0.26 + (hashNoise(gx, gy, p.seed + 29) - 0.5) * varAmt); }
    return undefined;
  }

  // ---- OG/Degen crack path (contiguous cell walk; thin structure authored, not sampled) ----
  function crackPath(rng, bs) {
    const a0 = rng() * Math.PI * 2;
    let gx = Math.round((CX + Math.cos(a0) * (R - 6)) / bs), gy = Math.round((CY + Math.sin(a0) * (R - 6)) / bs);
    const tgx = Math.round((CX - Math.cos(a0) * (R - 6)) / bs), tgy = Math.round((CY - Math.sin(a0) * (R - 6)) / bs);
    const out = []; let guard = 0;
    while ((gx !== tgx || gy !== tgy) && guard++ < 90) {
      if (Math.hypot(gx * bs + bs / 2 - CX, gy * bs + bs / 2 - CY) <= R - 2) out.push([gx * bs, gy * bs]);
      const dx = tgx - gx, dy = tgy - gy;
      if (Math.abs(dx) > Math.abs(dy)) { gx += Math.sign(dx); if (rng() < 0.45) gy += (rng() < 0.5 ? 1 : -1); }
      else { gy += Math.sign(dy); if (rng() < 0.45) gx += (rng() < 0.5 ? 1 : -1); }
    }
    return out;
  }

  // ============================================================================================
  //  NATIVE GRID rasterizer (model px -> screen cells; handles the DEGEN roll group)
  // ============================================================================================
  function rot(px, py, rad) { if (!rad) return [px, py]; const dx = px - CX, dy = py - CY, c = Math.cos(rad), s = Math.sin(rad); return [CX + dx * c - dy * s, CY + dx * s + dy * c]; }
  const invRoll = (px, py, rad) => rot(px, py, -rad);   // screen -> model
  const fwdRoll = (px, py, rad) => rot(px, py, rad);    // model  -> screen
  function writeCell(g, c, r, col, op) {
    if (!col || !inb(c, r)) return;
    if (op == null || op >= 1) g[idx(c, r)] = col;
    else g[idx(c, r)] = blendOverBg(col, g[idx(c, r)], op);
    stamp(c, r, g[idx(c, r)]);
  }
  // rasterize a model-space rect into the grid: a 41-cell is "on" if its (inverse-rolled) centre lies in the rect
  function rasterRect(g, x, y, w, h, col, rad, op) {
    if (!col || w <= 0 || h <= 0) return;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const c of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) { const s = fwdRoll(c[0], c[1], rad); if (s[0] < minx) minx = s[0]; if (s[0] > maxx) maxx = s[0]; if (s[1] < miny) miny = s[1]; if (s[1] > maxy) maxy = s[1]; }
    const c0 = Math.max(0, Math.floor(minx / CELL)), c1 = Math.min(V7.GRID - 1, Math.floor(maxx / CELL));
    const r0 = Math.max(0, Math.floor(miny / CELL)), r1 = Math.min(V7.GRID - 1, Math.floor(maxy / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const m = invRoll((c + 0.5) * CELL, (r + 0.5) * CELL, rad);
      if (m[0] >= x && m[0] < x + w && m[1] >= y && m[1] < y + h) writeCell(g, c, r, col, op);
    }
  }

  // ============================================================================================
  //  FACE — standard renderer (port of renderFaceTiles cellFill + accent/crack/splat maps)
  // ============================================================================================
  function buildFaceMaps(field, p, bs) {
    const cols = Math.ceil(1000 / bs), rows = Math.ceil(1000 / bs);
    let accentMap = null, crackMap = null, splatMap = null;
    const _artSpec = p.art_blocks || p.accent_blocks;   // FROZEN token-seeded art (Builder's "works"); accent_blocks kept as a legacy alias
    const _hasAcc = _artSpec && _artSpec.count > 0 && (_artSpec.colors || _artSpec.color);
    const _hasOwn = p.owner_blocks && p.owner_blocks.count > 0 && p.owner_blocks.colors;
    if (_hasAcc || _hasOwn) {
      const filled = [];
      for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) { const ccx = gx * bs + bs / 2, ccy = gy * bs + bs / 2; if (Math.hypot(ccx - CX, ccy - CY) < R * 0.9) filled.push(gx * 10000 + gy); }
      if (filled.length) {
        const fset = new Set(filled); accentMap = new Map();
        const place = (spec, seedOff) => {
          const rng = mulberry32((p.seed | 0) + (spec.seed != null ? spec.seed : seedOff)); const pal = spec.colors || [spec.color];
          let placed = 0, guard = 0; const want = spec.count, runMax = spec.run || 1;
          while (placed < want && guard < want * 50) {
            guard++; const k = filled[Math.floor(rng() * filled.length)]; if (accentMap.has(k)) continue;
            const col = pal[Math.floor(rng() * pal.length)]; accentMap.set(k, col);
            const gx0 = Math.floor(k / 10000), gy0 = k % 10000; let ext = 1;
            if (runMax > 1) ext = 1 + Math.floor(rng() * runMax); else if (rng() < 0.18) ext = 2;
            for (let e = 1; e < ext; e++) { const k2 = (gx0 + e) * 10000 + gy0; if (fset.has(k2) && !accentMap.has(k2)) accentMap.set(k2, col); else break; }
            placed++;
          }
        };
        if (_hasAcc) place(_artSpec, 7919);
        if (_hasOwn) place(p.owner_blocks, 3313);
      }
    }
    if (p.cracks && p.cracks.count > 0) {
      crackMap = new Map(); const crng = mulberry32((p.seed | 0) + 5557); const gf = p.cracks.goldFrac || 0;
      for (let k = 0; k < p.cracks.count; k++) for (const [x, y] of crackPath(crng, bs)) crackMap.set((x / bs) * 10000 + (y / bs), crng() < gf);
    }
    if (p.face_splat) {
      splatMap = new Map(); const srng = mulberry32((p.seed | 0) + 71);
      const gN = p.face_splat.green || 0, goN = p.face_splat.gold || 0, rN = p.face_splat.red || 0, want = gN + goN + rN;
      let placed = 0, tries = 0;
      while (placed < want && tries < want * 80 + 200) {
        tries++; const a = srng() * Math.PI * 2, d = srng() * R * 0.96;
        const gx = Math.round((CX + Math.cos(a) * d) / bs), gy = Math.round((CY + Math.sin(a) * d) / bs), key = gx * 10000 + gy;
        if (splatMap.has(key)) continue;
        const rr = field(gx * bs + bs / 2, gy * bs + bs / 2);
        if (rr.b < 0.15 || rr.kind === 'shadow') continue;
        splatMap.set(key, placed < gN ? 'g' : (placed < gN + goN ? 'o' : 'r')); placed++;
      }
    }
    return { accentMap, crackMap, splatMap };
  }
  // ---- FORGE-only face colour helpers (patterns + gradients). Never invoked for base tokens (they set no face_recolor/face_ramp) so base render + golden are byte-identical. Gas-neutral: same cell count, only the colour function differs. ----
  function _forgePatIdx(pat, gx, gy, n, seed) {
    const N = V7.GRID, cx = (N - 1) / 2, cy = (N - 1) / 2, dx = gx - cx, dy = gy - cy, dist = Math.sqrt(dx * dx + dy * dy);
    const md = v => ((v % n) + n) % n;
    const rj = o => hashNoise(0, gy, seed + o) - 0.5;    // per-row jitter -> relaxed, non-razor edges
    const cj = o => hashNoise(gx, gy, seed + o) - 0.5;   // per-cell jitter -> interlocking bleed
    let i;
    switch (pat) {
      case 'stripes': i = Math.floor((gx + rj(11) * 3.2) / (N / n)); break;
      case 'rings': i = Math.floor((dist + cj(13) * 1.7) / 2.6); break;
      case 'halves': { i = gx < cx + rj(15) * 4.5 ? 0 : 1; if (cj(16) + 0.5 < 0.15) i = 1 - i; break; }
      case 'quadrants': { const bx = cx + rj(17) * 4.5, by = cy + (hashNoise(gx, 0, seed + 18) - 0.5) * 4.5; i = (gx < bx ? 0 : 1) + (gy < by ? 0 : 2); if (cj(19) + 0.5 < 0.13) i += 1; break; }
      case 'spiral': { const ang = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI); i = Math.floor(ang * n + dist * 0.35 + cj(21) * 0.9); break; }
      case 'splatter': i = Math.floor(hashNoise((gx / 3) | 0, (gy / 3) | 0, seed + 91) * n); break;
      case 'clusters': i = Math.floor(hashNoise((gx / 5) | 0, (gy / 5) | 0, seed + 91) * n); break;
      case 'checker': i = Math.floor((gx + rj(31) * 1.4) / 1.7) + Math.floor((gy + cj(32) * 1.4) / 1.7); break;   // diagonal checker cycle
      case 'diagstripes': i = Math.floor((gx + gy + rj(33) * 3.2) / (N / n)); break;   // 45deg stripes
      case 'zigzag': { const zz = Math.abs(((gy * 0.9) % 8) - 4); i = Math.floor((gx + zz * 2.2 + cj(34) * 1.4) / (N / n)); break; }   // triangle-wave stripes
      case 'waves': i = Math.floor((gx + Math.sin(gy * 0.55) * 4.2 + cj(35) * 1.4) / (N / n)); break;   // sinusoidal bands
      case 'cross': { const ax = Math.abs(dx), ay = Math.abs(dy); i = Math.floor(Math.min(ax, ay) / 2.2 + cj(36) * 1.1); break; }   // plus/cross from center
      case 'diamond': i = Math.floor((Math.abs(dx) + Math.abs(dy) + cj(37) * 1.7) / 2.6); break;   // manhattan concentric rings
      case 'swirl': { const ang = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI); i = Math.floor(ang * n * 2 + dist * 0.5 + cj(38) * 0.9); break; }   // multi-arm spiral
      case 'shards': { const wx = gx + (hashNoise((gx / 2) | 0, (gy / 2) | 0, seed + 41) - 0.5) * 6, wy = gy + (hashNoise((gx / 2) | 0, (gy / 2) | 0, seed + 42) - 0.5) * 6; i = Math.floor(hashNoise((wx / 4) | 0, (wy / 4) | 0, seed + 43) * n); break; }   // warped angular shards
      case 'blocks': i = Math.floor(hashNoise((gx / 4) | 0, (gy / 2) | 0, seed + 51) * n); break;   // broken rectangular blocks
      case 'static': i = Math.floor((hashNoise(gx, gy, seed + 77) + hashNoise(gy, gx, seed + 78)) * 0.5 * n); break;   // max-chaos per-cell noise
      default: i = Math.floor(hashNoise(gx, gy, seed + 91) * n); break;   // scatter
    }
    return md(i);
  }
  function _forgeRampT(mode, gx, gy, qb) {
    const N = V7.GRID, cx = (N - 1) / 2, cy = (N - 1) / 2, D = N * 0.5;
    switch (mode) {
      case 'lr': return gx / (N - 1);
      case 'rl': return 1 - gx / (N - 1);
      case 'tb': return gy / (N - 1);
      case 'bt': return 1 - gy / (N - 1);
      case 'in': return 1 - Math.min(1, Math.sqrt((gx - cx) * (gx - cx) + (gy - cy) * (gy - cy)) / D);
      case 'out': return Math.min(1, Math.sqrt((gx - cx) * (gx - cx) + (gy - cy) * (gy - cy)) / D);
      case 'spiral': { const a = (Math.atan2(gy - cy, gx - cx) + Math.PI) / (2 * Math.PI), d = Math.min(1, Math.sqrt((gx - cx) * (gx - cx) + (gy - cy) * (gy - cy)) / D); return (a + d) % 1; }
      case 'diag': return (gx + gy) / (2 * (N - 1));                          // top-left -> bottom-right
      case 'diag2': return (gx + (N - 1 - gy)) / (2 * (N - 1));               // top-right -> bottom-left
      case 'conic': return (Math.atan2(gy - cy, gx - cx) + Math.PI) / (2 * Math.PI);   // angular / conic sweep
      case 'wave': return 0.5 + 0.5 * Math.sin((gx + gy) * 0.45);            // oscillating ramp
      case 'bands': return ((gx / (N - 1)) * 3) % 1;                          // repeating sawtooth (multi-sweep)
      case 'vee': return Math.min(1, Math.abs(gx - cx) / D);                  // V from center column
      default: return qb;   // 'bright' + fallback: by brightness
    }
  }
  function faceCellColor(res, gx, gy, p, bs, crackMap, splatMap) {
    const ec = eyeCellColor(res, gx, gy, bs, p); if (ec !== undefined) return ec;
    const mc = mouthCellColor(res, gx, gy, bs, p); if (mc !== undefined) return mc;
    if (p.face_disperse != null && hashNoise(gx, gy, p.seed + 4242) > p.face_disperse) return null;
    if (crackMap) { const ck = crackMap.get(gx * 10000 + gy); if (ck !== undefined) return ck ? shadeHex('#ffd24a', (res.b - 0.42) * 0.85) : (p.crack_color ? shadeHex(p.crack_color, (res.b - 0.45) * 0.5) : shadeHex('#0a0a0a', Math.max(0, res.b - 0.55) * 0.5)); }
    if (splatMap) { const sc = splatMap.get(gx * 10000 + gy); if (sc !== undefined) { const _bc = sc === 'g' ? '#39ff14' : (sc === 'o' ? '#fcb913' : '#fe0000'); return shadeHex(_bc, (res.b - 0.5) * 0.55); } }
    if (res.b < 0.15) return null;
    let baseColor;
    if (res.kind === 'shadow') return null;
    else if (res.kind === 'accent') baseColor = p.accent_color;
    else baseColor = p.fg;
    const qb = quantize5(res.b), bandIdx = Math.max(0, Math.min(4, Math.round((qb - 0.2) * 5)));
    if (p.face_recolor && p.face_recolor.palette && p.face_recolor.palette.length && res.kind !== 'accent') {   // FORGE: patterned recolor + brightness depth
      const _pr = p.face_recolor, _sd = (p.seed | 0), _np = _pr.palette.length, _ch = _pr.chaos;
      if (_ch) {   // FORGE chaos: bg-leak holes / palette swaps / rare sparks. Forge-only (base never sets .chaos) -> byte-identical.
        if (_ch.bgLeak && hashNoise(gx, gy, _sd + 313) < _ch.bgLeak) return (p.face_bg || p.bg || '#0a0a0a');
        if (_ch.spark && hashNoise(gx, gy, _sd + 315) > 1 - _ch.spark) return hashNoise(gx, gy, _sd + 316) < 0.5 ? '#f4f4f4' : '#0a0a0a';
      }
      let _pi = _forgePatIdx(_pr.pattern, gx, gy, _np, _sd);
      if (_ch && _ch.swap && hashNoise(gx, gy, _sd + 314) < _ch.swap) _pi = Math.floor(hashNoise(gx, gy, _sd + 317) * _np) % _np;   // random palette jump -> glitch misfire
      if (_ch && _ch.shift) { const _rs = Math.floor(hashNoise(0, (gy / 3) | 0, _sd + 318) * _np); _pi = (_pi + _rs) % _np; }        // GLITCH shift: per-row-band index offset -> torn horizontal bands
      let _oc = shadeHex(_pr.palette[_pi], (qb - 0.5) * 0.5);
      if (_ch && _ch.scan && gy % 3 === 0) _oc = shadeHex(_oc, -0.4);                                                                // SCANLINE: dim every 3rd row (CRT dokusu)
      return _oc;
    }
    if (p.face_ramp && p.face_ramp.palette && p.face_ramp.palette.length && res.kind !== 'accent') {   // FORGE: directional gradient + soft form shading
      const _fr = p.face_ramp, _sd = (p.seed | 0), _ch = _fr.chaos;
      if (_ch) {   // FORGE chaos (see above)
        if (_ch.bgLeak && hashNoise(gx, gy, _sd + 313) < _ch.bgLeak) return (p.face_bg || p.bg || '#0a0a0a');
        if (_ch.spark && hashNoise(gx, gy, _sd + 315) > 1 - _ch.spark) return hashNoise(gx, gy, _sd + 316) < 0.5 ? '#f4f4f4' : '#0a0a0a';
      }
      const _fr_t = _forgeRampT(_fr.mode, gx, gy, qb);
      let _gi = Math.max(0, Math.min(_fr.palette.length - 1, Math.round(_fr_t * (_fr.palette.length - 1))));
      if (_ch && _ch.swap && hashNoise(gx, gy, _sd + 314) < _ch.swap) _gi = Math.floor(hashNoise(gx, gy, _sd + 317) * _fr.palette.length) % _fr.palette.length;
      if (_ch && _ch.shift) { const _rs = Math.floor(hashNoise(0, (gy / 3) | 0, _sd + 318) * _fr.palette.length); _gi = (_gi + _rs) % _fr.palette.length; }   // GLITCH shift: torn horizontal bands
      let _oc = shadeHex(_fr.palette[_gi], (qb - 0.5) * 0.35);
      if (_ch && _ch.scan && gy % 3 === 0) _oc = shadeHex(_oc, -0.4);   // SCANLINE (CRT)
      return _oc;
    }
    if (p.face_palette && p.face_palette.length === 5 && res.kind !== 'accent') return p.face_palette[bandIdx];
    if (p.gild_min != null && res.kind !== 'accent' && res.b >= p.gild_min) {
      const GILD = ['#b9780e', '#d9971e', '#fcb913', '#ffd24a', '#ffe680', '#fff4cc', '#fffbe6'];   // deep gold -> bright highlight
      const gt = (res.b - p.gild_min) / Math.max(0.01, 1 - p.gild_min);
      const boosted = (p.gild_level >= 2) ? Math.pow(gt, 0.6) : gt * 0.5;   // Mid = gamma-lifted (bright + shiny highlights); Low = half range (dim, deep golds only)
      let gi = Math.round(boosted * (GILD.length - 1));
      const sh = hashNoise(gx, gy, p.seed + 311); if (sh > 0.8) gi++; else if (sh < 0.2) gi--;   // shimmer speckle
      return GILD[Math.max(0, Math.min(GILD.length - 1, gi))];
    }
    return blendOverBg(baseColor, p.face_bg || p.bg, qb);
  }
  function paintFaceStandard(g, p, anchors, bs, rad, veil) {
    const field = computeBrightnessField(anchors, p);
    const { accentMap, crackMap, splatMap } = buildFaceMaps(field, p, bs);
    for (let sr = 0; sr < V7.GRID; sr++) for (let sc = 0; sc < V7.GRID; sc++) {
      const m = invRoll((sc + 0.5) * CELL, (sr + 0.5) * CELL, rad);
      const res = field(m[0], m[1]);
      const gx = Math.floor(m[0] / bs), gy = Math.floor(m[1] / bs);
      let f = faceCellColor(res, gx, gy, p, bs, crackMap, splatMap);
      let _acc = false;
      if (f !== null && accentMap && accentMap.has(gx * 10000 + gy) && res.kind !== 'eye' && !res.maskEye && !res.maskBand && !res.mouthD && !res.mouthT) { f = accentMap.get(gx * 10000 + gy); _acc = true; }
      if (f !== null) { const _feat = (res.kind === 'eye' || res.eyeRR || res.maskEye || res.maskBand || res.mouthD || res.mouthT); if (veil < 1 && !_feat) f = blendOverBg(f, p.bg, veil); g[idx(sc, sr)] = f;   // GHOST: fade the face but keep the whole eye region + mouth FULL opacity (they pierce through the veil)
        // ANIMATION TAGS — inside the face the layer is not a painter but a per-cell KIND,
        // so tag here where that kind is still known. Inert unless V7.animate is on.
        if (TAG) {
          // Inside the face a layer is not a painter but a cell KIND, so it is tagged here
          // where accentMap / crackMap / splatMap / the veil branch are still in scope.
          // `put` routes to the LIT overlay when that motion adds light instead of dimming.
          const k = p._animKinds, I = idx(sc, sr);
          // ⚠️ _litCol, NOT the raw lifts. This called _lift / _liftHue directly until 2026-08-04, which
          // meant the face loop was the ONE painter that skipped the NEAR-WHITE SHADE branch — the rule
          // gruff asked for after the COLLECTOR target's white ticks "looked dead": a cell whose darkest
          // channel is already over 200 has nowhere to go UP, so it gets a moving SHADE instead of a
          // moving highlight. stamp() has used _litCol for every whole painter all along; only here did a
          // near-white face cell still flash to #ffffff (a 223 -> 255 step nobody can see). The contract
          // applies the branch everywhere, so this was also the last colour-level disagreement in
          // anim_e2e_parity on OG patina (#2726, #8710) and the WHALE gild wave (#9442).
          const put = (cls, lit, hue) => { if (!cls) return; const t = (typeof cls === 'function') ? cls(sc, sr) : cls;
            if (!t) return; if (lit) OVR[I] = { c: _litCol(f, lit, hue), k: t }; else TAG[I] = t; };
          if (k) {
            if (k.hiliteFn && res.kind === 'accent') put(k.hiliteFn, k.hiliteLit);              // OG patina = the field HIGHLIGHT cells (owner blocks that land here inherit the motion — deliberate, gruff confirmed 2026-08-03)
            else if (_acc && k.accentFn) put(k.accentFn, k.accentLit);                                 // OG patina · BUILDER works
            else if (k.veil && veil < 1 && !_feat) put(k.veil, 0);                                // GHOST veil (fading IS the trait)
            else if (k.crackFn && crackMap && crackMap.has(gx * 10000 + gy)) put(k.crackFn, k.crackLit);   // OG cracks · Degen Rekt
            else if (k.splatFn && splatMap && splatMap.has(gx * 10000 + gy)) put(k.splatFn, 0);   // Degen on-face PnL flood
          }
          // WHALE gild: the gold face cells are the ones the gild ramp lifted, not an accent.
          // HUE-LOCKED (3rd arg), 2026-08-04: this is the "gold wave", and it is gold, so it hit exactly the
          // lemon collapse the crown did — #8535 (the token gruff pointed at) still carried 4 lemon fills
          // after the crown was fixed, and every one of them came from here, not from the crown.
          // Scope is still WHALE-only gold: nothing else on the face path opts in, so the Rainbow Shades
          // gleam and every other lit motion keep the original lift gruff asked to preserve.
          if (!TAG[I] && !OVR[I] && p._animFaceFn && p.gild_level > 0 && res.kind !== 'eye' && !_feat)
            put(p._animFaceFn, p._animFaceLit, 1);
        }
      }
    }
  }

  // ---- NEWBIE contour renderer (port of renderContourTiles; roll = 0) ----
  function paintContour(g, p, anchors, bs) {
    const cols = V7.GRID, rows = V7.GRID;
    const field = computeBrightnessField(anchors, p);
    const pal = (p.face_palette && p.face_palette.length === 5) ? p.face_palette : null;
    const lv = [], rg = [];
    for (let gy = 0; gy < rows; gy++) {
      lv[gy] = []; rg[gy] = [];
      for (let gx = 0; gx < cols; gx++) {
        const res = field(gx * bs + bs / 2, gy * bs + bs / 2); rg[gy][gx] = res;
        let v;
        if (res.kind === 'eye') v = 90;
        else if (res.b < 0.15 || res.kind === 'shadow') v = -1;
        else v = Math.max(0, Math.min(4, Math.round((quantize5(res.b) - 0.2) * 5)));
        lv[gy][gx] = v;
      }
    }
    const solidBands = p.contour_solid_bands || 0;
    let accentMap = null;
    const _hasOwn = p.owner_blocks && p.owner_blocks.count > 0 && p.owner_blocks.colors;
    const _artSpec = p.art_blocks || p.accent_blocks;   // FROZEN token-seeded art (Builder's "works"); accent_blocks kept as a legacy alias
    const _hasAcc = _artSpec && _artSpec.count > 0 && (_artSpec.colors || _artSpec.color);
    if (_hasOwn || _hasAcc) {
      const filled = [];
      for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) { const ccx = gx * bs + bs / 2, ccy = gy * bs + bs / 2; if (Math.hypot(ccx - CX, ccy - CY) < R * 0.9) filled.push(gx * 10000 + gy); }
      if (filled.length) {
        const fset = new Set(filled); accentMap = new Map();
        const place = (spec, seedOff) => {
          const rng = mulberry32((p.seed | 0) + seedOff); const pl = spec.colors || [spec.color];
          let placed = 0, guard = 0; const want = spec.count, runMax = spec.run || 1;
          while (placed < want && guard < want * 50) {
            guard++; const k = filled[Math.floor(rng() * filled.length)]; if (accentMap.has(k)) continue;
            const col = pl[Math.floor(rng() * pl.length)]; accentMap.set(k, col);
            const gx0 = Math.floor(k / 10000), gy0 = k % 10000; let ext = 1;
            if (runMax > 1) ext = 1 + Math.floor(rng() * runMax); else if (rng() < 0.18) ext = 2;
            for (let e = 1; e < ext; e++) { const k2 = (gx0 + e) * 10000 + gy0; if (fset.has(k2) && !accentMap.has(k2)) accentMap.set(k2, col); else break; }
            placed++;
          }
        };
        if (_hasAcc) place(_artSpec, 7919);
        if (_hasOwn) place(p.owner_blocks, 3313);
      }
    }
    // FEATURE PROTECTION (2026-07-19 user): keep the eye/brow + mouth region SOLID so features never float over
    // dissolved (Newbie Scattered/Forming) cells. bs = CELL here; anchors are px.
    const _elc = Math.round(anchors.eyeL[0] / bs), _elr = Math.round(anchors.eyeL[1] / bs);
    const _erc = Math.round(anchors.eyeR[0] / bs), _err = Math.round(anchors.eyeR[1] / bs);
    const _mxc = Math.floor(anchors.mouth[0] / bs), _myr = Math.round((anchors.mouth[1] - 34) / bs);
    const _prot = (gx, gy) => (Math.abs(gx - _elc) <= 2 && gy >= _elr - 3 && gy <= _elr + 2)
      || (Math.abs(gx - _erc) <= 2 && gy >= _err - 3 && gy <= _err + 2)
      || (Math.abs(gx - _mxc) <= 3 && gy >= _myr - 1 + Math.min(0, _MSHIFT[p.mouth_shape] || 0) && gy <= _myr + 3);   // 2026-08-03: the top edge follows the baseline lift, so a raised mouth keeps solid face behind it on dissolved (Ghost/Newbie) faces. Bottom edge unchanged -> this only ADDS backing, never removes it.
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      const res = rg[gy][gx];
      const ec = eyeCellColor(res, gx, gy, bs, p); let f;
      if (ec !== undefined) f = ec;
      else { const mcc = mouthCellColor(res, gx, gy, bs, p); if (mcc !== undefined) f = mcc; else {
        if (p.face_disperse != null && !_prot(gx, gy) && hashNoise(gx, gy, p.seed + 4242) > p.face_disperse) f = null;
        else { const v = lv[gy][gx];
          if (v < 0) f = null;
          else if (accentMap && accentMap.get(gx * 10000 + gy) !== undefined) f = accentMap.get(gx * 10000 + gy);
          else { const col = pal ? pal[v] : p.fg;
            if (v < solidBands) f = col;
            else { const left = gx > 0 ? lv[gy][gx - 1] : -1, top = gy > 0 ? lv[gy - 1][gx] : -1; f = (left === v && top === v) ? null : col; }
          }
        }
      } }
      if (f != null && f !== undefined) g[idx(gx, gy)] = f;
    }
  }

  // ============================================================================================
  //  HALO (port of haloRingTiles)
  // ============================================================================================
  const RAINBOW = ['#fe0000', '#ff5500', '#ff8a00', '#fcb913', '#9dd812', '#16d34c', '#01b4ff', '#0101ef', '#5e00d4', '#ff00a0'];
  function paintHalo(g, p, bs, rad) {
    if ((p.halo_rings || 0) < 1) return;
    let palette;
    if (p.halo_palette && p.halo_palette.length) palette = p.halo_palette;
    else if (p.halo_rainbow) palette = RAINBOW;
    else palette = [p.accent_color || p.fg];
    const haloOp = (p.halo_opacity != null) ? p.halo_opacity : 1.0;
    const np = palette.length, rings = p.halo_rings, hbs = bs, rotc = p.halo_rot || 0;
    const _hbud = (p.halo_budget != null ? p.halo_budget : 228);
    let ringSpacing = rings > 1 ? _hbud / (rings - 1) : hbs; ringSpacing = Math.max(hbs, Math.min(ringSpacing, 1.3 * hbs));
    const opMode = p.halo_op_mode || 'falloff', colMode = p.halo_col_mode || 'rings', hseed = (p.seed | 0) + 7331;
    const forge = !!p.halo_forge;   // FORGE-only: brighter halo (never dim) + extra transition modes. Base tokens leave this false -> paintHalo byte-identical.
    // ── GHOST HALO CLEARANCE (2026-08-12, gruff approved) ─────────────────────────────────────────
    // paintGhostOutline paints the 1-cell band immediately outside the silhouette and it paints AFTER
    // this function (:2116 vs :2106), so it overwrote whatever the halo put there. Ring 0 sits at R+20
    // and a cell is 1000/35 = 28.57, so ring 0 was ALWAYS inside that band: at 1 ring the halo vanished
    // entirely, at 2+ the inner ring did. 281 of 6,969 tokens.
    // ⇒ push the whole halo out by one cell, spacing untouched. gruff picked this over compressing the
    //   rings, and he was right that it is the only version that keeps the halo's rhythm.
    // ⚠️ CLAMPED, because a halo cell whose column snaps past the edge is DROPPED IN SILENCE below.
    //    An unclamped push cost a 7-ring ghost 6 cells of its outer ring — measured, not predicted.
    //    The limit must sit STRICTLY below (GRID - 0.5)*hbs - CX: a centre landing exactly there still
    //    rounds up to GRID and is dropped, which cost 2 more cells on the first attempt at this fix.
    //    At 1-6 rings the clamp never binds, so those tokens get the full push and are byte-identical
    //    to the unclamped version; only 15 seven-ring ghosts are pushed slightly less.
    let _clr = p.halo_clear_contour ? hbs : 0;
    if (_clr > 0) {
      const _out0 = R + 20 + (rings - 1) * ringSpacing;
      _clr = Math.max(0, Math.min(_clr, ((V7.GRID - 0.51) * hbs - CX) - _out0));
    }
    const _haloR0 = R + 20 + _clr;
    const outR = _haloR0 + (rings - 1) * ringSpacing;
    const ringOp = [];
    if (opMode === 'pulse') { const lvv = forge ? [1.0, 0.74, 0.56] : [0.92, 0.55, 0.27]; const off = Math.floor(hashNoise(3, 0, hseed) * 3), dir = hashNoise(4, 0, hseed) < 0.5 ? 1 : -1; for (let i = 0; i < rings; i++) ringOp[i] = lvv[(((i * dir + off) % 3) + 3) % 3]; }
    else if (opMode === 'random') { for (let i = 0; i < rings; i++) ringOp[i] = (forge ? 0.6 : 0.28) + hashNoise(i, 0, hseed) * (forge ? 0.4 : 0.62); }
    for (let i = 0; i < rings; i++) {
      HRING = i;                              // the tag function reads this to alternate the spin direction per ring
      const ringR = _haloR0 + i * ringSpacing;   // _haloR0 = R+20, plus the ghost contour clearance (see above)
      const tiles = Math.floor(2 * Math.PI * ringR / hbs * 0.6);
      for (let t = 0; t < tiles; t++) {
        const a = (t / tiles) * 2 * Math.PI;
        const x = Math.round((CX + Math.cos(a) * ringR) / hbs) * hbs, y = Math.round((CY + Math.sin(a) * ringR) / hbs) * hbs;
        if (x < 0 || x >= 1000 || y < 0 || y >= 1000) continue;
        const dx = x - CX, dy = y - CY; let ci;
        switch (colMode) {
          case 'lr': ci = Math.floor((x / 1000) * np); break;
          case 'diag': ci = Math.floor(((x + y) / 2000) * np); break;
          case 'c': ci = Math.floor(((Math.atan2(dy, dx) / (2 * Math.PI)) + 0.5) * np); break;
          case 'x': ci = ((Math.abs(dx) > Math.abs(dy)) ? 0 : 1) * 2 + (((dx > 0) === (dy > 0)) ? 0 : 1); break;
          case 'random': ci = Math.floor(hashNoise(x, y, hseed) * np); break;
          case 'spiral': ci = Math.floor((((Math.atan2(dy, dx) / (2 * Math.PI)) + 0.5) + i * 0.6) * np); break;   // FORGE: spiral colour flow (angle + ring offset)
          default: ci = i + rotc;
        }
        const col = palette[(((ci % np) + np) % np)];
        let op;
        if (forge) {   // FORGE opacity patterns (2026-07-28 gruff): DISTINCT high-contrast — radial / spiral / blink / pulse / random. Removed the soft falloff+up fades (they washed out / dimmed rare pieces).
          const _i01 = rings > 1 ? i / (rings - 1) : 0;                                                                          // 0 = inner ring, 1 = outer ring
          if (opMode === 'radialIn') op = 1.0 - _i01 * 0.62;                                                                     // ic parlak -> dis sonuk (icten disa azalan)
          else if (opMode === 'radialOut') op = 0.38 + _i01 * 0.62;                                                              // ic sonuk -> dis parlak (icten disa artan)
          else if (opMode === 'spiralIn') { const _s = (((a / (2 * Math.PI)) + i * 0.5) % 1 + 1) % 1; op = 1.0 - _s * 0.6; }     // spiral: disardan ice azalan opaklik
          else if (opMode === 'spiralOut') { const _s = (((a / (2 * Math.PI)) + i * 0.5) % 1 + 1) % 1; op = 0.4 + _s * 0.6; }    // spiral: tam tersi (ice dogru artan)
          else if (opMode === 'blink') op = (i % 2 === 0) ? 1.0 : 0.22;                                                          // her halka bir FULL opak bir COK AZ -> yanip sonme
          else if (opMode === 'pulse' || opMode === 'random') op = ringOp[i];                                                    // ring-cycle / per-ring random
          else op = Math.max(0.62, 0.98 - i * 0.045);                                                                           // fallback (never selected by forge pool)
          op = Math.max(0.2, Math.min(1, op * haloOp));                                                                         // floor 0.2 -> blink'in sonuk halkasi hafif gorunur kalir
        } else {   // BASE: unchanged
          if (opMode === 'up') op = 0.22 + 0.72 * ((y - (CY - outR)) / (2 * outR));
          else if (opMode === 'pulse' || opMode === 'random') op = ringOp[i];
          else op = Math.max(0.15, 0.78 - i * 0.07);
          op = Math.max(0.12, Math.min(1, op * haloOp));
        }
        rasterRect(g, x, y, hbs, hbs, col, 0, op);   // halo UNROLLED (rad=0) even for DEGEN — imperceptible for a ring, lets the on-chain halo use the cheap writeCell path. Mirrors FacetsHaloV7.
      }
    }
  }

  // ---- FORGE finish frame (v7 port, 2026-07-28): THIN sub-cell border ring appended to the SVG. FORGE-only (p._forge_finish). ----
  function forgeFinishSVG(p) {
    const f = p._forge_finish; if (!f || f === 'standard') return '';
    const N = V7.GRID, t = 0.3;   // t = frame thickness in grid units (thin — ~1/3 cell)
    const R = (x, y, w, h, c) => '<rect x="' + (+x.toFixed(3)) + '" y="' + (+y.toFixed(3)) + '" width="' + (+w.toFixed(3)) + '" height="' + (+h.toFixed(3)) + '" fill="' + c + '"/>';
    const frame = cols => { const n = cols.length, seg = N / n; let s = ''; for (let i = 0; i < n; i++) { const c = cols[i], a = i * seg; s += R(a, 0, seg, t, c) + R(N - t, a, t, seg, c) + R(a, N - t, seg, t, c) + R(0, a, t, seg, c); } return s; };
    if (f === 'prismatic') return frame(['#fe0000', '#ff8a00', '#fcb913', '#9dd812', '#16d34c', '#01b4ff', '#5e00d4', '#ff00a0']);
    if (f === 'gilded') return frame(['#7a5a10', '#caa53a', '#fcb913', '#ffe066', '#fff3c0', '#ffe066', '#fcb913', '#caa53a']);   // shiny gold ring
    const c = p.accent_color || '#f0f0f0'; return R(0, 0, N, t, c) + R(0, N - t, N, t, c) + R(0, 0, t, N, c) + R(N - t, 0, t, N, c);   // etched: single palette-accent
  }

  // ---- GHOST silhouette contour (port of ghostOutline; 1-cell ring outside the head+jaw) ----
  function paintGhostOutline(g, p, bs, anchors, rad) {
    const pal = (p.ghost_outline_pal && p.ghost_outline_pal.length) ? p.ghost_outline_pal : (p.ghost_outline ? [toHex(p.ghost_outline)] : null);
    if (!pal) return;
    const np = pal.length, colMode = (np > 1) ? (p.ghost_outline_mode || 'c') : 'solid';
    const opMode = p.ghost_outline_op || null, baseOp = (p.ghost_outline_opacity != null) ? p.ghost_outline_opacity : 1;
    const rotc = p.ghost_outline_rot || 0, hseed = (p.seed | 0) + 7711;
    const jaw = [anchors.hingeL, anchors.gonialL, anchors.chin, anchors.gonialR, anchors.hingeR];
    const inFace = (x, y) => Math.hypot(x - CX, y - CY) < R || pointInPoly(x, y, jaw);
    const cols = Math.ceil(1000 / bs), rows = Math.ceil(1000 / bs);
    const cells = []; let miny = 1e9, maxy = -1e9;
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      const cx = gx * bs + bs / 2, cy = gy * bs + bs / 2;
      if (inFace(cx, cy)) continue;
      if (inFace(cx - bs, cy) || inFace(cx + bs, cy) || inFace(cx, cy - bs) || inFace(cx, cy + bs) || inFace(cx - bs, cy - bs) || inFace(cx + bs, cy - bs) || inFace(cx - bs, cy + bs) || inFace(cx + bs, cy + bs)) { cells.push({ gx, gy, cx, cy }); if (cy < miny) miny = cy; if (cy > maxy) maxy = cy; }
    }
    const yspan = maxy > miny ? maxy - miny : 1;
    cells.forEach(c => {
      const dx = c.cx - CX, dy = c.cy - CY; let ci;
      switch (colMode) {
        case 'solid': ci = 0; break;
        case 'lr': ci = Math.floor((c.cx / 1000) * np); break;
        case 'up': ci = Math.floor(((c.cy - miny) / yspan) * np); break;
        case 'diag': ci = Math.floor(((c.cx + c.cy) / 2000) * np); break;
        case 'x': ci = ((Math.abs(dx) > Math.abs(dy)) ? 0 : 1) * 2 + (((dx > 0) === (dy > 0)) ? 0 : 1); break;
        case 'random': ci = Math.floor(hashNoise(c.gx, c.gy, hseed) * np); break;
        default: ci = Math.floor(((Math.atan2(dy, dx) / (2 * Math.PI)) + 0.5) * np);
      }
      const col = pal[(((ci + rotc) % np) + np) % np];
      let op = baseOp;
      if (opMode === 'up') op = baseOp * (0.4 + 0.6 * (1 - (c.cy - miny) / yspan));
      else if (opMode === 'pulse') { const r = hashNoise(c.gx, c.gy, hseed + 1); op = baseOp * (r < 0.34 ? 1 : r < 0.67 ? 0.66 : 0.36); }
      else if (opMode === 'random') op = baseOp * (0.45 + 0.55 * hashNoise(c.gx, c.gy, hseed + 2));
      op = Math.max(0.14, Math.min(1, op));
      rasterRect(g, c.gx * bs, c.gy * bs, bs, bs, col, rad, op);
    });
  }

  // ---- DEGEN off-face PnL splatter (port of splatterTiles) ----
  function paintSplatter(g, p, bs, rad) {
    const greenN = p.splat_green || 0, goldN = p.splat_gold || 0, redN = (p.splat_red != null) ? p.splat_red : (p.splatters || 0);
    const total = greenN + goldN + redN; if (total < 1) return;
    const GREEN = '#39ff14', RED = '#fe0000', GOLD = '#fcb913';
    const rng = mulberry32((p.seed | 0) + 71);
    for (let i = 0; i < total; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = p.splat_on_face ? (R * 0.15 + rng() * (R + 170)) : (R + 34 + rng() * 230);
      const x = Math.round((CX + Math.cos(angle) * dist) / bs) * bs, y = Math.round((CY + Math.sin(angle) * dist) / bs) * bs;
      if (x < 0 || x >= 1000 || y < 0 || y >= 1000) continue;
      if (!p.splat_on_face && Math.hypot(x + bs / 2 - CX, y + bs / 2 - CY) < R + 14) continue;
      const col = i < greenN ? GREEN : (i < greenN + goldN ? GOLD : RED);
      let sz = bs, ox = 0;   // 2026-07-25: full CELL width (was bs-1) so a plain splat is never dropped between two cell centres. Varied-gold below stays sub-cell on purpose.
      if (p.splat_gold_varied) { sz = Math.max(3, Math.round(bs * (0.35 + rng() * 0.65))); ox = Math.round((bs - sz) / 2); }
      rasterRect(g, x + ox, y + ox, sz, sz, col, rad, 1);
    }
  }

  // ---- NEWBIE sparks / fragments (port of sparkTiles) ----
  function paintSparks(g, p, bs, rad) {
    const n = p.spark_count || 0; if (n < 1) return;
    const rng = mulberry32((p.seed | 0) + 53);
    const COLS = (p.face_palette && p.face_palette.length) ? p.face_palette : ((p.spark_colors && p.spark_colors.length) ? p.spark_colors : ['#5fe39a']);
    const b = bs, placed = [], GAP = bs * 0.3;
    for (let i = 0; i < n; i++) {
      const col = COLS[Math.floor(rng() * COLS.length)];
      let cx = 0, cy = 0, bb = null, ok = false;
      for (let a = 0; a < 30 && !ok; a++) {
        const angle = rng() * Math.PI * 2, dist = R + 8 + Math.pow(rng(), 1.5) * 300;
        cx = CX + Math.cos(angle) * dist; cy = CY + Math.sin(angle) * dist;
        if (p._bg_pat === 'grid' && p._bg_gn) { const bgc = 1000 / p._bg_gn; let bgx = Math.floor(cx / bgc), bgy = Math.floor(cy / bgc); if (bgx % 3 === 0) bgx += (bgx + 1 < p._bg_gn ? 1 : -1); if (bgy % 3 === 0) bgy += (bgy + 1 < p._bg_gn ? 1 : -1); cx = (bgx + 0.5) * bgc; cy = (bgy + 0.5) * bgc; }
        bb = [cx - b / 2, cy - b / 2, cx + b / 2, cy + b / 2];
        if (bb[0] < 8 || bb[2] > 992 || bb[1] < 8 || bb[3] > 992) continue;
        if (Math.hypot(cx - CX, cy - CY) < R + 10) continue;
        let clash = false;
        for (let q = 0; q < placed.length; q++) { const o = placed[q]; if (!(bb[2] + GAP < o[0] || bb[0] - GAP > o[2] || bb[3] + GAP < o[1] || bb[1] - GAP > o[3])) { clash = true; break; } }
        if (!clash) ok = true;
      }
      if (!ok) continue;
      placed.push(bb);
      rasterRect(g, cx - b / 2, cy - b / 2, b, b, col, rad, 1);   // 2026-07-25: full CELL width (was b-1) -> a rect exactly one cell wide ALWAYS contains a cell centre, so no spark is silently dropped. Same single-cell result on screen.
    }
  }

  // ---- RAINBOW VOMIT stream (port of vomitTiles); rolled with the face for DEGEN ----
  function paintVomit(g, p, bs, rad) {
    if (p.mouth_style !== 'vomit') return;
    const anchors = getAnchors(p.yaw || 0, p.pitch || 0);
    const vmX = anchors.mouth[0], vmY = anchors.mouth[1] - 34, top = vmY - bs * 0.2;
    const cols = Math.ceil(1000 / bs);
    for (let gy = 0; gy < cols; gy++) for (let gx = 0; gx < cols; gx++) {
      const x = gx * bs, y = gy * bs, cx = x + bs / 2, cy = y + bs / 2;
      if (cy <= top) continue;
      const down = cy - top, span = 985 - top, d = Math.min(1, down / span);
      const halfW = Math.min(bs * 6, bs * 1.9 + down * 0.10 + d * d * bs * 3.4);
      const ramp = Math.min(1, down / (bs * 7));
      const swayRaw = (Math.sin(down * 0.018 + (p.seed % 17) * 0.4) * (bs * 1.4) + Math.sin(down * 0.05 + 1.1) * (bs * 0.6)) * ramp;
      const center = vmX + Math.round(swayRaw / bs) * bs;
      if (Math.abs(cx - center) >= halfW) continue;
      let iv = Math.floor(d * VOMIT_PAL.length);
      const j = hashNoise(gx, gy, p.seed + 401);
      if (j < 0.18) iv -= 1; else if (j > 0.82) iv += 1;
      iv = Math.max(0, Math.min(VOMIT_PAL.length - 1, iv));
      const fade = d < 0.14 ? -0.45 * (1 - d / 0.14) : 0;
      const col = shadeHex(VOMIT_PAL[iv], (hashNoise(gx, gy, p.seed + 7) - 0.5) * 0.22 + fade);
      rasterRect(g, x, y, bs, bs, col, rad, 1);
    }
  }

  // ============================================================================================
  //  BACKGROUND (port of backgroundTiles) — deterministic patterns sampled per cell
  // ============================================================================================
  const BG_PATTERNS = ['solid', 'gradient', 'scatter', 'checker', 'stripes', 'halftone', 'grid', 'rings', 'rays', 'diamonds', 'frames'];
  const BG_WEIGHTS = [20, 17, 14, 12, 10, 8, 6, 5, 4, 3, 2];
  const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  // 2026-08-03: a MEDALLION TURN motion (a colour-swap wedge walking round the coin) was built here and then
  // CANCELLED by gruff after seeing it. Nothing animates the medallion now. Kept as a note so nobody rebuilds
  // it by accident: the mechanism worked, it cost +50% bytes on the token, and it was not worth it.
  function paintMedallion(g, p) {
    const gold = p.medallion_ring || p.fg || '#fcb913', outer = p.medallion_outer || '#000000';
    const gpal = (p.medallion_pal && p.medallion_pal.length) ? p.medallion_pal : null;
    const rng = mulberry32((p.seed | 0) + 4400);
    const t0 = [29, 33, 37][Math.floor(rng() * 3)]; const t = rng();   // consume rng in the same order (GN unused for sampling, coin radii use t)
    const rIn = R * (1.28 + t * 0.04), rRimA = R * (1.48 + t * 0.05), rRimB = R * (1.74 + t * 0.06), inW = (1000 / t0) * 0.85;
    const goldAt = (d) => { if (!gpal) return gold; const f = Math.max(0, Math.min(0.999, (d - rIn) / (rRimB - rIn))); return gpal[Math.floor(f * gpal.length)]; };
    for (let r = 0; r < V7.GRID; r++) for (let c = 0; c < V7.GRID; c++) {
      const d = Math.hypot((c + 0.5) * CELL - CX, (r + 0.5) * CELL - CY);
      // 2026-08-03: the GOLD goes through setCell so the tag layer can see it (the medallion wheel);
      // the black field outside the coin keeps its raw write and is never animated — it is most of the
      // canvas, and tagging it would have cost a fortune in bytes for something nobody would read as motion.
      // Identical output with V7.animate off: setCell writes the same cell, stamp() is a no-op.
      let col = null;
      if (d > rRimB) col = outer; else if (d >= rRimA) col = goldAt(d); else if (Math.abs(d - rIn) <= inW) col = goldAt(d);
      if (col) g[idx(c, r)] = col;
    }
  }
  function paintBackground(g, p, rad) {
    if (p._no_bg) return;
    if (p.bg_solid) return;                 // solid p.bg already filled
    if (p.medallion) { paintMedallion(g, p); return; }
    if (!p.bg_variety) return;              // solid
    const rng = mulberry32((p.seed | 0) + 4400);
    const RAINBOW10 = RAINBOW;
    const mcPalette = (p.bg_palette && p.bg_palette.length) ? p.bg_palette.filter((c) => c !== p.bg) : (p.render_mode === 'rgb_glitch' ? RAINBOW10 : null);
    let sec, glitchPool = null;
    if (mcPalette && mcPalette.length) {
      const maxN = Math.min(8, mcPalette.length);
      const choices = [1, 1, 2, 2, 3, 5, 8].filter((n) => n <= maxN);
      const cnt = choices[Math.floor(rng() * choices.length)];
      const pool = mcPalette.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
      glitchPool = pool.slice(0, cnt); sec = glitchPool[0];
    } else {
      const cand = []; if (p.accent_color) cand.push(p.accent_color); if (p.fg) cand.push(p.fg); cand.push('#efdfc8', '#f0f0f0');
      const uniq = cand.filter((c, i) => c && cand.indexOf(c) === i && c !== p.bg);
      sec = uniq[Math.floor(rng() * uniq.length)] || '#f0f0f0';
    }
    let pat = BG_PATTERNS[0], wTotal = 0;
    for (let i = 0; i < BG_WEIGHTS.length; i++) wTotal += BG_WEIGHTS[i];
    let wr = rng() * wTotal;
    for (let i = 0; i < BG_PATTERNS.length; i++) { wr -= BG_WEIGHTS[i]; if (wr < 0) { pat = BG_PATTERNS[i]; break; } }
    if (p.bg_force_pattern) pat = p.bg_force_pattern;
    if (pat === 'solid') return;
    const GN = [21, 25, 29, 33, 41][Math.floor(rng() * 5)];
    p._bg_gn = GN; p._bg_pat = pat;
    const cell = 1000 / GN, mid = (GN - 1) / 2, maxD = Math.hypot(mid, mid);
    const dir = Math.floor(rng() * 5), invert = rng() < 0.5;
    const angBands = 6 + Math.floor(rng() * 7) * 2, ringW = 2 + Math.floor(rng() * 3), stripeW = 2 + Math.floor(rng() * 3);
    const scatterP = 0.16 + rng() * 0.22, dotScale = 0.34 + rng() * 0.30, diamondW = 2 + Math.floor(rng() * 3), gridK = 3 + Math.floor(rng() * 3);   // GAS ART (2026-07-22): grid spacing 3-5 -> 5-7 (Rainbow Grid only). Sparser lines = fewer deep-recolor cells, fits under 50M so a few survive.
    let orbC = null;
    if (pat === 'orbs') { orbC = []; const orbN = 6 + Math.floor(rng() * 2); for (let i = 0; i < orbN; i++) { const ang = rng() * Math.PI * 2, dist = mid * (0.42 + rng() * 0.55), rad2 = 1.3 + rng() * (i % 3 === 0 ? 1.4 : 4.2); orbC.push({ x: mid + Math.cos(ang) * dist, y: mid + Math.sin(ang) * dist, r: rad2 }); } }   // GAS ART (2026-07-22): 6-7 -> 4-5 orbs so Orbs stays under the 50M cap on light facets. Fewer per-cell distance checks.
    const starP = 0.04 + rng() * 0.03;
    let deepCol = null;
    if (p.bg_deep) {
      const dBands = Math.max(4, Math.min(28, p.bg_deep_bands || 12)), dHue = Math.floor(mulberry32((p.seed | 0) + 8800)() * 360);
      const dox = 500, doy = p.bg_deep_oy != null ? p.bg_deep_oy : 460, dMax = Math.hypot(Math.max(dox, 1000 - dox), Math.max(doy, 1000 - doy)), scheme = p.bg_deep_scheme || 'cohesive';
      const schemeCol = (t) => {
        if (scheme === 'cumbus') return hslHex(dHue + t * 110, 74 + t * 10, 82 - t * 38);
        if (scheme === 'rainbow') return hslHex(dHue + t * 330, 80, 82 - t * 36);
        if (scheme === 'lava') return hslHex(50 - t * 50, 90, 86 - t * 40);
        if (scheme === 'aqua') return hslHex(196 + t * 44, 88, 84 - t * 40);
        if (scheme === 'verdant') return hslHex(96 + t * 56, 80, 82 - t * 40);
        return hslHex(dHue + t * 38, 72 + t * 10, 82 - t * 38);
      };
      deepCol = (px, py) => schemeCol(Math.min(dBands - 1, Math.floor(Math.hypot(px - dox, py - doy) / dMax * dBands)) / (dBands - 1));
    }
    // protect zone (halo/whale/ghost clearance)
    let protectR = p.bg_no_protect ? -1 : R * 1.25;
    const hbs = p.block_size || 16; let haloOuter = 0;
    if (p.halo_rings > 0) { const _hb = p.block_size || 16, _bud = (p.halo_budget != null ? p.halo_budget : 228); let _sp = p.halo_rings > 1 ? _bud / (p.halo_rings - 1) : _hb; _sp = Math.max(_hb, Math.min(_sp, 1.3 * _hb)); haloOuter = R + 20 + (p.halo_rings - 1) * _sp + _hb + 24; }
    if (p.whale_halo_rings > 0) { const wo = R + hbs * (2.8 + (p.whale_halo_rings - 1) * 1.35) + 70; if (wo > haloOuter) haloOuter = wo; }
    if (protectR > 0 && haloOuter > protectR) protectR = haloOuter;
    if (protectR > 0 && p._ghost_protect && p._ghost_protect > protectR) protectR = p._ghost_protect;
    // sample per 41-cell (inverse-roll to model for DEGEN)
    const patternOn = (cx, cy, pcx, pcy) => {
      let on = false;
      if (pat === 'gradient') { let ratio; if (dir === 0) ratio = Math.hypot(cx - mid, cy - mid) / maxD; else if (dir === 1) ratio = cy / (GN - 1); else if (dir === 2) ratio = 1 - cy / (GN - 1); else if (dir === 3) ratio = cx / (GN - 1); else ratio = (cx + cy) / (2 * (GN - 1)); if (invert) ratio = 1 - ratio; on = ratio > (BAYER4[((cy % 4) + 4) % 4][((cx % 4) + 4) % 4] + 0.5) / 16; }
      else if (pat === 'checker') on = (((Math.abs(cx - mid) >> 1) + (Math.abs(cy - mid) >> 1)) % 2) === 0;
      else if (pat === 'rays') { const a = Math.atan2(cy - mid, cx - mid) + Math.PI; on = Math.floor(a / (Math.PI * 2) * angBands) % 2 === 0; }
      else if (pat === 'rings') on = Math.floor(Math.hypot(cx - mid, cy - mid) / ringW) % 2 === 0;
      else if (pat === 'stripes') on = Math.floor(Math.abs((invert ? cx : cy) - mid) / stripeW) % 2 === 0;
      else if (pat === 'halftone') on = (Math.abs(cx - mid) % 2) === 0 && (Math.abs(cy - mid) % 2) === 0;
      else if (pat === 'scatter') on = hashNoise(cx, cy, (p.seed | 0) + 4400) < scatterP;   // APPROX (rng-order in engine)
      else if (pat === 'diamonds') on = Math.floor((Math.abs(cx - mid) + Math.abs(cy - mid)) / diamondW) % 2 === 0;
      else if (pat === 'frames') on = Math.floor(Math.max(Math.abs(cx - mid), Math.abs(cy - mid)) / ringW) % 2 === 0;
      else if (pat === 'grid') on = (Math.abs(cx - mid) % gridK === 0) || (Math.abs(cy - mid) % gridK === 0);
      else if (pat === 'eclipse') { const ed = Math.hypot(cx - mid, cy - mid) / maxD, eang = (Math.atan2(cy - mid, cx - mid) + Math.PI) / (Math.PI * 2) * angBands, spoke = Math.abs(eang - Math.round(eang)) < 0.12; on = (ed > 0.5 && ed < 0.58) || (spoke && ed > 0.5 && ed < 0.94); }
      else if (pat === 'orbs') { for (let i = 0; i < orbC.length; i++) { if (Math.hypot(cx - orbC[i].x, cy - orbC[i].y) <= orbC[i].r) { on = true; break; } } }
      else if (pat === 'starfield') on = hashNoise(cx, cy, (p.seed | 0) + 4400) < starP;   // APPROX
      else if (pat === 'aurora') { const wav = cx + Math.sin((cy / (GN - 1)) * Math.PI * 2) * 3.2; on = Math.floor(Math.abs(wav - mid) / (stripeW + 1)) % 2 === 0; }
      return on;
    };
    for (let sr = 0; sr < V7.GRID; sr++) for (let sc = 0; sc < V7.GRID; sc++) {
      const m = invRoll((sc + 0.5) * CELL, (sr + 0.5) * CELL, rad);
      const pcx = m[0], pcy = m[1];
      if (protectR > 0 && Math.hypot(pcx - CX, pcy - CY) < protectR) continue;
      const cx = Math.floor(pcx / cell), cy = Math.floor(pcy / cell);
      if (!patternOn(cx, cy, pcx, pcy)) continue;
      const rowSec = glitchPool ? glitchPool[(Math.imul(((((cy / 2) | 0) + 1) ^ (p.seed | 0)), 2246822519) >>> 24) % glitchPool.length] : sec;
      g[idx(sc, sr)] = deepCol ? deepCol(pcx, pcy) : rowSec;
    }
  }

  // ============================================================================================
  //  COLLECTOR frame/mat (port of floatingMatTiles) + wall (port of _wMaxi/_wSpec/_wExpl/_wComp)
  // ============================================================================================
  const _matLo = 80, _matHi = 922, _IN_LO = 76, _IN_HI = 926;
  const _pick = (rng, a) => a[Math.floor(rng() * a.length)];
  const COLL_PAL = ['#fe0000', '#0101ef', '#fcb913', '#f0f0f0', '#efdfc8'];
  const COLL_ARCH_PAL = { Maxi: ['#fe0000', '#f0f0f0', '#fcb913'], Specialist: ['#fcb913', '#ffd84d', '#efdfc8'], Explorer: ['#01ffff', '#9bd4ff', '#f0f0f0'], Completionist: ['#fe0000', '#0101ef', '#fcb913', '#efdfc8', '#0a0a0a'] };
  const ARCH_BY_LAYOUT = { anchor: 'Maxi', cluster: 'Specialist', scatter: 'Explorer', dense: 'Completionist' };
  const COLLECTOR_POOL = ['#fe0000', '#fcb913', '#16d34c', '#2f9ad3', '#8a2be2', '#f0f0f0'];
  const ARCH_LAYOUT = { Maxi: 'anchor', Specialist: 'cluster', Explorer: 'scatter', Completionist: 'dense' };
  const _frGeom = (bs) => { const n = Math.max(8, Math.round(860 / bs)), c = Math.round(860 / n), W = n * c, x0 = Math.round((1000 - W) / 2); return { c, W, x0, inLo: x0 + c, inHi: x0 + W - c, out: x0 }; };
  let _fr = { inLo: 96, inHi: 904, out: 68 };
  const _outerOK = (x, y, w, h) => x >= 2 && y >= 2 && x + w <= 998 && y + h <= 998 && (x + w <= _fr.out || x >= 1000 - _fr.out || y + h <= _fr.out || y >= 1000 - _fr.out);
  const _innerOK = (x, y, w, h, hE) => x >= _fr.inLo && y >= _fr.inLo && x + w <= _fr.inHi && y + h <= _fr.inHi && (Math.hypot((x + w / 2) - CX, (y + h / 2) - CY) - Math.hypot(w, h) / 2) > hE + 6;
  function _haloR(p) { const rings = p.halo_rings || 0; if (rings < 1) return R + 36; const bs = p.block_size || 16, bud = (p.halo_budget != null ? p.halo_budget : 228); let sp = rings > 1 ? bud / (rings - 1) : bs; sp = Math.max(bs, Math.min(sp, 1.3 * bs)); return R + 20 + (rings - 1) * sp + bs + 8; }

  function _wMaxi(E, rng, bs, pal, tier, hE) {
    tier = tier || 1; const B = bs, t01 = (tier - 1) / 9, half = B / 2;
    const tv = (c, i, j) => shadeHex(c, (((i * 7 + j * 13) % 5 + 5) % 5 - 2) * 0.06);   // per-cell tonal jitter so the target isn't flat solid
    hE = Math.min(hE, R + 42);
    const cellX = i => CX + i * B - half, cellY = j => CY + j * B - half;
    // GRID-NATIVE emit 2026-07-25: keep the geometry tests in pixel space but snap the painted block to the cell
    // that contains its centre, so no target block can fall between two cell centres and paint nothing.
    const EC = (i, j, col) => { const c = Math.floor((CX + i * B) / CELL), r = Math.floor((CY + j * B) / CELL); if (c < 0 || c >= V7.GRID || r < 0 || r >= V7.GRID) return; E(c * CELL, r * CELL, CELL, CELL, col); };
    const armOK = (x, y) => _innerOK(x, y, B, B, hE), ins = (x, y) => _innerOK(x, y, B, B, hE);
    const maxCells = Math.floor((_fr.inHi - 24 - CX - B / 2) / B), startK = Math.min(maxCells, Math.ceil((hE + 10) / B));
    const nRings = tier >= 10 ? 3 : tier >= 9 ? 2 : tier >= 4 ? 1 : 0, bandMax = (_fr.inHi - 24 - 500) - B;
    for (let ri = 0; ri < nRings && bandMax > hE + B + 8; ri++) {
      const ringR = hE + B + (bandMax - hE - B) * (nRings === 1 ? 0.55 : ri / Math.max(1, nRings - 1) * 0.6 + 0.2), kr = Math.round(ringR / B);
      for (let i = -kr - 1; i <= kr + 1; i++) for (let j = -kr - 1; j <= kr + 1; j++) { const d = Math.hypot(i * B, j * B); if (d >= ringR - half && d < ringR + half) { const x = cellX(i), y = cellY(j); if (ins(x, y)) EC(i, j, tv(pal[2], i, j)); } }
    }
    const innerLen = 1 + Math.round(t01 * (maxCells - startK)), innerReach = Math.min(maxCells - 1, startK + innerLen);
    for (let k = startK; k <= innerReach; k++)[[0, -k], [0, k], [-k, 0], [k, 0]].forEach(([i, j]) => { const x = cellX(i), y = cellY(j); if (armOK(x, y)) EC(i, j, tv(pal[0], i, j)); });
    [[0, -maxCells], [0, maxCells], [-maxCells, 0], [maxCells, 0]].forEach(([i, j]) => { const x = cellX(i), y = cellY(j); if (armOK(x, y)) EC(i, j, tv(pal[1], i, j)); });
    if (tier >= 3) { const dLen = 1 + Math.round(((tier - 3) / 7) * (maxCells - startK - 2)), dr = Math.min(maxCells - 1, startK + dLen); for (let k = startK; k <= dr; k++)[[-k, -k], [k, -k], [-k, k], [k, k]].forEach(([i, j]) => { const x = cellX(i), y = cellY(j); if (ins(x, y)) EC(i, j, tv(pal[1], i, j)); }); }
    if (tier >= 10) { const kc = maxCells;[[-kc, -kc], [kc, -kc], [-kc, kc], [kc, kc]].forEach(([i, j]) => { const x = cellX(i), y = cellY(j); if (ins(x, y)) EC(i, j, tv(pal[1], i, j)); }); }
  }
  // SPECIALIST crown = gold ring hugging the head. GRID-NATIVE 2026-07-25: the old version walked its OWN pixel
  // grid (off = 101 + gx*bs, block size bs-1) which is phase-shifted vs the 35-grid cell centres — EVERY block
  // fell between two centres, so rasterRect's centre-in-rect test hit NOTHING and every Specialist rendered EMPTY.
  // Now we iterate the real cells and emit exactly one cell per hit.
  function _wSpec(E, rng, bs, pal, hf) {
    hf = hf || 1; const inset = 14, lo = _matLo + inset, hi = _matHi - inset;
    const reach = bs * (2.0 + 1.8 * Math.min(1, (hf - 0.1) / 1.7));
    for (let r = 0; r < V7.GRID; r++) for (let c = 0; c < V7.GRID; c++) {
      const px = (c + 0.5) * CELL, py = (r + 0.5) * CELL;
      if (px < lo || px > hi || py < lo || py > hi) continue;
      const d = Math.hypot(px - CX, py - CY) - (R + 5); if (d < 0 || d > reach) continue;
      const t = d / reach; if (rng() < 0.75 - 0.57 * t) E(c * CELL, r * CELL, CELL, CELL, _pick(rng, pal));
    }
  }
  // EXPLORER = confetti. GRID-NATIVE 2026-07-25: the old version threw 16px blocks at random pixel positions on a
  // 28.57px cell grid, so most missed a cell centre entirely and the confetti read far sparser than its count.
  // Now one hit = one cell, and the amount ramps CLEARLY across holdings 1..10 and seeps inward as it grows.
  function _wExpl(E, rng, bs, pal, tier, hE) {
    tier = tier || 1; const outer = [], inner = [];
    for (let r = 0; r < V7.GRID; r++) for (let c = 0; c < V7.GRID; c++) {
      const px = (c + 0.5) * CELL, py = (r + 0.5) * CELL;
      if (px <= _fr.out || px >= 1000 - _fr.out || py <= _fr.out || py >= 1000 - _fr.out) { outer.push(c * V7.GRID + r); continue; }   // bg band OUTSIDE the frame
      if (px >= _fr.inLo && px <= _fr.inHi && py >= _fr.inLo && py <= _fr.inHi && Math.hypot(px - CX, py - CY) > hE + 10) inner.push(c * V7.GRID + r);   // mat, clear of head + halo
    }
    const take = (pool, n) => { const used = {}; let got = 0, guard = 0; while (got < n && guard < n * 40 && pool.length) { guard++; const k = pool[Math.floor(rng() * pool.length)]; if (used[k]) continue; used[k] = 1; E(Math.floor(k / V7.GRID) * CELL, (k % V7.GRID) * CELL, CELL, CELL, _pick(rng, pal)); got++; } };
    take(outer, Math.min(outer.length, 8 + tier * 6));                      // 14 @holdings1 -> 68 @holdings10 (clear ramp; trimmed 7t->6t 2026-07-25 for gas headroom)
    if (tier >= 2) take(inner, Math.min(inner.length, (tier - 1) * 4));     // inward seep: 4 @2 -> 36 @10 (trimmed 5->4)
  }
  // COMPLETIONIST = dense wall filling the mat. GRID-NATIVE 2026-07-25: the old integer pixel pitch (round(span/cols))
  // beat against the 28.57px cell, so blocks landed between cell centres and left holes even at max holdings.
  function _wComp(E, rng, bs, haloR, pal, fill) {
    fill = fill || 0.8; const GAP = 4, lo = _fr.inLo + GAP, hi = _fr.inHi - GAP, clearR = haloR + bs * 0.85;
    for (let r = 0; r < V7.GRID; r++) for (let c = 0; c < V7.GRID; c++) {
      const px = (c + 0.5) * CELL, py = (r + 0.5) * CELL;
      if (px < lo || px > hi || py < lo || py > hi) continue;
      if (Math.hypot(px - CX, py - CY) < clearR) continue;
      if (rng() < fill) E(c * CELL, r * CELL, CELL, CELL, _pick(rng, pal));
    }
  }
  function paintFloatingMat(g, p, bs) {
    if (!p.floating_mat) return;
    const mat = p.mat_color || '#01014a', key = p.accent_color || p.fg, pat = p._frame_pat || 'solid';
    // GRID-NATIVE frame: 1 frame block = 1 grid cell over the border ring. The old pixel-pitch (~29px) beat
    // against the 35-grid cell (28.57px) and rasterRect's centre-in-rect test left 1-2 cell gaps mid-side
    // ("silinmiş bloklar"). Ring cells lo..hi match the old outer edge, so _frGeom / the wall boundary are unchanged.
    const geo = _frGeom(bs);
    const lo = Math.round(geo.out / CELL), hi = V7.GRID - 1 - lo, n = hi - lo + 1;
    for (let r = lo; r <= hi; r++) for (let c = lo; c <= hi; c++) setCell(g, c, r, mat);   // navy mat panel behind the face
    const kc = (function (s) { s = '' + s; if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; const m = s.match(/\d+/g) || [200, 200, 200]; return [+m[0], +m[1], +m[2]]; })(key);
    const cellCol = (cx, cy) => { const t = (pat === 'diag') ? (cx + cy) / (2 * (n - 1)) : (cy === 0 || cy === n - 1) ? cx / (n - 1) : cy / (n - 1); const j = (((cx * 7 + cy * 13) % 5) - 2) * 0.075; const q = Math.max(0.35, Math.min(1.35, 0.5 + t * 0.7 + j)); return 'rgb(' + Math.min(255, kc[0] * q | 0) + ',' + Math.min(255, kc[1] * q | 0) + ',' + Math.min(255, kc[2] * q | 0) + ')'; };   // EACH frame cell = its own SOLID tone: base ramp + per-block jitter -> reads as individual colour blocks (blok blok)
    // ⚠️ TAG THE RING ONLY. The navy MAT panel is filled above (n x n, ~840 cells); wrapping the whole
    // painter tagged all of it and made the token WORSE, not better (124 -> 650 animated cells, measured).
    // The frame is the 1-cell ring, and that is what animates.
    rec(TAG ? (p._animFrame || 0) : 0, () => {
    for (let i = 0; i < n; i++) { setCell(g, lo + i, lo, cellCol(i, 0)); setCell(g, lo + i, hi, cellCol(i, n - 1)); }
    for (let j = 1; j < n - 1; j++) { setCell(g, lo, lo + j, cellCol(0, j)); setCell(g, hi, lo + j, cellCol(n - 1, j)); }
    }, p._animFrameLit);
  }
  function paintCollectorWall(g, gt, p, bs) {
    const layout = p.block_layout || 'scatter', rng = mulberry32((gt.tokenHash || 1) >>> 0);
    _fr = _frGeom(bs);
    const tier = (p.holdings != null) ? p.holdings : 5, t01 = Math.max(0, Math.min(1, (tier - 1) / 9)), hE = _haloR(p) + 6;
    const E = (x, y, w, h, c) => rasterRect(g, x, y, w, h, c, 0, 1);
    if (layout === 'anchor') return _wMaxi(E, rng, bs, COLL_ARCH_PAL.Maxi, tier, hE);
    if (layout === 'scatter') return _wExpl(E, rng, bs, COLLECTOR_POOL, tier, hE);
    const pal = COLL_ARCH_PAL[ARCH_BY_LAYOUT[layout]] || COLL_PAL;
    const HF = 0.12 + t01 * 1.78, FILL = 0.12 + t01 * 0.88;   // 2026-07-25 (user): holdings 10 = MAX, so Completionist must fill SOLID at t01=1 (FILL 1.0; was 0.75 -> left holes). Mirrors FacetsWallV7.
    if (layout === 'cluster') return _wSpec(E, rng, bs, pal, HF);
    if (layout === 'dense') return _wComp(E, rng, bs, _haloR(p), pal, FILL);
    return _wExpl(E, rng, bs, COLLECTOR_POOL, tier, hE);
  }

  // ---- WHALE gold halo (port of whaleHalo) ----
  function paintWhaleHalo(g, gt, p, bs) {
    const rings = p.whale_halo_rings || 0; if (rings <= 0) return;
    const pat = p.whale_pattern || 'Solid', fill = p.whale_fill || 'Gold', baseOp = (p.whale_glow != null) ? p.whale_glow : 0.62;
    const clearR = R + bs * 1.15;   // simple radial head-clearance. The ring sits at r0=R+2bs, always OUTSIDE this -> the halo never breaks on pitch / down-gazes (the old jaw-polygon cull ate the bottom ring when the face pitched down)
    const nearFace = (x, y) => Math.hypot(x + bs / 2 - CX, y + bs / 2 - CY) < clearR;
    const GOLD = '#fcb913', WHITE = '#fff6d8', CREAM = '#fff2c4', RAYS = 12;
    const spm = pat === 'Pinstripe' ? 2.1 : pat === 'Orbit' ? 1.65 : 1.3;
    let sp = Math.round(bs * spm); const _wbud = 468 - (R + bs * 0.8); if (rings > 1) sp = Math.max(bs, Math.min(sp, Math.floor(_wbud / (rings - 1))));
    const cellExists = (k, N, i, a) => { const f = k / N; switch (pat) { case 'Dashed': return k % 3 !== 2; case 'Dotted': return k % 2 === 0; case 'Orbit': return k % 2 === 0; case 'Crescent': return Math.sin(a) <= 0.45; case 'Wings': return Math.abs(Math.cos(a)) > 0.5; case 'ArcTop': return Math.sin(a) < -0.35; case 'Flare': return Math.sin(a) > -0.05; case 'Rays': return (f * RAYS) % 1 < 0.30; case 'Star': return (f * 6) % 1 < 0.16; case 'Pinwheel': return ((f * 8) + i * 0.6) % 1 < 0.26; case 'Sunburst': { const s6 = f * 12, seg = s6 % 1; return seg < 0.28 && (Math.floor(s6) % 2 === 0 || i < Math.ceil(rings / 2)); } case 'Crown': return Math.sin(a) < -0.15 && ((f * 9) % 1) < 0.34; default: return true; } };
    const r0 = R + Math.round(bs * 2.0), tol = (pat === 'Diamond') ? bs * 0.72 : bs * 0.55;
    const metric = (dx, dy) => { if (pat === 'Diamond') return Math.abs(dx) + Math.abs(dy); if (pat === 'Orbit') return Math.hypot(dx / 1.32, dy / 0.72); return Math.hypot(dx, dy); };
    const lerpHex = (h1, h2, u) => { const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16); const r = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * u), gg = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * u), bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * u); return '#' + ((1 << 24) + (r << 16) + (gg << 8) + bl).toString(16).slice(1); };
    const cellColor = (k, i) => { switch (fill) { case 'Beaded': return k % 2 === 0 ? WHITE : GOLD; case 'Banded': return i % 2 === 1 ? CREAM : GOLD; case 'Sparkle': return ((k * 7 + i * 13) % 9 === 0) ? WHITE : GOLD; case 'Tipped': return i >= rings - 1 ? WHITE : GOLD; case 'Gradient': return lerpHex('#ffd24a', '#e0a400', ((k * 7 + i * 3) % 5) / 4); case 'Radiant': return (k + i) % 2 === 0 ? WHITE : GOLD; default: return GOLD; } };
    // MARCH each ring by ANGLE (4x oversample) + 4-CONNECT (fill diagonal steps with an orthogonal cell) -> a visually SOLID ring, no corner-only gaps (fixes whales looking "broken/unfinished")
    const drawn = new Set();
    const put = (gx, gy, col, op) => { if (gx < 0 || gy < 0 || gx >= V7.GRID || gy >= V7.GRID) return; const key = gx * 1000 + gy; if (drawn.has(key)) return; drawn.add(key); const x = gx * bs, y = gy * bs; if (nearFace(x, y)) return; rasterRect(g, x, y, bs, bs, col, 0, op); };
    const os = rings >= 6 ? 2 : 4;   // adaptive crown oversample (gas 2026-07-19): dense 6-8 ring crowns -> 2× (rings overlap so NO visible gap, ~half the marching steps -> under the 50M cap); sparse <=5 -> 4× (isolated rings stay solid). Mirrors FacetsWhaleV7.
    for (let i = 0; i < rings; i++) {
      const rad = r0 + i * sp, op = Math.max(0.62, 1 - i * 0.08);   // SOLID gold ring (was ~0.50 = 0.80*glow); inner ring fully opaque, outer rings fade slightly
      const N = Math.max(8, Math.round(2 * Math.PI * rad / bs)), steps = N * os;
      let pgx = null, pgy = null;
      for (let s = 0; s <= steps; s++) {
        // ⚠️ 2026-08-03: k WAS `Math.round((s % steps) / steps * N) % N`. steps is exactly N*os, so that is
        // mathematically round(ss/os) — but in doubles `(15/208)*104` evaluates to 7.49999999999999911, not 7.5,
        // and Math.round hands back 7 where every exact form says 8. On a Radiant crown k picks white-or-gold, so
        // 12 cells of a 6-ring crown came out the opposite colour from the contract, which does the exact integer
        // round. Dividing by `os` (2 or 4, a power of two) is EXACT in binary floating point, so this form has no
        // boundary noise at all and no longer depends on how a JS engine happens to fold the expression.
        const a = (s % steps) / steps * 2 * Math.PI, k = Math.round((s % steps) / os) % N;
        if (!cellExists(k, N, i, a)) { pgx = null; continue; }
        const col = cellColor(k, i);
        const gx = Math.floor((CX + rad * Math.cos(a)) / bs), gy = Math.floor((CY + rad * Math.sin(a)) / bs);
        if (pgx !== null && gx !== pgx && gy !== pgy) put(pgx, gy, col, op);   // diagonal jump -> insert the corner cell so the ring is edge-connected
        put(gx, gy, col, op);
        pgx = gx; pgy = gy;
      }
    }
  }

  // ============================================================================================
  //  defaultsFor (port) — fills the FACE-engine keys; raw p keys (holdings/whale_*) preserved by merge
  // ============================================================================================
  function defaultsFor(params) {
    return {
      yaw: params.yaw || 0, pitch: params.pitch || 0, roll: params.roll || 0, pose_jitter: params.pose_jitter || 0,
      bg_variety: params.bg_variety || 0, bg_force_pattern: params.bg_force_pattern || null, bg_blocky: params.bg_blocky || false, bg_no_protect: params.bg_no_protect || false, bg_palette: params.bg_palette || null,
      medallion: params.medallion || false, medallion_ring: params.medallion_ring || null, medallion_outer: params.medallion_outer || null, medallion_pal: params.medallion_pal || null,
      bg_solid: params.bg_solid || false, scanlines: params.scanlines || null, contour_solid_bands: params.contour_solid_bands || 0,
      halo_clear_contour: params.halo_clear_contour || false,   // GHOST: push the halo clear of the contour band (see paintHalo). ⚠️ defaultsFor is a WHITELIST — a param missing from this list is silently dropped.
      gallery_frame: params.gallery_frame || false, floating_mat: params.floating_mat || false, mat_color: params.mat_color || null, _frame_pat: params._frame_pat || 'ramp', block_vol: params.block_vol || 0,
      fg: params.fg || '#efdfc8', bg: params.bg || '#0a0a0a', accent_color: params.accent_color || '#fcb913', block_size: params.block_size || 14,
      eye_size_extra: params.eye_size_extra || 0, brow_intensity: (params.brow_intensity != null) ? params.brow_intensity : 0.6, brow_shape: params.brow_shape || 'flat', mouth_intensity: (params.mouth_intensity != null) ? params.mouth_intensity : 0.7,
      mouth_style: params.mouth_style || null, mouth_shape: params.mouth_shape || null, mouth_w: params.mouth_w || 56, mouth_curve: params.mouth_curve || 0, mouth_asym: params.mouth_asym || 0, mouth_open: params.mouth_open || 0, mouth_open_band: params.mouth_open_band || 0,
      mouth_teeth_color: params.mouth_teeth_color || '#e8eef7', mouth_shadow: (params.mouth_shadow != null) ? params.mouth_shadow : 1.7,
      headpiece: params.headpiece || null, headpiece_finish: params.headpiece_finish || 'Solid', headpiece_color: params.headpiece_color || '#15151c', headpiece_color2: params.headpiece_color2 || null,
      chin_intensity: (params.chin_intensity != null) ? params.chin_intensity : 0.7, cheekbone_intensity: params.cheekbone_intensity || 0, forehead_intensity: (params.forehead_intensity != null) ? params.forehead_intensity : 0.4,
      // ⚠️ `|| 0.02` IS LOAD-BEARING — do NOT "fix" it to `?? 0.02`.
      // Collector/Newbie/Builder/Ghost arrive here with highlight_chance === 0, and `||` turns that into 0.02.
      // Those 2% cells are painted with accent_color = the OWNER colour, i.e. they ARE the per-facet "your wallet's
      // colour on the face" specks (verified: Collector's 5 purple #8a2be2 cells). Collector has NO owner/accent
      // blocks at all, so with a strict `??` it would lose every trace of owner colour on the face.
      // KEPT DELIBERATELY (user 2026-07-17). Effective rates: Collector/Newbie/Builder/Ghost 0.02, Degen 0.04, Whale 0.09, OG 0.13.
      shimmer: (params.shimmer != null) ? params.shimmer : 0.4, highlight_chance: params.highlight_chance || 0.02, aging_strength: params.aging_strength || 0,
      splatters: params.splatters || 0, splat_green: params.splat_green || 0, splat_red: (params.splat_red != null) ? params.splat_red : null, splat_gold: params.splat_gold || 0, splat_gold_varied: params.splat_gold_varied || false, splat_on_face: params.splat_on_face || false,
      face_splat: params.face_splat || null, pnl_veins: params.pnl_veins || null, cracks: params.cracks || null, crack_color: params.crack_color || null, crack_solid: params.crack_solid || false,
      ghost_outline: params.ghost_outline || null, veil_opacity: params.veil_opacity != null ? params.veil_opacity : 1,
      bg_deep: params.bg_deep || false, bg_deep_bands: params.bg_deep_bands || 12, bg_deep_oy: params.bg_deep_oy != null ? params.bg_deep_oy : 460, bg_deep_scheme: params.bg_deep_scheme || 'cohesive',
      spark_count: params.spark_count || 0, spark_colors: params.spark_colors || null, spark_gold: params.spark_gold || false, color_blocks: params.color_blocks || 0, echo_trails: params.echo_trails || 0, base_line: params.base_line || 0,
      halo_rings: params.halo_rings || 0, halo_budget: params.halo_budget != null ? params.halo_budget : null, geo_overlay: params.geo_overlay || 0, geo_outside: params.geo_outside || false, geo_color: params.geo_color || null, has_ens: !!params.has_ens, seed: params.seed || 1,
      eth_blocks: (params.eth_blocks != null) ? params.eth_blocks : -1, grain_n: params.grain_n || 0, grain_shape: params.grain_shape || 'hollow_square',
      halo_rainbow: !!params.halo_rainbow, halo_rot: params.halo_rot || 0, halo_op_mode: params.halo_op_mode || null, halo_col_mode: params.halo_col_mode || null,
      halo_palette: params.halo_palette || null,   // halo_shape + halo_crown_density/reach dropped 2026-07-29: the crown halo is retired, nothing reads them here.
      eye_fill_color: params.eye_fill_color || null, eye_fill2_color: params.eye_fill2_color || null, eye_style: params.eye_style || null, eye_calm: params.eye_calm || false, eye_x: params.eye_x || false, eye_laser: params.eye_laser || false, eye_pupil_color: params.eye_pupil_color || null, eye_mask: params.eye_mask || null, eye_mask_color: params.eye_mask_color || null, eye_mask_band: params.eye_mask_band || null,
      face_palette: params.face_palette || null, face_recolor: params.face_recolor || null, face_ramp: params.face_ramp || null, face_bg: params.face_bg || null, face_disperse: (params.face_disperse != null) ? params.face_disperse : null,
      ghost_outline_pal: params.ghost_outline_pal || null, ghost_outline_mode: params.ghost_outline_mode || null, ghost_outline_op: params.ghost_outline_op || null, ghost_outline_opacity: (params.ghost_outline_opacity != null) ? params.ghost_outline_opacity : null, ghost_outline_rot: params.ghost_outline_rot || 0,
      _no_bg: params._no_bg || false, gild_level: params.gild_level || 0, gild_min: (params.gild_min != null) ? params.gild_min : null,
      block_on_face: params.block_on_face || false, accent_blocks: params.accent_blocks || null, art_blocks: params.art_blocks || null, owner_blocks: params.owner_blocks || null, block_color: params.block_color || null, finish: params.finish || null,
      block_layout: params.block_layout || 'scatter', block_palette: params.block_palette || null, collection_wall: params.collection_wall || false, tile_outline: params.tile_outline || null,
      halo_opacity: (params.halo_opacity != null) ? params.halo_opacity : 1.0, tx_success_rate: (params.tx_success_rate != null) ? params.tx_success_rate : 1.0, gas_highlights: params.gas_highlights || 0, gas_subdivisions: params.gas_subdivisions || 0,
      render_mode: params.render_mode || 'standard', gray_pool: params.gray_pool || null, rgb_red: params.rgb_red || '#ff0000', rgb_green: params.rgb_green || '#00ff00', rgb_blue: params.rgb_blue || '#0000ff', rgb_offset: (params.rgb_offset != null) ? params.rgb_offset : 1, glitch_bars: params.glitch_bars || 0
    };
  }

  // ============================================================================================
  //  RLE -> SVG (on-chain shape)
  // ============================================================================================
  // Emit a full-canvas background rect first, then SKIP every run whose colour == bg (it shows through underneath).
  // Pixel-identical to drawing every cell, but big flat areas cost one rect instead of hundreds. Same trick BluePets
  // / Normies use. `bg` is the grid's init colour (newGrid(p.bg)); the Solidity port (FacetsGrid.rleSVG) is identical.
  // ── FILL GROUPING (2026-08-08) ────────────────────────────────────────────────────────────────
  // The runs of ONE colour are emitted inside `<g fill="#rrggbb">`, so the colour is written once
  // instead of once per rect. Measured −21% on the svg, and the tokenURI carries the svg TWICE.
  //
  // ⚠️ THIS REORDERS RECTS, and `svg_group_probe.cjs` measured that 961 of 1225 cells are painted
  // more than once — so free reordering WOULD change the art. What makes this safe is a proof, not a
  // measurement: the stacking is BETWEEN the three passes (bg / base / overlay), never inside one. A
  // row-scan partitions each row into CONSECUTIVE runs, so the rects of a single pass are pairwise
  // disjoint by construction and their order cannot matter. Each pass is therefore grouped on its
  // own and the passes keep their order. `group_proto.cjs` proves it per cell as well.
  //
  // ⚠️ A colour used by ONE run stays a plain rect. A group costs 22 bytes and saves 15 per rect, so
  // a group of one LOSES 7 — and keeping them plain makes "the grouped output is never larger than
  // the ungrouped one" a theorem, which is what keeps FacetsGrid.MAXOUT provably big enough.
  function _emitRuns(runs) {
    const order = [], by = new Map();
    for (const q of runs) { let a = by.get(q.f); if (!a) { a = []; by.set(q.f, a); order.push(q.f); } a.push(q); }
    let out = '';
    for (const f of order) {
      const a = by.get(f);
      if (a.length === 1) {
        const q = a[0];
        out += '<rect x="' + q.c + '" y="' + q.r + '" width="' + q.w + '" height="1" fill="' + f + '"' + (q.k ? ' class="' + q.k + '"' : '') + '/>';
        continue;
      }
      out += '<g fill="' + f + '">';
      for (const q of a) out += '<rect x="' + q.c + '" y="' + q.r + '" width="' + q.w + '" height="1"' + (q.k ? ' class="' + q.k + '"' : '') + '/>';
      out += '</g>';
    }
    return out;
  }

  function rleSVG(g, bg, style) {
    const G = V7.GRID;
    // With the tag layer off this is the original loop, character for character.
    // With it on, a run also has to break where the animation class changes, otherwise two
    // cells that move differently would share one rect.
    const base = [];
    for (let r = 0; r < G; r++) {
      let c = 0;
      while (c < G) {
        const col = g[idx(c, r)], tg = TAG ? TAG[idx(c, r)] : 0;
        let run = 1;
        while (c + run < G && g[idx(c + run, r)] === col && (TAG ? TAG[idx(c + run, r)] : 0) === tg) run++;
        if (col !== bg || tg) base.push({ c: c, r: r, w: run, f: col, k: tg || 0 });
        c += run;
      }
    }
    let body = _emitRuns(base);
    // LIT layer, emitted AFTER the base so it sits on top. Same RLE, keyed on colour + class.
    if (OVR) {
      const ov = [];
      for (let r = 0; r < G; r++) {
        let c = 0;
        while (c < G) {
          const o = OVR[idx(c, r)];
          if (!o) { c++; continue; }
          let run = 1;
          while (c + run < G) { const q = OVR[idx(c + run, r)]; if (!q || q.c !== o.c || q.k !== o.k) break; run++; }
          ov.push({ c: c, r: r, w: run, f: o.c, k: o.k });
          c += run;
        }
      }
      body += _emitRuns(ov);
    }
    return '<svg viewBox="0 0 ' + G + ' ' + G + '" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">' + (style || '') + '<rect width="' + G + '" height="' + G + '" fill="' + bg + '"/>' + body + '</svg>';
  }

  // ============================================================================================
  //  RENDER
  // ============================================================================================
  // NEW eye/mouth trait pieces (from window.FACET_EYES / FACET_MOUTHS), pose-shifted by the anchor offset
  // from neutral (getAnchors(0,0)) and drawn ON the face; the default eyes/mouth are suppressed elsewhere.
  // Crisp block ICONS for star/heart/dollar eyes (a real pixel shape, not the mushy formula). One per eye.
  const _EYE_ICON = {   // [dc, dr] uses fill+top-lit shade; [dc, dr, colour] is explicit (shiny multi-tone)
    star: [   // 4-point SPARKLE: shiny multi-tone gold PLUS + dark corner notches (the sparkle)
      [0,-2,'#ffe066'],[0,-1,'#ffdc4a'],[0,0,'#fff4b0'],[0,1,'#e8b62e'],[0,2,'#d59a1e'],
      [-2,0,'#dfa526'],[-1,0,'#ffd24a'],[1,0,'#ffd84a'],[2,0,'#dfa526'],
      [-1,-1,'#141418'],[1,-1,'#141418'],[-1,1,'#141418'],[1,1,'#141418']
    ],
    heart: [   // shiny + MIXED tones (bright highlight cluster, scattered mids/darks) — not a flat gradient
      [-1,-2,'#ff9db0'],[1,-2,'#ff5e7d'],
      [-2,-1,'#e6455f'],[-1,-1,'#ffc2ce'],[0,-1,'#ff5e7d'],[1,-1,'#ff7a92'],[2,-1,'#d33950'],
      [-2,0,'#d02a48'],[-1,0,'#ff6b86'],[0,0,'#ffd6de'],[1,0,'#e63b5a'],[2,0,'#c02545'],
      [-1,1,'#e0405a'],[0,1,'#ff5e7d'],[1,1,'#c8283f'],
      [0,2,'#a81c38']
    ],
    dollar: [   // cleaner $ : vertical bar (shiny) + S-curve, richer green, + facet-dark cap block top & bottom
      [0,-2,'#2ee86a'],[0,-1,'#1fd857'],[0,0,'#4dfa88'],[0,1,'#14bd48'],[0,2,'#0e9e38'],
      [-1,-2,'#20c84f'],[1,-2,'#20c84f'],[-1,-1,'#16d34c'],[-1,0,'#16d34c'],[1,0,'#16d34c'],[1,1,'#14bd48'],[-1,2,'#12b845'],[1,2,'#12b845'],
      [0,-3,'#1fd857'],[0,3,'#12b845']
    ]
  };
  function paintEyeIcons(g, p, anchors) {
    const st = p.eye_style; if (!_EYE_ICON[st] || p.eye_piece || p.combo_piece) return;
    const CE = CELL, col = p.eye_fill_color || '#ffd24a', shp = _EYE_ICON[st];
    const hx = s => { s = '' + s; if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; const m = s.match(/\d+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; };
    const _bg = hx(p.bg || '#0a0a1e'), _fg = hx(p.fg || '#888888'), _base = (_bg[0] + _bg[1] + _bg[2] < _fg[0] + _fg[1] + _fg[2]) ? _bg : _fg;   // facet dark tone
    const fdark = (c, r) => { const n = (((c * 7 + r * 13) % 5) - 2) * 0.03, f = Math.max(0.09, 0.3 + n); return 'rgb(' + ((_base[0] * f) | 0) + ',' + ((_base[1] * f) | 0) + ',' + ((_base[2] * f) | 0) + ')'; };
    [anchors.eyeL, anchors.eyeR].forEach(a => { const ecx = Math.round(a[0] / CE), ecy = Math.round(a[1] / CE);
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const c = ecx + dc, r = ecy + dr; if (c < 0 || c >= V7.GRID || r < 0 || r >= V7.GRID) continue; const cur = g[idx(c, r)]; if (!cur) continue; recess(g, c, r, st === 'dollar' ? 0.62 : 0.90); }   // DEPTH recess behind the icon (Dollar needs it — it blends into Newbie's greens). 2026-07-25 (user): heart + star shadow cut way back (0.90 = barely there).
      shp.forEach(t => { const c = ecx + t[0], r = ecy + t[1], v = t[2] === 'FDARK' ? fdark(c, r) : (t[2] || shadeHex(col, -t[1] * 0.06)); setCell(g, c, r, v); }); });
  }
  // 2026-08-03 (user): BASELINE LIFT. Every shape was authored against the same anchor row but with its own dr
  // offsets, so Smile sat 1.5 rows above Gold Grill and the low ones read as "sitting on the chin". This table
  // moves the WHOLE shape (its depth recess included, since the recess is drawn off mcy too) instead of editing
  // each cell, which is why the shadow keeps tracking the mouth.
  // cigar was -2 on 2026-08-03 and came back to -1 the same day: at -2 it collided with the tall eye traits
  // (Cyclops and friends) and the two features ate each other. -1 keeps it off the chin without reaching the eyes.
  const _MSHIFT = { stoic: -1, gm: -1, grin: -1, gritted: -1, grill: -2, cigar: -1 };
  // EXPLICIT block MOUTHS — bigger + distinct + facet-tonal. Replaces the tiny, near-identical field mouths.
  function paintMouth(g, p, anchors) {
    const sh = p.mouth_shape; if (!sh || p.combo_piece || p.mouth_piece) return;   // a mouth PIECE replaces the mouth -> no engine mouth on top
    const CE = CELL;
    const hx = s => { s = '' + s; if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; const m = s.match(/\d+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; };
    const bg = hx(p.bg || '#0a0a1e'), fg = hx(p.fg || '#888888'), base = (bg[0] + bg[1] + bg[2] < fg[0] + fg[1] + fg[2]) ? bg : fg;
    const mcx = Math.floor(anchors.mouth[0] / CE), mcy = Math.round((anchors.mouth[1] - 34) / CE + (p.pitch || 0) * 0.08) + (_MSHIFT[sh] || 0);   // floor = the cell the mouth sits in; + pitch nudge so the mouth visibly tracks pitch on the coarse grid (2026-07-24 user: it wasn't moving over pitch 0-10); + _MSHIFT = the 2026-08-03 baseline lift
    const sf = Math.max(0.4, 1 - Math.abs(anchors.yaw || 0) * 0.85);   // STRONG horizontal foreshortening: mouth clearly deforms / loses width on turns
    const SX = dc => mcx + Math.round(dc * sf);
    const P = { WT: ['#f4f7fb', '#e2e8f0', '#ecf1f7', '#d6dde8', '#f8fafc'], LT: ['#b9b0b4', '#cac2c5', '#aea6aa', '#c2babe'], PK: ['#ff5a7a', '#e6415f', '#ff7a92', '#d0324c', '#ff89a0'], GD: ['#fcd34a', '#e0a828', '#ffe066', '#d9971e', '#f2c235'], BR: ['#6b4a2a', '#523720', '#7d5836', '#463018'], BL: ['#a9def0', '#7cc8ff', '#c8e8ff', '#5ab0f5'], SM: ['#9aa0a8', '#b4bac2', '#868c94'] };
    if (p._forge_pal && p._forge_pal.length) {   // FORGE tam uyum: mouth accent colours (pink tongue/kiss, gold grill, brown cigar, blue drool) -> curated palette tones. Base tokens skip this (no _forge_pal) -> byte-identical.
      const _fp = p._forge_pal.filter(c => c && c[0] === '#'), _L = c => { const n = parseInt(c.slice(1), 16); return (n >> 16 & 255) + (n >> 8 & 255) + (n & 255); };
      const _bl = _fp.slice().sort((a, b) => _L(a) - _L(b)), _dk = _bl[0], _lt = _bl[_bl.length - 1], _md = _bl[(_bl.length - 1) >> 1];
      P.PK = [_md, _lt, _md]; P.LT = [_lt, _md];   // generic pink lip/tongue -> palette (tam uyum). GD(gold grill)/BR(cigar)/BL(drool) KEPT = accessory trait identity preserved, like eye pieces. WT teeth stay light.
    }
    const pick = (a, c, r) => a[(((c * 3 + r) % a.length) + a.length) % a.length];
    const idc = (function () { const st = c => { const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx ? (mx - mn) / mx : 0; }; return st(bg) > st(fg) + 0.08 ? bg : fg; })();   // the facet's SATURATED signature colour (Collector=blue bg, Newbie=green fg, BUILDER=red, Whale=gold...) — like the eyes harmonise
    const _warm = (function () { const mx = Math.max(idc[0], idc[1], idc[2]); return mx ? Math.max(0, (mx - idc[2]) / mx) : 0; })();   // warmth = how little blue (Artist red / gold = warm ~1, Collector navy = cool ~0)
    const baseF = Math.min(0.5, (90 - _warm * _warm * 58) / (idc[0] + idc[1] + idc[2] || 1));   // WARM mouths darken toward black (Artist red brt~32, gold~40) so they don't blend into a warm face; COOL (navy) stays ~90. Green mostly kept.
    const dark = (dc, dr) => { const c = SX(dc), r = mcy + dr, f = baseF * (0.7 + (((c * 13 + r * 7) % 6) / 6) * 0.6); setCell(g, c, r, 'rgb(' + ((idc[0] * f) | 0) + ',' + ((idc[1] * f) | 0) + ',' + ((idc[2] * f) | 0) + ')'); };   // facet signature colour at the normalized dark tone + per-cell tonal (koyu<->açık) — matches the eye sockets & pieces
    const white = (dc, dr) => setCell(g, SX(dc), mcy + dr, pick(P.WT, SX(dc), mcy + dr));   // teeth
    const lite = (dc, dr) => setCell(g, SX(dc), mcy + dr, pick(P.LT, SX(dc), mcy + dr));   // light lip highlight
    const pk = (dc, dr) => setCell(g, SX(dc), mcy + dr, pick(P.PK, SX(dc), mcy + dr));   // pink (tongue/kiss)
    const gd = (dc, dr) => setCell(g, SX(dc), mcy + dr, pick(P.GD, SX(dc), mcy + dr));   // gold
    const br = (dc, dr) => setCell(g, SX(dc), mcy + dr, pick(P.BR, SX(dc), mcy + dr));   // brown (cigar)
    const bl = (dc, dr) => setCell(g, SX(dc), mcy + dr, pick(P.BL, SX(dc), mcy + dr));   // drool blue
    const sm = (dc, dr) => setCell(g, SX(dc), mcy + dr, pick(P.SM, SX(dc), mcy + dr));   // smoke grey
    const put = (dc, dr, col) => setCell(g, SX(dc), mcy + dr, col);
    const fdark = k => 'rgb(' + ((idc[0] * baseF * k) | 0) + ',' + ((idc[1] * baseF * k) | 0) + ',' + ((idc[2] * baseF * k) | 0) + ')';   // ONE clean tone at the normalized base (k relative to baseF)
    const solidCol = fdark(1), solid = (dc, dr) => setCell(g, SX(dc), mcy + dr, solidCol);   // clean single tone for SIMPLE mouths, at the UNIFIED normalized facet tone (same as eyes)
    // DEPTH BEHIND: graded facet recess — ONLY for big/tonal mouths. Simple/solid mouths skip it (the graded fade = the "opaklaşma" the user wants gone).
    if (['grin', 'gritted', 'grill', 'feral', 'drool', 'cigar'].includes(sh)) for (let dr = -1; dr <= 3; dr++) for (let dc = -4; dc <= 4; dc++) {
      const t = Math.hypot(dc / 3.8, (dr - 1) / 2.6); if (t > 1) continue;
      const c = SX(dc), r = mcy + dr; if (c < 0 || c >= V7.GRID || r < 0 || r >= V7.GRID) continue;
      recess(g, c, r, 0.87 + 0.10 * t);
    }
    if (sh === 'stoic') { for (let c = -2; c <= 2; c++) setCell(g, SX(c), mcy, solidCol); }   // straight line: ONE solid tone everywhere, no end darkening (no opacity variation). 2026-08-03 (user): 5 wide (was 7) — one block off each end, the flat line read far too long on the 35-grid
    else if (sh === 'gm') { solid(-3, -1); solid(-2, 0); solid(-1, 0); solid(0, 0); solid(1, 0); solid(2, 0); solid(3, -1); }   // ⌣ smile: full bottom row + upturned corners (studio design)
    else if (sh === 'smile') { [[-3,-2],[-2,-2],[-1,-2],[0,-2],[1,-2],[2,-2],[3,-2],[-3,-1],[3,-1],[-2,0],[-1,0],[0,0],[1,0],[2,0]].forEach(([dc,dr]) => solid(dc,dr)); [[-2,-1],[-1,-1],[0,-1],[1,-1],[2,-1]].forEach(([dc,dr]) => white(dc,dr)); }   // 2026-07-24 (user): a touch smaller — dropped the two widest upper tips [-4,-3]/[4,-3]. facet-tone lip outline + dimples, white teeth band
    else if (sh === 'grin') { for (let c = -3; c <= 3; c++) { dark(c, -1); white(c, 0); lite(c, 1); } }   // big mouth keeps facet tonal depth
    else if (sh === 'frown') { solid(-1, -1); solid(0, -1); solid(1, -1); solid(-2, 0); solid(2, 0); }   // clean single tone
    else if (sh === 'surprised') { solid(0, -1); solid(1, -1); solid(0, 0); solid(1, 0); }   // 2x2 "O", 1 up + 1 right, clean tone
    else if (sh === 'gritted') { for (let c = -3; c <= 3; c++) { dark(c, -1); white(c, 0); } solid(-2, 0); solid(0, 0); solid(2, 0); }   // 2026-07-24 (user): dropped the bottom lip row (dark(c,1)); dark upper lip over white teeth + 3 facet-dark separators
    else if (sh === 'tongue') { for (let c = -1; c <= 1; c++) solid(c, -1); for (let r = 0; r <= 2; r++) for (let c = -1; c <= 1; c++) pk(c, r); }   // small mouth + 3x3 tongue
    else if (sh === 'grill') { for (let c = -2; c <= 2; c++) { solid(c, 0); gd(c, 1); } }   // dark top row + gold bottom row. 2026-07-19 (user): 5 wide (was 7) -> drop the outer column each side, 5x2=10 blocks, centred.
    else if (sh === 'feral') { for (let dr = -1; dr <= 2; dr++) for (let dc = -3; dc <= 3; dc++) if (Math.hypot(dc / 3.2, (dr - 0.5) / 2.2) < 1) dark(dc, dr); white(-2, -1); white(0, -1); white(2, -1); white(-2, 2); white(0, 2); white(2, 2); for (let c = -1; c <= 1; c++) pk(c, 1); }   // SMALLER maw
    else if (sh === 'cigar') { dark(-3, 0); dark(-2, 0); for (let c = -1; c <= 3; c++) br(c, 0); put(4, 0, '#ff6a1a'); put(4, -1, '#ffb020'); sm(4, -2); sm(5, -3); sm(5, -4); }
    else if (sh === 'kiss') { put(0, 0, '#ff6d8a'); put(0, 1, '#e6415f'); }   // ONLY 2 pink blocks, stacked
    else if (sh === 'fangs') { for (let c = -3; c <= 3; c++) solid(c, 0); white(-2, 1); white(-2, 2); white(-2, 3); white(2, 1); white(2, 2); white(2, 3); }   // solid lip (less variation) + long fangs
    else if (sh === 'drool') { for (let c = -2; c <= 1; c++) dark(c, 0); bl(1, 1); bl(2, 1); bl(2, 2); bl(2, 3); bl(-2, 1); bl(-2, 2); }
  }
  // CLOSED eyes = two SIMPLE facet-dark bars (shut). Explicit + tone-varied (dark<->light blocks, not flat).
  function paintClosedEyes(g, p, anchors) {
    if (p.eye_style !== 'closed' || p.eye_piece || p.combo_piece) return;
    const CE = CELL;
    const hx = s => { s = '' + s; if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; const m = s.match(/\d+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; };
    const bg = hx(p.bg || '#0a0a1e'), fg = hx(p.fg || '#888888');
    const st = c => { const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx ? (mx - mn) / mx : 0; };
    const eyeD = (bg[0] + bg[1] + bg[2]) <= (fg[0] + fg[1] + fg[2]) ? bg : fg, baseF = Math.min(0.5, 90 / (eyeD[0] + eyeD[1] + eyeD[2] || 1));   // EYES use the DARKER of bg/fg -> near-black on saturated-face facets (Builder/Newbie/Whale), never blends into the face
    const dk = (c, r) => { const f = baseF * (0.7 + (((c * 13 + r * 7) % 6) / 6) * 0.6); return 'rgb(' + ((eyeD[0] * f) | 0) + ',' + ((eyeD[1] * f) | 0) + ',' + ((eyeD[2] * f) | 0) + ')'; };
    const BAR = [[-2, 1], [-1, 0], [0, 0], [1, 0], [2, 1]];   // 2026-07-24 (user): clean SHUT line = 5 blocks/eye, the two OUTER end blocks sit 1 lower (relaxed lid). 5 left + 5 right.
    [anchors.eyeL, anchors.eyeR].forEach(a => { const ecx = Math.round(a[0] / CE), ecy = Math.round(a[1] / CE);   // each eye at ITS OWN centre (anatomically correct at yaw+pitch). NOTHING behind the bar — 2026-07-25 (user): no socket/recess layer, JUST the shut line. The bar's own centre block covers the eyeball, so no pupil can show.
      BAR.forEach(([dc, dr]) => setCell(g, ecx + dc, ecy + dr, dk(ecx + dc, ecy + dr))); });
  }
  // CALM eyes = explicit 2x2 facet-toned iris block per eye (studio design), inset in a subtle recess for depth. Replaces the field socket.
  function paintCalm(g, p, anchors) {
    if (!p.eye_calm || p.eye_piece || p.combo_piece) return;
    const CE = CELL;
    const hx = s => { s = '' + s; if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; const m = s.match(/\d+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; };
    const bg = hx(p.bg || '#0a0a1e'), fg = hx(p.fg || '#888888');
    const st = c => { const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx ? (mx - mn) / mx : 0; };
    const eyeD = (bg[0] + bg[1] + bg[2]) <= (fg[0] + fg[1] + fg[2]) ? bg : fg, baseF = Math.min(0.5, 90 / (eyeD[0] + eyeD[1] + eyeD[2] || 1));   // EYES use the DARKER of bg/fg -> near-black on saturated-face facets, never blends into the face
    const tone = (c, r) => { const f = baseF * (0.7 + (((c * 13 + r * 7) % 6) / 6) * 0.6); return 'rgb(' + ((eyeD[0] * f) | 0) + ',' + ((eyeD[1] * f) | 0) + ',' + ((eyeD[2] * f) | 0) + ')'; };
    const BLOCK = [[-1, -2], [0, -2], [-1, -1], [0, -1]];   // 2x2 iris block (studio coords: cols 16-17 / 23-24, rows 19-20)
    const RECESS = [[-2, -2], [-2, -1], [1, -2], [1, -1], [-1, 0], [0, 0]];   // socket ring around the block (left, right, bottom) -> inset depth
    [anchors.eyeL, anchors.eyeR].forEach(a => { const ecx = Math.round(a[0] / CE), ecy = Math.round(a[1] / CE);
      RECESS.forEach(([dc, dr]) => { const c = ecx + dc, r = ecy + dr; if (c < 0 || c >= V7.GRID || r < 0 || r >= V7.GRID) return; const cur = g[idx(c, r)]; if (!cur) return; recess(g, c, r, 0.8); });
      BLOCK.forEach(([dc, dr]) => setCell(g, ecx + dc, ecy + dr, tone(ecx + dc, ecy + dr))); });
  }
  // X EYES = a facet-toned ✕ (diagonal cross) per eye (studio design), centred on the grid centre (symmetric L/R). Explicit + pose-tracked.
  function paintXEyes(g, p, anchors) {
    if (!p.eye_x || p.eye_piece || p.combo_piece) return;
    const CE = CELL;
    const hx = s => { s = '' + s; if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; const m = s.match(/\d+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; };
    const bg = hx(p.bg || '#0a0a1e'), fg = hx(p.fg || '#888888');
    const st = c => { const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx ? (mx - mn) / mx : 0; };
    const eyeD = (bg[0] + bg[1] + bg[2]) <= (fg[0] + fg[1] + fg[2]) ? bg : fg, baseF = Math.min(0.5, 90 / (eyeD[0] + eyeD[1] + eyeD[2] || 1));   // EYES use the DARKER of bg/fg -> never blends into a saturated face (Builder etc.)
    const tone = (c, r) => { const f = baseF * (0.7 + (((c * 13 + r * 7) % 6) / 6) * 0.6); return 'rgb(' + ((eyeD[0] * f) | 0) + ',' + ((eyeD[1] * f) | 0) + ',' + ((eyeD[2] * f) | 0) + ')'; };
    const XD = [[-1, -1], [0, 0], [1, 1], [-1, 1], [1, -1]];   // 3x3 ✕ = 5 cells (outer ±2 tips removed)
    const drawEye = (a, cxOff) => { const px = Math.round(a[0] / CE) + cxOff, py = Math.round(a[1] / CE) - 1;   // centres: left (16,20), right (24,20) -> symmetric on grid centre 20
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const c = px + dc, r = py + dr; if (c < 0 || c >= V7.GRID || r < 0 || r >= V7.GRID) continue; const cur = g[idx(c, r)]; if (!cur) continue; recess(g, c, r, 0.72); }   // recess behind: darken the 3x3 so the ✕ gaps read as socket depth, not bright face poke-through
      XD.forEach(([dc, dr]) => setCell(g, px + dc, py + dr, tone(px + dc, py + dr))); };
    drawEye(anchors.eyeL, -1); drawEye(anchors.eyeR, 0);
  }
  // LASER eyes = a glowing red 2x2 SQUARE per eye (explicit + pose-invariant, ALWAYS red so the rarest eye stands out on every facet)
  function paintLaser(g, p, anchors) {
    if (!p.eye_laser || p.eye_piece || p.combo_piece) return;
    const CE = CELL;
    const hx = s => { s = '' + s; if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; const m = s.match(/\d+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; };
    const LASER = ['#ff2436', '#ff0a24', '#d81028', '#ff4055'];   // pure RGB-RED tones (no orange) so the rarest eye pops
    const BLOCK = [[-1, -2], [0, -2], [-1, -1], [0, -1]];   // 2x2 square = 4 blocks/eye (same anchor as Calm)
    const RECESS = [[-2, -2], [-2, -1], [1, -2], [1, -1], [-1, 0], [0, 0]];   // dark socket behind, for depth
    [anchors.eyeL, anchors.eyeR].forEach(a => { const ecx = Math.round(a[0] / CE), ecy = Math.round(a[1] / CE);
      RECESS.forEach(([dc, dr]) => { const c = ecx + dc, r = ecy + dr; if (c < 0 || c >= V7.GRID || r < 0 || r >= V7.GRID) return; const cur = g[idx(c, r)]; if (!cur) return; recess(g, c, r, 0.6); });
      BLOCK.forEach(([dc, dr]) => setCell(g, ecx + dc, ecy + dr, LASER[(((ecx + dc) * 3 + (ecy + dr)) % LASER.length + LASER.length) % LASER.length])); });
  }
  // SPIRAL eyes = 2 white diagonal blocks per eye (4 total) over the dark field socket = "hypnotised" hint (2026-07-24 user). Depth from the socket (like Iris Blue); nothing drawn outside the 4 white blocks; pose-stable.
  function paintSpiral(g, p, anchors) {
    if (p.eye_style !== 'spiral' || p.eye_piece || p.combo_piece) return;
    const CE = CELL, WH = [[0, -1], [1, 0]];   // 2 white blocks TOUCHING diagonally (no gap) per eye -> spiral read (2026-07-24 user: "dip dibe")
    [anchors.eyeL, anchors.eyeR].forEach(a => { const ecx = Math.round(a[0] / CE), ecy = Math.round(a[1] / CE);
      WH.forEach(([dc, dr]) => setCell(g, ecx + dc, ecy + dr, '#eef2f8')); });
  }
  // Explicit BOLD eyebrow cells for shaped expressions — the field brow is too faint to read on the 41-grid.
  function paintBrows(g, p, anchors) {
    const sh = p.brow_shape; if ((sh !== 'sad' && sh !== 'skeptical' && sh !== 'sharp') || p.eye_piece || p.combo_piece) return;
    const CE = CELL;
    // FACET colour harmony: brow uses the facet's own darkest tone (darker of bg/fg), deepened + per-cell tonal — auto-integrated
    const hx = s => { s = '' + s; if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; const m = s.match(/\d+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; };
    const _bg = hx(p.bg || '#0a0a1e'), _fg = hx(p.fg || '#888888'), _base = (_bg[0] + _bg[1] + _bg[2] <= _fg[0] + _fg[1] + _fg[2]) ? _bg : _fg;
    const baseF = Math.min(0.5, 90 / (_base[0] + _base[1] + _base[2] || 1));   // 2026-07-24 (user): brows now use the SAME normalized eye tone as Calm/Closed/iris sockets -> brow harmonises with the eye interior (no more pitch-black-brow vs lighter-eye clash)
    const put = (c, r) => { const f = baseF * (0.7 + (((c * 13 + r * 7) % 6) / 6) * 0.6); setCell(g, c, r, 'rgb(' + ((_base[0] * f) | 0) + ',' + ((_base[1] * f) | 0) + ',' + ((_base[2] * f) | 0) + ')'); };
    const elc = Math.round(anchors.eyeL[0] / CE), erc = Math.round(anchors.eyeR[0] / CE);
    const bL = Math.round(anchors.eyeL[1] / CE) - 2, bR = Math.round(anchors.eyeR[1] / CE) - 2;   // each brow tracks ITS OWN eye's row -> correct at every pose (not a shared average)
    if (sh === 'sharp') {                     // ANGRY angled brows: inner LOW (V pressing toward the nose) — piercing, NOT a flat line
      put(elc - 2, bL - 1); put(elc - 1, bL - 1); put(elc, bL); put(elc + 1, bL + 1); put(elc + 2, bL + 1);   // left: outer HIGH -> inner LOW
      put(erc + 2, bR - 1); put(erc + 1, bR - 1); put(erc, bR); put(erc - 1, bR + 1); put(erc - 2, bR + 1);   // right: outer HIGH -> inner LOW
    } else if (sh === 'sad') {                // worried: both inner ends HIGH ("⌒")
      put(elc - 2, bL + 1); put(elc - 1, bL); put(elc, bL); put(elc + 1, bL - 1); put(elc + 2, bL - 1);
      put(erc + 2, bR + 1); put(erc + 1, bR); put(erc, bR); put(erc - 1, bR - 1); put(erc - 2, bR - 1);
    } else {                                  // skeptical -> RIGHT brow RAISED + angled up, LEFT flat lower
      put(elc - 1, bL + 1); put(elc, bL + 1); put(elc + 1, bL + 1);                                          // left: flat, lower
      put(erc - 1, bR - 1); put(erc, bR - 1); put(erc + 1, bR - 2); put(erc + 2, bR - 2);                     // right: raised, tilts up-outward
    }
  }
  function paintTraitPieces(g, p, anchors) {
    const CE = CELL, N0 = getAnchors(0, 0), CELL41 = V7.S / 41;   // PIECES authored in 41-grid coords; neutral reference uses CELL41 so authored cells remap onto the current grid (fixes down/right shift + mouths sinking to the bottom at 35)
    const hx = s => { s = '' + s; if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; const m = s.match(/\d+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; };
    const _bg = hx(p.bg || '#0a0a1e'), _fg = hx(p.fg || '#8a8aff');
    const _st = c => { const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx ? (mx - mn) / mx : 0; };
    const _sig = _st(_bg) > _st(_fg) + 0.08 ? _bg : _fg;   // MOUTH pieces: the facet's SATURATED signature colour (matches paintMouth)
    const _eyeD = (_bg[0] + _bg[1] + _bg[2]) <= (_fg[0] + _fg[1] + _fg[2]) ? _bg : _fg;   // EYE pieces: DARKER of bg/fg -> near-black on saturated-face facets, never blends
    const _bf = base => Math.min(0.5, 90 / (base[0] + base[1] + base[2] || 1));   // normalized DARK target (~90 brt)
    const resolve = (col, c, r, base) => { if (col !== 'FDARK') return col; const b = base || _sig, f = _bf(b) * (0.7 + (((c * 13 + r * 7) % 6) / 6) * 0.6); return 'rgb(' + ((b[0] * f) | 0) + ',' + ((b[1] * f) | 0) + ',' + ((b[2] * f) | 0) + ')'; };   // FDARK -> tonal facet blocks; eyes pass _eyeD, mouths default to _sig
    if (p.eye_piece && window.FACET_EYES) {
      const nx = (N0.eyeL[0] + N0.eyeR[0]) / 2, ny = (N0.eyeL[1] + N0.eyeR[1]) / 2;
      const ex = (anchors.eyeL[0] + anchors.eyeR[0]) / 2, ey = (anchors.eyeL[1] + anchors.eyeR[1]) / 2;
      const dc = Math.round(ex / CE) - Math.round(nx / CELL41), dr = Math.round(ey / CE) - Math.round(ny / CELL41);   // track the face's cell crossings (no lag); CELL41 remaps the 41-authored neutral onto the current grid
      // PER-EYE pose correction (2026-07-25 user: "soldaki göz facetsten çıkmış"): at yaw/pitch the two eyes move by
      // DIFFERENT amounts, so one shared offset drags an eye off the face. Applied ONLY to two-separate-eye designs —
      // spanning frames (glasses / visor / eyepatch) must stay rigid or the bridge tears. It is 0 at neutral -> no regression.
      const perEye = !!(window.FACET_EYES.perEyeOf && window.FACET_EYES.perEyeOf(p.eye_piece));
      let cdcL = 0, cdrL = 0, cdcR = 0, cdrR = 0;
      if (perEye) {
        const dxL = anchors.eyeL[0] - N0.eyeL[0], dyL = anchors.eyeL[1] - N0.eyeL[1];
        const dxR = anchors.eyeR[0] - N0.eyeR[0], dyR = anchors.eyeR[1] - N0.eyeR[1];
        const dxA = (dxL + dxR) / 2, dyA = (dyL + dyR) / 2;
        cdcL = Math.round(dxL / CE) - Math.round(dxA / CE); cdrL = Math.round(dyL / CE) - Math.round(dyA / CE);
        cdcR = Math.round(dxR / CE) - Math.round(dxA / CE); cdrR = Math.round(dyR / CE) - Math.round(dyA / CE);
      }
      const clip = window.FACET_EYES.clipOf && window.FACET_EYES.clipOf(p.eye_piece);   // Eyepatch: clip straps to the head edge
      if (window.FACET_EYES.socketOf && window.FACET_EYES.socketOf(p.eye_piece)) {   // DEPTH: light, partial 1-row shadow just under each eye (subtle lower-lid hint, not a dark disc)
        [anchors.eyeL, anchors.eyeR].forEach(a => { const ec = Math.round(a[0] / CE), er = Math.round(a[1] / CE) + 1;
          for (let dcx = -1; dcx <= 1; dcx++) { const c = ec + dcx; if (((c + er) & 1) === 0) continue;   // partial: only ~half the cells -> soft, dappled
            if (c < 0 || c >= V7.GRID || er < 0 || er >= V7.GRID) continue; recess(g, c, er, 0.78); } });
      }
      if (window.FACET_EYES.deepSocketOf && window.FACET_EYES.deepSocketOf(p.eye_piece)) {   // subtle recess RING around the eye (Iris-like depth for masks e.g. Kohl)
        const RS = CE * 2.2;
        [anchors.eyeL, anchors.eyeR].forEach(a => { for (let r = 0; r < V7.GRID; r++) for (let c = 0; c < V7.GRID; c++) {
          const d = Math.hypot((c + 0.5) * CE - a[0], (r + 0.5) * CE - a[1]); if (d > RS || d < CE * 1.05) continue;   // ring only (piece covers the centre)
          recess(g, c, r, 0.72 + 0.14 * (d / RS));
        } });
      }
      const cells = window.FACET_EYES.cells(p.eye_piece);
      if (window.FACET_EYES.shadowOf && window.FACET_EYES.shadowOf(p.eye_piece)) {   // glasses: light, partial 1-row shadow just below the frame (subtle, not a solid band)
        const rs = cells.map(x => x[1] + dr), cs = cells.map(x => x[0] + dc), r = Math.max(...rs) + 1, mnc = Math.min(...cs), mxc = Math.max(...cs);
        for (let c = mnc; c <= mxc; c++) { if (((c + r) & 1) === 0) continue; if (c < 0 || c >= V7.GRID || r < 0 || r >= V7.GRID) continue; recess(g, c, r, 0.78); }
      }
      for (let i = 0; i < cells.length; i++) {
        const _s = perEye ? (cells[i][0] < 20 ? -1 : (cells[i][0] > 20 ? 1 : 0)) : 0;   // 41-authored midline = col 20; left half tracks eyeL, right half tracks eyeR
        const cc = cells[i][0] + dc + (_s < 0 ? cdcL : _s > 0 ? cdcR : 0), rr = cells[i][1] + dr + (_s < 0 ? cdrL : _s > 0 ? cdrR : 0);
        if (clip && Math.hypot((cc + 0.5) * CE - CX, (rr + 0.5) * CE - CY) > R) continue;   // touch the head edge, never outside (per pose)
        const _pc = resolve(cells[i][2], cc, rr, _eyeD);
        setCell(g, cc, rr, _pc);
        // RAINBOW SHADES: a gleam crossing the lenses. Rows 20-21 in authored space are the two rainbow rows;
        // the white frame is skipped so the glasses keep their outline while the light travels over the glass.
        // a real gleam on glass is WHITE, not a brighter version of the glass. Lifting the rainbow by .85 was
        // invisible; this pushes each lens cell to near-white for the moment the band is over it.
        if (TAG && p._animShade && cells[i][1] >= 20 && cells[i][1] <= 21) ovrSet(cc, rr, _lift(_pc, 2.2), p._animShade(cells[i][0]));
      }
      // ── CROSS-EYED, the pupils look left then right (2026-08-03, gruff) ────────────────────────
      // The engine cannot MOVE a cell — it only animates opacity. So the two looks are drawn as two
      // overlay sets on top of the piece, each visible for half the cycle:
      //   phase A: cover the LEFT eye's pupil, draw one two cells out  -> both pupils sit left
      //   phase B: cover the RIGHT eye's pupil, draw one two cells out -> both pupils sit right
      // The static image keeps the crossed look, untouched. Authored coords (41-space, same as the
      // piece): left pupil 17,20 with white out to 15 · right pupil 23,20 with white out to 25.
      if (TAG && p._animXeye && p.eye_piece === 'Cross-eyed') {
        const W = '#e6ecf5';                                    // the white the piece itself paints
        const at = (ac, ar, side) => [ac + dc + (side < 0 ? cdcL : cdcR), ar + dr + (side < 0 ? cdrL : cdrR)];
        const dark = (c, r) => resolve('FDARK', c, r, _eyeD);
        const [lpc, lpr] = at(17, 20, -1), [loc, lor] = at(15, 20, -1);   // left eye: base pupil, outer target
        const [rpc, rpr] = at(23, 20, 1),  [roc, ror] = at(25, 20, 1);    // right eye: base pupil, outer target
        ovrSet(lpc, lpr, W, p._animXeye.a); ovrSet(loc, lor, dark(loc, lor), p._animXeye.a);
        ovrSet(rpc, rpr, W, p._animXeye.b); ovrSet(roc, ror, dark(roc, ror), p._animXeye.b);
      }
    }
    if (p.mouth_piece && window.FACET_MOUTHS) {
      const dc = Math.round(anchors.mouth[0] / CE) - Math.round(N0.mouth[0] / CELL41), dr = Math.round(anchors.mouth[1] / CE) - Math.round(N0.mouth[1] / CELL41);   // track the face's cell crossings (no lag); CELL41 remaps the 41-authored neutral onto the current grid
      const cells = window.FACET_MOUTHS.cells(p.mouth_piece);
      for (let i = 0; i < cells.length; i++) setCell(g, cells[i][0] + dc, cells[i][1] + dr, resolve(cells[i][2], cells[i][0] + dc, cells[i][1] + dr));
    }
    if (p.combo_piece && window.FACET_COMBO) {   // full mask (eyes + mouth), shifted by the eye-region offset
      const nx = (N0.eyeL[0] + N0.eyeR[0]) / 2, ny = (N0.eyeL[1] + N0.eyeR[1]) / 2;
      const ex = (anchors.eyeL[0] + anchors.eyeR[0]) / 2, ey = (anchors.eyeL[1] + anchors.eyeR[1]) / 2;
      const dc = Math.round(ex / CE) - Math.round(nx / CELL41), dr = Math.round(ey / CE) - Math.round(ny / CELL41);   // CELL41 remaps the 41-authored neutral onto the current grid
      const cells = window.FACET_COMBO.cells(p.combo_piece);
      for (let i = 0; i < cells.length; i++) setCell(g, cells[i][0] + dc, cells[i][1] + dr, resolve(cells[i][2], cells[i][0] + dc, cells[i][1] + dr));
    }
  }

  // DEGEN glitch = pixel-art RGB CHROMATIC SPLIT (red channel pulled left, blue pulled right) + torn glitch bars. Brought back the old filter look, now per-cell. rgb_offset: 0 none / 0.8 low / 1.2 med.
  function paintGlitch(g, p) {
    const off = p.rgb_offset || 0; if (off <= 0) return;
    const N = V7.GRID, str = Math.min(0.4, off), shift = 1;   // CAP 0.4 (gruff 2026-07-20): softer glitch + smaller SVG -> under gas cap; drops the torn bar (str<0.85). Solidity FacetsGlitchV7 mirrors.
    const gCtr = (N - 1) / 2, gRad = Math.round(13 * N / 41);   // GRID-RELATIVE disc centre + radius (was hardcoded 20 / 13 for the 41-grid). Solidity mirrors.
    const rgb = c => { c = '' + c; if (c[0] === '#') return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; const m = c.match(/\d+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; };
    // ⛔ NOTATION IS NOT COSMETIC HERE (2026-08-22). rleSVG below skips a run whose colour equals the
    // background, and it compares STRINGS (`col !== bg`). Writing `rgb(10,10,10)` over a `#0a0a0a` cell
    // is the SAME COLOUR spelled differently, so the skip stops firing and an opaque background group is
    // emitted. On a base token that is invisible (nothing is underneath it) and merely costs rects. On an
    // APEX MELTDOWN the candlestick chart is injected as text between the bg rect and the face, so that
    // group lands ON TOP OF THE CHART and hides part of it. The chain compares packed colours as numbers,
    // sees they are equal, skips, and the chart stays visible — a 2.20% divergence, the last one in the
    // forge sweep, and 27 of 27 differing cells were chart-against-patch.
    // ⇒ `_forge_glitch_hex` writes the canonical hex form so a cell that lands on the background is still
    //   recognised as the background. Same pixels either way; only the emitted rects differ.
    // ⚠️ SCOPED TO THE FORGE ON PURPOSE. Applying it to every glitch would change the BYTES a live Base
    //   token's tokenURI returns (same picture, fewer rects) and that collection is already minted.
    //   gruff chose this look 2026-08-22 after seeing both: exp/review/glitch_choice.html.
    const hexOut = !!p._forge_glitch_hex;
    const h2 = v => (v < 16 ? '0' : '') + v.toString(16);
    const snap = g.slice();   // 1) chromatic aberration BLENDED by strength (Low 0.5 = subtle, Med 1.0 = full): RED pulled left / BLUE pulled right
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const dc = c - gCtr, dr = r - gCtr; if (dc * dc + dr * dr >= gRad * gRad) continue;   // GLITCH-DISC (GRID-relative): only the centre disc (face+jaw); smooth bg corners stay un-fragmented. Solidity FacetsGlitchV7 mirrors.
      const self = rgb(snap[r * N + c]);
      const rN = c + shift < N ? rgb(snap[r * N + c + shift]) : self;
      const bN = c - shift >= 0 ? rgb(snap[r * N + c - shift]) : self;
      const oR = (self[0] + (rN[0] - self[0]) * str) | 0, oB = (self[2] + (bN[2] - self[2]) * str) | 0;
      g[r * N + c] = hexOut ? ('#' + h2(oR) + h2(self[1]) + h2(oB)) : ('rgb(' + oR + ',' + self[1] + ',' + oB + ')');
    }
    if (str >= 0.85) {   // 2) ONE torn glitch bar at Med only (Low = pure subtle chroma, no bar)
      const h = (Math.imul(((p.seed | 0) || 1), 2654435761) >>> 0), br = h % N, bshift = 1 + (h % 2);
      const row = []; for (let c = 0; c < N; c++) row[c] = g[br * N + c];
      for (let c = 0; c < N; c++) { const src = c - bshift; g[br * N + c] = (src >= 0 && src < N) ? row[src] : (p.bg || '#0a0a0a'); }
    }
  }
  // ============================================================================================
  //  ANIMATION RULES  (locked 2026-08-02 with gruff, one motion per facet)
  // ============================================================================================
  // Every token animates at most ONE trait, and the trait's VALUE picks the motion, so the
  // movement carries meaning instead of decoration. Values that mean "settled" (Flat, Whole,
  // Shadow, Matte) deliberately stay still. Nothing here runs unless V7.animate is true.
  const ANIM = (function () {
    const PH = 8;                                    // phase classes per staggered layer
    // ⚠️ RULE, set by gruff 2026-08-03: NOTHING EVER FULLY DISAPPEARS. Every motion either adds
    // light on top (lit) or breathes within a high floor. A trait that vanishes stops reading as
    // that trait — a target you cannot see is not a target. So there are no vanish keyframes here.
    const KF = {
      hl:   '0%,100%{opacity:0}45%{opacity:.9}',      // the added-light copy fades in and out
      soft: '0%,100%{opacity:0}50%{opacity:.62}',     // gentle wash, for slow heavy facets
      pop:  '0%,100%{opacity:0}18%{opacity:1}36%{opacity:0}',   // short sparkle
      keep: '0%,100%{opacity:1}50%{opacity:.72}',     // breathes but never loses the shape
      gl:   '0%,100%{opacity:.78}50%{opacity:1}',
      fl:   '0%,100%{opacity:1}50%{opacity:.34}',
      br:   '0%,100%{opacity:1}50%{opacity:.4}',
      bolt: '0%,84%{opacity:0}86%{opacity:1}88.5%{opacity:.12}90.5%{opacity:1}94%{opacity:0}100%{opacity:0}',
      fill: '0%{opacity:0}5%{opacity:1}46%{opacity:1}53%{opacity:0}100%{opacity:0}',
      // LASER: dark, a two-step charge, then a ~1s FULL burn, then out. On a 4s cycle 73%->96% is 0.9s.
      fire: '0%,64%{opacity:0}66%{opacity:.35}69%{opacity:.1}73%{opacity:1}96%{opacity:1}98%{opacity:0}100%{opacity:0}',
      // CROSS-EYED: the two looks. Hard switch (no fade) — a pixel pupil that cross-fades reads as a smear.
      sqA: '0%,49%{opacity:1}50%,100%{opacity:0}',
      sqB: '0%,49%{opacity:0}50%,100%{opacity:1}',
      // (the RIPPLE keyframe lived here until 2026-08-04. It drove the GHOST halo, which is cancelled —
      //  see the GHOST branch of plan() for why. Nothing else used it.)
    };
    // name -> { kf, dur, ease, ph:staggered, band:width, lit:amount }
    // `band` = the lit window is one slice of the cycle, so ONE band is lit at a time: that is
    // what reads as a travelling or rotating sweep rather than a general shimmer.
    // A wide band (>2) overlaps its neighbours and reads as one smooth continuous wave.
    const M = {
      // ── DEGEN (locked) ──
      chopA: { kf: 'fl', dur: .9, ease: 'steps(1,end)' }, chopB: { kf: 'fl', dur: .9, ease: 'steps(1,end)', off: -.45 },
      printing: { kf: 'fl', dur: .5, ease: 'steps(1,end)', ph: 1 }, bleeding: { kf: 'fl', dur: 3.2, ease: 'ease-in-out' },
      rekt: { kf: 'fl', dur: .42, ease: 'steps(1,end)' }, uponly: { kf: 'fl', dur: .6, ease: 'steps(1,end)', ph: 1 },
      // ── OG ── patina = the highlight cells, one direction per patina value
      patina: { kf: 'hl', dur: 2.6, ease: 'ease-in-out', ph: 1, band: 2.2, lit: .55 },
      gilt:   { kf: 'hl', dur: 3.2, ease: 'ease-in-out', ph: 1, band: 2.4, lit: .5 },
      // kintsugi sparkles rather than glows: short bright pops along the gold veins
      kintsugi:  { kf: 'pop', dur: 1.5, ease: 'linear', ph: 1, lit: .9 },
      // shattered strikes ALL AT ONCE — no phase, or it crackles piece by piece in different places
      shattered: { kf: 'bolt', dur: 3.6, ease: 'linear', lit: .95 },
      // ── GHOST ── fading IS the trait, but it must never reach zero
      veilHeavy: { kf: 'br', dur: 5.5, ease: 'ease-in-out' }, veilLight: { kf: 'br', dur: 7, ease: 'ease-in-out' },
      // ── NEWBIE (locked) ──
      gather: { kf: 'fill', dur: 4.2, ease: 'linear', ph: 1 },
      // ── WHALE ── slow, heavy, SMOOTH. Wide overlapping band = one continuous wave, not parts.
      // ⚠️ THE GILD WAVE IS WHAT COSTS ON A WHALE, NOT THE CROWN — and that is worth keeping even though
      // the fix it suggested was rejected. Both over-cap whales (#4417, #8355) have a 7-ring halo AND a
      // crown motion, and the crown pool had already been tiered by halo size once, so the crown looked
      // guilty. Making crownO/crownP non-lit moved the output by FOUR BYTES. It is this wave, riding the
      // face's gold cells: one extra rect each over a large area.
      // ⚠️ It stays LIT. The non-lit version was measured (+40% -> +21%) and gruff rejected it: on gold,
      // fading a cell toward the background reads as the gold being DIMMED, the opposite of a gild.
      // ⚠️ A SUNLIGHT GLINT, NOT A WAVE (gruff, 2026-08-06). The travelling band was rejected twice: at
      // band 3.4-4.0 and lit .5 it was a wash spread over hundreds of cells nobody could see, and on a big
      // crown it cost so much that it had to be switched off there entirely — which is why three whales had
      // NO animation at all. A short hard `pop` on a FEW gold blocks reads, and costs a fraction.
      gild:  { kf: 'pop', dur: 2.2, ease: 'linear', ph: 1, lit: .95 },
      gildB: { kf: 'pop', dur: 3.0, ease: 'linear', ph: 1, lit: .95 },
      // crown: the ring is ALWAYS fully there; only light moves over it
      crownA: { kf: 'soft', dur: 4.2, ease: 'ease-in-out', ph: 1, band: 3.0, lit: .6 },
      crownB: { kf: 'soft', dur: 5.5, ease: 'ease-in-out', ph: 1, band: 3.8, lit: .5 },
      crownC: { kf: 'hl',   dur: 2.8, ease: 'ease-in-out', ph: 1, band: 1.6, lit: .8 },
      crownD: { kf: 'hl',   dur: 3.4, ease: 'ease-in-out', ph: 1, band: 2.2, lit: .7 },
      crownE: { kf: 'soft', dur: 7.0, ease: 'ease-in-out', ph: 1, band: 4.4, lit: .45 },
      crownF: { kf: 'pop',  dur: 2.0, ease: 'linear',      ph: 1, lit: .9 },
      crownG: { kf: 'gl',   dur: 3.2, ease: 'ease-in-out', ph: 1 },
      crownH: { kf: 'keep', dur: 4.0, ease: 'ease-in-out', ph: 1 },
      // ── WHALE crown CANDIDATES, 2026-08-04 ──────────────────────────────────────────────────────────
      // gruff, WHALE ONLY (he was explicit that collector is out of scope): the wheel variants (rot/rotr)
      // read as a wagon wheel, while the sparkle / glow ones look classier "especially on big halos".
      // These are the non-angular replacements he is choosing from. NONE of them is live yet — they only
      // reach a token when CROWN_POOL below is switched, which happens after he picks.
      crownI: { kf: 'soft', dur: 5.0, ease: 'ease-in-out', ph: 1, band: 3.2, lit: .55 },  // light swells OUTWARD, ring by ring
      crownJ: { kf: 'soft', dur: 6.2, ease: 'ease-in-out', ph: 1, band: 3.6, lit: .5 },   // the same wave drawing INWARD, slower
      crownK: { kf: 'pop',  dur: 2.6, ease: 'linear',      ph: 1, lit: .8 },              // slower, richer sparkle than crownF
      crownL: { kf: 'keep', dur: 3.0, ease: 'ease-in-out', ph: 1 },                       // whole ring breathes, cells slightly out of step
      crownM: { kf: 'gl',   dur: 5.0, ease: 'ease-in-out', ph: 1 },                       // deep slow glow; no lit rect, so it is the cheapest here
      crownN: { kf: 'pop',  dur: 3.4, ease: 'linear',      ph: 1, lit: .95 },             // rare hard glints, built for big halos
      // ⚠️ NO `ph` ON THESE TWO, AND THAT IS THE WHOLE POINT. A staggered motion puts neighbouring cells in
      // different phase classes, which BREAKS THE RLE RUN at every boundary — that, not the keyframe, is what
      // makes a crown motion expensive. Unstaggered, the entire crown carries ONE class, runs survive, and
      // the cost collapses. These are the only motions cheap enough for the 5-7 ring halos.
      crownO: { kf: 'gl',   dur: 4.5, ease: 'ease-in-out' },                              // the whole crown breathes as one
      crownP: { kf: 'keep', dur: 6.0, ease: 'ease-in-out' },                              // the same, slower and shallower
      // ── BUILDER ── three genuinely different rhythms
      shipFew:  { kf: 'pop',  dur: 3.4, ease: 'linear',      ph: 1, lit: .75 },   // sparse, one block at a time
      shipMany: { kf: 'hl',   dur: 2.4, ease: 'ease-in-out', ph: 1, band: 1.6, lit: .6 },  // a line sweeping
      shipPro:  { kf: 'soft', dur: 1.4, ease: 'linear',      ph: 1, band: 3.2, lit: .55 }, // continuous, never rests
      // ── COLLECTOR ── the wall/target/confetti is ALWAYS fully visible; light moves over it
      cSpark:   { kf: 'pop',  dur: 1.1, ease: 'linear',      ph: 1, lit: .8 },
      cSparkB:  { kf: 'pop',  dur: 1.8, ease: 'linear',      ph: 1, lit: .65 },
      cSparkC:  { kf: 'hl',   dur: .8,  ease: 'steps(1,end)', ph: 1, lit: .5 },
      cSpinA:   { kf: 'hl',   dur: 2.2, ease: 'ease-in-out', ph: 1, band: 1.5, lit: .8 },
      cSpinB:   { kf: 'soft', dur: 3.2, ease: 'ease-in-out', ph: 1, band: 2.6, lit: .65 },
      cSpinC:   { kf: 'hl',   dur: 1.5, ease: 'linear',      ph: 1, band: 1.1, lit: .9 },
      cSpiralA: { kf: 'hl',   dur: 2.8, ease: 'linear',      ph: 1, band: 1.4, lit: .6 },
      cSpiralB: { kf: 'soft', dur: 3.6, ease: 'ease-in-out', ph: 1, band: 2.8, lit: .55 },
      cSpiralC: { kf: 'pop',  dur: 2.0, ease: 'linear',      ph: 1, lit: .75 },   // blocks appear at random
      // ⚠️ THESE STAY LIT. A non-lit version was built and measured on 2026-08-05 (it takes the worst
      // COLLECTOR from +76% output to +29% and puts every over-cap token back under) and gruff REJECTED it
      // on sight: non-lit can only fade a cell TOWARD what is behind it, never add light, so the wall glint
      // stopped reading as a glint and the whale's gold wave read as the gold being dimmed — "it looks like
      // it was built to make them duller". That is taking the art to pay for gas, which is the last resort,
      // not the first. Do not re-propose it.
      // ⚠️ Reducing the lit AMOUNT is NOT a lever either — measured byte-identical. The cost is the one
      // extra RECT per lit cell, not the brightness.
      cGlint:   { kf: 'pop',  dur: 1.6, ease: 'linear',      ph: 1, lit: .95 },
      cGlintB:  { kf: 'pop',  dur: 2.4, ease: 'linear',      ph: 1, lit: .8 },
      cGlintC:  { kf: 'hl',   dur: 1.9, ease: 'ease-in-out', ph: 1, band: 1.8, lit: .7 },
      // ── rare backgrounds ──
      bgTwinkle: { kf: 'pop', dur: 2.2, ease: 'linear', ph: 1, lit: .8 },
      bgOut:     { kf: 'hl',  dur: 3.6, ease: 'ease-in-out', ph: 1, band: 2.0, lit: .6 },
      // ── 2026-08-03, gruff's four (the GHOST halo one was cancelled 2026-08-04) ──
      // RAINBOW SHADES: a gleam crossing the lenses, left to right. Only the two rainbow rows carry it — the
      // white frame is left alone so the glasses keep their shape.
      // 2026-08-03 second pass (gruff): the 3.6s version crawled and you could see the cells light one by one.
      // A third of the time and a band wide enough that neighbours overlap = one streak whipping across.
      shadeGleam:{ kf: 'hl', dur: 1.15, ease: 'linear', ph: 1, band: 2.8, lit: .85 },
      // LASER: the red square is always there; this is the BURN on top of it.
      laserFire: { kf: 'fire', dur: 4.0, ease: 'linear', lit: .95 },
      // CROSS-EYED: two overlay sets, each visible half the cycle -> the pupils look left, then right.
      // Nothing disappears: at every instant exactly one pupil per eye is on screen.
      xeyeA:     { kf: 'sqA', dur: 2.6, ease: 'linear' },
      xeyeB:     { kf: 'sqB', dur: 2.6, ease: 'linear' },
      // ── COLLECTOR FRAME, 18 variants (gruff, 2026-08-06) ────────────────────────────────────────
      // The COMPLETIONIST wall used to animate: a solid wall of blocks, +76% to +90% output, the most
      // expensive thing in the collection and three tokens over the 50M cap. Its animation moves to the
      // thin FRAME ring instead — ~120 cells whatever the holdings, so the cost stops depending on how
      // full the wall is. The other three archetypes keep their own wall motions untouched.
      // ⚠️ VARIETY IS FREE, which is why there are 18 and not 3: every variant tags the SAME ~120 ring
      // cells, and the cost is one extra rect per tagged cell. Eighteen patterns cost what one costs.
      // ⚠️ APPENDED AT THE END ON PURPOSE. Motion ids are INDICES into this object; inserting these next
      // to the other collector motions would renumber every id after them and silently invalidate the
      // generated Solidity table, _anim_plan_truth.json and FacetsAnimPlanV7's hand-written constants.
      // 'par' below is the odd/even alternation gruff described; the rest reuse existing stagger modes.
      cFrm0:  { kf: 'pop', dur: 1.8, ease: 'linear', ph: 1, lit: .9 },
      cFrm1:  { kf: 'pop', dur: 2.6, ease: 'linear', ph: 1, lit: .9 },
      cFrm2:  { kf: 'hl',  dur: 2.2, ease: 'linear', ph: 1, lit: .9 },
      cFrm3:  { kf: 'pop', dur: 2.0, ease: 'linear', ph: 1, lit: .9 },
      cFrm4:  { kf: 'pop', dur: 2.0, ease: 'linear', ph: 1, lit: .9 },
      cFrm5:  { kf: 'pop', dur: 3.0, ease: 'linear', ph: 1, lit: .9 },
      cFrm6:  { kf: 'hl',  dur: 2.4, ease: 'linear', ph: 1, lit: .9 },
      cFrm7:  { kf: 'hl',  dur: 2.4, ease: 'linear', ph: 1, lit: .9 },
      cFrm8:  { kf: 'hl',  dur: 3.4, ease: 'linear', ph: 1, lit: .9 },
      cFrm9:  { kf: 'pop', dur: 2.2, ease: 'linear', ph: 1, lit: .9 },
      cFrm10: { kf: 'pop', dur: 2.2, ease: 'linear', ph: 1, lit: .9 },
      cFrm11: { kf: 'pop', dur: 2.2, ease: 'linear', ph: 1, lit: .9 },
      cFrm12: { kf: 'hl',  dur: 2.8, ease: 'linear', ph: 1, lit: .9 },
      cFrm13: { kf: 'hl',  dur: 2.8, ease: 'linear', ph: 1, lit: .9 },
      cFrm14: { kf: 'hl',  dur: 2.8, ease: 'linear', ph: 1, lit: .9 },
      cFrm15: { kf: 'pop', dur: 1.6, ease: 'linear', ph: 1, lit: .9 },
      cFrm16: { kf: 'pop', dur: 2.8, ease: 'linear', ph: 1, lit: .9 },
      cFrm17: { kf: 'hl',  dur: 3.0, ease: 'linear', ph: 1, lit: .9 },
    };
    // the stagger mode each frame variant uses. 'par' = (c+r)&1, the odd/even alternation, which is NOT a
    // phase-table mode — a 1-cell ring alternates perfectly under it in both directions.
    const FRAME_MODE = ['par','par','par','rot','rotr','rot','rot','rotr','rot',
                        'col','colr','row','col','row','rowr','r','r','spiral'];
    // ── INTEGER STRING FORMATTING, 2026-08-04 ───────────────────────────────────────────────────────
    // Same reasoning as the two lifts: the animation CSS is a new output with no deployed golden, so the
    // canonical form is ours to choose, and choosing integers means Solidity mirrors it exactly instead
    // of chasing `toFixed(2)` across doubles. `toFixed` rounds the DOUBLE, so -(0.42/8)*2 printed "-0.10"
    // where the exact value 0.105 rounds to "-0.11" — 14 of the 240 (duration, phase) pairs disagreed.
    // Cost of switching: at most **10ms** of animation delay on those 14 pairs, on loops 0.42s to 7s long.
    // The 17 band widths were already identical, so nothing there moves at all.
    const _2dp = v => (v < 0 ? '-' : '') + Math.floor(Math.abs(v) / 100) + '.' + String(Math.abs(v) % 100).padStart(2, '0');
    // seconds from integer ms, trailing zeros stripped — "4.5", "2", "0.9", "0.42"
    const _sec = ms => { const w = Math.floor(ms / 1000); let f = String(ms % 1000).padStart(3, '0').replace(/0+$/, '');
      return f ? w + '.' + f : String(w); };
    const _delay = (durMs, j) => { const cs = Math.round(durMs * j / 80); return cs === 0 ? '0.00' : _2dp(-cs); };
    // band width in CENTI-PERCENT: W = (100/PH)*band, and with PH 8 that is exactly 12.5*band
    const bandKF = w => { const cp = Math.min(9900, 125 * Math.round((w || 1) * 10));
      return '0%{opacity:0}' + _2dp(Math.round(cp * 45 / 100)) + '%{opacity:.95}' + _2dp(cp) + '%{opacity:0}100%{opacity:0}'; };
    const attr = (gt, t) => { const a = (gt.attributes || []).find(x => x.trait === t); return a ? String(a.value) : null; };
    function phase(mode, c, r, seed) {
      const G = V7.GRID, mid = (G - 1) / 2, dx = c - mid, dy = r - mid;
      const ang = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI), rad = Math.min(1, Math.hypot(dx, dy) / (G * .72));
      const off = (seed || 0) % PH, w = v => ((Math.floor(v) + off) % PH + PH) % PH;
      switch (mode) {
        case 'rot': return w(ang * PH);      case 'rotr': return w(-ang * PH);
        case 'rad': return w(rad * PH);      case 'radInv': return w(-rad * PH);
        case 'spiral': return w(ang * PH + rad * PH);
        case 'col': return w((c / G) * PH);  case 'colr': return w(-(c / G) * PH);
        case 'row': return w((r / G) * PH);  case 'rowr': return w(-(r / G) * PH);
        default: { const a = 5 + ((seed || 0) % 7) * 2, b = 11 + (((seed || 0) >>> 3) % 9) * 2; return w(c * a + r * b); }
      }
    }
    // ── SHORT CLASS NAMES, 2026-08-04 ───────────────────────────────────────────────────────────────
    // The emitted class is `a{i}` (+ phase digit), where i is the motion's index in THIS TOKEN'S table —
    // not its engine name. `crownM3` becomes `a03`. Two reasons, and the second is the important one:
    //  1. bytes. Measured over 1,429 tokens: 281,056 bytes saved, 0.92% of ALL output, and the worst
    //     single token (#1205) drops 1,976 bytes ~ 1M gas — on exactly the big-halo tokens that sit
    //     closest to the 50M cap.
    //  2. contract size. Emitting engine names on chain means STORING ~45 of them, and the render
    //     libraries are already at 98% of EIP-170. An index needs one digit and no table at all.
    // The JS was moved to this form so both sides stay byte-identical; the animation itself is unchanged,
    // since a CSS class name is arbitrary as long as the rule and the attribute agree.
    // `_REAL` maps the short name back to the engine name, which is all the M lookups need.
    let _REAL = {}, _lastUsed = [], _lastPlan = null;
    const _mo = b => M[_REAL[b] || b];
    const stag = (base, mode, seed) => _mo(base).ph ? ((c, r) => base + phase(mode, c, r, seed)) : base;
    // THINNED stagger — the same motion on FEWER CELLS. A lit motion costs one extra rect per tagged cell
    // in every frame, so the only way to make one cheaper without touching how it LOOKS is to tag less of
    // the area. Returning '' for a cell makes stamp() clear it, exactly as an unassigned layer would.
    // ⚠️ THIN BY A FACTOR OF THE PHASE COUNT, NEVER DOWN TO ONE PHASE. Every surviving cell keeps its own
    // phase, so `keep` 2 leaves phases 0,2,4,6 — half the cells, still four different moments, still reads
    // as a scatter. Keeping a SINGLE phase would leave every surviving cell flashing in unison, which is a
    // synchronised blink and not a sparkle.
    // ⚠️ Only for SCATTER motions (`pop`). A travelling BAND (`hl`/`soft` + band) cannot be thinned this
    // way — punching cells out of a moving band just makes the band ragged.
    // how much of a scatter wall motion survives: 1 = all cells (the old behaviour), 2 = half, 4 = a quarter.
    const WALL_KEEP = 2;
    // WHALE glint density, as the integer threshold hnF is compared against (hnF is 0..999999).
    // 55 blocks over a ~170-cell typical gold budget = 55/170 -> 323529. gruff picked this level off the
    // review page (#9442). Raising it adds blocks linearly, and blocks are the ONLY thing that costs.
    const GILD_N = 323529;
    const stagThin = (base, mode, seed, keep) => (c, r) => {
      const p = phase(mode, c, r, seed);
      return (p % keep) ? '' : base + p;
    };
    // ── WHALE crown pools, TIERED BY HALO SIZE — 2026-08-04 ─────────────────────────────────────────────
    // Two things happened here. gruff asked for the WHEEL variants (rot/rotr, 173 of 331 crowned whales) to
    // be replaced by the sparkle / glow family "and variations of it", WHALE ONLY. He also said: distribute
    // them however you like, rarity is fine, "but if it is a load or cost problem on chain, adjust the
    // distribution and the additions accordingly". It IS a cost problem, so the pool is tiered.
    //
    // MEASURED, NOT GUESSED. Real static tokenURI gas was read off anvil for the heaviest crowned whale at
    // every halo size, and the animated delta projected with BOTH fits from exp/review/gasbyte.cjs
    // (30,611 gas per extra rect, 518 per extra byte), taking the PESSIMISTIC of the two.
    // ⚠️ The 50M eth_call cap is hard: a token over it cannot be rendered by OpenSea AT ALL.
    //
    //   halo rings           1     2     3     4     5     6     7      (tokens: 113 80 69 40 14 9 6)
    //   whole-crown        31.7  35.6  39.2  39.9  46.0  44.4  47.3
    //   non-lit staggered  32.2  36.6  41.1  42.4  46.9  49.3  53.6
    //   lit .45 - .55      34.3  40.2  46.4  50.0  58.9  60.3  66.0
    //   lit .8 - .95       34.4  40.7  47.4  51.5  61.0  63.6  70.6
    //
    // Policy: a motion is allowed at a ring count only if it projects UNDER 46M, i.e. keeps 8% of margin.
    // ⚠️ THE OLD POOL WAS ALREADY OVER THE CAP and nobody had noticed, because the animation layer is not
    // on chain yet. crown sparkle (lit .9) and both wheels (lit .6 / .8) all blow through 50M on a big halo.
    // This would have surfaced as a blocker during the Solidity port, not before it.
    // ⚠️ WHY LIT IS EXPENSIVE: a lit motion draws ONE EXTRA RECT PER LIT CELL. Staggering costs on its own
    // too, because neighbouring cells land in different phase classes and every boundary BREAKS AN RLE RUN.
    // That is exactly why the unstaggered whole-crown pair (crownO / crownP, no `ph`) is the cheapest here.
    //
    // Weighting is by REPETITION, since pick() is a plain modulo over the array.
    // gruff reviewed every one of these in exp/review/crownserve.cjs on 2026-08-04 and ruled:
    // all EIGHT new motions are in · **crown drift (crownE) is CUT** · and if he had to keep only a few
    // it would be **ember · breathe wide · deep glow · starfield**, so those four carry the weight here.
    // ⚠️ Two of his four are LIT (ember .8, starfield .95) and lit motions only fit on 1-2 ring halos,
    // so they reach 193 of the 331 crowned whales. The other two are non-lit and reach 3-4 rings as well.
    const CROWN_SMALL = [                                        // 1-2 rings (193 tokens): everything fits
      ['crownM', 'rad'], ['crownM', 'rad'], ['crownM', 'rad'],   // deep glow    - favourite, and cheap
      ['crownK', 'r'], ['crownK', 'r'], ['crownK', 'r'],         // ember        - favourite
      ['crownL', 'r'], ['crownL', 'r'], ['crownL', 'r'],         // breathe wide - favourite, and cheap
      ['crownN', 'r'], ['crownN', 'r'],                          // starfield    - favourite, kept at 2/20 so it stays an event
      ['crownG', 'r'], ['crownG', 'r'],                          // crown glow   - one of the two he liked first
      ['crownF', 'r'], ['crownF', 'r'],                          // crown sparkle- the other one
      ['crownI', 'rad'], ['crownI', 'rad'],                      // swell out
      ['crownJ', 'radInv'], ['crownH', 'rad'], ['crownO', 'r']];
    const CROWN_MID = [                                          // 3-4 rings (109 tokens): NON-LIT only
      ['crownM', 'rad'], ['crownM', 'rad'], ['crownM', 'rad'],   // his two non-lit favourites lead here
      ['crownL', 'r'], ['crownL', 'r'], ['crownL', 'r'],
      ['crownG', 'r'], ['crownG', 'r'], ['crownH', 'rad'], ['crownO', 'r']];
    const CROWN_BIG = [['crownO', 'r'], ['crownP', 'r']];        // 5-7 rings (29 tokens): whole-crown only
    // ⚠️ 7 RINGS WERE BRIEFLY LEFT STILL and then won back. At the first measurement the cheapest motion
    // projected 47.3M on #4417, past the 46M policy line, so the six 7-ring whales were given no crown
    // motion at all — the one place where the cap fought gruff's "it looks best on the big halos".
    // Shortening the class names (see use()) bought ~1M gas back on exactly these tokens and the same
    // measurement now reads **45.8M**, so they animate again. Worth remembering as a pattern: the cheapest
    // win in this layer was in the OUTPUT FORMAT, not in the art.
    function crownPoolFor(rings) { return rings >= 5 ? CROWN_BIG : rings >= 3 ? CROWN_MID : CROWN_SMALL; }
    // Review hook: the lab splices CROWN_POOL to force ONE candidate across every whale. When it holds
    // entries they override the tiers, which is what makes a like-for-like comparison possible.
    const CROWN_POOL = [];
    const pick = (arr, seed) => arr[seed % arr.length];
    // human-readable name, shown next to the token so a note like "kill this one" is unambiguous
    const NAMES = {
      chopA:'chop', printing:'printing', bleeding:'bleeding', rekt:'rekt', uponly:'up only',
      patina:'patina drift', gilt:'gilt drift', kintsugi:'kintsugi sparkle', shattered:'lightning',
      veilHeavy:'veil breathe', veilLight:'veil drift', gather:'gather',
      gild:'gold wave', gildB:'gold wave slow',
      crownA:'crown wave', crownB:'crown wave slow', crownC:'crown band', crownD:'crown band soft',
      crownE:'crown drift', crownF:'crown sparkle', crownG:'crown glow', crownH:'crown breathe',
      crownI:'crown swell out', crownJ:'crown swell in', crownK:'crown ember',
      crownL:'crown breathe wide', crownM:'crown deep glow', crownN:'crown starfield',
      crownO:'crown pulse whole', crownP:'crown swell whole',
      shipFew:'works sparkle', shipMany:'works sweep', shipPro:'works nonstop',
      cSpark:'confetti pop', cSparkB:'confetti pop slow', cSparkC:'confetti blink',
      cSpinA:'target spin', cSpinB:'target spin wide', cSpinC:'target spin fast',
      cSpiralA:'spiral', cSpiralB:'spiral wide', cSpiralC:'random blocks',
      cGlint:'glint', cGlintB:'glint slow', cGlintC:'glint sweep',
      bgTwinkle:'stars', bgOut:'pulse out',
      laserFire:'laser fire', xeyeA:'shifty eyes', xeyeB:'shifty eyes', shadeGleam:'shades gleam',
    };

    function plan(gt, p, facet) {
      p._animKinds = null; p._animBg = 0; p._animBgLit = 0; p._animSplat = 0;
      p._animWhale = 0; p._animWhaleLit = 0; p._animWall = 0; p._animWallLit = 0;
      p._animSpark = 0; p._animFaceFn = 0; p._animFaceLit = 0;
      p._animHalo = 0; p._animHaloLit = 0; p._animLaser = 0; p._animLaserLit = 0; p._animXeye = 0;
      p._animShade = 0; p._animFrame = 0; p._animFrameLit = 0;
      const seed = (gt.tokenHash || gt.id || 0) >>> 0, used = [];
      _REAL = {};
      // returns the SHORT class name for this token, and remembers which engine motion it stands for.
      // Deduped: asking for the same motion twice must reuse the same index, or the table and the tag
      // would disagree about what index N means.
      const use = n => { let i = used.indexOf(n); if (i < 0) { used.push(n); i = used.length - 1; }
        const s = 'a' + i; _REAL[s] = n; return s; };

      if (facet === 'OG') {
        // ⚠️ PATINA lives in the field's HIGHLIGHT cells (res.kind === 'accent', painted with
        // accent_color), NOT in accentMap. accentMap holds the owner blocks — tagging that was
        // why only the purple specks moved and the patina itself sat still.
        const pat = attr(gt, 'Patina');
        if (pat) { const b = use(pat === 'Gilt' ? 'gilt' : 'patina');
          const mode = { Rust: 'rad', Crimson: 'rotr', Azure: 'col', Verdigris: 'spiral', Gilt: 'radInv' }[pat] || 'rad';
          p._animKinds = { hiliteFn: stag(b, mode, seed), hiliteLit: _mo(b).lit }; }
        const cr = attr(gt, 'Cracks');
        if (cr === 'Kintsugi') p._animKinds = Object.assign(p._animKinds || {}, { crackFn: stag(use('kintsugi'), 'r', 0), crackLit: M.kintsugi.lit });
        else if (cr === 'Shattered') p._animKinds = Object.assign(p._animKinds || {}, { crackFn: use('shattered'), crackLit: M.shattered.lit });
      } else if (facet === 'GHOST') {
        const v = attr(gt, 'Veil');
        if (v === 'Heavy') p._animKinds = { veil: use('veilHeavy') };
        else if (v === 'Light') p._animKinds = { veil: use('veilLight') };
        // ⚠️ THE HALO MOTION IS GONE — CANCELLED 2026-08-04 by gruff. Do not rebuild it.
        // Why: halo ring 0 sits at R+20 = 8.4 cells while the head ends at 7.7, so the face — painted AFTER
        // the halo — covers nearly all of it. A GHOST's face is dissolved, so every gap that happens to land
        // on a ring-0 tile leaves that tile behind as a LONE cell far from the visible arc. Measured: 33.2%
        // of ring 0's surviving cells have no halo neighbour at all, and 36 of 38 haloed ghosts carry at
        // least one (worst: 12). Sitting still they read as face texture; blinking they read as a bug —
        // reported as "two blocks glowing outside the halo" on #49, at (14,10) and (20,10).
        // ⚠️ Those cells are ORDINARY ART and they stay: rendering with the flag on and off differs by
        // exactly 0 cells. The motion was the only new thing, so removing the motion is the whole fix.
        // ⚠️ IT DOES COST COVERAGE, and the first measurement of that was wrong. Every GHOST carries a Veil,
        // but only Heavy (120) and Light (20) animate — Shadow (470) is deliberately still under the
        // "values that mean settled do not move" rule above. So of 610 GHOSTs: 140 keep a motion via the
        // veil, 142 were already still, and 328 (53.8%) were animating ONLY through the halo and now stop.
        // GHOST motion coverage goes 76.7% -> 23.0%. Left as gruff's call; a still GHOST is arguably on
        // theme for the absent facet, but if it needs motion back it needs its OWN motion, not this one.
        // `p._animHalo` is left initialised to 0 and paintHalo KEEPS its rec() wrapper on purpose — running
        // that painter with REC = 0 is what clears stale tags off halo cells (LAST WRITER OWNS THE CELL).
      } else if (facet === 'DEGEN') {
        const pnl = attr(gt, 'PnL');
        const c = { Printing: 'printing', Bleeding: 'bleeding', Rekt: 'rekt', 'Up Only': 'uponly', Chop: 'chopA' }[pnl];
        if (c) { const b = use(c), fn = stag(b, 'r', seed);
          p._animKinds = { splatFn: fn, crackFn: fn }; p._animSplat = fn; }
      } else if (facet === 'WHALE') {
        const gd = attr(gt, 'Gild');
        // ⚠️ NO GOLD WAVE ON A 7-RING CROWN, and it is the tier that decides, not the Gild trait.
        // The wave is a travelling BAND, so unlike the wall glints it cannot be thinned — punching cells
        // out of a moving band leaves it ragged. And it is the whole lit cost on a whale: making the CROWN
        // non-lit moved the output by FOUR BYTES, making the wave non-lit moved it by ~8,000.
        // A 7-ring crown is already the heaviest static render in the facet, so the wave on top of it is
        // what carried #4417 to 50.4M and #8355 to 50.3M on tokenURI, over the 50M cap.
        // ⚠️ REACH: **4 tokens** of 804 whales are 7-ring AND gilded (rings 0-6 with a wave: 299). They keep
        // their crown motion; only the face wave stops. This is the same halo-size tiering the crown pool
        // already uses, applied to the layer that actually costs — the rule this file keeps re-learning:
        // rarity only helps when it is conditional on what drives the cost.
        // ⚠️ RANDOM SCATTER, never a column sweep — gruff: "gunes yansiyor gibi". Mode 'r' gives each block
        // an unrelated phase, so they glint at their own moments instead of marching across the face.
        // ⚠️ A FLAT COUNT, not a percentage. The gold AREA varies enormously between whales, so a
        // percentage gave 9 blocks on a small gild (invisible) and hundreds on a large one. GILD_N over a
        // measured typical gold budget keeps the number of glinting blocks roughly constant, which is what
        // gruff picked off the review page (#9442 at ~55).
        // ⚠️ hnF, not hashNoise — the integer the contract compares. See its definition for why.
        if (gd === 'Gilded' || gd === 'Bullion') {
          const b = use((seed & 1) ? 'gild' : 'gildB');
          p._animFaceFn = (c, r) => hnF(c, r, seed + 991) < GILD_N ? b + phase('r', c, r, seed) : '';
          p._animFaceLit = _mo(b).lit; }
        if (attr(gt, 'Halo Pattern')) {
          // ⚠️ `whale_halo_rings`, NOT `halo_rings`. On a WHALE the gold crown REPLACES the universal halo:
          // halo_rings is 0 on every crowned whale, so keying the tier off it silently handed all 331 of
          // them the cheapest-tier pool and the gas tiering did nothing at all. The "Halo" trait a whale
          // displays is whale_halo_rings, which is also what the gas table above was bucketed by.
          // ⚠️ NO CROWN MOTION ON 6+ RINGS, and this is what finally made the big whales look animated.
          // A 6-8 ring crown is ~736 cells and its motions are NON-LIT, so the tag could only dim them:
          // it read as nothing while breaking an RLE run at every cell. Measured on #8535, dropping it and
          // spending the budget on the face glint instead: 48,244 B -> 45,105 B, and the lit cells that
          // actually SHOW went from ~0 to 42. Cheaper AND visible. The crown itself is untouched; only its
          // animation stops, on ~15 whales of 804.
          const tier = (p.whale_halo_rings || 0) >= 6 ? null
                     : (CROWN_POOL.length ? CROWN_POOL : crownPoolFor(p.whale_halo_rings || 0));
          if (tier) { const v = pick(tier, seed);
            p._animWhale = stag(use(v[0]), v[1], seed); p._animWhaleLit = M[v[0]].lit || 0; } }
      } else if (facet === 'BUILDER') {
        const sh = attr(gt, 'Shipped');
        if (sh) { const dir = attr(gt, 'Role') === 'Dev' ? 'row' : 'col';
          const b = use({ Few: 'shipFew', Many: 'shipMany', Prolific: 'shipPro' }[sh] || 'shipMany');
          // ⚠️ `_REAL[b]`, NOT `b`. use() returns the SHORT class name ('a0'), so comparing it against an
          // engine name is always FALSE — that silently made shipFew SWEEP instead of scatter from the moment
          // short names landed, and no JS-side check could see it because the plan harness's truth file was
          // recorded from the same broken JS. The end-to-end parity against the CONTRACT is what caught it.
          p._animKinds = { accentFn: stag(b, _REAL[b] === 'shipFew' ? 'r' : dir, seed), accentLit: _mo(b).lit }; }
      } else if (facet === 'COLLECTOR') {
        const ar = attr(gt, 'Archetype');
        const V = { Explorer: [['cSpark','r'],['cSparkB','r'],['cSparkC','r'],['cSpark','w'],['cSparkB','rad'],['cSparkC','col']],
                    Maxi: [['cSpinA','rot'],['cSpinA','rotr'],['cSpinB','rot'],['cSpinC','rotr'],['cSpinC','rot'],['cSpinB','rotr']],
                    Specialist: [['cSpiralA','spiral'],['cSpiralB','spiral'],['cSpiralC','r'],['cSpiralA','rad'],['cSpiralC','r'],['cSpiralB','rotr']],
                    Completionist: [['cGlint','r'],['cGlintB','r'],['cGlintC','col'],['cGlint','col'],['cGlintB','row'],['cGlintC','rot']] }[ar];
        // ⚠️ THE WALL IS THINNED, and it is a GAS fix that keeps the LOOK (2026-08-05).
        // `p._animWall` wraps the WHOLE wall painter, so every wall cell was tagged — which is not a glint,
        // it is the entire wall flashing. On a big wall that cost +76% to +90% output and put three tokens
        // over the 50M cap. `WALL_KEEP` tags one phase in KEEP, so the sparkle survives on a fraction of
        // the cells, still staggered across several moments. Cheaper AND closer to what a glint is.
        // ⚠️ SCATTER MOTIONS ONLY. cGlintC is a travelling band and is tiered by wall SIZE instead (below);
        // thinning a moving band leaves holes in it.
        // ⚠️ ON THE BIGGEST WALLS, PICK A SCATTER MOTION — the band ones cannot be made cheaper.
        // What drives the cost is the wall AREA, and the area is `holdings`: a `dense` Completionist wall
        // fills solid at holdings 10 (FILL = 0.12 + t01*0.88). Those tokens carried a travelling BAND over
        // a solid wall, one extra rect per cell, +76% to +90% output and over the 50M cap.
        // A band cannot be thinned (punching cells out of a moving band makes it ragged), so on those
        // walls the pool is restricted to the SCATTER motions, which then get thinned above. Every token
        // still gets a glint; only WHICH glint changes, and only where the wall is too big to carry a band.
        // ⚠️ COMPLETIONIST ANIMATES THE FRAME, NOT THE WALL (gruff, 2026-08-06). Its wall is the `dense`
        // one, which fills solid at holdings 10 — the largest painted area in the collection, and the
        // reason three tokens sat over the 50M cap. The thin frame RING is ~120 cells whatever the
        // holdings, so the cost stops depending on how full the wall is: the whole class of problem goes
        // away instead of being special-cased. (An earlier fix tiered the pool for dense walls at
        // holdings >= 8; that is now unreachable and was removed — `dense` IS Completionist.)
        // The other three archetypes keep their own wall motions, thinned as below.
        if (ar === 'Completionist') {
          const fi = seed % FRAME_MODE.length, fb = use('cFrm' + fi), fm = FRAME_MODE[fi];
          p._animFrame = fm === 'par' ? ((c, r) => fb + ((c + r) & 1)) : stag(fb, fm, seed);
          p._animFrameLit = M['cFrm' + fi].lit;
        } else if (V) {
          // ⚠️ THE WALL IS THINNED, and it is a GAS fix that keeps the LOOK. `p._animWall` wraps the WHOLE
          // wall painter, so every wall cell was tagged — which is not a glint, it is the entire wall
          // flashing. WALL_KEEP tags one phase in KEEP, so the sparkle survives on a fraction of the cells
          // and is still staggered across several moments. Cheaper AND closer to what a glint is.
          // ⚠️ SCATTER MOTIONS ONLY: thinning a travelling band leaves holes in it.
          const v = pick(V, seed), b = use(v[0]), sc = _mo(v[0]).kf === 'pop' && WALL_KEEP > 1;
          p._animWall = sc ? stagThin(b, v[1], seed, WALL_KEEP) : stag(b, v[1], seed);
          p._animWallLit = M[v[0]].lit || 0;
        }
      } else if (facet === 'NEWBIE') {
        const fm = attr(gt, 'Form');
        if (fm === 'Forming' || fm === 'Scattered') p._animSpark = stag(use('gather'), 'r', seed);
      }
      // EYE traits, facet-independent: both are rare enough that they read as the token's own quirk.
      // Laser is the rarest eye in the set (weight 1), Cross-eyed is weight 8.
      if (p.eye_laser && !p.eye_piece && !p.combo_piece) { p._animLaser = use('laserFire'); p._animLaserLit = M.laserFire.lit; }
      if (p.eye_piece === 'Cross-eyed') { p._animXeye = { a: use('xeyeA'), b: use('xeyeB') }; }
      if (p.eye_piece === 'Rainbow Shades') {   // one gleam crossing the lenses; phase from the AUTHORED column
        const b = use('shadeGleam');
        p._animShade = ac => b + (PH - 1 - Math.min(PH - 1, Math.floor((ac - 13) * PH / 15)));   // 13..27 -> a left-to-right sweep
      }
      // ⚠️ THE BACKGROUND NEVER ANIMATES — gruff, 2026-08-05, and this is a DELETION, not a new rule.
      // A Starfield / Diamonds fallback used to be assigned here on an otherwise-still token, but it never
      // drew anything: paintBackground's pattern loop writes g[idx()] DIRECTLY and so never told the tag
      // layer, exactly like the depth recess did. So the bg motion has been inert since the day it was
      // written, and what gruff reviewed and approved was a collection with NO moving backgrounds — he
      // remembers them as cancelled because that is what he has always seen. Assigning a motion that paints
      // nothing still cost every one of those tokens a dead <style> block, and it made the CHAIN (which
      // tags correctly) animate the whole pattern: +67% output bytes on GHOST #3059, +60% on NEWBIE #8112,
      // with COLLECTOR animated already at 49.0M of the 50M cap. Removing the assignment settles all three.
      // ⚠️ bgTwinkle / bgOut stay in the motion TABLE deliberately: motion ids are INDICES into ANIM.M, so
      // deleting the entries would renumber every later motion and silently invalidate the generated
      // Solidity table, _anim_plan_truth.json and FacetsAnimPlanV7's constants. Unassigned is enough.
      // (a MEDALLION TURN motion also lived here on 2026-08-03 and was cancelled by gruff — see paintMedallion)
      p._animName = used.length ? [...new Set(used)].map(n => NAMES[n] || n).join(' + ') : 'still';
      _lastUsed = used;   // read by exp/onchain/anim_style_parity.cjs — the token's motion TABLE, in index order
      // ⚠️ and the params object plan() just wrote into. It is the MERGED p built inside render(), NOT
      // gtok.params — a harness that reads the raw params sees every _anim* field undefined and silently
      // records "no layer animates" for the whole collection. That cost one wrong parity run.
      _lastPlan = p;
      return used;
    }
    function style(used) {
      if (!used || !used.length) return '';
      // `used` IS the token's motion table: index i holds the engine name, and the class emitted for it
      // is `a{i}` — see use(). The keyframe name is short for the same reason: `k{i}` for a per-motion
      // band, otherwise the shared keyframe's own short key, which several motions legitimately share.
      const kf = new Map(); let rules = '';
      for (let i = 0; i < used.length; i++) {
        const d = M[used[i]]; if (!d) continue;
        const cls = 'a' + i, kn = d.band ? 'k' + i : d.kf, ms = Math.round(d.dur * 1000), dur = _sec(ms);
        kf.set(kn, d.band ? bandKF(d.band) : KF[d.kf]);
        const ease = d.ease || (d.band ? 'linear' : 'ease-in-out');
        if (d.ph) for (let j = 0; j < PH; j++)
          rules += '.' + cls + j + '{animation:' + kn + ' ' + dur + 's ' + ease + ' ' + _delay(ms, j) + 's infinite}';
        else rules += '.' + cls + '{animation:' + kn + ' ' + dur + 's ' + ease + ' ' + (d.off ? _sec(Math.round(d.off * 1000)) + 's ' : '') + 'infinite}';
      }
      if (!rules) return '';
      let s = ''; for (const [k, v] of kf) s += '@keyframes ' + k + '{' + v + '}';
      return '<style>' + s + rules + '</style>';
    }
    // lift / liftHue are exported so exp/onchain/anim_lift_parity.cjs can diff them against
    // FacetsAnimV7 on anvil. Exposing a function emits nothing, same argument as _prim below.
    return { plan, style, M, KF, PH, NAMES, crownPool: CROWN_POOL, crownTiers: { small: CROWN_SMALL, mid: CROWN_MID, big: CROWN_BIG },
             lift: _lift, liftHue: _liftHue,
             secFmt: _sec, delayFmt: _delay, bandFmt: bandKF,
             get lastUsed() { return _lastUsed; }, get lastPlan() { return _lastPlan; } };
  })();

  function render(gtok) {
    const _pp = gtok.params || {};
    const key = (gtok.tokenHash || gtok.id || 0) + '_v7_' + V7.GRID + '_' + (_pp.eye_piece || '') + '_' + (_pp.mouth_piece || '');
    if (V7.cache.has(key)) return V7.cache.get(key);
    // merge raw params (keeps holdings/whale_*) with face-engine defaults, then PIN block size to the fixed cell
    const p = Object.assign({}, gtok.params || {}, defaultsFor(gtok.params || {}));
    const bs = CELL;
    p.block_size = bs; p._bs = bs;
    if (p.mouth_piece || p.combo_piece) p.mouth_style = 'none';   // suppress the face's own mouth when a NEW mouth piece (or combo mask) replaces it
    if (p.ghost_outline) { let ext = R; const A0 = getAnchors(p.yaw, p.pitch); for (const pt of [A0.hingeL, A0.gonialL, A0.chin, A0.gonialR, A0.hingeR]) ext = Math.max(ext, Math.hypot(pt[0] - CX, pt[1] - CY)); p._ghost_protect = ext + bs * 2.0; }
    const anchors = getAnchors(p.yaw, p.pitch);
    const rad = (p.roll || 0) * Math.PI / 180;
    const facet = gtok.facet;

    newTags();                               // 0. animation tag layer (no-op unless V7.animate)
    const _anim = TAG ? ANIM.plan(gtok, p, facet) : null;
    V7._animName = TAG ? (p._animName || 'still') : null;   // read by the review tools to label a token
    const g = newGrid(p.bg);                 // 1. background base = solid bg (every cell covered)
    rec(TAG ? (p._animBg || 0) : 0, () => paintBackground(g, p, rad), p._animBgLit);   //    + pattern / medallion
    paintFloatingMat(g, p, bs);              // 2. COLLECTOR mat + frame (behind face)
    // 3. ROLL group: halo -> face -> ghost contour -> splatter -> sparks
    rec(TAG ? (p._animHalo || 0) : 0, () => paintHalo(g, p, bs, rad), p._animHaloLit);   // GHOST: the rings turn
    if (p.render_mode === 'rgb_glitch') {    // DEGEN: clean white face (chromatic split omitted — flagged)
      const wp = Object.assign({}, p, { fg: '#ffffff', render_mode: 'standard' });
      paintFaceStandard(g, wp, anchors, bs, rad, 1);
    } else if (p.render_mode === 'contour') {
      paintContour(g, p, anchors, bs);       // NEWBIE (roll 0)
    } else {
      paintFaceStandard(g, p, anchors, bs, rad, (p.veil_opacity != null ? p.veil_opacity : 1));
    }
    _sn('face', g);
    paintGhostOutline(g, p, bs, anchors, rad);   _sn('ghostOutline', g);
    rec(TAG ? (p._animSplat || 0) : 0, () => paintSplatter(g, p, bs, rad));   _sn('splatter', g);   // DEGEN off-face PnL cloud
    rec(TAG ? (p._animSpark || 0) : 0, () => paintSparks(g, p, bs, rad));     _sn('sparks', g);   // NEWBIE drifting fragments
    // 4. collector wall / whale halo (on top of face)
    if (facet === 'COLLECTOR' && !p._forge_clean) rec(TAG ? (p._animWall || 0) : 0, () => paintCollectorWall(g, gtok, p, bs), p._animWallLit);   // _forge_clean: MIXED forge renders a base-facet head WITHOUT its facet furniture. Undefined for base tokens -> byte-identical. Apex VAULT leaves it unset -> keeps its wall.
    else if (facet === 'WHALE') rec(TAG ? (p._animWhale || 0) : 0, () => paintWhaleHalo(g, gtok, p, bs), p._animWhaleLit, 1);   // 4th arg = HUE-LOCKED lift: the crown is the one place gruff wanted bullion gold instead of lemon
    _sn('wall/whale', g);
    // 5. rainbow vomit (top-most; rolled with the face for DEGEN)
    paintVomit(g, p, bs, rad);               _sn('vomit', g);
    paintEyeIcons(g, p, anchors);            _sn('eyeIcons', g);   // crisp star/heart/dollar block icons
    paintClosedEyes(g, p, anchors);          _sn('closedEyes', g);   // simple closed-eye bars
    paintCalm(g, p, anchors);                _sn('calm', g);   // CALM: explicit 2x2 iris blocks + recess
    paintXEyes(g, p, anchors);               _sn('xEyes', g);   // X EYES: explicit facet-toned + cross per eye
    rec(TAG ? (p._animLaser || 0) : 0, () => paintLaser(g, p, anchors), p._animLaserLit);   _sn('laser', g);   // LASER: red 2x2 per eye + the ~1s burn on top
    paintSpiral(g, p, anchors);              _sn('spiral', g);   // SPIRAL: 4 white diagonal blocks over the dark socket
    paintMouth(g, p, anchors);               _sn('mouth', g);   // explicit block mouths (bigger + distinct)
    paintBrows(g, p, anchors);               _sn('brows', g);   // explicit sad/skeptical eyebrows (bold, readable on the grid)
    paintTraitPieces(g, p, anchors);         _sn('traitPieces', g);   // NEW eye/mouth trait pieces LAST -> face features stay visible OVER the collector wall / crown / target
    if (facet === 'DEGEN' && !p._forge_clean) paintGlitch(g, p);   _sn('glitch', g);   // DEGEN: chromatic-split glitch (rgb_offset>0 only). _forge_clean skips it for MIXED forges (apex MELTDOWN leaves it unset -> keeps glitch). Byte-identical for base tokens.
    let svg = rleSVG(g, p.bg, TAG ? ANIM.style(_anim) : '');
    const _fin = forgeFinishSVG(p); if (_fin) svg = svg.replace('</svg>', _fin + '</svg>');   // FORGE finish frame (thin, on top); p._forge_finish only set by the forge -> base byte-identical
    V7.cache.set(key, svg);
    return svg;
  }

  function install(G, GRID) {
    if (GRID) { V7.GRID = GRID; CELL = V7.S / V7.GRID; }
    if (!G._svgRaw) G._svgRaw = G.svg;
    G.svg = function (gtok) { return V7.enabled ? render(gtok) : G._svgRaw(gtok); };
    return V7;
  }

  window.RENDER_V7 = Object.assign(V7, {
    render: render, install: install, rleSVG: rleSVG,
    // defaultsFor added 2026-08-03 so a harness can rebuild the SAME merged params the renderer uses and read the
    // raw brightness field out of the engine — that is the only way to diff "what number did each side compute"
    // against the contract's cellProbe instead of diffing output pixels. Exposing a function changes no output.
    _prim: { newGrid, setCell, rasterRect, writeCell, computeBrightnessField, getAnchors, hashNoise, blendOverBg, shadeHex, quantize5, hexToRgb, defaultsFor, buildFaceMaps, CELL: () => CELL },
    // _anim added 2026-08-04 so the review lab can force ONE whale-crown candidate across many tokens
    // (it splices ANIM.crownPool). Exposing an object emits nothing on its own, exactly like _prim above.
    _anim: ANIM
  });
})();
