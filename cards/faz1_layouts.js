// THE ADDRESS PRINTED ON THE CARD.
// ⚠️ NOT read from location.host on purpose: the PNG is rendered by a headless browser pointed
// at the server's own loopback address, so location.host would stamp 127.0.0.1:8141 onto every
// card a visitor shared. Set window.MIRROR_HOST to override.
var MIRROR_HOST = (typeof window !== 'undefined' && window.MIRROR_HOST) || 'MIRROR.THEFACETS.ART';

/* THE THREE CARDS. One copy of each layout, shared by the comparison page, the single-card page and
   whatever renders the final PNG. Two copies of a layout is how a card ships looking like neither draft.
   Every size is in cqw, so a card is identical at 320px and at 1600px. */
(function () {
const F7 = ['NEWBIE','COLLECTOR','DEGEN','BUILDER','OG','WHALE','GHOST'];
const TAGLINE = {
  NEWBIE: 'the story just began', COLLECTOR: 'taste is a signal', DEGEN: 'all in, always',
  BUILDER: 'you ship', OG: 'you were here first', WHALE: 'the tide moves with you',
  GHOST: 'seen everything, said nothing'
};
const esc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const short = a => a.slice(0,6) + '...' + a.slice(-4);
const num = n => n.toLocaleString('en-US');            // pinned: this machine runs a Turkish locale

// Everything a card needs, derived once. `signed` decides identity and nothing else.
const GREY_FACETS = ['OG', 'GHOST'];
// THE COLOUR THAT GOES UNDER THE WORD.
// ⚠️ NOT PICKED AT RANDOM FROM THE COLOURED FACETS, which is what the first version did and what
// put DEGEN's magenta under COLLECTOR's periwinkle. gruff named the pairing that works: BUILDER's
// red over COLLECTOR's periwinkle reads as one live object. What that pair has is a plate DARKER
// and cooler than the word, so it falls back like a shadow instead of competing with it.
// Each row below is ordered best-first, and the address chooses between the top two, so the
// plate still varies from wallet to wallet without ever landing on a clash.
const PLATE = {
  BUILDER:   ['COLLECTOR', 'DEGEN'],      // red over periwinkle, the pair gruff approved
  DEGEN:     ['COLLECTOR', 'BUILDER'],    // magenta is red-adjacent, so it takes the same plate
  WHALE:     ['COLLECTOR', 'DEGEN'],      // gold over periwinkle, the strongest contrast here
  NEWBIE:    ['COLLECTOR', 'DEGEN'],      // green over periwinkle stays cool and legible
  COLLECTOR: ['BUILDER', 'DEGEN'],        // periwinkle is already the dark one, so it takes a warm plate
  OG:        ['COLLECTOR', 'DEGEN'],      // grey word, any strong plate lifts it
  GHOST:     ['DEGEN', 'COLLECTOR'],
};
function plateColour(addr, dom) {
  const pool = (PLATE[dom] || ['COLLECTOR', 'DEGEN']).filter(function (f) { return f !== dom; });
  let h = 0x9e3779b1;                                  // a basis of its own
  const a = String(addr || '').toLowerCase();
  for (let i = 0; i < a.length; i++) { h ^= a.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return 'var(--' + pool[h % pool.length] + '-lit)';
}

function view(D, signed, typed, twin, near, rank) {
  const p = D.profile, s = D.signals, dom = p.dominant;
  const t = typed || {};
  return {
    dom: dom, s: s, p: p,
    colour: 'var(--' + dom + ')',            // the brand colour: plates, frame, glow, spectrum
    lit: 'var(--' + dom + '-lit)',           // the same colour lifted enough to be READ on the dark card
    runnerLit: 'var(--' + p.runnerUp + '-lit)',
    // THE TWO-PLATE WORD'S BOTTOM LAYER, AND IT IS NEVER GREY.
    // Two of the seven facets are greys, OG graphite and Ghost slate, so whenever those two come
    // first and second the offset word is grey on grey and the whole effect disappears. Seen on
    // gunslinger.eth: OG over GHOST, one flat grey shape. The plate carries no meaning the card
    // does not already state in words, so when the runner-up is one of the greys it is replaced by
    // a coloured facet picked FROM THE ADDRESS, like every other value here. Its own FNV basis, so
    // it does not track the treatment or the embers.
    plateLit: plateColour(s.addr, dom),
    ink: 'var(--' + dom + '-ink)',           // the light-ground twin, unused on this card
    // identity: only a signature earns a name. Anyone can read anyone's wallet, so an unsigned card
    // may never carry a typed name or the page becomes a free impersonation tool.
    name: signed && t.name ? t.name : (s.ens || short(s.addr)),
    handle: signed && t.handle ? '@' + t.handle : null,
    sub: signed ? (s.ens || short(s.addr)) : short(s.addr),
    signed: signed,
    score: Math.round(100 * p.axes[dom]),
    rarer: (100 * p.rarity).toFixed(2),
    top: (100 - 100 * p.rarity).toFixed(2),
    spread: p.spread.toFixed(1),
    beats: (D.story && D.story.card || []).map(function (b) { return b.line; }),
    twin: twin,
    near: near,
    rank: rank || null,
    report: (D.story && D.story.report) || [],
    margin: p.margin,
    runnerUp: p.runnerUp,
    // ⚠️ MEASURED: 594 wallets of 5,000 (11.9%) have their top two within 0.02, and 841 (16.8%)
    // within 0.03. For those people the single word this card leads with is close to a coin flip.
    // Saying so is both honest and the more interesting line ("I am almost a COLLECTOR").
    nearTie: (typeof window !== 'undefined' && window.FAZ1_TIE) || p.margin < 0.03,
    fact: p.facts[dom],
    year: new Date(s.firstTs * 1000).getUTCFullYear(),
    // ⚠️ the lab has five hand-rendered PNGs next to it; the live page has an endpoint that draws
    // any address. One hook so the same layout serves both without a second copy of it existing.
    art: (typeof window !== 'undefined' && window.FAZ1_ART)
      ? window.FAZ1_ART(s.addr, dom) : 'art/' + s.addr + '.png'
  };
}

// ── THE HIGHLIGHTS ────────────────────────────────────────────────────────────────────────────────
// gruff, 2026-08-26: four identical fields at the bottom of every card is a waste of the best row on
// it. So the row is not fixed, it is THIS wallet's most extreme numbers.
//
// Nothing new is scored here. `story.cjs` already ranks every beat by how far it sits from the
// population median, which is exactly "how striking is this", and that ranking was measured. This
// only turns the winning beats into a label and a value short enough for a column.
// ⚠️ A beat whose real value is missing or zero returns null and drops out, or a wallet that has
// never deployed anything gets a proud CONTRACTS BUILT: 0.
const DATE = ts => new Date(ts * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function highlight(key, s) {
  const t = s.shape || {};
  switch (key) {
    case 'age':      return s.ageDays ? ['DAYS ON CHAIN', num(s.ageDays)] : null;
    case 'first':    return s.firstTs ? ['FIRST MOVE', DATE(s.firstTs)] : null;
    case 'peak':     return t.peakYear ? ['MOVES IN ' + t.peakYear, num(t.peakYearCount)] : null;
    case 'silence':  return t.silenceDays >= 60 ? ['GONE FOR', num(t.silenceDays) + ' DAYS']
                          : (t.silenceDays != null ? ['NEVER GONE OVER', num(t.silenceDays) + ' DAYS'] : null);
    case 'hour':     return t.loudHour != null ? ['YOUR HOUR', String(t.loudHour).padStart(2, '0') + ':00 UTC'] : null;
    case 'busiest':  return t.busiestDayCount ? ['BUSIEST DAY', num(t.busiestDayCount) + ' MOVES'] : null;
    case 'gas':      return t.topGwei ? ['WORST GAS', num(Math.round(t.topGwei)) + ' GWEI'] : null;
    case 'gastotal': return s.gasEth ? ['GAS BURNED', s.gasEth.toFixed(2) + ' Ξ'] : null;
    case 'revert':   return s.failCount ? ['PAID FOR NOTHING', num(s.failCount) + ' TIMES'] : null;
    case 'volume':   return s.volumeEth ? ['TOTAL VOLUME', num(Math.round(s.volumeEth)) + ' Ξ'] : null;
    case 'hold':     return s.nfts ? ['PIECES HELD', num(s.nfts)] : null;
    case 'build':    return s.directDeploys ? ['CONTRACTS BUILT', num(s.directDeploys)] : null;
    case 'contacts': return t.distinctContacts ? ['ADDRESSES MET', num(t.distinctContacts)] : null;
    default:         return null;
  }
}

function highlights(v, n) {
  const out = [];
  v.report.slice().sort(function (a, b) { return b.score - a.score; }).forEach(function (b) {
    if (out.length >= n) return;
    const h = highlight(b.key, v.s);
    if (h) out.push(h);
  });
  return out;
}

// ⛔ IGNITION IS A MEASURED NUMBER, NOT A FEELING. Total volume, because it is the one driver already
// printed on the card: anyone can read TOTAL VOLUME and see why their card burns. Measured against
// the frozen 5,000: 1,000 Ξ is reached by 6.74% and 50,000 Ξ by 0.38%.
// ⚠️ LOG SCALE. Volume is heavy tailed, so a linear ramp would leave everyone between 1,000 and
// 40,000 looking identical and only vitalik alight.
const FIRE_MIN = 1000, FIRE_MAX = 50000;
function fireHeat(volumeEth) {
  const v = Number(volumeEth) || 0;
  if (v < FIRE_MIN) return 0;
  const t = (Math.log(v) - Math.log(FIRE_MIN)) / (Math.log(FIRE_MAX) - Math.log(FIRE_MIN));
  return Math.max(0, Math.min(1, t));
}

// ⚠️ SEEDED FROM THE ADDRESS like every other value on this card. A fresh roll per render would make
// the same wallet a different card on every load, which is the whole reason the treatment draw is
// seeded too. Its own FNV basis, so the embers do not correlate with the artwork or the treatment.
function fireLayer(addr, heat) {
  if (heat <= 0) return '';
  const n = Math.round(6 + heat * 22);                     // 6 embers at ignition, 28 fully ablaze
  let h = 0x2545f491 >>> 0;
  const s = String(addr).toLowerCase();
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const rnd = function () { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = rnd() * 104 - 2;                             // a little past both edges, so it is not a band
    const size = (0.6 + rnd() * 1.5) * (0.7 + heat * 0.8);
    const rise = 14 + rnd() * 34 * (0.6 + heat * 0.7);
    const dur = 3.4 + rnd() * 4.6;
    const delay = -rnd() * dur;                            // negative, so the fire is already alight on load
    const dx = (rnd() * 6 - 3).toFixed(1);
    // scattered through the lower half rather than all starting under the edge
    const bot = (-4 + rnd() * 44 * (0.5 + heat * 0.6)).toFixed(1);
    out += '<i style="left:' + x.toFixed(1) + '%;bottom:' + bot + '%;width:' + size.toFixed(2) +
      'cqw;height:' + size.toFixed(2) + 'cqw;--rise:' + rise.toFixed(0) + 'cqw;--dx:' + dx + 'cqw;' +
      'animation-duration:' + dur.toFixed(2) + 's;animation-delay:' + delay.toFixed(2) + 's"></i>';
  }
  return '<div class="fire" style="opacity:' + (0.55 + heat * 0.45).toFixed(2) + '">' +
    '<div class="bed" style="opacity:' + (0.5 + heat * 0.5).toFixed(2) + '"></div>' + out + '</div>';
}

function spectrum(p, style) {
  return '<div class="spec abs" style="' + style + '">' + F7.map(function (f) {
    return '<i style="width:' + (100 * p.share[f]).toFixed(2) + '%;background:var(--' + f + ')"></i>';
  }).join('') + '</div>';
}

function signPill(v, dark) {
  if (v.signed) {
    return '<span class="pill" style="font-size:1.15cqw;padding:.75cqw 1.3cqw;background:' +
      (dark ? '#fff' : 'var(--ink)') + ';color:' + (dark ? '#111114' : '#fff') +
      '"><i class="tick"></i>SIGNED</span>';
  }
  return '<span class="pill" style="font-size:1.15cqw;padding:.75cqw 1.3cqw;' +
    'border:.13cqw solid currentColor;opacity:.5">UNSIGNED</span>';
}

// ── 1. WRAPPED ────────────────────────────────────────────────────────────────────────────────────
// Flat facet colour edge to edge, the art dropped on it like a photograph, the facet word at poster
// size, and one white block at the bottom holding the number people will compare.
function L1(v) {
  const twinLine = v.twin
    ? 'closest twin <b style="color:var(--ink)">' + esc(v.twin.who) + '</b>, ' +
      (v.twin.d < 0.09 ? 'and it is uncanny' : 'and still not that close')
    : 'your twin has not looked in the mirror yet';
  return '' +
'<div class="card r45" style="background:' + v.colour + ';color:#fff">' +
  '<div class="abs m" style="left:5cqw;top:4cqw;font-size:1.25cqw;opacity:.72">FACETS &middot; THE MIRROR</div>' +
  '<div class="abs m" style="right:5cqw;top:4cqw;font-size:1.25cqw;opacity:.72">2026</div>' +

  '<div class="art abs" style="left:20cqw;top:8cqw;width:60cqw;height:60cqw;border-radius:1.2cqw">' +
    '<img src="' + v.art + '" alt=""></div>' +
  '<div class="reg" style="left:18.7cqw;top:6.7cqw;color:#fff"></div>' +
  '<div class="reg" style="right:18.7cqw;top:6.7cqw;color:#fff"></div>' +
  '<div class="reg" style="left:18.7cqw;top:66.7cqw;color:#fff"></div>' +
  '<div class="reg" style="right:18.7cqw;top:66.7cqw;color:#fff"></div>' +

  '<div class="abs" style="left:5cqw;right:5cqw;top:70.5cqw;display:flex;align-items:flex-end;justify-content:space-between">' +
    '<div>' +
      '<div style="font:800 5cqw/1 var(--disp);letter-spacing:-.03em">' + esc(v.name) + '</div>' +
      '<div class="m" style="font-size:1.4cqw;opacity:.75;margin-top:.9cqw">' + esc(v.handle || v.sub) + '</div>' +
    '</div>' +
    '<div style="padding-bottom:.4cqw">' + signPill(v, false) + '</div>' +
  '</div>' +

  '<div class="abs" style="left:5cqw;right:5cqw;top:80.5cqw;display:flex;align-items:center;gap:2cqw">' +
    '<div style="font:900 11cqw/.86 var(--disp);letter-spacing:-.05em">' + v.dom + '</div>' +
    '<div class="pill m" style="font-size:1.35cqw;padding:.85cqw 1.5cqw;border:.16cqw solid rgba(255,255,255,.55)">' +
      v.dom + ' SCORE ' + v.score + '</div>' +
  '</div>' +

  '<div class="abs" style="left:5cqw;right:5cqw;top:94cqw;bottom:4.5cqw;background:#fff;color:var(--ink);' +
       'border-radius:1.4cqw;padding:2.4cqw 3cqw">' +
    '<div class="half abs" style="inset:0;border-radius:1.4cqw"></div>' +
    '<div style="display:flex;align-items:baseline;justify-content:space-between">' +
      '<div>' +
        '<div class="m" style="font-size:1.15cqw;color:var(--muted)">RARER THAN</div>' +
        '<div style="font:900 6.8cqw/1 var(--disp);letter-spacing:-.035em;margin-top:.5cqw">' + v.rarer + '%</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div class="m" style="font-size:1.15cqw;color:var(--muted)">AT ONCE</div>' +
        '<div style="font:900 3.2cqw/1 var(--disp);margin-top:.8cqw">' + v.spread +
          '<span style="font-size:1.6cqw;color:var(--muted)"> / 7</span></div>' +
      '</div>' +
    '</div>' +
    '<div style="margin-top:1.8cqw">' +
      v.beats.slice(0, 3).map(function (b) {
        return '<div style="font-size:1.5cqw;line-height:1.72;color:#33333c">' + esc(b) + '</div>'; }).join('') +
      '<div style="font-size:1.42cqw;line-height:1.7;color:var(--muted);margin-top:.7cqw">' +
        '<span class="tick" style="background:var(--' + (v.twin ? v.twin.facet : v.dom) +
        ');vertical-align:middle;margin-right:.7cqw"></span>' + twinLine + '</div>' +
    '</div>' +
  '</div>' +
  spectrum(v.p, 'left:0;right:0;bottom:0;height:1.1cqw') +
'</div>';
}

// ── 2. READOUT ────────────────────────────────────────────────────────────────────────────────────
// The shape of the reference: identity at the top, one number as the payload, a band of supporting
// figures underneath. Dark, so the art is the only colour on the card until the facet word.
function L2(v) {
  const stats = [
    ['ON CHAIN SINCE', v.year],
    ['PIECES HELD', num(v.s.nfts)],
    ['GAS BURNED', v.s.gasEth.toFixed(2) + ' ETH'],
    ['CLOSEST TWIN', v.twin ? v.twin.who : 'not read yet']
  ];
  return '' +
'<div class="card r169 dark" style="background:var(--ground);color:var(--lit)">' +
  '<div class="art abs" style="left:4cqw;top:8.5cqw;width:34cqw;height:34cqw;border-radius:.8cqw">' +
    '<img src="' + v.art + '" alt=""></div>' +
  '<div class="abs m" style="left:4cqw;top:4cqw;font-size:1.05cqw;color:var(--dim)">FACETS &middot; THE MIRROR</div>' +

  '<div class="abs" style="left:44cqw;right:4cqw;top:7.4cqw;display:flex;align-items:flex-start;justify-content:space-between">' +
    '<div>' +
      '<div style="font:800 3.1cqw/1 var(--disp);letter-spacing:-.02em;color:#fff">' + esc(v.name) + '</div>' +
      '<div class="m" style="font-size:1.05cqw;color:var(--dim);margin-top:.9cqw">' + esc(v.handle || v.sub) + '</div>' +
    '</div>' +
    '<div style="color:var(--dim)">' + signPill(v, true) + '</div>' +
  '</div>' +

  '<div class="abs" style="left:44cqw;top:16.5cqw">' +
    '<div class="m" style="font-size:.95cqw;color:var(--dim)">DOMINANT FACET</div>' +
    '<div style="display:flex;align-items:baseline;gap:1.4cqw;margin-top:.7cqw">' +
      '<div style="font:900 7.4cqw/.9 var(--disp);letter-spacing:-.04em;color:' + v.colour + '">' + v.dom + '</div>' +
      '<div class="pill m" style="font-size:1cqw;padding:.6cqw 1cqw;border:.1cqw solid rgba(255,255,255,.22);color:var(--dim)">SCORE ' + v.score + '</div>' +
    '</div>' +
  '</div>' +

  '<div class="abs" style="left:44cqw;top:28cqw">' +
    '<div class="m" style="font-size:.95cqw;color:var(--dim)">RARER THAN</div>' +
    '<div style="font:900 9.6cqw/.92 var(--disp);letter-spacing:-.045em;color:#fff;margin-top:.4cqw">' + v.rarer + '%</div>' +
    '<div style="font-size:1.15cqw;color:var(--dim);margin-top:1cqw">of 5,000 real Ethereum wallets. you are ' +
      v.spread + ' of 7 facets at once.</div>' +
  '</div>' +

  '<div class="abs" style="left:4cqw;right:4cqw;top:45.6cqw;height:.06cqw;background:rgba(255,255,255,.15)"></div>' +
  '<div class="abs" style="left:4cqw;right:4cqw;top:47.6cqw;display:grid;grid-template-columns:repeat(4,1fr);gap:2cqw">' +
    stats.map(function (kv) {
      return '<div><div class="m" style="font-size:.9cqw;color:#5f5f6c">' + kv[0] + '</div>' +
        '<div style="font:700 2.1cqw/1 var(--disp);color:#fff;margin-top:.75cqw;white-space:nowrap;' +
        'overflow:hidden;text-overflow:ellipsis">' + esc(String(kv[1])) + '</div></div>'; }).join('') +
  '</div>' +
  spectrum(v.p, 'left:0;right:0;bottom:0;height:.7cqw') +
'</div>';
}

// ── 3. SPECTRUM ───────────────────────────────────────────────────────────────────────────────────
// Paper. The seven axes ARE the graphic, because "no one is one thing" is the whole thesis and a
// single verdict hides it. Rarity moves onto a sticker, which is the part that gets cropped and reposted.
function L3(v) {
  const bars = v.p.ordered.map(function (f) {
    const w = Math.max(1.5, Math.min(100, 100 * v.p.bars[f]));
    const on = f === v.dom;
    return '<div style="display:flex;align-items:center;gap:1.4cqw;margin-bottom:' + (on ? 1.5 : 1.15) + 'cqw">' +
      '<div class="m" style="flex:0 0 15cqw;font-size:1.1cqw;color:' +
        (on ? 'var(--' + f + '-ink)' : 'var(--muted)') + '">' + f + '</div>' +
      '<div style="flex:1;height:' + (on ? 2.6 : 1.5) + 'cqw;background:#e8e8ee;border-radius:99px;overflow:hidden">' +
        '<div style="width:' + w + '%;height:100%;background:var(--' + f + ');border-radius:99px"></div></div>' +
      '<div class="m" style="flex:0 0 5cqw;text-align:right;font-size:1.1cqw;color:' +
        (on ? 'var(--ink)' : 'var(--muted)') + '">' + Math.round(100 * v.p.axes[f]) + '</div>' +
    '</div>';
  }).join('');
  return '' +
'<div class="card r11" style="background:var(--paper);color:var(--ink)">' +
  '<div class="abs m" style="left:5cqw;top:4.4cqw;font-size:1.1cqw;color:var(--muted)">FACETS &middot; THE MIRROR</div>' +
  '<div class="abs" style="right:5cqw;top:3.8cqw;color:var(--muted)">' + signPill(v, false) + '</div>' +

  '<div class="art abs" style="left:5cqw;top:9.5cqw;width:40cqw;height:40cqw;border-radius:1cqw">' +
    '<img src="' + v.art + '" alt=""></div>' +
  '<div class="reg dark" style="left:2.6cqw;top:7.1cqw;color:var(--ink)"></div>' +
  '<div class="reg dark" style="left:2.6cqw;top:47.4cqw;color:var(--ink)"></div>' +

  '<div class="abs" style="left:49cqw;right:5cqw;top:10.5cqw">' +
    '<div style="font:800 3.6cqw/1 var(--disp);letter-spacing:-.025em">' + esc(v.name) + '</div>' +
    '<div class="m" style="font-size:1.15cqw;color:var(--muted);margin-top:.9cqw">' + esc(v.handle || v.sub) + '</div>' +
    '<div style="font:900 7.6cqw/.9 var(--disp);letter-spacing:-.045em;color:' + v.ink + ';margin-top:3cqw">' + v.dom + '</div>' +
    '<div class="m" style="font-size:1.15cqw;color:var(--muted);margin-top:1.4cqw">SCORE ' + v.score +
      ' &middot; ' + v.spread + ' OF 7 FACETS</div>' +
    '<div style="font-size:1.4cqw;line-height:1.6;color:#44444e;margin-top:1.8cqw">' + esc(v.fact) + '</div>' +
  '</div>' +

  '<div class="abs" style="left:27cqw;top:36cqw;width:20cqw;aspect-ratio:1;border-radius:50%;' +
       'background:var(--ink);color:#fff;transform:rotate(-8deg);display:flex;flex-direction:column;' +
       'align-items:center;justify-content:center;text-align:center;box-shadow:0 1.1cqw 2.4cqw rgba(0,0,0,.25)">' +
    '<div class="m" style="font-size:1.05cqw;opacity:.7">TOP</div>' +
    '<div style="font:900 4.6cqw/1 var(--disp);letter-spacing:-.03em;margin-top:.35cqw">' + v.top + '%</div>' +
    '<div class="m" style="font-size:.85cqw;opacity:.7;margin-top:.5cqw">OF 5,000 WALLETS</div>' +
  '</div>' +

  '<div class="abs m" style="left:5cqw;top:58cqw;font-size:1.1cqw;color:var(--muted)">' +
    'ALL SEVEN, BECAUSE NO ONE IS ONE THING</div>' +
  '<div class="abs" style="left:5cqw;right:5cqw;top:62.5cqw">' + bars + '</div>' +

  '<div class="abs" style="left:5cqw;right:5cqw;top:88cqw;height:1px;background:var(--line)"></div>' +
  '<div class="abs" style="left:5cqw;right:5cqw;top:91cqw;display:flex;justify-content:space-between;align-items:baseline">' +
    '<div style="font-size:1.35cqw;color:var(--muted)">' +
      '<span class="tick" style="background:var(--' + (v.twin ? v.twin.facet : v.dom) +
      ');vertical-align:middle;margin-right:.7cqw"></span>' +
      (v.twin ? 'your closest twin of 5,000 is <b style="color:var(--ink)">' + esc(v.twin.who) + '</b>'
              : 'your twin has not looked in the mirror yet') + '</div>' +
    '<div class="m" style="font-size:1.05cqw;color:var(--muted)">' + MIRROR_HOST + '</div>' +
  '</div>' +
  spectrum(v.p, 'left:0;right:0;bottom:0;height:.9cqw') +
'</div>';
}

// ── 2b. READOUT, SECOND PASS ──────────────────────────────────────────────────────────────────────
// Same skeleton as L2, every note from 2026-08-26 applied:
//   dead space filled · name and handle much larger, with a misregistered rainbow contour · a
//   patterned facet-coloured frame in the spirit of the site's Collector frame · labels loud enough
//   to read at arm's length · the facet word carrying a foil sheen instead of one flat colour ·
//   the hero number replaced with one a person can picture · the bottom row rebuilt out of THIS
//   wallet's most extreme figures · a real signature, and an empty signature line when there is none.
function L2b(v) {
  // the rainbow contour: four stroked copies a hair out of register, one solid on top
  // the name is plain white now: the rainbow moved onto the score, where one rainbow can be loud
  // without three of them arguing.
  // ⚠️ NEVER CLIP A NAME. The first fix capped the box and cut "dingaling" to "dingalinç", which is
  // worse than the collision it was fixing. 24cqw of room, ~0.62em per character at this weight.
  const rname = function (txt, size) {
    const fit = Math.min(size, 24 / (Math.max(1, String(txt).length) * 0.62));
    return '<div style="font:900 ' + fit.toFixed(2) + 'cqw/1 var(--disp);letter-spacing:-.035em;' +
      'color:#fff;white-space:nowrap">' + esc(txt) + '</div>';
  };

  const H = highlights(v, 4);
  // ⛔ THIS WAS A RANK, AND THE RANK WAS A LIE FOR THE PEOPLE MOST LIKELY TO SHARE IT.
  // A rank promises a unique position and these axes cannot deliver one. BUILDER is
  // Math.min(1, 0.70 * Math.min(1, deploys / 30) + 0.30 * earlyDeploy), so it SATURATES: 33 deploys
  // and 354 deploys are the same number, and vitalik.eth and ack.eth both came back "#1 BUILDER".
  // Measured over the 5,000: five wallets tie at BUILDER #1, fifteen tie at NEWBIE #1, and 13.8% of
  // all wallets share a rank with somebody (BUILDER 67%, OG 42%, COLLECTOR 22%).
  // ⚠️ And I had "validated" it on FIVE wallets that happened to land on five different numbers.
  // ⇒ gruff's call: say what the seven-axis table says instead of inventing a league out of it. The
  // spread cannot promise uniqueness, and it is the collection's own thesis.
  const R = v.rank || null;
  // ⚠️ "4.0 of 7" WAS NOT A COUNT AND READ LIKE ONE. spread is sum(axes) / max(axis): a concentration
  // ratio that goes to 1 when everything sits in one facet and to 7 when all seven are equal. True,
  // and impossible to read as anything but "you are four facets", which is not what it says.
  // ⇒ gruff's call: show how far each of the seven is filled, which is the thing people actually
  // want to know and cannot be misread.
  const gap = Math.round(100 * v.p.axes[v.dom]) - Math.round(100 * v.p.axes[v.runnerUp]);
  const heroLabel = 'HOW MUCH OF EACH FACET YOU ARE';
  // ⚠️ the bar is capped at 100 for LAYOUT only; the number beside it is the real index and may pass
  // 100, because the calibration deliberately does not clamp. See the note on the score in view().
  // the six you are NOT, beside the one you are. The dominant facet is the big number, so repeating
  // it in the list would say the same thing twice in the same box.
  const rows = v.p.ordered.filter(function (f) { return f !== v.dom; }).map(function (f) {
    const w = Math.max(0, Math.min(100, 100 * v.p.bars[f]));
    return '<div style="display:grid;grid-template-columns:8.6cqw 1fr 3.4cqw;gap:0 .9cqw;' +
      'align-items:center;height:1.28cqw">' +
      '<div class="m" style="font-size:.9cqw;color:#7a7a88">' + f + '</div>' +
      '<div style="height:.42cqw;background:#23232c;border-radius:99px;overflow:hidden">' +
        '<div style="width:' + w.toFixed(1) + '%;height:100%;border-radius:99px;background:var(--' + f + ')"></div>' +
      '</div>' +
      '<div class="m" style="font-size:.92cqw;text-align:right;color:#8b8b98">' +
        Math.round(100 * v.p.axes[f]) + '</div>' +
    '</div>';
  }).join('');
  const heroSupport = 'You lean <b style="color:#fff;font-weight:700">' + v.dom + '</b>, ' +
    (TAGLINE[v.dom] || '') + '. <b style="color:' + v.runnerLit + '">' + v.runnerUp + '</b> ' +
    (gap === 0 ? 'is level with it.' : 'is ' + gap + ' behind.');
  const heroAside = v.near === 0 ? 'NOBODY IN 5,000 SHARES YOUR MIX' : v.near + ' OF 5,000 SHARE YOUR MIX';

  return '' +
'<div class="card r169 dark" style="background:#0b0b0e;color:var(--lit);--F:' + v.colour + '">' +

  // ground: the wallet's own art, huge and faint off the right edge, over a facet-coloured glow
  '<div class="glow" style="left:-14cqw;top:-6cqw;width:52cqw;height:52cqw;background:' + v.colour + '"></div>' +
  '<div class="ghostart" style="right:-16cqw;top:-26cqw;width:74cqw;height:74cqw">' +
    '<img src="' + v.art + '" alt=""></div>' +

  // ⚠️ HERE, and nowhere else: in front of the blurred art cloud and behind every other element.
  // Placed by DOM order rather than z-index, so nothing else on the card has to know it exists.
  fireLayer(v.s.addr, fireHeat(v.s.volumeEth)) +

  '<div class="abs" style="left:4cqw;top:3cqw">' +
    '<div class="m" style="font-size:1.15cqw;color:var(--dim);display:flex;align-items:baseline;gap:.6cqw">' +
      '<span class="wmc"><b>FACETS</b></span>' +
      '<span>&middot; THE MIRROR &middot; ' + MIRROR_HOST + '</span></div>' +
    // ⚠️ THE ARTIST, FIXED, ON EVERY CARD. This used to print v.handle, which is the handle of
    // WHOEVER SIGNED. On gruff's own card the two are the same person, so it looked correct and was
    // wrong everywhere else: someone else's card carried their name as the byline, and an unsigned
    // card carried none. The signer is already named beside the portrait; this line credits the work.
    '<div class="m" style="font-size:.95cqw;color:#5f5f6c;margin-top:.5cqw">by @gruffwashere</div>' +
  '</div>' +

  // the piece
  '<div class="art abs" style="left:4cqw;top:8.5cqw;width:34cqw;height:34cqw;border-radius:.8cqw;' +
       'box-shadow:0 1.2cqw 3cqw rgba(0,0,0,.55)"><img src="' + v.art + '" alt=""></div>' +

  // identity
  '<div class="abs" style="left:41.5cqw;top:5.8cqw;height:6.4cqw;display:flex;align-items:flex-end">' + rname(v.name, 6.2) + '</div>' +
  '<div class="abs m" style="left:41.5cqw;top:12.9cqw;font-size:1.3cqw;color:#9a9aa8">' +
    esc(v.handle || v.sub) + '</div>' +

  // the signature, or the empty line where one would go
  '<div class="abs" style="left:66cqw;width:30cqw;top:4.6cqw;text-align:right;color:#fff">' +
    '<div style="height:6.6cqw;display:flex;align-items:flex-end;justify-content:flex-end;overflow:visible">' +
      (v.signed
        ? '<div class="sign rbtext" style="font-size:4.2cqw;line-height:1;white-space:nowrap;' +
            'transform:rotate(-8deg) translate(-.4cqw,-.7cqw)">approved by facets</div>'
        : '') +
    '</div>' +
    '<div class="sigline"></div>' +
    '<div class="m" style="font-size:.95cqw;color:' + (v.signed ? '#b9b9c6' : '#5f5f6c') + ';margin-top:.8cqw">' +
      (v.signed ? 'SIGNED WITH THIS WALLET' : 'NOT SIGNED &middot; READ ONLY') + '</div>' +
  '</div>' +

  // the facet
  '<div class="abs m" style="left:41.5cqw;top:16.2cqw;font-size:1.35cqw;color:#9a9aa8">' +
    (v.nearTie ? 'DOMINANT FACET, BARELY' : 'DOMINANT FACET') + '</div>' +
  '<div class="abs" style="left:41.5cqw;top:18cqw;height:11.7cqw;display:flex;align-items:flex-end">' +
    window.FACETWORD.forCard(v.s.addr, v.dom, v.lit, v.plateLit, v.art, 54,
      (typeof window !== 'undefined' && window.FAZ1_POOL) || null, v.colour).html + '</div>' +

  // ⛔ THE NEAR-TIE LINE USED TO SIT HERE, AT top:31cqw, WHICH IS THE HERO BOX'S OWN TOP.
  // It printed straight through the box's heading. It also said a third time what the card already
  // says twice: the label reads DOMINANT FACET, BARELY, and the support line names the runner-up
  // and its distance. Deleted rather than moved: there is no room between the word slot, which ends
  // at 29.7, and the box at 31, and nothing was lost.

  // the number, replacing the percentile as the payload
  // ⚠️ EVERY BAND IS A FIXED HEIGHT AND THE BOX IS CUT FOR THE SUM OF THEM. The previous version
  // centred a huge number against a paragraph that wrapped to a different number of lines per wallet,
  // so the two were aligned on one card and adrift on the next.
  '<div class="abs rbbox" style="left:41.5cqw;right:4cqw;top:31cqw;bottom:9.4cqw;border-radius:1.1cqw;background:rgba(8,8,11,.62);' +
       'padding:1.15cqw 1.5cqw;display:flex;flex-direction:column">' +
    '<div style="flex:0 0 auto;display:flex;align-items:baseline;justify-content:space-between;gap:1.4cqw">' +
      '<div class="m" style="font-size:1.15cqw;color:#9a9aa8">' +
        '<span style="background-image:var(--rainbow);background-repeat:no-repeat;' +
        'background-position:0 100%;background-size:100% .24cqw;padding-bottom:.5cqw">' +
        heroLabel + '</span></div>' +
      '<div class="m" style="font-size:.95cqw;color:#6f6f7c;white-space:nowrap">' + heroAside + '</div>' +
    '</div>' +
    '<div style="flex:1 1 auto;display:flex;align-items:center;gap:2.4cqw;padding:.5cqw 0 .3cqw">' +
      // the score, in the type the card was built around
      '<div style="flex:0 0 auto;text-align:center">' +
        '<div style="font:900 8.2cqw/.86 var(--disp);letter-spacing:-.05em;color:#fff">' +
          Math.round(100 * v.p.axes[v.dom]) + '</div>' +
        '<div class="m" style="font-size:.95cqw;color:' + v.lit + ';margin-top:.45cqw">' + v.dom + '</div>' +
      '</div>' +
      '<div style="flex:1 1 auto">' + rows + '</div>' +
    '</div>' +
    '<div style="flex:0 0 auto;font-size:1.12cqw;line-height:1.4;color:#9a9aa8;white-space:nowrap;' +
         'overflow:hidden;text-overflow:ellipsis;' +
         'border-top:.06cqw solid rgba(255,255,255,.12);padding-top:.65cqw">' + heroSupport + '</div>' +
  '</div>' +

  // this wallet's own extremes, not the same five fields for everybody
  '<div class="abs" style="left:4cqw;right:4cqw;top:47.1cqw;height:.06cqw;background:rgba(255,255,255,.18)"></div>' +
  '<div class="abs" style="left:4cqw;right:4cqw;top:48.9cqw;display:grid;' +
       'grid-template-columns:repeat(' + (H.length + 1) + ',1fr);gap:1.6cqw">' +
    H.map(function (kv) {
      return '<div><div class="m" style="font-size:1cqw;color:#6f6f7c">' + kv[0] + '</div>' +
        '<div style="font:800 2.3cqw/1 var(--disp);color:#fff;margin-top:.85cqw;white-space:nowrap;' +
        'overflow:hidden;text-overflow:ellipsis">' + esc(String(kv[1])) + '</div></div>'; }).join('') +
    '<div><div class="m" style="font-size:1cqw;color:' + v.lit + '">CLOSEST TWIN</div>' +
      '<div style="font:800 2.3cqw/1 var(--disp);color:#fff;margin-top:.85cqw;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis">' + esc(v.twin ? v.twin.who : 'not read yet') + '</div></div>' +
  '</div>' +

  spectrum(v.p, 'left:0;right:0;bottom:0;height:.8cqw') +
  '<span class="mframe"><i></i><u></u></span>' +
'</div>';
}

window.FAZ1_VIEW = view;
window.FAZ1_CARDS = { L1: L1, L2: L2, L2b: L2b, L3: L3 };
window.FAZ1_META = {
  L1: ['WRAPPED', '4:5 &middot; 1080 x 1350',
       'Flat facet colour to the edge, the art dropped on it, the facet word at poster size. The white block holds the number people compare. 4:5 is the tallest ratio X shows without cropping.'],
  L2: ['READOUT v1', '16:9 &middot; 1600 x 900',
       'The first pass, kept only so the second one can be judged against it. Identity at the top, one number as the payload, four fixed figures underneath.'],
  L2b: ['READOUT v2', '16:9 &middot; 1600 x 900',
       'The facet word is set in the collection’s own 5x7 pixel grid, so the biggest thing on the card speaks the same language as the artwork beside it. Hero is your rank on your own axis, the one number that is a leaderboard position rather than a statistic. Name plain and large, the one rainbow spent on the index, a patterned facet frame, "approved by facets" signed across the corner in ink and an empty line when it is not, and a bottom row built from this wallet’s own extremes.'],
  L3: ['SPECTRUM', '1:1 &middot; 1200 x 1200',
       'The seven axes ARE the graphic, because no one is one thing. Rarity moves onto a sticker, which is the part that gets cropped and reposted on its own.']
};
})();
