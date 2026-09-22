# Client Feedback Analysis & Phase Plan
## IBKR Paper Trading + Intelligence NL Control + BYOB Architecture

**Date:** 2026-09-21  
**Audience:** Engineering / Manisha / client  
**Sources:** Client brief (IBKR data + BYOB + NL trading) · existing Requi broker/Intelligence stack  
**Hard constraint from client:** Paper first. Live separately permissioned. LLM never sends raw broker API calls. Do not design to circumvent IBKR commercial fees.

---

## 1. Feedback decoded (what the client actually asked for)

The brief is **three products**, not one feature:

| Track | Ask | Success looks like |
|-------|-----|--------------------|
| **A. IBKR as venue + data source** | Add IBKR into the broker/data hierarchy (paper first); evaluate every useful CPAPI market/fundamental endpoint as fallback | Orders/positions/balances work on IBKR paper; quotes/history can fall back to IBKR when licensed |
| **B. BYOB architecture research** | Can each user connect *their own* IBKR without RTI holding one institutional umbrella account? Isolated gateway per user? Subdomains? | Written findings: API choice, legality, limits, infra estimate — **before live-account coding** |
| **C. Intelligence NL trading** | Full conversational control of paper account via intents → deterministic order schema → preview → confirm → adapter | Users say “buy 100 AAPL with 2% stop”; system builds a typed ticket; never free-form broker JSON from the LLM |

**Non-negotiables (client + Requi constitution):**

1. Deterministic order builder between LLM and broker.
2. User confirmation when required (existing `CONFIRM ORDER {ticketId}` gate stays).
3. Paper development/test path; live disabled until risk/security validated.
4. Repeatable **Broker Adapter Layer** (IBKR now, Alpaca later).
5. Honest compliance: no architecture whose purpose is fee circumvention.

---

## 2. Current state vs ask (gap analysis)

### What already exists (do not rebuild)

```
NL chat → TRADE_INTENT advisory → "stage it" → ticket (READY_FOR_CONFIRMATION)
       → CONFIRM ORDER {id} → BrokerAdapter.placeOrder
              ├── PaperBroker (default, full E2E)
              ├── RobinhoodMcpBroker (per-user OAuth)
              └── IbkrBroker (Client Portal REST, server env IBKR_ACCOUNT)
```

| Capability | Today | Client ask |
|------------|-------|------------|
| Unified `BrokerAdapter` | ✅ PAPER / RH / IBKR | Extend, don't replace |
| IBKR CPAPI place/cancel/status/positions | ✅ equities path | Harden + account summary + keep-alive |
| IBKR market data (minute bars, conid) | 🟡 partial | Full hierarchy evaluation |
| Server-linked IBKR paper (`DU…`) | ✅ if gateway logged in | Make default Intelligence paper path when configured |
| Per-user IBKR (BYOB) | ❌ | Research + later phases |
| NL buy/sell → advisory → stage | ✅ narrow | Expand to full intent catalog |
| Limit/stop/trail/bracket from NL | ❌ (ticket DB supports types; NL does not) | Full catalog |
| Pronouns / “add a 3% stop” follow-ups | 🟡 thin (`it`/`stage it`, 5‑min in-memory) | Durable trading context |
| Slot-filling (“Buy Apple” → ask qty) | ❌ | Required |
| LLM → raw IBKR HTTP | Already forbidden | Keep invariant |
| Intent catalog doc | ❌ | Deliver in Phase 3 |

**Critical product distinction:**

- **Requi PAPER broker** = internal simulator (no IBKR).
- **IBKR Paper account (`DU…`)** = real IBKR paper infrastructure via Client Portal Gateway.

Client said “connect IBKR to Intelligence for paper trading” → they mean **IBKR paper venue**, not only the simulator. Plan treats both: simulator for offline CI; IBKR paper for integration UAT.

---

## 3. Research answers (preliminary — confirm with IBKR counsel / account manager)

> Official IBKR docs + account terms must validate before Phase 7+ spend. Below is the **engineering recommendation** to discuss with IBKR, not legal advice.

