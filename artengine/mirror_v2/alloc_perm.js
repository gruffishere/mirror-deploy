// FACETS — allocation by PERMUTATION instead of by weighted hash. The prototype for "option B".
//
// WHAT IT REPLACES. `FacetsCore._alloc` picks a facet with `keccak(seed, id) % 10000` against threshold
// bands. Each token rolls independently, so the per-facet counts are BINOMIAL: about 2188 collectors,
// never exactly 2188. That is fine on its own, and it was locked on purpose.
//
// WHY IT HAS TO CHANGE FOR NAMES. A facet's names may only land on that facet's tokens, so covering them
// needs "where do I rank among tokens of my own facet". Under an independent per-token roll there is no
// rank to read: answering it means counting the whole collection, ~6,969 keccaks inside a `tokenURI`
// whose worst token already sits at 49.0M of the 50M cap.
//
// THE FIX. Give every token a rank `r = P(id)` from a keyed PERMUTATION of 0..supply-1, then cut the rank
// line into contiguous facet bands. Two things fall out at once:
//   · counts become EXACT. Band widths are chosen, not sampled.
//   · rank-within-facet is `r - bandStart(facet)`. O(1), no storage, no table, no reveal-day step.
//
// ⚠️ The permutation must be over the FINAL SUPPLY, which is why the supply has to be frozen at reveal.
// ⚠️ Everything here is still (revealSeed, tokenId) in, facet out. Nothing about the reveal's promises
//    moves: one VRF word, unbiasable, permissionless `reveal()`, fully reproducible off chain.

'use strict';

// ── the permutation ───────────────────────────────────────────────────────
// A 4-round Feistel over a power-of-two domain, plus CYCLE WALKING to land inside an arbitrary supply.
// Feistel is invertible by construction, which is what makes it a permutation rather than a hash: no two
// tokens can share a rank and no rank can go unused. Cycle walking keeps that property: if the raw output
// falls outside [0, n) we re-apply the same map until it does not, and since the map is a bijection on the
// power-of-two domain, the walk is a bijection on [0, n) too.
//
// ⚠️ The walk is unbounded in theory. In practice n is at worst just over a power of two, so the expected
// number of steps is under 2 and the tail is geometric. The Solidity port must still cap it and revert
// rather than loop forever.

function mix(x, k) {
  // one round function; any well-mixing map is fine, it does not need to be invertible itself
  let h = (x ^ k) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function feistelBits(n) {           // smallest even bit-count whose domain covers n
  let b = 1;
  while ((1 << b) < n) b++;
  return b + (b & 1);               // make it even so the two halves are equal
}

function makePerm(seed, n) {
  const bits = feistelBits(n);
  const half = bits >> 1;
  const mask = (1 << half) - 1;
  const keys = [0, 1, 2, 3].map(i => mix(seed >>> 0, 0x9e3779b9 + i));

  const round = x => {
    let l = (x >>> half) & mask, r = x & mask;
    for (let i = 0; i < 4; i++) {
      const nl = r, nr = (l ^ (mix(r, keys[i]) & mask)) >>> 0;
      l = nl; r = nr;
    }
    return ((l << half) | r) >>> 0;
  };

  // id (1..n) -> rank (0..n-1)
  return function P(id) {
    let x = (id - 1) >>> 0;
    for (let guard = 0; guard < 64; guard++) {
      x = round(x);
      if (x < n) return x;
    }
    throw new Error('cycle walk did not terminate for id ' + id);
  };
}

// ── exact facet bands ─────────────────────────────────────────────────────
// The 10,000-scale weights the project has always used. Scaling them to an arbitrary supply leaves a
// remainder, which is handed to the LARGEST facet so the smallest ones never drift: a couple of tokens
// matters to GHOST at 429 and does not to NEWBIE at 1,669.
const W = {                       // facet -> weight out of 10000
  COLLECTOR: 2188, NEWBIE: 2406, DEGEN: 1617, BUILDER: 1294, OG: 1109, WHALE: 773, GHOST: 613,
};
// ⚠️ BAND ORDER IS PART OF THE OUTPUT and must match the Solidity port exactly. It follows
// FacetsCore._alloc's existing order so the two can be diffed line by line.
const BAND_ORDER = ['COLLECTOR', 'NEWBIE', 'DEGEN', 'BUILDER', 'OG', 'WHALE', 'GHOST'];

function bands(supply) {
  const out = [];
  let acc = 0;
  for (const f of BAND_ORDER) {
    const n = Math.floor(supply * W[f] / 10000);
    out.push({ facet: f, start: acc, count: n });
    acc += n;
  }
  // remainder to the largest facet, and shift every band after it
  const rest = supply - acc;
  if (rest) {
    let big = 0;
    for (let i = 1; i < out.length; i++) if (out[i].count > out[big].count) big = i;
    out[big].count += rest;
    let a = 0;
    for (const b of out) { b.start = a; a += b.count; }
  }
  for (const b of out) b.end = b.start + b.count;
  return out;
}

function facetOfRank(bs, r) {
  for (const b of bs) if (r < b.end) return b;
  throw new Error('rank ' + r + ' is past the last band');
}

// Everything a token needs, in one call.
function allocate(seed, supply) {
  const P = makePerm(seed, supply);
  const bs = bands(supply);
  return {
    P, bands: bs,
    of(id) {
      const r = P(id);
      const b = facetOfRank(bs, r);
      return { rank: r, facet: b.facet, rankInFacet: r - b.start, facetSize: b.count };
    },
  };
}

module.exports = { makePerm, bands, facetOfRank, allocate, W, BAND_ORDER };
