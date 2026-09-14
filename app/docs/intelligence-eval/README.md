# Phase 0 — Trader Question Bank (executable baseline)

This pack turns the client’s builder expectations into something you can run immediately:

1. **Visible progress** — fill the scoring sheet + send the weekly report template.
2. **Proactive challenge** — bank includes hard trader questions and known-gap probes beyond earnings.
3. **Weakness → fuel** — every failure maps to Intent / Prompt / Tool / Data / API / Eval.

## Phase status

| Phase | Doc | Status |
|-------|-----|--------|
| 0 Baseline | `BASELINE_RUN_2026-09-14.md` | Partial |
| 1 Trust | code fixes + close-out probes | **PASS** |
| 2 Breadth | [`PHASE2_BREADTH.md`](./PHASE2_BREADTH.md) | In progress (trust fixes shipped; live scoring remaining) |
| 3 Conversation | [`PHASE3_CONVERSATION.md`](./PHASE3_CONVERSATION.md) | **Ready — run next** |
| 4 Actionability | TBD | Queued |
| 5 Alerts | TBD | Queued |
| 6 Continuous lab | weekly report template | Queued |

## Files

| File | Use |
|------|-----|
| [`trader-question-bank-v1.json`](./trader-question-bank-v1.json) | Source of truth: 60+ single-turn + 5 multi-turn scripts, tagged by domain/route/providers |
| [`SCORING_SHEET.md`](./SCORING_SHEET.md) | Rubric + run log + heat map + top-10 failure backlog |
| [`WEEKLY_INTELLIGENCE_REPORT_TEMPLATE.md`](./WEEKLY_INTELLIGENCE_REPORT_TEMPLATE.md) | Client update cadence |
| [`prompts-quick-copy.md`](./prompts-quick-copy.md) | Paste-ready prompts for Intelligence chat |
| [`PHASE2_BREADTH.md`](./PHASE2_BREADTH.md) | Phase 2 domain packs + exit criteria |
| [`PHASE3_CONVERSATION.md`](./PHASE3_CONVERSATION.md) | Phase 3 multi-turn / working-set scripts |
| [`STATUS_2026-09-15.md`](./STATUS_2026-09-15.md) | Daily status — changes + testing (2026-09-15) |

## How to run baseline (same day)

1. Open Intelligence chat (prefer **live** data if keys are configured; note mock vs live in the sheet).
2. Run at least **60** single-turn IDs from the JSON (cover every domain in `baseline_checklist`).
3. Run multi-turn scripts **P0-MT-001, P0-MT-002, P0-MT-003** (required); 004–005 recommended.
4. Score each answer in `SCORING_SHEET.md` (0–5 × six dimensions).
5. Tag failures; create backlog tickets from the Top 10 table.
6. Fill **Baseline summary** at the bottom of the scoring sheet — that is the client artifact for Phase 0.

## Must-pass trust probes (fail the baseline if these hallucinate)

- `P0-PRICE-004` — fake ticker
- `P0-TRUST-001` — historical close without data
- `P0-TRUST-002` — FactSet exact figures
- `P0-TRUST-003` — detailed 10-K letter without filing text
- `P0-TRUST-004` — “research the second one” with empty context
- `P0-RISK-002` — false-precision probability
- `P0-EST-001` / `P0-EST-002` — estimates when stubbed

## Signature trader questions (demo these)

- `P0-NEWS-002` — “Why is NVDA falling today?”
- `P0-PEER-002` — Compare AAPL vs TSLA
- `P0-PORT-003` — Risks to a position
- `P0-NL-002` — Compound NL screen
- `P0-OPT-002` — Covered-call candidate
- `P0-ALERT-001` — NL alert creation
- `P0-MT-002` — Multi-turn compare → FOMC risk → invalidation

## Mapping to REQui code (for debugging failures)

| Observed symptom | First places to look |
|------------------|----------------------|
| Wrong mode (trade vs chat) | `app/api/intelligence/intent.ts` |
| Bad follow-up / lost tickers | `app/api/intelligence/conversation-context.ts` |
| Weak price/RSI/news/filings | `app/api/intelligence/data-reply.ts`, `price-reply.ts` |
| Earnings calendar/screen | `app/api/intelligence-data/earnings-day.ts` |
| Research depth | `app/api/intelligence/research/earnings-candidate.ts` |
| Provider missing | `app/api/intelligence-data/providers/*` |
| Router order of handlers | `app/api/intelligence-router.ts` |

## Definition of Phase 0 done

- [ ] Scoring sheet filled (≥60 singles + 3 required multi-turns)
- [ ] Domain heat map complete
- [ ] Top 10 failures backlog written with ticket types
- [ ] Weekly report #1 sent to client using the template
- [ ] Phase 1 trust fixes prioritized from trust-probe failures
