// Measure a generated Wrapped card: where is the black art panel, where are the three white fields, and
// which facet is this card anyway.
//
//   node exp/wrapped/card_probe.cjs "C:/path/to/folder"
//
// ⚠️ THE GEOMETRY IS NOT THE SAME ON ANY TWO CARDS. They were generated, not laid out, so the black
// square drifts in both size and position between them. A fixed composite offset would put the art a few
// pixels off centre on some cards and badly off on others, which is exactly the kind of thing nobody
// notices until it is public. Every card is measured, and the compositor uses ITS OWN numbers.
//
// ⚠️ THE ART MUST LAND ON A MULTIPLE OF 35. The FACETS grid is 35x35 with crispEdges; at any other size
// some cells take one more pixel than their neighbours and the boundary reads as a seam. So the detected
// square is rounded DOWN to the nearest multiple of 35 and centred in the hole, leaving a hairline of
// black margin rather than a distorted grid.
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const FF = 'C:/Users/gruff/OneDrive/Masa\u00fcst\u00fc/slam/ffmpeg.exe';

const DIR = process.argv[2] || 'C:/Users/gruff/Downloads';
const W = 512;                                   // probe at low res; scale results back up

function raw(file, w) {
  const r = spawnSync(FF, ['-y', '-i', file, '-vf', 'scale=' + w + ':' + w, '-f', 'rawvideo',
    '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 1 << 28 });
  return r.stdout && r.stdout.length >= w * w * 3 ? r.stdout : null;
}

// the black panel: the biggest run of near-black rows/columns, taken as a solid rectangle
function findPanel(buf, w) {
  const dark = (x, y) => { const i = (y * w + x) * 3; return buf[i] < 30 && buf[i + 1] < 30 && buf[i + 2] < 30; };
  const rowDark = [], colDark = [];
  for (let y = 0; y < w; y++) { let c = 0; for (let x = 0; x < w; x++) if (dark(x, y)) c++; rowDark.push(c); }
  for (let x = 0; x < w; x++) { let c = 0; for (let y = 0; y < w; y++) if (dark(x, y)) c++; colDark.push(c); }
  const span = arr => {                          // longest stretch above half the max
    const thr = Math.max(...arr) * 0.55;
    let best = [0, -1], cur = -1;
    for (let i = 0; i <= arr.length; i++) {
      if (i < arr.length && arr[i] >= thr) { if (cur < 0) cur = i; }
      else if (cur >= 0) { if (i - cur > best[0]) best = [i - cur, cur]; cur = -1; }
    }
    return { len: best[0], start: best[1] };
  };
  const r = span(rowDark), c = span(colDark);
  return { x: c.start, y: r.start, w: c.len, h: r.len };
}

// The three white fields sit BELOW the panel: two side by side, then one wide one. Rows give the bands,
// then a scan across the middle of each band gives the horizontal runs, so each field comes out as a
// real rectangle rather than a y range. The compositor needs all four numbers to centre text in them.
// ⚠️ Ghost's cards are noticeably greyer than the others, so the threshold is relative to what this
// particular card actually contains rather than a fixed 236.
function findFields(buf, w, panel) {
  const lum = (x, y) => { const i = (y * w + x) * 3; return (buf[i] + buf[i + 1] + buf[i + 2]) / 3; };
  const y0 = Math.min(w - 1, panel.y + panel.h + 2);
  let peak = 0;
  for (let y = y0; y < w; y++) for (let x = 0; x < w; x++) peak = Math.max(peak, lum(x, y));
  const T = peak - 12;
  const light = (x, y) => lum(x, y) >= T;

  const rows = [];
  for (let y = y0; y < w; y++) { let c = 0; for (let x = 0; x < w; x++) if (light(x, y)) c++; rows.push([y, c]); }
  const thr = Math.max(...rows.map(r => r[1])) * 0.45;
  const bands = []; let cur = null;
  for (const [y, c] of rows) {
    if (c >= thr) { if (!cur) cur = { y0: y, y1: y }; else cur.y1 = y; }
    else if (cur) { if (cur.y1 - cur.y0 >= 4) bands.push(cur); cur = null; }
  }
  if (cur && cur.y1 - cur.y0 >= 4) bands.push(cur);

  const rects = [];
  for (const b of bands.slice(0, 2)) {
    const my = Math.round((b.y0 + b.y1) / 2);
    let run = null;
    const found = [];
    for (let x = 0; x <= w; x++) {
      const on = x < w && light(x, my);
      if (on) { if (!run) run = { x0: x, x1: x }; else run.x1 = x; }
      else if (run) { found.push(run); run = null; }
    }
    if (run) found.push(run);
    // ⚠️ NEWBIE'S GROUND IS NEARLY AS BRIGHT AS ITS CARDS, so a plain brightness test also caught the
    // paper at the left and right margins and returned six fields instead of three. A real card never
    // touches the frame edge, and it is never a sliver: both filters together leave exactly the cards.
    const keep = found
      .filter(r => r.x0 > 1 && r.x1 < w - 2 && (r.x1 - r.x0) >= w * 0.12)
      .sort((a, b2) => (b2.x1 - b2.x0) - (a.x1 - a.x0))
      .slice(0, 2)
      .sort((a, b2) => a.x0 - b2.x0);
    keep.forEach(r => rects.push({ x: r.x0, y: b.y0, w: r.x1 - r.x0 + 1, h: b.y1 - b.y0 + 1 }));
  }
  return rects;
}

// which facet: the strongest non-paper hue anywhere on the card
function guessFacet(buf, w) {
  let gold = 0, green = 0, pink = 0, red = 0, blue = 0, grey = 0, tot = 0;
  for (let i = 0; i < w * w * 3; i += 3) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 40) continue;                        // the black panel
    tot++;
    if (mx - mn < 24) { grey++; continue; }       // paper and greys
    if (b > 150 && b - r > 60 && b - g > 40) blue++;
    else if (r > 170 && g > 120 && b < 110) gold++;
    else if (g > 130 && g - r > 40 && g - b > 30) green++;
    else if (r > 170 && b > 90 && r - g > 80 && b - g > 20) pink++;
    else if (r > 150 && r - g > 70 && r - b > 70) red++;
  }
  const p = n => (100 * n / Math.max(1, tot));
  return { blue: p(blue), gold: p(gold), green: p(green), pink: p(pink), red: p(red), grey: p(grey) };
}

