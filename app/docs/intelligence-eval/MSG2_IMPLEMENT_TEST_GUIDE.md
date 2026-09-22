# Step-by-step guide — What the client wants today + how to implement & test

**Focus:** Client Message 2 (NL control of IBKR Paper)  
**Not today:** BYOB multi-user gateways, live trading  

---

## A. What the client wants **today** (in plain English)

They want users to **talk to Intelligence** and control an **IBKR Paper** account, for example:

| They say | System should |
|----------|----------------|
| Buy 100 AAPL / Buy $5000 NVDA | Build a real paper order (shares or dollars) |
| Limit / stop / trail | Use the right order type — not invent prices |
| Close half / close AMD / sell profitable | Use **real** positions |
| Add a 3% stop → make it trailing → take half at 8% | Remember the trade (**multi-turn**) |
| Show positions / buying power | Answer from the broker account |
| Buy Apple (no size) | **Ask** — don’t guess |

**Hard rules they care about:**

1. LLM **never** sends raw IBKR API calls.  
2. Strict internal order schema → deterministic builder → preview → confirm → IBKR Paper.  
3. Paper only; live stays off.

**Your `.env` today:** `INTELLIGENCE_BROKER=PAPER` and `IBKR_ACCOUNT=DUR506819` — so chat still stages on the **internal simulator**, not IBKR paper, until you switch and log into the gateway.

---

## B. What to do this week (order of work)

```
Day 1   Baseline + IBKR Paper connected (existing thin path)
Day 2–3 Intent catalog + TradingAction schema + unit tests (simulator OK)
Day 4–5 View intents + core MKT/LMT place on IBKR Paper
Later   Stops / trail / multi-turn / cancel (Message 2 golden dialogue)
```

Do **not** start BYOB containers this week.

---

## C. Step-by-step: implement & test

### Step 0 — Send the client reply (if not sent)

1. Send [`CLIENT_REPLY_MSG2_NL_TRADING.md`](./CLIENT_REPLY_MSG2_NL_TRADING.md).  
2. Attach [`client-msg2-nl-trading-pipeline.png`](./client-msg2-nl-trading-pipeline.png).  
3. Wait for answers to the 3 clarifying questions (defaults, research vs order mode, confirm UX).

---

### Step 1 — Prove today’s thin path still works (Requi PAPER)

**Goal:** Don’t break current Intelligence trade flow.

1. In `app/.env` keep:
   ```bash
   INTELLIGENCE_BROKER=PAPER
   ```
2. Start app:
   ```bash
   cd app
   npm run dev
   ```
3. Open `http://localhost:3002/app` → Intelligence.  
4. **Manual test script:**

   | # | You type | Expect |
   |---|----------|--------|
   | 1 | `Buy 5 AAPL` | Advisory (FAVORABLE/WAIT/…) — **no** ticket yet |
   | 2 | `stage it` | Ticket `READY_FOR_CONFIRMATION`, shows ticket id |
   | 3 | `CONFIRM ORDER <ticketId>` | Fills on **Paper** broker |
   | 4 | `Buy Apple` | Should not invent crazy size; note behavior for later clarify |

5. **Automated:**
   ```bash
   npx vitest run api/intelligence/trade-symbol.test.ts
   ```

**Pass:** Confirm → paper fill. **Fail:** Fix before touching IBKR.

---

### Step 2 — Connect IBKR Client Portal Gateway (paper account)

**Goal:** Gateway session alive for account `DUR506819` (confirm this is paper `DU…`).

1. Install/run **IBKR Client Portal Gateway** (Java or Docker).  
2. Open gateway login (usually `https://localhost:5000`) → log in with the **paper** user → complete 2FA.  
3. In `app/.env`:
   ```bash
   IBKR_GATEWAY_URL=https://localhost:5000/v1/api
   IBKR_ACCOUNT=DUR506819
   # keep PAPER until Step 3 passes health
   INTELLIGENCE_BROKER=PAPER
   ```
4. Restart `npm run dev`.  
5. **Health checks** (browser Network tab or tRPC):
   - `execution.brokers` → `IBKR` should show configured / ok when gateway auth’d  
   - Or call gateway: `GET https://localhost:5000/v1/api/iserver/auth/status` → authenticated  

**Pass:** Auth status authenticated. **Fail:** Stay on PAPER; fix gateway login / SSL / port.

---

### Step 3 — Point Intelligence at IBKR Paper (existing path only)

**Goal:** Same buy → stage → confirm flow hits **IBKR paper**, not the simulator.

1. Change `.env`:
   ```bash
   INTELLIGENCE_BROKER=IBKR
   ```
