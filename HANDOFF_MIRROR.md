# THE MIRROR — handoff

Everything needed to run this without having been in the room. Written 2026-08-26.

## Run it

```
node wrapped/prewarm.cjs                                  once, after any signals rebuild
node wrapped/site/server_v2.cjs --port 8141 --admin <tok>  the API
node static_server_8120.cjs                               static files, from exp/
```

- API and page: `http://localhost:8141`
- Card lab: `http://localhost:8120/wrapped/cards/faz1.html` (`?lab=0` hides the treatment strip)
- Keys live in `wrapped/.keys.json` — `{ "etherscan": "...", "alchemy": "..." }`

## ⛔ The five things that will bite you

**1. Etherscan's free tier is 5 calls a second and one wallet read costs about 3.**
So roughly 1.5 reads a second is the ceiling, however clever the queue gets. `--lanes` raises the
server's concurrency but the ceiling is the plan, not the code. Raising it costs money, not effort.

**2. Etherscan V2 caps `txlist` at 1,000 rows whatever `offset` says, and calls the truncated page
`status: 1, OK`.** It does not tell you it truncated. A walk that stops when a batch looks "short"
stops after one page and reports a complete history. The engine has always paged at 1,000 and
advanced `startblock`; anything new that reads the chain must do the same.

**3. Read latency is NOT driven by wallet size.** Measured: 26 rows 1.6 s, 530 rows 19.9 s, 6,798 rows
11.6 s. The cost is Alchemy returning `contractDeployer` cold and the engine retrying up to four times
with long waits. That retry exists because a cold read gave gruff BUILDER and a warm read gave him
COLLECTOR on the same wallet, which a deterministic engine may never do. **Do not shorten those waits
to make the site feel faster** without reproducing that bug first.

**4. Alchemy's `totalCount` is systematically 1 to 4 rows higher than the rows it will page out.**
Measured on 24 wallets: gap median 1, max 4, never as much as 1% of the total, and no wallet in 5,000
has ever hit the 40-page ceiling. So "did we read it all" is `pages < MAX_PAGES` and nothing else;
the discrepancy is kept as `collsGap`. Guarded by `wrapped/guard_collsexact.cjs`.

**5. This machine is on a Turkish locale.** Every `toLocaleString` is pinned to `en-US` on purpose. An
unpinned one prints "1.757 days old".

## The guards, and how to prove they still work

```
node wrapped/audit.cjs                 5,000 stored wallets: impossible values, drift, calibration
node wrapped/guard_collsexact.cjs      the "did we read it all" rule, both directions
node wrapped/ens.cjs --selftest        keccak-256 + namehash vectors
node wrapped/verify.cjs <0xaddr>       replays a stored reading from RAW Etherscan rows
node wrapped/loadtest.cjs --port 8141  the server's guards, and what concurrency costs
node wrapped/twins.cjs --measure       is the "closest twin" line still meaningful
node wrapped/guard_claims.cjs          the signature path, 8 attacks and 4 honest cases
node wrapped/e2e_claim.cjs --port 8141 --admin <tok> --clean    the same thing over real HTTP
```

⚠️ `verify.cjs` deliberately does not import the engine. A checker that calls the same reader as the
thing it checks can only ever agree with it.

⚠️ `loadtest.cjs` runs its rate-limit section LAST, because the limiter is per IP and the whole file
is one IP. Move it earlier and everything after it fails for the wrong reason.

## What the load test measured, 2026-08-26

| | before | after |
|---|---|---|
| cached read, 200 at once | 37 ms, 200/200 ok | unchanged, was never the problem |
| `/api/population`, 10 at once | 1,002 ms each | first call 149 ms, then 1 ms |
| a cached read arriving 30 ms into a population call | 84 ms | 1 ms |
| `?refresh=1` | anyone, unlimited | 403 without the admin token |
| requests per IP | unlimited | 60/min any, 6/min uncached |
| queue | unbounded, 50 visitors meant 9.7 min for the last | bounded at 40, 503 past it |
| first-time read of a reference wallet | 1.6 to 19.9 s | 1 ms, pre-warmed |

## The page

`site/mirror.html`, served at `/`. The old bench survives at `/bench`.

One input, one answer. When a reading arrives the hero collapses and the card takes the screen; a
full-height hero pushed the card most of a screen below the fold, so the thing a person came for was
the thing they had to go looking for.

