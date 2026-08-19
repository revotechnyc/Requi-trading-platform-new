# Autonomous Module — Deployment & Operations Guide

The Autonomous module runs Requi's continuous trading loop under the signed
governance package. This document is the exhaustive deployment and operations
reference.

---

## 1. What it is

A persistent engine that cycles **SCAN → EVALUATE → NO TRADE → RESCAN**,
surfaces QUALIFIED_TRADE opportunities, stages them as order tickets, and —
only after exact user confirmation — submits, protects, monitors, and exits.
It operates in two autonomy modes:

| Mode | Behavior |
|---|---|
| `AUTONOMOUS_PAPER` (default) | Full loop on the paper exchange. Safe everywhere. |
| `AUTONOMOUS_LIVE` | Same loop against a configured live broker. Requires explicit operator selection and broker credentials. |

Autonomy can **never** skip the confirmation gate: risk-assuming actions
require `CONFIRM ORDER [TICKET_ID]` per ticket. Post-fill, the engine may
only reduce risk (tightening-only).

## 2. Hard dependencies

| Dependency | Enforced by | Failure mode |
|---|---|---|
| Signed ACTIVE governance package | `runtimePreflight()` on every run start | `START REFUSED — GOVERNANCE_UNAVAILABLE` |
| Database schema | `ensureSchema()` at boot | boot fails visibly |
| Encrypted document vault | `ensureGovernanceReady()` at boot | genesis package not activated → start refused |
| Broker credentials | broker registry | falls back to paper, annotated |

Preflight checks (all must pass, surfaced in the live stream):
`COMPILED_PACKAGE_SIGNATURE_VERIFIED` · `STRATEGY_VERSION_ACTIVE` ·
`ACCOUNT_RECONCILED` · `MARKET_DATA_CURRENT` ·
`BROKER_CONNECTION_OPERATIONAL` · `KILL_SWITCH_ARMED`

## 3. Runtime components

| Component | Location | Role |
|---|---|---|
| Loop state machine | `api/queries/run.ts` | tick-driven arc: idle → qualified → protected → holding; persisted in `run_sessions` |
| Event stream | `run_events` table | chat-style live feed; survives reloads, multi-client |
| Ticket bridge | `api/queries/tickets.ts` | qualified opportunities become confirmable tickets |
| Governance runtime | `api/governance/runtime.ts` | package verification, authority zones, cadence ceilings, stop rules |
| Kill switch | `ai_limits.killSwitch` (DB) | global halt — blocks starts, honored by preflight |
| Alerts | `alerts` table | OPPORTUNITY / CONFIRMATION_REQUEST / EXECUTION / PROTECTION / POSITION_UPDATE / RISK / NO_TRADE_STATUS / SYSTEM_STATE |

## 4. Deployment checklist

1. Follow the base deploy (`npm run build`, `.env`, `npm start`).
2. Confirm the boot log shows:
   - `[db] schema ensured (12 tables)`
   - `[governance] genesis package pkg-… compiled, signed, and activated (34 rules)`
3. Log in → **Autonomous** → verify the banner reads
   *"Operating under signed governance package pkg-… · signature verified"*.
4. Select autonomy mode (persisted per user in `ai_limits.paperOnly`).
5. Press **Start autonomous run**. Expect, in the live stream:
   - `SYSTEM` — engine started, package hash shown, 6 registered strategies ACTIVE
   - `PREFLIGHT` — all six checks listed PASS
   - `SCAN` / `EVALUATE` / `DECIDE` ticks with reason codes
6. When a QUALIFIED_TRADE appears, an `OPPORTUNITY` + `CONFIRMATION_REQUEST`
   alert fires. Confirm via chat, notification center, or `execution.confirm`.

## 5. The six registered strategies

Pre-Earnings Sentiment · Through-Earnings Event · Earnings-Day Reaction ·
Post-Earnings Continuation · Bearish Earnings · General Intraday.
Names and user-facing descriptions are public; implementations live only in
the compiled Strategy Package (server-side, signed).

## 6. Rescan cadence (constitutional ceilings)

| Universe | Ceiling |
|---|---|
| Intraday general | full scan every 5 minutes |
| Earnings sleeve | every 10–15 minutes |

Strategy contracts may define **tighter** cadences; looser overrides are void
(enforced by `validateRescanCadence`, compiled from Amendment II §AII.4).

## 7. Failure states (auto-enforced)

`DATA_STALE` · `BROKER_UNKNOWN` · `UNPROTECTED` · `RISK_ONLY` · `HARD_HALT`
— transitions are driven by the runtime, never by model judgment. CB 6
(autonomy integrity) forces `HARD_HALT` on any attempt to modify the standard
post-fill tightening-only constraint.

## 8. Governance operations (owner → Governance page)

- **Run compilation** — recompiles the vault into a new STAGED package
  (full 18-stage pipeline report visible).
- **Activate** — promotes STAGED → ACTIVE (previous ACTIVE rolls back).
  The next run start picks up the new package; running sessions finish under
  the package they started with.
- **Documents** — registry of the nine sealed governing documents with
  integrity hashes. Raw content is never served.

## 9. RBAC

`USER` (trading surfaces) · `OPERATOR` (system/deployment status) ·
`RISK_COMPLIANCE` (gate results, exceptions) · `GOVERNANCE_ADMIN`
(documents, compile, deploy) · `DEVELOPER` (authorized environments only).
Stored in `users.govRole`; the demo account is `GOVERNANCE_ADMIN`.

## 10. Observability

- **Live stream** (`RunConsole`) — every scan, decision, fill, and exit with
  timestamps and reason codes; fixed-height, chat-style, sticky on desktop.
- **Notification center** — actionable alerts with CONFIRM/REJECT.
- **Tickets** — `execution.tickets` for the full audit trail per order.
- **Governance report** — per-package stage results, rule counts, source
  traces, and conflict resolutions.
