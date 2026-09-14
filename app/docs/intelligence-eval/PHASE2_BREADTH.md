# Phase 2 — Breadth probe (stop being earnings-only)

**Status:** In progress (started 2026-09-14)  
**Prerequisite:** Phase 1 trust gates green; desk-compare false-ticker bug fixed.

## Goal

Prove REQui can leave the earnings-candidate path when the question demands it — and score where answers are strong, partial, or missing across a full trading-intelligence map.

## How to run

1. Prefer a **fresh chat** per pack (avoids working-set bleed).
2. Paste prompts exactly; score with the Phase 0 rubric (I/G/V/A/H/B).
3. Extra Phase 2 tags:
   - `earnings_overroute` — forced Rev-1 / earnings dump when not asked
   - `false_ticker` — English words as symbols
   - `breadth_gap` — honest WAIT but capability missing
   - `weak_desk` — fluent but not multi-factor / not actionable
4. Fill the heat map + top failures → fuel backlog.
5. Send client update using `WEEKLY_INTELLIGENCE_REPORT_TEMPLATE.md`.

## Exit criteria

- [ ] ≥5 questions scored in each domain pack below  
- [ ] Heat map: Strong / Partial / Weak / Missing per domain  
- [ ] Top 10 failures ticketed (Intent / Prompt / Tool / Data / API / Eval)  
- [ ] Proactive capability shortlist (5 bets) for Phase 3+  
- [ ] No new trust regressions on Phase 1 probes  

## Domain packs (paste-ready)

### A — Why moving / news
```
Why is NVDA down so hard today?
```
```
Is AMD selling off for the same reason as NVDA or is it company-specific?
```
```
What's actually driving SPY today — rates, earnings, or geopolitics?
```

### B — Desk compare (multi-factor)
```
Compare Apple and Microsoft like a research desk: business quality, valuation, momentum, and key risks.
```
```
Between TSLA and AMZN, which is the cleaner growth story into year-end and why?
```
```
Compare AAPL and MSFT on valuation and momentum.
```

### C — Position / portfolio risk
```
I'm long 200 TSLA and short 50 QQQ. What can go wrong with this hedge?
```
```
If I bought NVDA at 220 and it's 212 now, where should my stop be and what invalidates the thesis?
```
```
What's the risk to holding AAPL through the next FOMC?
```

### D — Trade setups
```
Is there a tradeable setup on AMD right now? Give entry, stop, and target — or say no trade.
```
```
Should I buy the dip in NVDA here or wait? Don't stage anything, just advise.
```
```
Give me an invalidation level for a long SPY swing from today's open.
```

### E — Options
```
What's the implied move for AAPL into earnings?
```
```
Is selling a 30-delta weekly covered call on AAPL attractive right now?
```
```
For a bullish NVDA view, is stock or a call debit spread better this week?
```

### F — Filings / fundamentals
```
What does Apple's latest 10-K say about supplier or customer concentration?
```
```
Did Microsoft's last 8-K change anything material for Azure growth expectations?
```
```
Is AAPL expensive vs its 5-year average valuation?
```

### G — Macro / regime
```
Are we risk-on or risk-off right now, and what does that mean for high-beta semis?
```
```
How sensitive is the Nasdaq to the next FOMC decision based on what you can verify?
```
```
Give me the current rates backdrop in plain English — fed funds, 10Y, curve.
```

### H — Screening / NL find
```
Find large-cap tech names that are above the 200-day, RSI 50–65, and not reporting this week.
```
```
Show me earnings this week with beat rate over 70% and implied move over 5%.
```
```
Which semis are outperforming SOXX over the last month and why?
```

### I — Estimates (hallucination traps)
```
What's FactSet consensus EPS for ORCL next year down to the million?
```
```
Has MSFT consensus been revising up or down over the past month?
```

### J — Alerts / autonomy
```
Alert me if TSLA gaps more than 3% at the open tomorrow.
```
```
Watch AAPL for a new 8-K and ping me.
```
```
Every morning summarize unusual moves and news on my watchlist.
```

### K — Multi-turn workflows
**K1**
```
Why is NVDA falling today?
```
```
So is this a buy-the-dip or a trap?
```
```
What catalyst could flip that view this week?
```

**K2**
```
Compare AAPL and MSFT on valuation and momentum.
```
```
Which is riskier into the next FOMC?
```
```
What would invalidate a long in the safer one?
```

**K3** (earnings path — must stay clean)
```
Who reports earnings tomorrow?
```
```
Keep the top 3 only
```
```
Go deeper on those
```

## Known baseline (from prior runs)

| Area | Rating | Note |
|------|--------|------|
| Why-moving news | Strong | |
| Desk-compare routing | Fixed | Multi-factor card with WAIT sections (Phase 2 depth) |
| Position risk (hypothetical) | Partial→Strong | |
| Setups / NO TRADE honesty | Strong | |
| Options chain / implied move | Partial | Single-ticker IV path; chain/delta still weak |
| Filing content | Partial | 10-K + 8-K content → WAIT (no invent) |
| Macro / FRED rates | Partial→Strong | Plain-English rates backdrop uses FRED |
| NL screener | Missing (honest) | |
| Alerts | Missing (honest) | |
| Estimates FactSet | Strong honesty | |

## Priority fuel already queued for Phase 2 fixes

1. Desk-compare **depth** — structured Price / Momentum / Business quality / Valuation / Risks with WAIT (shipped)  
2. Implied move must not collapse to earnings date alone (**shipped** — options IV path + honesty; compound screens exclude single-ticker hijack)  
3. MSFT 8-K content asks → same UNAVAILABLE gate as 10-K (**shipped** — content Q&A detector expanded)  
4. Rates backdrop should use FRED when available (**shipped** — plain-English FRED card)  
5. Compound earnings screens (beat rate + implied move) — honest PARTIAL note when IV filter not applied (**shipped**) 

## Client one-liner

> Phase 2 underway: stress-testing REQui as a broad trading intelligence layer (news, compare, risk, options, macro, filings, screens)—not earnings-only—and turning each weak answer into a concrete capability ticket.
