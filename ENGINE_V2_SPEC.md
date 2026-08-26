# FACETS WRAPPED — engine v2 spec

Locked 2026-08-16. v1 leaned a weighted draw and told a story. **v2 has no draw.** The reading is a
deterministic function of chain data, and it returns a seven axis profile rather than a verdict.

Everything below that carries a number was measured on the frozen 635 wallet holder population, not
estimated. The probes are named where they exist.

---

## 1. Why the draw is gone, and what replaces it

Removing the draw does not make the mint mismatch smaller. It makes it sharper: a card that says
"YOU ARE AN OG" with receipts is a promise, and the contract breaks it three weeks later.

The resolution is to stop returning one facet.

**Measured, on 635 real wallets, deterministic argmax on the v1 formulas:**

```
margin between the winner and the runner up
  median 0.097     under 0.05: 202 of 635 (%31.8)     under 0.02: 87 of 635 (%13.7)
```

For roughly a third of visitors the single winning facet is separated from second place by noise. A
single verdict would be presenting a coin flip as evidence, and the first person to read the same
wallet twice would catch it.

So the reading returns **all seven axes with one dominant**. This is simultaneously:
- honest about the measured thin margin,
- the project's own locked thesis (*no one on chain is one thing*),
- and it makes the mint a continuation instead of a contradiction, because whatever the chain assigns
  is always one of the seven faces the page already showed you.

**Measured support for the thesis, and it goes on the page:**

```
effective number of facets per wallet  =  sum of the calibrated axes / the largest one
  min 1.87        median 4.20        max 6.03
```

The median wallet we read is 4.2 of 7. Even the most one dimensional wallet in the set is nearly two.

---

## 2. Calibration: variant B, and why A and C are traps

The seven v1 formulas do not share a scale, so an argmax between them was never valid:

```
population ceiling (p99) of each axis
  NEWBIE 0.967   COLLECTOR 0.978   DEGEN 0.972   OG 0.964   WHALE 0.978
  BUILDER 0.612  GHOST 0.669
```

Ghost was not losing. Ghost was entering the race with a 0.816 maximum against a 0.997 maximum, which
is why it won 2.0% of a population it should win far more of.

Three candidate fixes, measured (`scratchpad/calib_probe.cjs`):

| variant | NEWBIE | COLLECTOR | DEGEN | BUILDER | OG | WHALE | GHOST |
|---|---|---|---|---|---|---|---|
| raw argmax (v1) | 32.9 | 13.7 | 14.2 | **0.2** | 20.8 | 16.2 | **2.0** |
| A percentile rank | 19.7 | 7.9 | 9.3 | *13.5* | 13.7 | 12.6 | 23.3 |
| **B divide by p99** | 20.5 | 11.0 | 13.9 | 1.3 | 16.9 | 11.7 | 24.9 |
| C z score | 20.2 | 6.9 | 8.5 | *15.9* | 14.0 | 12.1 | 22.4 |

⛔ **A and C manufacture Builders who never built.** The BUILDER axis has a narrow spread (sd 0.133), so
converting an absolute level into a rank hands a high BUILDER position to a wallet that merely
transacts often. The italic numbers above are an artefact of the instrument. The real figure is fixed
and known: **11 of 635 wallets have ever deployed a contract.**

✅ **B is the choice.** It equalises the ceilings and invents nothing. Builder stays rare at 1.3% and
that is correct, not a defect: nobody is denied a card, Builder is simply the rarest dominant, and
since rarity is the headline number a Builder card is a flex.

```
calibrated[f] = min(1, raw[f] / p99_population[f])
dominant = argmax(calibrated)
```

---

## 3. The headline number

The facet word is one of seven, so on its own it is not shareable. It carries a continuous number
beside it, the way accworth's facet word (its tier) carries a dollar figure.

**RARITY = distance of your calibrated seven vector from the population centroid, expressed as a
percentile.**

```
measured: 634 of the 635 wallets receive a DISTINCT headline number at 0.1% resolution
```

The "everyone gets the same card" objection was measured and does not hold. Supporting line under it:
`you are 4.2 of 7 facets`.

---

## 4. Three measured defects in v1, all fixed here

**D1 — a third of COLLECTOR is airdrop garbage.** 1,693 collections sampled across 8 real holder
wallets (`scratchpad/spam_probe.cjs`):

```
584 of 1693 = %34.5 flagged isSpam
per wallet: %14 %20 %21 %22 %26 %47 %58 %63
```

