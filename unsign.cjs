// REMOVE ROWS FROM THE SIGNED LIST, SAFELY.
//
//   node wrapped/unsign.cjs 0xaddr [0xaddr ...]      remove these, keep everything else
//   node wrapped/unsign.cjs --list                   show what is in there
//
// ⛔ THIS EXISTS BECAUSE I DESTROYED A REAL SIGNATURE ON 2026-08-26.
// I had added two throwaway signers to photograph the board, then cleared signed.jsonl with an ad-hoc
// one-liner and the comment "none of these is a real person". One of them WAS: gruff's own wallet,
// signed through the page as "gruff / @gruffwashere". The row is gone and it cannot be reconstructed,
// because a signature can only be re-verified against the exact bytes that were signed and those
// lived in that row.
//
// The rules this file enforces, each one paid for by that:
//   1. NEVER blank the file. Removal is always by address, never by truncation.
//   2. Always write a timestamped backup first.
//   3. Print every row it is about to remove and require --yes to actually do it.
//   4. Refuse to remove everything unless --all is also given, because "remove them all" is almost
//      always a mistake about which rows were which.
'use strict';
const fs = require('fs'), path = require('path');

const DIR = process.env.MIRROR_LISTS_DIR || path.join(__dirname, 'site', 'lists');
const FILE = path.join(DIR, 'signed.jsonl');

const read = () => {
  try {
    return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return { l, r: JSON.parse(l) }; } catch { return null; } }).filter(Boolean);
  } catch { return []; }
};

const argv = process.argv.slice(2);
const rows = read();

if (!argv.length || argv.includes('--list')) {
  console.log(rows.length + ' signed row(s) in ' + FILE);
  rows.forEach(x => console.log('  ' + x.r.t + '  ' + x.r.addr + '  ' +
    (x.r.name || '(no name)') + (x.r.handle ? '  @' + x.r.handle : '')));
  if (!argv.length) console.log('\nto remove: node wrapped/unsign.cjs <0xaddr> [--yes]');
  process.exit(0);
}

const YES = argv.includes('--yes');
const ALL = argv.includes('--all');
const targets = new Set(argv.filter(a => /^0x[0-9a-fA-F]{40}$/.test(a)).map(a => a.toLowerCase()));
if (!targets.size) { console.log('give at least one 0x address'); process.exit(1); }

const going = rows.filter(x => targets.has(String(x.r.addr).toLowerCase()));
const staying = rows.filter(x => !targets.has(String(x.r.addr).toLowerCase()));

if (!going.length) { console.log('none of those addresses is in the list; nothing to do'); process.exit(0); }

console.log('about to remove ' + going.length + ' row(s):');
going.forEach(x => console.log('  ' + x.r.addr + '  ' + (x.r.name || '(no name)') +
  (x.r.handle ? '  @' + x.r.handle : '') + '   signed ' + x.r.t));
console.log(staying.length + ' row(s) would remain.');

if (!staying.length && !ALL) {
  console.log('\n⛔ that would empty the list. If you really mean it, add --all as well.');
  process.exit(1);
}
if (!YES) { console.log('\nnothing written. Add --yes to go ahead.'); process.exit(0); }

const backup = FILE + '.' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14) + '.bak';
fs.copyFileSync(FILE, backup);
fs.writeFileSync(FILE, staying.map(x => x.l).join('\n') + (staying.length ? '\n' : ''));
console.log('\nbackup ' + backup);
console.log('removed ' + going.length + ', kept ' + staying.length);
