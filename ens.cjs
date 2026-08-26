// ENS forward and reverse resolution with no dependency tree.
//
// ⚠️ There is no way around keccak-256 here: a namehash is defined in terms of it, and this project
// has no node_modules. So it is implemented below in BigInt, which is slower than a 32-bit lane
// version and much easier to read, and we only hash a handful of short labels per request.
// ⛔ NEVER trust this without the vectors at the bottom. `node ens.cjs --selftest` must pass.
'use strict';

const MASK = (1n << 64n) - 1n;
const ROTL = (x, n) => ((x << n) | (x >> (64n - n))) & MASK;

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
// rotation offsets, indexed [x][y]
const ROT = [
  [0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56], [27, 20, 39, 8, 14],
].map(r => r.map(BigInt));

function keccakF(A) {
  for (let round = 0; round < 24; round++) {
    // theta
    const C = new Array(5), D = new Array(5);
    for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ ROTL(C[(x + 1) % 5], 1n);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x + 5 * y] ^= D[x];
    // rho and pi
    const B = new Array(25).fill(0n);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++)
      B[y + 5 * ((2 * x + 3 * y) % 5)] = ROTL(A[x + 5 * y], ROT[x][y]);
    // chi
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++)
      A[x + 5 * y] = B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y] & MASK) & B[(x + 2) % 5 + 5 * y]);
    // iota
    A[0] ^= RC[round];
  }
  return A;
}

// Keccak-256: rate 136 bytes, padding 0x01 ... 0x80. NOT SHA3-256, which pads with 0x06.
function keccak256(bytes) {
  const RATE = 136;
  const padLen = RATE - (bytes.length % RATE);
  const msg = Buffer.concat([Buffer.from(bytes), Buffer.alloc(padLen)]);
  msg[bytes.length] |= 0x01;
  msg[msg.length - 1] |= 0x80;

  const A = new Array(25).fill(0n);
  for (let off = 0; off < msg.length; off += RATE) {
    for (let i = 0; i < RATE / 8; i++) A[i] ^= msg.readBigUInt64LE(off + i * 8);
    keccakF(A);
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) out.writeBigUInt64LE(A[i], i * 8);
  return out;
}

const hex = b => '0x' + b.toString('hex');
const keccakHex = s => hex(keccak256(Buffer.from(s, 'utf8')));

// namehash, EIP-137: start at 32 zero bytes and fold the labels from the right
function namehash(name) {
  let node = Buffer.alloc(32);
  if (name) {
    const labels = name.toLowerCase().split('.');
    for (let i = labels.length - 1; i >= 0; i--) {
      node = keccak256(Buffer.concat([node, keccak256(Buffer.from(labels[i], 'utf8'))]));
    }
  }
  return hex(node);
}

// ── on-chain lookups ──────────────────────────────────────────────────────────────────────────────
const REGISTRY = '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e';
const SEL = { resolver: '0x0178b8bf', addr: '0x3b3b57de', name: '0x691f3431' };

async function resolve(name, ethCall) {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(name)) return null;
  const node = namehash(name).slice(2);
  const res = await ethCall(REGISTRY, SEL.resolver + node);
  if (!res || res.length < 66) return null;
  const resolver = '0x' + res.slice(-40);
  if (/^0x0{40}$/.test(resolver)) return null;
  const a = await ethCall(resolver, SEL.addr + node);
  if (!a || a.length < 66) return null;
  const addr = '0x' + a.slice(-40);
  return /^0x0{40}$/.test(addr) ? null : addr.toLowerCase();
}

// ⚠️ A reverse record is claimed by its owner and is NOT proof of anything. It is display only.
async function reverse(address, ethCall) {
  const node = namehash(address.toLowerCase().slice(2) + '.addr.reverse').slice(2);
  const res = await ethCall(REGISTRY, SEL.resolver + node);
  if (!res || res.length < 66) return null;
  const resolver = '0x' + res.slice(-40);
  if (/^0x0{40}$/.test(resolver)) return null;
  const raw = await ethCall(resolver, SEL.name + node);
  if (!raw || raw.length < 130) return null;
  const len = parseInt(raw.slice(66, 130), 16);
  if (!len || len > 255) return null;
  return Buffer.from(raw.slice(130, 130 + len * 2), 'hex').toString('utf8') || null;
}

module.exports = { keccak256, keccakHex, namehash, resolve, reverse, REGISTRY };

if (require.main !== module) return;

// ── self test, against published vectors ──────────────────────────────────────────────────────────
const VECTORS = [
  ['keccak256("")', keccakHex(''), '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'],
  ['keccak256("abc")', keccakHex('abc'), '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45'],
  ['keccak256("The quick brown fox jumps over the lazy dog")',
    keccakHex('The quick brown fox jumps over the lazy dog'),
    '0x4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15'],
  ['namehash("")', namehash(''), '0x0000000000000000000000000000000000000000000000000000000000000000'],
  ['namehash("eth")', namehash('eth'), '0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae'],
  ['namehash("foo.eth")', namehash('foo.eth'), '0xde9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f'],
];
let bad = 0;
VECTORS.forEach(([what, got, want]) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log((ok ? '  ok   ' : '  FAIL ') + what + '\n         got  ' + got + (ok ? '' : '\n         want ' + want));
});
console.log(bad ? '\n' + bad + ' VECTOR(S) FAILED' : '\nall vectors pass');
process.exit(bad ? 1 : 0);
