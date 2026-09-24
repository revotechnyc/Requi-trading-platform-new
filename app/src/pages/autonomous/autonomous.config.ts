// Autonomous engine operational configuration

export const engineConfig = {
  name: 'REQUI AUTONOMOUS ENGINE',
  version: '1.0.0',
  mode: 'PAPER' as 'SHADOW' | 'PAPER' | 'LIVE',
  broker: 'IBKR',
  session: 'AFTER HOURS',
  killSwitch: 'SAFE' as 'SAFE' | 'ARMED' | 'TRIGGERED',
  status: 'ARMED' as 'ARMED' | 'DISARMED' | 'ERROR',
  ibkrConnection: 'CONNECTED' as 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED',
  dataStatus: 'LIVE' as 'LIVE' | 'DELAYED' | 'STALE',
  eventFeed: 'CONNECTED',
  marketData: 'CONNECTED',
  latency: { e2e: '2.8 ms', internal: '84 us' },
  openPositions: 2,
  buyingPower: 284750.50,
  dailyReturn: 1240.25,
  dailyReturnPct: 0.44,
  equity: 284750.50,
  startingEquity: 250000.00,
  positionHandling: 'HOLD_UNTIL_MIDNIGHT' as 'HOLD_UNTIL_MIDNIGHT' | 'AUTO_CLOSE_WHEN_PROFITABLE' | 'HOLD_INDEFINITELY',
  eventStrategy: 'STANDARD' as 'AGGRESSIVE' | 'CONSERVATIVE' | 'STANDARD',
  timeZone: 'AMERICA/NEW_YORK',
  autoTradeWindow: '16:00-20:00 ET',
};

export const pipelineStages = [
  { id: 'S1', name: 'Research', status: 'COMPLETE', startTime: '16:00:00', endTime: '16:45:12', latency: '45.2s', error: null, dataVersion: 'v1.2.4', sourceStatus: 'OK', passFail: 'PASS' },
  { id: 'S2', name: 'Intraday State', status: 'COMPLETE', startTime: '16:45:12', endTime: '16:45:15', latency: '3.1s', error: null, dataVersion: 'v1.2.4', sourceStatus: 'OK', passFail: 'PASS' },
  { id: 'S3', name: 'Frozen Profile', status: 'COMPLETE', startTime: '16:45:15', endTime: '16:45:15', latency: '<1s', error: null, dataVersion: 'v2.0.1', sourceStatus: 'LOCKED', passFail: 'PASS' },
  { id: 'S4', name: 'ARMED', status: 'COMPLETE', startTime: '16:45:15', endTime: '16:45:16', latency: '<1s', error: null, dataVersion: 'v2.0.1', sourceStatus: 'ARMED', passFail: 'PASS' },
  { id: 'S5', name: 'Event Critical Path', status: 'ACTIVE', startTime: '16:30:00', endTime: '—', latency: '2.8ms', error: null, dataVersion: 'v2.0.1', sourceStatus: 'HOT', passFail: 'PASS' },
  { id: 'S6', name: 'Post-Event Mgmt', status: 'PENDING', startTime: '—', endTime: '—', latency: '—', error: null, dataVersion: '—', sourceStatus: 'WAITING', passFail: 'PENDING' },
] as const;

export const latencyPoints = [
  { id: 'T0', label: 'Source publication', time: '16:30:00.000', latency: '—' },
  { id: 'T1', label: 'Vendor receipt', time: '16:30:00.012', latency: '12ms' },
  { id: 'T2', label: 'Requi receipt', time: '16:30:00.018', latency: '6ms' },
  { id: 'T3', label: 'Decode complete', time: '16:30:00.022', latency: '4ms' },
  { id: 'T4', label: 'Feature update', time: '16:30:00.045', latency: '23ms' },
  { id: 'T5', label: 'FIS complete', time: '16:30:00.067', latency: '22ms' },
  { id: 'T6', label: 'RCS complete', time: '16:30:00.089', latency: '22ms' },
  { id: 'T7', label: 'Risk complete', time: '16:30:00.112', latency: '23ms' },
  { id: 'T8', label: 'Order serialized', time: '16:30:00.115', latency: '3ms' },
  { id: 'T9', label: 'Broker send', time: '16:30:00.118', latency: '3ms' },
  { id: 'T10', label: 'IBKR ack', time: '16:30:00.140', latency: '22ms' },
  { id: 'T11', label: 'Exchange ack', time: '16:30:00.165', latency: '25ms' },
  { id: 'T12', label: 'First fill', time: '16:30:00.180', latency: '15ms' },
];

