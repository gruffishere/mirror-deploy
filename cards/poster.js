// LAYOUT P — the licence, printed.
//
// gruff on the first three: "sanattan uzak basit bir html gibi duruyor". He was right. The structure
// of layout A was fine and he kept it; what was missing was the SURFACE. A poster is not a layout, it
// is a layout plus the evidence that it was printed.
//
// Everything here is drawn in the page, no images needed except the artwork and the optional
// photograph behind it:
//   · a halftone dot screen over the flooded colour
//   · paper grain
//   · ink misregistration on the display word, a second pass offset by a hair in another colour
//   · corner registration marks, the crosses a printer aligns plates with
//   · a torn tape strip holding the card down
//   · a die-cut sticker carrying the rarity
//   · overprint blending where shapes cross, so colours mix like ink instead of stacking like divs
//
// ⚠️ THE PHOTOGRAPH IS A SLOT, NOT A REQUIREMENT. `bg/<facet>.jpg` is used when it exists and the
// flooded circle stands alone when it does not, so the card is never broken while the seven plates
// are still being made.
window.CARD_POSTER = function (D) {
  const p = D.profile, s = D.signals, st = D.story;
  const dom = p.dominant;
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const short = a => a.slice(0, 6) + '...' + a.slice(-4);
  const beats = st.card, axes = p.ordered;
  const tag = { NEWBIE: 'the story just began', COLLECTOR: 'taste is a signal', DEGEN: 'all in, always',
    BUILDER: 'you ship', OG: 'you were here first', WHALE: 'the tide moves with you',
    GHOST: 'seen everything, said nothing' }[dom];

  return `
  <!-- the flooded ground, and the photograph slot behind everything -->
  <div class="c" style="inset:0;background:var(--${dom})"></div>
  <div class="c photo" style="inset:0;background-image:url('bg/${dom.toLowerCase()}.jpg')"></div>
  <div class="c circle" style="left:-14%;top:16%;width:128%;aspect-ratio:1"></div>
  <div class="c halftone" style="inset:0"></div>

  <!-- registration marks, the crosses a printer lines the plates up with -->
  ${[['left:3.5%;top:3%'], ['right:3.5%;top:3%'], ['left:3.5%;bottom:3%'], ['right:3.5%;bottom:3%']]
    .map(([pos]) => `<div class="c reg" style="${pos}"></div>`).join('')}

  <!-- the display word, printed twice and slightly out of register -->
  <div class="c" style="left:5%;right:5%;top:4.5%">
    <div class="k" style="color:#fff;opacity:.85">FACETS &middot; THE MIRROR &middot; ${esc(s.ens || short(s.addr))}</div>
    <div class="misreg" data-w="${dom}" style="margin-top:.6cqw">
      <span class="under">${dom}</span><span class="over">${dom}</span>
    </div>
    <div style="font:700 2.3cqw/1 ui-monospace,Consolas,monospace;letter-spacing:.1em;color:#fff;
                mix-blend-mode:normal;margin-top:.8cqw">${esc(tag).toUpperCase()}</div>
  </div>

  <!-- the licence itself, taped down -->
  <div class="c tape" style="left:8%;top:36.5%;width:16%"></div>
  <div class="c tape" style="right:8%;top:36.5%;width:16%;transform:rotate(3deg)"></div>
  <div class="c card" style="left:6%;right:6%;top:38.5%;padding:3.2cqw;transform:rotate(-.8deg)">
    <div style="display:flex;gap:3cqw">
      <div class="art" style="width:32%;aspect-ratio:1"><img src="art_gruff.png" alt=""></div>
      <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:1.6cqw 2cqw;align-content:start">
        ${[['HANDLE', s.ens || short(s.addr)],
           ['ON CHAIN SINCE', '23 Oct 2021'],
           ['RARER THAN', (100 * p.rarity).toFixed(2) + '%'],
           ['FACETS AT ONCE', p.spread.toFixed(1) + ' of 7']]
          .map(([k, v]) => `<div><div class="k">${k}</div>
            <div style="font-size:2.3cqw;font-weight:800;margin-top:.35cqw">${esc(v)}</div></div>`).join('')}
        <div style="grid-column:1 / -1;margin-top:.4cqw">
          ${axes.slice(0, 4).map(f => `<div style="display:flex;align-items:center;gap:1cqw;margin-bottom:.75cqw">
            <div class="k" style="flex:0 0 30%;white-space:nowrap">${f}</div>
            <div class="bar" style="flex:1"><i style="width:${Math.min(100, Math.round(100 * p.bars[f]))}%;background:var(--${f})"></i></div>
          </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="hair" style="margin:2.2cqw 0 1.6cqw"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:2cqw">
      <div style="flex:1">
        ${beats.slice(1, 4).map(b => `<div style="font-size:1.7cqw;color:#3a3a44;margin-bottom:.5cqw">${esc(b.line)}</div>`).join('')}
      </div>
      <div style="text-align:right;flex:0 0 auto">
        <div class="sig" style="font-size:3.6cqw;line-height:1">approved by facets</div>
        <div class="k" style="margin-top:.3cqw">GTD SPOT 0417 OF 600</div>
      </div>
    </div>
  </div>

  <!-- the die cut sticker, rotated, overprinting whatever it lands on -->
  <div class="c sticker" style="right:4%;top:30%">
    <div style="font:900 3.4cqw/1 sans-serif;letter-spacing:-.03em">TOP</div>
    <div style="font:900 4.6cqw/1 sans-serif;letter-spacing:-.04em">${(100 - 100 * p.rarity).toFixed(1)}%</div>
    <div class="k" style="margin-top:.4cqw;color:#111114">OF ALL WALLETS</div>
  </div>

  <!-- the back of the card, tucked underneath at an angle -->
  <div class="c card back" style="left:14%;right:14%;bottom:4%;padding:2.4cqw 2.8cqw;transform:rotate(1.4deg)">
    <div class="k">WHY THIS READING</div>
    <div style="display:flex;gap:2cqw;margin-top:1.2cqw;align-items:flex-end">
      ${axes.map(f => `<div style="flex:1;text-align:center">
        <div style="height:6cqw;display:flex;align-items:flex-end;justify-content:center">
          <div style="width:58%;background:var(--${f});height:${Math.max(4, Math.round(100 * p.bars[f]))}%;border-radius:.4cqw"></div>
        </div>
        <div class="k" style="font-size:1.05cqw;margin-top:.6cqw">${f.slice(0, 4)}</div>
        <div style="font:800 1.5cqw/1 ui-monospace,Consolas,monospace;margin-top:.3cqw">${Math.round(100 * p.axes[f])}</div>
      </div>`).join('')}
    </div>
    <div class="hair" style="margin:1.6cqw 0 1.1cqw"></div>
    <div style="font-size:1.4cqw;color:var(--muted)">Read against 5,000 real Ethereum wallets.
      <b style="color:var(--ink)">Your reflection, not your mint.</b> The chain has not chosen yet.</div>
  </div>`;
};
