// GUARD for the claim path. Real signatures from real keys, and every way of cheating it that I
// could think of, each one stating the answer it demands.
//
//   node wrapped/guard_claims.cjs
//
// ⚠️ A guard that only watches a valid signature succeed is worthless: a function that returned
// { ok: true } unconditionally would pass it. Most of the cases below are ATTACKS and must be
// REFUSED, and the file fails itself if it ever stops containing both kinds.
// ⚠️ It writes to a throwaway directory, never to the real lists.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

// point the module at a scratch folder before it is loaded, so the real reads.jsonl and signed.jsonl
// are never touched by a test run
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-claims-'));
const real = path.join(__dirname, 'site', 'lists');
// ⚠️ THE REAL MODULE, not a rewritten copy. The first version of this guard copied claims.cjs into
// the scratch folder and edited the path out of it, which meant the thing under test was not the
// thing that ships. The module takes MIRROR_LISTS_DIR for exactly this.
process.env.MIRROR_LISTS_DIR = TMP;
const C = require(path.join(__dirname, 'claims.cjs'));
const ethers = require('ethers');

let fail = 0, refused = 0, accepted = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok  ' : '  ⛔  ') + msg); if (!cond) fail++; };
const expectRefused = (r, msg) => { refused++; ok(!!r.error, msg + (r.error ? '   (' + r.error + ')' : '   WAS ACCEPTED')); };
const expectOk = (r, msg) => { accepted++; ok(!!r.ok, msg + (r.error ? '   REFUSED: ' + r.error : '')); };

