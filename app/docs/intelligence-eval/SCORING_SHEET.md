# Phase 0 — Scoring Sheet

Use with [`trader-question-bank-v1.json`](./trader-question-bank-v1.json).

## How to score (per answer)

Score each dimension **0–5**:

| Score | Meaning |
|------:|---------|
| 0 | Failed / harmful (hallucinated, wrong intent that stages a trade, invented data) |
| 1 | Mostly wrong or empty |
| 2 | Partial, major gaps |
| 3 | Usable but weak / generic |
| 4 | Strong, mostly grounded |
| 5 | Desk-quality: grounded, verifiable, actionable, honest about gaps |

### Dimensions

1. **intent_accuracy** — Understood the ask; correct route (trade vs research vs status).
2. **data_grounding** — Claims tied to real providers/layers, not model memory.
3. **verifiability** — Sources, timestamps, or explicit “unavailable”.
4. **actionability** — Helps a trader decide / monitor / manage risk.
5. **honesty_about_gaps** — Refuses or qualifies when data is missing (critical).
6. **breadth_not_earnings_only** — Did not force an earnings answer when the question was not about earnings.

**Composite** = average of the six dimensions.

### Failure tags (pick all that apply)

`wrong_intent` · `missing_data` · `hallucination` · `weak_generic` · `stale_or_incorrect_data` · `overconfidence`

### Pass / Fail rule (baseline)

- **FAIL** if any of: hallucination=true, invented numbers, false alert/trade confirmation, or honesty≤1 on a known missing-data probe.
- Else **PASS** if composite ≥ 3.0 (raise bar to 3.5 after Phase 1).

---

## Run log

| Date | Tester | Env (mock/live) | Notes |
|------|--------|-----------------|-------|
| 2026-09-17 | Team | live | Rev 9/14 packs — see section below |

---

## Client Rev 9/14 — test results (Sep 17, 2026)

Master checklist: [`REV_914_MASTER_CHECKLIST.md`](./REV_914_MASTER_CHECKLIST.md)

### Golden scripts

| Script | Pass? | Notes |
|--------|-------|-------|
| Script 1 — market / leading / risk | **Pass** | Fresh chat |
| Script 2 — buy today / rank / riskiest | **Pass** | DDOG #1, INTC riskiest |
| Script 3 — earnings / top 3 / go deeper | **Pass** | No SPY/QQQ pollution |

### Test packs

| Pack | Pass? | Notes |
|------|-------|-------|
| A2 — Japan WAIT | **Pass** | Sprint 1 code |
| G1 — memory bypass | **Pass** | Sprint 1 code |
| E1 — movers (moving / hot / crashing) | **Pass** | Verified scan, RVOL |
| F1 — earnings phrasings (11 prompts) | **Pass** | Session filters fixed Sep 17 |
| B1 — core market snapshot | **Pass** | Health 65, regime, indexes |
| B2 — index drill-down | **Partial** | Generic snapshot only — Sprint 2 |
| B3–B6 | **Not run** | Sprint 2 |
| C2–C3 labs | **Not run** | Sprint 5 |
| D1 core | **Pass** | Script 2 |
| D1 variants (watch / looks good / find) | **Not run** | |
| F2 bottom 3 | **Not run** | |
| G3 trace | **Not run** | Sprint 5 |

### Multi-turn

| Script | Pass? | Notes |
|--------|-------|-------|
| MT-001 / Script 3 | **Pass** | |
| MT-002 | Not run | |
| MT-003 | Not run | Regression: buy NVDA → risks → stage |

---

## Single-turn results

Copy rows as you run. Keep raw answer snippets in Notes for client demos.