export const latencySummary = {
  internalCompute: '89 us',
  network: '45 ms',
  vendor: '12 ms',
  broker: '22 ms',
  exchange: '25 ms',
  endToEnd: '180 ms',
};

export const shadowHorizons = [
  '100us', '250us', '500us', '1ms', '2ms', '5ms', '10ms', '25ms', '50ms',
  '100ms', '250ms', '500ms', '1s', '2s', '3s', '5s', '10s', '15s', '30s', '60s',
];

export interface ActiveEvent {
  ticker: string;
  earningsTime: string;
  eventDetected: boolean;
  frozenProfileLoaded: boolean;
  rpers: number;
  expectationBurden: string;
  fis: number | null;
  rcs: number | null;
  priceReaction: string;
  volumeVelocity: string;
  spread: string;
  riskStatus: string;
  decisionState: string;
  authorizedQty: number | null;
  orderStatus: string;
}

export const activeEvents: ActiveEvent[] = [
  {
    ticker: 'SNOW', earningsTime: '16:05 ET', eventDetected: true, frozenProfileLoaded: true,
    rpers: 88, expectationBurden: 'MODERATE', fis: 3.8, rcs: 0.82,
    priceReaction: '+4.2%', volumeVelocity: '8.6x', spread: '0.04',
    riskStatus: 'RISK_APPROVED', decisionState: 'ORDER_READY', authorizedQty: 80, orderStatus: 'READY',
  },
  {
    ticker: 'GWRE', earningsTime: '16:15 ET', eventDetected: true, frozenProfileLoaded: true,
    rpers: 62, expectationBurden: 'HIGH', fis: 1.4, rcs: 0.31,
    priceReaction: '-1.2%', volumeVelocity: '1.2x', spread: '0.08',
    riskStatus: 'REJECTED', decisionState: 'NO_ACTION', authorizedQty: 0, orderStatus: 'REJECTED',
  },
  {
    ticker: 'ZS', earningsTime: '16:30 ET', eventDetected: true, frozenProfileLoaded: true,
    rpers: 74, expectationBurden: 'LOW', fis: 2.1, rcs: 0.55,
    priceReaction: '+1.8%', volumeVelocity: '3.4x', spread: '0.05',
    riskStatus: 'RISK_APPROVED', decisionState: 'REACTION_CONFIRMED', authorizedQty: 45, orderStatus: 'PENDING_CONFIRMATION',
  },
];

export interface Order {
  id: string;
  timestamp: string;
  ticker: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  qty: number;
  limit: number | null;
  submittedPrice: number | null;
  filledQty: number;
  avgFill: number | null;
  remaining: number;
  status: string;
  broker: string;
  strategy: string;
  eventId: string;
  latencyAck: string;
  latencyFill: string;
  slippage: string | null;
  rejectReason: string | null;
}

