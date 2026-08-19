# Broker Connections — Robinhood MCP & Interactive Brokers

This guide connects Requi's execution plane (used by **both** the Intelligence
and Autonomous modules) to live brokers. It is written for the deploying
engineer. No live connection is required to run the platform — the Paper
Exchange is the default and every flow works end-to-end without credentials.

---

## 1. Architecture

```
Intelligence chat ─┐
Autonomous loop ───┤   propose → ORDER TICKET (READY_FOR_CONFIRMATION)
Direct API      ───┘            │
                                │  exact string: CONFIRM ORDER [TICKET_ID]
                                ▼
                   Governance runtime validates against
                   the SIGNED compiled package (absolute gate)
                                ▼
                   Ticket service → BrokerAdapter (unified interface)
                                ▼
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                        ▼
  PaperBroker           RobinhoodMcpBroker          IbkrBroker
  (default)             (streamable HTTP MCP)       (Client Portal Web API)
```

Adapter source files:

| File | Purpose |
|---|---|
| `api/brokers/types.ts` | Unified `BrokerAdapter` contract — every broker implements it |
| `api/brokers/paper.ts` | Deterministic simulator (default, always on) |
| `api/brokers/robinhood-mcp.ts` | Robinhood Trading MCP adapter |
| `api/brokers/ibkr.ts` | Interactive Brokers Client Portal API adapter |
| `api/brokers/registry.ts` | Selection, fallback-to-paper rules, live health checks |
| `api/queries/tickets.ts` | Ticket lifecycle + confirmation gate (never bypassed) |

**Safety invariant:** if a live broker is requested but not configured, the
registry falls back to paper execution and annotates the ticket — execution
never silently changes venue, and never reaches a live broker without the
operator deliberately configuring it.

---

## 2. Robinhood — Agentic Trading MCP

### 2.1 What Robinhood offers

Robinhood's agentic trading surface is an **MCP (Model Context Protocol)
server over streamable HTTP**:

- **Endpoint:** `https://agent.robinhood.com/mcp/trading`
- **Auth:** OAuth 2.0 — the user links their Robinhood account through an
  agentic AI platform; the resulting bearer token authenticates MCP calls.
- **Read access:** all accounts (incl. account numbers), positions, balances,
  full order history, watchlists, scans.
- **Write access:** `place_equity_order` and single-leg option orders —
  **only inside the user's dedicated Robinhood Agentic account.** The agent
  cannot trade the user's primary account.
- **Notable caveat:** Robinhood does **not** publish response schemas for its
  tools. Requi's adapter therefore normalizes defensively and returns
  `UNKNOWN` for any unresolvable order state — and per Requi's constitutional
  invariant, an `UNKNOWN` outcome is **never** blindly resubmitted.

### 2.2 Protocol

JSON-RPC 2.0 over HTTP POST:

```
POST https://agent.robinhood.com/mcp/trading
Authorization: Bearer <ROBINHOOD_MCP_TOKEN>
Content-Type: application/json
Accept: application/json, text/event-stream

{"jsonrpc":"2.0","id":1,"method":"initialize",
 "params":{"protocolVersion":"2025-03-26","capabilities":{},
           "clientInfo":{"name":"requi-trading","version":"2.1.0"}}}
```

then `tools/list`, then `tools/call` with e.g. `place_equity_order`.
The adapter preserves the `mcp-session-id` header across calls.

### 2.3 Setup

1. The user creates a **Robinhood Agentic account** inside Robinhood
   (required — trades only route there) and links it through Robinhood's
   agentic flow to obtain an OAuth token.
2. Set environment variables:
   ```bash
   ROBINHOOD_MCP_TOKEN=<oauth bearer token>
   ROBINHOOD_MCP_URL=https://agent.robinhood.com/mcp/trading   # default
   ```
3. Restart. Verify: `GET /trpc/execution.brokers` → `ROBINHOOD_MCP` shows
   `configured: true, ok: true` with live tool count.

### 2.4 Capability map (enforced by the adapter)

| Capability | Supported |
|---|---|
| Equities (MKT/LMT) | ✅ |
| Single-leg options | ✅ |
| Multi-leg options, bracket/OCO, trailing stops | ❌ (not exposed by the MCP) |
| Streaming fills | ❌ (polled via `get_order`) |
| Extended hours | ❌ |

If a strategy requires capabilities Robinhood's MCP lacks, route that
strategy to IBKR or keep it on paper — the broker capability matrix in the
Autonomous module enforces this at the strategy level.

---

