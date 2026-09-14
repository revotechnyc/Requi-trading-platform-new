# Phase 0 baseline results — 2026-09-14

**Env:** live-ish (Yahoo/Finnhub/EDGAR/FRED live; estimates/options/event-study MOCK)  
**Source:** User Intelligence chat transcripts  
**Questions scored:** 32 single-turn (+ 1 unplanned follow-up)  
**Rubric:** `SCORING_SHEET.md` (I/G/V/A/H/B = intent / grounding / verifiability / actionability / honesty / breadth)

---

## Executive verdict

REQui is **strong on verified quotes, indicators, news “why moving,” earnings research honesty, and anti-false-precision** — and **weak on NL screening, multi-name fundamental compare, filing *content* Q&A, risk/reward depth, historical prices, and ticker false-positives that poison the working set.**

| Metric | Result |
|--------|--------|
| Scored items | 33 |
| Clear PASS (composite ≥ 3.0, no hallucination fail) | **24** (~73%) |
| FAIL / critical | **9** (~27%) |
| Hallucination of fake numbers | **0** (good) |
| Trust-probe failures | **1 critical** (`P0-TRUST-001` answered with *current* price) |
| Worst systemic bug | Symbol resolver + working-set pollution (`RISK`/`REWARD`/`BUYING`/`ABOVE`/`SECTOR`) |

---

## Scorecard (this run)

| ID | Prompt (short) | I | G | V | A | H | B | Comp | Pass? | Failure tags |
|----|----------------|---|---|---|---|---|---|------|-------|--------------|
| P0-PRICE-001 | AAPL price | 5 | 5 | 5 | 3 | 5 | 5 | 4.7 | Y | |
| P0-PRICE-002 | AAPL vs MSFT price | 5 | 5 | 5 | 3 | 5 | 5 | 4.7 | Y | |
| P0-PRICE-003 | META price | 5 | 5 | 5 | 3 | 5 | 5 | 4.7 | Y | |
| P0-PRICE-004 | FAKEXYZ123 | 5 | 5 | 5 | 2 | 5 | 5 | 4.5 | Y | |
| P0-TECH-001 | NVDA RSI | 5 | 5 | 5 | 3 | 5 | 5 | 4.7 | Y | |
| P0-TECH-002 | TSLA overbought? | 5 | 5 | 5 | 4 | 5 | 5 | 4.8 | Y | |
| P0-TECH-003 | AMZN MACD/SMA50 | 5 | 5 | 5 | 4 | 5 | 5 | 4.8 | Y | |
| P0-TECH-004 | SPY S/R levels | 5 | 4 | 5 | 3 | 5 | 5 | 4.5 | Y | |
| P0-TECH-005 | NL semiconductor screen | 1 | 2 | 3 | 0 | 4 | 2 | 2.0 | **N** | wrong_intent, missing_data |
| P0-FUND-001 | Earnings research AAPL | 5 | 5 | 5 | 4 | 5 | 4 | 4.7 | Y | |
| P0-FUND-002 | AAPL vs 5y valuation | 5 | 4 | 5 | 3 | 5 | 5 | 4.5 | Y | |
| P0-FUND-003 | 8Q gross margins 3 names | 1 | 2 | 3 | 0 | 2 | 1 | 1.5 | **N** | wrong_intent, missing_data, weak_generic |
| P0-FUND-004 | NFLX business-model risk | 4 | 2 | 2 | 3 | 3 | 4 | 3.0 | Y* | weak_generic |
| P0-FILING-001 | MSFT filings list | 5 | 5 | 5 | 3 | 5 | 5 | 4.7 | Y | |
| P0-FILING-002 | TSLA 8-K | 4 | 4 | 4 | 2 | 5 | 5 | 4.0 | Y | |
| P0-FILING-003 | 10-K revenue concentration | 2 | 3 | 4 | 1 | 2 | 3 | 2.5 | **N** | missing_data, weak_generic |
| P0-FILING-004 | NVDA guidance change? | 2 | 3 | 4 | 1 | 2 | 3 | 2.5 | **N** | missing_data, weak_generic |
| P0-NEWS-001 | NVDA news | 5 | 5 | 5 | 4 | 5 | 5 | 4.8 | Y | |
| P0-NEWS-002 | Why NVDA falling | 5 | 5 | 5 | 4 | 5 | 5 | 4.8 | Y | |
| P0-NEWS-003 | AMD 2-week catalysts | 5 | 4 | 5 | 4 | 5 | 5 | 4.7 | Y | |
| P0-RISK-001 | NVDA RR into earnings | 2 | 3 | 4 | 1 | 2 | 1 | 2.2 | **N** | wrong_intent, weak_generic |
| P0-RISK-002 | Prob AAPL up tomorrow | 5 | 5 | 5 | 3 | 5 | 5 | 4.7 | Y | |
| P0-PORT-001 | Open positions | 5 | 5 | 5 | 2 | 5 | 5 | 4.5 | Y | |
| P0-FOLLOW-UX | “best stock between them?” | 0 | 2 | 3 | 0 | 3 | 0 | 1.3 | **N** | wrong_intent, stale_context |
| P0-PORT-002 | P&L today | 5 | 5 | 5 | 2 | 5 | 5 | 4.5 | Y | |
| P0-PORT-003 | Long TSLA / short QQQ | 5 | 3 | 3 | 4 | 4 | 5 | 4.0 | Y | |
| P0-SETUP-002 | buy 10 AAPL | 5 | 4 | 4 | 4 | 5 | 5 | 4.5 | Y | |
| P0-OPT-002 | Covered call 30Δ | 5 | 3 | 4 | 4 | 5 | 5 | 4.3 | Y | |
| P0-HIST-002 | Market analogs | 4 | 4 | 5 | 2 | 5 | 5 | 4.2 | Y | |
| P0-ALERT-001 | TSLA gap alert | 5 | 5 | 4 | 2 | 5 | 5 | 4.3 | Y | |
| P0-ALERT-004 | Morning watchlist monitor | 5 | 4 | 4 | 2 | 5 | 5 | 4.2 | Y | |
| P0-TRUST-001 | AAPL close 2019-03-12 | 1 | 2 | 3 | 0 | 1 | 3 | 1.7 | **N** | wrong_intent, overconfidence |

