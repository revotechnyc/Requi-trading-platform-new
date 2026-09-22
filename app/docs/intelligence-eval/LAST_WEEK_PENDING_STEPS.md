# Last week pending — implement & test steps (Rev 9/14)

**Not this list:** IBKR NL Message 2 (separate track — do after or in parallel later).  
**This list:** Sprint 2 / daily-status leftovers from Intelligence market work.

---

## Already done last week (don’t rebuild)

- Index drill-down code path (B2): `isIndexDepthQuery` + `formatIndexDepthReply` + unit tests  
- Breadth / sector labels / spot VIX helpers in `general-market.ts`  
- HMR DB pool / duplicate runner fix (workspace hang)  
- Golden scripts 1–3 still demo-ready  

## Still pending (pick from here)

| Priority | Item | Why pending |
|----------|------|-------------|
| **P0** | Block staging when advisory = **WAIT** | Daily status asked; `stage-ticket.ts` still allows WAIT |
| **P1** | B6 — human “market closed / stale” banner | Session often raw enum; Pack B6 not Pass |
| **P2** | Live re-test B2 + update scoring sheet | Code exists; checklist still Partial |
| **P3** | Re-test 📝 prompts (A1-4/5, E1-4, D1-3…) | Scoring only — little/no code |
| **P4** | B5 lab — one feed down, still answers | Manual lab |

Do **P0 → P1 → P2** this working block. Stop after those if time is short.

---

## Step-by-step implementation

### Change 1 (P0) — Don’t stage when advisory says WAIT

**Files**
- `app/api/intelligence/stage-ticket.ts`
- Add/extend test: `app/api/intelligence/stage-ticket.test.ts` (create if missing)

**Implement**
1. Open `stageTicketFromAdvisory`.  
2. Today it blocks only `UNFAVORABLE` / `BLOCKED`.  
3. Also block `WAIT` (same style as UNFAVORABLE): return a clear message like  
   `Cannot stage while advisory is WAIT — need fresher data / favorable setup.`  
4. Update the file comment that says “FAVORABLE / WAIT may stage”.

**Test**
```bash
cd app
npx vitest run api/intelligence/stage-ticket.test.ts
npx vitest run api/intelligence/trade-symbol.test.ts
```
**Manual**
1. Force a WAIT advisory (thin data / off-hours symbol if needed) or mock.  
2. `Buy 5 AAPL` → if WAIT → `stage it` must **refuse**.  
3. FAVORABLE path must still stage.

---

### Change 2 (P1) — Market closed / stale labeling (Pack B6)

**Files**
- `app/api/intelligence/general-market.ts`  
- `app/api/intelligence/general-market.test.ts`

**Implement**
1. Add helper e.g. `formatSessionBanner(session, stale, asOf)`:
   - `CLOSED` / after-hours → **“US cash session closed — quotes may be last sale / delayed.”**  
   - `PRE_MARKET` / `AFTER_HOURS` → label clearly  
   - Any `stale: true` on indexes → **“Data marked stale/delayed.”**  
2. Use it at the top of:
   - `formatIndexDepthReply` (replace raw `**Session:** ${analysis.session}`)  
   - main snapshot formatter(s) used by `How's the market today?`  
3. Keep existing per-line `_(delayed/stale)_` flags.

**Test**
```bash
npx vitest run api/intelligence/general-market.test.ts
```
Add cases:
- session CLOSED → banner contains “closed”  
- stale index → banner or line mentions delayed/stale  

**Manual**
- After hours: ask `How's the market today?` and `Break down SPY, QQQ, DIA, IWM` — must say closed/stale, not look like a live open tape.

---

### Change 3 (P2) — Finish B2 in scoring (mostly verify)

**No big code if drill-down already returns SMA/RVOL.**

**Test (automated)**
```bash
npx vitest run api/intelligence/general-market.test.ts
```
Confirm Pack B2 tests still pass.

**Test (live)**
1. `npm run dev` → fresh Intelligence chat.  
2. Prompt: `How's the market today? Break down SPY, QQQ, DIA, and IWM.`  
3. Expect: per index price, today %, SMA20/50, volume/RVOL or WAIT — **not** a made-up story.  
4. Update:
   - `REV_914_MASTER_CHECKLIST.md` → B2 ✅ if Pass  
   - `SCORING_SHEET.md` → B2 Pass + date  

---

### Change 4 (P3) — Re-test remaining 📝 prompts (no code)

Fresh chat each time; log Pass/Partial/Fail in `SCORING_SHEET.md`:

| Prompt | Pack |
|--------|------|
| Is today a good trading day? | A1-4 |
| What's happening in the market? | A1-5 |
| Biggest movers | E1-4 |
| Give me stocks to watch | D1-3 |
| What looks good? | D1-4 |

---

### Change 5 (P4, optional) — Partial failure lab (B5)

1. Temporarily break one provider (or block Yahoo for one symbol).  
2. Ask `How's the market today?`  
3. Expect: still answers with WAIT on missing fields — no invented numbers.  
4. Mark B5 in scoring sheet.

---

## Daily regression (every time before you stop)

```bash
cd app
npx vitest run api/intelligence/general-market.test.ts api/intelligence/trade-symbol.test.ts api/intelligence/stock-discovery.test.ts
```

Manual smoke:
- `How's the market today?` still works  
- `Buy 5 AAPL` → FAVORABLE can still `stage it`  
- WAIT cannot stage (after Change 1)

---

## Suggested order for your next 1–2 days

| Block | Do |
|-------|----|
| 1–2 h | Change 1 (WAIT block) + tests |
| 2–3 h | Change 2 (B6 banner) + tests |
| 1 h | Change 3 live B2 + update checklist |
| Remaining | Change 4 prompt re-tests |

Then tell boss: *Last week Sprint 2 leftovers: WAIT staging blocked, closed/stale banners, B2 live Pass logged.*

---

*Path: `app/docs/intelligence-eval/LAST_WEEK_PENDING_STEPS.md`*
