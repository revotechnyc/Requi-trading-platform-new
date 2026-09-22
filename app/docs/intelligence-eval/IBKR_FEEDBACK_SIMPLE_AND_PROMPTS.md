# IBKR client feedback — simple language + every test prompt

**Source:** Manisha latest feedback (2 messages) + one-line ask to connect IBKR paper to Intelligence.  
**Rule from client:** Paper first. LLM never sends raw IBKR API. Live locked until proven.

---

## Part 1 — What the client wants (simple language)

There are **three asks** hiding in this email.

### Ask 0 (one line)
> “also can you connect IBKR to intelligence for paper trading”

**Meaning:** When someone trades from the Intelligence chat, orders should be able to go to a real **IBKR Paper** account (fake money at IBKR), not only our internal simulator.

---

### Message 1 — Connect IBKR + research “each user brings their own broker”

**A) Use IBKR as another broker and data source**

- Add IBKR so we can place paper orders, see positions, balances, order status.
- Also check if IBKR can help with prices, history, earnings, corporate actions, contract info — as a **backup**, not necessarily replacing Yahoo/etc.
- Only where IBKR’s rules/license allow it.

**B) Research BYOB (Bring Your Own Broker)**

- Today many platforms pay IBKR a lot to connect **all** customers through one big institutional hookup.
- Client asks: can each user log into **their own** IBKR, with their own gateway (maybe `user123.ibkr…`), so RTI talks to **that user’s** IBKR only?
- Path they imagine: `RTI → user broker box → user’s IBKR → IBKR`
- Must check if this is **allowed by IBKR law/API**, not a trick to dodge fees.
- Answer 10 research questions (which API, auth, containers, subdomains, paper vs live, data sharing rules, limits, security, what IBKR requires of us).
- Design a reusable **Broker Adapter** layer (IBKR now, Alpaca later).
- **Deliver a plan first — do not code live-account multi-user yet.**

---

### Message 2 — Talk to trade on IBKR Paper

**Meaning:** Users type normal English; the app understands and builds real paper orders.

Examples they care about: buy shares, buy dollars, sell half, close position, stop %, trail %, limit, move stop to breakeven, cancel, show positions, buying power, etc.

**How they want the pipes to work (must follow):**

```
What user said
  → Guess the intent (buy? cancel? show?)
  → Pull out symbol, qty, prices
  → Remember this chat’s trade context
  → Check account / positions are real
  → Check risk + paper-only permission
  → Build a strict order object in OUR code (not the LLM)
  → Show preview
  → User confirms
  → IBKR adapter
  → IBKR Paper
  → Explain what happened
```

**Hard rules:**
- LLM **never** calls IBKR directly.
- If info missing (“Buy Apple”) → **ask**, don’t guess.
- If “sell it / close that” is unclear → **ask**.
- Paper only until security/risk proven.
- Deliver an **intent catalog** mapping each action → RTI function → IBKR capability.

---

## Part 2 — Word-by-word themes (what each block means)

| Client words | Simple meaning |
|--------------|----------------|
| additional broker/data source | IBKR is extra lane, not only lane |
| Paper Trading / without live capital | Fake-money IBKR account for testing |
| data-source hierarchy / fallback | Try main feeds first; IBKR if allowed when others fail |
| BYOB | Each user uses their own IBKR login/session |
| user123.ibkr… | Optional private URL per user gateway |
| not circumvent commercial fee | Don’t design to cheat IBKR pricing |
| research … before coding live | Written answers first |
| Broker Adapter Layer | Same plug shape for IBKR, Alpaca, … |
| natural-language prompts | Chat = trading UI |
| Intent Recognition … Order Builder | Fixed pipeline; LLM is translator only |
| strict internal trading schema | Typed fields (symbol, qty, type…) |
| NEVER raw broker API from LLM | Safety |
| detect missing / ambiguous | Clarifying questions |
| pronouns / follow-up | Multi-turn memory of last trade |
| PAPER only; live separately permissioned | Feature flag live off |
| intent catalog | Spreadsheet/spec of every action |

---

## Part 3 — What is already built vs not

| Piece | Status |
|-------|--------|
| Paper simulator broker | Done |
| IBKR Client Portal adapter (orders/positions) | Partial — needs gateway login + harden |
| `INTELLIGENCE_BROKER=PAPER` today | Chat still on **simulator** until set to IBKR + gateway up |
| Thin chat: buy → advisory → stage → confirm | Done (narrow) |
| Full NL catalog (limit/stop/trail/half/cancel/views) | **Not done** |
| Multi-turn “add 3% stop → trailing → take half” | **Not done** |
| BYOB per-user gateways | **Not done** (research only for now) |
| Clarification on “Buy Apple” | **Not done** |

**Honest “implement this”:** Full Message 1+2 is **weeks**. Safe order: (1) IBKR paper connected to chat, (2) intent catalog + schema, (3) one NL family at a time on paper, (4) BYOB research memo, (5) live later.

---

## Part 4 — ALL exact prompts from this feedback (copy/paste to test)

