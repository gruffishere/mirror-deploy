// THE STORY LAYER. Facts from the chain, said the way a Wrapped says them.
//
// gruff's brief, 2026-08-17: the warm second person voice of a Spotify Wrapped, with one line of
// crypto-twitter reaction sitting under each fact. And the rule that makes it work on every wallet:
//
//   ★ WHEN A WALLET DOES NOT HAVE A BEAT, THE ABSENCE IS THE JOKE.
//     "I was going to mention the contracts you deployed. You have never even visited one."
//
// Spotify can assume everyone has listening history. We cannot: a fresh wallet has no loudest year,
// a vault has no gas war, most people have never deployed anything. Skipping those beats would leave
// a short card for exactly the people who need the most help. So every beat returns a line either
// way, and the ones with nothing to report are often the funniest.
//
// ⚠️ Every line here must be a FACT or an admitted GUESS. No line may imply a number we did not
// measure. The uncertainty about a wallet's timezone is handled by making it the joke rather than by
// quietly picking one.
// ⚠️ No em dashes anywhere: this is public copy.
'use strict';
const { fmt, num } = require('./timeshape.cjs');

const has = v => v !== null && v !== undefined;

// ── HOW STRIKING IS A BEAT ────────────────────────────────────────────────────────────────────────
// The card shows three or four beats and the report shows all of them, so something has to choose.
// It is not taste: a number is striking when it sits far from where everybody else's number sits.
// score = how far this wallet is from the population median, on a 0 to 1 scale.
//
// MEASURED where the population has the signal (age, holdings, gas, reverts, deploys, volume).
// ✅ 2026-08-26: the time shape WAS collected (wrapped/fetch_shape.cjs), so these are measured too.
// The old hand-set bands are kept as the fallback and nothing else, for a population that lacks them.
// (historical) EDITORIAL where it does not: the time-shape numbers were never collected for the 5,000
// wallets, so silence, streaks, peak year and gas price fall back to hand-set thresholds. Those are
// marked below and they are a weaker kind of claim. Collecting time shape for the population would
// turn all of them measured, and costs one 50 minute refetch.
const extremity = (pop, v) => {
  if (!pop || !pop.length || !has(v)) return null;
  let lo = 0, hi = pop.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (pop[m] <= v) lo = m + 1; else hi = m; }
  return Math.abs(lo / pop.length - 0.5) * 2;          // 0 at the median, 1 at either extreme
};
const band = (v, stops) => { for (let i = stops.length - 1; i >= 0; i--) if (v >= stops[i][0]) return stops[i][1]; return 0; };
// measured when the population carries the field, the old band when it does not
// ⚠️ MIN_POP is not a nicety. Percentiles from a handful of wallets look exactly like percentiles
// from thousands, and there is nothing in the output that would give it away.
const MIN_POP = 500;
const ranked = (arr, v, fallback) => {
  if (!arr || arr.length < MIN_POP) return fallback;
  const m = extremity(arr, v);
  return m === null ? fallback : m;
};
const pick = (n, arr) => arr[Math.min(arr.length - 1, n)];