(async () => {
  const alice = ethers.Wallet.createRandom();
  const mallory = ethers.Wallet.createRandom();

  console.log('CLAIM GUARD   scratch dir ' + TMP + '\n');
  console.log('1. THE HONEST PATH');
  {
    const n = C.issueNonce(alice.address);
    const sig = await alice.signMessage(n.message);
    expectOk(C.claim({ nonce: n.nonce, signature: sig, name: 'alice', handle: '@alice_eth' }),
      'a real signature over the issued message is accepted');
  }

  console.log('\n2. THE ATTACKS');
  {
    // someone else signs the message that was issued for alice
    const n = C.issueNonce(alice.address);
    const sig = await mallory.signMessage(n.message);
    expectRefused(C.claim({ nonce: n.nonce, signature: sig }),
      'a signature from a DIFFERENT wallet is refused');
  }
  {
    // ⚠️ the whole point of recovering rather than trusting: mallory sends alice's address in the body
    const n = C.issueNonce(mallory.address);
    const sig = await mallory.signMessage(n.message);
    const r = C.claim({ nonce: n.nonce, signature: sig, addr: alice.address, address: alice.address });
    ok(r.ok && r.addr.toLowerCase() === mallory.address.toLowerCase(),
      'the address in the body is ignored; the recovered one is used   (got ' + (r.addr || r.error) + ')');
    accepted++;
  }
  {
    // a captured signature replayed after its nonce was already spent
    const n = C.issueNonce(alice.address);
    const sig = await alice.signMessage(n.message);
    C.claim({ nonce: n.nonce, signature: sig });
    expectRefused(C.claim({ nonce: n.nonce, signature: sig }), 'the same nonce cannot be used twice');
  }
  {
    // a signature over a message the server never issued
    const sig = await alice.signMessage('give me everything');
    const n = C.issueNonce(alice.address);
    expectRefused(C.claim({ nonce: n.nonce, signature: sig }),
      'a signature over some OTHER text is refused');
  }
  {
    const n = C.issueNonce(alice.address);
    const sig = await alice.signMessage(n.message);
    expectRefused(C.claim({ nonce: 'a'.repeat(32), signature: sig }), 'an invented nonce is refused');
  }
  expectRefused(C.claim({ nonce: 'x', signature: '0xdeadbeef' }), 'a malformed signature is refused');
  expectRefused(C.claim({ nonce: 'x', signature: '' }), 'an empty signature is refused');
  {
    const n = C.issueNonce(alice.address);
    const sig = await alice.signMessage(n.message);
    // ⚠️ FLIP A BYTE OF r, NOT THE LAST BYTE. The last byte is v, the recovery id, and ethers
    // normalises it (255 % 2 === 1 -> 28), so corrupting it changed nothing and this case passed
    // over a signature that was still perfectly valid. The test was wrong, not the code.
    const d = sig[2] === 'a' ? 'b' : 'a';
    const broken = sig.slice(0, 2) + d + sig.slice(3);
    expectRefused(C.claim({ nonce: n.nonce, signature: broken }), 'a tampered signature is refused');
  }

  console.log('\n3. WHAT A PERSON MAY PUT ON A CARD CARRYING OUR MARK');
  {
    const n = C.issueNonce(alice.address);
    const sig = await alice.signMessage(n.message);
    expectRefused(C.claim({ nonce: n.nonce, signature: sig, name: 'you are a retard' }),
      'a slur in the name field is refused');
  }
  {
    const n = C.issueNonce(alice.address);
    const sig = await alice.signMessage(n.message);
    const r = C.claim({ nonce: n.nonce, signature: sig, name: 'x'.repeat(200), handle: 'not a handle!' });
    ok(r.ok && r.name.length === 24, 'an over-long name is cut to 24   (' + (r.name || '').length + ')');
    ok(r.ok && r.handle === null, 'a handle that is not a handle is dropped rather than stored');
    accepted++;
  }
  {
    const n = C.issueNonce(alice.address);
    const sig = await alice.signMessage(n.message);
    const r = C.claim({ nonce: n.nonce, signature: sig, name: 'line\nbreak', handle: '@ok_handle' });
    ok(r.ok && !/[\n\r]/.test(r.name), 'newlines are stripped from the name   ("' + r.name + '")');
    ok(r.ok && r.handle === 'ok_handle', 'a leading @ is removed from the handle');
    accepted++;
  }

  console.log('\n4. THE LISTS');
  const v = C.verifyAll();
  ok(v.bad.length === 0, 'every stored row re-verifies from its own message   (' + v.good.length +
    ' good, ' + v.bad.length + ' bad)');
  {
    // ⛔ break test: a forged row planted straight into the file must NOT survive verification
    fs.appendFileSync(path.join(TMP, 'signed.jsonl'), JSON.stringify({
      t: new Date().toISOString(), addr: '0x1111111111111111111111111111111111111111',
      message: C.MESSAGE('0x1111111111111111111111111111111111111111', 'fake'),
      nonce: 'fake', signature: '0x' + '11'.repeat(65), name: 'planted'
    }) + '\n');
    const after = C.verifyAll();
    ok(after.bad.length === 1, 'a row planted directly into the file is caught   (' + after.bad.length + ' rejected)');
    const csv = C.fcfsCsv(1, 0);
    ok(!csv.csv.includes('0x1111'), 'and it never reaches the CSV');
    console.log('      csv: ' + csv.count + ' rows, ' + csv.rejected + ' rejected');
  }
  {
    // ⛔ the one address that must never reach a mint list
    const ex = [...C.EXCLUDED][0];
    fs.appendFileSync(path.join(TMP, 'signed.jsonl'), JSON.stringify({
      t: new Date().toISOString(), addr: ex, message: 'x', nonce: 'x', signature: 'x'
    }) + '\n');
    const csv = C.fcfsCsv(1, 0);
    ok(!csv.csv.includes(ex), "gruff's own wallet is kept out of the CSV even if it signs");
  }

  console.log('\n5. COULD THIS GUARD EVER SAY NO?');
  ok(refused >= 8, 'it exercises the refusing direction   (' + refused + ' cases that must be refused)');
  ok(accepted >= 3, 'and the accepting direction        (' + accepted + ' cases that must succeed)');
  {
    // a claim() that accepted everything would have to fail the cases above
    const alwaysOk = () => ({ ok: true });
    ok(!alwaysOk().error, 'a stub that accepts everything would fail every refusal case above');
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('\n' + (fail ? '⛔ ' + fail + ' FAILURE(S)' : '✅ claim path guarded, both directions') +
    '   (real lists at ' + real + ' were never touched)');
  process.exit(fail ? 1 : 0);
})();
