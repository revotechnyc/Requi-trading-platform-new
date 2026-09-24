# Real-life context challenge scripts

Manual QA for **conversation scope** (`sessionState`, `displayScope`, referential routing).  
Use **one `conversationId` per script**. Keep `CONVERSATION_CONTEXT` enabled. Restart API after code changes.

**Pass =** correct symbol count, correct tickers, no prose-as-ticker (ENDS/EVERY/QUANT), context line matches scope.  
**Fail =** wrong universe, full calendar when narrowed, reruns on wrong N, or fresh scan hijacked by stale scope.

---

## Script A — Desk day, post-close wedge (6 turns)

Real desk: morning calendar → session filter → research → trim → compare.

| # | Say this | Pass if |
|---|----------|---------|
| 1 | Who’s reporting quarterly results on the next NYSE session? | Day board (not one random ticker) |
| 2 | Restrict to reporters once regular trading has finished. | Smaller table; AMC/post-close only |
| 3 | Run the earnings-candidate protocol on each symbol you’re still holding. | Rev-1 on **that slice only** (not 8+ names, not ENDS/EVERY) |
| 4 | Cut the lowest partial-score name from that lineup. | Selection/reply; active set **minus 1** |
| 5 | Put the remaining two through the same protocol again. | Rev-1 on **exactly 2** |
| 6 | Which of the two has the cleaner EPS beat history? | Short answer or **1** name — not full board |

---

## Script B — Interrupt with macro, return to list (5 turns)

Real user: checks market, then continues prior work.

| # | Say this | Pass if |
|---|----------|---------|
| 1 | Show me the full US earnings slate for this week. | Range/board reply |
| 2 | Filter to Wednesday before the opening bell. | BMO-only subset |
| 3 | How are large-cap indexes behaving right now? | General-market card (SPY/QQQ path), **not** earnings rewrite |
| 4 | Go back to the Wednesday pre-open list we had. | Same BMO names restored — not empty, not full week |
| 5 | Quant screen only the first two on that list. | Rev-1 / rewrite on **2** symbols from restored scope |

---

## Script C — Single-name fundamentals thread (5 turns)

Real analyst: one company, pronouns — **not** earnings calendar.

| # | Say this | Pass if |
|---|----------|---------|
| 1 | Break down Amazon’s revenue trajectory from filings. | **AMZN** scoped (data or gap honesty — not day board) |
| 2 | How fat are its operating margins? | Still **AMZN**; no new ticker harvest from “its” |
| 3 | Stack that up against the prior fiscal year. | Compare/desk on **AMZN** — context note names NVDA/AMZN only |
| 4 | Run a quant pass on those margin shifts. | Does **not** jump to unrelated earnings list; stays **AMZN** |
| 5 | What’s the next confirmed report date for it? | Single-ticker earnings date — **not** today’s 8-name calendar |

---

## Script D — Discovery vs movers (4 turns)

Real beginner: buy scan, then rank questions — must **not** mix with earnings scope.

| # | Say this | Pass if |
|---|----------|---------|
| 1 | I have $2k — what’s one simple idea for today? | Stock-discovery ranked list |
| 2 | Why did your #1 pick land on top? | Explain **discovery #1** — not earnings AMC set |
| 3 | Which of those ideas looks riskiest? | Risk answer from **discovery** pool |
| 4 | What’s moving in the market today? | **Movers** scan — does not replace discovery group with earnings tickers |

---

## Script E — Head-to-head from chat (4 turns)

Real PM: names two tickers, then narrows by history.

| # | Say this | Pass if |
|---|----------|---------|
| 1 | Compare Intel and AMD like a research desk. | Desk compare **INTC + AMD** — not Rev-1 earnings |
| 2 | Run earnings-candidate research on both. | Rev-1 on **2** only |
| 3 | Keep only the one with the stronger beat streak. | Active scope **1** symbol |
| 4 | Go deeper on that survivor. | Rev-1 on **1** — not both again |

---

## Script F — Cold ask vs scoped follow-up (3 turns)

Regression for prose tokens and explicit names.

| # | Say this | Pass if |
|---|----------|---------|
| 1 | When does Starbucks report next? | **SBUX** single path — **not** today’s full calendar |
| 2 | (New chat) List today’s confirmed earnings. | Full calendar OK |
| 3 | Post-market reporters only. | 3-ish AMC names; scope narrowed |

---

## Script G — Ranked universe math (5 turns)

From a large prior screen (simulates discovery/scan output).

| # | Say this | Pass if |
|---|----------|---------|
| 1 | *(Use Console chip: standard market opportunities scan.)* | Ranked list in session |
| 2 | Keep only the three weakest from that scan. | Select **3** worst — active updated |
| 3 | Research those three. | Rev-1 on **those 3** symbols |
| 4 | Drop the middle one by score. | Remove/select; **2** left |
| 5 | Rank what’s left strongest to weakest. | Rank reply from **prior scores** — not full Rev-1 rerun |

---

## Script H — Typos and casual phrasing (4 turns)

| # | Say this | Pass if |
|---|----------|---------|
| 1 | er today pls | Today earnings board |
| 2 | ah only thx | AMC/post-close subset |
| 3 | dig into em | Rev-1 on AMC scope — not literal ticker EM |
| 4 | which one looks junkiest on score | Cached/weakest **one** from scope — not 8-name rerun |

---

## Automated planner coverage

Vitest mirrors a subset of these in  
`app/api/intelligence/conversation-context.test.ts` → **`real-life context challenges (planner)`**.

Run:

```bash
cd app && npx vitest run api/intelligence/conversation-context.test.ts -t "real-life context"
```

---

## Sign-off checklist (any script)

- [ ] Context footer matches symbol count and names  
- [ ] No `(ENDS, EVERY, STILL)` or `(QUANT)` in context line  
- [ ] After narrow/filter, follow-ups never revert to full calendar unless user asks  
- [ ] Market/discovery/movers asks passthrough without earnings rewrite  
- [ ] Single-company asks (Starbucks, Apple, Amazon) do not open day board  
