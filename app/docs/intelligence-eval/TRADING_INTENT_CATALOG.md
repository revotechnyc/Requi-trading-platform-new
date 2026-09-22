# Trading Intent Catalog — IBKR Paper (Client Message 2)

Maps every client-requested action → RTI function → IBKR CPAPI capability.  
**Account mode:** PAPER only until live unlock.  
**LLM:** never calls IBKR; only fills toward this catalog via deterministic engine.

Legend: **Built** = works in product today · **Partial** = ticket/adapter exists, NL not wired · **Todo** = not built

| Intent ID | Example user language | RTI function | IBKR (CPAPI) | Status |
|-----------|----------------------|--------------|--------------|--------|
| VIEW_POSITIONS | Show me my open positions | `queryPositions` | portfolio positions | Partial |
| VIEW_BUYING_POWER | How much buying power do I have? | `queryAccount` | portfolio summary | Todo (adapter equity often 0) |
| VIEW_BALANCES | Account balance / cash | `queryAccount` | portfolio | Todo |
| VIEW_OPEN_ORDERS | Show my open orders for Tesla | `queryOpenOrders` | live orders | Partial |
| VIEW_FILLED_ORDERS | View filled orders | `queryOrderHistory` | order status | Todo |
| VIEW_REJECTED_ORDERS | Rejected/cancelled orders | `queryOrderHistory` | order status | Todo |
| VIEW_PNL | What’s my P&L today? | `queryPnl` | positions + ledger | Todo |
| VIEW_EXPOSURE | Exposure by sector | `queryExposure` | positions + sector map | Todo |
| VIEW_AVG_ENTRY | Average entry price | `queryPosition` | positions | Partial |
| VIEW_MKT_PRICE | Current market price | MD gateway | snapshot / marketdata | Partial |
| VIEW_EXEC_HISTORY | Order/execution history | `queryExecutions` | executions | Todo |
| VIEW_BOUGHT_TODAY | Everything I bought today | `queryFillsToday` | executions filter | Todo |
| VIEW_LOSERS_PCT | Positions down more than 3% | `queryPositions` filter | positions | Todo |
| PLACE_MKT | Buy 100 shares of AAPL | `buildOrder(MKT)` | POST orders | Partial (NL thin) |
| PLACE_LMT | Place a limit order for TSLA at $390 | `buildOrder(LMT)` | POST orders | Partial |
| PLACE_STP | Stop-loss | `buildOrder(STP)` | POST orders | Partial |
| PLACE_STP_LMT | Stop-limit | `buildOrder(STP_LMT)` | POST orders | Partial |
| PLACE_TRAIL_PCT | Trail by 3% / Trail NVDA by 2% | `buildOrder(TRAIL)` | TRAIL | Todo NL |
| PLACE_TRAIL_AMT | Trail by dollar | `buildOrder(TRAIL)` | TRAIL | Todo NL |
| PLACE_TRAIL_LMT | Trailing stop-limit | `buildOrder(TRAIL_LIMIT)` | if supported | Todo |
| PLACE_TAKE_PROFIT | Take profit on half at 8% | `buildOrder(LMT SELL)` | orders | Todo NL |
| PLACE_BRACKET | Entry + SL + TP | `buildBracket` | bracket / attach | Todo |
| PLACE_OCO | OCO / conditional | `buildOco` | if supported | Todo |
| BUY_SHARES | Buy 100 shares… | qty mode | orders | Partial |
| BUY_NOTIONAL | Buy $5,000 of NVDA | notional→qty | orders | Todo NL |
| SELL_SHARES | Sell N shares | qty | orders | Partial |
| SELL_PCT_POSITION | Sell half / 25% | % of position | orders | Todo NL |
| CLOSE_POSITION | Close my entire AMD / Close this | flatten | orders | Todo NL |
| CLOSE_ALL | Close all my positions | foreach | orders | Todo NL |
| CLOSE_PROFITABLE | Sell all profitable positions | filter PnL>0 | orders | Todo NL |
| ADD_TO_POSITION | Buy another 50 | same-side add | orders | Todo NL |
| REDUCE_POSITION | Reduce by 25% | partial close | orders | Todo NL |
| CANCEL_ORDER | Cancel my open Apple order | `cancelOrder` | DELETE order | Partial API / Todo NL |
| CANCEL_ALL | Cancel every unfilled order | foreach cancel | cancel | Todo NL |
| MODIFY_ORDER | Modify existing order | modify or cancel+replace | modify endpoint | Todo |
| REPLACE_ORDER | Make it a trailing stop instead | cancel+new | combo | Todo NL |
| MOVE_STOP | Move my stop loss | replace STP | STP | Todo NL |
| STOP_BREAKEVEN | Move stop to breakeven | STP at entry | STP | Todo NL |
| ADJUST_TP | Adjust take-profit | replace LMT | LMT | Todo NL |
| ADJUST_TRAIL | Adjust trailing stop | replace TRAIL | TRAIL | Todo NL |
| COND_BUY | Buy AAPL if it falls to $215 | STP/LMT buy | orders | Todo NL |
| COND_SELL | Sell 50% if AAPL reaches $240 | LMT sell | orders | Todo NL |
| LIMIT_OR_BETTER | Buy 100 AAPL at $220 or better | LMT | orders | Todo NL |
| CLARIFY_QTY | Buy Apple (no size) | ask shares vs $ | — | Todo |
| CLARIFY_REF | Sell it / Close that (ambiguous) | ask which | — | Todo |

### Pipeline (client-mandated)

```
NL → Intent → Entities → Trading Context → Account/Position validate
  → Risk & Permission (PAPER) → Deterministic Order Builder → Preview
  → Confirm → IBKR Adapter → IBKR Paper → Explain
```

### Related docs
- Simple explanation + all prompts: `IBKR_FEEDBACK_SIMPLE_AND_PROMPTS.md`
- Phase plan: `IBKR_INTELLIGENCE_PHASE_PLAN.md`

*Path: `app/docs/intelligence-eval/TRADING_INTENT_CATALOG.md`*
