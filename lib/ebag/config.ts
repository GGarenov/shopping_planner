// Settings for the daily eBag sync (scripts/sync.ts). Category IDs come from the MCP tool get_categories.

// eBag top-level / sub categories that are crawled every day (food only).
// IDs come from the MCP tool get_categories.
export const CRAWL_CATEGORIES: Record<number, string> = {
  3: 'Плодове и зеленчуци',
  490: 'Месо и риба',
  2: 'Млечни и яйца',
  494: 'Пекарна',
  1095: 'Замразени храни',
  5: 'Основни храни и консерви',
  3586: 'Ядки и сушени плодове',
  5130: 'Солети и крекери',
  5126: 'Шоколад и шоколадови изделия',
  4921: 'Спорт, фитнес и протеинови храни',
  404: 'Зърнени закуски, корнфлейкс и мюсли',
  6: 'Специални храни',
  1161: 'Фермерски пазар',
  1881: 'Био хляб и тестени изделия',
  1886: 'Био плодове и зеленчуци',
  1892: 'Био месо и колбаси',
  1897: 'Био млечни продукти',
  1904: 'Био основни храни',
  4189: 'Био ядки и семена',
};

// Category groups used by ingredients.json "match.categories".
export const CATEGORY_GROUPS: Record<string, number[]> = {
  fresh: [3, 1886, 1161],
  meat_fish: [490, 1892, 1161, 1095],
  dairy: [2, 1897, 1161],
  bakery: [494, 1881],
  frozen: [1095],
  staples: [5, 1904, 6, 404, 1161],
  nuts: [3586, 4189, 5, 1904, 6],
  sweet_salty: [5130, 5126],
  special: [6, 4921],
};

// Products whose name matches any of these are never linked to an ingredient.
export const GLOBAL_EXCLUDE: string[] = [
  'бебе', 'бебешк', 'детск', 'за деца', 'за кучета', 'за котки', 'козмет', 'шампоан', 'сапун',
  'лосион', 'бонбон', 'дъвк', 'желирани', 'подаръч', 'играчк',
  // kitchen tools and accessories sold next to food
  'преса за', 'белачка', 'ренде', 'нож за', 'дъска за', 'купа за', 'кутия за', 'съд за', 'торбичк', 'мрежа за',
  'резачка', 'аксесоар', 'форма за', 'хартия за печене', 'фолио',
];

export const SYNC = {
  minCatalog: 1000,         // abort if fewer products were crawled (never overwrite data with a partial crawl)
  pageSize: 50,             // max allowed by browse_products
  delayMs: 600,             // pause between MCP calls (eBag rate-limits at roughly 3-4 calls/s)
  retries: 8,
  nutritionPerRun: 400,     // max get_product calls per run (cache fills over a few days)
  nutritionMaxAgeDays: 30,  // re-check product details after this many days
  dropUnseenAfterDays: 14,  // remove linked products not seen in the catalogue for this long
} as const;
