/* THE FACET WORD — eight treatments of the biggest thing on the card, and the seeded draw that
   chooses one. gruff, 2026-08-26: "verdiğin tüm text örneklerinin hepsi kartta yer alsın, çıktıya
   göre de random birini koy."

   ⛔ THE DRAW IS SEEDED BY THE ADDRESS, NEVER BY Math.random().
   A fresh roll on every render would hand the same wallet a different card each time it loaded: the
   person shares their card, a stranger clicks through, and sees a different one. Seeded from the
   address it stops being randomness and becomes a TRAIT, the same rule the artwork itself lives by
   (every value comes from the seed). Same wallet, same treatment, forever.

   ⚠️ SIZES ARE IN cqw OF THE CARD. A comparison strip therefore has to render inside a container the
   width of the card, or a treatment written as 8.6cqw gets measured against a 530px panel instead of
   a 1600px card and every candidate is judged at the wrong scale. The first version of this lab did
   exactly that.
   ⚠️ Facet names run from OG (2 letters) to COLLECTOR (9). Every treatment is sized to one common cap
   height and then shrunk only if the longest word would leave its column. */
(function () {

// ── a 5x7 bitmap alphabet, the collection's own language ──────────────────────────────────────────
// The art is a 35x35 pixel grid, so one candidate sets the headline in pixels rather than in a system
// sans that has nothing to do with the picture beside it. Only the letters the seven names use.
const GLYPH = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  G: ['.###.', '#...#', '#....', '#..##', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#']
};

const colsOf = w => w.length * 5 + (w.length - 1);

// ⚠️ sized by HEIGHT. Sized by width, WHALE and COLLECTOR come out at completely different cap
// heights and the strip stops comparing like with like.
function pixelWord(word, fill, h) {
  let r = '', x = 0;
  for (const ch of word) {
    const g = GLYPH[ch];
    if (g) for (let y = 0; y < 7; y++) for (let i = 0; i < 5; i++)
      if (g[y][i] === '#') r += '<rect x="' + (x + i) + '" y="' + y + '" width="1" height="1"/>';
    x += 6;
  }
  const c = colsOf(word);
  return '<svg viewBox="0 0 ' + c + ' 7" shape-rendering="crispEdges" style="height:' + h.toFixed(2) +
    'cqw;width:' + (h * c / 7).toFixed(2) + 'cqw;display:block;fill:' + fill + '">' + r + '</svg>';
}

// ── fitting ───────────────────────────────────────────────────────────────────────────────────────
// Everything is expressed against ONE cap height, so the eight are interchangeable in the same slot.
// CAP is the visible height of a capital, which is what the eye compares, not the font size.
const CAP = 8.4;                         // cqw of the card. Was 6.4; grew when the index pill was cut.
const SANS = CAP / 0.72;                 // this face's caps are about 0.72 of its size
const EM = 0.615;                        // average advance per character at weight 900, tight tracking

const fitSans = (w, maxW, size) => Math.min(size, maxW / (w.length * EM));
const fitPix = (w, maxW, h) => Math.min(h, maxW * 7 / colsOf(w));

// ── the eight ─────────────────────────────────────────────────────────────────────────────────────
// Every one takes (word, ink, runner-up ink, art url, max width in cqw, plate).
// ⚠️ INK vs PLATE is not a nicety: COLLECTOR and OG measure 2.11 and 2.23 against this ground and
// cannot be read at any size, so text uses the lifted ink while a plate keeps the brand colour.
const T = {};

// 1 — solid, with two faint ghost copies
T.solid = (w, c, r, art, mw) => {
  const s = fitSans(w, mw, SANS);
  return '<div class="misfit" style="font:900 ' + s.toFixed(2) + 'cqw/.88 var(--disp);letter-spacing:-.045em">' +
    // ⚠️ THE TRAILING GHOST TAKES THE PLATE COLOUR, NOT WHITE.
    // White at 22% over a near-black card is grey, so every wallet drawn with this treatment got a
    // grey shadow whatever its facet. gruff asked for the layer underneath to carry a live colour
    // and never grey. `r` is the plate colour, which the card guarantees is one of the five
    // coloured facets.
    '<i style="color:' + r + ';opacity:.34;transform:translate(.5cqw,.42cqw)">' + w + '</i>' +
    '<i style="color:' + c + ';opacity:.35;transform:translate(-.42cqw,-.34cqw)">' + w + '</i>' +
    '<b style="color:' + c + '">' + w + '</b></div>';
};

// 2 — filled, with a white contour around it. Was hollow; gruff asked for the inside filled.
T.outline = (w, c, r, art, mw) => {
  const s = fitSans(w, mw, SANS);
  return '<div style="font:900 ' + s.toFixed(2) + 'cqw/.88 var(--disp);letter-spacing:-.045em;' +
    'color:' + c + ';-webkit-text-stroke:.22cqw #fff;paint-order:stroke fill;' +
    'white-space:nowrap">' + w + '</div>';
};

// 3 — filled with this wallet's own artwork, over a stroke so it never sinks into the ground
// ⚠️ measured weakness: most pieces are mostly dark field, so only part of the word takes colour.
T.art = (w, c, r, art, mw) => {
  const s = fitSans(w, mw, SANS);
  const base = 'font:900 ' + s.toFixed(2) + 'cqw/.88 var(--disp);letter-spacing:-.045em;white-space:nowrap;';
  return '<div style="position:relative;display:inline-block">' +
    '<div style="' + base + 'color:transparent;-webkit-text-stroke:.16cqw ' + c + '">' + w + '</div>' +
    '<div style="position:absolute;inset:0;' + base + 'color:transparent;' +
      '-webkit-background-clip:text;background-clip:text;background-image:url(' + art + ');' +
      'background-size:auto 340%;background-position:center 45%;' +
      'filter:saturate(1.7) brightness(1.9) contrast(1.15)">' + w + '</div></div>';
};

// 4 — knocked out of a solid plate of the facet colour
T.knock = (w, c, r, art, mw, plate) => {
  const s = fitSans(w, mw - 2.6, SANS * 0.88);
  return '<div style="display:inline-block;background:' + (plate || c) + ';padding:.5cqw 1.1cqw .75cqw;border-radius:.5cqw">' +
    '<div style="font:900 ' + s.toFixed(2) + 'cqw/.88 var(--disp);letter-spacing:-.045em;' +
    'color:#0b0b0e;white-space:nowrap">' + w + '</div></div>';
};

// 5 — a hard two plate offset in the runner-up facet's colour. No gradient anywhere.
T.riso = (w, c, r, art, mw) => {
  const s = fitSans(w, mw, SANS);
  return '<div class="misfit" style="font:900 ' + s.toFixed(2) + 'cqw/.88 var(--disp);letter-spacing:-.045em">' +
    '<i style="color:' + r + ';transform:translate(.8cqw,.66cqw)">' + w + '</i>' +
    '<b style="color:' + c + '">' + w + '</b></div>';
};

// 6 — set in the collection's own 5x7 grid
T.pixel = (w, c, r, art, mw) => pixelWord(w, c, fitPix(w, mw, CAP * 1.05));

// 7 — the pixel word cut out of a solid plate
T.pixelblock = (w, c, r, art, mw, plate) =>
  '<div style="display:inline-block;background:' + (plate || c) + ';padding:.9cqw 1.1cqw;border-radius:.5cqw">' +
    pixelWord(w, '#0b0b0e', fitPix(w, mw - 2.4, CAP * 0.86)) + '</div>';

// 8 — the facet colour, underlined in white. Inverted on 2026-08-26: it used to be a white word over
// a facet rule, which made white the main colour of the biggest thing on the card.
T.rule = (w, c, r, art, mw) => {
  const s = fitSans(w, mw, SANS * 0.96);
  return '<div style="display:inline-block">' +
    '<div style="font:800 ' + s.toFixed(2) + 'cqw/.9 var(--disp);letter-spacing:-.05em;color:' + c + ';' +
    'white-space:nowrap">' + w + '</div>' +
    '<div style="height:.4cqw;background:#fff;margin-top:.9cqw"></div></div>';
};

const ORDER = ['solid', 'outline', 'art', 'knock', 'riso', 'pixel', 'pixelblock', 'rule'];

const LABEL = {
  solid:      ['SOLID', 'the facet colour with two faint ghost copies'],
  outline:    ['FILLED, WHITE CONTOUR', 'the facet colour with a white outline around it'],
  art:        ['YOUR OWN PIECE', 'the word wears the wallet’s artwork. ⚠️ weak on a dark piece'],
  knock:      ['KNOCKED OUT', 'the colour becomes a plate, the word is the hole in it'],
  riso:       ['TWO PLATE', 'a hard offset in the runner-up facet’s colour'],
  pixel:      ['PIXELS', 'the same 5x7 grid the artwork is drawn in'],
  pixelblock: ['PIXELS, KNOCKED OUT', 'the pixel word cut out of a facet plate'],
  rule:       ['FACET + WHITE RULE', 'the facet colour, underlined in white']
};

// ── THE DRAW ──────────────────────────────────────────────────────────────────────────────────────
// ⛔ FNV-1a over the lowercased address. Deterministic, and deliberately a DIFFERENT offset basis
// from mirror_piece.cjs's seedOf, so the treatment does not correlate with the artwork's own seed and
// the two read as independent traits rather than one decision made twice.
function pick(addr, pool) {
  pool = pool && pool.length ? pool : ORDER;
  const s = String(addr).toLowerCase();
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return pool[h % pool.length];
}

// what the card calls
function forCard(addr, word, ink, runnerUpInk, art, maxW, pool, plate) {
  const k = pick(addr, pool);
  return { key: k, html: T[k](word, ink, runnerUpInk, art, maxW == null ? 54 : maxW, plate) };
}

window.FACETWORD = { T: T, LABEL: LABEL, ORDER: ORDER, pixelWord: pixelWord, pick: pick,
                     forCard: forCard, CAP: CAP, SANS: SANS };
})();
