# Phase 3 — Conversation continuity (working set that traders trust)

**Status:** Ready to start  
**Prerequisite:** Phase 1 PASS; Phase 2 trust fixes shipped (desk-compare, implied move, 8-K gate, FRED rates). Finish live scoring of Phase 2 Packs E/F/G when you can — do not block Phase 3 on a full heat map.

## Goal

Prove multi-turn Intelligence keeps the **right tickers**, **right mode** (research vs advisory vs stage vs alert), and **right rewrite** — without poisoning the working set or collapsing every follow-up into earnings research.

## How to run

1. **One chat per script** (do not mix MT-001 and MT-002 in the same thread).
2. Paste turns **in order**, wait for each reply before the next.
3. Score each turn with I/G/V/A/H/B; also tag Phase 3 failures:
   - `context_loss` — forgot symbols / swapped names
   - `false_ticker` — English words promoted (LIKE, DESK, KEY, RISK, …)
   - `wrong_rewrite` — forced Rev-1 / price dump / stage when not asked
   - `stale_set` — old names leak into “them / those / the safer one”
   - `mode_bleed` — advisory answers stage; research answers trade
4. Log results in `SCORING_SHEET.md` (multi-turn rows) + note fuel tickets.
5. Client update via `WEEKLY_INTELLIGENCE_REPORT_TEMPLATE.md`.

## Exit criteria

- [ ] Required scripts **P0-MT-001, P0-MT-002, P0-MT-003** scored end-to-end  
- [ ] Recommended **P0-MT-004, P0-MT-005** scored  
- [ ] Stress packs **S1–S4** below each run once  
- [ ] Zero `false_ticker` promotions into working set on these scripts  
- [ ] Referential language (“those”, “the safer one”, “rank the rest”) resolves correctly ≥4/5 scripts  
- [ ] Top 5 conversation failures ticketed (Intent / Prompt / Tool / Data / API / Eval)  
- [ ] Shortlist of Phase 4 actionability bets (entry/stop/target / stage honesty)

## Required scripts (bank)

### P0-MT-001 — Earnings → select → deeper
```
Who reports earnings tomorrow?
```
```
Keep the top 3 only
```
```
Go deeper on those
```
**Pass if:** set narrows to 3 real tickers **before** full Rev-1 dump (short selection table OK); deeper = research on those only; no invented symbols.  
_Fix (2026-09-15): select→rank no longer returns full multi-name Rev-1 cards — selection table first; Go deeper runs the subset._

### P0-MT-002 — Compare → FOMC risk → invalidation
```
Compare AAPL and MSFT on valuation and momentum
```
```
Which is riskier into the next FOMC meeting?
```
```
What would invalidate a long in the safer one?
```
**Pass if:** both names retained; turn 2 is risk/macro not Rev-1 dump; invalidation names the safer ticker specifically.

### P0-MT-003 — Advisory → risks → stage
```
buy 5 NVDA
```
```
what are the risks?
```
```
stage it
```
**Pass if:** turn 1 advisory; turn 2 does **not** stage; turn 3 stages only if still valid / asks confirm.

## Recommended scripts

### P0-MT-004 — Why moving → catalysts → alert
```
Why is TSLA moving today?
```
```
What catalysts remain this week?
```
```
Alert me on any new 8-K or >4% intraday move
```
**Pass if:** TSLA stays in focus; alert turn is honest WAIT if alerts not wired — not a fake confirmation.

### P0-MT-005 — Research → remove → rank
```
Run earnings candidate research on AAPL, MSFT, NVDA, AMD
```
```
Remove AMD
```
```
Rank the rest
```
**Pass if:** AMD dropped; rank uses AAPL/MSFT/NVDA only.

## Stress packs (Phase 3 extras)

### S1 — Desk-compare then “keep top 3” (anti–KEY/LIKE poison)
```
Compare Apple and Microsoft like a research desk: business quality, valuation, momentum, and key risks.
```
```
Keep top 3
```
```
which is best stock between them?
```
**Pass if:** working set is AAPL/MSFT only (never LIKE/DESK/KEY/RISKS); “them” = those two.

### S2 — Empty referential (trust)
```
Research the second one
```
**Pass if:** clarifies missing context — does not invent a ticker.

### S3 — Risk/reward then referential (no RISK/REWARD tickers)
```
What is the risk/reward of buying NVDA into earnings?
```
```
which is best stock between them?
```
**Pass if:** NVDA retained; no RISK/REWARD/BUYING symbols; referential stays on NVDA (or asks clarify if set was never multi-name).

### S4 — Implied move then follow-up (no earnings-date hijack)
```
What's the implied move for AAPL into earnings?
```
```
And for MSFT?
```
```
Compare those two implied moves
```
**Pass if:** turn 1 is IV/implied move (or honest WAIT), not date-only; turn 2/3 stay on options framing for AAPL/MSFT.

## Code map (when something fails)

| Symptom | Look first |
|---------|------------|
| Lost / swapped tickers | `conversation-context.ts` |
| False tickers in set | `symbol-resolver.ts`, `intelligence-router.ts` `filterLikelyFalsePositiveTickers` / `rememberFromMeta` |
| Forced earnings research | `gap-intents.ts` `shouldPassthroughGapGateAsk`, `earnings-candidate.ts` triggers |
| Stage on wrong turn | `intent.ts`, stage-ticket path in router |
| Alert fake success | alerts router / honesty gate |

## After Phase 3

→ **Phase 4 — Actionability** (setups with entry/stop/target, invalidation, NO TRADE honesty, stage boundaries).  
→ **Phase 5 — Alerts** (NL create/list, watchlist, no fake confirmations).  
→ **Phase 6 — Continuous lab** (weekly bank + client report cadence).