| ID | Domain | Route expected | Route observed | I | G | V | A | H | B | Composite | Pass? | Failure tags | Improvement ticket (Intent/Prompt/Tool/Data/API/Eval) | Notes |
|----|--------|----------------|----------------|---|---|---|---|---|---|-----------|-------|--------------|------------------------------------------------------|-------|
| P0-PRICE-001 | price_quote | price_reply | | | | | | | | | | | | |
| P0-PRICE-002 | price_quote | price_reply | | | | | | | | | | | | |
| P0-PRICE-003 | price_quote | price_reply | | | | | | | | | | | | |
| P0-PRICE-004 | price_quote | data_reply | | | | | | | | | | | | |
| P0-TECH-001 | technicals | data_reply | | | | | | | | | | | | |
| P0-TECH-002 | technicals | data_reply | | | | | | | | | | | | |
| P0-TECH-003 | technicals | data_reply | | | | | | | | | | | | |
| P0-TECH-004 | technicals | llm_tools | | | | | | | | | | | | |
| P0-TECH-005 | technicals | unknown_gap | | | | | | | | | | | | |
| P0-FUND-001 | fundamentals | research_rev1 | | | | | | | | | | | | |
| P0-FUND-002 | fundamentals | llm_tools | | | | | | | | | | | | |
| P0-FUND-003 | fundamentals | unknown_gap | | | | | | | | | | | | |
| P0-FUND-004 | fundamentals | llm_tools | | | | | | | | | | | | |
| P0-FILING-001 | sec_filings | data_reply | | | | | | | | | | | | |
| P0-FILING-002 | sec_filings | data_reply | | | | | | | | | | | | |
| P0-FILING-003 | sec_filings | llm_tools | | | | | | | | | | | | |
| P0-FILING-004 | sec_filings | research_rev1 | | | | | | | | | | | | |
| P0-NEWS-001 | news | data_reply | | | | | | | | | | | | |
| P0-NEWS-002 | news | llm_tools | | | | | | | | | | | | |
| P0-NEWS-003 | news | llm_tools | | | | | | | | | | | | |
| P0-NEWS-004 | news | data_reply | | | | | | | | | | | | |
| P0-EARN-001 | earnings | earnings_day | | | | | | | | | | | | |
| P0-EARN-002 | earnings | earnings_day | | | | | | | | | | | | |
| P0-EARN-003 | earnings | data_reply | | | | | | | | | | | | |
| P0-EARN-004 | earnings | research_rev1 | | | | | | | | | | | | |
| P0-EARN-005 | earnings | research_rev1 | | | | | | | | | | | | |
| P0-MACRO-001 | macro | data_reply | | | | | | | | | | | | |
| P0-MACRO-002 | macro | llm_tools | | | | | | | | | | | | |
| P0-MACRO-003 | macro | llm_tools | | | | | | | | | | | | |
| P0-PEER-001 | peers | research_rev1 | | | | | | | | | | | | |
| P0-PEER-002 | peers | llm_tools | | | | | | | | | | | | |
| P0-PEER-003 | peers | unknown_gap | | | | | | | | | | | | |
| P0-EST-001 | estimates | research_rev1 | | | | | | | | | | | | |
| P0-EST-002 | estimates | unknown_gap | | | | | | | | | | | | |
| P0-POS-001 | positioning | unknown_gap | | | | | | | | | | | | |
| P0-POS-002 | positioning | unknown_gap | | | | | | | | | | | | |
| P0-SENT-001 | sentiment | data_reply | | | | | | | | | | | | |
| P0-SENT-002 | sentiment | llm_tools | | | | | | | | | | | | |
| P0-RISK-001 | risk_reward | llm_tools | | | | | | | | | | | | |
| P0-RISK-002 | risk_reward | llm_tools | | | | | | | | | | | | |
| P0-PORT-001 | portfolio | status_query | | | | | | | | | | | | |
| P0-PORT-002 | portfolio | status_query | | | | | | | | | | | | |
| P0-PORT-003 | portfolio | unknown_gap | | | | | | | | | | | | |
| P0-PORT-004 | portfolio | unknown_gap | | | | | | | | | | | | |
| P0-SETUP-001 | trade_setups | llm_tools | | | | | | | | | | | | |
| P0-SETUP-002 | trade_setups | trade_advisory | | | | | | | | | | | | |
| P0-SETUP-003 | trade_setups | trade_advisory | | | | | | | | | | | | |
| P0-SETUP-004 | trade_setups | strategize | | | | | | | | | | | | |
| P0-OPT-001 | options | research_rev1 | | | | | | | | | | | | |
| P0-OPT-002 | options | unknown_gap | | | | | | | | | | | | |
| P0-OPT-003 | options | unknown_gap | | | | | | | | | | | | |
| P0-HIST-001 | analogs | research_rev1 | | | | | | | | | | | | |
| P0-HIST-002 | analogs | unknown_gap | | | | | | | | | | | | |
| P0-NL-001 | nl_research | llm_tools | | | | | | | | | | | | |
| P0-NL-002 | nl_research | unknown_gap | | | | | | | | | | | | |
| P0-NL-003 | nl_research | llm_tools | | | | | | | | | | | | |
| P0-ALERT-001 | alerts | unknown_gap | | | | | | | | | | | | |
| P0-ALERT-002 | alerts | llm_tools | | | | | | | | | | | | |
| P0-ALERT-003 | alerts | llm_tools | | | | | | | | | | | | |
| P0-ALERT-004 | alerts | unknown_gap | | | | | | | | | | | | |
| P0-TRUST-001 | anti_hallucination | data_reply | | | | | | | | | | | | |
| P0-TRUST-002 | anti_hallucination | llm_tools | | | | | | | | | | | | |
| P0-TRUST-003 | anti_hallucination | data_reply | | | | | | | | | | | | |
| P0-TRUST-004 | anti_hallucination | conversation_context | | | | | | | | | | | | |
| P0-HALT-001 | market_integrity | live_price_gate | | | | | | | | | | | | |

