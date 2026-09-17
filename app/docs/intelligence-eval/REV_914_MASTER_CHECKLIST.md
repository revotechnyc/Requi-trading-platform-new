# Client Rev 9/14 — Master completion checklist

**Goal:** Every PDF requirement built + every test pack scored **Pass** before client sign-off.  
**Sources:** `Requi 9_14 revision .pdf` (41 pp) · `CLIENT_REV_914_TESTING.md` · `IMPLEMENTATION_PHASES_REV_914.txt`  
**Rule:** Run `npx vitest run` + golden scripts after each sprint. Do not break trade / Rev-1 / MT-001.

**Legend:** ✅ Pass · 🟡 Partial · ⬜ Not built · 🔬 Lab only · 📝 Logged in SCORING_SHEET

---

## Executive progress (Sep 17, 2026)

| Area | Done | Total | % |
|------|------|-------|---|
| PDF Phase 1 (market snapshot) | 18 | 28 | 64% |
| PDF Phase 2 (discovery) | 8 | 16 | 50% |
| PDF Phase 3 (earnings + UI) | 12 | 18 | 67% |
| PDF Phase 4 (observability) | 3 | 12 | 25% |
| Test packs A–G | 6 | 7 packs | 86% |
| Golden scripts 1–3 | 3 | 3 | 100% |
| Multi-turn MT-001–005 | 1 | 5 | 20% |

**Client demo:** Ready for Scripts 1–3, E1, F1, A2, G1.  
**Not ready for sign-off:** B2–B6, C2–C3 labs, calendar UI auto-open, discovery depth, G3 trace, MT-002–005.

---

## PHASE A — US default + intent (PDF §§1–3)

| ID | Requirement / test | Status | Sprint | Notes |
|----|-------------------|--------|--------|-------|
| A1-1 | `How's the market today?` — no country ask | ✅ | — | Live Pass |
| A1-2 | `What's moving?` — US default | ✅ | — | Pack E1 |
| A1-3 | `What stock should I buy today?` — US default | ✅ | — | Script 2 |
| A1-4 | `Is today a good trading day?` | 📝 | — | Re-test fresh chat |
| A1-5 | `What's happening in the market?` | 📝 | — | Re-test fresh chat |
| A2 | `How is Japan doing?` — WAIT, not US fake | ✅ | 1 | Shipped |
| A3-GENERAL | `How's the market today?` → GENERAL_MARKET | ✅ | — | |
| A3-DISCOVERY | `What should I buy today?` → STOCK_DISCOVERY | ✅ | — | |
| A3-MOVERS | `What's moving?` → MARKET_MOVERS | ✅ | — | |
| A3-EARNINGS | `Who reports earnings tomorrow?` → EARNINGS | ✅ | — | |
| A3-TICKER | `What is NVDA RSI?` → technical | 📝 | — | Spot-check |
| A3-NEWS | `Why is NVDA down?` → news/ticker | 📝 | — | Spot-check |
| A3-TRADE | `buy 5 NVDA` → TRADE_REQUEST | 📝 | — | Regression probe |
| A3-EDU | `What is a PE ratio?` → education | 📝 | — | Must not invent market data |

**Exit:** A1 all Pass · A2 Pass · A3 ≥90% — **~85% done, spot-checks remain**

---

## PHASE B — General market snapshot (PDF §§4–10, 17, 27)

| ID | Requirement / test | Status | Sprint | Notes |
|----|-------------------|--------|--------|-------|
| B1-1 | `How's the market today?` — 6-item checklist | ✅ | — | Live Pass Sep 17 |
| B1-2 | `How is the market?` | 📝 | — | Same pipeline |
| B1-3 | `Is the market good today?` | 📝 | — | Same pipeline |
| B2 | Index drill-down SMA/RVOL per SPY/QQQ/DIA/IWM | 🟡 | **2** | **Not built** — returned generic snapshot |
| B3 | Breadth + sector leaders + VIX in one ask | ⬜ | **2** | Breadth proxy only; no VIX bands |
| B4 | Health V1 unit tests (weights + regime) | ✅ | — | general-market.test.ts |
| B5 | Partial failure — one feed down, still answers | ⬜ | **2** | Logic exists; lab not run |
| B6 | Closed/stale session labeling | ⬜ | **2** | Pack B6 not verified |
| PDF-1.3 | Major news in snapshot | ⬜ | 6+ | major_news empty |
| PDF-1.6 | Sector LEADING/STRONG/WEAK labels | ⬜ | **2** | Raw % only today |
| PDF-1.7 | Spot VIX + LOW→EXTREME bands | ⬜ | **2** | VIXY proxy only |
| PDF-1.5 | True advance/decline breadth | ⬜ | **2** | Index proxy; live shows Breadth 100/0 issues |
| PDF-1.10 | MarketSnapshotService (shared cache) | ⬜ | 5 | Per-request calc today |

