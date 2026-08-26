// END TO END for the claim, over real HTTP against the running server.
//
//   node wrapped/e2e_claim.cjs --port 8141 --admin localtest
//
// The unit guard (`guard_claims.cjs`) calls the module directly. This one goes through the wire:
// nonce, sign, claim, then read the address back and check the server says it is claimed, then pull
// the FCFS CSV as an admin and check the row is in it and that a non-admin cannot.
//
// ⚠️ IT WRITES TO THE REAL LISTS, because that is the thing being tested. It signs with throwaway
// keys generated here, so the rows it adds are harmless, but they are real rows: the addresses below
// belong to nobody and will show up in signed.jsonl. `--clean` removes them again afterwards.
'use strict';
const http = require('http'), path = require('path'), fs = require('fs');
const ethers = require('ethers');

const arg = k => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : undefined; };
const PORT = Number(arg('port') || 8141);
const ADMIN = arg('admin') || 'localtest';
const CLEAN = process.argv.includes('--clean');

function req(method, p, bodyObj) {
  const data = bodyObj == null ? null : JSON.stringify(bodyObj);
  return new Promise(resolve => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      res => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} resolve({ code: res.statusCode, json: j, text: b, headers: res.headers }); });
      });
    r.on('error', e => resolve({ code: 0, err: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  ⛔  ') + m); if (!c) fail++; };

(async () => {
  const up = await req('GET', '/api/status');
  if (up.code !== 200) { console.log('server not answering on ' + PORT); process.exit(1); }
  console.log('E2E CLAIM over HTTP, port ' + PORT + '\n');

  const w = ethers.Wallet.createRandom();
  console.log('throwaway wallet ' + w.address + '\n');

  console.log('1. NONCE -> SIGN -> CLAIM');
  const n = await req('POST', '/api/nonce', { address: w.address });
  ok(n.code === 200 && n.json && n.json.nonce && n.json.message, 'the server issues a nonce and a message');
  ok(n.json && n.json.message.includes(w.address), 'the message names this wallet');
  ok(n.json && n.json.message.includes(n.json.nonce), 'and carries the nonce');

  const sig = await w.signMessage(n.json.message);
  const c = await req('POST', '/api/claim',
    { nonce: n.json.nonce, signature: sig, name: 'e2e tester', handle: '@e2e_tester' });
  ok(c.code === 200 && c.json && c.json.ok, 'the claim is accepted   ' + (c.json && c.json.error ? '(' + c.json.error + ')' : ''));
  ok(c.json && c.json.addr === w.address.toLowerCase(), 'and it records the recovered address');
  ok(c.json && c.json.handle === 'e2e_tester', 'the @ is stripped from the handle');

  console.log('\n2. THE SAME NONCE AGAIN');
  const again = await req('POST', '/api/claim', { nonce: n.json.nonce, signature: sig });
  ok(again.code === 400, 'a replay of the same nonce is refused   (got ' + again.code + ')');

  console.log('\n3. A SIGNATURE FROM SOMEBODY ELSE');
  const m = ethers.Wallet.createRandom();
  const n2 = await req('POST', '/api/nonce', { address: w.address });
  const badSig = await m.signMessage(n2.json.message);
  const bad = await req('POST', '/api/claim', { nonce: n2.json.nonce, signature: badSig });
  ok(bad.code === 400, 'a signature from another wallet is refused   (got ' + bad.code + ')');

  console.log('\n4. DOES A READ KNOW THE WALLET IS CLAIMED?');
  const rd = await req('GET', '/api/read?addr=' + w.address);
  // a brand new wallet has no history, so the read may take a moment or come back thin; what matters
  // is only whether the claim is attached
  ok(rd.code === 200 && rd.json && rd.json.claimed && rd.json.claimed.name === 'e2e tester',
    'the read carries the claimed name   (' + (rd.json && rd.json.claimed ? rd.json.claimed.name : 'nothing') + ')');

  console.log('\n5. THE LISTS ARE NOT PUBLIC');
  const noTok = await req('GET', '/api/lists/fcfs.csv');
  ok(noTok.code === 403, 'no token, no CSV                (got ' + noTok.code + ')');
  const wrongTok = await req('GET', '/api/lists/fcfs.csv?token=nope');
  ok(wrongTok.code === 403, 'wrong token, no CSV             (got ' + wrongTok.code + ')');
  const stats = await req('GET', '/api/lists/stats');
  ok(stats.code === 403, 'stats are not public either     (got ' + stats.code + ')');

  console.log('\n6. THE CSV, AS AN ADMIN');
  const csv = await req('GET', '/api/lists/fcfs.csv?token=' + ADMIN + '&limit=1&price=0');
  ok(csv.code === 200, 'the right token gets the CSV    (got ' + csv.code + ')');
  ok(csv.text.includes(w.address.toLowerCase() + ',1,0'), 'and this wallet is a row in it');
  ok(!/[A-F]/.test(csv.text.replace(/[^0-9a-fA-Fx,\n.]/g, '')), 'every address is lowercase, as Studio wants');
  console.log('      rows ' + csv.headers['x-rows'] + ' · rejected ' + csv.headers['x-rejected'] +
    ' · excluded ' + csv.headers['x-excluded']);
  const st = await req('GET', '/api/lists/stats?token=' + ADMIN);
  ok(st.code === 200 && st.json.signedFailingVerification === 0,
    'no stored row fails verification   (' + (st.json ? JSON.stringify(st.json) : '') + ')');

  if (CLEAN) {
    const f = path.join(__dirname, 'site', 'lists', 'signed.jsonl');
    const keep = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)
      .filter(l => !l.includes(w.address.toLowerCase()) && !l.includes(m.address.toLowerCase()));
    fs.writeFileSync(f, keep.join('\n') + (keep.length ? '\n' : ''));
    console.log('\n   --clean: the throwaway rows were removed again');
  }

  console.log('\n' + (fail ? '⛔ ' + fail + ' FAILURE(S)' : '✅ claim works end to end over HTTP'));
  process.exit(fail ? 1 : 0);
})();
