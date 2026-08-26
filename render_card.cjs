// FACETS WRAPPED — paste a token onto its facet card and fill in the three fields.
//
//   node exp/wrapped/render_card.cjs <tokenId> --handle @name --wallet 0x... [--name "..."] [--still]
//
// Output: exp/wrapped/out/wrapped_<id>.mp4 when the token animates, .png when it does not.
//
// ⚠️ EVERY CARD HAS ITS OWN GEOMETRY. The seven bases were generated, not laid out, so the black panel
// drifts by up to 42 px in size and 15 px in position between them, and the three white fields drift with
// it. `card_geometry.json` holds the measured numbers per facet and this uses them; a shared offset would
// be visibly wrong on at least four of the seven.
//
// ⚠️ THE ART IS DRAWN AT A MULTIPLE OF 35 AND THE REST OF THE PANEL IS FILLED WITH THE ART'S OWN EDGE
// COLOUR. The panels are not square (671x740, 693x725, ...) and the FACETS grid cannot be stretched to
// fit without breaking crispEdges, so the square sits centred and the leftover strip is painted the same
// colour as the art's own background, which makes the letterbox disappear instead of framing it.
//
// ⛔ THIS IS NOT THE MINT. The base already carries a FOR FUN ONLY badge; do not remove it, and do not
// add anything that implies the facet shown here is the one the contract will assign.
'use strict';
const fs = require('fs'), path = require('path'), { spawn, spawnSync } = require('child_process');

const EXP = path.join(__dirname, '..');
const FFMPEG = 'C:/Users/gruff/OneDrive/Masa\u00fcst\u00fc/slam/ffmpeg.exe';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const GEO = require(path.join(__dirname, 'card_geometry.json'));
const CARDS = path.join(__dirname, 'cards');
const OUT = path.join(__dirname, 'out');
const { loadAtSupply, ownerOf } = require(path.join(EXP, 'review', 'load_at_supply.cjs'));
const { phasesFor } = require(path.join(EXP, 'mirror_v2', 'tools', '_animphases.cjs'));
const NP = require(path.join(EXP, 'mirror_v2', 'names_perm.js'));

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ID = Number(args.find(a => /^\d+$/.test(a)));
const HANDLE = flag('--handle', '@someone');
const WALLET = flag('--wallet', '0x0000000000000000000000000000000000000000');
const STILL = args.includes('--still');
const FPS = 30, SECONDS = 10;
if (!ID) { console.error('give a token id'); process.exit(1); }

const SUPPLY = 6969, SEED = 0xFACE7777;
const { G, V7, alloc } = loadAtSupply(SUPPLY, SEED);
const census = NP.census(SUPPLY, SEED);
const facet = alloc.of(ID).facet;
const tokName = NP.nameOf(SEED, ID, census.alloc.of(ID).facet, census.assigned).name;
const NAME = flag('--name', tokName);

const geo = GEO.find(g => g.facet.toLowerCase() === facet.toLowerCase());
if (!geo) { console.error('no card for facet ' + facet); process.exit(1); }
if (geo.fields.length < 3) { console.error('card ' + geo.facet + ' has ' + geo.fields.length + ' fields, need 3'); process.exit(1); }

const svgOf = anim => { V7.animate = anim; V7.cache.clear(); return V7.render(G.generate(ID, ownerOf(ID))); };
const anim = STILL ? null : phasesFor(svgOf(true), FPS);
const frames = anim ? anim.frames : [svgOf(false)];
const loops = anim ? Math.max(1, Math.round(SECONDS / anim.cycle)) : 1;

console.log('#' + ID + '  ' + facet + '  "' + tokName + '"');
console.log('card ' + geo.facet + '  panel ' + geo.panel.w + 'x' + geo.panel.h + ' @ ' + geo.panel.x + ',' + geo.panel.y + '  art ' + geo.art);
console.log(anim ? 'animated: ' + frames.length + ' phases x ' + loops + ' loop = ' + (anim.cycle * loops).toFixed(1) + 's'
                 : 'static: one frame');