**Exit:** B1–B6 all Pass — **B1 done; B2–B6 open (Sprint 2)**

---

## PHASE C — Provider fallback (PDF §§13–16)

| ID | Requirement / test | Status | Sprint | Notes |
|----|-------------------|--------|--------|-------|
| C1-1 | `What's SPY trading at?` — source cited | 📝 | — | Spot-check |
| C1-2 | `How's the market today?` — source cited | ✅ | — | Yahoo on indexes |
| C2 | Broker off → Yahoo still answers | 🔬 | **5** | Lab test |
| C3 | All providers down → explicit UNAVAILABLE | 🔬 | **5** | Lab test |
| PDF-1.9 | Tertiary secondary provider | ⬜ | 5 | Not wired |
| PDF-1.9 | Session freshness gates (60s/300s) | ⬜ | **2** | Partial |

**Exit:** C1 Pass · C2/C3 lab Pass — **~40% done**

---

## PHASE D — Stock discovery (PDF §§11–12, 28)

| ID | Requirement / test | Status | Sprint | Notes |
|----|-------------------|--------|--------|-------|
| D1-1 | `What stock should I buy today?` — engine list | ✅ | — | Script 2 |
| D1-2 | `What should I buy today?` | ✅ | — | |
| D1-3 | `Give me stocks to watch` | 📝 | — | Re-test |
| D1-4 | `What looks good?` | 📝 | — | Re-test |
| D1-5 | `Find me a stock` | 📝 | — | Re-test |
| D2-1 | `Why is the top one ranked first?` | ✅ | — | Script 2 |
| D2-2 | `Which of those is riskiest?` | ✅ | — | Script 2 |
| D2-3 | `Why those?` / `What's the risk on the top one?` | 📝 | **4** | Pattern aliases |
| D3 | Regime-aware buy ask | 📝 | **4** | Partial — regime shown, depth gaps |
| PDF-2.1 | Industry ranking in pipeline | ⬜ | **4** | |
| PDF-2.1 | Catalyst + news in rank | ⬜ | **4** | |
| PDF-2.1 | Fundamental quality filter | ⬜ | **4** | |
| PDF-2.1 | STOCK_SCORE PDF §12 weights | ⬜ | **4** | Simplified score today |
| PDF-2.1 | Remove PARTIAL/WAIT desk lines | ⬜ | **4** | |

**Exit:** D1–D3 Pass · no invented tickers — **core done; depth Sprint 4**

---

## PHASE E — Market movers (PDF §3)

| ID | Requirement / test | Status | Sprint | Notes |
|----|-------------------|--------|--------|-------|
| E1-1 | `What's moving?` | ✅ | — | Live Pass |
| E1-2 | `What's hot?` | ✅ | — | Live Pass |
| E1-3 | `What's crashing?` | ✅ | — | Full board OK per pack |
| E1-4 | `Biggest movers` | 📝 | — | Run once |
| PDF-1.11 | Catalyst per mover | ⬜ | 4 | Optional depth |

**Exit:** E1 all Pass — **~90% done (Biggest movers pending)**

---

## PHASE F — Earnings calendar (PDF §§18–19, 29)

| ID | Requirement / test | Status | Sprint | Notes |
|----|-------------------|--------|--------|-------|
| F1-all | Tomorrow/today/ER/BMO/AMC phrasings | ✅ | 1+3 | 11/11 Pass after session fix |
| F1-after-close | `Who reports after close tomorrow?` | ✅ | 3 | Fixed Sep 17 |
| F1-before-open | `Who reports before open today?` | ✅ | 3 | Fixed Sep 17 |
| F2-1 | Who reports tomorrow | ✅ | — | Script 3 |
| F2-2 | Keep the top 3 only | ✅ | — | Script 3 |
| F2-3 | Go deeper on those | ✅ | — | Script 3 |
| F2-4 | Bottom 3 ≠ top 3 | 📝 | — | Re-test |
| PDF-3.1 | Trading-day tomorrow | ✅ | 1 | |
| PDF-3.1 | Provider fallback before empty | ⬜ | **3** | Finnhub only |
| PDF-3.1 | CONFIRMED vs ESTIMATED labels | 🟡 | **3** | Partial in table |
| PDF-3.2 | **Calendar UI auto-opens from chat** | ⬜ | **3** | **PDF §19 gap** |
| PDF-3.1 | Rev-1 date aligns with calendar | ⬜ | **3** | ALMU/ABAT ticket |

