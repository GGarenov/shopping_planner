// One-time eBag sign-in for the daily sync. Opens a browser; sign in and click "Connect".
//   npm run ebag:login
import { connect } from './ebag_client.mjs';

const api = await connect({ interactive: true });
const test = await api.call('search_products', { query: 'прясно мляко', page_size: 1 });
console.log(`eBag connected. Test search returned ${test.total} products. Tokens saved to .secrets/ebag_oauth.json`);
await api.close();
