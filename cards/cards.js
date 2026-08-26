// The three card layouts, shared by the comparison page and the single-card renderer.
// ⚠️ One copy only. Two copies of a layout is how a card ships looking like neither draft.
window.CARD_LAYOUTS = function (D) {
  const p = D.profile, s = D.signals, st = D.story;
  const dom = p.dominant;
const esc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const short = a => a.slice(0, 6) + '...' + a.slice(-4);
const beats = st.card;
const axes = p.ordered;

// ── LAYOUT A — THE LICENSE ────────────────────────────────────────────────────────────────────────
// An identity document, because the project is about identity. The front is a card you could be asked
// to produce at a door. The back sits behind it at an angle, the way a real one lands on a table.
function A() {
  return `
  <div class="c card" style="left:5%;top:5%;width:84%;padding:3.4cqw">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div class="k">FACETS &middot; THE MIRROR</div>
        <div style="font:900 4.6cqw/1 sans-serif;letter-spacing:-.04em;margin-top:.9cqw;color:var(--${dom})">${dom}</div>
      </div>
      <div class="stamp" style="color:var(--${dom})">READING</div>
    </div>
    <div style="display:flex;gap:3cqw;margin-top:2.4cqw">
      <div class="art" style="width:26%;aspect-ratio:1"><img src="art_gruff.png" alt=""></div>
      <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:1.5cqw 2cqw;align-content:start">
        ${[['HANDLE', s.ens || short(s.addr)], ['ON CHAIN SINCE', '23 Oct 2021'],
           ['RARER THAN', (100*p.rarity).toFixed(2) + '%'], ['FACETS AT ONCE', p.spread.toFixed(1) + ' of 7']]
          .map(([k, v]) => `<div><div class="k">${k}</div><div class="v" style="font-size:2.1cqw;margin-top:.5cqw">${esc(v)}</div></div>`).join('')}
      </div>
    </div>
    <div class="hair" style="margin:2.4cqw 0 1.8cqw"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div style="max-width:60%">${beats.slice(1,4).map(x => `<div style="font-size:1.65cqw;color:var(--muted);margin-bottom:.55cqw">${esc(x.line)}</div>`).join('')}</div>
      <div style="text-align:right">
        <div class="sig" style="font-size:3.4cqw;line-height:1">approved by facets</div>
        <div class="k" style="margin-top:.4cqw">GTD SPOT 0417 OF 600</div>
      </div>
    </div>
  </div>

  <div class="c card back" style="left:11%;top:52%;width:80%;padding:3cqw;transform:rotate(-1.4deg)">
    <div class="k">WHY THIS READING</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.1cqw 3cqw;margin-top:1.8cqw">
      ${axes.map(f => `<div style="display:flex;align-items:center;gap:1.2cqw">
        <div class="k" style="flex:0 0 26%;white-space:nowrap;color:${f===dom?'var(--'+f+')':'var(--muted)'}">${f}</div>
        <div class="bar" style="flex:1"><i style="width:${Math.min(100,Math.round(100*p.bars[f]))}%;background:var(--${f})"></i></div>
        <div class="k" style="flex:0 0 9%;text-align:right;color:var(--ink)">${Math.round(100*p.axes[f])}</div></div>`).join('')}
    </div>
    <div class="hair" style="margin:2cqw 0 1.4cqw"></div>
    <div style="font-size:1.5cqw;color:var(--muted);line-height:1.5">
      Compared with 5,000 real Ethereum wallets, never a made up threshold.
      <b style="color:var(--ink)">This is your reflection, not your mint.</b> The chain has not chosen yet.
    </div>
  </div>`;
}

// ── LAYOUT B — THE SPECIMEN ───────────────────────────────────────────────────────────────────────
// The quiet one. Art large and unbothered, the seven axes as a precise readout beside it, the beats
// numbered underneath like a museum label. Closest to the locked brand: hairlines, whitespace, one
// accent, honest rather than mystical.
function B() {
  return `
  <div class="c" style="left:7%;top:5%;width:86%">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div class="k">FACETS &middot; THE MIRROR</div>
      <div class="k">${esc(s.ens || short(s.addr))}</div>
    </div>
    <div class="hair" style="margin:1.4cqw 0 2.6cqw"></div>

    <div style="display:flex;gap:3.4cqw;align-items:flex-start">
      <div class="art" style="width:44%;aspect-ratio:1"><img src="art_gruff.png" alt=""></div>
      <div style="flex:1">
        <div style="font:900 6.4cqw/.9 sans-serif;letter-spacing:-.05em;color:var(--${dom})">${dom}</div>
        <div style="font-size:1.8cqw;color:var(--muted);margin-top:1cqw">you ship</div>
        <div style="margin-top:2.6cqw">
          ${axes.slice(0,4).map(f => `<div style="display:flex;align-items:center;gap:1cqw;margin-bottom:.9cqw">
            <div class="k" style="flex:0 0 28%;white-space:nowrap">${f}</div>
            <div class="bar" style="flex:1"><i style="width:${Math.min(100,Math.round(100*p.bars[f]))}%;background:var(--${f})"></i></div></div>`).join('')}
        </div>
        <div style="margin-top:1.8cqw"><span class="tag">RARER THAN ${(100*p.rarity).toFixed(2)}%</span>
          <span class="tag" style="margin-left:.6cqw">${p.spread.toFixed(1)} OF 7</span></div>
      </div>
    </div>

    <div class="hair" style="margin:3cqw 0 2.2cqw"></div>
    ${beats.map((b, i) => `<div style="display:flex;gap:1.8cqw;margin-bottom:1.6cqw">
      <div class="k" style="width:4%;padding-top:.4cqw">${String(i+1).padStart(2,'0')}</div>
      <div style="flex:1">
        <div style="font-size:2.1cqw;font-weight:650;letter-spacing:-.01em">${esc(b.line)}</div>
        ${b.quip ? `<div style="font-size:1.6cqw;color:var(--muted);font-style:italic;margin-top:.3cqw">${esc(b.quip)}</div>` : ''}
      </div></div>`).join('')}

    <div class="hair" style="margin:.6cqw 0 1.6cqw"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div style="font-size:1.45cqw;color:var(--muted);max-width:60%">Your reflection, not your mint. The chain has not chosen yet.</div>
      <div class="sig" style="font-size:3cqw;line-height:1">approved by facets</div>
    </div>
  </div>`;
}

// ── LAYOUT C — THE POSTER ─────────────────────────────────────────────────────────────────────────
// The loud one. Type leads, the artwork is a panel inside it, the beats run as short stacked lines.
// This is the one that survives being 400 pixels wide in a timeline.
function C() {
  return `
  <div class="c" style="left:0;top:0;width:100%;height:100%">
    <div style="position:absolute;left:6%;top:5%;right:6%">
      <div class="k">FACETS &middot; THE MIRROR &middot; ${esc(s.ens || short(s.addr))}</div>
      <div style="font:900 15cqw/.82 sans-serif;letter-spacing:-.06em;margin-top:1.4cqw;color:var(--${dom})">${dom}</div>
      <div style="font-size:2.2cqw;font-weight:600;color:var(--ink);margin-top:1cqw">
        rarer than ${(100*p.rarity).toFixed(2)}% &middot; ${p.spread.toFixed(1)} of 7 facets at once</div>
    </div>

    <div class="c art" style="left:6%;top:30%;width:34%;aspect-ratio:1"><img src="art_gruff.png" alt=""></div>

    <div class="c" style="right:6%;top:30%;width:52%">
      ${axes.map(f => `<div style="display:flex;align-items:center;gap:1cqw;margin-bottom:.85cqw">
        <div class="k" style="flex:0 0 32%;white-space:nowrap;color:${f===dom?'var(--'+f+')':'var(--muted)'}">${f}</div>
        <div class="bar" style="flex:1"><i style="width:${Math.min(100,Math.round(100*p.bars[f]))}%;background:var(--${f})"></i></div></div>`).join('')}
    </div>

    <div class="c" style="left:6%;right:6%;top:62%">
      ${beats.slice(0,3).map(b => `<div style="margin-bottom:1.9cqw">
        <div style="font-size:2.6cqw;font-weight:700;letter-spacing:-.02em;line-height:1.15">${esc(b.line)}</div>
        ${b.quip ? `<div style="font-size:1.8cqw;color:var(--muted);font-style:italic;margin-top:.25cqw">${esc(b.quip)}</div>` : ''}
      </div>`).join('')}
    </div>

    <div class="c card" style="left:6%;right:6%;bottom:4.5%;padding:2.2cqw 2.6cqw;display:flex;
         justify-content:space-between;align-items:center">
      <div style="font-size:1.5cqw;color:var(--muted);max-width:58%">
        Read against 5,000 real wallets. <b style="color:var(--ink)">Your reflection, not your mint.</b></div>
      <div style="text-align:right">
        <div class="sig" style="font-size:3.2cqw;line-height:1">approved by facets</div>
        <div class="k" style="margin-top:.3cqw">GTD 0417 / 600</div>
      </div>
    </div>
  </div>`;
}


  return { A, B, C };
};