export const orders: Order[] = [
  {
    id: 'ORD-20240909-001', timestamp: '16:30:00.140', ticker: 'SNOW', side: 'BUY', type: 'MARKET',
    qty: 80, limit: null, submittedPrice: 185.42, filledQty: 80, avgFill: 185.44, remaining: 0,
    status: 'FILLED', broker: 'IBKR', strategy: 'Post-Earnings Momentum', eventId: 'EVT-SN-240909',
    latencyAck: '22ms', latencyFill: '40ms', slippage: '+0.02', rejectReason: null,
  },
  {
    id: 'ORD-20240909-002', timestamp: '16:30:00.118', ticker: 'ZS', side: 'BUY', type: 'LIMIT',
    qty: 45, limit: 142.00, submittedPrice: 142.00, filledQty: 30, avgFill: 142.00, remaining: 15,
    status: 'PARTIAL', broker: 'IBKR', strategy: 'Post-Earnings Momentum', eventId: 'EVT-ZS-240909',
    latencyAck: '18ms', latencyFill: '—', slippage: null, rejectReason: null,
  },
  {
    id: 'ORD-20240909-003', timestamp: '16:15:00.200', ticker: 'GWRE', side: 'BUY', type: 'MARKET',
    qty: 50, limit: null, submittedPrice: 112.30, filledQty: 0, avgFill: null, remaining: 50,
    status: 'REJECTED', broker: 'IBKR', strategy: 'Gap Continuation', eventId: 'EVT-GW-240909',
    latencyAck: '—', latencyFill: '—', slippage: null,
    rejectReason: 'RISK_BLOCKED: FIS below threshold, RCS insufficient',
  },
];

export interface Position {
  ticker: string;
  strategy: string;
  entryTime: string;
  qty: number;
  avgFill: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  realizedPnl: number;
  highWaterPrice: number;
  maxProfit: number;
  maxDrawdown: number;
  protectionState: string;
  apmaState: string;
  authorizedQty: number;
  remainingQty: number;
}

export const positions: Position[] = [
  {
    ticker: 'SNOW', strategy: 'Post-Earnings Momentum', entryTime: '16:30:00.180',
    qty: 80, avgFill: 185.44, currentPrice: 192.85, marketValue: 15428.00,
    unrealizedPnl: 592.80, unrealizedPct: 3.99, realizedPnl: 0,
    highWaterPrice: 193.50, maxProfit: 644.80, maxDrawdown: -45.20,
    protectionState: 'BROKER_PROTECTED', apmaState: 'HOLD', authorizedQty: 80, remainingQty: 80,
  },
  {
    ticker: 'ZS', strategy: 'Post-Earnings Momentum', entryTime: '16:30:00.220',
    qty: 30, avgFill: 142.00, currentPrice: 144.75, marketValue: 4342.50,
    unrealizedPnl: 82.50, unrealizedPct: 1.94, realizedPnl: 0,
    highWaterPrice: 145.20, maxProfit: 96.00, maxDrawdown: -18.50,
    protectionState: 'SYNTHETIC_PROTECTION_ACTIVE', apmaState: 'HOLD', authorizedQty: 45, remainingQty: 15,
  },
];

export const riskConfig = {
  currentEquity: 284750.50,
  maxDailyLoss: 5000.00,
  remainingDailyRisk: 3759.75,
  maxEventRisk: 2500.00,
  currentEventExposure: 19770.50,
  singleNameExposure: 15428.00,
  sectorExposure: 19770.50,
  correlatedExposure: 19770.50,
  grossExposure: 19770.50,
  netExposure: 19770.50,
  openOrdersExposure: 2130.00,
  gapExposure: 19770.50,
  authorizedQty: 80,
  currentQty: 80,
  remainingAuthority: 0,
};

export const positionAuthority = {
  accountEquity: 284750.50,
  defaultAllocationCeiling: 0.05,
  strategyAllocationCeiling: 0.08,
  volatilityAdjustment: 0.95,
  liquidityAdjustment: 0.90,
  spreadAdjustment: 0.98,
  gapRiskAdjustment: 0.92,
  wholeShareAdjustment: 1.0,
  authorizedQty: 80,
  maxCapital: 14237.53,
  maxLoss: 1423.75,
};