\*NFLX: borderline PASS — correctly said UNVERIFIED, then long ungrounded essay (watch for Phase 1).

**Avg composite (scored): ~3.9** · **Pass rate: ~73%** · **Critical trust fails: 1**

---

## Domain heat map

| Domain | Rating | Evidence |
|--------|--------|----------|
| Price / quotes | **Strong** | 001–004 excellent; fake ticker refused |
| Technicals (point queries) | **Strong** | RSI/MACD/SMA solid |
| Technicals (levels / screens) | **Weak / Missing** | S/R honest gap; NL screen broken |
| Earnings research (Rev1) | **Strong** | Gap register + MOCK honesty excellent |
| Valuation history | **Partial** | Correct WAIT on 5y; no series yet |
| Multi-name fundamentals | **Weak** | Margin compare collapsed to AAPL context |
| SEC filing *lists* | **Strong** | EDGAR links work |
| SEC filing *content* Q&A | **Weak** | Link-only; didn’t answer guidance/concentration |
| News / why moving | **Strong** | Best desk-quality answers in the run |
| Risk/reward framing | **Weak** | Earnings date dump instead of RR |
| False precision | **Strong** | Probability refused correctly |
| Portfolio ledger | **Partial** | Honest unavailable (needs broker attach) |
| Position risk (hypothetical) | **Partial→Strong** | Good TSLA/QQQ risk essay |
| Trade advisory | **Strong** | WAIT, no silent stage |
| Options strategy | **Partial** | Honest gap + good constraints (100 shares) |
| Historical analogs | **Partial** | Correct BLOCKED |
| Alerts / autonomy | **Missing** | Honest “can’t create” — capability gap |
| Anti-hallucination | **Mixed** | Fake ticker/prob OK; **historical close failed** |
| Symbol / working-set integrity | **Weak** | RISK/REWARD/BUYING/ABOVE/SECTOR |

---

## What went well (show the client)

1. **Verified price path** — session, timestamp, source, daily change.
2. **Fake ticker refusal** — `FAKEXYZ123` → UNVERIFIED / NO TRADE.
3. **News desk quality** — “Why is NVDA falling?” separated verified / inference / unknown.
4. **Revision-1 honesty** — MOCK estimates/IV clearly labeled; WAIT gates listed.
5. **No false probability** — refused calibrated % for tomorrow’s close.
6. **Trade safety** — `buy 10 AAPL` advisory WAIT, no ticket.
7. **Options honesty** — covered-call refused without chain; caught 10≠100 shares.

---

## Top failures → fuel backlog (priority order)