## 3. Interactive Brokers — Client Portal Web API (CPAPI)

### 3.1 What IBKR offers

IBKR's REST surface is the **Client Portal Web API**, served by the Client
Portal Gateway:

- **Transport:** HTTPS REST — self-hosted gateway at
  `https://localhost:5000/v1/api` (also available Dockerized), or hosted at
  `https://api.ibkr.com/v1/api` for eligible accounts.
- **Auth:** the **operator authenticates the gateway out-of-band** (IBKR
  login + 2FA). Requi never collects IBKR credentials. The adapter verifies
  the session via `GET /iserver/auth/status` and keeps it alive via
  `POST /tickle`.
- **Products:** stocks, options (incl. multi-leg combos), futures, FOP,
  currencies, bonds, CFDs.
- **Order types:** MKT, LMT, STP, STP LMT, TRAIL, TRAIL LIMIT, MIDPRICE,
  MOC/LOC, MOO, plus algo strategies (VWAP, ArrivalPx, ClosePx…).

### 3.2 Endpoints used by the adapter

| Action | Endpoint |
|---|---|
| Session check | `GET /iserver/auth/status` |
| Keep-alive | `POST /tickle` |
| Accounts | `GET /portfolio/accounts` |
| Symbol → conid | `GET /trsrv/stocks?symbols={SYM}` |
| Place order | `POST /iserver/account/{accountId}/orders` |
| Answer order prompts | `POST /iserver/reply/{replyId}` |
| Modify order | `POST /iserver/account/{accountId}/order/{orderId}` |
| Cancel order | `DELETE /iserver/account/{accountId}/order/{orderId}` |
| Live orders | `GET /iserver/account/orders` |
| Positions | `GET /portfolio/{accountId}/positions/0` |

Order body example (what the adapter sends for a LMT buy):

```json
{
  "orders": [{
    "acctId": "DU123456",
    "conid": 265598,
    "secType": "265598:STK",
    "orderType": "LMT",
    "side": "BUY",
    "quantity": 25,
    "price": 150,
    "tif": "DAY",
    "cOID": "<requi-idempotency-key>",
    "referrer": "RequiTrading"
  }]
}
```

`cOID` carries Requi's idempotency key so a retried submission is recognized
as the same order. Some submissions return `message_ids` prompts; the adapter
answers them via `/iserver/reply/{replyId}` before treating the order as ACKed.

### 3.3 Setup

1. Run the Client Portal Gateway (Java) or the official Docker image; log in
   with an IBKR user that has **trading permissions** on the target account.
2. Set environment variables:
   ```bash
   IBKR_GATEWAY_URL=https://localhost:5000/v1/api   # default
   IBKR_ACCOUNT=DU123456                            # paper or live account id
   ```
3. If the gateway uses its self-signed certificate, either mount its CA into
   the runtime or co-locate the adapter and gateway on one host (recommended
   for production — see the module deployment guides).
4. Restart and verify `execution.brokers` shows `IBKR: ok`.

**Start with an IBKR paper account (DU…).** The full Requi pipeline —
tickets, confirmation gate, alerts, state machine — behaves identically.

---

## 4. The confirmation contract (both modules)

Every order, from any origin, obeys:

1. **Ticket** — immutable, idempotent, 5-minute confirmation window,
   format `[STRATEGY]-[YYYYMMDD]-[SEQ]`.
2. **Exact-string authorization** — `CONFIRM ORDER [TICKET_ID]`, validated
   against the signed governance package. No delegation, no implied consent,
   no carry-over to modified tickets.
3. **Expiry** — an unconfirmed ticket dies and can never be routed.
4. **UNKNOWN = dead end** — unresolvable broker states are never resubmitted.
5. **Change path** — cancel + recreate only; tickets are never modified.

Chat (Intelligence), the notification center, and the API all resolve to the
same ticket — confirming in one place resolves the request everywhere.

---

## 5. Environment variable reference

| Variable | Purpose | Required for |
|---|---|---|
| `ROBINHOOD_MCP_TOKEN` | OAuth bearer for Robinhood Trading MCP | Robinhood live |
| `ROBINHOOD_MCP_URL` | MCP endpoint override | optional |
| `IBKR_GATEWAY_URL` | Client Portal Gateway base URL | IBKR live/paper |
| `IBKR_ACCOUNT` | Target IBKR account id | IBKR live/paper |
| `GOVERNANCE_VAULT_KEY` | Governance vault/package signing key | all production |
| `DATABASE_URL` | MySQL/TiDB connection | all |