2. Restart server.  
3. **Manual test:**

   | # | Action | Expect |
   |---|--------|--------|
   | 1 | `Buy 1 AAPL` → `stage it` | Ticket `broker` / `effectiveBroker` = **IBKR**, account `DUR506819` |
   | 2 | `CONFIRM ORDER <id>` | Order appears in IBKR paper (TWS/Client Portal / open orders) |
   | 3 | Check positions | IBKR paper shows the fill (or working order) |

4. If IBKR fails, registry should **not** silently look like success on live money — note degraded-to-paper messages.

**Pass:** Confirmed ticket creates a real IBKR paper order.  
**This is the minimum “connect IBKR to Intelligence for paper trading” demo.** Full NL catalog is still unfinished.

---

### Step 4 — Implement Message 2 foundation (code)

Work in this order; keep LLM off the broker.

#### 4.1 Intent catalog (doc + enum)

- File suggestion: `app/docs/intelligence-eval/TRADING_INTENT_CATALOG.md`  
- Code enum: e.g. `api/intelligence/trading/intents.ts`  
- Copy IDs from [`IBKR_INTELLIGENCE_PHASE_PLAN.md`](./IBKR_INTELLIGENCE_PHASE_PLAN.md) §7  

**Test:** Checklist review with team — every client example maps to one intent ID.

#### 4.2 Zod `TradingAction` schema

- File suggestion: `api/intelligence/trading/schema.ts`  
- Fields: intent, symbol, side, quantity?, notional?, orderType, limitPrice?, stopPrice?, trailPct?, trailAmt?, tif, accountMode=`PAPER`  

**Test:**
```bash
npx vitest run api/intelligence/trading/schema.test.ts
```
Invalid qty / missing limit on LMT must fail parse.

#### 4.3 Deterministic extractor (no broker call)

- Parse “Buy 100 AAPL”, “Buy $5000 NVDA”, “limit TSLA at 390”  
- Ambiguous “Buy Apple” → `{ needsClarification: true, question: "..." }`  

**Test:** table-driven unit tests per utterance (Cluster A examples).

#### 4.4 Wire extractor → preview → existing `proposeTicket` / confirm

- Do **not** let Lucia call IBKR.  
- Risk-increasing → still `CONFIRM ORDER {ticketId}`.  

**Test:** vitest for extractor + one integration test with PaperBroker; then repeat Step 3 manual on IBKR.

#### 4.5 View intents (read-only)

- “Show my positions”, “buying power”, “open orders”, “P&L today”  
- Call `BrokerAdapter.getPositions` / `getAccounts` / `getOpenOrders` — narrate results only.

**Test:** With IBKR connected, chat returns real paper numbers.

#### 4.6 Multi-turn context (after core place works)

- Persist last symbol / last draft / last ticket (DB preferred over in-memory Map).  
- “Add a 3% stop” / “make it trailing” / “take half at 8%”.  

**Test:** Scripted NVDA dialogue on IBKR paper (client golden path).

---

### Step 5 — Regression tests (run every day you change trade code)

```bash
cd app

# Intent / symbol / market (existing)
npx vitest run api/intelligence/trade-symbol.test.ts
npx vitest run api/intelligence/general-market.test.ts

# Add as you build
npx vitest run api/intelligence/trading/

# Broader safety net before client demo
npx vitest run
```

**Manual smoke before any client call:**

1. Research: `How's the market today?` still works (don’t break Rev 9/14).  
2. Trade: `Buy 1 AAPL` → stage → confirm on IBKR paper.  
3. Ambiguity: `Buy Apple` asks for size (once Step 4.3 shipped).  
4. Safety: no ticket when user only asks “Should I buy AAPL?”

---

### Step 6 — Demo checklist for the client (Message 2 MVP)

When Steps 1–4.5 are done, record a short screen share:

- [ ] Gateway authenticated (paper)  
- [ ] `INTELLIGENCE_BROKER=IBKR`  
- [ ] Buy 1 share → stage → `CONFIRM ORDER …` → visible in IBKR paper  
- [ ] “Show my positions” / buying power  
- [ ] Pipeline slide (PNG already prepared)  
- [ ] Say clearly: stops/trail multi-turn and full catalog = next increment; live = off; BYOB = separate track  

---

## D. What “done for today” can mean (pick one)

| If you only have a few hours | Done = |
|------------------------------|--------|
| **Minimum** | Client reply sent + Step 1 green |
| **Good** | Steps 1–3: Intelligence confirm lands on IBKR paper |
| **Strong** | Good + intent catalog doc + schema + first extractor tests |

---

## E. Do not do yet

- Live (`U…`) account  
- Auto Docker gateway per user / `user.ibkr.…` subdomains  
- Letting the model invent order JSON for IBKR  
- Skipping confirmation on buys  

---

*Guide path: `app/docs/intelligence-eval/MSG2_IMPLEMENT_TEST_GUIDE.md`*
