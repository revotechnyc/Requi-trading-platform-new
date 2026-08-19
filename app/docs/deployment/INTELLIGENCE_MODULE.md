# Intelligence Module — Deployment & API Guide

The Intelligence module is Requi's conversational surface: strategy parsing,
portfolio Q&A, and **full trading capabilities on the user's behalf — always
behind the per-ticket confirmation gate**. This document is the exhaustive
deployment reference.

---

## 1. What it does

| Capability | Entry point | Result |
|---|---|---|
| Parse a text strategy | paste ENTRY/EXIT/SIZING text | structured plan saved to the Strategies library |
| Portfolio / fill / status Q&A | natural language | canned or LLM answers |
| **Propose a trade** | `buy 25 ALPHA at 150 limit` | staged order ticket (nothing routes) |
| **Authorize a trade** | `CONFIRM ORDER MANUAL-20260728-0007` | gated broker submission |
| **Veto a trade** | `REJECT ORDER MANUAL-20260728-0007` | ticket dies, never routed |
| Confidentiality enforcement | any exposure attempt | safe refusal (server-side guard) |

## 2. Architecture

```
Browser (Intelligence.tsx)
   │  trpc.intelligence.chat
   ▼
api/intelligence-router.ts
   ├─ 0. Anti-exposure guard (regex lattice, server-side — not prompt-based)
   ├─ 1. CONFIRM/REJECT ORDER → api/queries/tickets.ts
   ├─ 2. Trade proposal regex → proposeTicket() → ticket + alert
   ├─ 3. Canned ops answers
   ├─ 4. Strategy parser (OpenAI if OPENAI_API_KEY, else deterministic)
   └─ 5. Swarm-governed chat (SWARM_MASTER_PROMPT + OpenAI)
```

Every trade-intent path converges on the **ticket service**, which is the only
code in the system that can touch a broker adapter. The confirmation gate is
validated against the **signed governance package** — if no signed package is
active, proposal and confirmation both refuse.

## 3. Environment

| Variable | Purpose | Default |
|---|---|---|
| `OPENAI_API_KEY` | LLM chat + strategy parsing | unset → deterministic fallback |
| `OPENAI_MODEL` | model override | `gpt-4.1` |
| `DATABASE_URL` | tickets, strategies, alerts | required |
| `GOVERNANCE_VAULT_KEY` | signs/verifies governance package | required in production |
| Broker vars | see `BROKER_CONNECTIONS.md` | paper execution if unset |

## 4. Deployment checklist

1. `npm install && npm run build` — the server bundles the API (`dist/boot.js`)
   and client (`dist/public`).
2. Provide `.env` with `DATABASE_URL`, `GOVERNANCE_VAULT_KEY`, optional
   `OPENAI_API_KEY`, optional broker vars.
3. Boot: `npm start`. Boot sequence runs:
   - `ensureSchema()` — creates all 12 tables idempotently (incl.
     `order_tickets` with the `(userId, idempotencyKey)` unique index).
   - `ensureGovernanceReady()` — syncs the encrypted document vault into the
     registry and compiles + signs + activates the genesis governance package
     if none is active. **Intelligence trading is unavailable until this
     succeeds** (watch the log for `[governance] genesis package … activated`).
4. Smoke test: log in → Intelligence → send `buy 25 ALPHA at 150 limit` →
   expect a staged ticket → reply `CONFIRM ORDER <ticketId>` → expect a paper
   fill and an EXECUTION alert in the notification center.

## 5. Chat command reference (trading)

| User says | Behavior |
|---|---|
| `buy 25 ALPHA at 150 limit` | stages LMT ticket `MANUAL-YYYYMMDD-NNNN`, 5-minute window |
| `buy 25 ALPHA` / `sell 10 BRAVO market` | stages MKT ticket |
| `CONFIRM ORDER <TICKET_ID>` | exact-string gate → broker submission → ACK/fill |
| `REJECT ORDER <TICKET_ID>` | terminal rejection, never routed |
| anything else | normal assistant behavior |

Proposal responses always include the venue (`PAPER` unless a live broker is
configured), the expiry, and the exact strings to reply with. The same ticket
appears in the notification center with CONFIRM/REJECT buttons — confirming
in either place resolves both.

## 6. HTTP API (trpc `execution.*`) — same gate, programmatic

| Endpoint | Type | Input | Output |
|---|---|---|---|
| `execution.brokers` | query | — | live status + capabilities of PAPER / ROBINHOOD_MCP / IBKR |
| `execution.propose` | mutation | `{symbol, side, quantity, orderType, limitPrice?, stopPrice?, tif?, broker?, strategy?, entry?, stop?, target?, origin?}` | `{ticket, duplicate, respondWith:[CONFIRM…, REJECT…]}` |
| `execution.confirm` | mutation | `{ticketId, confirmation}` | gated submission result with reason codes |
| `execution.reject` | mutation | `{ticketId}` | terminal rejection |
| `execution.cancel` | mutation | `{ticketId}` | cancels a working broker order |
| `execution.tickets` | query | — | ticket history (minimum-disclosure fields) |
| `execution.positions` | query | `{broker}` | live positions via adapter (paper fallback flagged) |

Idempotency: re-proposing the identical order on the same day returns the
same ticket (`duplicate: true`); broker submissions carry the idempotency key
as the broker-visible client order id (`cOID` at IBKR, `client_order_id` at
Robinhood MCP).

## 7. Reason codes (confirmation gate)

`UNKNOWN_TICKET` · `INVALID_CONFIRMATION_FORMAT` ·
`STALE_OR_MISMATCHED_TICKET` · `TICKET_NOT_CONFIRMABLE` ·
`CONFIRMATION_WINDOW_EXPIRED` · `BROKER_UNREACHABLE` ·
`BROKER_STATE_UNKNOWN` (never resubmitted) · `BROKER_REJECTED` ·
`SUBMITTED` · `FILLED` · `GOVERNANCE_UNAVAILABLE`

## 8. Security notes

- The anti-exposure guard refuses requests for prompts, governing documents,
  formulas, thresholds, compiler internals, and credentials — enforced in
  code before any LLM call.
- The chat never returns ticket internals beyond the approved
  minimum-disclosure fields.
- Demo/owner users hold `GOVERNANCE_ADMIN`; ordinary users cannot reach
  governance endpoints, but trading endpoints work for every authenticated
  user under the same confirmation gate.