| # | Question | Preliminary answer |
|---|----------|-------------------|
| 1 | Best API for this architecture? | **Client Portal Web API (CPAPI) + Client Portal Gateway** for REST orders/portfolio/data we already use. **IB Gateway / TWS API** (socket) for low-latency / richer order types if CPAPI gaps appear. **FIX** only if/when institutional volume warrants. Avoid inventing a new transport. |
| 2 | Can users authorize RTI on their accounts? | Individuals can run gateway against **their** login. Third-party **platform** access to many customer accounts usually needs IBKR’s commercial/partner path — **must ask IBKR**. BYOB “user runs own session” is closer to user-operated tooling than custody of keys. |
| 3 | Auto-provision container per user? | **Technically yes** (Docker CP Gateway per user). Operationally heavy: Java gateway, 2FA, session expiry, `/tickle`, SSL, disk, IP reputation. |
| 4 | Auth / re-auth? | Gateway requires interactive IBKR login + 2FA; sessions expire; keep-alive via `/tickle`; re-login is user/operator action — not invisible OAuth like Robinhood MCP. |
| 5 | Unique subdomains (`user.ibkr…`)? | **Nice for routing/ops isolation**, not a compliance substitute. **Container + credentials + network isolation** is the real unit. Subdomains alone buy little. |
| 6 | Paper vs live? | Same CPAPI; paper account id `DU…` vs live `U…`. Permissions, buying power, and some market-data entitlements differ. Code path should be identical; **feature flag** gates live. |
| 7 | Market-data licensing? | **Do not** redistribute one user’s IBKR market data as platform-wide quotes. Per-user data stays in that user’s session/context. Platform-wide hierarchy uses RTI’s own entitlements / delayed public sources. |
| 8 | Limits? | Concurrent login limits (often one active session per user), pacing (order/market data), soft disconnects. Design for **one gateway session per IBKR user**, queue requests, backoff. |
| 9 | Credential security? | Prefer **never store IBKR passwords**. Store only session metadata / encrypted connection config; user completes login (SSO/SSO-like or operator console). Order path remains ticket-gated. |
| 10 | What IBKR requires of RTI? | Likely: disclose multi-user intent, market-data redistribution policy, possibly Web API / ISV / advisor agreements. **Engage IBKR before scaling BYOB.** |

**Recommended architecture (target):**

```
RTI Broker Adapter Layer
  ├── PaperAdapter          (CI / offline)
  ├── IbkrAdapter           (CPAPI)
  │     ├── ServerLinkedSession   (Phase 1–4: team paper DU account)
  │     └── UserLinkedSession     (Phase 7–8: BYOB — user-owned gateway)
  ├── RobinhoodMcpAdapter   (exists)
  └── Future: AlpacaAdapter
           │
           ▼
   Deterministic Trading Engine (schema Zod)
           ▲
   Intelligence: Intent → Entities → Context → Validate → Preview → Confirm
```

**On `user123.ibkr.requitrading.com`:** treat as optional edge routing for a **user-scoped broker sidecar**, not the core security model. Prefer:

`RTI API → BrokerSidecar(userId) → CP Gateway container → user’s IBKR`

with mTLS between RTI and sidecar.

---

## 4. Recommended technical principles

1. **Strict internal schema** (example): `TradingAction` Zod object — `intent`, `symbol`, `side`, `qty|notional`, `orderType`, legs, `accountMode: PAPER|LIVE`.
2. **LLM role:** classify + extract + explain. Never call `placeOrder`.
3. **Deterministic engine:** validate schema → buying power / position / risk → build `OrderIntent` / multi-leg plan → ticket.
4. **Confirmation policy:** risk-increasing always requires exact confirm; read-only account queries may auto-answer.
5. **Clarification over guessing:** missing qty → ask; ambiguous “close that” with 2 positions → ask.
6. **Data hierarchy:** existing providers primary; IBKR as per-session fallback when entitled; never mix user A’s IBKR quotes into user B’s chat.
7. **Paper gate:** `INTELLIGENCE_BROKER=IBKR` only when `IBKR_ACCOUNT` is paper (`DU…`) until Live unlock flag.

---

## 5. Phase-wise implementation plan

### Phase 0 — Decision & compliance pack (3–5 days) · **no live coding of BYOB**

**Deliverables**

- Written answers to client Q1–Q10 (expand §3 with cited IBKR doc URLs).
- Decision memo: CPAPI-first; TWS reserved; FIX deferred.
- Risk register: session expiry, 2FA UX, MD licensing, concurrent login.
- Client checkpoint: approve paper-first path before BYOB spend.

**Exit:** Client/Manisha sign-off on API choice + “paper before BYOB.”

---

### Phase 1 — IBKR Paper venue hardening (server-linked) (1–1.5 weeks)

**Goal:** Intelligence/execution can reliably use **one** team IBKR paper account.

| Work item | Detail |
|-----------|--------|
| Complete CPAPI account summary | Populate equity/cash/buyingPower (today returns 0) |
| Implement `/tickle` keep-alive | Docs claim it; code gap |
| Health + reconnect UX | Accounts page: gateway auth status, last tickle, paper vs live detect |
| `INTELLIGENCE_BROKER=IBKR` path | Venue policy already exists — verify E2E: stage → confirm → IBKR paper fill |
| Systemcheck probes | Auth status, accounts, one symbol conid, paper flag |
| Ops doc | Update `BROKER_CONNECTIONS.md` + `.env.example` |

**Exit criteria**

- [ ] Place MKT/LMT/STP on IBKR paper from confirmed ticket
- [ ] Positions + open orders + cancel work
- [ ] Buying power shown correctly
- [ ] Live account id rejected when `LIVE_TRADING_ENABLED≠true`

---

### Phase 2 — IBKR as market-data fallback (1 week, parallelizable)

**Goal:** Evaluate & wire **safe** IBKR data into the Market Data Gateway hierarchy.

| Endpoint class | Action |
|----------------|--------|
| Realtime/delayed quotes | Probe CPAPI marketdata snapshot; add as fallback behind Yahoo/broker hierarchy **only for entitled session** |
| Historical OHLCV | Extend `ibkr-data` beyond 1m bars where available |
| Contract/security info | conid + contract search (already partial) |
| Earnings / fundamentals / corp actions | Inventory CPAPI coverage; if thin, keep Alpha/EDGAR/FRED — document “not available via IBKR” honestly |
| Portfolio/order data | Already execution plane — reuse, don’t duplicate as “market data” |

**Exit:** Written matrix: endpoint → use as primary / fallback / unsupported + licensing note.

---

### Phase 3 — Trading Intent Catalog + schema (1–1.5 weeks) · **simulator first**

**Goal:** Spec + types for every client-listed action; implement parsers against **PaperBroker** (no IBKR required).

Deliverables:

1. **Intent catalog** (appendix A) mapped to RTI function + IBKR capability.
2. Zod `TradingAction` / `TradingQuery` schemas.
3. Deterministic extractor (regex + constrained LLM fill → Zod; reject on parse fail).
4. Clarification dialogue for missing fields.
5. Unit tests per intent family (place / modify / cancel / view).

**Exit:** 100% catalog intents classified in tests; 0 broker calls from LLM layer.

---

### Phase 4 — Wire NL catalog → tickets → IBKR Paper (1.5–2 weeks)

**Goal:** Full pipeline on IBKR paper for core intents.

Priority order (MVP → advanced):

1. View: positions, buying power, open orders, P&L today  
2. Place: MKT/LMT buy/sell by shares  
3. Place: buy by notional ($)  
4. Protective: stop %, trail %, move stop / breakeven  
5. Close / reduce / % of position  
6. Cancel / cancel all  
7. Bracket / take-profit half  
8. Modify/replace (cancel+recreate if CPAPI modify insufficient)

Keep governance: preview → `CONFIRM ORDER` for risk-increasing.

**Exit:** Scripted UAT of client example dialogue (NVDA buy → add 3% stop → trailing → TP half) on IBKR paper.

---

### Phase 5 — Conversational trading context (1 week)

**Goal:** Robust multi-turn without guessing.

- Durable `TradingContext` (DB): active symbol, last action, last ticket/order ids, pending draft, TTL
- Pronoun resolution + disambiguation prompts
- “Sell it / close that / buy another 50 / protect my profit” resolution rules
- Never stage when research says WAIT / BLOCKED (align with Rev 9/14 honesty rules)

**Exit:** Multi-turn eval pack MT-TRADE-001…010 Pass on paper.

---

### Phase 6 — Advanced orders & portfolio analytics NL (1–2 weeks)

- OCO / conditional where CPAPI supports  
- “positions down > 3%”, “exposure by sector”, “everything I bought today”  
- Sector exposure may need fundamentals join — degrade gracefully  

**Exit:** Capability matrix shows supported vs “ask clarification / unsupported.”

---

### Phase 7 — BYOB spike (research + single-user PoC) (2–3 weeks) · **still paper**

**Goal:** Prove isolated sidecar without claiming production multi-tenant.

1. Dockerized Client Portal Gateway template  
2. One user → one container → one paper login (manual 2FA first)  
3. RTI resolves `userId` → sidecar URL (internal DNS; subdomain optional)  
4. Measure: cold start, re-auth UX, cost/CPU, failure modes  
5. Legal review checkpoint with IBKR  

**Exit:** Spike report: go / no-go / partner-program required. **No** mass provisioning yet.

---

### Phase 8 — BYOB production path (only if Phase 7 go) (3–5 weeks)

- Provisioning API, secrets, mTLS, session watchdog, per-user MD firewall  
- UI: Connect IBKR (paper) → wait for gateway login complete  
- Live unlock as separate entitlement  

---

### Phase 9 — Generic Broker Adapter Layer formalization (ongoing)

- Extract capability negotiation (`supports(TRAIL)`, `supports(BRACKET)`)  
- Strategy/Intelligence routes by capability  
- Scaffold Alpaca adapter behind same `TradingAction` schema  

---

## 6. Suggested sequencing (calendar view)

```
Week 0     Phase 0 research memo + client approve
Week 1–2   Phase 1 IBKR paper harden  ‖  Phase 2 data matrix
Week 2–4   Phase 3 intent catalog + PaperBroker NL
Week 4–6   Phase 4 NL → IBKR paper UAT
Week 6–7   Phase 5 multi-turn context
Week 7–8   Phase 6 advanced (as needed for demo)
Week 8–10  Phase 7 BYOB spike (parallel only after Phase 4 green)
Week 10+   Phase 8 only with IBKR/legal go
```

**Do not** start Phase 8 live-account work before Phases 0–4 exit and Phase 7 legal go.

---

## 7. Intent catalog (v1 map)

Legend: **RTI** = deterministic engine function · **IBKR** = CPAPI support expectation · **P** = Phase

| Intent ID | Example utterance | RTI function | IBKR | P |
|-----------|-------------------|--------------|------|---|
| `VIEW_POSITIONS` | Show my open positions | `queryPositions` | positions | 4 |
| `VIEW_BUYING_POWER` | How much buying power? | `queryAccount` | portfolio summary | 4 |
| `VIEW_BALANCES` | Account balance / cash | `queryAccount` | portfolio | 4 |
| `VIEW_OPEN_ORDERS` | Open orders / for TSLA | `queryOpenOrders` | live orders | 4 |
| `VIEW_ORDER_HISTORY` | Filled / rejected / cancelled | `queryOrderHistory` | order status/hist | 4 |
| `VIEW_PNL` | P&L today / unrealized | `queryPnl` | positions+ledger | 4 |
| `VIEW_EXPOSURE` | Exposure by sector | `queryExposure` | positions + sector map | 6 |
| `VIEW_ENTRY_PX` | Average entry | `queryPosition(symbol)` | positions | 4 |
| `VIEW_MKT_PX` | Current price of X | existing MD gateway | MD snapshot | 2/4 |
| `PLACE_MKT` | Buy 100 AAPL | `buildOrder(MKT)` | orders | 3–4 |
| `PLACE_LMT` | Limit TSLA at 390 | `buildOrder(LMT)` | orders | 3–4 |
| `PLACE_STP` | Stop loss 2% | `buildOrder(STP)` | orders | 3–4 |
| `PLACE_STP_LMT` | Stop-limit | `buildOrder(STP_LMT)` | orders | 4 |
| `PLACE_TRAIL_PCT` | Trail by 3% | `buildOrder(TRAIL)` | TRAIL | 4 |
| `PLACE_TRAIL_AMT` | Trail by $2 | `buildOrder(TRAIL)` | TRAIL | 4 |
| `PLACE_TRAIL_LMT` | Trailing stop-limit | `buildOrder(TRAIL_LIMIT)` | if CPAPI | 6 |
| `PLACE_TAKE_PROFIT` | TP at 8% / half | `buildOrder(LMT SELL)` | orders | 4 |
| `PLACE_BRACKET` | Entry + stop + TP | `buildBracket` | attachOco / bracket | 6 |
| `PLACE_OCO` | OCO / conditional | `buildOco` | if supported | 6 |
| `BUY_SHARES` | Buy 50 NVDA | qty mode | orders | 3–4 |
| `BUY_NOTIONAL` | Buy $5000 NVDA | notional→qty via quote | orders | 4 |
| `SELL_SHARES` | Sell 50 TSLA | qty | orders | 3–4 |
| `SELL_PCT_POSITION` | Sell half / 25% | resolve position qty | orders | 4 |
| `CLOSE_POSITION` | Close AMD / this | full qty SELL/BUY flat | orders | 4 |
| `CLOSE_ALL` | Close all positions | foreach position | orders | 4 |
| `CLOSE_PROFITABLE` | Sell all profitable | filter unrealized>0 | orders | 5 |
| `ADD_TO_POSITION` | Buy another 50 | same side add | orders | 4 |
| `REDUCE_POSITION` | Reduce 25% | partial close | orders | 4 |
| `CANCEL_ORDER` | Cancel Apple order | `cancelOrder` | DELETE order | 4 |
| `CANCEL_ALL_ORDERS` | Cancel every unfilled | foreach open | cancel | 4 |
| `MODIFY_ORDER` | Change limit / qty | modify or cancel+replace | modify endpoint | 4–6 |
| `REPLACE_ORDER` | Make it trailing instead | cancel+new | combo | 5 |
| `MOVE_STOP` | Move stop to X | replace protective | STP | 4 |
| `STOP_TO_BREAKEVEN` | Stop to breakeven | entry±slip | STP | 4 |
| `ADJUST_TP` | Move take profit | replace LMT | LMT | 4 |
| `ADJUST_TRAIL` | Trail tighter | replace TRAIL | TRAIL | 4 |
| `COND_BUY_PRICE` | Buy if falls to 215 | stop/LMT buy | STP/LMT | 5 |
| `COND_SELL_TARGET` | Sell 50% at 240 | LMT sell qty | LMT | 5 |

**Clarification-required intents** (must ask, never invent): bare `Buy Apple`, `Sell it` with >1 candidate, `Move my stop` with multiple stops.

---

## 8. Pipeline (target — matches client diagram)

```
Natural-Language Prompt
  → Intent Recognition          (deterministic + constrained extract)
  → Entity / Parameter Extract  (Zod TradingAction)
  → Trading Context             (thread + portfolio + last order)
  → Account / Position Validate
  → Risk & Permission Validate  (paper-only flag, heat, WAIT block)
  → Deterministic Order Builder → OrderIntent | QueryPlan
  → Order Preview (chat)
  → User Confirmation when required
  → IBKR Broker Adapter
  → IBKR Paper Account
  → Execution Response
  → Intelligence narrates result (no invented fills)
```

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Gateway 2FA / session drop mid-demo | Health banner; refuse stage with clear “reconnect IBKR” |
| Treating simulator as IBKR paper | Explicit venue labels in UI + ticket `effectiveBroker` |
| MD licensing violation | Per-user data firewall; platform MD ≠ user IBKR MD |
| LLM invents orders | `allowTradeTool: false`; only engine places via tickets |
| Scope explosion (full catalog + BYOB) | Phases 1–4 before 7; client demo on server-linked paper |
| Concurrent login kicks | One session policy; document IBKR limit |

---

## 10. Immediate next actions (this week)

1. **Phase 0 memo** for client: CPAPI-first, paper-first, BYOB later, subdomain optional.  
2. Stand up **one** IBKR paper gateway locally; set `IBKR_ACCOUNT=DU…`, `INTELLIGENCE_BROKER=IBKR`.  
3. Fix adapter gaps (account summary + tickle) — Phase 1 kickoff.  
4. Draft Zod `TradingAction` + intent ID enum from §7 — Phase 3 kickoff in parallel.  
5. Schedule IBKR account-manager / compliance call before any multi-tenant gateway design.

---

## 11. Explicitly out of scope until later

- Live (`U…`) account trading  
- Mass auto-provision of gateways  
- Using customer IBKR market data as global RTI quotes  
- LLM-generated raw IBKR REST payloads  
- FIX connectivity  

---

*Document path: `app/docs/intelligence-eval/IBKR_INTELLIGENCE_PHASE_PLAN.md`*