Alchemy's `excludeFilters[]=SPAM` requires a paid Growth plan (tested, refused). The free fix costs
nothing: v1 calls `getContractsForOwner` with `pageSize=1` and reads only `totalCount`. **`pageSize=100`
is the same single call** and returns `isSpam` per row plus the collection names. Population median
collection count is 74, so more than half of all wallets get an exact spam corrected count from one
call; above that the sampled spam rate is applied to the total and the result is marked as estimated.

**D2 — we were throwing away 99 rows of a call we already paid for.** v1 fetches the descending
transaction page with `offset=1` purely for the last timestamp. `offset=100` is the same single call.
Confirmed present in the response (`scratchpad/fields_probe.cjs`):

```
isError, methodId, functionName, value, gasUsed, gasPrice, from, to, timeStamp
```

That is recent transaction rate (not the lifetime average), failed transaction share, trade/mint method
mix, largest single transfer, gas burned, and the inbound to outbound ratio. These are exactly the
signals that separate DEGEN from GHOST, and they were already on the wire.

**D3 — WHALE was measuring which wallet you browse with.** Population median ETH balance is **0.008
ETH**. Balance alone is a browsing habit, not wealth. Fixed with one extra call: ERC-20 balances over a
fixed list of majors and stables.

⛔ **Killed before building:** "holds a collection they deployed themselves" as a BUILDER widener.
Measured 1 occurrence in 1,693 sampled collections. Not a signal.

⚠️ **Deliberately not built:** a hold-versus-flip ratio for COLLECTOR. Normal transaction lists do not
contain ERC-721 transfers, so it needs another Etherscan endpoint and another call per visitor. The
weight is redistributed instead of faking the signal.

### Four more found while building, all by smoke testing three addresses before the 635 run

**D4 — silent data corruption, the worst of the set.** `alchemy_getTokenBalances` returns the balances
**sorted by contract address, not in the order requested**. Read positionally, every wallet had the
wrong decimals applied to the wrong token: 5,778 DAI came back as 5.78e15 "USDC" and would have owned
the WHALE percentile outright. Mapped by `contractAddress` now. The test address went from 3.07e12 to
21.23 ETH.

**D5 — a signal that was a guess, measured and deleted.** A function-name regex for "trading" was
written for DEGEN. Pranksy's last 100 transactions matched it **4 times out of 66 outbound**, because
a heavy trader's normal transaction list is transfer, approve and setApprovalForAll while the real
marketplace fills arrive as internal transactions. Replaced with **gas burned**, which comes free from
the same rows, has no vocabulary to guess at, and describes a Degen better anyway: not how often you
move, but how much you have set on fire.

**D6 — the tie mass at zero.** Measured across busy wallets: most have **zero** reverted transactions
in their last 100, and 624 of 635 have never deployed. A plain "share of values at or below mine"
percentile hands every tied wallet the entire block of ties, so having done nothing scored as having
beaten everyone else who also did nothing. Midpoint percentile now.

**D7 — the ceiling clamp destroyed the ordering for the wallets most likely to be shared.**
Calibrating with `min(1, raw/p99)` returned pranksy as COLLECTOR, OG and WHALE all at a flat 1.000
with a dominant picked arbitrarily between three ties. Ranking runs on the uncapped ratio; only the
displayed bar is capped. Same wallet now resolves WHALE 102, COLLECTOR 101, OG 100.

⚠️ Two smaller ones: `toLocaleString()` used this machine's Turkish locale and rendered 1757 days as
"1.757 days old", pinned to `en-US`; and `idleDays` read the last row rather than the last **outbound**
row, so an airdrop made a dormant wallet look awake, which is exactly the wallet GHOST exists to find.

---

## 5. The seven axes

All inputs are percentiles against the population unless marked. `NEW` = free from a call already made.

```
OG          0.55 age  +  0.20 first transaction era NEW  +  0.25 still here
NEWBIE      0.60 (1 - age)  +  0.40 (1 - lifetime transactions)
DEGEN       0.40 recent rate NEW  +  0.20 failed share NEW  +  0.20 gas burned NEW
            +  0.20 lifetime transactions
BUILDER     0.50 deploys  +  0.30 early deploy  +  0.20 smart account          (stays rare)
WHALE       0.30 ETH balance (deliberately weak, and the card says so)
            +  0.30 ERC-20 value +1 call  +  0.20 largest single transfer NEW  +  0.20 pieces
COLLECTOR   0.50 collections spam corrected  +  0.30 pieces  +  0.20 breadth
GHOST       0.35 idle days  +  0.30 quiet relative to holdings  +  0.20 inbound ratio NEW
            +  0.15 no outbound history at all
```

