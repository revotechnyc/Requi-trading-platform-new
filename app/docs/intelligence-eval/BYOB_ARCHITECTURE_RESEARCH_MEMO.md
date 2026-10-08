# BYOB Architecture Research Memo  
## Bring Your Own Broker (IBKR) — answers to the client’s 10 questions

**Date:** 7 October 2026  
**Status:** Research recommendation for client review — **not** legal advice. Confirm with IBKR account management / counsel before multi-user live spend.  
**Scope:** Architecture + ops estimate. **No live multi-account coding until this memo is accepted.**

---

## Executive recommendation

| Decision | Choice |
|----------|--------|
| Primary API | **Client Portal Web API (CPAPI) + Client Portal Gateway** (already in production for paper) |
| Secondary (if CPAPI gaps) | IB Gateway / TWS socket API for richer order types / lower latency |
| BYOB model | **User-owned gateway session** (sidecar per IBKR user), not one RTI institutional umbrella for all retail users |
| Live multi-user | **Blocked** until IBKR commercial path + this architecture approved |
| Near-term | Keep **server-linked IBKR Paper (`DU…`)** for product UAT; run a **single-user BYOB spike** only after Slice 2 NL UAT |

---

## Answers to the 10 client questions

### 1. Best API for this architecture?

**Client Portal Web API + Gateway** is the best fit for Requi today:

- REST for accounts, positions, orders, cancels, basic market data — matches the existing `IbkrBroker` adapter.
- Same path for paper (`DU…`) and live (`U…`) with a feature flag.
- Avoid inventing a new transport.

**When to add TWS/IB Gateway (socket):** bracket/OCO complexity, pacing, or latency that CPAPI cannot meet.

**FIX:** only if/when institutional volume and IBKR mandate it — not for BYOB retail MVP.

### 2. Can users authorize RTI on their own accounts?

**Yes, in the BYOB sense:** each user logs into **their** IBKR account via a gateway they (or RTI ops) run for them.

**Caveat:** a third-party **platform** exercising many customer accounts under one RTI custody/umbrella usually needs IBKR’s commercial / ISV / advisor path. That is different from “user runs own session.”

**Recommendation:** treat BYOB as **user-authorized session tooling** (user completes 2FA; RTI never stores IBKR passwords). Ask IBKR explicitly before marketing multi-user live trading.

### 3. Auto-provision a container per user?

**Technically yes** (Docker image of Client Portal Gateway per user).

**Operationally heavy:**

| Concern | Detail |
|---------|--------|
| Runtime | Java gateway process, SSL, disk, CPU |
| Auth | Interactive login + 2FA per session |
| Keep-alive | `/tickle` / session refresh; soft disconnects |
| Isolation | Network + secrets + one session per IBKR user |
| Cost | Rough order: **~$15–40/user/month** infra at small scale (container + ops), before support |

**MVP spike:** 1–3 dedicated containers, manual provision. Auto-scale only after auth/session SLOs are proven.

### 4. Auth / re-auth requirements?

- Gateway requires **interactive IBKR login + 2FA** (not silent OAuth like some brokers).
- Sessions **expire**; soft disconnects are common.
- Re-auth is a **user/operator action** (open gateway URL, complete login).
- RTI should surface “gateway needs re-auth” in UI (already partially true for paper).

### 5. Unique subdomains (`user.ibkr.requitrading.com`)?

**Nice for routing/ops**, not a compliance substitute.

Real isolation unit = **container + credentials + network policy + userId binding**.

Prefer: `RTI API → BrokerSidecar(userId) → CP Gateway → user’s IBKR` with mTLS between API and sidecar. Subdomains optional at the edge.

### 6. Paper vs live differences?

