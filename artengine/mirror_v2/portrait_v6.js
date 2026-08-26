// MIRROR v6 - Disco Tile Portrait
// All elements composed of small square tiles. Brightness field
// driven by face anatomy + data. Face emerges from the tile pattern.

const MIRROR_PORTRAIT_V6 = (() => {

  function project(x, y, z, yaw, pitch) {
    let x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
    let z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    let y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
    let z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
    return [x1, y2, z2];
  }

  const CX = 500, CY = 500, R = 220;   // figure centered on canvas (was CY=420; meters removed so safe)

  function getAnchors(yawDeg, pitchDeg) {
    const yaw   = yawDeg   * Math.PI / 180;
    const pitch = pitchDeg * Math.PI / 180;
    const toScr = (q) => [CX + q[0], CY - q[1], q[2]];

    const eyeLat = -0.02;
    const eyeLon = 0.44;
    const eyeY3  = R * Math.sin(eyeLat);
    const eyeXZ  = R * Math.cos(eyeLat);
    const eyeL = toScr(project(-eyeXZ * Math.sin(eyeLon), eyeY3, eyeXZ * Math.cos(eyeLon), yaw, pitch));
    const eyeR = toScr(project( eyeXZ * Math.sin(eyeLon), eyeY3, eyeXZ * Math.cos(eyeLon), yaw, pitch));
    const nose  = toScr(project(0, -R * 0.42, R * 0.95, yaw, pitch));
    const mouth = toScr(project(0, -R * 0.85, R * 0.50, yaw, pitch));
    const chin  = toScr(project(0, -R * 1.08, R * 0.30, yaw, pitch));
    const hingeLat = -0.38;
    const hingeXZ  = R * Math.cos(hingeLat);
    const hingeY3  = R * Math.sin(hingeLat);
    const hingeL = toScr(project(-hingeXZ, hingeY3, 0, yaw, pitch));
    const hingeR = toScr(project( hingeXZ, hingeY3, 0, yaw, pitch));
    const gonialL = toScr(project(-R * 0.66, -R * 0.80, R * 0.22, yaw, pitch));
    const gonialR = toScr(project( R * 0.66, -R * 0.80, R * 0.22, yaw, pitch));
    return { eyeL, eyeR, nose, mouth, chin, hingeL, hingeR, gonialL, gonialR, yaw, pitch };
  }

  function mulberry32(seed) {
    let s = (seed | 0) || 1;
    return function() {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  // Position-based hash noise (head-local coordinate stays consistent
  // across renders; lets the disco shimmer pattern rotate with the head).
  function hashNoise(x, y, seed) {
    const ix = Math.floor(x) | 0;
    const iy = Math.floor(y) | 0;
    let h = (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ (seed | 0)) | 0;   // 2026-07-01: Math.imul (true 32-bit) = integer-canonical so the Solidity on-chain port reproduces it EXACTLY (was bare * with float64 overflow). User-approved (imperceptible speckle reshuffle, equal quality).
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) | 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // FEATURE-CELL GUARANTEE (2026-06-28): a small detail (eye iris, cigar ember, drool drip, gold teeth) is ~1 cell; at
  // coarse block sizes its region can fall BETWEEN grid cells and vanish. _snapCell = "is this cell the one nearest the
  // feature centre?" -> force that cell to be the feature so it ALWAYS renders >=1 cell. cx,cy = cell centre; fx,fy = feature centre.
  function _snapCell(cx, cy, fx, fy, bs) { return Math.round(cx / bs - 0.5) === Math.round(fx / bs - 0.5) && Math.round(cy / bs - 0.5) === Math.round(fy / bs - 0.5); }
  function computeBrightnessField(anchors, p) {
    const jawPoly = [anchors.hingeL, anchors.gonialL, anchors.chin, anchors.gonialR, anchors.hingeR];
    const lightSign = Math.sin(anchors.yaw);
    // eye light direction (screen space, POSE-AWARE): horizontal follows the head turn (same side the face is lit),
    // plus a from-above bias and a small tilt from pitch. Used to shade the eyeball like a lit sphere.
    const _eLx = lightSign * 0.9, _eLy = -0.62 + Math.sin(anchors.pitch) * 0.35, _eLm = Math.hypot(_eLx, _eLy) || 1;
    const eyeLightX = _eLx / _eLm, eyeLightY = _eLy / _eLm;
    // BANDIT mask geometry (constant per face). The band + eyes are rendered INTEGRALLY in cellFill (the face's own
    // cells / grid / run-merge), NOT a pasted overlay. Sizes use p.block_size so the band reads at any block.
    const banditOn = p.eye_mask === 'bandit' || p.eye_mask === 'visor';   // both use the mask BAND geometry (visor = band + scanner bar)
    const _bbs = p.block_size || 14;
    const _bMy = (anchors.eyeL[1] + anchors.eyeR[1]) / 2;            // band vertical center (eye line)
    const _bH2 = Math.max(_bbs * 1.4, 44) / 2;                       // half band height
    const _bX0 = Math.min(anchors.eyeL[0], anchors.eyeR[0]) - _bbs * 2.4;
    const _bX1 = Math.max(anchors.eyeL[0], anchors.eyeR[0]) + _bbs * 2.4;
    const _bRedR = Math.max(_bbs * 0.55, 9);                         // glowing-eye radius
    // Pre-compute rotation factors so the noise pattern rotates with the head
    const cosY = Math.cos(anchors.yaw);
    const sinY = Math.sin(anchors.yaw);
    const cosP = Math.cos(anchors.pitch);
    const sinP = Math.sin(anchors.pitch);

    return function(x, y) {
      let b = 0;
      let kind = 'fg';
      let eyeDx = 0, eyeDy = 0, eyeRR = 0, eyeSide = 0;   // offset of an eye cell from its anchor (for in-grid eye shading); eyeSide: -1 left / +1 right
      let mouthT = false;                            // mouth teeth/stitch/tool/fang cell (coloured in cellFill)
      let mouthD = false;                            // mouth dark cell (solid dark, like the eye sockets)
      let mouthR = false;                            // mouth BLOOD/tongue/kiss/drool cell (textured colour in cellFill)
      let mouthTip = false;                          // cigar ember / vape smoke accent cell
      let mouthU = 0;                                // horizontal position across the mouth (-1..1) for pose-aware tooth/recess shading
      const dxS = x - CX;
      const dyS = y - CY;
      const rS  = Math.sqrt(dxS * dxS + dyS * dyS);
      const inSkull = rS < R;
      const inJaw = pointInPoly(x, y, jawPoly);
      const inFace = inSkull || inJaw;
      // RAINBOW VOMIT stream moved to the TOP-LAYER vomitTiles() (2026-06-28): it is drawn LAST (over wall / whale halo / frame)
      // so it ALWAYS sits ON TOP -> never cut by, nor muted under, the whale halo; and it pours straight DOWN (gravity) outside the
      // roll group, so a rolled face no longer tilts the stream off the canvas (no bottom gap). The mouth's dark open slot still lives in the face below.
      if (!inFace) return { b: 0, kind };

      b = 0.55;

      const dEL = Math.hypot(x - anchors.eyeL[0], y - anchors.eyeL[1]);
      const dER = Math.hypot(x - anchors.eyeR[0], y - anchors.eyeR[1]);
      const eyeReach = 38 + p.eye_size_extra * 12;
      // record the eye offset for the CORE (t>0.6 = kind 'eye') AND a thin outer band (t>0.45) so cellFill can
      // both bite the edge in and poke a few stray blocks out -> organic, broken-up eye instead of a clean disc.
      if (dEL < eyeReach) { const t = 1 - dEL / eyeReach; b -= 0.85 * t; if (t > 0.45) { eyeDx = x - anchors.eyeL[0]; eyeDy = y - anchors.eyeL[1]; eyeRR = eyeReach; eyeSide = -1; if (t > 0.6) kind = 'eye'; } }
      if (dER < eyeReach) { const t = 1 - dER / eyeReach; b -= 0.85 * t; if (t > 0.45) { eyeDx = x - anchors.eyeR[0]; eyeDy = y - anchors.eyeR[1]; eyeRR = eyeReach; eyeSide = 1; if (t > 0.6) kind = 'eye'; } }

      // MOUTH: style-driven expression (universal Mouth trait). No style -> the original fixed shadow (unchanged).
      const mst = p.mouth_style || null;
      if (!mst) {
        const dM = Math.hypot(x - anchors.mouth[0], (y - anchors.mouth[1]) * 2.5);
        if (dM < 38) { const t = 1 - dM / 38; b -= 0.55 * t * p.mouth_intensity; }
      } else if (mst !== 'none') {
        const bsM = p._bs || 16;
        const mdx = x - anchors.mouth[0];
        const mw = p.mouth_w || 56;
        const u = Math.max(-1, Math.min(1, mdx / mw));
        mouthU = u;                                   // expose for pose-aware tooth/recess shading in mouthCellColor
        // curve>0 lifts the corners (smile), <0 drops them (frown); asym tilts one corner (smirk/knowing)
        // base sits ABOVE the raw mouth anchor (-34) so expressions stay on the face, clear of the jaw edge
        const yEff = anchors.mouth[1] - 34 + (p.mouth_curve || 0) * (u * u - 0.5) + (p.mouth_asym || 0) * u;
        const mdy = y - yEff;
        // bs-aware geometry (the EYES rule): half-height >= half a cell so the mouth is ALWAYS a clean continuous
        // row (never vanishes / never a fat slab); tooth period scales with block size (no aliasing at coarse blocks).
        const hThin = Math.max(11, bsM * 0.55);
        const toothPer = Math.max(26, bsM * 1.5);
        const toothHit = w => Math.abs(((mdx % toothPer) + toothPer) % toothPer) < toothPer * w;
        // SOFT SHADOW around the mouth (like the eye socket) -> depth so the mouth never reads as pasted-on. Elliptical
        // and anchored to yEff, so it follows the pose + expression. Open styles cast a slightly deeper recess.
        const deep = ((mst === 'open' || mst === 'vomit' || mst === 'feral' || mst === 'grit' || mst === 'seal' || (p.mouth_open_band || 0) > 0) ? 0.62 : 0.45) * (p.mouth_shadow != null ? p.mouth_shadow : 1);
        const dShadow = Math.hypot(mdx / (mw * 1.25), mdy / Math.max(26, hThin * 2.3));
        if (dShadow < 1) b -= deep * (1 - dShadow);
        // dark parts are SOLID dark cells (mouthD, like the eyes/bandit band) -> crisp on the noisy mosaic, not lost holes
        if (mst === 'vomit') {                                 // wide FLAT open mouth (matches the waterfall width) -> stream pours from it
          const sh = bsM * 2.0;
          if (Math.abs(mdx) < sh && Math.abs(mdy) < Math.max(hThin * 1.3, p.mouth_open || 14)) mouthD = true;
        } else if (mst === 'open') {                           // round open hole (Open / Awe / Appraising)
          const orad = p.mouth_open || 22;
          if (Math.hypot(mdx, mdy * 1.15) < Math.max(orad, hThin)) mouthD = true;
        } else if (mst === 'grit') {                           // clenched teeth INSIDE a dark mouth (Gritted / Gold Grill)
          const bandH = Math.max(22, hThin + 9);               // tall dark mouth band -> the teeth sit in a recess (depth holds at big blocks)
          if (Math.abs(mdx) <= mw && Math.abs(mdy) < bandH) {
            if (Math.abs(mdy) < bandH * 0.5 && !toothHit(0.24)) mouthT = true;   // central segmented tooth line (light)
            else mouthD = true;                                                  // dark frame above/below + separators = depth
          }
        } else if (mst === 'feral') {                          // FERAL: bloody snarl -> dark maw + top&bottom fangs + thick blood ring + drips
          const open = p.mouth_open || 20;
          const dOval = Math.hypot(mdx, mdy * 1.2);
          if (dOval < open) {                                                        // inside the maw
            if (Math.abs(Math.abs(mdy) - open * 0.6) < open * 0.3 && toothHit(0.32)) mouthT = true;   // top + bottom fang rows (white)
            else mouthD = true;                                                      // dark maw
          } else if (dOval < open + Math.max(13, hThin)) mouthR = true;              // thick blood ring around the whole mouth
          else if (Math.abs(Math.abs(mdx) - mw * 0.5) < hThin * 0.9 && mdy > 0 && mdy < open + 30) mouthR = true;  // 2 blood drips down from the corners
        } else if (mst === 'fangs') {                          // VAMPIRE: thin lip + two white fangs hanging down
          if (Math.abs(mdx) <= mw && Math.abs(mdy) < hThin * 0.8) mouthD = true;
          const fx = mw * 0.46;
          [-fx, fx].forEach(c => { if (Math.abs(mdx - c) < hThin * 0.7 && mdy > 0 && mdy < hThin * 2.6) mouthT = true; });
        } else if (mst === 'tongue') {                         // PLAYFUL: small open mouth + a WIDE red tongue lolling out
          if (Math.abs(mdx) <= mw * 0.85 && Math.abs(mdy) < hThin) mouthD = true;
          if (Math.abs(mdx) < hThin * 1.8 && mdy > -hThin * 0.3 && mdy < hThin * 3.0) mouthR = true;
        } else if (mst === 'seal') {                           // sealed line + stitch bars
          if (Math.abs(mdx) <= mw && Math.abs(mdy) < hThin) mouthD = true;
          else if (Math.abs(mdx) <= mw && toothHit(0.3) && Math.abs(mdy) < hThin * 1.9) mouthT = true;
        } else if (mst === 'tool') {                           // small mouth + held stick out the right corner (Builder)
          if (Math.hypot(mdx, mdy * 2.2) < Math.max(30, hThin)) mouthD = true;
          const tdx = mdx - mw * 0.5;
          if (tdx > -6 && tdx < mw * 1.3 && Math.abs(mdy + tdx * 0.6) < hThin) mouthT = true;
        } else if (mst === 'cigar') {                          // small mouth + a cigar out the right corner + ember tip
          if (Math.hypot(mdx + mw * 0.35, mdy * 2.0) < Math.max(22, hThin)) mouthD = true;
          const cdx = mdx - mw * 0.1;
          if (cdx > 0 && cdx < mw * 1.3 && Math.abs(mdy - cdx * 0.16) < Math.max(hThin * 0.62, bsM * 0.5)) { if (cdx > mw * 0.95) mouthTip = true; else mouthT = true; }   // 2026-06-28: SHORTER cigar (ember near the mouth, not floating far) + stick band >= ~1 cell so the stick never drops at coarse blocks (ember stays connected)
        } else if (mst === 'kiss') {                           // puckered lips: pink ring + dark centre
          const dk = Math.hypot(mdx, mdy * 1.3);
          if (dk < Math.max(hThin * 0.45, 6)) mouthD = true;
          else if (dk < Math.max(hThin * 1.3, 17)) mouthR = true;
        } else if (mst === 'zipper') {                         // zipped shut: dark line + dense metal teeth across
          if (Math.abs(mdx) <= mw && Math.abs(mdy) < hThin * 1.35) { mouthD = true; if (toothHit(0.42)) mouthT = true; }
        } else if (mst === 'drool') {                          // small mouth + a drool drip down one corner
          if (Math.abs(mdx) <= mw * 0.8 && Math.abs(mdy) < hThin * 0.9) mouthD = true;
          const ddx = mdx - mw * 0.45;
          if (Math.abs(ddx) < hThin * 0.55 && mdy > 0 && mdy < hThin * 3.4) mouthR = true;
        } else {                                               // 'flat' family: Stoic/gm/Smile/Grin/Frown
          if (Math.abs(mdx) <= mw) {
            const band = p.mouth_open_band || 0;               // Grin/Manic: open teeth band
            if (band > 0) {
              const bh = Math.max(band * 0.55, hThin);
              if (Math.abs(mdy) < bh) { if (toothHit(0.2)) mouthD = true; else mouthT = true; }   // SEGMENTED teeth (separators = depth)
              else if (Math.abs(mdy) < bh + hThin + 2) mouthD = true;                              // dark lip frame above + below = depth (no pasted bar)
            } else if (Math.abs(mdy) < hThin) {
              mouthD = true;
            }
          }
        }
        // MOUTH feature-cell guarantee (2026-06-28): force the cell nearest each thin feature's centre so it NEVER drops at coarse block sizes (cigar ember / drool drip / kiss ring / gold-grill tooth). No-op at fine/mid blocks.
        { const _mx = anchors.mouth[0]; const _yEff = uu => anchors.mouth[1] - 34 + (p.mouth_curve || 0) * (uu * uu - 0.5) + (p.mouth_asym || 0) * uu;
          if (mst === 'cigar') { if (_snapCell(x, y, _mx + mw * 1.2, _yEff(1) + mw * 0.176, bsM)) mouthTip = true; else if (_snapCell(x, y, _mx + mw * 0.4, _yEff(0.4) + mw * 0.048, bsM)) mouthT = true; }   // ember NEAR the mouth + a stick cell so the cigar stays connected
          else if (mst === 'drool') { if (_snapCell(x, y, _mx + mw * 0.45, _yEff(0.45) + hThin * 1.7, bsM)) mouthR = true; }
          else if (mst === 'kiss') { if (_snapCell(x, y, _mx, _yEff(0) + hThin * 0.67, bsM)) mouthR = true; }
          else if (mst === 'grit') { for (const _go of [-0.7, 0.7]) if (_snapCell(x, y, _mx + toothPer * _go, _yEff(toothPer * _go / mw), bsM)) mouthT = true; }   // two teeth so the gold grill stays GOLD (>=2 cells) at coarse blocks
        }
      }

      const browY = (anchors.eyeL[1] + anchors.eyeR[1]) / 2 - 28;
      if (Math.abs(y - browY) < 8 && Math.abs(x - CX) < R * 0.65) {
        b -= 0.20 * p.brow_intensity;
      }

      const ckXl = anchors.eyeL[0] - 25;
      const ckYl = anchors.eyeL[1] + 35;
      const ckXr = anchors.eyeR[0] + 25;
      const ckYr = anchors.eyeR[1] + 35;
      const dCheekL = distToSegment(x, y, ckXl, ckYl, anchors.gonialL[0], anchors.gonialL[1]);
      const dCheekR = distToSegment(x, y, ckXr, ckYr, anchors.gonialR[0], anchors.gonialR[1]);
      if (dCheekL < 12) b += 0.30 * p.cheekbone_intensity * (1 - dCheekL / 12);
      if (dCheekR < 12) b += 0.30 * p.cheekbone_intensity * (1 - dCheekR / 12);

      const dChin = Math.hypot(x - anchors.chin[0], (y - anchors.chin[1] - 20));
      if (dChin < 60) b -= 0.30 * (1 - dChin / 60) * p.chin_intensity;

      const dFh = Math.hypot(x - CX, y - (CY - R * 0.6));
      if (dFh < 50) b += 0.15 * (1 - dFh / 50) * p.forehead_intensity;

      const sideN = dxS / R;
      if (lightSign * sideN > 0.4) {
        b += 0.25 * Math.abs(sideN) * Math.abs(lightSign);
      }

      // ---- HEAD-LOCAL noise coordinates ----
      // Rotate (dxS, dyS) by -yaw so the noise pattern visually rotates WITH the head.
      // Pitch foreshortens Y axis.
      const localX = dxS * cosY + dyS * sinY;
      const localY = (-dxS * sinY + dyS * cosY) * cosP;

      // Shimmer: per-tile brightness wobble (head-local)
      const shimN = hashNoise(localX / 6, localY / 6, p.seed);
      b += (shimN - 0.5) * (0.25 + p.shimmer * 0.20);

      // Aging dirt: head-local
      if (p.aging_strength > 0) {
        const ageN = hashNoise(localX / 11, localY / 11, p.seed + 41);
        if (ageN < p.aging_strength * 0.25) {
          b -= hashNoise(localX, localY, p.seed + 17) * 0.35;
          if (hashNoise(localX, localY, p.seed + 23) < 0.5) kind = 'shadow';
        }
      }

      // Highlight catch-light: head-local
      const hlN = hashNoise(localX / 8, localY / 8, p.seed + 137);
      if (hlN < p.highlight_chance) {
        b += 0.30 + hashNoise(localX, localY, p.seed + 71) * 0.25;
        kind = 'accent';
      }

      let maskBand = false, maskEye = false, scanBar = false;
      if (banditOn) {
        if (p.eye_mask === 'bandit' && (Math.hypot(x - anchors.eyeL[0], y - anchors.eyeL[1]) <= _bRedR || Math.hypot(x - anchors.eyeR[0], y - anchors.eyeR[1]) <= _bRedR)) maskEye = true;   // bandit: glowing eye dots
        else if (Math.abs(y - _bMy) <= _bH2 && x >= _bX0 && x <= _bX1) { maskBand = true; if (p.eye_mask === 'visor' && Math.abs(y - _bMy) <= _bbs * 0.65) scanBar = true; }   // visor: central scanner stripe
      }
      // GUARANTEE each eye renders at least its CENTRE cell (coarse blocks can drop a 1-cell eye -> missing iris / a 1-eye Bandit). No-op at fine/mid blocks (the cell is already an eye there).
      { const _gbs = p._bs || 16;
        for (const [ex, ey, side] of [[anchors.eyeL[0], anchors.eyeL[1], -1], [anchors.eyeR[0], anchors.eyeR[1], 1]]) {
          if (!_snapCell(x, y, ex, ey, _gbs)) continue;
          if (banditOn && p.eye_mask === 'bandit') maskEye = true;
          else if (kind !== 'eye' && (p.eye_fill_color || p.eye_style)) { kind = 'eye'; eyeDx = 0; eyeDy = 0; eyeRR = eyeReach; eyeSide = side; }
        }
      }
      return { b: Math.max(0, Math.min(1, b)), kind, eyeDx, eyeDy, eyeRR, eyeSide, eyeLX: eyeLightX, eyeLY: eyeLightY, maskBand, maskEye, scanBar, mouthT, mouthD, mouthR, mouthTip, mouthU };
    };
  }

  function splatterTiles(p, bs, rng) {
    // DEGEN tx-history splatter: GREEN = successful tx, RED = failed/rekt tx, scattered around the head.
    // splat_green / splat_red give the counts; legacy p.splatters falls back to all-red.
    const greenN = p.splat_green || 0;
    const goldN = p.splat_gold || 0;                      // rare "jackpot" / 100x trade dots
    const redN = (p.splat_red != null) ? p.splat_red : (p.splatters || 0);
    const total = greenN + goldN + redN;
    if (total < 1) return '';
    const GREEN = '#39ff14', RED = '#fe0000', GOLD = '#fcb913';
    let s = '';
    for (let i = 0; i < total; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = p.splat_on_face ? (R * 0.15 + rng() * (R + 170)) : (R + 34 + rng() * 230);   // extreme PnL floods ONTO the face; else a bg cloud
      const x = Math.round((CX + Math.cos(angle) * dist) / bs) * bs;
      const y = Math.round((CY + Math.sin(angle) * dist) / bs) * bs;
      if (x < 0 || x >= 1000 || y < 0 || y >= 1000) continue;
      if (!p.splat_on_face && Math.hypot(x + bs / 2 - CX, y + bs / 2 - CY) < R + 14) continue;   // off-face unless flooding
      const col = i < greenN ? GREEN : (i < greenN + goldN ? GOLD : RED);
      let sz = bs - 1, ox = 0;
      if (p.splat_gold_varied) { sz = Math.max(3, Math.round(bs * (0.35 + rng() * 0.65))); ox = Math.round((bs - sz) / 2); }   // Up Only: confetti varies mini -> full size
      s += '<rect x="' + (x + ox) + '" y="' + (y + ox) + '" width="' + sz + '" height="' + sz + '" fill="' + col + '"/>';
    }
    return s;
  }

  // NEWBIE sparks: bright BLOCKS in the void around the emerging face. Each spark is either a SINGLE block or TWO blocks
  // joined DIAGONALLY (corner to corner). White or green (gold for the lone One). Sparks never overlap or touch each other.
  function sparkTiles(p, bs, rng) {
    const n = p.spark_count || 0;
    if (n < 1) return '';
    // NEWBIE FRAGMENTS (Form): real PIECES of the figure flung into the void (2026-06-30 user) — the figure's OWN colours
    // (face_palette, so they match the Bloom shade), the SAME block size as a face cell, scattered RANDOMLY (no shiny sparkle pairs).
    const COLS = (p.face_palette && p.face_palette.length) ? p.face_palette : ((p.spark_colors && p.spark_colors.length) ? p.spark_colors : ['#5fe39a']);
    const b = bs, placed = [], GAP = bs * 0.3;
    const rect = (x, y, c) => '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (b - 1).toFixed(1) + '" height="' + (b - 1).toFixed(1) + '" fill="' + c + '"/>';
    let s = '';
    for (let i = 0; i < n; i++) {
      const col = COLS[Math.floor(rng() * COLS.length)];
      let cx = 0, cy = 0, bb = null, ok = false;
      for (let a = 0; a < 30 && !ok; a++) {
        const angle = rng() * Math.PI * 2, dist = R + 8 + Math.pow(rng(), 1.5) * 300;   // FLUNG: most pieces near the figure, some far out -> organic scatter (varies per seed)
        cx = CX + Math.cos(angle) * dist; cy = CY + Math.sin(angle) * dist;
        if (p._bg_pat === 'grid' && p._bg_gn) {   // RAINBOW GRID bg -> drop the fragment INTO a grid gap (off the coloured lines) for a cleaner look
          const bgc = 1000 / p._bg_gn; let bgx = Math.floor(cx / bgc), bgy = Math.floor(cy / bgc);
          if (bgx % 3 === 0) bgx += (bgx + 1 < p._bg_gn ? 1 : -1);
          if (bgy % 3 === 0) bgy += (bgy + 1 < p._bg_gn ? 1 : -1);
          cx = (bgx + 0.5) * bgc; cy = (bgy + 0.5) * bgc;
        }
        bb = [cx - b / 2, cy - b / 2, cx + b / 2, cy + b / 2];
        if (bb[0] < 8 || bb[2] > 992 || bb[1] < 8 || bb[3] > 992) continue;            // inside canvas
        if (Math.hypot(cx - CX, cy - CY) < R + 10) continue;                           // off the figure
        let clash = false;
        for (let q = 0; q < placed.length; q++) { const o = placed[q]; if (!(bb[2] + GAP < o[0] || bb[0] - GAP > o[2] || bb[3] + GAP < o[1] || bb[1] - GAP > o[3])) { clash = true; break; } }
        if (!clash) ok = true;
      }
      if (!ok) continue;
      placed.push(bb);
      s += rect(cx - b / 2, cy - b / 2, col);   // single bs-cell piece
    }
    return s;
  }

  // OG cracks (Kintsugi): jagged contiguous fissures across the face. p.cracks = {count, goldFrac}. Each cell is
  // shaded by the FACE brightness at that point (3D: lit areas lighter, shadow areas darker) for both black + gold.
  function crackPath(rng, bs) {
    const a0 = rng() * Math.PI * 2;
    let gx = Math.round((CX + Math.cos(a0) * (R - 6)) / bs), gy = Math.round((CY + Math.sin(a0) * (R - 6)) / bs);
    const tgx = Math.round((CX - Math.cos(a0) * (R - 6)) / bs), tgy = Math.round((CY - Math.sin(a0) * (R - 6)) / bs);
    const out = []; let guard = 0;
    while ((gx !== tgx || gy !== tgy) && guard++ < 90) {
      if (Math.hypot(gx * bs + bs / 2 - CX, gy * bs + bs / 2 - CY) <= R - 2) out.push([gx * bs, gy * bs]);   // 2026-07-11: SKIP an out-of-head cell instead of BREAKING the whole crack. At coarse blocks (bs>=30) the ROUNDED end cell overshoots R-2 and used to truncate the entire crack (0 gold cells on bs 34/36). Now the inside portion always draws. Surgical: tokens whose crack never overshot are byte-identical (loop still runs to the same end).
      const dx = tgx - gx, dy = tgy - gy;
      if (Math.abs(dx) > Math.abs(dy)) { gx += Math.sign(dx); if (rng() < 0.45) gy += (rng() < 0.5 ? 1 : -1); }
      else { gy += Math.sign(dy); if (rng() < 0.45) gx += (rng() < 0.5 ? 1 : -1); }
    }
    return out;
  }
  // (crackTiles separate-pass removed 2026-06-08: cracks are now rendered inside renderFaceTiles/cellFill so they
  //  break the run-merge and read as REAL face blocks, not a pasted overlay. crackPath above is reused there.)

  // DEGEN PnL overlay: fracture/vein lines over the face. Rekt = red liquidation fractures, Up Only = gold veins.
  // Drawn ON TOP of the (glitch) face as a separate layer so the RGB-split filter doesn't distort the colour.
  function pnlOverlayTiles(p, bs) {
    if (!p.pnl_veins) return '';
    const rng = mulberry32((p.seed | 0) + 6161);
    const col = p.pnl_veins.color, n = p.pnl_veins.count || 3;
    let s = '';
    for (let i = 0; i < n; i++) for (const c of crackPath(rng, bs)) s += '<rect x="' + c[0] + '" y="' + c[1] + '" width="' + (bs - 1) + '" height="' + (bs - 1) + '" fill="' + col + '"/>';
    return s;
  }

  // GHOST outline: a single row of cells hugging the OUTSIDE of the face silhouette (head circle + jaw), like a
  // tight contour. Base collection: single colour (p.ghost_outline). FORGE: multi-colour palette
  // (p.ghost_outline_pal) arranged by p.ghost_outline_mode (c arc · lr · up · diag · x · random) + opacity
  // play by p.ghost_outline_op (up gradient · pulse · random) — same vocabulary as the rich halo.
  function ghostOutline(p, bs, anchors) {
    const pal = (p.ghost_outline_pal && p.ghost_outline_pal.length) ? p.ghost_outline_pal : (p.ghost_outline ? [p.ghost_outline] : null);
    if (!pal) return '';
    const np = pal.length;
    const colMode = (np > 1) ? (p.ghost_outline_mode || 'c') : 'solid';   // multi-colour arrangement (forge) vs single colour (base)
    const opMode = p.ghost_outline_op || null;                            // up · pulse · random
    const baseOp = (p.ghost_outline_opacity != null) ? p.ghost_outline_opacity : 1;
    const rot = p.ghost_outline_rot || 0;
    const hseed = (p.seed | 0) + 7711;
    const jaw = [anchors.hingeL, anchors.gonialL, anchors.chin, anchors.gonialR, anchors.hingeR];
    const inFace = (x, y) => Math.hypot(x - CX, y - CY) < R || pointInPoly(x, y, jaw);   // contour hugs the silhouette
    const cols = Math.ceil(1000 / bs), rows = Math.ceil(1000 / bs);
    // 1) collect the contour cells (the row hugging the silhouette)
    const cells = []; let miny = 1e9, maxy = -1e9;
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      const cx = gx * bs + bs / 2, cy = gy * bs + bs / 2;
      if (inFace(cx, cy)) continue;                                  // only OUTSIDE the silhouette
      if (inFace(cx - bs, cy) || inFace(cx + bs, cy) || inFace(cx, cy - bs) || inFace(cx, cy + bs) ||
          inFace(cx - bs, cy - bs) || inFace(cx + bs, cy - bs) || inFace(cx - bs, cy + bs) || inFace(cx + bs, cy + bs)) {
        cells.push({ gx, gy, cx, cy }); if (cy < miny) miny = cy; if (cy > maxy) maxy = cy;
      }
    }
    const yspan = maxy > miny ? maxy - miny : 1;
    // 2) colour + opacity per cell by mode; group by "colour|op" for byte size (like the halo)
    const buckets = {};
    cells.forEach(c => {
      const dx = c.cx - CX, dy = c.cy - CY; let ci;
      switch (colMode) {
        case 'solid':  ci = 0; break;
        case 'lr':     ci = Math.floor((c.cx / 1000) * np); break;
        case 'up':     ci = Math.floor(((c.cy - miny) / yspan) * np); break;
        case 'diag':   ci = Math.floor(((c.cx + c.cy) / 2000) * np); break;
        case 'x':      ci = ((Math.abs(dx) > Math.abs(dy)) ? 0 : 1) * 2 + (((dx > 0) === (dy > 0)) ? 0 : 1); break;
        case 'random': ci = Math.floor(hashNoise(c.gx, c.gy, hseed) * np); break;
        default:       ci = Math.floor(((Math.atan2(dy, dx) / (2 * Math.PI)) + 0.5) * np);   // 'c' arc -> palette wraps around the silhouette
      }
      const col = pal[(((ci + rot) % np) + np) % np];
      let op = baseOp;
      if (opMode === 'up') op = baseOp * (0.4 + 0.6 * (1 - (c.cy - miny) / yspan));          // bottom faint -> top bright
      else if (opMode === 'pulse') { const r = hashNoise(c.gx, c.gy, hseed + 1); op = baseOp * (r < 0.34 ? 1 : r < 0.67 ? 0.66 : 0.36); }
      else if (opMode === 'random') op = baseOp * (0.45 + 0.55 * hashNoise(c.gx, c.gy, hseed + 2));
      const ops = Math.max(0.14, Math.min(1, op)).toFixed(2);
      const k = col + '|' + ops; (buckets[k] = buckets[k] || []).push('<rect x="' + (c.gx * bs) + '" y="' + (c.gy * bs) + '" width="' + (bs - 1) + '" height="' + (bs - 1) + '"/>');
    });
    let s = '';
    for (const k in buckets) { const i = k.indexOf('|'), col = k.slice(0, i), op = k.slice(i + 1); s += '<g fill="' + col + '"' + (op === '1.00' ? '' : ' opacity="' + op + '"') + '>' + buckets[k].join('') + '</g>'; }
    return s;
  }

  // Collection blocks: each block represents 1 NFT collection held by the wallet.
  // All blocks are palette colors. (Grail gold-tile marking removed 2026-05-30 —
  // grail_count retired; collector distinction now via sub-theme + collection_count.)
  // ADAPTIVE SHRINK: at 500+ collections, block size scales down linearly
  // (1.0 at <=500 → 0.5 at 1500+) to prevent overcrowding.
  // COLLECTION MONUMENT (COLLECTOR): the holdings build a block ARCHITECTURE rising behind
  // the portrait — the collector stands before their monument. Scale → grandeur:
  //   depth (block_vol, NFT count) → HEIGHT (a 19k collector towers; a 500 one is modest)
  //   breadth (color_blocks count) → number of columns (detail/width)
  //   block_layout (archetype) → the silhouette FORM:
  //     anchor=MAXI monolith · cluster=UZMAN spire · dense=GENELCI ziggurat · scatter=KASIF skyline
  //   block_palette → the archetype's color family. ~7-30 rects, byte-trivial.
  function collectionMonumentTiles(p, bs) {
    if (!p.collection_wall || (p.color_blocks || 0) < 1) return '';
    const pal = (p.block_palette && p.block_palette.length) ? p.block_palette : ['#fe0000', '#0101ef', '#fcb913', '#f0f0f0', '#efdfc8'];
    const layout = p.block_layout || 'scatter';
    const grandeur = Math.max(0.06, Math.min(1, p.block_vol || 0));     // depth → majesty/height
    const nCols = Math.max(7, Math.min(30, Math.round((p.color_blocks || 0) / 14)));  // breadth → columns
    const cw = 1000 / nCols;
    const gap = Math.max(1, Math.round(cw * 0.10));
    const maxH = 140 + grandeur * 820;                                  // 140..960 px (towering at high depth)
    const baseY = 1000;
    const rng = mulberry32((p.seed | 0) + 4242);
    let s = '';
    for (let i = 0; i < nCols; i++) {
      const x = i * cw;
      const u = Math.abs((x + cw / 2) - 500) / 500;                     // 0 center .. 1 edge
      let hf;
      if (layout === 'anchor')       hf = u < 0.30 ? 1 : 0.14;                          // MAXI monolith
      else if (layout === 'cluster') hf = u < 0.13 ? 1 : (u < 0.30 ? 0.5 : 0.14);       // UZMAN spire
      else if (layout === 'dense')   hf = Math.max(0.16, Math.ceil((1 - u) * 5) / 5);   // GENELCI ziggurat (tiers)
      else                           hf = 0.30 + 0.55 * rng();                          // KASIF skyline (jagged)
      let h = Math.round(hf * maxH / bs) * bs;
      if (h < bs) h = bs;
      const col = pal[Math.floor(rng() * pal.length)];
      s += '<rect x="' + Math.round(x) + '" y="' + (baseY - h) + '" width="' + Math.round(cw - gap) + '" height="' + h + '" fill="' + col + '"/>';
    }
    return s;
  }

  function colorBlockTiles(p, bs, rng) {
    if (p.collection_wall) return '';   // COLLECTOR uses the wall instead of scattered blocks
    if (p.color_blocks < 1) return '';
    let s = '';
    const defPal = [p.fg, p.accent_color || '#fcb913', '#0101ef', '#fe0000', '#f0f0f0'];
    const palette = (p.block_palette && p.block_palette.length) ? p.block_palette : defPal;
    const onFace = !!p.block_on_face;          // BUILDER: scatter ON the portrait (deploy = gold flecks woven into the face)
    const fixedCol = p.block_color || null;    // single color override (BUILDER = gold)
    const layout = p.block_layout || 'scatter';// COLLECTOR archetype: scatter | cluster | anchor | dense
    let blockScale = 1.0;
    if (p.color_blocks > 500) {
      blockScale = Math.max(0.5, 1.0 - (p.color_blocks - 500) * 0.5 / 1000);
    }
    const volScale = 1 + (p.block_vol || 0) * 1.8;   // COLLECTOR NFT volume → chunkier blocks (1x..2.8x)
    const blockSize = Math.max(3, Math.floor(bs * (onFace ? 0.7 : blockScale) * volScale) - 1);
    const BLOCK_RENDER_MAX = 400;
    const drawN = Math.min(p.color_blocks, BLOCK_RENDER_MAX);
    const exclR = R * 1.15;
    const BASE_RESERVED_Y = 900;
    const SUCC_X1 = 950 - bs, SUCC_X2 = 950, SUCC_Y1 = 200, SUCC_Y2 = 800;

    // MAXI: one big anchor block (the dominant collection), placed off-center near the head.
    if (layout === 'anchor') {
      const aSize = Math.floor(bs * 4.2);
      const ax = Math.round((CX + R * 0.7 - aSize / 2) / bs) * bs;
      const ay = Math.round((CY - R * 0.5 - aSize / 2) / bs) * bs;
      s += '<rect x="' + ax + '" y="' + ay + '" width="' + aSize + '" height="' + aSize + '" fill="' + (fixedCol || palette[0]) + '"/>';
    }

    for (let i = 0; i < drawN; i++) {
      let x, y;
      if (onFace) {
        // ON the face/base (BUILDER): uniform within head disc.
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * R * 0.92;
        x = Math.round((CX + Math.cos(a) * rr - bs / 2) / bs) * bs;
        y = Math.round((CY + Math.sin(a) * rr - bs / 2) / bs) * bs;
      } else if (layout === 'cluster') {
        // UZMAN: tight band hugging the head (focused, concentrated).
        const a = rng() * Math.PI * 2, rr = R * 1.18 + rng() * R * 0.4;
        x = Math.round((CX + Math.cos(a) * rr - bs / 2) / bs) * bs;
        y = Math.round((CY + Math.sin(a) * rr - bs / 2) / bs) * bs;
        if (y < 0 || y > BASE_RESERVED_Y || x < 0 || x >= 1000) continue;
      } else {
        // scatter / dense / anchor's small blocks: wide spread around the head.
        let attempts = 0;
        do {
          x = Math.floor(rng() * (1000 - bs));
          y = Math.floor(rng() * (BASE_RESERVED_Y - bs));
          const dxC = x + bs/2 - CX, dyC = y + bs/2 - CY;
          const inHead = dxC*dxC + dyC*dyC < exclR * exclR;
          const inSucc = x + bs > SUCC_X1 && x < SUCC_X2 && y + bs > SUCC_Y1 && y < SUCC_Y2;
          if (!inHead && !inSucc) break;
          attempts++;
        } while (attempts < 5);
        x = Math.round(x / bs) * bs;
        y = Math.round(y / bs) * bs;
        if (x < 0 || x >= 1000 || y < 0 || y >= BASE_RESERVED_Y) continue;
        if (x + bs > SUCC_X1 && x < SUCC_X2 && y + bs > SUCC_Y1 && y < SUCC_Y2) continue;
      }
      const col = fixedCol || palette[Math.floor(rng() * palette.length)];
      s += '<rect x="' + x + '" y="' + y + '" width="' + blockSize + '" height="' + blockSize + '" fill="' + col + '"/>';
    }
    return s;
  }

  // Halo rings: concentric arcs above the head. Count from first_tx_season (cap 11).
  // halo_opacity (0-1) multiplier from last_activity_days — dormant wallets have faded halo.
  // Color priority:
  //   1. halo_palette [array] → custom per-ring colors (NEWBIE red→orange, etc.)
  //   2. halo_rainbow=true → built-in 10-color rainbow (DEGEN)
  //   3. accent_color (default per lens)
  // CROWN halo: random blocks clustered on TOP of the head (hugging the upper arc), reading as hair / a hat.
  // A halo "shape" variant (p.halo_shape='crown') — no full ring, only the scalp band, density thinning toward the tips.
  function crownHalo(p, bs) {
    const RAINBOW = ['#fe0000', '#ff5500', '#ff8a00', '#fcb913', '#9dd812', '#16d34c', '#01b4ff', '#0101ef', '#5e00d4', '#ff00a0'];
    const palette = (p.halo_palette && p.halo_palette.length) ? p.halo_palette : (p.halo_rainbow ? RAINBOW : [p.accent_color || p.fg || '#cccccc']);
    const np = palette.length, haloOp = (p.halo_opacity != null) ? p.halo_opacity : 1;
    const hseed = (p.seed | 0) + 8821;
    const dens = (p.halo_crown_density != null) ? p.halo_crown_density : 0.5;
    const reach = (p.halo_crown_reach != null) ? p.halo_crown_reach : 1.8;   // tip height above the scalp
    const colMode = p.halo_col_mode || 'c', rot = p.halo_rot || 0;
    const cols = Math.ceil(1000 / bs), rows = Math.ceil(1000 / bs), maxBand = bs * reach * 2;
    const buckets = {};
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      const cx = gx * bs + bs / 2, cy = gy * bs + bs / 2;
      if (cy > CY) continue;                                   // upper half only
      const dx = cx - CX, dy = cy - CY, d = Math.hypot(dx, dy), band = d - R;   // 0 = on the scalp edge
      if (band < -bs * 0.3 || band > maxBand) continue;        // a band hugging the upper arc
      const ang = Math.atan2(dy, dx), topW = Math.cos(ang + Math.PI / 2);       // topW: 1 straight up, 0 at the sides
      if (topW < 0.30) continue;                               // TOP of the head ONLY (hair/hat) — not ear-to-ear
      const t = Math.max(0, Math.min(1, (band + bs * 0.3) / (maxBand + bs * 0.3)));     // 0 scalp -> 1 tip
      const localDens = dens * (1 - t * 0.6) * (0.35 + 0.65 * topW);                     // dense hair mass at the crown, thinning toward tips/edges
      if (hashNoise(gx, gy, hseed) >= localDens) continue;
      let ci;
      switch (colMode) {
        case 'lr':     ci = Math.floor((cx / 1000) * np); break;
        case 'random': ci = Math.floor(hashNoise(gx, gy, hseed + 3) * np); break;
        case 'up':     ci = Math.floor(t * np); break;
        default:       ci = Math.floor(((ang / Math.PI) + 1) * np);   // 'c' across the crown
      }
      const col = palette[(((ci + rot) % np) + np) % np];
      const op = Math.max(0.2, Math.min(1, haloOp * (0.55 + 0.45 * (1 - t)))).toFixed(2);
      const k = col + '|' + op; (buckets[k] = buckets[k] || []).push('<rect x="' + (gx * bs) + '" y="' + (gy * bs) + '" width="' + (bs - 1) + '" height="' + (bs - 1) + '"/>');
    }
    let s = '';
    for (const k in buckets) { const i = k.indexOf('|'); s += '<g fill="' + k.slice(0, i) + '" opacity="' + k.slice(i + 1) + '">' + buckets[k].join('') + '</g>'; }
    return s;
  }
  function haloRingTiles(p, bs) {
    if (p.halo_shape === 'crown') return crownHalo(p, bs);   // hair/hat halo variant
    if (p.halo_rings < 1) return '';
    let s = '';
    const RAINBOW = ['#fe0000', '#ff5500', '#ff8a00', '#fcb913', '#9dd812',
                     '#16d34c', '#01b4ff', '#0101ef', '#5e00d4', '#ff00a0'];
    let palette;
    if (p.halo_palette && p.halo_palette.length) {
      palette = p.halo_palette;
    } else if (p.halo_rainbow) {
      palette = RAINBOW;
    } else {
      palette = [p.accent_color || p.fg];
    }
    const haloOp = (p.halo_opacity != null) ? p.halo_opacity : 1.0;
    const np = palette.length, rings = p.halo_rings, hbs = bs, rot = p.halo_rot || 0;   // FINAL 2026-06-25 (Option A): halo block = FACE block (proportional, cohesive). Spacing auto-fits; the ring COUNT is capped at generation (haloMaxFit, budget 228) so the visible rings ALWAYS equal the Halo trait AND never overflow the canvas. Replaces the rejected fixed-16px grid.
    const _hbud = (p.halo_budget != null ? p.halo_budget : 228); let ringSpacing = rings > 1 ? _hbud / (rings - 1) : hbs; ringSpacing = Math.max(hbs, Math.min(ringSpacing, 1.3 * hbs));   // budget is per-facet (COLLECTOR=170 keeps the halo inside its gallery frame; default 228=canvas). Compact when few rings, spread-to-fit when many; floor at hbs so rings never merge
    const opMode = p.halo_op_mode || 'falloff';   // falloff · up (vertical gradient) · pulse (bright/dim/faint, random order) · random
    const colMode = p.halo_col_mode || 'rings';   // rings · lr · diag · c (arc) · x · random  -> light/dark + colour arrangement
    const hseed = (p.seed | 0) + 7331;
    const outR = R + 20 + (rings - 1) * ringSpacing;
    const ringOp = [];
    if (opMode === 'pulse') { const lv = [0.92, 0.55, 0.27]; const off = Math.floor(hashNoise(3, 0, hseed) * 3), dir = hashNoise(4, 0, hseed) < 0.5 ? 1 : -1; for (let i = 0; i < rings; i++) ringOp[i] = lv[(((i * dir + off) % 3) + 3) % 3]; }
    else if (opMode === 'random') { for (let i = 0; i < rings; i++) ringOp[i] = 0.28 + hashNoise(i, 0, hseed) * 0.62; }
    const buckets = {};   // "colour|op" -> rects (grouped for byte size)
    for (let i = 0; i < rings; i++) {
      const ringR = R + 20 + i * ringSpacing;
      const tiles = Math.floor(2 * Math.PI * ringR / hbs * 0.6);
      for (let t = 0; t < tiles; t++) {
        const a = (t / tiles) * 2 * Math.PI;
        const x = Math.round((CX + Math.cos(a) * ringR) / hbs) * hbs;
        const y = Math.round((CY + Math.sin(a) * ringR) / hbs) * hbs;
        if (x < 0 || x >= 1000 || y < 0 || y >= 1000) continue;
        const dx = x - CX, dy = y - CY; let ci;
        switch (colMode) {
          case 'lr':     ci = Math.floor((x / 1000) * np); break;
          case 'diag':   ci = Math.floor(((x + y) / 2000) * np); break;
          case 'c':      ci = Math.floor(((Math.atan2(dy, dx) / (2 * Math.PI)) + 0.5) * np); break;
          case 'x':      ci = ((Math.abs(dx) > Math.abs(dy)) ? 0 : 1) * 2 + (((dx > 0) === (dy > 0)) ? 0 : 1); break;
          case 'random': ci = Math.floor(hashNoise(x, y, hseed) * np); break;
          default:       ci = i + rot;
        }
        const col = palette[(((ci % np) + np) % np)];
        let op;
        if (opMode === 'up') op = 0.22 + 0.72 * ((y - (CY - outR)) / (2 * outR));
        else if (opMode === 'pulse' || opMode === 'random') op = ringOp[i];
        else op = Math.max(0.15, 0.78 - i * 0.07);
        op = Math.max(0.12, Math.min(1, op * haloOp)).toFixed(2);
        const k = col + '|' + op; (buckets[k] = buckets[k] || []).push('<rect x="' + x + '" y="' + y + '" width="' + (hbs - 1) + '" height="' + (hbs - 1) + '"/>');
      }
    }
    for (const k in buckets) { const sp = k.indexOf('|'); s += '<g fill="' + k.slice(0, sp) + '" opacity="' + k.slice(sp + 1) + '">' + buckets[k].join('') + '</g>'; }
    return s;
  }

  function baseLineTiles(p, bs) {
    if (p.base_line < 1) return '';
    let s = '';
    const col = p.accent_color || p.fg;
    const n = Math.min(p.base_line, 28);
    const totalW = n * (bs + 2);
    const startX = CX - totalW / 2;
    const y = 920;
    for (let i = 0; i < n; i++) {
      const x = Math.round((startX + i * (bs + 2)) / bs) * bs;
      s += '<rect x="' + x + '" y="' + y + '" width="' + (bs - 1) + '" height="' + (bs - 1) + '" fill="' + col + '"/>';
    }
    return s;
  }

  // Eye marker: single tile-sized rect at each eye anchor (NEWBIE black dot).
  // Used when lens has eye_marker_color set.
  function eyeMarkerTiles(p, bs, anchors) {
    if (!p.eye_marker_color) return '';
    const col = p.eye_marker_color;
    let s = '';
    const eyes = [anchors.eyeL, anchors.eyeR];
    for (const eye of eyes) {
      const x = Math.round(eye[0] / bs) * bs;
      const y = Math.round(eye[1] / bs) * bs;
      s += '<rect x="' + x + '" y="' + y + '" width="' + (bs - 1) + '" height="' + (bs - 1) + '" fill="' + col + '"/>';
    }
    return s;
  }

  // ENS marker: single bottom-left block in Phigures blue with black outline.
  // If background palette is blue (collision), block reverts to black fill.
  function ensMarkerTiles(p, bs) {
    if (!p.has_ens) return '';
    const PHIGURES_BLUE = '#0101ef';
    const BLACK = '#0a0a0a';
    const bgLower = (p.bg || '').toLowerCase();
    const isBlueBg = bgLower === PHIGURES_BLUE || bgLower === '#0101ef';
    const fill = isBlueBg ? BLACK : PHIGURES_BLUE;
    const stroke = BLACK;
    // Position: bottom-left, 2-tile margin from bottom edge, 2-tile margin from left
    const size = bs * 2; // 2x2 tile block — clearly visible
    const x = bs * 2;
    const y = 1000 - bs * 2 - size;
    return '<rect x="' + x + '" y="' + y + '" width="' + size + '" height="' + size +
      '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="3"/>';
  }

  function geoOverlayTiles(p, bs, rng) {
    if (p.geo_overlay < 1) return '';
    let s = '';
    const col = p.geo_color || p.accent_color || p.fg;
    const N = p.geo_overlay;
    const outside = !!p.geo_outside;
    const op = outside ? '1' : '0.7';
    for (let i = 0; i < N; i++) {
      let cx, cy;
      if (outside) {
        // Gilded studs: a symmetric ring of motifs OUTSIDE the head. Even angular
        // spacing from the top → mirror-symmetric, fixed radius (no jitter).
        const angle = -Math.PI / 2 + (i / N) * Math.PI * 2;
        const ringR = R + bs * 5;
        cx = CX + Math.cos(angle) * ringR;
        cy = CY + Math.sin(angle) * ringR;
        const xC = Math.round(cx / bs) * bs, yC = Math.round(cy / bs) * bs;
        s += '<rect x="' + xC + '" y="' + yC + '" width="' + (bs - 1) + '" height="' + (bs - 1) + '" fill="' + col + '" opacity="' + op + '"/>'; // center → fuller diamond
      } else {
        const angle = rng() * Math.PI * 2;
        const dist = rng() * R * 0.45;
        cx = CX + Math.cos(angle) * dist;
        cy = CY + Math.sin(angle) * dist;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
          const x = Math.round((cx + dx * bs) / bs) * bs;
          const y = Math.round((cy + dy * bs) / bs) * bs;
          s += '<rect x="' + x + '" y="' + y + '" width="' + (bs - 1) + '" height="' + (bs - 1) + '" fill="' + col + '" opacity="' + op + '"/>';
        }
      }
    }
    return s;
  }

  // ============================================================
  // UNIVERSAL LAYER (Phase C — slot architecture)
  // ============================================================

  // eth_balance → RAINBOW mini-block meter next to ENS marker.
  // Layout: 5 cols × 2 rows = 10 mini blocks, total size matches ENS (2bs × 2bs).
  // Each filled mini = one rainbow color (10 distinct stops).
  // Empty slot = dim thin outline.
  // 10/10 = full rainbow lit.
  function ethBalanceBlocks(p, bs) {
    if (p.eth_blocks == null || p.eth_blocks < 0) return ''; // sentinel: hide
    const filled = Math.max(0, Math.min(10, p.eth_blocks));
    const RAINBOW = [
      '#fe0000', '#ff5500', '#ff8a00', '#fcb913', '#9dd812',
      '#16d34c', '#01b4ff', '#0101ef', '#5e00d4', '#ff00a0'
    ];
    const DIM = '#444444';

    // ENS block is at (bs*2, 1000 - bs*4), size 2bs × 2bs.
    // Place ETH meter immediately to its right with small gap.
    const ensX = bs * 2;
    const ensY = 1000 - bs * 4;
    const ensSize = bs * 2;
    const gap = bs * 0.5;
    const meterX = ensX + ensSize + gap;
    const meterY = ensY;
    const meterW = ensSize;
    const miniW = meterW / 5;
    const miniH = ensSize / 2;

    let s = '';
    for (let i = 0; i < 10; i++) {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = (meterX + col * miniW).toFixed(2);
      const y = (meterY + row * miniH).toFixed(2);
      const w = miniW.toFixed(2);
      const h = miniH.toFixed(2);
      if (i < filled) {
        s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + RAINBOW[i] + '"/>';
      } else {
        s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="none" stroke="' + DIM + '" stroke-width="0.5"/>';
      }
    }
    return s;
  }

  // Render one grain mark based on lens's grain_shape.
  // Shapes are visually distinct but all roughly same size and on-chain cost.
  function renderGrainMark(shape, color, cx, cy, size) {
    const r = (size / 2).toFixed(1);
    const x = (cx - size / 2).toFixed(1);
    const y = (cy - size / 2).toFixed(1);
    switch (shape) {
      case 'filled_square':
        return '<rect x="' + x + '" y="' + y + '" width="' + size + '" height="' + size + '" fill="' + color + '"/>';
      case 'hollow_circle':
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="1"/>';
      case 'filled_circle':
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '"/>';
      case 'diamond':
        return '<polygon points="' + cx + ',' + (cy - size / 2).toFixed(1) + ' ' +
               (cx + size / 2).toFixed(1) + ',' + cy + ' ' +
               cx + ',' + (cy + size / 2).toFixed(1) + ' ' +
               (cx - size / 2).toFixed(1) + ',' + cy +
               '" fill="none" stroke="' + color + '" stroke-width="1"/>';
      case 'stroke': {
        // Diagonal short brushstroke (TL to BR)
        const sx1 = (cx - size / 2).toFixed(1), sy1 = (cy - size / 2).toFixed(1);
        const sx2 = (cx + size / 2).toFixed(1), sy2 = (cy + size / 2).toFixed(1);
        return '<line x1="' + sx1 + '" y1="' + sy1 + '" x2="' + sx2 + '" y2="' + sy2 +
               '" stroke="' + color + '" stroke-width="1.5"/>';
      }
      case 'cross': {
        // Small plus mark (horizontal + vertical thin rect, 2 elements)
        const t = 0.9;
        return '<rect x="' + x + '" y="' + (cy - t / 2).toFixed(1) +
               '" width="' + size + '" height="' + t + '" fill="' + color + '"/>' +
               '<rect x="' + (cx - t / 2).toFixed(1) + '" y="' + y +
               '" width="' + t + '" height="' + size + '" fill="' + color + '"/>';
      }
      case 'hollow_square':
      default:
        return '<rect x="' + x + '" y="' + y + '" width="' + size + '" height="' + size +
               '" fill="none" stroke="' + color + '" stroke-width="1"/>';
    }
  }

  // total_tx grain: small lens-specific shape markers scattered across background.
  //
  // Mechanic (universal):
  // - All bg tile positions (outside face) collected
  // - Seed-deterministic shuffle (random-looking but reproducible per wallet)
  // - Fill ratio inverse to grain_n via squared curve, capped at 45%
  //
  // Aesthetic (per lens via p.grain_shape):
  // - hollow_square (default), filled_square, hollow_circle, filled_circle,
  //   diamond, stroke, cross
  function grainTiles(p, bs) {
    if (!p.grain_n || p.grain_n < 2) return '';
    const cols = Math.ceil(1000 / bs);
    const rows = Math.ceil(1000 / bs);
    const exclR = R * 1.15;
    const exclRSq = exclR * exclR;

    const BASE_RESERVED_Y = 900; // bottom strip (ENS/ETH/BASE elements)
    // Right column reserved for success rate meter (10 blocks at y=200-800)
    const SUCC_X1 = 950 - bs;
    const SUCC_X2 = 950;
    const SUCC_Y1 = 200;
    const SUCC_Y2 = 800;
    const positions = [];
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const tx = gx * bs;
        const ty = gy * bs;
        if (ty >= BASE_RESERVED_Y) continue;
        // Skip success rate meter column
        if (tx + bs > SUCC_X1 && tx < SUCC_X2 && ty + bs > SUCC_Y1 && ty < SUCC_Y2) continue;
        const cx = tx + bs / 2;
        const cy = ty + bs / 2;
        const dxS = cx - CX;
        const dyS = cy - CY;
        if (dxS * dxS + dyS * dyS < exclRSq) continue;
        positions.push({ tx, ty });
      }
    }

    // Deterministic shuffle (seed-based, random-looking distribution)
    const rng = mulberry32((p.seed | 0) + 7777);
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = positions[i]; positions[i] = positions[j]; positions[j] = tmp;
    }

    // Fill ratio with SQUARED curve + max 45% cap:
    //   gentle ramp at low end (small change from 12→11), grows quadratically
    //   max ~45% of bg positions even at grain_n=2 (avoids saturation)
    const t = Math.max(0, Math.min(1, (12 - p.grain_n) / 10));
    const fillRatio = t * t * 0.45;
    // Cap absolute count: dense-tx wallets (grain_n 3-5) could otherwise produce
    // 1000+ squares (~100KB+ SVG). Cap keeps the texture but bounds on-chain size.
    const GRAIN_MAX = 300;
    const count = Math.min(GRAIN_MAX, Math.floor(positions.length * fillRatio));

    // Embedded MOSAIC: full-tile hollow squares. Shared stroke attrs hoisted into a
    // <g> wrapper so each rect carries only geometry (~halves bytes/square; look identical).
    const inset = 1;
    const w = bs - inset * 2;
    let s = '<g fill="none" stroke="' + p.fg + '" stroke-width="1" stroke-opacity="0.25">';
    for (let i = 0; i < count; i++) {
      const pos = positions[i];
      s += '<rect x="' + (pos.tx + inset) + '" y="' + (pos.ty + inset) + '" width="' + w + '" height="' + w + '"/>';
    }
    return s + '</g>';
  }

  // tx_success_rate → 10-block vertical meter on right side.
  // Each block represents 10% success. Filled = green, empty = dim outline.
  // Min 30 tx required (else success_rate hardcoded to 1.0 — vacuous-true protection).
  function successRateBlocks(p, bs) {
    const rate = (p.tx_success_rate != null) ? p.tx_success_rate : 1;
    // Sentinel: rate < 0 means "hide meter entirely" (used for baseline preview)
    if (rate < 0) return '';
    const filled = Math.round(Math.max(0, Math.min(1, rate)) * 10);
    const GREEN = '#16d34c';
    const DIM = '#333333';
    const colX = 950 - bs;
    const startY = 200;
    const endY = 800;
    const slotH = Math.floor((endY - startY) / 10);
    let s = '';
    for (let i = 0; i < 10; i++) {
      const y = startY + i * slotH;
      // Top-down fill: first `filled` blocks are green, rest are outlined
      if (i < filled) {
        s += '<rect x="' + colX + '" y="' + y + '" width="' + (bs - 1) + '" height="' + (bs - 1) + '" fill="' + GREEN + '"/>';
      } else {
        s += '<rect x="' + colX + '" y="' + y + '" width="' + (bs - 1) + '" height="' + (bs - 1) + '" fill="none" stroke="' + DIM + '" stroke-width="1"/>';
      }
    }
    return s;
  }

  // lifetime_gas BASE highlights + subdivisions. Deterministic by seed.
  // - highlights = N slots get filled with accent_color (solid block)
  // - subdivisions = M slots split into 2x2, with 1-3 sub-tiles in accent (pattern Y)
  function baseGasTiles(p, bs) {
    const highlights = Math.min(8, p.gas_highlights || 0);
    const subdivisions = Math.min(4, p.gas_subdivisions || 0);
    if (highlights + subdivisions < 1) return '';

    // Align with ENS marker / ETH meter horizontally (same Y baseline).
    // ENS is at (bs*2, 1000-bs*4), size 2bs × 2bs. Gas centers vertically within ENS height.
    const ensY = 1000 - bs * 4;
    const ensSize = bs * 2;
    const baseY = ensY + Math.floor((ensSize - bs) / 2);
    // Skip horizontal area used by ENS block + ETH meter (left side).
    // ENS ends at bs*4 (x), ETH meter ends at bs*6.5 (x), so gas starts after ~bs*7.
    const slotW = bs + 2;
    const ethEndX = bs * 6.5;
    const startX = Math.ceil(ethEndX + bs * 0.5);
    const successColX = 950 - bs;
    const endX = Math.floor(successColX - bs * 0.5);
    const availW = Math.max(slotW, endX - startX);
    const slotsCount = Math.max(1, Math.floor(availW / slotW));

    const rng = mulberry32((p.seed | 0) + 5273);
    // Deterministic shuffle of slot indices
    const slots = [];
    for (let i = 0; i < slotsCount; i++) slots.push(i);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const subSet = new Set(slots.slice(0, subdivisions));
    const hlSet  = new Set(slots.slice(subdivisions, subdivisions + highlights));

    const fgCol = p.fg;
    const accentCol = p.accent_color || p.fg;
    let s = '';

    for (let i = 0; i < slotsCount; i++) {
      const x = startX + i * slotW;
      if (subSet.has(i)) {
        // Subdivision: 2x2 sub-tiles, pattern Y (1-3 sub-tiles accent)
        const sub = Math.floor(bs / 2);
        const subPositions = [
          [x, baseY],
          [x + sub, baseY],
          [x, baseY + sub],
          [x + sub, baseY + sub],
        ];
        // Deterministic shuffle of sub-positions
        for (let k = subPositions.length - 1; k > 0; k--) {
          const j = Math.floor(rng() * (k + 1));
          [subPositions[k], subPositions[j]] = [subPositions[j], subPositions[k]];
        }
        const numAccent = 1 + Math.floor(rng() * 3); // 1-3
        for (let k = 0; k < 4; k++) {
          const [sx, sy] = subPositions[k];
          const fill = (k < numAccent) ? accentCol : fgCol;
          s += '<rect x="' + sx + '" y="' + sy + '" width="' + Math.max(1, sub - 1) + '" height="' + Math.max(1, sub - 1) + '" fill="' + fill + '"/>';
        }
      } else if (hlSet.has(i)) {
        // Highlight: single accent block
        s += '<rect x="' + x + '" y="' + baseY + '" width="' + (bs - 1) + '" height="' + (bs - 1) + '" fill="' + accentCol + '"/>';
      }
      // else: empty slot
    }
    return s;
  }

  function defaultsFor(params) {
    return {
      yaw:   params.yaw   || 0,
      pitch: params.pitch || 0,
      roll:  params.roll  || 0,
      pose_jitter: params.pose_jitter || 0,  // 0 = off; seed-derived micro-pose for sibling variation
      bg_variety:  params.bg_variety  || 0,  // 0 = solid bg; 1 = seed-driven background pattern
      bg_force_pattern: params.bg_force_pattern || null,  // force a specific bg pattern (test/playground)
      bg_blocky:        params.bg_blocky        || false, // render bg cells as INDIVIDUAL blocks (gap between) instead of smooth run-merged fills
      bg_no_protect:    params.bg_no_protect    || false, // skip head protect zone (bg gallery)
      bg_palette:       params.bg_palette       || null,  // multicolor bg row-bands (BUILDER Phigures, etc.)
      medallion:        params.medallion        || false, // WHALE royal-seal coin frame (signature, always-on)
      medallion_ring:   params.medallion_ring   || null,  // rim color (default gold = p.fg)
      medallion_outer:  params.medallion_outer  || null,  // darker outer field beyond the coin rim
      medallion_pal:    params.medallion_pal    || null,  // FORGE (LEVIATHAN): radial gold-tone gradient for the coin
      bg_solid:         params.bg_solid         || false, // force solid bg, no pattern (WHALE clean field)
      scanlines:        params.scanlines        || null,  // hologram scanline overlay color (GHOST cyan)
      contour_solid_bands: params.contour_solid_bands || 0, // contour mode: lowest N bands rendered SOLID, rest as outline (NEWBIE hybrid)
      gallery_frame:    params.gallery_frame    || false, // (dormant) rectangular gallery frame — replaced by floating_mat
      floating_mat:     params.floating_mat     || false, // COLLECTOR: passe-partout mat panel behind portrait + accent keyline
      mat_color:        params.mat_color        || null,  // mat panel tone (default deep navy so white face pops)
      _frame_pat:       params._frame_pat        || 'ramp', // COLLECTOR frame block pattern: solid | ramp | alt | diag — LOCKED 'ramp' 2026-06-29 (user). Per-side low->full fade in discrete uniform blocks.
      block_vol:        params.block_vol        || 0,     // COLLECTOR: NFT volume → chunkier color_blocks (0-1)
      fg:           params.fg           || '#efdfc8',
      bg:           params.bg           || '#0a0a0a',
      accent_color: params.accent_color || '#fcb913',
      block_size:   params.block_size   || 14,
      eye_size_extra:      params.eye_size_extra      || 0,
      brow_intensity:      (params.brow_intensity      != null) ? params.brow_intensity : 0.6,
      mouth_intensity:     (params.mouth_intensity     != null) ? params.mouth_intensity : 0.7,
      mouth_style:         params.mouth_style         || null,   // universal Mouth trait (null = original fixed shadow)
      mouth_w:             params.mouth_w             || 56,
      mouth_curve:         params.mouth_curve         || 0,
      mouth_asym:          params.mouth_asym          || 0,
      mouth_open:          params.mouth_open          || 0,
      mouth_open_band:     params.mouth_open_band     || 0,
      mouth_teeth_color:   params.mouth_teeth_color   || '#e8eef7',
      mouth_tip_color:     params.mouth_tip_color     || null,    // cigar ember / vape smoke accent cell
      mouth_shadow:        (params.mouth_shadow        != null) ? params.mouth_shadow : 1.7,   // depth halo around the mouth (0 = off, 1 = light, 1.7 = strong default)
      headpiece:           params.headpiece           || null,    // universal Headpiece SHAPE (Crown/Headband/Mohawk/... ; null = none)
      headpiece_finish:    params.headpiece_finish    || 'Solid', // colour treatment: Solid / Gradient / Rainbow / Gold
      headpiece_color:     params.headpiece_color     || '#15151c', // Solid base / Gradient dark end
      headpiece_color2:    params.headpiece_color2    || null,    // Gradient light end
      chin_intensity:      (params.chin_intensity      != null) ? params.chin_intensity : 0.7,
      cheekbone_intensity: params.cheekbone_intensity || 0,
      forehead_intensity:  (params.forehead_intensity  != null) ? params.forehead_intensity : 0.4,
      shimmer:          (params.shimmer != null) ? params.shimmer : 0.4,
      highlight_chance: params.highlight_chance || 0.02,
      aging_strength:   params.aging_strength   || 0,
      splatters:        params.splatters        || 0,
      splat_green:      params.splat_green      || 0,                // DEGEN PnL: successful-tx (green) dot count
      splat_red:        (params.splat_red != null) ? params.splat_red : null,  // DEGEN PnL: failed-tx (red) dot count
      splat_gold:       params.splat_gold       || 0,                // DEGEN PnL: rare jackpot (gold) dot count
      splat_gold_varied: params.splat_gold_varied || false,          // DEGEN Up Only: render gold splatter at VARIED sizes (mini -> full)
      splat_on_face:    params.splat_on_face    || false,            // DEGEN extreme PnL: let splatter dots flood ONTO the face
      face_splat:       params.face_splat       || null,             // DEGEN on-face PnL flood {green,red,gold}: integral shaded face cells (not a flat overlay)
      pnl_veins:        params.pnl_veins        || null,             // DEGEN PnL overlay: {color, count} fracture/vein lines (Rekt red / Up Only gold)
      cracks:           params.cracks           || null,             // OG cracks: {count, goldFrac} kintsugi fissures
      crack_color:      params.crack_color      || null,             // override for the non-gold crack colour (DEGEN Rekt = red liquidation fractures, carved into the face)
      crack_solid:      params.crack_solid      || false,            // DEGEN Rekt: render crack cells at FULL bs (no 1px gap) so fractures connect into solid lines
      ghost_outline:    params.ghost_outline    || null,             // GHOST: silhouette contour colour (1-cell ring)
      veil_opacity:     params.veil_opacity != null ? params.veil_opacity : 1, // GHOST Veil: face interior opacity (<1 fades; contour stays crisp)
      bg_deep:          params.bg_deep          || false,            // bg3 "Deep": seed gradient colour-block aura
      bg_deep_bands:    params.bg_deep_bands    || 12,               // bg3 detail<->cost knob (band count 4..28)
      bg_deep_oy:       params.bg_deep_oy != null ? params.bg_deep_oy : 460, // bg3 light-origin Y (face-centre default)
      bg_deep_scheme:   params.bg_deep_scheme   || 'cohesive',        // bg3 gradient scheme: cohesive/cumbus/rainbow/lava
      spark_count:      params.spark_count      || 0,                // NEWBIE Spark: number of glint sparks around the face
      spark_colors:     params.spark_colors     || null,             // NEWBIE spark palette (bright greens/white)
      spark_gold:       params.spark_gold       || false,            // NEWBIE Spark=One -> single gold block
      color_blocks:     params.color_blocks     || 0,
      echo_trails:      params.echo_trails      || 0,
      base_line:        params.base_line        || 0,
      halo_rings:       params.halo_rings       || 0,
      halo_budget:      params.halo_budget      != null ? params.halo_budget : null,   // per-facet halo radial budget (COLLECTOR=170 keeps the halo inside its gallery frame). MUST be whitelisted here or it's silently dropped.
      geo_overlay:      params.geo_overlay      || 0,
      geo_outside:      params.geo_outside      || false,  // place motifs OUTSIDE head, symmetric (WHALE gold studs)
      geo_color:        params.geo_color        || null,   // motif color override (default accent/fg)
      has_ens:          !!params.has_ens,
      seed:             params.seed             || 1,
      // Universal signals (Phase C — slot architecture)
      eth_blocks:       (params.eth_blocks != null) ? params.eth_blocks : -1, // 0-10 (eth_balance → left meter), -1 = hidden
      grain_n:          params.grain_n          || 0,     // diagonal flicker spacing; 0=off, 2-12
      grain_shape:      params.grain_shape      || 'hollow_square', // lens-specific shape
      halo_rainbow:     !!params.halo_rainbow,                       // DEGEN multicolor halo
      halo_rot:         params.halo_rot         || 0,                // DEGEN dynamic: owner-derived rainbow START offset (rotates the ring colour sequence on transfer)
      halo_op_mode:     params.halo_op_mode     || null,             // FORGE halo: opacity arrangement (falloff/up/pulse/random)
      halo_col_mode:    params.halo_col_mode    || null,             // FORGE halo: colour arrangement (rings/lr/diag/c/x/random)
      halo_shape:       params.halo_shape       || null,             // FORGE halo shape: null/'rings' = ring · 'crown' = hair/hat blocks on top of head
      halo_crown_density: (params.halo_crown_density != null) ? params.halo_crown_density : null, // CROWN: block density near the scalp
      halo_crown_reach:   (params.halo_crown_reach != null) ? params.halo_crown_reach : null,     // CROWN: how high the hair/hat extends
      halo_palette:     params.halo_palette     || null,             // custom per-ring colors (e.g. NEWBIE red→orange)
      eye_marker_color: params.eye_marker_color || null,             // NEWBIE: 1-tile dot at each eye
      eye_fill_color:   params.eye_fill_color   || null,             // Eyes trait: iris fill colour
      eye_fill2_color:  params.eye_fill2_color  || null,             // Eyes='Heterochromia': RIGHT-eye iris colour (left uses eye_fill_color)
      eye_style:        params.eye_style        || null,             // Eyes shape style: x/closed/wink/star/heart/dollar/spiral (drawn inside the socket)
      eye_pupil_color:  params.eye_pupil_color  || null,             // Eyes trait: pupil (dark center)
      eye_hi_color:     params.eye_hi_color     || null,             // Eyes trait: catch-light (legacy/unused)
      eye_mask:         params.eye_mask         || null,             // Eyes='Bandit': mask band mode
      eye_mask_color:   params.eye_mask_color   || null,             // Bandit: glowing eye colour
      eye_mask_band:    params.eye_mask_band    || null,             // Bandit: band colour override
      face_palette:     params.face_palette     || null,             // 5-color palette per quantize level (BUILDER Phigures multicolor)
      face_recolor:     params.face_recolor     || null,             // FORGE: depth-preserved patterned recolor {palette,pattern,amount,seed} (feature-safe; only forge sets it)
      face_ramp:        params.face_ramp        || null,             // FORGE gradient engine: {palette, mode:bright/lr/rl/tb/bt/in/out/spiral, soft, seg} tonal-depth + directional gradients
      face_bg:          params.face_bg          || null,             // FORGE: blend FACE cells over THIS (dark) instead of p.bg, so a bold bg never tints/washes the face
      face_disperse:        (params.face_disperse != null) ? params.face_disperse : null,  // FORGE scatter form: keep-fraction of face cells (gappy/dispersed); null = off
      ghost_outline_pal:    params.ghost_outline_pal    || null,      // FORGE: multi-colour Ghost contour palette
      ghost_outline_mode:   params.ghost_outline_mode   || null,      // FORGE: contour colour arrangement (c/lr/up/diag/x/random)
      ghost_outline_op:     params.ghost_outline_op     || null,      // FORGE: contour opacity play (up/pulse/random)
      ghost_outline_opacity:(params.ghost_outline_opacity != null) ? params.ghost_outline_opacity : null, // FORGE: contour base opacity
      ghost_outline_rot:    params.ghost_outline_rot    || 0,         // FORGE: contour palette rotation offset
      _no_bg:               params._no_bg               || false,     // FUSION: transparent head layer (no bg, composited over one shared bg)
      gild_level:       params.gild_level        || 0,                // (parked) legacy band-count gild — unused
      gild_min:         (params.gild_min != null) ? params.gild_min : null,  // GILD brightness threshold (cells b>=this turn gold)
      block_on_face:    params.block_on_face     || false,            // scatter color_blocks ON the face/base (BUILDER deploys)
      accent_blocks:    params.accent_blocks     || null,             // IDENTITY face blocks (Builder works gold/green) — frozen. {colors,count,run}
      owner_blocks:     params.owner_blocks      || null,             // DYNAMIC owner-coloured face blocks (shared palette) — change on transfer. {colors,count}
      block_color:      params.block_color       || null,             // single color for color_blocks (BUILDER = gold)
      finish:           params.finish            || null,              // PERMANENT seed-derived rarity finish: standard|etched|prismatic
      block_layout:     params.block_layout      || 'scatter',         // color_blocks layout: scatter|cluster|anchor|dense (COLLECTOR archetype)
      block_palette:    params.block_palette     || null,              // color_blocks palette (COLLECTOR archetype); null = default multicolor
      collection_wall:  params.collection_wall   || false,             // COLLECTOR: blocks form a structured mosaic WALL framing the portrait
      tile_outline:     params.tile_outline     || null,             // {color, width} for thin face tile outlines (stained-glass)
      halo_opacity:     (params.halo_opacity != null) ? params.halo_opacity : 1.0, // last_activity → halo fade
      tx_success_rate:  (params.tx_success_rate != null) ? params.tx_success_rate : 1.0, // 0-1 → 10-block right meter
      gas_highlights:   params.gas_highlights   || 0,     // count of BASE highlight blocks (0-8)
      gas_subdivisions: params.gas_subdivisions || 0,     // count of BASE subdivided blocks (0-4)
      // Special render modes (DEGEN rgb_glitch, GHOST gray_phantom, GHOST inverted uses palette only)
      render_mode:      params.render_mode      || 'standard',
      gray_pool:        params.gray_pool        || null,
      rgb_red:          params.rgb_red          || '#ff0000',
      rgb_green:        params.rgb_green        || '#00ff00',
      rgb_blue:         params.rgb_blue         || '#0000ff',
      rgb_offset:       (params.rgb_offset != null) ? params.rgb_offset : 1,  // DEGEN Glitch trait: chromatic offset multiplier
      glitch_bars:      params.glitch_bars       || 0   // DEGEN Glitch top tiers: horizontal datamosh bar count
    };
  }

  // ---- Color helpers (quantize + pre-blend, on-chain friendly) ----
  function hexToRgb(hex) {
    hex = hex || '#000000';
    if (hex[0] !== '#') {   // DEFENSIVE: tolerate an hsl() (or other non-hex) colour so it never mis-parses into navy (#000032). Convert hsl->hex first.
      const m = /hsl\(\s*([\d.]+)[ ,]+([\d.]+)%?[ ,]+([\d.]+)%?/i.exec(hex);
      hex = m ? hslHex(+m[1], +m[2], +m[3]) : '#000000';
    }
    const h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16) || 0,
      parseInt(h.substring(2, 4), 16) || 0,
      parseInt(h.substring(4, 6), 16) || 0,
    ];
  }
  function rgbToHex(r, g, b) {
    const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }
  function blendOverBg(fgHex, bgHex, op) {
    const [fr, fg, fb] = hexToRgb(fgHex);
    const [br, bg2, bb] = hexToRgb(bgHex);
    return rgbToHex(
      fr * op + br * (1 - op),
      fg * op + bg2 * (1 - op),
      fb * op + bb * (1 - op)
    );
  }
  // Shift a hex colour's lightness. amt > 0 = lighter (toward white), amt < 0 = darker (toward black).
  function shadeHex(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
    const k = 1 + amt;
    return rgbToHex(r * k, g * k, b * k);
  }
  // Quantize brightness to 5 distinct levels: 0.2 / 0.4 / 0.6 / 0.8 / 1.0
  function quantize5(b) {
    return Math.max(0.2, Math.round(b * 5) / 5);
  }

  // SHARED eye/mask cell colour (used by BOTH the standard renderer and the contour renderer so every facet's
  // eyes look identical). Returns a colour string, OR null (cleared/dark socket), OR undefined = "not an eye/mask
  // cell, caller does its normal rendering". res must be the field() result for this cell.
  function eyeCellColor(res, gx, gy, bs, p) {
    if (res.scanBar) return shadeHex('#eef2f8', (hashNoise(gx, gy, p.seed + 47) - 0.5) * 0.12);   // VISOR: bright central scanner bar
    if (res.maskEye) return shadeHex(p.eye_mask_color || '#ff2a2a', (hashNoise(gx, gy, p.seed + 91) - 0.5) * 0.3);   // Bandit eye: per-cell tone -> blocks
    if (res.maskBand) return shadeHex(p.eye_mask_band || '#121212', (hashNoise(gx, gy, p.seed + 71) - 0.5) * 0.5 + Math.max(0, res.b - 0.5) * 0.3);  // Bandit/Visor band: textured dark BLOCKS
    if (res.kind === 'eye') {
      const er = res.eyeRR || 50, dxe = res.eyeDx, dye = res.eyeDy;
      const style = p.eye_style;
      // HETEROCHROMIA: iris colour differs by side (owner-driven). Falls through to the normal iris render with fillCol.
      let fillCol = (style === 'hetero') ? (res.eyeSide > 0 ? (p.eye_fill2_color || p.eye_fill_color) : p.eye_fill_color) : p.eye_fill_color;
      // SHAPE styles: a bright shape drawn inside the dark socket. nu/nv ~ -1..1 within the socket.
      if (style && style !== 'hetero') {
        const winkIris = (style === 'wink' && res.eyeSide < 0);                   // wink: LEFT eye = normal iris, RIGHT = closed line
        if (!winkIris) {
          const nu = dxe / er / 0.4, nv = dye / er / 0.4, r = Math.hypot(nu, nv), ang = Math.atan2(nv, nu);
          const sc = p.eye_fill_color || '#eef2f8';
          let on = false;
          if (style === 'closed' || style === 'wink') on = (nv > -0.08 && nv < 0.36) && Math.abs(nu) < 1.0;   // low flat line = content closed
          else if (style === 'spiral') on = r < 1.05 && ((((ang / (2 * Math.PI)) + 1) + r * 1.7) % 1) < 0.5;
          else if (style === 'star') { const seg = Math.PI * 2 / 5, kk = Math.cos(ang - Math.round(ang / seg) * seg); on = r < (0.42 + 0.58 * Math.max(0, kk)) && r < 1.1; }   // 5-point star (approx)
          else if (style === 'heart') { const yy = -nv * 1.12 + 0.18, xx = nu * 1.12; on = ((xx * xx + yy * yy - 0.5) ** 3 - xx * xx * yy * yy * yy) < 0 && r < 1.35; }
          else if (style === 'dollar') on = ((Math.abs(nu) < 0.22) || (Math.abs(nv) < 0.20 && Math.abs(nu) < 0.66) || (Math.abs(Math.abs(nv) - 0.5) < 0.18 && nu * (nv > 0 ? 1 : -1) < 0.1)) && r < 1.1;   // crude $
          return on ? shadeHex(sc, (hashNoise(gx, gy, p.seed + 131) - 0.5) * 0.18) : null;
        }
      }
      // DEFAULT iris (Calm/Sharp = no fill -> dark socket; Iris/Glow/Laser/Ember/Wide/Void/Sleepy/Wink-left/Hetero = centered iris)
      if (!fillCol) return null;
      const nd = Math.hypot(dxe, dye) / er;
      const fillFrac = Math.max(0.5, Math.min(1, 0.5 + (bs - 14) * 0.05));
      const irisEdge = 0.4 * fillFrac;
      if (nd > irisEdge) return null;
      if (nd > irisEdge * 0.78 && hashNoise(gx, gy, p.seed + 313) < 0.40) return null;
      if (p.eye_pupil_color && irisEdge * er >= bs * 1.4 && nd < irisEdge * 0.4) return p.eye_pupil_color;
      const contrast = Math.max(0.65, Math.min(1, (bs - 6) / 14));
      const ndot = Math.max(-1, Math.min(1, (dxe * res.eyeLX + dye * res.eyeLY) / er / 0.4));
      const amt = ndot * 0.52 * contrast;
      return (amt > 0.02 || amt < -0.02) ? shadeHex(fillCol, amt) : fillCol;
    }
    return undefined;
  }

  // SHARED mouth/vomit cell colour (used by BOTH renderers, exactly like eyeCellColor -> every facet's mouth matches).
  // Returns a colour string, OR undefined = "not a mouth/vomit cell, caller does its normal rendering".
  const VOMIT_PAL = ['#fe0000', '#ff7a00', '#fcdf00', '#16d34c', '#2f9ad3', '#3b3bff', '#a020f0'];   // ROYGBIV, on-brand vivid
  // The mouth DARK recess takes the FACET'S OWN deep tone (like the Calm eye socket), NOT a fixed black -> integral, not
  // a pasted part. Pick the darker of {deepened bg, darkened fg} so it is always a real recess AND always facet-tinted
  // (Collector BLUE bg -> deep blue mouth like its eyes; cream-bg facets fall back to the darkened face colour).
  function mouthDarkBase(p) {
    const lum = h => { const c = hexToRgb(h); return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; };
    const bgc = p.bg || '#0a0a0a';
    // bright/saturated bg -> deepen for a rich recess (Royal Blue -> deep blue). Already-dark bg (Midnight) -> use AS-IS
    // so it keeps its own tint and never reads as pure black / a separate piece.
    const a = lum(bgc) < 26 ? bgc : shadeHex(bgc, -0.18);
    const b = shadeHex(p.fg || '#efdfc8', -0.55);
    return lum(a) <= lum(b) ? a : b;
  }
  function mouthCellColor(res, gx, gy, bs, p) {
    if (res.vomit) {                                                             // rainbow stream: band by height + per-cell jitter -> textured blocks, not a flat triangle
      let idx = Math.floor(res.vomitT * VOMIT_PAL.length);
      const j = hashNoise(gx, gy, p.seed + 401);
      if (j < 0.18) idx -= 1; else if (j > 0.82) idx += 1;
      idx = Math.max(0, Math.min(VOMIT_PAL.length - 1, idx));
      const fade = res.vomitT < 0.14 ? -0.45 * (1 - res.vomitT / 0.14) : 0;      // first few blocks fade in dark -> light, straight from the mouth
      return shadeHex(VOMIT_PAL[idx], (hashNoise(gx, gy, p.seed + 7) - 0.5) * 0.22 + fade);
    }
    const mu = res.mouthU || 0;
    const horiz = 0.5 - Math.min(1, Math.abs(mu - (res.eyeLX || 0) * 0.45));        // +0.5 at the (pose-shifted) highlight -> -0.5 at the far side
    if (res.mouthTip) return shadeHex(p.mouth_tip_color || '#ff6a1a', (hashNoise(gx, gy, p.seed + 401) - 0.5) * 0.28);   // cigar ember / vape smoke
    if (res.mouthR) {                                                                // tongue / kiss / drool / blood — colour by style
      const mc = p.mouth_style === 'kiss' ? '#ff5a7a' : p.mouth_style === 'drool' ? '#a9def0' : p.mouth_style === 'tongue' ? '#d83a5a' : '#9c0d12';
      return shadeHex(mc, horiz * 0.28 + (hashNoise(gx, gy, p.seed + 211) - 0.5) * 0.3);
    }
    if (res.mouthT) return shadeHex(p.mouth_teeth_color || '#e8eef7', horiz * 0.5 + (hashNoise(gx, gy, p.seed + 53) - 0.5) * 0.1);   // teeth in their OWN colour: centre/lit light, sides dark (pose-aware)
    if (res.mouthD) {                                                                // recess: NEVER a solid black slab -> per-cell varied opacity + pose shade
      const teethMouth = p.mouth_style === 'grit' || p.mouth_style === 'seal' || (p.mouth_open_band || 0) > 0;   // grin/gritted/grill/seal frame the teeth
      const lift = teethMouth ? 0.1 : 0;                                            // lift the frame off pure black (user: tam siyah bozuyor)
      const varAmt = teethMouth ? 0.42 : 0.22;                                      // vary opacity more on teeth-frames so it never reads as one black block
      return shadeHex(mouthDarkBase(p), lift + horiz * 0.26 + (hashNoise(gx, gy, p.seed + 29) - 0.5) * varAmt);
    }
    return undefined;
  }

  // FORGE face_recolor: deterministic, depth-preserved (caller blends over bg at the cell's band), feature-safe
  // (only called for plain face cells). Returns a palette colour to use, or null = keep the base face colour.
  // pattern ∈ scatter|random|splatter|stripes|rings|grid|clusters|halves|quadrants. amount 0..1 = density/width.
  function faceRecolorPick(gx, gy, fr, bs) {
    const pal = fr.palette, n = pal.length; if (!n) return null;
    const sd = fr.seed || 0, amt = (fr.amount != null ? fr.amount : 0.4);
    const cx = gx * bs + bs / 2, cy = gy * bs + bs / 2;
    let on = false, hsel = hashNoise(gx, gy, sd + 7);
    switch (fr.pattern) {
      case 'random':   on = hashNoise(gx * 7, gy * 13, sd) < amt; break;
      case 'splatter': { const blob = hashNoise(Math.floor(gx / 3), Math.floor(gy / 3), sd); on = blob < amt * 0.75 || (blob < amt * 1.4 && hashNoise(gx, gy, sd + 3) < 0.5); hsel = hashNoise(Math.floor(gx / 3), Math.floor(gy / 3), sd + 5); break; }
      case 'stripes':  { const k = 3 + Math.floor((1 - amt) * 4); on = (gy % k) < Math.max(1, Math.round(k * amt)); hsel = hashNoise(0, Math.floor(gy / k), sd + 5); break; }
      case 'rings':    { const d = Math.hypot(cx - CX, cy - CY) / R; const band = Math.floor(d * 9); on = (band % 2 === 0) && d < 1.06; hsel = hashNoise(band, 0, sd + 5); break; }
      case 'grid':     { const k = 3; on = (gx % k === 0) || (gy % k === 0); break; }
      case 'clusters': { const b = hashNoise(Math.floor(gx / 4), Math.floor(gy / 4), sd); on = b < amt + 0.18; hsel = b; break; }
      case 'halves':   { on = cx > CX; hsel = hashNoise(0, 0, sd + (on ? 1 : 2)); break; }
      case 'quadrants':{ const q = (cx > CX ? 1 : 0) + (cy > CY ? 2 : 0); on = (q % 2 === 0); hsel = hashNoise(q, 0, sd); break; }
      case 'spiral':   { const dx = cx - CX, dy = cy - CY; const ang = Math.atan2(dy, dx), dist = Math.hypot(dx, dy) / R; let t = (ang / (2 * Math.PI)) * 3 + dist * 4.5; t = ((t % 1) + 1) % 1; on = t < (0.26 + amt * 0.5); hsel = hashNoise(Math.floor(t * 6), Math.floor(dist * 5), sd); break; }   // 3-arm spiral -> "became another character"
      default:         on = hashNoise(gx, gy, sd) < amt;   // scatter
    }
    return on ? pal[Math.floor(hsel * n) % n] : null;
  }

  function renderFaceTiles(field, p, bs) {
    const cols = Math.ceil(1000 / bs);
    const rows = Math.ceil(1000 / bs);
    const useGrayPool = (p.render_mode === 'gray_phantom') && p.gray_pool && p.gray_pool.length;
    // Stained-glass outline (BUILDER etc.): thin black stroke on each face tile
    const outlineAttr = p.tile_outline
      ? ' stroke="' + p.tile_outline.color + '" stroke-width="' + (p.tile_outline.width || 0.5) + '"'
      : '';

    // OG cracks: rendered AS the face's OWN cells (they break the run-merge -> integral, NOT a pasted overlay).
    // crackMap key = gx*10000+gy, value = isGold. Computed below (after accent), used in cellFill + the merge.
    let crackMap = null, splatMap = null;
    // Per-cell fill color (string) or null to skip. `res` (field result) may be passed in to avoid recomputing.
    function cellFill(gx, gy, res) {
      const cx = gx * bs + bs / 2;
      const cy = gy * bs + bs / 2;
      if (!res) res = field(cx, cy);
      const ec = eyeCellColor(res, gx, gy, bs, p);   // shared eye/mask logic (same for every facet)
      if (ec !== undefined) return ec;               // eye/mask cell -> colour or null (cleared) — PROTECTED from disperse below
      const mc = mouthCellColor(res, gx, gy, bs, p); // shared mouth/vomit logic (same for every facet)
      if (mc !== undefined) return mc;               // mouth/blood/teeth/vomit cell -> colour — PROTECTED
      if (p.face_disperse != null && hashNoise(gx, gy, p.seed + 4242) > p.face_disperse) return null;   // 2026-07-01: disperse (NEWBIE Form / FORGE scatter) drops only NON-feature cells now -> eyes/mouth survive fragmentation, face stays recognizable
      if (crackMap) {                                // OG crack cell: dark fissure / gold kintsugi, 3D-shaded by face b
        const ck = crackMap.get(gx * 10000 + gy);
        if (ck !== undefined) return ck ? shadeHex('#ffd24a', (res.b - 0.42) * 0.85) : (p.crack_color ? shadeHex(p.crack_color, (res.b - 0.45) * 0.5) : shadeHex('#0a0a0a', Math.max(0, res.b - 0.55) * 0.5));   // gold cracks = bright project gold (was muted #c69a18) so Kintsugi pops (user 2026-06-25)
      }
      if (splatMap) {                                // DEGEN PnL on-face flood cell: 3D-shaded by face b (integral, NOT a flat pasted overlay)
        const sc = splatMap.get(gx * 10000 + gy);
        if (sc !== undefined) { const _bc = sc === 'g' ? '#39ff14' : (sc === 'o' ? '#fcb913' : '#fe0000'); return shadeHex(_bc, (res.b - 0.5) * 0.55); }
      }
      if (res.b < 0.15) return null;            // threshold for non-eye tiles
      let baseColor;
      if (useGrayPool && res.kind !== 'shadow') {
        const idx = Math.floor(hashNoise(cx / 3, cy / 3, p.seed + 999) * p.gray_pool.length);
        baseColor = p.gray_pool[Math.min(idx, p.gray_pool.length - 1)];
      } else if (res.kind === 'shadow') {
        return null;                            // shadow tiles = bg, skip
      } else if (res.kind === 'accent') {
        baseColor = p.accent_color;
      } else {
        baseColor = p.fg;
      }
      const qb = quantize5(res.b);              // 5 brightness levels
      const bandIdx = Math.max(0, Math.min(4, Math.round((qb - 0.2) * 5)));
      // FORGE gradient engine: map the cell to a palette RAMP. mode 'bright' = tonal depth (light/shadow);
      // lr/rl/tb/bt/in/out/spiral = directional gradient (still depth via brightness blend). soft = smooth, else chunky bands.
      if (p.face_ramp && p.face_ramp.palette && p.face_ramp.palette.length && res.kind !== 'accent') {
        const fr = p.face_ramp, pal = fr.palette, n = pal.length; let t;
        switch (fr.mode) {
          case 'lr': t = cx / 1000; break;
          case 'rl': t = 1 - cx / 1000; break;
          case 'tb': t = cy / 1000; break;
          case 'bt': t = 1 - cy / 1000; break;
          case 'in':  t = Math.min(1, Math.hypot(cx - CX, cy - CY) / R); break;
          case 'out': t = 1 - Math.min(1, Math.hypot(cx - CX, cy - CY) / R); break;
          case 'spiral': { const dx = cx - CX, dy = cy - CY, ang = Math.atan2(dy, dx) / (2 * Math.PI) + 0.5, dist = Math.min(1, Math.hypot(dx, dy) / R); t = (((ang * 2 + dist * 2.5) % 1) + 1) % 1; break; }
          default: t = res.b;   // 'bright' = pure depth ramp
        }
        let idx;
        if (fr.soft) idx = Math.min(n - 1, Math.floor(t * n));
        else { const seg = Math.min(n, fr.seg || 4); const s = Math.min(seg - 1, Math.floor(t * seg)); idx = Math.round(s * (n - 1) / Math.max(1, seg - 1)); }
        const col = pal[Math.max(0, Math.min(n - 1, idx))];
        return (!fr.mode || fr.mode === 'bright') ? col : blendOverBg(col, p.face_bg || p.bg, qb);   // bright ramp = direct (it IS the depth); directional = blend for depth
      }
      if (p.face_palette && p.face_palette.length === 5 && res.kind !== 'accent') {
        return p.face_palette[bandIdx];
      }
      if (p.face_recolor && p.face_recolor.palette && p.face_recolor.palette.length && res.kind !== 'accent') {
        const rc = faceRecolorPick(gx, gy, p.face_recolor, bs);   // depth preserved: blend the picked colour over the FACE base (dark), not the bold bg
        if (rc) return blendOverBg(rc, p.face_bg || p.bg, qb);
        const fpal = p.face_recolor.palette; return blendOverBg(fpal[Math.floor(hashNoise(gx, gy, (p.face_recolor.seed || p.seed) + 99) * fpal.length) % fpal.length], p.face_bg || p.bg, qb);   // NOT pattern-selected -> a PALETTE colour spread SPATIALLY (every colour everywhere, no single-band concentration) so the face is multi-colour, never a flat blob
      }
      // GILD: the brightest part of the face turns pure gold. Driven by a BRIGHTNESS THRESHOLD (gild_min) so the
      // coverage % can be tuned smoothly (the old top-N-bands jumped 5%->56%->87%). Cells with b >= gild_min gild.
      if (p.gild_min != null && res.kind !== 'accent' && res.b >= p.gild_min) {
        return '#fcb913';
      }
      return blendOverBg(baseColor, p.face_bg || p.bg, qb);  // pre-blend over the FACE base (forge: dark, so a bold bg never washes the face)
    }

    // ACCENT BLOCKS (Builder: Works=gold / Contracts=green, etc.): recolor K small clusters of the
    // FACE's own cells to the accent color so the blocks ARE the base (integral, not a floating overlay).
    // Clusters (2x1 / 2x2) so consecutive accent cells merge under run-length → cheap on-chain.
    // TWO block sets: accent_blocks = the facet's IDENTITY blocks (Builder works gold/green) FROZEN; owner_blocks = DYNAMIC owner-coloured blocks (shared palette) that change on transfer. Both on stable head-interior cells, rendered only where filled.
    let accentMap = null;
    const _hasAcc = p.accent_blocks && p.accent_blocks.count > 0 && (p.accent_blocks.colors || p.accent_blocks.color);
    const _hasOwn = p.owner_blocks && p.owner_blocks.count > 0 && p.owner_blocks.colors;
    if (_hasAcc || _hasOwn) {
      const filled = [];
      for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) { const ccx = gx * bs + bs / 2, ccy = gy * bs + bs / 2; if (Math.hypot(ccx - CX, ccy - CY) < R * 0.9) filled.push(gx * 10000 + gy); }
      if (filled.length) {
        const fset = new Set(filled);
        accentMap = new Map();
        const place = (spec, seedOff) => {
          const rng = mulberry32((p.seed | 0) + seedOff);
          const pal = spec.colors || [spec.color];
          let placed = 0, guard = 0; const want = spec.count, runMax = spec.run || 1;   // run>1 = horizontal lines (Dev "code"); 1 = scatter
          while (placed < want && guard < want * 50) {
            guard++;
            const k = filled[Math.floor(rng() * filled.length)];
            if (accentMap.has(k)) continue;
            const col = pal[Math.floor(rng() * pal.length)];
            accentMap.set(k, col);
            const gx0 = Math.floor(k / 10000), gy0 = k % 10000;
            let ext = 1;
            if (runMax > 1) ext = 1 + Math.floor(rng() * runMax);
            else if (rng() < 0.18) ext = 2;
            for (let e = 1; e < ext; e++) { const k2 = (gx0 + e) * 10000 + gy0; if (fset.has(k2) && !accentMap.has(k2)) accentMap.set(k2, col); else break; }
            placed++;
          }
        };
        if (_hasAcc) place(p.accent_blocks, 7919);   // identity works (frozen)
        if (_hasOwn) place(p.owner_blocks, 3313);    // owner-dynamic blocks (different seed so they sit on other cells)
      }
    }

    // OG CRACKS: build the crack-cell map (kintsugi). These cells break the run-merge in cellFill -> integral blocks.
    if (p.cracks && p.cracks.count > 0) {
      crackMap = new Map();
      const crng = mulberry32((p.seed | 0) + 5557);
      const gf = p.cracks.goldFrac || 0;
      for (let k = 0; k < p.cracks.count; k++) {
        for (const [x, y] of crackPath(crng, bs)) crackMap.set((x / bs) * 10000 + (y / bs), crng() < gf);
      }
    }

    // DEGEN on-face PnL flood (Rekt/Printing/Bleeding): recolour random ON-FACE cells as integral, brightness-shaded
    // splat cells (replaces the old flat pasted overlay that looked "extra" + didn't fill the base blocks). Same idea as cracks.
    if (p.face_splat) {
      splatMap = new Map();
      const srng = mulberry32((p.seed | 0) + 71);
      const gN = p.face_splat.green || 0, goN = p.face_splat.gold || 0, rN = p.face_splat.red || 0, want = gN + goN + rN;
      let placed = 0, tries = 0;
      while (placed < want && tries < want * 80 + 200) {
        tries++;
        const a = srng() * Math.PI * 2, d = srng() * R * 0.96;
        const gx = Math.round((CX + Math.cos(a) * d) / bs), gy = Math.round((CY + Math.sin(a) * d) / bs);
        const key = gx * 10000 + gy;
        if (splatMap.has(key)) continue;
        const rr = field(gx * bs + bs / 2, gy * bs + bs / 2);
        if (rr.b < 0.15 || rr.kind === 'shadow') continue;   // must land ON the face silhouette
        splatMap.set(key, placed < gN ? 'g' : (placed < gN + goN ? 'o' : 'r'));
        placed++;
      }
    }

    // RUN-LENGTH MERGE: consecutive same-fill tiles in a row → one wide rect.
    // Cuts rect count ~3-5x on the quantized face (big on-chain SVG-size win).
    // Keeps row gaps (height bs-1) + run-end gaps; loses only intra-run vertical lines.
    let tiles = '';
    const h = bs - 1;
    for (let gy = 0; gy < rows; gy++) {
      const y = gy * bs;
      let runFill = null, runStart = 0, runLen = 0;
      const flush = () => {
        if (runFill !== null && runLen > 0) {
          tiles += '<rect x="' + (runStart * bs) + '" y="' + y + '" width="' + (runLen * bs - 1) +
                   '" height="' + h + '" fill="' + runFill + '"' + outlineAttr + '/>';
        }
        runFill = null; runLen = 0;
      };
      for (let gx = 0; gx < cols; gx++) {
        const res = field(gx * bs + bs / 2, gy * bs + bs / 2);
        let f = cellFill(gx, gy, res);
        if (f !== null && accentMap !== null && accentMap.has(gx * 10000 + gy) && res.kind !== 'eye' && !res.maskEye && !res.maskBand && !res.mouthD && !res.mouthT && !res.mouthR && !res.mouthTip) f = accentMap.get(gx * 10000 + gy);   // accent never overrides eye/mouth feature cells
        // EYE CELLS: keep them as INDIVIDUAL blocks (mostly single, occasional double) so the eye reads as a
        // little mosaic of distinct blocks, never a few wide merged rectangles (which looked like a flat shape).
        if (res.kind === 'eye' && p.eye_fill_color) {
          flush();
          if (f !== null) {
            let span = 1;
            if (gx + 1 < cols) {
              const r2 = field((gx + 1) * bs + bs / 2, gy * bs + bs / 2);
              if (r2.kind === 'eye') {
                const f2 = cellFill(gx + 1, gy, r2);
                if (f2 !== null && f2 !== p.eye_pupil_color && hashNoise(gx, gy, p.seed + 777) < 0.20) span = 2;  // occasional double
              }
            }
            tiles += '<rect x="' + (gx * bs) + '" y="' + y + '" width="' + (span * bs - 1) + '" height="' + h + '" fill="' + f + '"' + outlineAttr + '/>';
            if (span === 2) gx++;
          }
          continue;
        }
        // MOUTH FEATURE CELLS (lip / teeth / blood): keep as INDIVIDUAL blocks (like eyes) so the mouth reads as a
        // row of distinct mosaic blocks, never a wide merged rectangle (the "pasted-on" look at coarse block sizes).
        // The rainbow VOMIT stream is NOT here -> it merges normally (cheap) and per-cell hue jitter keeps it textured.
        if (res.mouthD || res.mouthT || res.mouthR || res.mouthTip) {
          flush();
          if (f !== null) tiles += '<rect x="' + (gx * bs) + '" y="' + y + '" width="' + (bs - 1) + '" height="' + h + '" fill="' + f + '"' + outlineAttr + '/>';
          continue;
        }
        // DEGEN Rekt: fracture cells at FULL bs (no 1px gap) so the red cracks connect into solid lines, not separated blocks
        if (p.crack_solid && crackMap && crackMap.has(gx * 10000 + gy)) {
          flush();
          if (f !== null) tiles += '<rect x="' + (gx * bs) + '" y="' + y + '" width="' + bs + '" height="' + bs + '" fill="' + f + '"' + outlineAttr + '/>';
          continue;
        }
        if (f !== null && f === runFill) { runLen++; }
        else { flush(); if (f !== null) { runFill = f; runStart = gx; runLen = 1; } }
      }
      flush();
    }
    return tiles;
  }

  // CONTOUR / topographic face (NEWBIE): instead of filling tiles, draw only the BAND
  // BOUNDARIES (iso-brightness contour lines) → nested outlines following the face form,
  // like a survey map of a "newly arrived / freshly charted" identity. Per-row run-length
  // merge → byte-cheap (only boundary cells, no interior fill → often cheaper than solid).
  function renderContourTiles(field, p, bs) {
    const cols = Math.ceil(1000 / bs), rows = Math.ceil(1000 / bs);
    const pal = (p.face_palette && p.face_palette.length === 5) ? p.face_palette : null;
    // Band-level grid: -1 = bg/shadow, 0..4 = brightness band, 90 = eye. rg keeps the field result per cell so the
    // SHARED eyeCellColor() can render Newbie's eyes exactly like every other facet (centered iris + shade + Bandit).
    const lv = [], rg = [];
    for (let gy = 0; gy < rows; gy++) {
      lv[gy] = []; rg[gy] = [];
      for (let gx = 0; gx < cols; gx++) {
        const res = field(gx * bs + bs / 2, gy * bs + bs / 2);
        rg[gy][gx] = res;
        let v;
        if (res.kind === 'eye') v = 90;
        else if (res.b < 0.15 || res.kind === 'shadow') v = -1;
        else v = Math.max(0, Math.min(4, Math.round((quantize5(res.b) - 0.2) * 5)));
        lv[gy][gx] = v;
      }
    }
    const solidBands = p.contour_solid_bands || 0;          // hybrid: lowest N bands = SOLID fill
    // OWNER/ACCENT blocks (dynamic): contour mode doesn't run renderFaceTiles' accentMap, so build it here and draw
    // those cells SOLID — otherwise the owner-coloured blocks (e.g. NEWBIE/contour facets) would be invisible.
    let accentMap = null;
    const _hasOwn = p.owner_blocks && p.owner_blocks.count > 0 && p.owner_blocks.colors;
    const _hasAcc = p.accent_blocks && p.accent_blocks.count > 0 && (p.accent_blocks.colors || p.accent_blocks.color);
    if (_hasOwn || _hasAcc) {
      const filled = [];
      for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) { const ccx = gx * bs + bs / 2, ccy = gy * bs + bs / 2; if (Math.hypot(ccx - CX, ccy - CY) < R * 0.9) filled.push(gx * 10000 + gy); }
      if (filled.length) {
        const fset = new Set(filled);
        accentMap = new Map();
        const place = (spec, seedOff) => {
          const rng = mulberry32((p.seed | 0) + seedOff); const pal = spec.colors || [spec.color];
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
        if (_hasAcc) place(p.accent_blocks, 7919);
        if (_hasOwn) place(p.owner_blocks, 3313);
      }
    }
    function contourColor(gx, gy) {
      const ec = eyeCellColor(rg[gy][gx], gx, gy, bs, p);   // eyes + Bandit — PROTECTED from disperse below (face stays recognizable when fragmented)
      if (ec !== undefined) return ec;
      const mc = mouthCellColor(rg[gy][gx], gx, gy, bs, p); // mouth/vomit — PROTECTED
      if (mc !== undefined) return mc;
      if (p.face_disperse != null && hashNoise(gx, gy, p.seed + 4242) > p.face_disperse) return null;   // 2026-07-01: disperse (NEWBIE Form / FORGE scatter) drops only NON-feature cells now
      const v = lv[gy][gx];
      if (v < 0) return null;
      if (accentMap) { const ak = accentMap.get(gx * 10000 + gy); if (ak !== undefined) return ak; }   // owner/accent block = SOLID owner-coloured cell (the dynamic, visible in contour mode)
      let col = pal ? pal[v] : p.fg;
      if (p.face_recolor && p.face_recolor.palette && p.face_recolor.palette.length) {   // FORGE recolor in CONTOUR mode too (so Newbie/Ghost bases show the mix, not a flat blob)
        const rc = faceRecolorPick(gx, gy, p.face_recolor, bs);
        if (rc) col = blendOverBg(rc, p.face_bg || p.bg, 0.34 + v * 0.15);
      }
      if (v < solidBands) return col;                       // formed core → SOLID fill (every cell)
      const left = gx > 0 ? lv[gy][gx - 1] : -1;
      const top  = gy > 0 ? lv[gy - 1][gx] : -1;
      if (left === v && top === v) return null;             // emerging band → interior empty
      return col;                                           // emerging band → boundary = contour line
    }
    let tiles = '';
    const h = bs - 1;
    for (let gy = 0; gy < rows; gy++) {
      const y = gy * bs;
      let runFill = null, runStart = 0, runLen = 0;
      const flush = () => {
        if (runFill !== null && runLen > 0) {
          tiles += '<rect x="' + (runStart * bs) + '" y="' + y + '" width="' + (runLen * bs - 1) +
                   '" height="' + h + '" fill="' + runFill + '"/>';
        }
        runFill = null; runLen = 0;
      };
      for (let gx = 0; gx < cols; gx++) {
        const f = contourColor(gx, gy);
        if (f !== null && f === runFill) { runLen++; }
        else { flush(); if (f !== null) { runFill = f; runStart = gx; runLen = 1; } }
      }
      flush();
    }
    return tiles;
  }

  // RGB chromatic glitch: render face 3 times with R/G/B colors and slight offsets.
  // Each layer is partially transparent; overlapping regions blend toward white,
  // edges stay with individual R/G/B → chromatic aberration effect.
  // DEGEN chromatic glitch — OPTIMIZED. Renders the face ONCE (white) and uses a tiny
  // SVG filter to split R/G/B channels with horizontal offset (chromatic aberration).
  // Was 3× full face (~90KB); now 1× face + a ~600-byte filter (~3× smaller SVG).
  // DEGEN glitch BARS — horizontal datamosh tears across the face (top Glitch tiers). Semi-transparent neon strips, shifted.
  function glitchBarTiles(p, bs, off) {
    const n = p.glitch_bars || 0; if (n < 1) return '';
    const rng = mulberry32((p.seed | 0) + 4242);
    const NEON = ['#00ffe0', '#ff00d4', '#faff00'];
    const x0 = CX - R - off, w = 2 * R + 2 * off;
    let s = '';
    for (let i = 0; i < n; i++) {
      const yy = Math.round((CY - R * 0.72 + rng() * R * 1.44) / bs) * bs;
      const h = bs * (1 + Math.floor(rng() * 2));                       // 1-2 cells tall
      const dx = (rng() < 0.5 ? -1 : 1) * (off + Math.floor(rng() * (off + 1)));
      const col = NEON[Math.floor(rng() * NEON.length)];
      s += '<rect x="' + (x0 + dx) + '" y="' + yy + '" width="' + w + '" height="' + h + '" fill="' + col + '" opacity="0.5"/>';
    }
    return s;
  }
  function renderRgbGlitch(anchors, p, bs) {
    const off = Math.floor(bs * 0.6 * (p.rgb_offset != null ? p.rgb_offset : 1));   // Glitch trait scales the chromatic offset; 0 (None) = clean white face
    const whiteP = Object.assign({}, p, { fg: '#ffffff', render_mode: 'standard' });
    const field = computeBrightnessField(anchors, whiteP);
    const faceWhite = renderFaceTiles(field, whiteP, bs);
    const bars = glitchBarTiles(p, bs, Math.max(off, bs));
    if (off <= 0) return faceWhite + bars;                              // None -> clean, no chromatic split
    const id = 'gl' + (p.seed | 0);
    const filt =
      '<filter id="' + id + '" x="-12%" y="-12%" width="124%" height="124%">' +
        '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/>' +
        '<feOffset in="r" dx="-' + off + '" dy="0" result="ro"/>' +
        '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g"/>' +
        '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b"/>' +
        '<feOffset in="b" dx="' + off + '" dy="0" result="bo"/>' +
        '<feBlend in="ro" in2="g" mode="screen" result="rg"/>' +
        '<feBlend in="rg" in2="bo" mode="screen"/>' +
      '</filter>';
    // White face → filter splits it into R/G/B fringes ('rgb' = sub-cell legacy; 'ghost' = whole-cell, pixel-aligned).
    // White face → filter splits it into R/G/B fringes (clean chromatic glitch).
    return filt + '<g filter="url(#' + id + ')">' + faceWhite + '</g>' + bars;
  }

  // Seed-driven BACKGROUND system (art-variety layer). FULLY BLOCK-BASED — every
  // pattern is built from square tiles (never smooth shapes) so it stays on-theme.
  // Primary = the facet's bg color (identity anchor). Secondary is chosen from the
  // facet's OWN palette (accent / fg / cream) so it always harmonizes with the facet
  // theme — no clashing random colors. bg_variety=0 → solid (lab baseline tuning).
  const BG_PATTERNS = ['solid', 'gradient', 'scatter', 'checker', 'stripes', 'halftone', 'grid', 'rings', 'rays', 'diamonds', 'frames'];
  // Designed rarity for backgrounds (seed-derived → we fully control these %, unlike
  // facet-type which is minter-derived). Weights align to BG_PATTERNS order and DESCEND:
  // solid = most common ... frames = rarest. (User-defined rarity ranking.)
  const BG_WEIGHTS = [20, 17, 14, 12, 10, 8, 6, 5, 4, 3, 2];
  const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  // Royal-seal MEDALLION (WHALE signature): a struck-coin frame built from blocks —
  // a thin inner gold ring + a thick outer gold rim, centered on the head, with a
  // darker field beyond the coin. Per-row run-length merge → RLE-safe (cheap on-chain).
  function medallionTiles(p) {
    const primary = p.bg;
    const gold  = p.medallion_ring  || p.fg || '#fcb913';
    const outer = p.medallion_outer || '#000000';   // darker field outside the coin
    // FORGE (LEVIATHAN): radial GRADIENT coin — gold tones spread by distance instead of one flat gold.
    const gpal = (p.medallion_pal && p.medallion_pal.length) ? p.medallion_pal : null;
    const rng = mulberry32((p.seed | 0) + 4400);
    const GN = [29, 33, 37][Math.floor(rng() * 3)] | 1;   // ODD → symmetric coin
    const cell = 1000 / GN;
    const t = rng();
    const rIn   = R * (1.28 + t * 0.04);   // thin inner edge ring (center radius)
    const inW   = cell * 0.85;             // inner band half-width
    const rRimA = R * (1.48 + t * 0.05);   // thick outer rim: inner edge
    const rRimB = R * (1.74 + t * 0.06);   // thick outer rim: outer edge = coin boundary
    const goldAt = (d) => { if (!gpal) return gold; const f = Math.max(0, Math.min(0.999, (d - rIn) / (rRimB - rIn))); return gpal[Math.floor(f * gpal.length)]; };
    let cells = '';
    for (let cy = 0; cy < GN; cy++) {
      const yPx = (cy * cell).toFixed(1);
      let runStart = -1, runColor = null;
      const flush = (endCx) => {
        if (runStart >= 0) {
          cells += '<rect x="' + (runStart * cell).toFixed(1) + '" y="' + yPx +
                   '" width="' + ((endCx - runStart) * cell).toFixed(1) + '" height="' + cell.toFixed(1) +
                   '" fill="' + runColor + '"/>';
          runStart = -1; runColor = null;
        }
      };
      for (let cx = 0; cx < GN; cx++) {
        const d = Math.hypot(cx * cell + cell / 2 - CX, cy * cell + cell / 2 - CY);
        let col = null;
        if (d > rRimB) col = outer;
        else if (d >= rRimA) col = goldAt(d);
        else if (Math.abs(d - rIn) <= inW) col = goldAt(d);
        if (col) { if (runColor !== col) { flush(cx); runStart = cx; runColor = col; } }
        else flush(cx);
      }
      flush(GN);
    }
    return '<rect width="1000" height="1000" fill="' + primary + '"/>' + cells;
  }

  // HSL -> hex (compact; SVG accepts hsl() too but hex is fewer bytes on-chain).
  function hslHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return '#' + to(f(0)) + to(f(8)) + to(f(4));
  }
  function backgroundTiles(p) {
    if (p._no_bg) return '';   // FUSION: transparent face layer, composited over one shared bg
    const primary = p.bg;
    if (p.bg_solid) return '<rect width="1000" height="1000" fill="' + primary + '"/>'; // clean field (WHALE)
    if (p.medallion) return medallionTiles(p);   // royal seal — signature, always-on
    if (!p.bg_variety) return '<rect width="1000" height="1000" fill="' + primary + '"/>';
    const rng = mulberry32((p.seed | 0) + 4400);
    // Secondary color (ONE per token → stays RLE-mergeable, ~no extra bytes).
    // Multi-color bg: explicit p.bg_palette (e.g. BUILDER Phigures) OR DEGEN's rainbow.
    const RAINBOW10 = ['#fe0000', '#ff5500', '#ff8a00', '#fcb913', '#9dd812', '#16d34c', '#01b4ff', '#0101ef', '#5e00d4', '#ff00a0'];
    const mcPalette = (p.bg_palette && p.bg_palette.length)
      ? p.bg_palette.filter((c) => c !== primary)
      : (p.render_mode === 'rgb_glitch' ? RAINBOW10 : null);
    let sec, glitchPool = null;
    if (mcPalette && mcPalette.length) {
      // Per-token randomness: some solid (1 color), some 2-tone, some 3, some 5, some full.
      // Row-band based → run-length merge intact → free byte-wise regardless of count.
      const maxN = Math.min(8, mcPalette.length);
      const choices = [1, 1, 2, 2, 3, 5, 8].filter((n) => n <= maxN);
      const cnt = choices[Math.floor(rng() * choices.length)];
      const pool = mcPalette.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      glitchPool = pool.slice(0, cnt);
      sec = glitchPool[0];
    } else {
      // Harmonious secondary from the facet's own theme (accent > fg > neutrals).
      const cand = [];
      if (p.accent_color) cand.push(p.accent_color);
      if (p.fg) cand.push(p.fg);
      cand.push('#efdfc8', '#f0f0f0');
      const uniq = cand.filter((c, i) => c && cand.indexOf(c) === i && c !== primary);
      sec = uniq[Math.floor(rng() * uniq.length)] || '#f0f0f0';
    }
    // Weighted (rarity) pattern pick
    let pat = BG_PATTERNS[0];
    let wTotal = 0;
    for (let i = 0; i < BG_WEIGHTS.length; i++) wTotal += BG_WEIGHTS[i];
    let wr = rng() * wTotal;
    for (let i = 0; i < BG_PATTERNS.length; i++) { wr -= BG_WEIGHTS[i]; if (wr < 0) { pat = BG_PATTERNS[i]; break; } }
    if (p.bg_force_pattern) pat = p.bg_force_pattern;   // test override (keeps seed-derived GN/dir/color)
    let s = '<rect width="1000" height="1000" fill="' + primary + '"/>';
    if (pat === 'solid') return s;

    // Unified block grid — all patterns are square tiles.
    const GN = [21, 25, 29, 33, 41][Math.floor(rng() * 5)];  // varied block size (ODD → patterns center symmetrically)
    p._bg_gn = GN; p._bg_pat = pat;   // 2026-06-28: expose the bg grid so sparkTiles can drop NEWBIE sparks into the grid's empty gaps (not on the lines)
    const cell = 1000 / GN;
    const mid = (GN - 1) / 2;
    const maxD = Math.hypot(mid, mid);
    const dir = Math.floor(rng() * 5);   // gradient direction: 0 center-out, 1 T→B, 2 B→T, 3 L→R, 4 diag
    const invert = rng() < 0.5;
    const angBands = 6 + Math.floor(rng() * 7) * 2;   // rays
    const ringW = 2 + Math.floor(rng() * 3);          // rings / frames (cells per band)
    const stripeW = 2 + Math.floor(rng() * 3);        // stripes
    const scatterP = 0.16 + rng() * 0.22;             // scatter density
    const dotScale = 0.34 + rng() * 0.30;             // halftone block-dot size
    const diamondW = 2 + Math.floor(rng() * 3);       // diamonds (manhattan rings)
    const gridK = 3 + Math.floor(rng() * 3);          // grid line spacing
    // ORBS: 6-7 block-circles of VARIED sizes (incl small) scattered in the outer band → "blocks-made circles" bg
    let orbC = null;
    if (pat === 'orbs') {
      orbC = []; const orbN = 6 + Math.floor(rng() * 2);
      for (let i = 0; i < orbN; i++) {
        const ang = rng() * Math.PI * 2, dist = mid * (0.42 + rng() * 0.55);
        const rad = 1.3 + rng() * (i % 3 === 0 ? 1.4 : 4.2);   // mix: every 3rd is small, others up to large
        orbC.push({ x: mid + Math.cos(ang) * dist, y: mid + Math.sin(ang) * dist, r: rad });
      }
    }
    const starP = 0.04 + rng() * 0.03;                // starfield density (sparse)

    // bg3 DEEP: colour the SAME pattern's "on" cells with a seed gradient (light near the face -> dark at the canvas
    // edges, hue drift) instead of one flat secondary -> the style becomes a colour-RIOT. Band-quantized so runs merge.
    let deepCol = null;
    if (p.bg_deep) {
      const dBands = Math.max(4, Math.min(28, p.bg_deep_bands || 12));
      const dHue = Math.floor(mulberry32((p.seed | 0) + 8800)() * 360);
      const dox = 500, doy = p.bg_deep_oy != null ? p.bg_deep_oy : 460;
      const dMax = Math.hypot(Math.max(dox, 1000 - dox), Math.max(doy, 1000 - doy));
      // SCHEME = pure hue math -> identical byte cost. cohesive (one family) / cumbus (wide) / rainbow (full wheel, rare) /
      // lava (FIXED yellow->red preset). t: 0 = near origin (light) -> 1 = canvas edge (dark).
      const scheme = p.bg_deep_scheme || 'cohesive';
      const schemeCol = (t) => {
        // Keep darks VIVID: saturation RISES toward the dark edge + only moderate darkening (light floor ~44) → no muddy/dull tones.
        if (scheme === 'cumbus')  return hslHex(dHue + t * 110, 74 + t * 10, 82 - t * 38);   // Riot: wide-but-controlled hue
        if (scheme === 'rainbow') return hslHex(dHue + t * 330, 80,          82 - t * 36);   // full wheel
        if (scheme === 'lava')    return hslHex(50 - t * 50,    90,          86 - t * 40);   // yellow→red preset
        if (scheme === 'aqua')    return hslHex(196 + t * 44,   88,          84 - t * 40);   // cyan → deep blue preset
        if (scheme === 'verdant') return hslHex(96 + t * 56,    80,          82 - t * 40);   // lime → green preset
        return hslHex(dHue + t * 38, 72 + t * 10, 82 - t * 38);   // cohesive (default): gentle hue drift, vivid darks
      };
      deepCol = (px, py) => schemeCol(Math.min(dBands - 1, Math.floor(Math.hypot(px - dox, py - doy) / dMax * dBands)) / (dBands - 1));
    }

    let cells = '';
    // Protected base zone: head + small margin stays SOLID primary so the face reads
    // cleanly; pattern fills only the outer canvas.
    let protectR = p.bg_no_protect ? -1 : R * 1.25;
    // Halo legibility: extend the pattern-free zone to cover the WHOLE halo, so its rings sit on a
    // clean field instead of being swallowed by a busy bg (high-activity wallets lost their outer
    // rings into the multicolor pattern). The bg pattern then frames OUTSIDE the halo.
    // The bg must NEVER touch a halo: clear PAST the outer ring (engine halo OR Whale's custom gold halo).
    const hbs = p.block_size || 16;
    let haloOuter = 0;
    if (p.halo_rings > 0) {
      const _hb = p.block_size || 16, _bud = (p.halo_budget != null ? p.halo_budget : 228);   // mirror haloRingTiles geometry (per-facet budget, proportional auto-fit)
      let _sp = p.halo_rings > 1 ? _bud / (p.halo_rings - 1) : _hb; _sp = Math.max(_hb, Math.min(_sp, 1.3 * _hb));
      haloOuter = R + 20 + (p.halo_rings - 1) * _sp + _hb + 24;   // clear PAST the outer ring with a guaranteed clean gap (bg must NEVER touch the halo)
    }
    if (p.whale_halo_rings > 0) {                                          // WHALE gold halo (p.halo_rings is 0 for Whale)
      const wo = R + hbs * (2.8 + (p.whale_halo_rings - 1) * 1.35) + 70;
      if (wo > haloOuter) haloOuter = wo;
    }
    if (protectR > 0 && haloOuter > protectR) protectR = haloOuter;
    // GHOST: extend the clear zone to just past the silhouette contour so the bg never touches it.
    if (protectR > 0 && p._ghost_protect && p._ghost_protect > protectR) protectR = p._ghost_protect;
    // DEGEN (or any rolled facet): rotate the bg with the face's roll so the pattern sits tilted WITH it. Only fires when
    // roll != 0 (others unchanged); the pattern grid is over-scanned by PAD cells so the rotated corners stay covered.
    const roll = p.roll || 0;
    const PAD = roll ? Math.ceil(90 / cell) : 0;
    for (let cy = -PAD; cy < GN + PAD; cy++) {
      const yPx = (cy * cell).toFixed(1);
      // DEGEN: thin horizontal neon glitch bands — color changes per 2-row band but is
      // CONSTANT within a row, so run-length merge still works (no extra bytes).
      const rowSec = glitchPool
        ? glitchPool[(Math.imul((((cy / 2) | 0) + 1) ^ (p.seed | 0), 2246822519) >>> 24) % glitchPool.length]
        : sec;
      let runStart = -1, runColor = null;
      const flushRun = (endCx) => {
        if (runStart >= 0) {
          cells += '<rect x="' + (runStart * cell).toFixed(1) + '" y="' + yPx +
                   '" width="' + ((endCx - runStart) * cell).toFixed(1) + '" height="' + cell.toFixed(1) +
                   '" fill="' + runColor + '"/>';
          runStart = -1;
        }
      };
      for (let cx = -PAD; cx < GN + PAD; cx++) {
        const pcx = cx * cell + cell / 2, pcy = cy * cell + cell / 2;
        if (protectR > 0 && Math.hypot(pcx - CX, pcy - CY) < protectR) { flushRun(cx); continue; }
        let on = false, sz = cell;
        if (pat === 'gradient') {
          let ratio;
          if (dir === 0) ratio = Math.hypot(cx - mid, cy - mid) / maxD;   // base center → canvas edges
          else if (dir === 1) ratio = cy / (GN - 1);                      // top → bottom
          else if (dir === 2) ratio = 1 - cy / (GN - 1);                  // bottom → top
          else if (dir === 3) ratio = cx / (GN - 1);                      // left → right
          else ratio = (cx + cy) / (2 * (GN - 1));                        // diagonal
          if (invert) ratio = 1 - ratio;
          on = ratio > (BAYER4[cy & 3][cx & 3] + 0.5) / 16;               // ordered dither = tiled gradient
        } else if (pat === 'checker') {
          on = (((Math.abs(cx - mid) >> 1) + (Math.abs(cy - mid) >> 1)) % 2) === 0;  // 2x2 checker, centered
        } else if (pat === 'rays') {
          const a = Math.atan2(cy - mid, cx - mid) + Math.PI;
          on = Math.floor(a / (Math.PI * 2) * angBands) % 2 === 0;        // angular block bands
        } else if (pat === 'rings') {
          on = Math.floor(Math.hypot(cx - mid, cy - mid) / ringW) % 2 === 0;
        } else if (pat === 'stripes') {
          on = Math.floor(Math.abs((invert ? cx : cy) - mid) / stripeW) % 2 === 0;  // centered
        } else if (pat === 'halftone') {
          if ((Math.abs(cx - mid) % 2) === 0 && (Math.abs(cy - mid) % 2) === 0) { on = true; sz = cell * dotScale; }  // centered dot grid
        } else if (pat === 'scatter') {
          on = rng() < scatterP;
        } else if (pat === 'diamonds') {
          on = Math.floor((Math.abs(cx - mid) + Math.abs(cy - mid)) / diamondW) % 2 === 0;
        } else if (pat === 'frames') {
          on = Math.floor(Math.max(Math.abs(cx - mid), Math.abs(cy - mid)) / ringW) % 2 === 0;
        } else if (pat === 'grid') {
          on = (Math.abs(cx - mid) % gridK === 0) || (Math.abs(cy - mid) % gridK === 0);  // centered lines
        } else if (pat === 'eclipse') {
          const ed = Math.hypot(cx - mid, cy - mid) / maxD;                                 // dark sky + thin bright corona ring + thin radial streamers (rarest bg)
          const eang = (Math.atan2(cy - mid, cx - mid) + Math.PI) / (Math.PI * 2) * angBands;
          const spoke = Math.abs(eang - Math.round(eang)) < 0.12;
          on = (ed > 0.5 && ed < 0.58) || (spoke && ed > 0.5 && ed < 0.94);
        } else if (pat === 'orbs') {
          for (let i = 0; i < orbC.length; i++) { if (Math.hypot(cx - orbC[i].x, cy - orbC[i].y) <= orbC[i].r) { on = true; break; } }   // filled block-circles
        } else if (pat === 'starfield') {
          if (rng() < starP) { on = true; sz = cell * (0.3 + rng() * 0.65); }   // sparse stars of varied size
        } else if (pat === 'aurora') {
          const wav = cx + Math.sin((cy / (GN - 1)) * Math.PI * 2) * 3.2;
          on = Math.floor(Math.abs(wav - mid) / (stripeW + 1)) % 2 === 0;        // wavy vertical curtains
        }
        // RUN-LENGTH MERGE: consecutive same-colour full cells → one wide rect. DEEP varies colour per band so the run
        // breaks when the band colour changes; non-deep keeps one rowSec per row (merges exactly as before).
        if (on && sz === cell) {
          const cc = deepCol ? deepCol(pcx, pcy) : rowSec;
          if (p.bg_blocky) {   // BLOCKY: each cell is its own block with a gap → visible mosaic (matches the face), no smooth run-merge
            flushRun(cx);
            const gap = Math.max(2, cell * 0.1);
            cells += '<rect x="' + (cx * cell).toFixed(1) + '" y="' + (cy * cell).toFixed(1) + '" width="' + (cell - gap).toFixed(1) + '" height="' + (cell - gap).toFixed(1) + '" fill="' + cc + '"/>';
          } else if (runStart < 0 || cc !== runColor) { flushRun(cx); runStart = cx; runColor = cc; }
        } else {
          flushRun(cx);
          if (on) {  // halftone block-dot (sz < cell): centered, emitted individually
            const off = (cell - sz) / 2;
            cells += '<rect x="' + (cx * cell + off).toFixed(1) + '" y="' + (cy * cell + off).toFixed(1) +
                     '" width="' + sz.toFixed(1) + '" height="' + sz.toFixed(1) + '" fill="' + (deepCol ? deepCol(pcx, pcy) : rowSec) + '"/>';
          }
        }
      }
      flushRun(GN + PAD);
    }
    return s + (roll ? '<g transform="rotate(' + roll + ' 500 500)">' + cells + '</g>' : cells);
  }

  // Hologram scanlines: faint horizontal lines across the whole canvas (GHOST alien
  // transmission feel). One <g> shares fill+opacity → byte-cheap; ~45 full-width thin rects.
  function scanlineTiles(p) {
    if (!p.scanlines) return '';
    let s = '<g fill="' + p.scanlines + '" opacity="0.16">';
    for (let y = 0; y < 1000; y += 22) s += '<rect y="' + y + '" width="1000" height="3"/>';
    return s + '</g>';
  }

  // Gallery frame (COLLECTOR): a clean rectangular block frame + thin inner mat line +
  // a small nameplate bar, all in the sub-theme accent color (frame = what you collect).
  // ~9 rects → byte-trivial. The portrait sits inside it like a hung, curated work.
  function galleryFrameTiles(p, bs) {
    if (!p.gallery_frame) return '';
    const col = p.accent_color || p.fg;
    const x0 = 110, y0 = 118, x1 = 890, y1 = 782;
    const w = x1 - x0, h = y1 - y0;
    const t = Math.max(9, Math.round(bs * 0.8));   // outer frame thickness
    const g = 18, ti = 3;                           // mat gap + inner line thickness
    const R3 = (x, y, ww, hh) => '<rect x="' + x + '" y="' + y + '" width="' + ww + '" height="' + hh + '" fill="' + col + '"/>';
    let s = '';
    s += R3(x0, y0, w, t) + R3(x0, y1 - t, w, t) + R3(x0, y0, t, h) + R3(x1 - t, y0, t, h);   // outer frame
    const ix = x0 + t + g, iy = y0 + t + g, iw = w - 2 * (t + g), ih = h - 2 * (t + g);
    s += R3(ix, iy, iw, ti) + R3(ix, iy + ih, iw, ti) + R3(ix, iy, ti, ih) + R3(ix + iw, iy, ti, ih); // inner mat line
    const npW = 170, npH = 14;                                                                  // nameplate
    s += R3(500 - npW / 2, y1 - t - g - 30, npW, npH);
    return s;
  }

  // Floating mat (COLLECTOR passe-partout): a clean inner panel (deep navy by default, so the
  // white face pops) inset from the edges → the portrait "floats" on a mat, with a thin
  // sub-theme-accent keyline edging it. Drawn in the bg layer (behind the portrait). ~5 rects.
  function floatingMatTiles(p) {
    if (!p.floating_mat) return '';
    const mat = p.mat_color || '#01014a';
    const key = p.accent_color || p.fg;
    // 2026-07-11 (user): frame blocks must have EQUAL gaps + be symmetric. Root cause of the old unevenness: c = W/n was non-integer,
    // so floor()ed positions drifted (1-2px uneven gaps). FIX: INTEGER pitch `c`, exact span n*c, frame CENTERED -> every block on one
    // uniform grid, identical 1px gaps, tiles the border exactly (no partial corner cell). c ~= face block size.
    const bs = p.block_size || 16, n = Math.max(8, Math.round((1000 - 140) / bs)), c = Math.round((1000 - 140) / n), W = n * c, x0 = Math.round((1000 - W) / 2), y0 = x0, pat = p._frame_pat || 'solid';
    let s = '<rect x="' + x0 + '" y="' + y0 + '" width="' + (W - 1) + '" height="' + (W - 1) + '" fill="' + mat + '"/>';  // navy mat panel — W-1 so it ends EXACTLY at the frame's last block edge (was W -> 1px navy sliver poked past the frame on the right/bottom, aligned on left/top => asymmetric). 2026-07-11 (user).
    let g = '';   // PATTERN (replaces the old smooth opacity ramp with a DISCRETE block pattern): solid | ramp (per-side fade) | alt (alternating) | diag (corner-to-corner)
    const cell = (cx, cy) => {
      let o = 1;
      if (pat === 'ramp') o = (cy === 0 || cy === n - 1) ? 0.4 + 0.6 * (cx / (n - 1)) : 0.4 + 0.6 * (cy / (n - 1));   // each side fades low->full
      else if (pat === 'alt') o = ((cx + cy) % 2) ? 0.5 : 1;                                                         // checker-rhythm dash
      else if (pat === 'diag') o = 0.35 + 0.65 * ((cx + cy) / (2 * (n - 1)));                                        // corner-to-corner gradient
      g += '<rect x="' + (x0 + cx * c) + '" y="' + (y0 + cy * c) + '" width="' + (c - 1) + '" height="' + (c - 1) + '" fill="' + key + '" opacity="' + o.toFixed(2) + '"/>';
    };
    for (let i = 0; i < n; i++) { cell(i, 0); cell(i, n - 1); }            // top + bottom rows (incl. corners)
    for (let j = 1; j < n - 1; j++) { cell(0, j); cell(n - 1, j); }        // left + right columns (between corners)
    return s + g;
  }

  // PERMANENT rarity finish (collection-wide), derived from the token SEED → immutable,
  // owner-independent. A clean tradeable trait: standard ~88% · etched ~10% · gilded ~2%.
  function finishFromSeed(seed) {
    const r = mulberry32((seed | 0) + 5150)();
    if (r < 0.02) return 'prismatic';
    if (r < 0.12) return 'etched';
    return 'standard';
  }
  // Edge frame for the finish (both same thin 5px frame, different color):
  //   etched   = single accent-color border · prismatic = rainbow-segmented border (rare).
  function finishFrameTiles(p) {
    const f = p.finish;
    if (!f || f === 'standard') return '';
    const t = 5;
    const R3 = (x, y, w, h, c) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>';
    if (f === 'prismatic') {
      const RB = ['#fe0000', '#ff5500', '#ff8a00', '#fcb913', '#9dd812', '#16d34c', '#01b4ff', '#0101ef', '#5e00d4', '#ff00a0'];
      const n = RB.length, seg = 1000 / n;
      let s = '';
      for (let i = 0; i < n; i++) {
        const c = RB[i], a = i * seg;
        s += R3(a, 0, seg, t, c);                 // top  (L→R rainbow)
        s += R3(1000 - t, a, t, seg, c);          // right (T→B)
        s += R3(a, 1000 - t, seg, t, c);          // bottom (L→R)
        s += R3(0, a, t, seg, c);                 // left (T→B)
      }
      return s;
    }
    // etched: thin single frame in the facet's accent color
    const c = p.accent_color || '#f0f0f0';
    return R3(0, 0, 1000, t, c) + R3(0, 1000 - t, 1000, t, c) + R3(0, 0, t, 1000, c) + R3(1000 - t, 0, t, 1000, c);
  }

  // HEADPIECE (universal trait): a 3D silhouette WRAPPED on the head sphere — cells placed in spherical (lat,lon) coords,
  // projected with the pose (so it hugs + foreshortens with the head), and shaded by a Lambert light that MATCHES the face
  // (lit side follows the head turn) + quantized -> real pixel-art depth, not a flat 2D sticker. Finish = colour treatment.
  const HP_RAINBOW = ['#fe0000', '#ff7a00', '#fcdf00', '#16d34c', '#2f9ad3', '#3b3bff', '#a020f0'];
  function _hpColor(p, t, ndotl, gx, gy) {
    const fin = p.headpiece_finish || 'Solid';
    let base;
    if (fin === 'Rainbow') { let i = Math.floor(t * HP_RAINBOW.length); base = HP_RAINBOW[Math.max(0, Math.min(HP_RAINBOW.length - 1, i))]; }
    else if (fin === 'Gold') base = '#fcb913';
    else if (fin === 'Gradient') base = blendOverBg(p.headpiece_color2 || '#cfd8ff', p.headpiece_color || '#3a2c6e', Math.max(0, Math.min(1, t)));
    else base = p.headpiece_color || '#15151c';
    const q = Math.round((ndotl - 0.48) * 5) / 5;                           // centre on mid-light, quantize -> pixel-art light/shadow bands
    return shadeHex(base, q * 0.72 + (hashNoise(gx, gy, p.seed + 131) - 0.5) * 0.08);
  }
  function headpieceTiles(p, bs, anchors) {
    const hp = p.headpiece; if (!hp || hp === 'None') return '';
    const yaw = anchors.yaw, pitch = anchors.pitch, D = Math.PI / 180;
    const lm = Math.hypot(Math.sin(yaw) * 0.55, 0.55, 0.62) || 1;
    const L = [Math.sin(yaw) * 0.55 / lm, 0.55 / lm, 0.62 / lm];            // view-space light: upper-front, side follows the head turn
    const cells = new Map();
    function place(latDeg, lonDeg, rf, t) {
      const lat = latDeg * D, lon = lonDeg * D;
      const nx = Math.cos(lat) * Math.sin(lon), ny = Math.sin(lat), nz = Math.cos(lat) * Math.cos(lon);   // unit surface normal
      const rn = project(nx, ny, nz, yaw, pitch);
      if (rn[2] < -0.28) return;                                            // back-face cull (don't draw the far side)
      const pr = project(nx * R * rf, ny * R * rf, nz * R * rf, yaw, pitch);
      const gx = Math.floor((CX + pr[0]) / bs), gy = Math.floor((CY - pr[1]) / bs), k = gx * 10000 + gy;
      const ndotl = rn[0] * L[0] + rn[1] * L[1] + rn[2] * L[2];             // Lambert -> 3D volume
      const cur = cells.get(k);
      if (!cur || pr[2] > cur.z) cells.set(k, { gx, gy, t, ndotl, z: pr[2] });   // keep the frontmost cell
    }
    if (hp === 'Crown') {
      for (let lon = -80; lon <= 80; lon += 1.5) for (let lat = 36; lat <= 47; lat += 1.5) place(lat, lon, 1.02, (lon + 80) / 160);   // base band hugs the hairline (wraps the dome)
      [-46, 0, 46].forEach(pl => { for (let rr = 0; rr <= 8; rr++) { const rf = 1.02 + rr * 0.06, w = 9 * (1 - rr / 8) + 1;           // 3 RADIAL spikes poking OUT past the silhouette
        for (let lon = pl - w; lon <= pl + w; lon += 1.5) place(48, lon, rf, (lon + 80) / 160); } });
    } else if (hp === 'Headband') {
      for (let lon = -86; lon <= 86; lon += 1.5) for (let lat = 16; lat <= 34; lat += 1.5) place(lat, lon, 1.02, (lon + 86) / 172);
    } else if (hp === 'Mohawk') {
      for (let lat = 26; lat <= 90; lat += 1.5) { const tn = (lat - 26) / 64, w = 11 * (1 - tn) + 3.5, rf = 1.0 + 0.34 * tn;        // thick fin, rising + sticking out at the top
        for (let lon = -w; lon <= w; lon += 1.5) place(lat, lon, rf, tn); }
    }
    let body = '';
    cells.forEach(({ gx, gy, t, ndotl }) => { const x = gx * bs, y = gy * bs; if (x < 2 || y < 2 || x > 996 || y > 996) return;
      body += '<rect x="' + x + '" y="' + y + '" width="' + (bs - 1) + '" height="' + (bs - 1) + '" fill="' + _hpColor(p, t, ndotl, gx, gy) + '"/>'; });
    return body;
  }

  // RAINBOW VOMIT as a TOP layer (drawn LAST by callers, over wall/halo/frame -> ALWAYS on top, every facet). The mouth's
  // dark open slot stays in the face; this is just the rainbow stream: pours from the mouth, widens + meanders, fades in at top.
  function vomitTiles(params) {
    if (!params || params.mouth_style !== 'vomit') return '';
    const p = defaultsFor(params);
    if (p.pose_jitter > 0) {   // MATCH buildSVG's seed-derived pose jitter so the stream pours from the SAME mouth the face uses
      const jr = mulberry32((p.seed | 0) + 9001);
      p.yaw += (jr() * 2 - 1) * 6 * p.pose_jitter; p.pitch += (jr() * 2 - 1) * 4 * p.pose_jitter; p.roll += (jr() * 2 - 1) * 3 * p.pose_jitter;
    }
    const bs = p.block_size || 16;
    const anchors = getAnchors(p.yaw || 0, p.pitch || 0);
    const vmX = anchors.mouth[0], vmY = anchors.mouth[1] - 34, top = vmY - bs * 0.2;
    const cols = Math.ceil(1000 / bs); let s = '';
    for (let gy = 0; gy < cols; gy++) for (let gx = 0; gx < cols; gx++) {
      const x = gx * bs, y = gy * bs, cx = x + bs / 2, cy = y + bs / 2;
      if (cy <= top) continue;
      const down = cy - top, span = 985 - top, d = Math.min(1, down / span);
      const halfW = Math.min(bs * 6, bs * 1.9 + down * 0.10 + d * d * bs * 3.4);
      const ramp = Math.min(1, down / (bs * 7));
      const swayRaw = (Math.sin(down * 0.018 + (p.seed % 17) * 0.4) * (bs * 1.4) + Math.sin(down * 0.05 + 1.1) * (bs * 0.6)) * ramp;
      const center = vmX + Math.round(swayRaw / bs) * bs;
      if (Math.abs(cx - center) >= halfW) continue;
      let idx = Math.floor(d * VOMIT_PAL.length);
      const j = hashNoise(gx, gy, p.seed + 401);
      if (j < 0.18) idx -= 1; else if (j > 0.82) idx += 1;
      idx = Math.max(0, Math.min(VOMIT_PAL.length - 1, idx));
      const fade = d < 0.14 ? -0.45 * (1 - d / 0.14) : 0;
      const col = shadeHex(VOMIT_PAL[idx], (hashNoise(gx, gy, p.seed + 7) - 0.5) * 0.22 + fade);
      s += '<rect x="' + x + '" y="' + y + '" width="' + (bs - 1) + '" height="' + (bs - 1) + '" fill="' + col + '"/>';
    }
    return s;
  }

  function buildSVG(params) {
    const p = defaultsFor(params || {});
    if (!p.finish) p.finish = finishFromSeed(p.seed);   // permanent rarity finish (seed-derived)
    // Seed-derived micro-pose jitter (permanent per token, bounded so the facet
    // identity survives). Lets same-wallet / same-facet siblings read as distinct
    // "shots" of the same person. pose_jitter is a 0..1+ multiplier (0 = off).
    if (p.pose_jitter > 0) {
      const jr = mulberry32((p.seed | 0) + 9001);
      p.yaw   += (jr() * 2 - 1) * 6 * p.pose_jitter;
      p.pitch += (jr() * 2 - 1) * 4 * p.pose_jitter;
      p.roll  += (jr() * 2 - 1) * 3 * p.pose_jitter;
    }
    const anchors = getAnchors(p.yaw, p.pitch);
    const bs = p.block_size;
    const rng = mulberry32(p.seed);
    // GHOST: clear the bg pattern out to just beyond the silhouette contour so the contour never collides with the bg.
    if (p.ghost_outline) {
      let ext = R;
      for (const pt of [anchors.hingeL, anchors.gonialL, anchors.chin, anchors.gonialR, anchors.hingeR]) ext = Math.max(ext, Math.hypot(pt[0] - CX, pt[1] - CY));
      p._ghost_protect = ext + bs * 2.0;
    }
    p._bs = bs;                              // expose block size to field() for bs-aware mouth geometry
    const field = computeBrightnessField(anchors, p);

    let s = '';
    // Layer order (back → front):
    //   1. bg solid (eth_balance meter rendered later on left)
    //   2. grain (universal: total_tx) — diagonal flicker outside face
    //   3. roll group { halo, echos, face, geo, splatter }
    //   4. collector aura + color blocks + base line (lens-specific)
    //   5. base gas (universal: lifetime_gas)
    //   6. token stack (lens-specific)
    //   7. ens marker + frame border (universal: has_ens, tx_success_rate)

    s += backgroundTiles(p);
    s += floatingMatTiles(p);        // (legacy) COLLECTOR passe-partout mat
    s += collectionMonumentTiles(p, bs); // COLLECTOR: collection monument rising behind the portrait
    s += grainTiles(p, bs);
    s += '<g transform="rotate(' + p.roll + ' 500 500)">';
    s += haloRingTiles(p, bs);

    if (p.echo_trails > 0) {
      for (let e = 1; e <= p.echo_trails; e++) {
        const dx = (e % 2 === 0 ? -1 : 1) * e * (bs + 2);
        const dy = e * Math.floor(bs * 0.3);
        const eOp = (0.25 / e).toFixed(2);
        s += '<g transform="translate(' + dx + ' ' + dy + ')" opacity="' + eOp + '">';
        if (p.render_mode === 'rgb_glitch') {
          s += renderRgbGlitch(anchors, p, bs);
        } else {
          s += renderFaceTiles(field, p, bs);
        }
        s += '</g>';
      }
    }

    let faceStr;
    if (p.render_mode === 'rgb_glitch') {
      faceStr = renderRgbGlitch(anchors, p, bs);
    } else if (p.render_mode === 'contour') {
      faceStr = renderContourTiles(field, p, bs);
    } else {
      faceStr = renderFaceTiles(field, p, bs);
    }
    // VEIL (GHOST): fade the face INTERIOR; the silhouette contour (added next) stays crisp so the ghost still reads.
    if (p.veil_opacity != null && p.veil_opacity < 1) faceStr = '<g opacity="' + p.veil_opacity + '">' + faceStr + '</g>';
    s += faceStr;
    s += pnlOverlayTiles(p, bs);           // DEGEN PnL: red liquidation fractures (Rekt) / gold veins (Up Only), over the face
    s += headpieceTiles(p, bs, anchors);   // universal Headpiece: block silhouette on the head top (pose-aware + depth)
    s += ghostOutline(p, bs, anchors);     // GHOST: 1-cell silhouette contour (token-coloured)
    s += eyeMarkerTiles(p, bs, anchors);   // NEWBIE: 1-tile black eye dots
    s += geoOverlayTiles(p, bs, mulberry32(p.seed + 41));
    s += splatterTiles(p, bs, mulberry32(p.seed + 71));
    s += sparkTiles(p, bs, mulberry32(p.seed + 53));       // NEWBIE: glint sparks in the void around the face
    s += '</g>';

    s += colorBlockTiles(p, bs, mulberry32(p.seed + 137));
    s += baseLineTiles(p, bs);
    s += scanlineTiles(p);           // GHOST: hologram scanlines over the portrait
    s += galleryFrameTiles(p, bs);   // COLLECTOR: gallery frame + mat + nameplate
    s += baseGasTiles(p, bs);
    s += ethBalanceBlocks(p, bs);    // universal: eth_balance (left-side 10-block meter)
    s += successRateBlocks(p, bs);   // universal: tx_success_rate (right-side 10-block meter)
    s += ensMarkerTiles(p, bs);
    s += finishFrameTiles(p);        // PERMANENT rarity finish (etched/gilded edge frame), outermost
    return s;
  }

  function randomParams() {
    return {
      yaw: Math.round((Math.random() * 2 - 1) * 30),
      pitch: Math.round((Math.random() * 2 - 1) * 15),
      roll: Math.round((Math.random() * 2 - 1) * 8),
      seed: Math.floor(Math.random() * 1e6)
    };
  }

  return { buildSVG, vomitTiles, randomParams, getAnchors, backgroundTiles, finishFromSeed, BG_PATTERNS, BG_WEIGHTS };
})();
