// ─── Mock data for the Requi Trading demo ───────────────────────────────────

export interface Strategy {
  id: string;
  name: string;
  source: 'TradingView' | 'TrendSpider' | 'Custom';
  asset: 'Stocks' | 'Crypto' | 'Options' | 'Futures';
  status: 'Live' | 'Paper' | 'Paused';
  accounts: number;
  pnl30d: number;
  winRate: number;
  trades: number;
  /** Text-based strategy definition — copy & paste it into Intelligence. */
  prompt: string;
}

export const strategies: Strategy[] = [
  {
    id: 'STR-01',
    name: 'Momentum Breakout',
    source: 'TradingView',
    asset: 'Stocks',
    status: 'Live',
    accounts: 6,
    pnl30d: 12.4,
    winRate: 68,
    trades: 214,
    prompt: `Trade large-cap momentum breakouts.
ENTRY: Buy when price closes above the 20-day high with RVOL > 1.5.
EXIT: Sell at +8% take-profit or -3% stop-loss, whichever hits first.
SIZING: Risk 1.5% of equity per position, max 5 concurrent positions.
FILTER: Skip earnings week and FOMC days.`,
  },
  {
    id: 'STR-02',
    name: 'Crypto Mean Reversion',
    source: 'TrendSpider',
    asset: 'Crypto',
    status: 'Live',
    accounts: 3,
    pnl30d: 8.7,
    winRate: 61,
    trades: 148,
    prompt: `Fade extreme moves on a liquid crypto asset, 4H timeframe.
ENTRY: Long when RSI(14) < 28 and price touches the lower Bollinger Band (20, 2.5).
EXIT: Close at the 20-period mean or after 3 bars, stop at -2.5%.
SIZING: 2% equity risk, spot only — no leverage.
FILTER: No entries within 2h of major macro prints.`,
  },
  {
    id: 'STR-03',
    name: 'Index Iron Condor',
    source: 'Custom',
    asset: 'Options',
    status: 'Paper',
    accounts: 2,
    pnl30d: 4.2,
    winRate: 74,
    trades: 56,
    prompt: `Sell weekly broad-index iron condors on Monday open.
STRUCTURE: Short 10-delta put spread + short 10-delta call spread, $10 wings.
EXIT: 50% of max credit profit target, or 2x credit stop.
SIZING: Max 3% of account margin per trade, 1 position per week.
FILTER: Skip when VIX > 28 or during CPI/FOMC week.`,
  },
  {
    id: 'STR-04',
    name: 'Opening Range Breakout',
    source: 'TradingView',
    asset: 'Futures',
    status: 'Live',
    accounts: 4,
    pnl30d: -2.1,
    winRate: 52,
    trades: 97,
    prompt: `Trade the ES opening range breakout, first 30 minutes.
ENTRY: Break of the 9:30–10:00 ET range with volume confirmation.
EXIT: 1.5x range-height target, hard stop at range midpoint.
SIZING: 2 contracts per $50k, flatten by 11:30 ET — no overnight holds.
FILTER: Stand aside on red-folder news days.`,
  },
  {
    id: 'STR-05',
    name: 'Volatility Compression Breakout',
    source: 'Custom',
    asset: 'Stocks',
    status: 'Live',
    accounts: 8,
    pnl30d: 17.9,
    winRate: 71,
    trades: 302,
    prompt: `Long high-relative-strength breakouts across the Russell 1000.
ENTRY: Close above 52-week high with RS rating > 90 and volume > 2x average.
EXIT: Trail a 10-day low stop; first scale-out at +10%.
SIZING: 1% risk per name, sector exposure capped at 25%.
FILTER: Market regime must be above the 200-day MA.`,
  },
  {
    id: 'STR-06',
    name: 'Crypto Grid Scalper',
    source: 'TrendSpider',
    asset: 'Crypto',
    status: 'Paused',
    accounts: 1,
    pnl30d: 1.3,
    winRate: 58,
    trades: 431,
    prompt: `Run a neutral grid on a range-bound crypto pair.
GRID: 12 levels, 0.8% spacing, centered on the 4H VWAP.
EXIT: Take profit at each grid level; pause grid if price exits ±6% band.
SIZING: Equal quote allocation per level, max 40% of wallet deployed.
FILTER: Disable during funding-rate spikes above 0.05%.`,
  },
];

export interface BrokerAccount {
  id: string;
  broker: string;
  label: string;
  type: 'Live' | 'Paper' | 'IRA' | 'Prop';
  equity: number;
  dayPnl: number;
  status: 'Connected' | 'Syncing' | 'Attention';
  strategies: number;
}