| | Paper (`DU…`) | Live (`U…`) |
|--|---------------|-------------|
| API | Same CPAPI | Same CPAPI |
| Capital | Simulated | Real |
| Permissions / BP | Paper rules | Live margin/cash |
| Market data | Often delayed / entitlement-dependent | Entitlement-dependent |
| Product gate | Default path | `LIVE_TRADING_ENABLED` + policy + consent |

**Code path should stay identical**; only policy and account-id class differ.

### 7. Market-data licensing?

**Do not** redistribute one user’s IBKR market data as platform-wide quotes.

- Per-user IBKR data stays in that user’s session/context.
- Platform-wide discovery / research continues to use **RTI’s own entitlements** and delayed public sources (current hierarchy).
- IBKR as **fallback for trading context** (quotes for that user’s symbols) is fine; IBKR as shared fundaments bus for all users is not.

### 8. Rate / session / concurrent login limits?

Observed / expected constraints:

- Often **one active gateway session per IBKR user**.
- Order and market-data **pacing** limits.
- Soft disconnects under load.

**Design:** one gateway session per IBKR identity; serialize requests; backoff; never open parallel logins for the same user.

### 9. Credential / order security?

| Rule | Practice |
|------|----------|
| Passwords | **Never store** IBKR passwords in RTI DB |
| Session | Store only encrypted connection metadata / sidecar address |
| Orders | Tickets remain the only path; LLM never calls IBKR HTTP |
| Confirm | `CONFIRM ORDER` (or governed auto-execute) still required |
| Audit | Append-only audit on stage / confirm / cancel / fill |

### 10. What does IBKR require of RTI for many customers?

Likely (confirm with IBKR):

- Disclose multi-user / platform intent.
- Market-data redistribution policy.
- Possibly Web API / ISV / advisor agreements for anything beyond user-operated BYOB.

**Action:** engage IBKR account manager **before** Phase 8 (BYOB production) coding.

---

## Target architecture

```
RTI Broker Adapter Layer
  ├── PaperAdapter              (CI / offline)
  ├── IbkrAdapter (CPAPI)
  │     ├── ServerLinkedSession   (now: team paper DU…)
  │     └── UserLinkedSession     (BYOB: user-owned gateway sidecar)
  ├── RobinhoodMcpAdapter
  └── Future adapters
           │
           ▼
   Deterministic tickets (propose → CONFIRM → placeOrder)
           ▲
   Intelligence: Intent → validate → preview → confirm
```

---

## Infra estimate (order of magnitude)

| Phase | Effort | Cost signal |
|-------|--------|-------------|
| Paper UAT (current) | Done / ongoing | 1 shared gateway |
| BYOB spike (1 user) | 1–2 weeks eng | 1 sidecar + docs |
| BYOB soft launch (≤20 users) | 3–5 weeks | containers + session UI + on-call |
| Scale (100+ users) | 2–3 months | orchestration, IBKR commercial, support |

---

## Recommended plan (gates)

1. **Done / in progress:** Server-linked IBKR Paper + Intelligence Slice 1–2 NL.  
2. **Client accepts this memo** (API choice + BYOB = user session, not umbrella custody).  
3. **Single-user BYOB spike** on paper (still `DU…` or user’s paper).  
4. **IBKR commercial conversation** for live multi-user.  
5. **Only then** live `U…` + multi-tenant sidecars.

---

## What we are explicitly not doing yet

- Live capital unlock for multi-user  
- Storing IBKR passwords  
- Sharing one user’s IBKR market data across the platform  
- Mass container farm without IBKR sign-off  

---

## One-paragraph client summary

We recommend staying on **Client Portal Gateway + CPAPI**, keeping **paper-first** trading on a server-linked `DU…` account for product proof, and treating **BYOB as a per-user gateway sidecar** where each customer authorizes their own IBKR session (no password storage in RTI; tickets still gate every order). Subdomains are optional routing; containers + session isolation are the real control. Live multi-account work should wait on **IBKR commercial confirmation** and a small BYOB spike after Intelligence NL Slice 2 UAT.
