// Local file paths for the eBag scripts. Sync settings live in lib/ebag/config.ts.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PATHS = {
  ingredients: path.join(ROOT, 'data', 'ingredients.json'),
  products: path.join(ROOT, 'data', 'ebag_products.json'),
  catalog: path.join(ROOT, 'data', 'ebag_catalog.json'),
  nutritionCache: path.join(ROOT, 'data', 'ebag_nutrition_cache.json'),
  overrides: path.join(ROOT, 'data', 'ebag_overrides.json'),
  priceHistoryDir: path.join(ROOT, 'data', 'price_history'),
  oauth: path.join(ROOT, '.secrets', 'ebag_oauth.json'),
  logs: path.join(ROOT, 'logs'),
};

export { MCP_URL } from '../lib/ebag/api.ts';
export { CRAWL_CATEGORIES, CATEGORY_GROUPS, GLOBAL_EXCLUDE, SYNC } from '../lib/ebag/config.ts';