- It loads `/cards/faz1.css` and `/cards/faz1_layouts.js` directly, so the card on the page **is** the
  card that was designed. There is no second copy of the layout to drift.
- `window.FAZ1_ART` points the card at `/api/art.svg`. The lab keeps its five local PNGs. One hook,
  one layout, two hosts.
- While a read is in flight the page polls `/api/status` every second and shows the queue depth.
  `/api/status` is free and never queues.
- The signature is `personal_sign` over the server's message. **The connected wallet must be the
  wallet on screen**, or the card would carry one person's reading under another person's name.
- `?addr=` makes a reading a link.

`/api/art.svg?addr=&facet=` draws the piece for any address on demand: 27 ms for the first render
while the engine warms, **1.6 ms after**, 17 KB of SVG. It is deterministic from the address, so it is
the one response that may be cached hard by the browser. The memory cache is bounded at 3,000.

## The cache

`wrapped/site/cache/<address>.json`, one file each, ~3.7 KB.
It used to be one JSON rewritten in full on every uncached read: invisible at 8 addresses, 19 MB per
visitor once pre-warmed.

`prewarm.cjs` builds 5,000 entries in under 4 seconds **with zero API calls**, because a cache row is
`{ profile, signals, story }` and only `signals` costs a network call — those are already on disk from
the 2026-08-17 population build. Rows are marked `prewarmed: true` and carry the ORIGINAL read date,
never today's, so nothing can be mistaken for a fresh look at the chain. A live read overwrites a
pre-warmed row and the flag disappears.

⚠️ The old `wrapped/site/cache_v2.json` is still READ at boot so nothing already answered is lost. It
is no longer written. The card lab still uses it as its own demo data; leave it alone.

## The claim, and the two lists

```
POST /api/nonce   { address }                         -> { nonce, message, expiresIn }
POST /api/claim   { nonce, signature, name, handle }  -> { ok, addr, name, handle }
GET  /api/lists/stats?token=<admin>
GET  /api/lists/fcfs.csv?token=<admin>&limit=1&price=0
```

- `site/lists/reads.jsonl` — LIST A, every address anyone typed. **Not people. Never an allowlist.**
- `site/lists/signed.jsonl` — LIST B, addresses whose owner signed. **This is the FCFS CSV.**

⛔ **The address is recovered from the signature; the one in the request body is ignored.**
⛔ **The exact signed message is stored beside the signature**, or no row can be checked again later.
Every row is re-verified from its own message before it can reach a CSV, so a row planted straight
into the file is rejected and counted in the `X-Rejected` header.
⛔ `0x4730497622bdfd6eafe1f09fa22b3a0aca94a646` is excluded from the CSV by name and reported in the
`X-Excluded` header rather than dropped in silence. It is `FacetsTurn.excludedAtLaunch` and it holds
the 369 reserve.
⚠️ The signed message is built ONCE and stored with the nonce. The first version rebuilt it at
verification time from the lowercased address while it had been handed out checksummed, so every
honest signature was rejected as a forgery. Never reconstruct something that was signed.
⚠️ Nonces are single use, ten minutes, in memory. A restart invalidates outstanding ones, which is
fine because the page asks for one immediately before it asks the wallet to sign.

## Still open

- **Keys were echoed into a terminal error on 2026-08-16 and `.keys.json` has not been written since,
  so they were almost certainly never rotated.** Rotate before this is public.
- No domain. `MIRROR_ORIGIN` in the FACETS site still points at `localhost:8141`.
- The queue reports its depth on `/api/status` and returns `queuedAt`, but **the page does not show
  it yet**. Without that, a 20 second wait reads as a dead site.
- Time-shape beats (silence, streak, peak year, gas price) are scored against hand-set thresholds, not
  the population. One ~50 minute refetch converts them to measured.
- `art` is one of eight facet-word treatments and is weak on a dark piece. `window.FAZ1_POOL` drops it.
- **No PNG download.** The card is live HTML, so "save this image" does not exist yet. The share
  button opens an X compose window with text only. Rasterising needs either headless Chrome on the
  server or an SVG rebuild of the card.
- The GTD raffle among signers: designed (commit-reveal, hash of rules plus salt published before the
  close, merkle root on chain) and deliberately deferred until the demand is known.
