// LAYOUT L — the licence, designed.
//
// Layout A had the right structure and gruff kept it. The complaint was the surface: "sanattan uzak
// basit bir html gibi duruyor". P answered that by turning the whole thing into a poster, which went
// too far. This is the middle: the identity document stays the subject, and the page around it is
// composed rather than merely filled.
//
// WHAT P GOT WRONG AND THIS DOES NOT
//   ⛔ P's sticker sat on top of the card and hid two of the four data fields. Nothing here overlaps
//      the card except the display word, which carries no data.
//   ⛔ P flooded the entire canvas in the facet colour, so the ground, the type and the artwork were
//      all one hue and the composition went flat. Here the ground stays warm paper, the facet colour
//      is one shape, and royal blue is a real second field rather than only a signature.
//   ⛔ P's tape read as a smudge. Gone.
//
// The single strongest borrowing from gruff's reference boards is the overlap: the display word runs
// UNDER the card. That one relationship is what stops a layout looking like a stack of divs.
window.CARD_LICENCE = function (D) {
  const p = D.profile, s = D.signals, st = D.story;
  const dom = p.dominant;
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const short = a => a.slice(0, 6) + '...' + a.slice(-4);
  const beats = st.card, axes = p.ordered;
  // ⚠️ THIS WAS THE STRING '23 Oct 2021', gruff's own first transaction, hard coded into every card
  // ever rendered. Every other wallet was being handed his date. The signal is right there.
  const since = s.firstTs
    // ⚠️ UTC, NOT LOCAL. The story beat under the card says the same date and derives it in UTC; a
    // local conversion put the card a day ahead of the report on the very same screen. The value that
    // was hard coded here, '23 Oct 2021', was in fact the right one for gruff, and my first fix moved it.
    ? new Date(s.firstTs * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : 'unknown';
  // ⚠️ 4,956 is the baseline the reading is actually scored against; the signals file holds 5,000 rows.
  const POP = (D.population || 4956).toLocaleString('en-GB');
  // ⛔ THE ALLOWLIST IS NOT LOCKED, so the card no longer asserts a spot. It said
  // "GTD SPOT 0417 OF 600" on every render, which is a guarantee on an asset built to travel, and the
  // FCFS-never-GTD argument says that promise breaks the moment more people submit than there is
  // supply. Set D.spot to put a line back once gruff has decided what it says.
  const SPOT = D.spot ? `<div class="k" style="margin-top:.3cqw">${esc(D.spot)}</div>` : '';
  const tag = { NEWBIE: 'the story just began', COLLECTOR: 'taste is a signal', DEGEN: 'all in, always',
    BUILDER: 'you ship', OG: 'you were here first', WHALE: 'the tide moves with you',
    GHOST: 'seen everything, said nothing' }[dom];

  // confetti that echoes the scattered blocks in the artwork itself, seeded off the address so two
  // wallets never get the same drift
  let h = 0; for (const ch of s.addr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  const confetti = Array.from({ length: 14 }, () => {
    const c = rnd() < 0.5 ? 'var(--' + dom + ')' : 'var(--blue)';
    return `<div class="c" style="left:${(4 + rnd() * 92).toFixed(1)}%;top:${(6 + rnd() * 88).toFixed(1)}%;
      width:${(0.7 + rnd() * 1.5).toFixed(2)}cqw;aspect-ratio:1;background:${c};opacity:${(0.5 + rnd() * 0.5).toFixed(2)};
      transform:rotate(${(rnd() * 90).toFixed(0)}deg)"></div>`;
  }).join('');

  // ⚠️ THE TWO FACES ARE FUNCTIONS NOW. The site's 07 panel shows the card with no background at all,
  // and cards.js's own rule is that two copies of a layout is how a card ships looking like neither
  // draft. Both callers build from these, so a change to the licence reaches the panel and back.
  const FRONT = () => `
    <div style="display:flex;gap:3cqw">
      <div class="art" style="width:31%;aspect-ratio:1"><img src="${D.art || 'art_gruff.png'}" alt=""></div>
      <div style="flex:1">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5cqw 2cqw">
          ${[['HANDLE', s.ens || short(s.addr)],
             ['ON CHAIN SINCE', since],
             ['RARER THAN', (100 * p.rarity).toFixed(2) + '%'],
             ['FACETS AT ONCE', p.spread.toFixed(1) + ' of 7']]
            .map(([k, v]) => `<div><div class="k">${k}</div>
              <div style="font-size:2.2cqw;font-weight:800;margin-top:.35cqw">${esc(v)}</div></div>`).join('')}
        </div>
        <div style="margin-top:2cqw">
          ${axes.slice(0, 4).map(f => `<div style="display:flex;align-items:center;gap:1cqw;margin-bottom:.7cqw">
            <div class="k" style="flex:0 0 30%;white-space:nowrap;color:${f === dom ? 'var(--' + f + ')' : 'var(--muted)'}">${f}</div>
            <div class="bar" style="flex:1"><i style="width:${Math.min(100, Math.round(100 * p.bars[f]))}%;background:var(--${f})"></i></div>
          </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="hair" style="margin:2.2cqw 0 1.7cqw"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:2cqw">
      <div style="flex:1">
        ${beats.slice(1, 4).map(b => `<div style="font-size:1.72cqw;color:#33333d;margin-bottom:.5cqw">${esc(b.line)}</div>`).join('')}
      </div>
      <div style="text-align:right;flex:0 0 auto">
        <div class="sig" style="font-size:3.5cqw;line-height:1">approved by facets</div>
        ${SPOT}
      </div>
    </div>`;

  const BACK = () => `
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div class="k">WHY THIS READING</div>
      <div class="k">TOP ${(100 - 100 * p.rarity).toFixed(1)}% OF ALL WALLETS</div>
    </div>
    <div style="display:flex;gap:1.6cqw;margin-top:1.4cqw;align-items:flex-end">
      ${axes.map(f => `<div style="flex:1;text-align:center">
        <div style="height:5.4cqw;display:flex;align-items:flex-end;justify-content:center">
          <div style="width:54%;background:var(--${f});height:${Math.max(5, Math.round(100 * p.bars[f]))}%;border-radius:.35cqw"></div>
        </div>
        <div class="k" style="font-size:1cqw;margin-top:.55cqw">${f.slice(0, 4)}</div>
        <div style="font:800 1.45cqw/1 ui-monospace,Consolas,monospace;margin-top:.25cqw">${Math.round(100 * p.axes[f])}</div>
      </div>`).join('')}
    </div>
    <div class="hair" style="margin:1.5cqw 0 1cqw"></div>
    <div style="font-size:1.35cqw;color:var(--muted)">Read against ${POP} real Ethereum wallets.
      <b style="color:var(--ink)">Your reflection, not your mint.</b> The chain has not chosen yet.</div>`;

  // ⚠️ EXPORTED so the site can render the two faces on their own, with no background behind them.
  window.CARD_FACES = { front: FRONT, back: BACK };

  return `
  <!-- the ground stays the brand's paper. Only ONE shape carries the facet colour. -->
  <div class="c flood" style="right:-22%;top:-14%;width:86%;aspect-ratio:1;background:var(--${dom})"></div>
  <div class="c halftone" style="right:-22%;top:-14%;width:86%;aspect-ratio:1;border-radius:50%"></div>
  <!-- the second field, so the page is two colours arguing rather than one colour shouting -->
  <!-- the second field answers the first: a circle bleeding off the opposite corner, so the two
       colours sit on a diagonal instead of one shape floating next to a stray rectangle -->
  <div class="c flood" style="left:-30%;bottom:-26%;width:70%;aspect-ratio:1;background:var(--blue);opacity:.13"></div>
  <div class="c flood" style="left:-34%;bottom:-30%;width:58%;aspect-ratio:1;background:var(--blue);opacity:.20"></div>
  ${confetti}
  ${[['left:3.5%;top:3%'], ['right:3.5%;top:3%'], ['left:3.5%;bottom:3%'], ['right:3.5%;bottom:3%']]
    .map(([pos]) => `<div class="c reg dark" style="${pos}"></div>`).join('')}

  <!-- header and the display word. The word runs UNDER the card, which is the whole trick. -->
  <div class="c" style="left:6%;right:6%;top:5%">
    <div class="k" style="color:var(--ink)">FACETS &middot; THE MIRROR</div>
    <div class="misreg" style="margin-top:1cqw">
      <span class="under" style="color:var(--blue)">${dom}</span>
      <span class="over" style="color:var(--ink)">${dom}</span>
    </div>
    <div style="font:800 2cqw/1 ui-monospace,Consolas,monospace;letter-spacing:.18em;
                color:var(--ink);margin-top:1.2cqw">${esc(tag).toUpperCase()}</div>
  </div>

  <!-- the licence. Nothing overlaps it. -->
  <div class="c card" style="left:6%;right:6%;top:36%;padding:3.2cqw;transform:rotate(-.7deg)">${FRONT()}</div>
  <!-- the back, tucked under at the opposite angle -->
  <div class="c card back" style="left:12%;right:12%;bottom:4.5%;padding:2.3cqw 2.7cqw;transform:rotate(1.3deg)">${BACK()}</div>`;
};
