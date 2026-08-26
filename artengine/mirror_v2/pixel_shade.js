/* FACETS — shared per-cell pixel shading for trait pieces (head / eyes / mouth).
   A piece = a SHAPE (cell list; a cell [c,r] gets auto tonal shading, a cell [c,r,'#hex'] keeps that exact
   accent colour) + a base colour. Shading = same hue, many tones: light from top, edges + bottom darker,
   plus subtle per-cell noise so EVERY block differs (no flat same-colour rows). window.PIXEL_SHADE.build(). */
(function () {
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function hexToHsl(hex) { let r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return { h: h * 360, s, l }; }
  function hslToHex(h, s, l) { h /= 360; let r, g, b; if (s === 0) { r = g = b = l; }
    else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      const hue = t => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
      r = hue(h + 1 / 3); g = hue(h); b = hue(h - 1 / 3); }
    const x = v => ('0' + Math.round(v * 255).toString(16)).slice(-2); return '#' + x(r) + x(g) + x(b); }
  function hnoise(x, y, s) { let h = ((x + 11) * 374761393 + (y + 17) * 668265263 + s * 2654435761) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (((h ^ (h >>> 16)) >>> 0) % 1000) / 1000; }

  // build(shape, baseHex, seed) -> [[c,r,color]] with per-cell shading; accent cells ([c,r,'#hex']) pass through.
  function build(shape, baseHex, seed) {
    seed = seed || 1; const base = hexToHsl(baseHex);
    const rs = shape.map(x => x[1]), cs = shape.map(x => x[0]);
    const bb = { minR: Math.min(...rs), maxR: Math.max(...rs), minC: Math.min(...cs), maxC: Math.max(...cs) };
    bb.cx = (bb.minC + bb.maxC) / 2;
    const seen = new Set(), out = [];
    for (const x of shape) { const k = x[0] + ',' + x[1]; if (seen.has(k)) continue; seen.add(k);
      if (x.length > 2) { out.push([x[0], x[1], x[2]]); continue; }
      const rowN = (x[1] - bb.minR) / Math.max(1, bb.maxR - bb.minR);
      const edge = Math.abs(x[0] - bb.cx) / Math.max(1, (bb.maxC - bb.minC) / 2 + 0.5);
      const L = clamp(base.l + 0.14 - rowN * 0.30 - edge * 0.10 + (hnoise(x[0], x[1], seed) - 0.5) * 0.13, 0.10, 0.93);
      out.push([x[0], x[1], hslToHex(base.h, base.s, L)]);
    }
    return out;
  }
  window.PIXEL_SHADE = { build, hexToHsl, hslToHex };
})();
