# Coding implementation plan — last-week pending (you test)

**Owner (code):** Engineering / agent  
**Owner (test):** You  
**Scope:** Rev 9/14 leftovers only — **not** IBKR Message 2 NL catalog  
**Rule:** Small, reviewable diffs. Do not change unrelated Intelligence research paths.

---

## Goal

Ship three coding changes so you can verify Pass/Fail in the app:

| ID | Change | Outcome for you |
|----|--------|-----------------|
| **C1** | Block staging when advisory = `WAIT` | `stage it` refused on WAIT; still works on FAVORABLE |
| **C2** | Human closed/stale session banner (Pack B6) | After-hours / stale quotes clearly labeled |
| **C3** | Docs only after your live B2 Pass | Checklist/scoring updated — **you** confirm live first |

Optional later (not in this coding batch): prompt re-test logging (no code).

---

## Coding batch order

```
C1 stage-ticket WAIT block  →  unit tests
C2 session banner helper    →  unit tests + wire formatters
Stop. You run manual + vitest.
C3 docs update              →  only after you say B2 live Pass
```

---

## C1 — Block `WAIT` staging

### Why
`stage-ticket.ts` currently allows FAVORABLE **and** WAIT. Last-week ask: do not stage when app says WAIT.

### Files to change
| File | Action |
|------|--------|
| `app/api/intelligence/stage-ticket.ts` | Code change |
| `app/api/intelligence/stage-ticket.test.ts` | **Create** (new) |

### Implementation steps (coder)

1. Update the header comment: only **FAVORABLE** may stage; WAIT / UNFAVORABLE / BLOCKED refuse.  
2. Extend the early return:
   ```ts
   if (
     advisory.verdict === "UNFAVORABLE" ||
     advisory.verdict === "BLOCKED" ||
     advisory.verdict === "WAIT"
   )
   ```
3. Tailor WAIT reply copy (clearer than UNFAVORABLE):
   - Say staging is blocked while data/setup is WAIT  
   - Suggest fixing data / waiting for session / fresh `buy SYMBOL` when FAVORABLE  
   - Confirm nothing was staged  
4. Keep FAVORABLE path unchanged (qty, stop, proposeTicket, CONFIRM text).

### Unit tests to add (`stage-ticket.test.ts`)

Mock `proposeTicket` + `resolveIntelligenceBroker` (vitest `vi.mock`).

| Case | Input verdict | Expect |
|------|---------------|--------|
| T1 | `WAIT` | `ok: false`, reply matches /WAIT/i, `proposeTicket` **not** called |
| T2 | `UNFAVORABLE` | `ok: false`, propose not called |
| T3 | `BLOCKED` | `ok: false`, propose not called |
| T4 | `FAVORABLE` | `ok: true`, propose called once, ticketId set |

Minimal fake advisory for tests:
```ts
{
  symbol: "AAPL",
  side: "BUY",
  verdict: "WAIT" | "FAVORABLE" | ...,
  reasons: ["thin bars"],
  dataQuality: "THIN",
  setup: null,
  sizingPreview: null,
  proposed: { lastPrice: 100 },
  watchFor: null,
  heat: null,
  governanceVersion: "test",
  composedAt: Date.now(),
}
```
(Adjust fields to match real `Advisory` type in `intent.ts`.)

### Your test plan (after code lands)

**Automated**
```bash
cd app
npx vitest run api/intelligence/stage-ticket.test.ts
```

**Manual**
1. Fresh chat → `Buy 5 AAPL` (or a symbol that often lands WAIT off-hours).  
2. If verdict WAIT → type `stage it` → must refuse; no ticket id.  
3. When FAVORABLE → `stage it` → ticket + CONFIRM line still works.  
4. Regression: `How's the market today?` still answers.

**Pass criteria**
- [ ] WAIT cannot stage  
- [ ] FAVORABLE can stage  
- [ ] vitest T1–T4 green  

---

## C2 — Closed / stale session banner (Pack B6)

### Why
Replies show raw session enums; Pack B6 wants a clear “closed / delayed / stale” banner.

### Files to change
| File | Action |
|------|--------|
| `app/api/intelligence/general-market.ts` | Add helper + wire into formatters |
| `app/api/intelligence/general-market.test.ts` | Add cases |

### Implementation steps (coder)

1. Add exported helper near other format helpers:
   ```ts
   export function formatSessionBanner(
     session: GeneralMarketAnalysis["session"],
     opts?: { stale?: boolean; asOf?: string },
   ): string
   ```
