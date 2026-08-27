// THE CARD, AS A PNG. The card is live HTML, so the only export that cannot drift from what a person
// saw on screen is a picture of that exact HTML.
//
// ⚠️ IT RASTERISES THE REAL CARD, not a second drawing of it. Rebuilding the card as SVG for export
// would mean two renderers to keep in step, and the one nobody looks at is the one that rots.
//
// ⚠️ HEADLESS CHROME IS A REAL DEPENDENCY AND IT IS NAMED HERE, not assumed. Override with
// MIRROR_CHROME. Whoever takes this over needs to know a browser has to exist on the box.
//
// ⚠️ ONE AT A TIME. Chrome is heavy; several launches at once will bury a small server. A file that
// already exists is served straight from disk and never launches anything.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');

// ⛔ THIS BELONGS ON THE MOUNTED DISK IN PRODUCTION.
// Beside the code it is wiped by every deploy, so all 128 drawn cards vanish and the board goes
// blank again while they are redrawn one at a time. On the disk they survive, and a card is drawn
// exactly once in its life.
const OUT = process.env.MIRROR_PNG_DIR || path.join(__dirname, 'site', 'png');
fs.mkdirSync(OUT, { recursive: true });

const CANDIDATES = [
  process.env.MIRROR_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const chrome = (() => {
  for (const c of CANDIDATES) { try { if (fs.existsSync(c)) return c; } catch {} }
  return null;
})();

const WIDTH = 1600, HEIGHT = 900;

// ⚠️ the file name carries everything that can change the picture, so a card that gains a name after
// signing does not keep serving the anonymous one.
const keyOf = (addr, stamp) => addr.toLowerCase() + '_' + stamp + '.png';

let busy = Promise.resolve();
function queue(fn) { const r = busy.then(fn, fn); busy = r.catch(() => {}); return r; }

function shoot(url, file) {
  return new Promise((resolve, reject) => {
    // ⚠️ a FRESH profile every time. Reusing one serves a byte-identical cached PNG even when the
    // page changed, which is the most confusing possible failure: the export silently goes stale.
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-shot-'));
    const args = ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--user-data-dir=' + prof, '--virtual-time-budget=12000',
      '--window-size=' + WIDTH + ',' + HEIGHT, '--screenshot=' + file, url];
    const p = spawn(chrome, args, { stdio: 'ignore' });
    const killer = setTimeout(() => { try { p.kill(); } catch {} }, 30000);
    p.on('error', e => { clearTimeout(killer); reject(e); });
    p.on('exit', () => {
      clearTimeout(killer);
      try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
      if (fs.existsSync(file) && fs.statSync(file).size > 2000) resolve(file);
      else reject(new Error('the renderer produced nothing usable'));
    });
  });
}

// stamp = anything about this wallet that changes the picture. Passed in by the server.
async function cardPng(origin, addr, stamp) {
  if (!chrome) throw new Error('no browser found to render with; set MIRROR_CHROME');
  const file = path.join(OUT, keyOf(addr, stamp));
  if (fs.existsSync(file) && fs.statSync(file).size > 2000) return file;
  const url = origin + '/cards/one.html?addr=' + encodeURIComponent(addr);
  return queue(() => shoot(url, file));
}

// ⚠️ EXPORTED so the server can ask whether a card already exists WITHOUT the two of them keeping
// separate ideas of what the file is called.
const cachedFile = (addr, stamp) => path.join(OUT, keyOf(addr, stamp));
module.exports = { cardPng, chrome, WIDTH, HEIGHT, OUT, keyOf, cachedFile };

if (require.main === module) {
  const a = process.argv[2];
  if (!a) { console.log('usage: node wrapped/cardpng.cjs <0xaddr|name.eth> [port]'); process.exit(1); }
  const port = process.argv[3] || 8141;
  console.log('browser: ' + (chrome || 'NONE FOUND'));
  cardPng('http://127.0.0.1:' + port, a, 'cli')
    .then(f => console.log('wrote ' + f + '   ' + (fs.statSync(f).size / 1024).toFixed(0) + ' kB'))
    .catch(e => { console.log('failed: ' + e.message); process.exit(1); });
}