export const strategyPerformance = [
  { strategy: 'Pre-Earnings Positive Reaction', trades: 12, winRate: 58.3, avgReturn: 1.85, netPnl: 2840.50, profitFactor: 1.72, mdd: -3.2, sharpe: 1.12, avgHold: '4.2h' },
  { strategy: 'Post-Earnings Momentum', trades: 24, winRate: 62.5, avgReturn: 2.14, netPnl: 5240.75, profitFactor: 1.95, mdd: -4.1, sharpe: 1.34, avgHold: '2.8h' },
  { strategy: 'Overextension Put', trades: 8, winRate: 50.0, avgReturn: 0.92, netPnl: 420.00, profitFactor: 1.18, mdd: -2.8, sharpe: 0.68, avgHold: '1.5h' },
  { strategy: 'Gap Continuation', trades: 15, winRate: 46.7, avgReturn: 0.74, netPnl: -380.25, profitFactor: 0.89, mdd: -5.5, sharpe: 0.45, avgHold: '1.2h' },
  { strategy: 'Gap Fade', trades: 6, winRate: 66.7, avgReturn: 1.45, netPnl: 890.50, profitFactor: 1.55, mdd: -2.1, sharpe: 1.02, avgHold: '3.5h' },
  { strategy: 'APMA Managed', trades: 18, winRate: 55.6, avgReturn: 1.12, netPnl: 1560.00, profitFactor: 1.42, mdd: -3.8, sharpe: 0.89, avgHold: '6.5h' },
];

export const tickerPerformance = [
  { ticker: 'SNOW', trades: 8, wins: 5, losses: 3, winRate: 62.5, grossPnl: 3240.50, netPnl: 2980.25, avgTrade: 372.53, bestTrade: 1240.00, worstTrade: -420.50 },
  { ticker: 'ZS', trades: 6, wins: 4, losses: 2, winRate: 66.7, grossPnl: 1840.00, netPnl: 1680.50, avgTrade: 280.08, bestTrade: 890.00, worstTrade: -215.00 },
  { ticker: 'GWRE', trades: 4, wins: 1, losses: 3, winRate: 25.0, grossPnl: -680.00, netPnl: -740.25, avgTrade: -185.06, bestTrade: 120.00, worstTrade: -380.00 },
  { ticker: 'MDB', trades: 5, wins: 3, losses: 2, winRate: 60.0, grossPnl: 1420.00, netPnl: 1280.50, avgTrade: 256.10, bestTrade: 680.00, worstTrade: -180.00 },
  { ticker: 'OKTA', trades: 7, wins: 3, losses: 4, winRate: 42.9, grossPnl: -240.00, netPnl: -340.75, avgTrade: -48.68, bestTrade: 420.00, worstTrade: -290.00 },
];

export const sectorPerformance = [
  { sector: 'Software / SaaS', trades: 42, winRate: 54.8, pnl: 8240.50, avgGap: 4.2, avgMfe: 6.8, avgMae: -2.4 },
  { sector: 'Cybersecurity', trades: 18, winRate: 61.1, pnl: 3840.25, avgGap: 3.8, avgMfe: 5.9, avgMae: -2.1 },
  { sector: 'Data / Analytics', trades: 12, winRate: 50.0, pnl: 980.00, avgGap: 5.1, avgMfe: 7.2, avgMae: -3.2 },
  { sector: 'Fintech', trades: 8, winRate: 37.5, pnl: -1240.50, avgGap: 2.9, avgMfe: 4.5, avgMae: -3.8 },
];

export const regimePerformance = [
  { regime: 'RISK_ON', trades: 28, winRate: 57.1, avgPnl: 312.50, avgGap: 4.5, falsePositiveRate: 12.5 },
  { regime: 'RISK_OFF', trades: 14, winRate: 42.9, avgPnl: -85.20, avgGap: 2.8, falsePositiveRate: 28.6 },
  { regime: 'MIXED', trades: 22, winRate: 50.0, avgPnl: 145.80, avgGap: 3.6, falsePositiveRate: 18.2 },
  { regime: 'HIGH_VOL', trades: 18, winRate: 55.6, avgPnl: 280.40, avgGap: 5.2, falsePositiveRate: 15.8 },
  { regime: 'LOW_VOL', trades: 16, winRate: 43.8, avgPnl: -45.60, avgGap: 2.1, falsePositiveRate: 31.3 },
];