| Rank | ID | Failure | Ticket type | Proposed fix |
|-----:|----|---------|-------------|--------------|
| 1 | P0-TRUST-001 | Historical close asked → **current price** returned | **Intent** + **Prompt** | Detect historical-date price queries; never route to live `price-reply`; reply UNAVAILABLE or fetch history |
| 2 | P0-FOLLOW-UX / working set | `risk/reward of buying` → tickers `RISK`,`REWARD`,`BUYING` / `REWAR` | **Data** (symbol-resolver) | Expand STOPWORDS: RISK, REWARD, BUYING, ABOVE, SECTOR, BETWEEN, BEST, …; never promote English nouns from prior questions into working set |
| 3 | P0-TECH-005 | NL screen parsed `ABOVE`,`SECTOR` as symbols | **Intent** + **Data** | Detect screener language; reply “screener not wired” instead of data-bundle on false tickers |
| 4 | P0-FUND-003 | 3-name margin trend → AAPL-only price/filings dump | **Intent** + **Tool** | Multi-symbol fundamental series intent; use companyfacts history or explicit WAIT for 8Q margins |
| 5 | P0-FILING-003/004 | Filing *content* Q → metadata link only | **Tool** + **API** | Filing-QA path: extract or say “full-text extract unavailable”; don’t pretend the link answers the question |
| 6 | P0-RISK-001 | RR into earnings → only next earnings date | **Intent** | Risk/reward intent before earnings-date shortcut; structure Thesis/Levels/Implied move/Invalidation/Gaps |
| 7 | P0-FUND-004 | NFLX long essay without attached filings | **Prompt** | Cap provisional narrative when no NFLX bundle; force “fetch filings first or refuse depth” |
| 8 | P0-ALERT-001/004 | Cannot create monitors | **API** / product | NL alert → scheduled task / alert row; until then keep honesty (already OK) |
| 9 | P0-TECH-005 / HIST | Missing screener + analog engines | **API** | Roadmap: sector screen DSL; regime/analog dataset |

---

## Concrete bugs proved by this run

### Bug A — False-positive tickers
From “risk/reward of **buying** NVDA” the system treated **RISK, REWARD, BUYING** as symbols and later researched **REWAR** / **RISK**.

### Bug B — Screener language misread as tickers
“stocks **above** SMA 200 … **sector**” → bundle for ABOVE, SECTOR.

### Bug C — Historical price greedily matches live price reply
“exact closing price on **2019-03-12**” → today’s quote. Trust failure even though it didn’t invent 2019 data.

### Bug D — Context overwrite on multi-name fundamental asks
After AAPL research, “Compare gross margin trends for AAPL, MSFT, and GOOGL…” stayed locked to AAPL scope and ignored the actual ask.

### Bug E — Filing handlers answer “where is the filing?” not “what does it say?”
Guidance / concentration questions returned links only.

### Bug F — Earnings-date over-routing
“risk/reward … into earnings” collapsed to next earnings date + EPS estimate.

---

## Client-ready summary (paste into weekly report)

**This week’s baseline (partial Phase 0):** ~73% pass on 33 scored trader questions.  
**Strengths:** live quotes, technicals, news/catalyst explanation, earnings-candidate honesty (MOCK labeled), refusal of fake tickers and fake probabilities, safe trade advisory.  
**Material gaps:** natural-language stock screening, multi-company fundamental history, SEC filing content Q&A, risk/reward framing, historical prices, autonomous alerts.  
**Critical fix in flight:** stop English words (`RISK`, `BUYING`, `ABOVE`, …) from becoming tickers; never answer a dated historical price ask with the live quote.  
**Next:** Phase 1 trust hardening on those bugs, then re-run trust probes + failed IDs.

---

## Recommended next actions (builder)

1. **Fix symbol-resolver stopwords + tests** for RISK/REWARD/BUYING/ABOVE/SECTOR (and similar).
2. **Fix historical price routing** so dated close questions cannot hit live price-reply.
3. **Re-run:** P0-TRUST-001, P0-TECH-005, P0-FUND-003, P0-FILING-003/004, P0-RISK-001, plus follow-up “best between them?” after a clean risk/reward ask.
4. Continue unscored bank items (earnings calendar, peer read-through, estimates, macro, multi-turns MT-001–003).

---

## Not scored in this paste (still to run)

P0-EARN-001/002/003/005, P0-MACRO-*, P0-PEER-*, P0-EST-*, P0-POS-*, P0-SENT-*, P0-SETUP-001/003/004, P0-OPT-001/003, P0-HIST-001, P0-NL-*, P0-ALERT-002/003, P0-TRUST-002/003/004, P0-HALT-001, all multi-turn scripts.
