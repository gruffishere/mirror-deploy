// Screenshot any local page at an exact size, through headless Chrome.
//
//   node wrapped/cards/shoot.cjs <url> <out.png> [width] [height]
//
// The project already had a screenshot tool but it is bound to the promo scenes and their own clock.
// This one takes a URL, so it serves the card renderer now and anything else later.
//
// ⚠️ It waits for `document.body.dataset.ready`, not for a fixed delay. A fixed delay is either too
// short on a cold start or wasted on a warm one, and a card captured before its artwork loads looks
// exactly like a card with no artwork.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9714;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let id = 0;
function rpc(ws, method, params, ms = 30000) {
  const i = ++id;
  return new Promise((res, rej) => {
    const timer = setTimeout(() => { ws.removeEventListener('message', on); rej(new Error(method + ' timed out')); }, ms);
    const on = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.id !== i) return;
      clearTimeout(timer); ws.removeEventListener('message', on);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    };
    ws.addEventListener('message', on);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}

(async () => {
  const url = process.argv[2];
  const out = process.argv[3];
  const W = +(process.argv[4] || 1080), H = +(process.argv[5] || 1350), SC = +(process.argv[6] || 2);
  if (!url || !out) { console.error('usage: shoot.cjs <url> <out.png> [w] [h]'); process.exit(1); }
  if (!fs.existsSync(CHROME)) { console.error('chrome not found at ' + CHROME); process.exit(1); }

  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--hide-scrollbars',
    '--disable-gpu', '--no-first-run', '--window-size=' + W + ',' + H, 'about:blank'],
    { stdio: 'ignore', detached: false });

  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try {
        const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
        target = list.find(t => t.type === 'page');
      } catch {}
    }
    if (!target) throw new Error('chrome never opened a debugging target');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

    await rpc(ws, 'Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SC, mobile: false });
    await rpc(ws, 'Page.enable', {});
    await rpc(ws, 'Page.navigate', { url });

    // wait for the page to say it is ready rather than guessing
    let ready = false;
    for (let i = 0; i < 120 && !ready; i++) {
      await sleep(150);
      const r = await rpc(ws, 'Runtime.evaluate', { expression: 'document.body && document.body.dataset.ready === "1"', returnByValue: true });
      ready = !!(r && r.result && r.result.value);
    }
    if (!ready) console.error('⚠️ page never reported ready, capturing anyway');

    const shot = await rpc(ws, 'Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: W, height: H, scale: SC },
    }, 180000);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log('wrote ' + out + '   ' + (W * SC) + ' x ' + (H * SC) + ' px   ' +
      (fs.statSync(out).size / 1024).toFixed(0) + ' kB');
    ws.close();
  } finally {
    try { ch.kill(); } catch {}
  }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
