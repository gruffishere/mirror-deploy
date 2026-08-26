/* Faz 1 demo table.
   ⚠️ THE ONLY HAND-WRITTEN VALUES ON THIS PAGE ARE `name` AND `handle`. They stand in for what a
   person types into the card after signing, because nothing on chain carries them: measured on 613
   real wallets, OpenSea gave an X account for 15% and ENS for 1.6%, and that OpenSea route closed on
   2026-08-15. Everything else (facet, score, rarity, axes, beats, twin) is the real engine output. */
window.FAZ1 = {
  order: ['0x4730497622bdfd6eafe1f09fa22b3a0aca94a646','0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          '0x54be3a794282c030b15e43ae2bb182e14c409c5e','0x59560854986b354d2dbc4368a09526dae0b244db',
          '0xcc6c1d21e8474b3578e69eb036c712ab08ffdfbb'],
  typed: {
    '0x4730497622bdfd6eafe1f09fa22b3a0aca94a646': { name: 'gruff',   handle: 'gruffdzn' },
    '0xd8da6bf26964af9d7eed9e03e53415d37aa96045': { name: 'Vitalik', handle: 'VitalikButerin' },
    '0x54be3a794282c030b15e43ae2bb182e14c409c5e': { name: 'dingaling', handle: 'dingalingts' },
    '0x59560854986b354d2dbc4368a09526dae0b244db': { name: 'tfw',     handle: 'tfwtfwtfw' },
    '0xcc6c1d21e8474b3578e69eb036c712ab08ffdfbb': { name: 'bsy',     handle: 'bsyfiles' }
  },
  // computed by `node wrapped/twins.cjs <addr>` against the 5,000 wallet reference population
  twin: {
    '0x4730497622bdfd6eafe1f09fa22b3a0aca94a646': { who: 'cnaut.eth',        facet: 'COLLECTOR', d: 0.2421 },
    '0xd8da6bf26964af9d7eed9e03e53415d37aa96045': { who: 'snowfro.eth',      facet: 'BUILDER',   d: 0.2001 },
    '0x54be3a794282c030b15e43ae2bb182e14c409c5e': { who: '0x10752ae1...4bba', facet: 'WHALE',     d: 0.1208 },
    '0x59560854986b354d2dbc4368a09526dae0b244db': { who: 'harrygodwin.eth',  facet: 'COLLECTOR', d: 0.0899 },
    '0xcc6c1d21e8474b3578e69eb036c712ab08ffdfbb': { who: 'jasmark.eth',      facet: 'WHALE',     d: 0.1179 }
  },
  // measured 2026-08-26 by `twins.cjs --measure` over 417 sampled wallets of 5,000
  twinPop: { p10: 0.0082, median: 0.0821, p90: 0.1388, randomMedian: 0.7687 },
  // `node wrapped/twins.cjs <addr>` — wallets within 0.15 of this one, out of 5,000.
  // The radius is measured, not chosen by taste: `twins.cjs --radius` prints the table it came from.
  // At 0.10 a THIRD of everybody is told nobody is like them, which makes the line worthless. At 0.15
  // that is 6.5%, rare enough to mean something on the day it happens.
  // Population spread at 0.15: p10 1 · median 11 · p90 80 · max 295.
  near: {
    '0x4730497622bdfd6eafe1f09fa22b3a0aca94a646': 0,
    '0xd8da6bf26964af9d7eed9e03e53415d37aa96045': 0,
    '0x54be3a794282c030b15e43ae2bb182e14c409c5e': 12,
    '0x59560854986b354d2dbc4368a09526dae0b244db': 34,
    '0xcc6c1d21e8474b3578e69eb036c712ab08ffdfbb': 1
  },
  // RANK ON YOUR OWN AXIS, against the 5,000 reference wallets. Measured 2026-08-26.
  // This is the hero number: every wallet gets a distinct integer, it is a leaderboard position
  // rather than a percentile of a distance, and it is the project's own language ("how much of a
  // BUILDER are you"). ⚠️ It ranks against the fixed reference population, NOT against Mirror
  // visitors, so it is stable and reproducible and the card must say which.
  rank: {
    '0x4730497622bdfd6eafe1f09fa22b3a0aca94a646': { n: 31,  pct: 0.62 },
    '0xd8da6bf26964af9d7eed9e03e53415d37aa96045': { n: 1,   pct: 0.02 },
    '0x54be3a794282c030b15e43ae2bb182e14c409c5e': { n: 72,  pct: 1.44 },
    '0x59560854986b354d2dbc4368a09526dae0b244db': { n: 430, pct: 8.60 },
    '0xcc6c1d21e8474b3578e69eb036c712ab08ffdfbb': { n: 9,   pct: 0.18 }
  }
};
