import '../api/lib/env';
import { getHistory } from '../api/marketdata/gateway/gateway';
const userId = 'dba1bfb1-5dc6-439b-9e1c-c35bc77b8ce4';
const h = await getHistory(userId, 'SPY', '1d', '1m');
console.log(JSON.stringify({ available: h.available, source: h.source, bars: h.bars.length, first: h.bars[0], last: h.bars[h.bars.length-1] }, null, 2));
process.exit(0);