**Exit:** F1–F2 Pass · UI auto-render — **backend done; UI Sprint 3**

---

## PHASE G — LLM contract + observability (PDF §§21–26, 31)

| ID | Requirement / test | Status | Sprint | Notes |
|----|-------------------|--------|--------|-------|
| G1 | Memory bypass probe | ✅ | 1 | Shipped |
| G2 | Confidence = coverage not win-% | ✅ | — | Wording in live replies |
| G3 | Request trace per turn | ⬜ | **5** | Not built |
| PDF-4.2 | Full confidence formula 50/30/20 | ⬜ | **5** | |
| PDF-4.4 | Calculation versioning | ⬜ | **5** | |
| PDF-22 | Consolidated system instruction block | 🟡 | **5** | Partial in lucia-prompt |

**Exit:** G1–G3 Pass — **G1–G2 done; G3 Sprint 5**

---

## Golden scripts (client demos)

| Script | Steps | Status | Fresh chat? |
|--------|-------|--------|-------------|
| **1** | Market → leading → risky | ✅ Pass | Yes |
| **2** | Buy today → why → risk | ✅ Pass | Yes Sep 17 |
| **3** | Movers → earnings → top 3 → deeper | ✅ Pass | Prior session |

---

## Multi-turn scripts (Phase 3 conversation)

| ID | Script | Status | Notes |
|----|--------|--------|-------|
| MT-001 | Earnings → select → go deeper | ✅ | Script 3 equivalent |
| MT-002 | Compare → FOMC risk → invalidation | 📝 | Not scored |
| MT-003 | buy NVDA → risks → stage it | 📝 | Regression — run |
| MT-004 | TSLA moving → catalysts → alert | 📝 | |
| MT-005 | Research → remove AMD → rank | 📝 | |

---

## PDF Phase 4 / future (post core sign-off)

| Item | Status | Sprint |
|------|--------|--------|
| Economic calendar (PDF §20) | ⬜ | 6+ |
| NL screener | ⬜ WAIT | 6+ |
| Fundamental time-series compare | ⬜ WAIT | 6+ |
| Market snapshot UI panel | ⬜ | 6+ |
| Regime backtest calibration | ⬜ | 6+ |

---

## Sprint execution order (do not skip)

| Sprint | Weeks | Build | Test to close | Regression |
|--------|-------|-------|---------------|------------|
| **1** ✅ | 1 | A2, G1, earnings tomorrow, session filters | A2, G1, F1, Scripts 1–3 | vitest 181+ |
| **2** 🔜 | 1–2 | B2 index depth, VIX bands, true breadth, B5/B6 | B2, B3, B5, B6, Script 1 | vitest + Script 1 |
| **3** | 1–2 | Calendar UI auto-open, earnings fallback, F2 bottom-3 | F1 UI, F2, MT-001 | Script 3 + UI visible |
| **4** | 2 | Discovery industry/catalyst/fundamentals, D aliases | D1–D3, Script 2 | Script 2 |
| **5** | 2 | Trace, confidence formula, C2/C3 labs | G2, G3, C labs | Full A–G |
| **6+** | — | Economic calendar, snapshot UI, calibration | PDF §20 | — |

---

## Definition of “all testing done” for client

Client can receive **final sign-off** when ALL are true:

- [ ] Every row in this checklist ✅ or documented WAIT (future phase)
- [ ] Golden scripts 1–3 Pass (fresh chat) — **3/3 done**
- [ ] Packs A–G exit criteria checked — **~6/7 done**
- [ ] MT-001–003 scored Pass — **1/3 done**
- [ ] `npx vitest run` full suite green
- [ ] SCORING_SHEET.md + weekly report filed
- [ ] Anti-pattern checklist: zero instant-fails in scored runs

**Estimated remaining:** ~4–6 weeks focused sprints (Sprints 2–5) for Rev 9/14 core. Phase 6+ is explicitly post-revision.

---

## Your next 3 actions (start now)

1. **Log** all ✅ rows above into `SCORING_SHEET.md` (Rev 9/14 section below).
2. **Implement Sprint 2.1** — `formatIndexDepthReply` so B2 Passes (your live test failed this).
3. **Run remaining 📝 prompts** in fresh chats — takes ~2 hours; no code needed for A1-4, E1-4, D1-3–5, F2-4, MT-002–003.
