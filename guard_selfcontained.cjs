// DOES THIS TREE DEPEND ON ANYTHING OUTSIDE ITSELF?
//
//   node guard_selfcontained.cjs
//
// ⛔ WRITTEN AFTER FIVE ESCAPES WERE FOUND IN A TREE THAT LOOKED FINE. claims.cjs reached into a
// sibling project's node_modules for ethers; mirror_piece.cjs reached two directories away for the
// art engine; two guards and the retired server did the same for ethers. Every one of them ran
// perfectly on the machine they were written on. On a host the first would have thrown at the first
// signature and the second at boot.
//
// ⚠️ IT RESOLVES, IT DOES NOT PATTERN-MATCH. Grepping for '../..' found NONE of the five, because not
// one of them is written that way. Every require target is turned into a real path and asked whether
// it still lives under this root.
//
// ⚠️ IT SKIPS ITSELF. The examples in this comment are require() calls as far as a scanner is
// concerned, and a guard that fails on its own documentation gets switched off.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = __dirname;
const SELF = path.basename(__filename);

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'fonts', 'cache', 'png', 'lists'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(cjs|js)$/.test(e.name) && e.name !== SELF) files.push(p);
  }
})(ROOT);

const BUILTIN = new Set(require('module').builtinModules);
let escapes = 0, missing = 0, checked = 0;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /require\(\s*(?:'([^']+)'|"([^"]+)"|path\.join\(([^)]*)\))\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    let target;
    if (m[1] || m[2]) {
      target = m[1] || m[2];
      if (BUILTIN.has(target.replace(/^node:/, ''))) continue;
      if (!target.startsWith('.')) {
        checked++;
        try { require.resolve(target, { paths: [ROOT] }); }
        catch { console.log('  ⛔ MISSING PACKAGE  ' + path.relative(ROOT, f) + '  ->  ' + target); missing++; }
        continue;
      }
      target = path.resolve(path.dirname(f), target);
    } else {
      const parts = m[3].split(',').map(s => s.trim());
      if (parts[0] !== '__dirname') continue;
      const segs = parts.slice(1).map(s => s.replace(/^['"]|['"]$/g, ''));
      if (segs.some(s => !/^[\w.\-]+$/.test(s))) continue;
      target = path.resolve(path.dirname(f), ...segs);
    }
    checked++;
    const rel = path.relative(ROOT, target);
    if (rel.startsWith('..')) {
      console.log('  ⛔ ESCAPES THE TREE  ' + path.relative(ROOT, f) + '  ->  ' + rel); escapes++; continue;
    }
    if (!['', '.cjs', '.js', '.json'].some(x => fs.existsSync(target + x))) {
      console.log('  ⛔ MISSING FILE     ' + path.relative(ROOT, f) + '  ->  ' + rel); missing++;
    }
  }
}
console.log('\n' + files.length + ' source files · ' + checked + ' require targets resolved');
console.log('escaping the tree : ' + escapes + '   (must be 0)');
console.log('missing           : ' + missing + '   (must be 0)');
process.exit(escapes || missing ? 1 : 0);