// Each beat returns { key, line, quip } or null if it should not appear at all.
// `line` is the fact. `quip` is the reaction, and may be null when the fact stands better alone.
function beats(s, t, p, pop) {
  pop = pop || {};
  const out = [];
  const add = (key, line, quip, score) => { if (line) out.push({ key, line, quip: quip || null, score: score || 0 }); };

  // ── how long you have been here ────────────────────────────────────────────────────────────────
  if (has(s.ageDays)) {
    const d = s.ageDays;
    add('age', 'You have been here for ' + num(d) + ' days.',
      d > 2500 ? 'At this point you are less a user and more a landmark.'
      : d > 1500 ? 'Long enough to call yourself a veteran, if anyone asks.'
      : d > 600 ? 'Old enough to have opinions about gas.'
      : d > 180 ? 'Still new enough to be excited. Enjoy it.'
      : 'You are so new the paint is wet.', extremity(pop.ageDays, d));
  } else {
    add('age', 'We could not find the day you arrived.', 'Mysterious. Or broken. Probably mysterious.', 0.1);
  }

  // ── the first thing you ever touched ───────────────────────────────────────────────────────────
  if (t && t.firstTo && has(t.firstTs)) {
    add('first', 'Your first move was on ' + fmt(t.firstTs) + '.',
      s.firstLabel ? 'It went to ' + s.firstLabel + '. Everyone starts somewhere.' : null, 0.25);
  }

  // ── your loudest year ──────────────────────────────────────────────────────────────────────────
  if (t && t.yearsActive > 1) {
    add('peak', 'Your biggest year was ' + t.peakYear + ', with ' + num(t.peakYearCount) + ' moves.',
      t.peakShare > 0.5 ? 'That is more than half of everything you have ever done. What happened that year?'
      : t.peakShare > 0.3 ? 'More than a third of your whole life on chain, in twelve months.'
      : 'A steady one. You pace yourself.', ranked(pop.peakShare, t.peakShare, band(t.peakShare, [[0,0.15],[0.3,0.5],[0.5,0.8],[0.7,0.95]])));
  } else if (t) {
    add('peak', 'Everything you have done happened in one year.', 'A short story so far.', 0.3);
  }

  // ── the silence, and whether you came back ─────────────────────────────────────────────────────
  if (t && t.silenceDays >= 60) {
    add('silence', 'You went missing for ' + num(t.silenceDays) + ' days.',
      t.cameBack ? 'Then you came back on ' + fmt(t.silenceEndedTs) + ' like nobody would notice.'
                 : 'You never came back. This is a message in a bottle.', ranked(pop.silenceDays, t.silenceDays, band(t.silenceDays, [[60,0.45],[120,0.6],[240,0.8],[500,0.95]])));
  } else if (t) {
    add('silence', 'You have never been gone for more than ' + num(t.silenceDays) + ' days.',
      'Touch grass is a suggestion, not an instruction, apparently.', t.silenceDays <= 7 ? 0.55 : 0.2);
  }

  // ── the hour you live in ───────────────────────────────────────────────────────────────────────
  if (t && has(t.loudHour)) {
    const h = String(t.loudHour).padStart(2, '0') + ':00';
    add('hour', 'Your hour is ' + h + ' UTC. That is when ' + Math.round(100 * t.loudShare) + '% of your life here happens.',
      // ⚠️ the timezone is genuinely unknown, so the uncertainty becomes the joke instead of a guess
      t.loudHour >= 0 && t.loudHour <= 6 ? 'Either you are in Asia or you have a problem. We cannot tell from here.'
      : t.loudHour >= 19 ? 'Evening in Europe, lunch in New York, or three in the morning somewhere. Your secret is safe.'
      : 'A responsible hour. Suspiciously responsible.', ranked(pop.loudShare, t.loudShare, band(t.loudShare, [[0,0.2],[0.25,0.45],[0.35,0.7],[0.5,0.9]])));
  }

  // ── the single worst day ───────────────────────────────────────────────────────────────────────
  if (t && t.busiestDayCount >= 5) {
    add('busiest', 'On ' + fmt(t.busiestDayTs) + ' you made ' + num(t.busiestDayCount) + ' moves in one day.',
      t.busiestDayCount > 40 ? 'We hope it worked out.'
      : t.busiestDayCount > 15 ? 'Something was happening and you were in it.'
      : null, ranked(pop.busiestDayCount, t.busiestDayCount, band(t.busiestDayCount, [[5,0.2],[15,0.5],[40,0.75],[100,0.95]])));
  }

  // ── gas ────────────────────────────────────────────────────────────────────────────────────────
  if (t && t.topGwei > 0) {
    add('gas', 'The most you ever paid for one transaction was ' + Math.round(t.topGwei) + ' gwei, on ' + fmt(t.topGweiAt) + '.',
      t.topGwei > 500 ? 'You were in a gas war and you were not winning quietly.'
      : t.topGwei > 150 ? 'Somebody wanted that mint badly.'
      : 'Patient. Cheap. Correct.', ranked(pop.topGwei, t.topGwei, band(t.topGwei, [[0,0.15],[150,0.5],[500,0.8],[1500,0.95]])));
  }
  if (has(s.gasEth) && s.gasEth > 0) {
    add('gastotal', 'You have burned ' + s.gasEth.toFixed(2) + ' \u039E on gas.',
      s.gasEth > 10 ? 'That is a car. A small one, but a car.'
      : s.gasEth > 1 ? 'Gone. Not to anyone. Just gone.' : null, extremity(pop.gasEth, s.gasEth));
  }

  // ── the failures ───────────────────────────────────────────────────────────────────────────────
  // ⚠️ "NOT ONE HAS EVER REVERTED" NEEDS SOMETHING TO HAVE BEEN SENT.
  // A vault that receives NFTs and sends almost nothing cannot revert, so the card was telling
  // adamweitsman.eth that nobody is this careful on the strength of a single outgoing transaction.
  // It is the empty-wallet problem again in a different coat: true, and not a fact about the person.
  // A revert COUNT above zero is always worth saying; the perfect record needs a record to be
  // perfect over.
  const enoughSent = s.sent == null || s.sent >= 10;
  if (has(s.failCount) && (s.failCount > 0 || enoughSent)) {
    add('revert', s.failCount === 0 ? 'Not one of your transactions has ever reverted.'
        : num(s.failCount) + ' of your transactions reverted.',
      s.failCount === 0 ? 'Either careful or lucky. Nobody is this careful.'
      : s.failCount > 50 ? 'You have paid for nothing ' + num(s.failCount) + ' times. That is a hobby.'
      : 'You have paid for nothing ' + num(s.failCount) + ' times.', extremity(pop.failShare, s.failShare));
  }

  // ── what you built, and the joke when you built nothing ────────────────────────────────────────
  if (has(s.directDeploys) && s.directDeploys > 0) {
    add('build', 'You have created ' + num(s.directDeploys) + ' contract' + (s.directDeploys === 1 ? '' : 's') +
      (s.firstDeployTs ? ', the first in ' + new Date(s.firstDeployTs * 1000).getUTCFullYear() : '') + '.',
      s.directDeploys > 20 ? 'You do not use this place. You furnish it.'
      : s.directDeploys > 3 ? 'Someone here actually ships.' : 'One is more than most people manage.', 0.9);
  } else {
    add('build', 'We were going to talk about what you have built.',
      (s.colls || 0) > 50 ? 'You have bought a great deal and deployed nothing. A patron, then.'
        : 'You have never deployed a single contract. Reading is also a contribution.', 0.15);
  }

  // ── what you hold ──────────────────────────────────────────────────────────────────────────────
  if (has(s.colls) && s.colls > 0) {
    add('hold', 'You hold ' + num(s.nfts) + ' piece' + (s.nfts === 1 ? '' : 's') + ' across ' + num(s.colls) + ' collections.',
      s.colls > 200 ? 'Taste, or a storage problem. History will decide.'
      : s.colls > 30 ? 'That is a collection, not a wallet.'
      : s.nfts > 0 && s.colls <= 3 ? 'Focused. Almost suspiciously focused.' : null, extremity(pop.colls, s.colls));
  } else {
    add('hold', 'You hold nothing at all.',
      'An empty wallet is the cleanest wallet. Nobody can take what is not there.', 0.5);
  }

  // ── who you have met ───────────────────────────────────────────────────────────────────────────
  if (t && t.distinctContacts > 0) {
    add('contacts', 'You have spoken to ' + num(t.distinctContacts) + ' different addresses.',
      t.distinctContacts > 500 ? 'You have met more contracts than most people have met people.'
      : t.distinctContacts < 5 ? 'A small circle. Trust is expensive.' : null, ranked(pop.distinctContacts, t.distinctContacts, band(t.distinctContacts, [[0,0.15],[200,0.45],[800,0.75]])));
  }

  // ── the money that passed through ──────────────────────────────────────────────────────────────
  if (has(s.volumeEth) && s.volumeEth >= 1) {
    add('volume', num(s.volumeEth.toFixed(1)) + ' \u039E has moved through this wallet.',
      s.volumeEth > 1000 ? 'In and out, in and out. Did any of it stay?'
      : s.volumeEth > 100 ? 'Real money went through here.' : null, extremity(pop.volumeEth, s.volumeEth));
  }

  return out;
}

// The closing card: the facet itself.
function closing(s, p) {
  const tag = { NEWBIE: 'the story just began', COLLECTOR: 'taste is a signal', DEGEN: 'all in, always',
    BUILDER: 'you ship', OG: 'you were here first', WHALE: 'the tide moves with you',
    GHOST: 'seen everything, said nothing' }[p.dominant];
  return {
    line: 'You are ' + p.dominant + '. ' + tag + '.',
    sub: 'Rarer than ' + (100 * p.rarity).toFixed(2) + '% of the wallets we have read, and ' +
         p.spread.toFixed(1) + ' of 7 facets at once.',
    // ⚠️ this line is the whole ethical spine of the page and is not optional
    note: 'None of this reaches the contract. FACETS hands you a face you did not choose.',
  };
}

// The card shows the few beats this wallet is most unusual for. The report shows everything.
// ⚠️ The opening age line is always kept: a Wrapped that starts mid sentence reads as broken.
function card(all, n) {
  n = n || 4;
  const first = all.find(b => b.key === 'age');
  const rest = all.filter(b => b !== first).sort((a, b) => (b.score || 0) - (a.score || 0));
  return [first, ...rest].filter(Boolean).slice(0, n);
}

module.exports = { beats, closing, card };
