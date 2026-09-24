// Data feed configuration for the Requi Autonomous Engine

export interface FeedConfig {
  name: string;
  category: 'research' | 'hotpath' | 'execution';
  status: 'CONNECTED' | 'DEGRADED' | 'STALE' | 'DISCONNECTED';
  lastMessage: string;
  latency: string;
  errorRate: string;
}

export const dataFeeds: FeedConfig[] = [
  { name: 'SEC EDGAR', category: 'research', status: 'CONNECTED', lastMessage: '2s ago', latency: '120ms', errorRate: '0.00%' },
  { name: 'Finnhub', category: 'research', status: 'CONNECTED', lastMessage: '5s ago', latency: '85ms', errorRate: '0.00%' },
  { name: 'GDELT', category: 'research', status: 'CONNECTED', lastMessage: '12s ago', latency: '200ms', errorRate: '0.00%' },
  { name: 'Reddit RSS', category: 'research', status: 'CONNECTED', lastMessage: '8s ago', latency: '95ms', errorRate: '0.01%' },
  { name: 'Macro feeds', category: 'research', status: 'DEGRADED', lastMessage: '45s ago', latency: '350ms', errorRate: '0.05%' },
  { name: 'Earnings Event Feed', category: 'hotpath', status: 'CONNECTED', lastMessage: '<1s ago', latency: '12ms', errorRate: '0.00%' },
  { name: 'Benzinga Pro', category: 'hotpath', status: 'CONNECTED', lastMessage: '<1s ago', latency: '18ms', errorRate: '0.00%' },
  { name: 'Massive Trades WS', category: 'hotpath', status: 'CONNECTED', lastMessage: '<1s ago', latency: '8ms', errorRate: '0.00%' },
  { name: 'Massive NBBO WS', category: 'hotpath', status: 'CONNECTED', lastMessage: '<1s ago', latency: '6ms', errorRate: '0.00%' },
  { name: 'IBKR TWS API', category: 'execution', status: 'CONNECTED', lastMessage: '<1s ago', latency: '22ms', errorRate: '0.00%' },
  { name: 'IBKR Order Router', category: 'execution', status: 'CONNECTED', lastMessage: '<1s ago', latency: '15ms', errorRate: '0.00%' },
];

export const feedCategories = ['research', 'hotpath', 'execution'] as const;

export type FeedCategory = (typeof feedCategories)[number];

export function getStatusColor(status: FeedConfig['status']): string {
  switch (status) {
    case 'CONNECTED': return '#5ED6C0';
    case 'DEGRADED': return '#F4A261';
    case 'STALE': return '#EF4444';
    case 'DISCONNECTED': return '#EF4444';
    default: return '#94A3B8';
  }
}