const files = fs.readdirSync(DIR).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
  .map(f => ({ f, t: fs.statSync(path.join(DIR, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t).slice(0, Number(process.argv[3] || 8)).map(x => x.f);

console.log(files.length + ' card(s) in ' + DIR + '\n');
const out = [];
for (const f of files) {
  const full = path.join(DIR, f);
  const buf = raw(full, W);
  if (!buf) { console.log('  ' + f.slice(0, 38) + '   ⛔ could not decode'); continue; }
  const probe = spawnSync(FF, ['-i', full], { encoding: 'utf8' });
  const m = /, (\d{3,5})x(\d{3,5})/.exec(probe.stderr || '');
  const NW = m ? +m[1] : 1024, NH = m ? +m[2] : 1024;
  const k = NW / W;
  const p = findPanel(buf, W);
  const fields = findFields(buf, W, p);
  const hue = guessFacet(buf, W);
  const px = Math.round(p.x * k), py = Math.round(p.y * k), pw = Math.round(p.w * k), ph = Math.round(p.h * k);
  const side = Math.min(pw, ph);
  const art = Math.floor(side / 35) * 35;
  const top = Object.entries(hue).filter(([n]) => n !== 'grey').sort((a, b) => b[1] - a[1]);
  const F = fields.map(r => ({ x: Math.round(r.x*k), y: Math.round(r.y*k), w: Math.round(r.w*k), h: Math.round(r.h*k) }));
  out.push({ facet: f.replace(/.[a-z]+$/i,''), file: f, NW, NH, panel: {x:px,y:py,w:pw,h:ph}, art, fields: F });
  console.log('  ' + f.slice(0, 34).padEnd(36) + NW + 'x' + NH +
    '   panel ' + pw + 'x' + ph + ' @ ' + px + ',' + py +
    '   art ' + art + ' (' + (art / 35) + 'x35)   ' + top.slice(0, 2).map(([n, v]) => n + ' ' + v.toFixed(1) + '%').join(' · ') +
    '   fields ' + fields.length + '  ' + fields.map(r=>Math.round(r.w*k)+'x'+Math.round(r.h*k)).join(' '));
}
fs.writeFileSync(path.join(__dirname, 'card_geometry.json'), JSON.stringify(out, null, 1));
console.log('\nwrote card_geometry.json');