export const accounts: BrokerAccount[] = [
  { id: 'ACC-1', broker: 'Robinhood', label: 'Main Equities', type: 'Live', equity: 84210.44, dayPnl: 1240.12, status: 'Connected', strategies: 3 },
  { id: 'ACC-2', broker: 'Binance', label: 'Crypto Spot', type: 'Live', equity: 36720.8, dayPnl: -312.45, status: 'Connected', strategies: 2 },
  { id: 'ACC-3', broker: 'Coinbase', label: 'Long-Term Crypto', type: 'IRA', equity: 52880.0, dayPnl: 486.2, status: 'Connected', strategies: 1 },
  { id: 'ACC-4', broker: 'NinjaTrader', label: 'Futures Eval #2', type: 'Prop', equity: 149650.0, dayPnl: 2110.75, status: 'Connected', strategies: 2 },
  { id: 'ACC-5', broker: 'E*TRADE', label: 'Retirement 401k Roll', type: 'IRA', equity: 210340.55, dayPnl: 640.3, status: 'Syncing', strategies: 1 },
  { id: 'ACC-6', broker: 'Paper', label: 'Sandbox Testing', type: 'Paper', equity: 100000.0, dayPnl: 0, status: 'Connected', strategies: 4 },
];

export interface SignalEvent {
  id: string;
  time: string;
  strategy: string;
  source: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: string;
  accounts: number;
  status: 'Filled' | 'Working' | 'Routed';
  latency: string;
}

export const signals: SignalEvent[] = [
  { id: 'SIG-9481', time: '09:31:04', strategy: 'Momentum Breakout', source: 'TradingView', symbol: 'ALPHA', side: 'BUY', qty: '120', accounts: 6, status: 'Filled', latency: '84ms' },
  { id: 'SIG-9480', time: '09:28:51', strategy: 'Volatility Compression Breakout', source: 'Webhook', symbol: 'BRAVO', side: 'BUY', qty: '45', accounts: 8, status: 'Filled', latency: '91ms' },
  { id: 'SIG-9479', time: '09:24:17', strategy: 'Crypto Mean Reversion', source: 'TrendSpider', symbol: 'CHARLIE', side: 'SELL', qty: '0.85', accounts: 3, status: 'Filled', latency: '112ms' },
  { id: 'SIG-9478', time: '09:19:42', strategy: 'Opening Range Breakout', source: 'TradingView', symbol: 'DELTA', side: 'BUY', qty: '4', accounts: 4, status: 'Working', latency: '76ms' },
  { id: 'SIG-9477', time: '09:14:08', strategy: 'Index Iron Condor', source: 'JSON API', symbol: 'ECHO 150/170C', side: 'SELL', qty: '10', accounts: 2, status: 'Routed', latency: '98ms' },
  { id: 'SIG-9476', time: '09:02:33', strategy: 'Momentum Breakout', source: 'TradingView', symbol: 'FOXTROT', side: 'SELL', qty: '200', accounts: 6, status: 'Filled', latency: '87ms' },
  { id: 'SIG-9475', time: '08:58:19', strategy: 'Volatility Compression Breakout', source: 'Webhook', symbol: 'GOLF', side: 'BUY', qty: '30', accounts: 8, status: 'Filled', latency: '102ms' },
];

// MarketplaceItem mock inventory removed (Master Build §11) — the marketplace
// now renders only the real RTI catalog served by trpc.marketplace.list.

export const tickerTape = [
  { symbol: 'ALPHA', price: '227.48', chg: '+1.24%' },
  { symbol: 'BRAVO', price: '131.26', chg: '+2.87%' },
  { symbol: 'CHARLIE', price: '97.42', chg: '+3.41%' },
  { symbol: 'DELTA', price: '342.10', chg: '-0.82%' },
  { symbol: 'ECHO', price: '594.30', chg: '+0.46%' },
  { symbol: 'FOXTROT', price: '368.42', chg: '+1.93%' },
  { symbol: 'GOLF', price: '122.85', chg: '-1.05%' },
  { symbol: 'HOTEL', price: '598.72', chg: '+0.74%' },
  { symbol: 'INDIA', price: '246.18', chg: '+0.38%' },
  { symbol: 'JULIET', price: '441.16', chg: '+0.92%' },
];

export const brokers = ['Robinhood', 'Binance', 'Coinbase', 'NinjaTrader', 'E*TRADE', 'Topstep', 'Apex', 'Webull'];

export const fmtUsd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