export const rpersPerformance = [
  { bucket: 'RPERS 50-59', predictedProb: 52, realizedRate: 48, trades: 12, avgPnl: -45.20, avgGap: 2.8, mfe: 4.2, mae: -3.1, calibrationError: 4.0 },
  { bucket: 'RPERS 60-69', predictedProb: 64, realizedRate: 58, trades: 18, avgPnl: 85.40, avgGap: 3.4, mfe: 5.1, mae: -2.8, calibrationError: 6.0 },
  { bucket: 'RPERS 70-79', predictedProb: 74, realizedRate: 71, trades: 24, avgPnl: 240.80, avgGap: 4.1, mfe: 6.3, mae: -2.4, calibrationError: 3.0 },
  { bucket: 'RPERS 80-89', predictedProb: 84, realizedRate: 82, trades: 16, avgPnl: 420.50, avgGap: 4.8, mfe: 7.1, mae: -2.0, calibrationError: 2.0 },
  { bucket: 'RPERS 90+', predictedProb: 92, realizedRate: 91, trades: 8, avgPnl: 680.25, avgGap: 6.2, mfe: 8.5, mae: -1.8, calibrationError: 1.0 },
];

export const earningsBreakdown = {
  totalTrades: 78,
  positiveReaction: 42,
  negativeReaction: 36,
  correctPredictions: 38,
  incorrectPredictions: 40,
  reactionAccuracy: 48.7,
  gapAccuracy: 52.6,
  avgGapCaptured: 3.8,
  avgProfitPerEvent: 245.80,
  avgLossPerEvent: -185.40,
  beatPositive: 28,
  beatNegative: 14,
  missPositive: 14,
  missNegative: 22,
};

export const orderFinancials = [
  { orderId: 'ORD-240901-001', ticker: 'SNOW', strategy: 'Post-Earnings Momentum', event: 'Q2 FY24', entryTime: '16:05:00', exitTime: '18:30:00', entryPrice: 165.20, exitPrice: 172.40, qty: 60, grossPnl: 432.00, fees: 8.50, slippage: 3.20, netPnl: 420.30, returnPct: 4.36, mfe: 8.20, mae: -1.40, holdPeriod: '2.4h', outcome: 'WIN' },
  { orderId: 'ORD-240901-002', ticker: 'ZS', strategy: 'Post-Earnings Momentum', event: 'Q2 FY24', entryTime: '16:05:00', exitTime: '17:45:00', entryPrice: 128.50, exitPrice: 132.10, qty: 40, grossPnl: 144.00, fees: 6.20, slippage: 1.80, netPnl: 136.00, returnPct: 2.80, mfe: 4.50, mae: -0.80, holdPeriod: '1.7h', outcome: 'WIN' },
  { orderId: 'ORD-240901-003', ticker: 'GWRE', strategy: 'Gap Continuation', event: 'Q2 FY24', entryTime: '16:15:00', exitTime: '16:45:00', entryPrice: 112.30, exitPrice: 109.80, qty: 50, grossPnl: -125.00, fees: 7.50, slippage: 2.50, netPnl: -135.00, returnPct: -2.23, mfe: 0.50, mae: -3.20, holdPeriod: '0.5h', outcome: 'LOSS' },
  { orderId: 'ORD-240815-001', ticker: 'MDB', strategy: 'Pre-Earnings Positive Reaction', event: 'Q2 FY24', entryTime: '15:55:00', exitTime: '16:30:00', entryPrice: 225.00, exitPrice: 231.50, qty: 30, grossPnl: 195.00, fees: 5.80, slippage: 1.50, netPnl: 187.70, returnPct: 2.89, mfe: 3.80, mae: -0.90, holdPeriod: '0.6h', outcome: 'WIN' },
  { orderId: 'ORD-240815-002', ticker: 'OKTA', strategy: 'Gap Fade', event: 'Q2 FY24', entryTime: '16:05:00', exitTime: '16:50:00', entryPrice: 88.50, exitPrice: 86.20, qty: 55, grossPnl: -126.50, fees: 8.20, slippage: 2.80, netPnl: -137.50, returnPct: -2.60, mfe: 0.40, mae: -3.10, holdPeriod: '0.8h', outcome: 'LOSS' },
];

