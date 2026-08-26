// BRING THE ART ENGINE INSIDE THIS TREE.
//
//   node sync_artengine.cjs [--check]
//
// ⚠️ WHY THIS EXISTS. mirror_piece.cjs draws the card's piece with the REAL FACETS renderer, which
// lived two directories away in exp/review and exp/mirror_v2. That worked on this machine and took
// the server down at boot anywhere else, because nothing ships exp/ to a host.
//
// ⚠️ THE LAYOUT IS COPIED EXACTLY, not flattened. load_at_supply.cjs finds the engine at
// ../mirror_v2 relative to itself, so review/ and mirror_v2/ have to stay siblings. Reproducing the
// shape means that file needs no edit, and a file nobody edited cannot be edited wrong.
//
// ⚠️ IT RECORDS A HASH PER FILE. A vendored copy silently drifting behind the real art is the whole
// danger here: the Mirror would keep drawing last month's faces and look perfectly fine doing it.
// --check compares both directions and fails loudly instead.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const HERE = __dirname;
const EXP = path.join(HERE, '..');
const DEST = path.join(HERE, 'artengine');
const CHECK = process.argv.includes('--check');

const FILES = [
  ['review/load_at_supply.cjs', 'review/load_at_supply.cjs'],
  ['onchain/_svgcells.cjs',     'onchain/_svgcells.cjs'],
  ...['alloc_perm.js', 'pixel_shade.js', 'eye_pieces.js', 'mouth_pieces.js', 'combo_pieces.js',
      'facets_gen.js', 'portrait_v6.js', 'archetype_v6.js', 'signal_model.js', 'render_v7.js']
     .map(f => ['mirror_v2/' + f, 'mirror_v2/' + f]),
];
const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const MANIFEST = path.join(DEST, 'MANIFEST.json');

if (CHECK) {
  let man;
  try { man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
  catch { console.log('⛔ no MANIFEST.json — run: node sync_artengine.cjs'); process.exit(1); }
  let bad = 0, drift = 0;
  for (const [src, dst] of FILES) {
    const copy = path.join(DEST, dst);
    if (!fs.existsSync(copy)) { console.log('  ⛔ missing from the copy: ' + dst); bad++; continue; }
    const h = sha(fs.readFileSync(copy));
    if (h !== man.files[dst]) { console.log('  ⛔ the copy was edited by hand: ' + dst); bad++; continue; }
    const orig = path.join(EXP, src);
    if (fs.existsSync(orig)) {                       // only where the full project is present
      if (sha(fs.readFileSync(orig)) !== h) { console.log('  ⚠️ THE ART MOVED, the copy is behind: ' + dst); drift++; }
    }
  }
  console.log('\n' + FILES.length + ' files · corrupt ' + bad + ' · behind the source ' + drift);
  if (drift) console.log('run: node sync_artengine.cjs');
  process.exit(bad || drift ? 1 : 0);
}

const files = {};
for (const [src, dst] of FILES) {
  const from = path.join(EXP, src);
  if (!fs.existsSync(from)) { console.log('⛔ source missing: ' + src + ' — NOTHING WRITTEN'); process.exit(1); }
  const to = path.join(DEST, dst);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const buf = fs.readFileSync(from);
  fs.writeFileSync(to, buf);
  files[dst] = sha(buf);
}
fs.writeFileSync(MANIFEST, JSON.stringify({ syncedFrom: 'exp/', files }, null, 1));
console.log('vendored ' + FILES.length + ' files into artengine/, ' +
  (Object.values(files).length) + ' hashes recorded');