const PORT = 9741, sleep = ms => new Promise(r => setTimeout(r, ms));
let rpcId = 0;
function rpc(ws, method, params, ms = 90000) {
  const i = ++rpcId;
  return new Promise((res, rej) => {
    const t = setTimeout(() => { ws.removeEventListener('message', on); rej(new Error(method + ' timed out')); }, ms);
    const on = e => { let m; try { m = JSON.parse(e.data) } catch (_) { return }
      if (m.id !== i) return; clearTimeout(t); ws.removeEventListener('message', on);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); };
    ws.addEventListener('message', on); ws.send(JSON.stringify({ id: i, method, params }));
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const cardData = 'data:image/png;base64,' + fs.readFileSync(path.join(CARDS, geo.facet + '.png')).toString('base64');

  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + process.env.TEMP + '/wcard' + Date.now(),
    '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 90 && !target; i++) { await sleep(200);
    try { target = (await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()).find(x => x.type === 'page'); } catch {} }
  if (!target) { console.error('chrome never came up'); chrome.kill(); process.exit(1); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  await rpc(ws, 'Runtime.enable', {});

  // one-time setup: load the base card and learn the art's own background colour
  await rpc(ws, 'Runtime.evaluate', { expression: `
    window.__card = new Image();
    window.__ready = new Promise(r => { __card.onload = r; __card.src = ${JSON.stringify(cardData)}; });
    window.__cv = document.createElement('canvas');
    window.__cv.width = ${geo.NW}; window.__cv.height = ${geo.NH};
    window.__x = __cv.getContext('2d');
    true;` , returnByValue: true });

  const dir = path.join(process.env.TEMP, 'wcard_frames_' + ID);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });

  const G_ = geo;
  const total = frames.length * loops;
  let n = 0;
  for (let loop = 0; loop < loops; loop++) {
    for (let p = 0; p < frames.length; p++) {
      const r = await rpc(ws, 'Runtime.evaluate', {
        expression: `(async () => {
          await window.__ready;
          const x = window.__x, cv = window.__cv;
          x.drawImage(window.__card, 0, 0, ${G_.NW}, ${G_.NH});

          const art = new Image();
          await new Promise((res, rej) => { art.onload = res; art.onerror = rej;
            art.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(frames[p])}); });

          // sample the art's own corner so the letterbox strip matches it instead of framing it
          const s = document.createElement('canvas'); s.width = s.height = 8;
          const sx = s.getContext('2d'); sx.imageSmoothingEnabled = false;
          sx.drawImage(art, 0, 0, 8, 8);
          const px = sx.getImageData(0, 0, 1, 1).data;
          x.fillStyle = 'rgb(' + px[0] + ',' + px[1] + ',' + px[2] + ')';
          x.fillRect(${G_.panel.x}, ${G_.panel.y}, ${G_.panel.w}, ${G_.panel.h});

          const A = ${G_.art};
          const ax = ${G_.panel.x} + Math.round((${G_.panel.w} - A) / 2);
          const ay = ${G_.panel.y} + Math.round((${G_.panel.h} - A) / 2);
          x.imageSmoothingEnabled = false;
          x.drawImage(art, ax, ay, A, A);

          // ── the three fields ──────────────────────────────────────────────────────────────────
          const F = ${JSON.stringify(G_.fields)};
          const fit = (text, box, weight, maxPx, mono) => {
            let size = maxPx;
            do { x.font = weight + ' ' + size + 'px ' + (mono
              ? 'ui-monospace, Consolas, monospace'
              : '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif');
              size -= 1; } while (x.measureText(text).width > box.w - 44 && size > 10);
            x.fillStyle = '#111114'; x.textAlign = 'center'; x.textBaseline = 'middle';
            x.fillText(text, box.x + box.w / 2, box.y + box.h / 2 + 1);
          };
          fit(${JSON.stringify(NAME)}, F[0], '800', Math.round(F[0].h * 0.42), false);
          fit(${JSON.stringify(HANDLE)}, F[1], '700', Math.round(F[1].h * 0.38), false);
          fit(${JSON.stringify(WALLET)}, F[2], '600', Math.round(F[2].h * 0.42), true);

          return cv.toDataURL('image/png');
        })()`, awaitPromise: true, returnByValue: true }, 90000);
      const data = String(r.result.value || '').split(',')[1];
      if (!data) throw new Error('frame ' + p + ' produced no image');
      fs.writeFileSync(path.join(dir, 'f' + String(n).padStart(5, '0') + '.png'), Buffer.from(data, 'base64'));
      n++;
    }
    process.stdout.write('\r  ' + n + '/' + total + '   ');
  }
  process.stdout.write('\r' + ' '.repeat(30) + '\r');
  ws.close(); chrome.kill();

  let out;
  if (anim) {
    out = path.join(OUT, 'wrapped_' + ID + '.mp4');
    const enc = spawnSync(FFMPEG, ['-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
      '-r', String(FPS), '-vsync', 'cfr', '-movflags', '+faststart', out], { encoding: 'utf8' });
    if (enc.status !== 0) { console.error(enc.stderr.split('\n').slice(-12).join('\n')); throw new Error('ffmpeg failed'); }
  } else {
    out = path.join(OUT, 'wrapped_' + ID + '.png');
    fs.copyFileSync(path.join(dir, 'f00000.png'), out);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('wrote ' + out + '   ' + (fs.statSync(out).size / 1048576).toFixed(2) + ' MB');
})().catch(e => { console.error('\nFAILED: ' + e.message); process.exit(1); });
