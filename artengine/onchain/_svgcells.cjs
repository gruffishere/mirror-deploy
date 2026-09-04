// ⛔ PARSE THE GROUPS. render_v7 emits most cells inside <g fill="X"> ... </g>, and the rects inside a group
// carry NO fill of their own. A parser that looks for fill= on the rect silently drops every grouped cell.
// That is not a small undercount: it reported a 59-cell mask as 3 cells, and it is why a whale halo appeared
// to draw one ring when it draws seven. Third instrument failure of the day from the same root cause -
// a detection method the pipeline is free to change.
const GRID = 35;
function cells(svg, grid) {
  const N = grid || GRID;
  const a = new Array(N * N).fill(null);
  const bg = svg.match(/<rect width="\d+" height="\d+" fill="([^"]+)"\/>/);
  if (bg) a.fill(bg[1]);
  const put = (x, y, wd, ht, col) => {
    for (let dy = 0; dy < (ht || 1); dy++) for (let dx = 0; dx < (wd || 1); dx++) {
      const c = x + dx, r = y + dy; if (c >= 0 && c < N && r >= 0 && r < N) a[r * N + c] = col;
    }
  };
  // grouped cells first: <g fill="X"> ... </g>
  for (const g of svg.matchAll(/<g fill="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)) {
    const col = g[1];
    for (const m of g[2].matchAll(/<rect x="(-?\d+)" y="(-?\d+)"(?: width="(\d+)")?(?: height="(\d+)")?/g))
      put(+m[1], +m[2], m[3] ? +m[3] : 1, m[4] ? +m[4] : 1, col);
  }
  // then rects carrying their own fill
  for (const m of svg.matchAll(/<rect x="(-?\d+)" y="(-?\d+)"(?: width="(\d+)")?(?: height="(\d+)")? fill="([^"]+)"/g))
    put(+m[1], +m[2], m[3] ? +m[3] : 1, m[4] ? +m[4] : 1, m[5]);
  return a;
}
// ⚠️ `cellsOf` IS THE OLD NAME AND IT IS KEPT ON PURPOSE. The rename to `cells` on 2026-08-29 left 20
// callers pointing at a function that no longer exists; they die at load with "cellsOf is not a function".
// Among them v7_parity, forge_render_parity and anim_e2e_parity, the guards this project runs after every
// render edit. A guard that cannot start is worse than no guard, because its silence reads as a pass.
// Same function, both names. Restored 2026-08-30.
module.exports = { cells, cellsOf: cells, GRID };