Each axis also emits one **fact**, a plain sentence with a number in it, which is what the card shows
next to the bar:

```
OG          first move: 14 March 2019
NEWBIE      your chain is 87 days old
DEGEN       41 transactions reverted. you paid for nothing 41 times.
BUILDER     you have deployed 3 contracts
WHALE       largest single move: 41.2 ETH
COLLECTOR   94 collections, 312 pieces
GHOST       last move 412 days ago
```

---

## 5b. The measured result, 635 wallets, 777 seconds, 1,270 Etherscan calls

```
NEWBIE     158   %24.9        margin    p10 0.015   median 0.098   p90 0.298
GHOST      140   %22.0        spread    min 2.03    median 4.06    max 5.69
COLLECTOR  108   %17.0        rarity    634 of 635 distinct at 0.1%
DEGEN       93   %14.6
OG          66   %10.4
WHALE       60   % 9.4
BUILDER     10   % 1.6
```

The assignment is reading the data, not the formulas. Median raw signals of each winning group,
against a population median of age 1,503 days, 541 transactions, 135 pieces, 52 collections, 10 idle
days, 140 transactions per year, 0.010 ETH:

```
NEWBIE      age 609    83 txs      17 pieces     7 collections
COLLECTOR   713 pieces, 263 collections
DEGEN       744 transactions per year against a population median of 140
OG          age 1,990, the oldest group
WHALE       0.63 ETH against a population median of 0.010, sixty three times
GHOST       272 idle days against a population median of 10, and the lowest rate in the set
```

⚠️ **The BUILDER bar will be at zero for 98% of visitors** (top-two share 1.9%, calibrated median
0.00). On a seven bar card a permanently empty bar reads as a broken page. It needs a deliberate line
next to it rather than silence, something like *almost nobody deploys, which is what makes it rare*.

⚠️ **The live distribution will not match this table and that is expected.** This population is a
holder snapshot; site visitors are by definition awake at the moment they arrive, so GHOST will fall
and DEGEN will rise. Do not read a difference as a regression.

⚠️ **The baseline is frozen on purpose.** Scoring against a moving population would change a visitor's
own numbers between two readings of the same wallet, which is the one thing a deterministic engine
must never do. A live visitor counter is a separate number from the scoring population.

## 6. Cost and the throughput ceiling

Per visitor: **3 RPC + 2 Etherscan + 3 Alchemy**. One more call than v1, and it repairs three axes.

⚠️ Etherscan's free tier is 5 calls per second. Two calls per visitor puts the sustained ceiling at
about **2.5 visitors per second**. We want to write the "the site nearly went down" post without the
site actually going down, so the address keyed cache is part of the design and not an optimisation:
a repeated address costs zero calls. Results are cached permanently and refreshed on demand.

---

## 7. What the page must teach, and the honest argument

The strongest reason the mint does not use this data is not gas. It is game theory.

1. The contract cannot see your history. Every input on this page is off chain (Etherscan, Alchemy,
   archive RPC). Putting them on chain needs a per minter oracle attestation.
2. **A facet you can compute is a facet you can farm.** Send yourself ETH to become a Whale, spam
   transactions to become a Degen. The rare faces would go to whoever spent the most.
3. Measured: on a real holder population the data distribution is %20.5 Newbie against %1.3 Builder.
   A data assigned collection of 6,969 would contain roughly 90 Builders, and its rarity curve would
   be set by an accident of who bought rather than by design.
4. Which is why it is VRF: *the chain hands you a face you did not choose.*

## 8. Free versus signed

- **Free, no signature, any address, ENS accepted.** You can read anyone. Reading vitalik.eth and
  sharing it is the same viral loop accworth got from reading CZ.
- **Signed** unlocks the deep report and registers the GTD spot, and puts a verified mark on the card
  that an unsigned card does not carry, so signing is something the visitor wants rather than
  something we demand.

⚠️ Open, gruff's call: X was in the design as the sybil gate, not the identity gate, because the
allowlist is a list of addresses. A minimum history rule (age and transaction count, both already
measured here) is a cheaper sybil gate and would take X OAuth off the critical path. It does not stop
someone with fifty aged wallets, but combined with a small cap it may be enough.
