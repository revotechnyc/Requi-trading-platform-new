# Signal Module — Deployment & Operations Guide

The Signal module is Requi's market-intelligence feed: detected opportunities,
their qualification status, and the reason codes behind every outcome. It is
the read-side sibling of the Autonomous module — **signals never execute
anything**; a qualified signal can only become a trade through the ticket +
confirmation flow.

---

## 1. What it is

| Surface | Location | Content |
|---|---|---|
| Signals page | `/app/signals` | live feed of signals with side, strength, source strategy, status |
| Qualification engine | `api/governance/runtime.ts` → `qualifySignal()` | six-layer gate from Formula Handbook Appendix F |
| Reason codes | surfaced on every signal | machine-auditable WHY behind NO TRADE / WAIT / WATCH / QUALIFIED |
| Opportunity alerts | `alerts` table (type `OPPORTUNITY`) | pushes qualified signals to the notification center |

## 2. The qualification model (Appendix F)

A signal becomes trade-qualified only if **all six layers** pass:

1. `REGIME` — market regime compatible with the strategy
2. `LIQUIDITY` — spread/depth/capacity within bounds (≤10% ADV)
3. `FLOW` — order-flow/confirmation evidence present
4. `RISK` — sizing limits (0.50% initial / 0.25% add, concentration ≤10%)
5. `EV` — positive expected value after costs, R:R ≥ 2:1
6. `EXECUTION` — venue/broker capability and session state allow it

Failure of any layer ⇒ the item **remains a signal** with reason codes like
`LIQUIDITY_BELOW_REQUIREMENT` or `REWARD_TO_RISK_FAILED`. The qualification
parameters are read-only to the scanning path (compiled into the signed
governance package) — the feed cannot tune itself.

Decision taxonomy (constitutional): `NO_TRADE` · `WAIT` · `WATCH` ·
`QUALIFIED_TRADE`, with no-trade reasons split into `TRANSIENT`
(rescan-eligible) and `STRUCTURAL` (requires new information).

## 3. Data flow

```
market data plane (graded: freshness + quality tiers A–F)
        │
        ▼
strategy scanners (6 registered strategies)
        │
        ▼
six-layer qualification ── fail ──► signal feed (reason codes, rescan cadence)
        │ pass
        ▼
QUALIFIED_TRADE ──► OPPORTUNITY alert ──► order ticket ──► confirmation gate
                                                              (see INTELLIGENCE_MODULE.md)
```

Public web data may inform signals but **can never authorize execution**
(Execution Data Rule, Approved Public Sources Part II). Execution-grade data
must come from broker/entitled feeds; violations are classified PROCESS or
GROSS and halt the affected path.

## 4. Deployment checklist

1. Base deploy complete (`npm run build`, `.env`, `npm start`).
2. Verify the boot log line `[governance] genesis package … activated` — the
   signal reason-code taxonomy and qualification thresholds are compiled from
   the sealed documents; without the package the feed runs in degraded mode.
3. Open `/app/signals` — the feed renders from the demo data plane. Start an
   Autonomous run to see live `OPPORTUNITY` alerts flow from qualified
   signals into the notification center.
4. Confirm reason codes appear on non-qualified items (never silent
   rejections).

## 5. API surfaces

| Endpoint | Type | Purpose |
|---|---|---|
| `alerts.list` | query | OPPORTUNITY and downstream alert states |
| `autonomous.runFeed` | query | live loop events incl. EVALUATE/DECIDE with reason codes |
| `execution.propose` | mutation | promote a qualified signal to a ticket (manual or chat) |

## 6. Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | alerts, tickets, run stream |
| `GOVERNANCE_VAULT_KEY` | required — qualification rules come from the signed package |
| Market-data credentials | reserved — demo plane ships built-in; wire entitled feeds here for production |

## 7. Operational rules

- Signals are **never** orders. Any UI/API that presents a signal must carry
  its qualification state and reason codes.
- The feed is retained per the decision-audit window (trade duration + 90
  days) with full reason-code history.
- A signal shown as QUALIFIED must be reproducible: same inputs → same
  six-layer result. The engine is deterministic; nondeterminism is a defect.