export const auditEvents = [
  { id: 1, timestamp: '2024-09-09 16:30:00', level: 'START' as const, source: 'Engine', type: 'SYSTEM', message: 'Engine started in PAPER mode', data: null },
  { id: 2, timestamp: '2024-09-09 16:05:00', level: 'INFO' as const, source: 'EventFeed', type: 'EVENT', message: 'SNOW earnings detected', data: { ticker: 'SNOW', time: '16:05' } },
  { id: 3, timestamp: '2024-09-09 16:05:00', level: 'SUCCESS' as const, source: 'RiskEngine', type: 'APPROVAL', message: 'SNOW order approved', data: { qty: 80 } },
  { id: 4, timestamp: '2024-09-09 16:30:00', level: 'INFO' as const, source: 'EventFeed', type: 'EVENT', message: 'ZS earnings detected', data: { ticker: 'ZS', time: '16:30' } },
  { id: 5, timestamp: '2024-09-09 16:30:00', level: 'SUCCESS' as const, source: 'RiskEngine', type: 'APPROVAL', message: 'ZS order approved', data: { qty: 45 } },
  { id: 6, timestamp: '2024-09-09 16:15:00', level: 'WARNING' as const, source: 'RiskEngine', type: 'REJECTION', message: 'GWRE order rejected: FIS below threshold', data: { ticker: 'GWRE' } },
  { id: 7, timestamp: '2024-09-09 16:30:00', level: 'SUCCESS' as const, source: 'Broker', type: 'FILL', message: 'SNOW order filled', data: { filled: 80, avg: 185.44 } },
  { id: 8, timestamp: '2024-09-09 16:30:00', level: 'INFO' as const, source: 'Broker', type: 'PARTIAL', message: 'ZS partial fill', data: { filled: 30, remaining: 15 } },
];

export const preEventMetrics = {
  beatProbability: 68.5,
  rpers: 88,
  expectationBurden: 'MODERATE',
  historicalPositiveGapRate: 62.3,
  beatButSellRate: 18.5,
  impliedMove: 4.8,
  pre5d: -1.2,
  pre10d: 2.4,
  pre20d: 5.8,
  valuationState: 'FAIR',
  peerRegime: 'POSITIVE',
  sectorRegime: 'MIXED',
};

export const fisBreakdown = {
  epsSurprise: 12.5,
  revenueSurprise: 8.3,
  guidanceSurprise: 15.2,
  kpiSurprise: 6.8,
  surpriseAcceleration: 2.1,
  expectationBurden: 3.2,
  fis: 3.8,
};

export const reactionMetrics = {
  priceChange: 4.2,
  priceVelocity: 2.8,
  priceAcceleration: 0.45,
  volumePerSec: 12400,
  dollarVolumePerSec: 2298000,
  relativeVolumeVelocity: 8.6,
  tradeCountPerSec: 420,
  buySellImbalance: 72,
  bidAskImbalance: 65,
  spread: 0.04,
  spreadExpansion: 0.01,
  eventVwap: 186.20,
  distanceFromVwap: 3.2,
  highWaterMark: 193.50,
  drawdownFromHwm: -0.34,
  largePrintFrequency: 12,
  depthImbalance: 68,
  rcs: 0.82,
  status: 'REACTION_CONFIRMED',
};

export const winsPerOrder = {
  totalOrders: 78,
  winningOrders: 42,
  losingOrders: 36,
  winRate: 53.8,
  averageWin: 312.40,
  averageLoss: -185.60,
  largestWin: 1240.00,
  largestLoss: -420.50,
  medianWin: 240.00,
  medianLoss: -145.00,
  winLossRatio: 1.68,
  profitFactor: 1.45,
  expectancyPerOrder: 82.35,
};

export type EngineMode = 'SHADOW' | 'PAPER' | 'LIVE';
export type KillSwitchState = 'SAFE' | 'ARMED' | 'TRIGGERED';
