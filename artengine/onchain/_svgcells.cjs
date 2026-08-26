// ONE SVG -> cell decoder, shared by every parity harness.
//
// ⚠️ WHY THIS FILE EXISTS. Fill grouping (2026-08-08) moved most `fill` attributes off the rects and onto
// an enclosing `<g fill="#rrggbb">`. Every harness had its OWN copy of
//     /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="1" fill="([^"]+)"\/>/g
// which matches NOTHING once the fill moves — so each one would have decoded a blank canvas on BOTH
// sides and reported a perfect match. Six harnesses would have gone green while proving nothing, which
// is the exact failure this project has already paid for four times (a stale FILES list, a stale
// manifest, a dead e2e, a plan-parity probe that never returned the layer it was testing).
//
// So the decoder is ONE function, it understands groups, and it THROWS on a rect it cannot resolve a
// fill for instead of skipping it. A harness that stops is a harness you can trust.
'use strict';

const RE = /<g\b([^>]*)>|<\/g>|<rect\b([^>]*?)\/>/g;
const ATTR = /([\w-]+)="([^"]*)"/g;
const isInt = s => /^-?\d+$/.test(s);

/// Decode a v7/forge SVG into a flat GRID*GRID array, row-major, in DOCUMENT ORDER (later rects paint
/// over earlier ones, exactly as SVG does).
///
/// `withClass`  cell value becomes `fill` or `fill|class` — the animated harnesses compare both.
/// returns { cells, bg, nrect, ngroup, skipped }
///   `skipped` counts rects with non-integer geometry: the FORGE FINISH FRAME is sub-cell
///   (`height="0.3"`) and every harness has always ignored it. Counted, not silently dropped.
function decode(svg, GRID, withClass) {
  const N = GRID * GRID;
  const bgm = /<rect width="\d+" height="\d+" fill="([^"]+)"\/>/.exec(svg);
  const bg = bgm ? bgm[1] : null;
  const cells = new Array(N).fill(bg);
  let gfill = null, depth = 0, nrect = 0, ngroup = 0, skipped = 0;
  RE.lastIndex = 0;
  let m;
  while ((m = RE.exec(svg))) {
    if (m[0] === '</g>') { gfill = null; depth--; continue; }
    if (m[1] !== undefined) {
      const f = /fill="([^"]*)"/.exec(m[1]);
      gfill = f ? f[1] : null; depth++; ngroup++;
      if (depth > 1) throw new Error('_svgcells: nested <g> — the emitter never writes one, so this is a real bug');
      continue;
    }
    const a = {}; ATTR.lastIndex = 0;
    let p; while ((p = ATTR.exec(m[2]))) a[p[1]] = p[2];
    if (a.x === undefined && a.y === undefined) continue;            // the full-canvas bg rect, already applied
    const fill = a.fill !== undefined ? a.fill : gfill;
    if (fill == null)
      throw new Error('_svgcells: <rect' + m[2] + '/> has no fill and no enclosing <g fill> — it would paint BLACK');
    if (!isInt(a.x || '0') || !isInt(a.y || '0') || !isInt(a.width || '0') || !isInt(a.height || '0')) { skipped++; continue; }
    const x = +(a.x || 0), y = +(a.y || 0), w = +(a.width || 0), h = +(a.height || 0);
    const v = withClass ? fill + (a.class ? '|' + a.class : '') : fill;
    nrect++;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const k = (y + dy) * GRID + x + dx;
      if (x + dx < GRID && y + dy < GRID && k >= 0 && k < N) cells[k] = v;
    }
  }
  if (depth !== 0) throw new Error('_svgcells: unbalanced <g> — ' + depth + ' left open');
  return { cells, bg, nrect, ngroup, skipped };
}

/// The common shape: just the array.
const cellsOf = (svg, GRID, withClass) => decode(svg, GRID, withClass).cells;

module.exports = { decode, cellsOf };