Use **fresh chat** where noted. Target venue when testing Message 2: IBKR Paper (after gateway + `INTELLIGENCE_BROKER=IBKR`). Until then, mark whether reply is simulator vs IBKR.

### 4.1 Core examples (first list in Message 2)

```
Buy 100 shares of AAPL.
```
```
Buy $5,000 of NVDA.
```
```
Sell half my Tesla position.
```
```
Close my entire AMD position.
```
```
Buy 50 shares of AAPL with a 2% stop loss.
```
```
Buy NVDA and trail it by 3%.
```
```
Place a limit order for TSLA at $390.
```
```
Move my stop loss to breakeven.
```
```
Cancel my open Apple order.
```
```
Show me my open positions.
```
```
How much buying power do I have?
```
```
Sell all profitable positions.
```
```
Close this position.
```
```
Reduce my position by 25%.
```

### 4.2 Multi-turn golden dialogue (same chat, in order)

```
Buy 100 shares of NVDA.
```
```
Add a 3% stop.
```
```
Make it a trailing stop instead.
```
```
Take profit on half at 8%.
```

### 4.3 Ambiguity / clarification (must ASK, not guess)

```
Buy Apple.
```
```
Sell it.
```
```
Close that.
```
```
Move my stop.
```
```
Buy another 50.
```
```
Take half off.
```
```
Protect my profit.
```
```
Cancel that order.
```

### 4.4 Advanced NL commands

```
Buy 100 AAPL at $220 or better.
```
```
Buy AAPL if it falls to $215.
```
```
Sell 50% if AAPL reaches $240.
```
```
Trail NVDA by 2%.
```
```
Move my NVDA stop to 1% above my entry.
```
```
Cancel every unfilled order.
```
```
Close all my positions.
```
```
Show me everything I bought today.
```
```
Which positions are currently down more than 3%?
```
```
Show my open orders for Tesla.
```
```
What’s my P&L today?
```
```
Show me my exposure by sector.
```

### 4.5 Schema example the system should understand (not a user chat line)

Client’s internal example (for builders/tests of the schema):

- Intent: PLACE_ORDER  
- Symbol: AAPL  
- Side: BUY  
- Quantity: 100  
- Order Type: LIMIT  
- Limit Price: 225.00  
- Time in Force: DAY  
- Stop Loss: 2%  
- Take Profit: 5%  
- Account: PAPER  

Equivalent user phrasing to exercise that schema:

```
Buy 100 AAPL limit 225 with 2% stop and 5% take profit.
```

### 4.6 Clarification question the system should ask (expected bot behavior)

When user says `Buy Apple.` with no size, bot should ask something like:

> How much AAPL would you like to buy — shares or dollar amount?

---

## Part 5 — Capability checklist (from Message 2 “understand at minimum”)

Use as Pass/Fail columns while testing (even before full NL exists — mark **N/A / Not built**).

**Place:** market buy/sell · limit buy/sell · stop · stop-limit · trail % · trail $ · trail-limit · take-profit · bracket · OCO  

**Size:** shares · notional $ · sell shares · sell % · partial · close one · close all · add · reduce  

**Manage:** cancel · cancel all · modify · replace · move stop · stop→breakeven · adjust TP · adjust trail  

**View:** open orders · filled · rejected/cancelled · positions · P&L · balance · cash/BP · avg entry · mkt price · history · exposure  

---

## Part 6 — Scoring sheet (tick while you test)

| # | Prompt (short label) | Pass / Partial / Fail / Not built | Notes / screenshot |
|---|----------------------|-----------------------------------|--------------------|
| 1 | Buy 100 AAPL | | |
| 2 | Buy $5000 NVDA | | |
| 3 | Sell half Tesla | | |
| 4 | Close AMD | | |
| 5 | Buy 50 AAPL + 2% stop | | |
| 6 | Buy NVDA trail 3% | | |
| 7 | Limit TSLA 390 | | |
| 8 | Stop to breakeven | | |
| 9 | Cancel Apple order | | |
| 10 | Show positions | | |
| 11 | Buying power | | |
| 12 | Sell all profitable | | |
| 13 | Close this | | |
| 14 | Reduce 25% | | |
| MT1–4 | NVDA multi-turn | | |
| A1–A8 | Ambiguity set | | |
| ADV1–12 | Advanced set | | |

---

## Part 7 — What to do next (implementation order)

1. **Today/tomorrow:** Gateway login + set `INTELLIGENCE_BROKER=IBKR` → prove existing buy/stage/confirm hits IBKR paper.  
2. **This week:** Publish intent catalog file (see `TRADING_INTENT_CATALOG.md`) + start Zod schema.  
3. **Next:** NL place MKT/LMT + view positions/BP on paper.  
4. **Then:** stops/trail/multi-turn.  
5. **Later:** BYOB research answers to client’s 10 questions (no mass coding until approved).  
6. **Live:** only after paper + risk + security pass.

---

*Path: `app/docs/intelligence-eval/IBKR_FEEDBACK_SIMPLE_AND_PROMPTS.md`*
