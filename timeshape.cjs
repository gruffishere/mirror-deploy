// THE SHAPE OF A WALLET'S LIFE, from the history the engine already downloads.
//
// The seven axes answer "who are you". These answer "what happened to you", which is the part a
// Wrapped is actually made of. None of them feed the scoring, so they cost nothing: no extra call, no
// population rebuild, no ceiling to recalibrate. They are narrative, and every one is a fact.
//
// ⚠️ Every timestamp here is UTC. We do not know the wallet's timezone and will not pretend to,
// though `sleepGuess` below shows what could be inferred if we ever decide to.
'use strict';

const DAY = 86400;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                'September', 'October', 'November', 'December'];
const fmt = ts => { const d = new Date(ts * 1000);
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
const num = v => Number(v).toLocaleString('en-US');

// rows are the whole txlist, ascending, as `history()` returns them
function timeShape(rows, addr) {
  if (!rows || rows.length < 2) return null;
  const me = (addr || '').toLowerCase();
  const ts = rows.map(r => Number(r.timeStamp));
  const out = rows.filter(r => (r.from || '').toLowerCase() === me);

  // ── the loudest year, and how lopsided a life is ────────────────────────────────────────────────
  const byYear = {};
  ts.forEach(t => { const y = new Date(t * 1000).getUTCFullYear(); byYear[y] = (byYear[y] || 0) + 1; });
  const years = Object.entries(byYear).map(([y, n]) => [+y, n]).sort((a, b) => b[1] - a[1]);
  const peakYear = years[0];
  const peakShare = peakYear[1] / rows.length;

  // ── the longest silence, and whether it ended ───────────────────────────────────────────────────
  let gap = 0, gapAt = 0;
  for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > gap) { gap = ts[i] - ts[i - 1]; gapAt = i; }
  const silenceDays = Math.floor(gap / DAY);
  const cameBack = gapAt < ts.length - 1;

  // ── the longest run of consecutive days with something on them ──────────────────────────────────
  const days = [...new Set(ts.map(t => Math.floor(t / DAY)))].sort((a, b) => a - b);
  let streak = 1, best = 1, bestEnd = days[0];
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) { streak++; if (streak > best) { best = streak; bestEnd = days[i]; } }
    else streak = 1;
  }

  // ── the busiest single day ──────────────────────────────────────────────────────────────────────
  const perDay = {};
  ts.forEach(t => { const d = Math.floor(t / DAY); perDay[d] = (perDay[d] || 0) + 1; });
  const busiest = Object.entries(perDay).map(([d, n]) => [+d, n]).sort((a, b) => b[1] - a[1])[0];

  // ── the hour of the day, and the eight quiet hours that probably mean sleep ─────────────────────
  const hours = new Array(24).fill(0);
  ts.forEach(t => hours[new Date(t * 1000).getUTCHours()]++);
  let quietStart = 0, quietMin = Infinity;
  for (let h = 0; h < 24; h++) {
    let s = 0; for (let k = 0; k < 8; k++) s += hours[(h + k) % 24];
    if (s < quietMin) { quietMin = s; quietStart = h; }
  }
  let loudStart = 0, loudMax = -1;
  for (let h = 0; h < 24; h++) {
    let s = 0; for (let k = 0; k < 3; k++) s += hours[(h + k) % 24];
    if (s > loudMax) { loudMax = s; loudStart = h; }
  }

  // ── the most expensive gas ever paid, which is where the gas wars live ──────────────────────────
  let topGwei = 0, topGweiAt = 0;
  out.forEach(r => { const g = Number(r.gasPrice || 0) / 1e9; if (g > topGwei) { topGwei = g; topGweiAt = Number(r.timeStamp); } });

  // ── who you spoke to first, and how many different things you have touched ──────────────────────
  const firstOut = out[0];
  const contacts = new Set(out.map(r => (r.to || '').toLowerCase()).filter(Boolean));

  return {
    firstTs: ts[0], lastTs: ts[ts.length - 1],
    peakYear: peakYear[0], peakYearCount: peakYear[1], peakShare,
    yearsActive: Object.keys(byYear).length,
    silenceDays, silenceEndedTs: ts[gapAt], cameBack,
    streakDays: best, streakEndTs: bestEnd * DAY,
    busiestDayTs: busiest[0] * DAY, busiestDayCount: busiest[1],
    loudHour: loudStart, loudShare: loudMax / rows.length,
    sleepGuess: (quietStart + 8) % 24,        // ⚠️ inference, not a fact. UTC.
    topGwei, topGweiAt,
    firstToTs: firstOut ? Number(firstOut.timeStamp) : null,
    firstTo: firstOut ? (firstOut.to || null) : null,
    distinctContacts: contacts.size,
    totalRows: rows.length,
  };
}

module.exports = { timeShape, fmt, num, MONTHS };