2. Banner rules (plain English, one or two lines):
   | Condition | Banner must convey |
   |-----------|-------------------|
   | `CLOSED` | US cash session closed; prices may be last sale |
   | `AFTER_HOURS` | After-hours / extended; not regular session |
   | `PRE_MARKET` | Pre-market |
   | `OPEN` / early close live | Regular session (or early close) — short OK |
   | `UNKNOWN` | Session unknown — treat quotes carefully |
   | `opts.stale === true` | Append delayed/stale warning |
   | `asOf` present | Include as-of timestamp when useful |
3. Wire banner into:
   - `formatIndexDepthReply` — replace or precede `**Session:** ${analysis.session}`  
   - `formatGeneralMarketReply` — same at top meta block  
   - Optionally `formatSectorLeadingReply` / `formatRiskTodayReply` if they show session (only if already showing session today — don’t expand scope)
4. Compute `stale` as: any index `available && stale` (same idea as existing staleCount).

### Unit tests to add

| Case | Input | Expect |
|------|-------|--------|
| B6-1 | session `CLOSED`, stale false | matches /closed/i |
| B6-2 | session `AFTER_HOURS` | matches /after/i or /extended/i |
| B6-3 | session `OPEN`, stale true | matches /stale|delayed/i |
| B6-4 | `formatIndexDepthReply` with CLOSED analysis | reply includes banner text |
| Existing B2/B3 tests | unchanged fixtures | still green |

### Your test plan (after code lands)

**Automated**
```bash
cd app
npx vitest run api/intelligence/general-market.test.ts
```

**Manual**
1. Prefer after US close (or note session in reply).  
2. Ask: `How's the market today?`  
3. Ask: `How's the market today? Break down SPY, QQQ, DIA, and IWM.`  
4. Confirm banner is human-readable (not only `CLOSED`).  
5. If any line says delayed/stale, banner or line must agree.

**Pass criteria**
- [ ] Closed/after-hours clearly worded  
- [ ] Stale called out when data stale  
- [ ] B2 drill-down still shows SMA/volume (no regression)  
- [ ] general-market tests green  

---

## C3 — Docs update (after your live B2 Pass only)

### Why
B2 code already exists; checklist still Partial until **you** live-verify.

### Files (docs only — no product code)
- `app/docs/intelligence-eval/REV_914_MASTER_CHECKLIST.md` — B2 → ✅ + date  
- `app/docs/intelligence-eval/SCORING_SHEET.md` — B2 Pass + note  

### Your live B2 script (before asking for C3)

1. Fresh Intelligence chat.  
2. `How's the market today? Break down SPY, QQQ, DIA, and IWM.`  
3. Pass if: real prices/returns/SMA (or honest WAIT per field) — not a fictional story.  
4. Tell coder: “B2 live Pass — update docs.”

---

## Out of scope for this coding plan

- IBKR Message 2 intent catalog / Zod TradingAction  
- Switching `INTELLIGENCE_BROKER=IBKR`  
- BYOB / gateway containers  
- Changing advisory composition (when WAIT is produced) — only staging gate  
- Broad refactors of `intelligence-router.ts`

---

## Suggested PR / commit shape

1. **Commit A:** `fix(intelligence): refuse ticket staging when advisory is WAIT`  
   - `stage-ticket.ts` + `stage-ticket.test.ts`  
2. **Commit B:** `feat(intelligence): human-readable closed/stale session banners`  
   - `general-market.ts` + tests  
3. **Commit C (later):** checklist/scoring B2 Pass — after your OK  

You test A, then B, then approve C.

---

## Handoff checklist (coder → you)

When coding is done, you should receive:

- [ ] C1 + C2 code merged or on a branch  
- [ ] Commands:
  ```bash
  npx vitest run api/intelligence/stage-ticket.test.ts
  npx vitest run api/intelligence/general-market.test.ts
  ```
- [ ] Short note: any known WAIT symbols / best time for B6 manual test  
- [ ] This plan file path for your Pass/Fail ticks  

---

## Your Pass/Fail sheet (print / tick)

| ID | Automated | Manual | Result |
|----|-----------|--------|--------|
| C1 WAIT block | stage-ticket.test.ts | stage it on WAIT / FAVORABLE | ☐ |
| C2 B6 banner | general-market.test.ts | market + index breakdown after hours | ☐ |
| C3 B2 docs | — | live break-down SPY/QQQ/DIA/IWM | ☐ |

---

*Plan path: `app/docs/intelligence-eval/CODING_PLAN_LAST_WEEK_PENDING.md`*
