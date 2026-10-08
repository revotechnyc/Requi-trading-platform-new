/**
 * Intent catalog for Intelligence → IBKR Paper (and PaperBroker).
 * LLM never maps intents to raw broker HTTP — only these codes + deterministic builders.
 *
 * Slice 1: stage + confirm for place + account reads + close.
 * Slice 2: cancel working, stop→breakeven, TP%, follow-up stop, native TRAIL, sell profitable.
 * Slice 3 (later): modify/replace working, OCO, brackets as child orders, sector exposure, conditionals.
 */

export type IntelligenceTradeIntentCode =
  | "PLACE_MARKET_BUY"
  | "PLACE_MARKET_SELL"
  | "PLACE_LIMIT_BUY"
  | "PLACE_LIMIT_SELL"
  | "PLACE_WITH_STOP_PCT"
  | "PLACE_WITH_TAKE_PROFIT_PCT"
  | "PLACE_TRAILING_STOP_PCT"
  | "BUY_BY_SHARES"
  | "BUY_BY_NOTIONAL"
  | "SELL_BY_SHARES"
  | "SELL_BY_POSITION_PCT"
  | "CLOSE_POSITION"
  | "CLOSE_ALL_POSITIONS"
  | "CANCEL_STAGED_TICKET"
  | "CANCEL_WORKING_ORDER"
  | "CANCEL_ALL_ORDERS"
  | "CONFIRM_STAGED_TICKET"
  | "STOP_TO_BREAKEVEN"
  | "ADD_PROTECTIVE_STOP_PCT"
  | "TAKE_PROFIT_PCT"
  | "MAKE_TRAILING_STOP"
  | "SELL_ALL_PROFITABLE"
  | "VIEW_POSITIONS"
  | "VIEW_ORDERS"
  | "VIEW_BUYING_POWER"
  | "VIEW_ACCOUNT"
  | "VIEW_PNL"
  | "CLARIFY_SIZE"
  | "CLARIFY_SYMBOL";

export type IntentCatalogEntry = {
  code: IntelligenceTradeIntentCode;
  /** Deterministic RTI function / path */
  rti: string;
  /** IBKR capability (paper via Client Portal) */
  ibkr: string;
  slice: 1 | 2 | 3;
};

export const INTELLIGENCE_TRADE_INTENT_CATALOG: IntentCatalogEntry[] = [
  { code: "BUY_BY_SHARES", rti: "stageExplicitIntelligenceOrder → proposeTicket", ibkr: "placeOrder LMT/MKT", slice: 1 },
  { code: "BUY_BY_NOTIONAL", rti: "parseTradeNotional → floor(qty) → stageExplicit", ibkr: "placeOrder", slice: 1 },
  { code: "SELL_BY_SHARES", rti: "stageExplicitIntelligenceOrder", ibkr: "placeOrder SELL", slice: 1 },
  { code: "SELL_BY_POSITION_PCT", rti: "resolveSellQtyFromHoldings → stageExplicit", ibkr: "placeOrder SELL", slice: 1 },
  { code: "CLOSE_POSITION", rti: "resolveSellQtyFromHoldings(1) → stageExplicit", ibkr: "placeOrder SELL", slice: 1 },
  { code: "CLOSE_ALL_POSITIONS", rti: "stageCloseAllPositions", ibkr: "placeOrder SELL each", slice: 1 },
  { code: "PLACE_LIMIT_BUY", rti: "parseLimitPrice → stageExplicit LMT", ibkr: "placeOrder LMT", slice: 1 },
  { code: "PLACE_LIMIT_SELL", rti: "parseLimitPrice → stageExplicit LMT", ibkr: "placeOrder LMT", slice: 1 },
  { code: "PLACE_WITH_STOP_PCT", rti: "parseStopLossPct → protective stop on ticket", ibkr: "stop on ticket / STP after fill", slice: 1 },
  { code: "PLACE_WITH_TAKE_PROFIT_PCT", rti: "parseTakeProfitPct → ticket.target", ibkr: "LMT SELL after fill (manage)", slice: 2 },
  { code: "PLACE_TRAILING_STOP_PCT", rti: "parseTrailPct → TRAIL SELL (manage) / stop on BUY", ibkr: "TRAIL (CPAPI)", slice: 2 },
  { code: "CONFIRM_STAGED_TICKET", rti: "confirmTicket", ibkr: "placeOrder", slice: 1 },
  { code: "CANCEL_STAGED_TICKET", rti: "rejectTicket", ibkr: "n/a (pre-submit)", slice: 1 },
  { code: "CANCEL_WORKING_ORDER", rti: "cancelOrdersFromNl → cancelTicket + broker cancel", ibkr: "DELETE order", slice: 2 },
  { code: "CANCEL_ALL_ORDERS", rti: "cancelOrdersFromNl(all)", ibkr: "cancel each open", slice: 2 },
  { code: "STOP_TO_BREAKEVEN", rti: "stageStopToBreakeven → STP @ avgEntry", ibkr: "placeOrder STP", slice: 2 },
  { code: "ADD_PROTECTIVE_STOP_PCT", rti: "stageProtectiveStopForPosition", ibkr: "placeOrder STP", slice: 2 },
  { code: "TAKE_PROFIT_PCT", rti: "stageTakeProfitOrder → LMT SELL", ibkr: "placeOrder LMT", slice: 2 },
  { code: "MAKE_TRAILING_STOP", rti: "stageTrailingStopForPosition → TRAIL", ibkr: "placeOrder TRAIL", slice: 2 },
  { code: "SELL_ALL_PROFITABLE", rti: "stageSellAllProfitable", ibkr: "placeOrder SELL each winner", slice: 2 },
  { code: "VIEW_POSITIONS", rti: "formatIntelligenceAccountStatus", ibkr: "portfolio positions", slice: 1 },
  { code: "VIEW_BUYING_POWER", rti: "formatIntelligenceAccountStatus", ibkr: "account summary", slice: 1 },
  { code: "VIEW_ACCOUNT", rti: "formatIntelligenceAccountStatus", ibkr: "equity/cash/BP", slice: 1 },
  { code: "VIEW_ORDERS", rti: "listTickets / conversational STATUS", ibkr: "orders (via tickets + gateway)", slice: 1 },
  { code: "VIEW_PNL", rti: "formatIntelligenceAccountStatus + positions", ibkr: "unrealized from positions", slice: 1 },
  { code: "CLARIFY_SIZE", rti: "clarificationAskSharesOrDollars", ibkr: "n/a", slice: 1 },
  { code: "CLARIFY_SYMBOL", rti: "classifyIntent symbol ask", ibkr: "n/a", slice: 1 },
  { code: "PLACE_MARKET_BUY", rti: "stageExplicit MKT", ibkr: "placeOrder MKT", slice: 1 },
  { code: "PLACE_MARKET_SELL", rti: "stageExplicit MKT", ibkr: "placeOrder MKT", slice: 1 },
];

export function catalogSlice1Codes(): IntelligenceTradeIntentCode[] {
  return INTELLIGENCE_TRADE_INTENT_CATALOG.filter((e) => e.slice === 1).map((e) => e.code);
}

export function catalogSlice2Codes(): IntelligenceTradeIntentCode[] {
  return INTELLIGENCE_TRADE_INTENT_CATALOG.filter((e) => e.slice === 2).map((e) => e.code);
}
