import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });
import { gatewayHealth } from '../api/marketdata/ibkr-data.ts';
import { configuredIbkrAccountId, ibkrGatewayFetch } from '../api/brokers/ibkr.ts';

async function main() {
  console.log('account', configuredIbkrAccountId());
  console.log('gatewayUrl env', process.env.IBKR_GATEWAY_URL);
  const h = await gatewayHealth();
  console.log('health', h);
  const res = await ibkrGatewayFetch('/iserver/auth/status', { method: 'GET' });
  const text = await res.text();
  console.log('raw', res.status, text.slice(0, 800));
}
main().catch((e) => { console.error(e); process.exit(1); });