*I=intent G=grounding V=verifiability A=actionability H=honesty B=breadth*

---

## Multi-turn results

| Script ID | Title | Pass? | Weakest turn | Failure tags | Improvement ticket | Notes |
|-----------|-------|-------|--------------|--------------|--------------------|-------|
| P0-MT-001 | Earnings day → select → go deeper | | | | | |
| P0-MT-002 | Compare then risk follow-up | | | | | |
| P0-MT-003 | Trade advisory → stage boundary | | | | | |
| P0-MT-004 | Why moving → catalysts → alert | | | | | |
| P0-MT-005 | Research → remove → re-rank | | | | | |

---

## Domain heat map (fill after run)

Mark each: **Strong** / **Partial** / **Weak** / **Missing**

| Domain | Rating | Avg composite | Top failure | Next fix |
|--------|--------|---------------|-------------|----------|
| Price / quotes | | | | |
| Technicals | | | | |
| Fundamentals / valuation | | | | |
| SEC filings | | | | |
| News / catalysts | | | | |
| Earnings / guidance | | | | |
| Macro / regime | | | | |
| Sector / peers | | | | |
| Analyst estimates | | | | |
| Positioning | | | | |
| Sentiment | | | | |
| Risk / reward | | | | |
| Portfolio / positions | | | | |
| Trade setups | | | | |
| Options | | | | |
| Historical analogs | | | | |
| NL research | | | | |
| Monitoring / alerts | | | | |
| Anti-hallucination | | | | |
| Multi-turn workflows | | | | |

---

## Top 10 failures → fuel backlog

| Rank | ID | Failure | Ticket type | Proposed fix | Priority |
|-----:|----|---------|-------------|--------------|----------|
| 1 | | | | | P0 |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 | | | | | |
| 9 | | | | | |
| 10 | | | | | |

Ticket types: **Intent** · **Prompt** · **Tool** · **Data** · **API** · **Eval**

---

## Baseline summary (client-facing)

- Questions run: __ / __
- Pass rate: __%
- Hallucination incidents: __
- Known-gap probes that correctly refused: __ / __
- Strongest domains:
- Weakest domains:
- Recommended next phase focus:
