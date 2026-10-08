# Client Requirement Audit + Full Test Plan  
## IBKR Paper · Autonomous · Intelligence

**Date:** 7 October 2026  
**Against:** Client feedback (IBKR broker/data + BYOB research + Intelligence NL paper trading)  
**Environment:** Paper only · account example `DUR506819` · Gateway must be green  

**Overall verdict:**  
**Partially fulfilled.** Paper trading workflow (Autonomous + Intelligence Slice 1) works.  
**Not fulfilled yet:** full NL intent catalog, BYOB research/architecture memo, IBKR as full market-data fallback stack, live trading.

Legend: ✅ Done · 🟡 Partial · ❌ Not done · 🔒 Intentionally locked

---

# PART A — Deep requirement check

## A1. IBKR as broker / paper trading workflow

| # | Client requirement | Status | Notes |
|---|-------------------|--------|-------|
| 1 | Add IBKR as broker (start with Paper) | ✅ | Client Portal Gateway + `IbkrBroker` |
| 2 | Test order execution on paper | ✅ | Confirm → placeOrder → WORKING/FILLED |
| 3 | Positions | ✅ | Ledger + gateway reconcile |
| 4 | Balances (equity/cash/BP) | ✅ | When gateway authenticated |
| 5 | Order status | ✅ | READY / WORKING / FILLED / FAILED on Orders |
| 6 | Overall trading workflow without live capital | ✅ | Paper path end-to-end |
| 7 | Live capital / live account | 🔒 | Blocked until `LIVE_TRADING_ENABLED` |

## A2. IBKR as additional / fallback **data** source

| # | Client requirement | Status | Notes |
|---|-------------------|--------|-------|
| 1 | Real-time / delayed stock prices | 🟡 | Gateway quotes used when up; Yahoo fallback exists |
| 2 | Historical OHLCV | 🟡 | Overview/Reaction charts via gateway history + fallback |
| 3 | Earnings dates / fundamentals via IBKR | ❌ | Still other providers / research stack |
| 4 | Corporate actions via IBKR | ❌ | Not integrated |
| 5 | Contract / security information (conid etc.) | 🟡 | Used for trading (conid resolve); not a full master-data product |
| 6 | Positions / balances / portfolio | ✅ | Trading/account path |
| 7 | Order status / execution data | ✅ | Tickets + broker responses |
| 8 | Hierarchy: IBKR as fallback, not full replace | 🟡 | Quotes/bars only; not full fundamental stack |

## A3. BYOB architecture research (before live multi-user coding)

| # | Client question | Status |
|---|-----------------|--------|
| 1 | Best API (CPAPI / TWS / Gateway / FIX) | ✅ See `docs/intelligence-eval/BYOB_ARCHITECTURE_RESEARCH_MEMO.md` |
| 2 | Can users authorize RTI per account? | ✅ Memo (BYOB = user session; commercial path TBD with IBKR) |
| 3 | Auto provision container per user? | ✅ Memo (yes technically; heavy ops; spike first) |
| 4 | Auth / re-auth requirements | ✅ Memo (2FA interactive; session expiry) |
| 5 | Subdomains vs container isolation | ✅ Memo (sidecar isolation > subdomain) |
| 6 | Paper vs live differences | ✅ Memo + code flag |
| 7 | Market-data licensing (no sharing one user’s data) | ✅ Memo (no redistribute) |
| 8 | Rate / session / concurrent login limits | ✅ Memo |
| 9 | Security for credentials / orders | ✅ Memo (no password store; ticket gate) |
| 10 | What IBKR requires for many customers | ✅ Memo (engage IBKR before scale) |
| — | Recommended architecture + infra estimate + plan | ✅ **Memo delivered — coding of live multi-account still gated on client + IBKR** |

## A4. Intelligence NL → IBKR Paper

### Architecture (client-mandated pipeline)

| Step | Status |
|------|--------|
| NL prompt | ✅ |
| Intent recognition | ✅ (deterministic router) |
| Entity extraction | 🟡 Slice 1 entities |
| Trading context / pronouns | 🟡 Basic; not full “sell it / that” resolution |
| Account/position validation | ✅ holdings cap, paper venue |
| Risk & permission | 🟡 paper lock; not full risk matrix in chat |
| Deterministic order builder | ✅ |
| Order preview (staged ticket) | ✅ |
| User confirmation | ✅ `CONFIRM ORDER` |
| IBKR adapter | ✅ |
| Explain result | ✅ |
| LLM never raw IBKR HTTP | ✅ |

### Intent catalog vs client list

| Intent / action | Status |
|-----------------|--------|
| Market buy / sell | ✅ |
| Limit buy / sell | ✅ |
| Buy by shares | ✅ |
| Buy by $ notional | ✅ |
| Sell by shares | ✅ |
| Sell by % / half / reduce 25% | ✅ |
| Close entire position | ✅ |
| Close all positions | ✅ (stage one SELL per holding) |
| Stop-loss % on ticket | ✅ (protective stop field) |
| Trail by % | ✅ BUY → protective stop + hint; after fill → native TRAIL SELL via “Make it a trailing stop” / “Trail X by N%” |
| Trail by $ | 🟡 via TRAIL amount derived from %; bare “trail $2” not yet |
| Stop-limit | ❌ |
| Take-profit | ✅ “Take profit on half at 8%” → LMT SELL staged; TP% also stored on BUY ticket.target |
| Bracket (entry+stop+TP) | 🟡 fields on ticket; not one IBKR bracket child pack |
| OCO / conditional | ❌ |
| Add to position | 🟡 via another BUY (no special “add” intent) |
| Cancel staged ticket | ✅ REJECT ORDER |
| Cancel **working** IBKR order | ✅ “Cancel my open AAPL order” |
| Cancel all open orders | ✅ “Cancel all open orders” |
| Modify / replace working order | ❌ (cancel + recreate only — by design) |
| Move stop / stop to breakeven | ✅ “Move my stop to breakeven” → STP @ avg entry |
| Adjust TP / trailing | ✅ TP% + make trailing |
| Sell all profitable | ✅ “Sell all profitable positions” |
| View positions / BP / cash / equity | ✅ |
| View open / filled / rejected orders | 🟡 via Orders tab + partial chat |
| View P&L / exposure by sector | 🟡 basic; **sector exposure ❌** |
| “Buy if falls to…” conditionals | ❌ |
| Conversational follow-ups (“Add 3% stop” on last trade) | ✅ “Add a 3% stop” → STP on open position / single holding |
| Ask when size missing (“Buy Apple”) | ✅ |
| Ambiguous pronoun clarification | 🟡 partial |

**Intelligence Slice 1 + priority Slice 2 ≈ fulfilled for paper NL control.**  
**Still later:** brackets-as-children, OCO, conditionals, sector exposure, BYOB spike coding, IBKR fundamentals stack.

---

# PART B — Each Autonomous tab vs requirement

Prerequisite for all: **IBKR Gateway authenticated** (not OFFLINE).

| Tab | Working as required for paper demo? | What is correct | Gaps / watch-outs |
|-----|-------------------------------------|-----------------|-------------------|
| **Overview** | ✅ Yes | Live NAV/cash/BP, positions count, open vs awaiting confirm, chart, events | Cash `—` if gateway down (correct). Active Positions = **fills only**, not READY/WORKING |
| **Events** | ✅ Yes | Live engine log | Noisy; expected |
| **Reaction** | ✅ Yes | Symbol context from live orders/positions/market | Not a separate offline “demo engine” |
| **Orders** | ✅ Yes | Filters, Confirm/Reject, IBKR + Intelligence tickets | READY empty when max positions / no stage |
| **Positions** | ✅ Yes | Live holdings after fill | No Close button (use Intelligence) |
| **Financials** | ✅ Yes | Live session economics | Depends on gateway freshness |
| **Risk** | ✅ Yes | Exposure / limits / why staging stops | Edit limits in Settings |
| **Latency** | ✅ Yes | Health signals | Not deep latency analytics |
| **Data Feeds** | ✅ Yes | IBKR health; Robinhood may be DOWN | Robinhood DOWN ≠ IBKR broken |
| **Audit** | ✅ Yes | Event + order trail | — |
| **Settings** | ✅ Yes | Max positions, allocation, etc. | Restart/wait for next ticks after save |
| **Intelligence** | 🟡 Partial | Slice 1 NL paper trading + research intact | Full catalog / follow-ups / BYOB not done |

**Autonomous page itself** is the paper control center the client asked to test workflow on — **yes, that part is delivered.**  
It does **not** by itself satisfy BYOB research or full NL catalog.

---

# PART C — How to test (steps + prompts)

## C0. Before every test session

1. Start IBKR Client Portal Gateway.  
2. Login paper account → authenticated.  
3. Open app → IBKR LOGIN green / equity shows.  
4. Autonomous engine: **RUNNING**, mode **PAPER**.  
5. Note starting: Equity, Cash, Active Positions, Open Orders, Awaiting Confirm.

---

## C1. Overview — tests

### Happy path
1. Open Overview.  
2. Confirm Equity ≈ IBKR Paper.  
3. Confirm Active Positions = number of **FILLED open holdings** (not READY).  
4. Confirm Open Orders vs Awaiting Confirm match Orders filters.  
5. Chart: select SPY/QQQ → bars load (or honest empty, not fake).

### Edge cases
1. Stop gateway → Cash/BP become `—` → restart gateway → numbers return.  
2. Confirm a BUY → after FILLED, Active Positions +1.  
3. Leave order WORKING (limit not hit) → Active Positions unchanged.  
4. Stage only (READY) → Awaiting Confirm +1, Active Positions unchanged.

---

## C2. Events — tests

1. Engine RUNNING → new scan/risk lines appear.  
2. Hit max positions → see risk reject message.  
3. Gateway down → see gateway not ready messages.

---

## C3. Reaction — tests

1. Hold or ticket SPY.  
2. Open Reaction → select SPY.  
3. Quote/chart context appears.  
4. Edge: unknown/illiquid symbol → honest failure, no invented price.

---

## C4. Orders — tests

### Happy path
1. Wait for READY **or** create via Intelligence.  
2. Filter READY FOR CONFIRMATION.  
3. Click **Confirm** → WORKING/FILLED.  
4. Click **Reject** on another READY → leaves queue, no IBKR order.

### Edge cases
1. Confirm with gateway OFF → FAILED / broker error (expected).  
2. Confirm again same ticket → should not double-submit (idempotent / not READY).  
3. Filter ALL vs READY vs FILLED counts match Overview pills.  
4. Intelligence `INTELL-…` tickets visible and confirmable.

---

## C5. Positions — tests

1. After FILLED buy → symbol appears with qty/entry.  
2. After FILLED sell/close → qty drops or row gone.  
3. Edge: WORKING buy only → no new position row.  
4. Edge: no Close button → use Intelligence close.

---

## C6. Financials / Risk / Latency / Data Feeds / Audit / Settings

| Tab | Test |
|-----|------|
| Financials | Note cash/exposure → fill trade → values move |
| Risk | Fill to max positions → new autonomous READY stops; raise max in Settings → resumes |
| Latency | Gateway on/off changes health |
| Data Feeds | IBKR CONNECTED when logged in; Robinhood DOWN OK |
| Audit | Find last CONFIRM / FAIL in history |
| Settings | Set max positions 8 → save → new tickets can stage |

---

## C7. Intelligence — prompt pack (copy/paste)

### Setup prompts
```text
How much buying power do I have?
Show my open positions
```

### Core buys (must pass)
```text
Buy 1 share of SPY
```
→ expect staged ticket → then:
```text
CONFIRM ORDER <paste-id>
```

```text
Buy Apple
```
→ must ask shares or dollars (not guess).

```text
100 shares
```
or
```text
$500
```

```text
Buy $200 of QQQ
CONFIRM ORDER <id>
```

```text
Buy 1 AAPL with a 2% stop loss
CONFIRM ORDER <id>
```

```text
Place a limit order for TSLA at $390
```
(qty may be asked)

### Sells / close (must pass)
```text
Sell half my SPY
CONFIRM ORDER <id>
```

```text
Close my AAPL position
CONFIRM ORDER <id>
```

```text
Close all positions
```
→ one SELL ticket per holding → confirm each:
```text
CONFIRM ORDER <id1>
CONFIRM ORDER <id2>
```

### Reject path
```text
Buy 1 share of META
REJECT ORDER <id>
```
→ no position increase.

### Status / read-only
```text
Show my open positions
How much buying power do I have?
What’s my cash?
```

### Edge cases (must not break research)
```text
What should I buy today?
```
→ research/CHAT, **no** ticket.

```text
Analyze AAPL earnings
```
→ research path, no order.

```text
Buy -5 shares of AAPL
```
→ reject invalid qty, nothing staged.

```text
Sell 9999 shares of SPY
```
→ cap to holdings (or refuse if flat).

```text
Close my AAPL position
```
when no AAPL → honest “no open position”.

### Slice 2 prompts (should stage / cancel — still CONFIRM for new tickets)
```text
Buy NVDA and trail it by 3%
CONFIRM ORDER <id>
Make it a trailing stop instead
CONFIRM ORDER <id>

Move my stop to breakeven
Add a 3% stop
Take profit on half at 8%
Cancel my open AAPL order
Cancel all open orders
Sell all profitable positions
```

### Still later (expect fail / research — not regression)
```text
Buy AAPL if it falls to $215
Show my exposure by sector
```

---

## C8. Full paper workflow (client demo script — 15 min)

1. Gateway green · Overview shows equity.  
2. Intelligence: `Buy 1 share of SPY` → Confirm.  
3. Orders: FILLED/WORKING · Positions: SPY · Overview positions +1.  
4. Intelligence: `Close my SPY position` → Confirm.  
5. Positions clear/reduce · Overview updates.  
6. Autonomous: wait for READY or raise max positions · Confirm one engine ticket.  
7. Events shows the path · Audit can find it.  
8. Kill/Pause engine → no new autonomous stages.

**Pass criteria:** all steps use real IBKR Paper; no demo fake rows; Confirm always required; research prompts still don’t trade.

---

# PART D — Honest scorecard for the client

| Theme | Score |
|-------|-------|
| IBKR Paper broker workflow (execute / positions / balances / status) | **Done** |
| Autonomous console tabs live (not demo) | **Done** |
| Intelligence NL paper control (core buy/sell/close/confirm/status) | **Done (Slice 1)** |
| Priority NL catalog (cancel / TP / breakeven / trail / sell winners) | **Done (Slice 2)** |
| Full NL (brackets/OCO/conditionals/sector) | **Not done** |
| IBKR full market-data/fundamentals fallback | **Not done** |
| BYOB research + architecture recommendation | **Done (memo)** |
| Live multi-user IBKR | **Blocked / gated on IBKR + memo acceptance** |

---

# PART E — What to say to the client (1 paragraph)

We have connected **IBKR Paper** to Requi and delivered a working paper trading workflow across **Autonomous** and **Intelligence** (NL buy/sell/close/cancel/TP/stop/trail/status with mandatory confirm; LLM never talks to IBKR directly), plus a written **BYOB architecture research memo**. Remaining asks are **advanced order packs** (bracket/OCO/conditionals), **sector exposure**, **IBKR fundamentals fallback**, and **BYOB spike coding** only after client + IBKR sign-off.

---

*Use with Gateway authenticated · Paper only · Update this file as Slice 2 / BYOB memo land*
