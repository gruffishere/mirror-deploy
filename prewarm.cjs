// PRE-WARM THE CACHE — for free, with no API calls at all.
//
//   node wrapped/prewarm.cjs [--dry]
//
// A cache entry is { profile, signals, story }. `signals` is the only part that costs a network call,
// and the 5,000 reference wallets already have theirs on disk in signals_v2.json. `profile` and
// `story` are pure computation over that. So every one of those addresses can be answered instantly,
// on the first day, without spending a single Etherscan or Alchemy request.
//
// ⚠️ WHO THOSE 5,000 ARE IS THE POINT. They are the owners of 29 verified collections plus a capped
// recent-block tail, which is close to the crowd that will actually paste an address into THE MIRROR.
// Measured: an uncached read takes 1.6 to 19.9 seconds and the server takes one at a time, so this
// is the difference between "the site is thinking" and "the site already knew".
//
// ⚠️ THE ENTRIES ARE MARKED. `prewarmed: true` and `at` carry the date of the ORIGINAL read, not
// today, so nothing here can be mistaken for a fresh look at the chain. A wallet moves; these
// readings are from 2026-08-16 and the card has to be able to say so.
'use strict';
const fs = require('fs'), path = require('path');
const E = require(path.join(__dirname, 'facet_engine_v2.cjs'));
const STORY = require(path.join(__dirname, 'story.cjs'));

const DRY = process.argv.includes('--dry');
const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'baseline_v2.json'), 'utf8'));
const sig = JSON.parse(fs.readFileSync(path.join(__dirname, 'signals_v2.json'), 'utf8'));
const DIR = path.join(__dirname, 'site', 'cache');
if (!DRY) fs.mkdirSync(DIR, { recursive: true });

// when the signals were actually fetched, so a pre-warmed row never claims to be from today
const READ_AT = (() => {
  try { return new Date(fs.statSync(path.join(__dirname, 'signals_v2.json')).mtime).toISOString(); }
  catch { return new Date(0).toISOString(); }
})();

// ⛔ FOUND 2026-08-26 BY LOOKING AT A CARD: the pre-warm shadowed newer readings.
// The old single-file cache holds rows the server read LIVE, and every one of its 8 rows was newer
// than the signals build. Writing a pre-warmed row for those addresses replaced a current reading
// with a three-day-old one, and the page then showed dingaling 11,079 pieces while the card lab
// showed 12,990 from the same wallet. Nothing errored; the numbers just quietly went backwards.
// ⇒ The newest reading for an address always wins, whatever file it came from.
const legacy = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'site', 'cache_v2.json'), 'utf8')); }
  catch { return {}; }
})();

const t0 = Date.now();
let wrote = 0, skipped = 0, bytes = 0, existing = 0, carried = 0;
try { existing = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).length; } catch {}

for (const key of Object.keys(sig)) {
  const s = sig[key];
  if (!s || !s.addr) { skipped++; continue; }
  const a = s.addr.toLowerCase();
  const file = path.join(DIR, a + '.json');
  // ⚠️ never overwrite a row the server read live: that one is newer and it is real.
  // ⚠️ a live row on disk is only kept if it is ALSO newer than what the legacy file offers; the
  // copy is rebuilt either way, so a wording change reaches every row rather than all but six.
  if (!DRY && fs.existsSync(file)) {
    try {
      const cur = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!cur.prewarmed && !(old && old.at && cur.at && old.at >= cur.at)) {
        const cs = cur.signals;
        const cp = E.profile(cs, base);
        const ca = STORY.beats(cs, cs.shape, cp, base.pop);
        fs.writeFileSync(file, JSON.stringify({ profile: cp, signals: cs, at: cur.at,
          story: { card: STORY.card(ca, 4), report: ca, closing: STORY.closing(cs, cp) } }));
        carried++; continue;
      }
    } catch {}
  }
  let row;
  // a live reading from the old cache that is NEWER than the signals build is the better answer,
  // so it is carried across rather than overwritten
  const old = legacy[a];
  if (old && !old.prewarmed && old.at && old.at > READ_AT) {
    const os = old.signals || s;
    const op = E.profile(os, base);
    const oa = STORY.beats(os, os.shape, op, base.pop);
    row = { profile: op, signals: os, at: old.at,
            story: { card: STORY.card(oa, 4), report: oa, closing: STORY.closing(os, op) } };
    carried++;
  } else {
    try {
      const p = E.profile(s, base);
      const all = STORY.beats(s, s.shape, p, base.pop);
      row = { profile: p, signals: s, at: READ_AT, prewarmed: true,
              story: { card: STORY.card(all, 4), report: all, closing: STORY.closing(s, p) } };
    } catch (e) { skipped++; continue; }
  }
  const body = JSON.stringify(row);
  bytes += body.length;
  if (!DRY) fs.writeFileSync(file, body);
  wrote++;
}

console.log((DRY ? 'DRY RUN, nothing written\n' : '') +
  'pre-warmed ' + wrote.toLocaleString('en-US') + ' addresses' +
  (carried ? ', carried ' + carried + ' newer live reading(s) across unchanged' : '') +
  (skipped ? ', skipped ' + skipped : '') +
  '   ' + (bytes / 1024 / 1024).toFixed(1) + ' MB   ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s' +
  '   0 api calls');
console.log('cache folder held ' + existing + ' before this run: ' + DIR);
console.log('readings dated ' + READ_AT.slice(0, 10) + ', marked prewarmed:true');
