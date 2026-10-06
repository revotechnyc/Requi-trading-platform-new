import '../api/lib/env';
import { ibkrGatewayFetch } from '../api/brokers/ibkr';

async function main() {
  for (const path of [
    '/trsrv/stocks?symbols=AAPL',
    '/iserver/secdef/search?symbol=AAPL',
  ]) {
    const res = await ibkrGatewayFetch(path, { method: 'GET' });
    const text = await res.text();
    console.log('---', path, res.status);
    console.log(text.slice(0, 600));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
