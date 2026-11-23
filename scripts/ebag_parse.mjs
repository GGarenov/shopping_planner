// Pure helpers for the eBag sync: pack sizes, prices, nutrition labels, ingredient matching.

const num = s => {
  if (s == null) return null;
  const t = String(s).replace(',', '.').replace(/^[<~≈]\s*/, '').trim();
  if (/\d\s*-\s*\d/.test(t)) return null; // ranges like 305-395 are not usable
  const m = t.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const round = (x, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// ---------- pack size ----------
// "650 г", "2 x 500 г", "1 кг", "500 мл", "1 л", "10 бр.", "~ 670 г / бр", "1 бр."
export function parsePack(label = '', unit = 'pcs', step = 1) {
  const s = label.toLowerCase().replace(/,/g, '.').replace(/\s+/g, ' ');
  const out = { label, grams: null, ml: null, count: null, variable_weight: s.includes('~') };
  const toBase = (q, u) => (u === 'кг' || u === 'л' ? q * 1000 : q);
  let m = s.match(/(\d+)\s*[xх×]\s*([\d.]+)\s*(кг|гр|г|мл|л)(?![а-я])/);
  if (m) {
    const total = Number(m[1]) * toBase(Number(m[2]), m[3]);
    m[3] === 'мл' || m[3] === 'л' ? (out.ml = total) : (out.grams = total);
  } else if ((m = s.match(/([\d.]+)\s*(кг|гр|г|мл|л)(?![а-я])/))) {
    const total = toBase(Number(m[1]), m[2]);
    m[2] === 'мл' || m[2] === 'л' ? (out.ml = total) : (out.grams = total);
  }
  if (!out.grams && !out.ml && (m = s.match(/(\d+)\s*(бр|връзк)/))) out.count = Number(m[1]);
  if (unit === 'kg') { out.grams = Number(step || 1) * 1000; out.variable_weight = false; }
  return out;
}

// Weight written in the product NAME, for items sold "1 бр.":
// "Карфиол 0.800-1.100 кг" -> 950, "Краставица 200-250 г" -> 225, "Авокадо ... около 125 гр." -> 125, "~ 1 кг" -> 1000
export function parseWeightFromName(name = '') {
  const s = name.toLowerCase().replace(/,/g, '.');
  const toG = (q, u) => (u === 'кг' ? q * 1000 : q);
  let m = s.match(/(\d+(?:\.\d+)?)\s*(?:-|–|до)\s*(\d+(?:\.\d+)?)\s*(кг|гр|г)(?![а-я])/);
  if (m) return Math.round(toG((Number(m[1]) + Number(m[2])) / 2, m[3]));
  m = s.match(/(?:~|около|ок\.)\s*(\d+(?:\.\d+)?)\s*(кг|гр|г)(?![а-я])/);
  if (m) return Math.round(toG(Number(m[1]), m[2]));
  // Latin units, e.g. protein powders: "450 G", "1 Kg", "1.816 Kg"
  m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g)(?![a-z])/);
  if (m) return Math.round(m[2] === 'kg' ? Number(m[1]) * 1000 : Number(m[1]));
  // Bare kilograms with 3 decimals, e.g. "Pure Whey 0.454 Strawberry"
  m = s.match(/(?<![\d.])([0-4]\.\d{3})(?![\d.])/);
  if (m) return Math.round(Number(m[1]) * 1000);
  return null;
}

// ---------- prices ----------
export function parsePrices(p = {}, grams) {
  const regular = num(p.unit_delta);
  const promo = num(p.promo_unit_delta);
  const out = {
    regular,
    promo: promo && promo < regular ? promo : null,
    per_kg: grams ? round((regular / grams) * 1000) : null,
  };
  if (p.bundle_discount_data?.original_price) {
    out.bundle_note = `-${p.bundle_discount_data.percent}% multi-pack (was ${num(p.bundle_discount_data.original_price)})`;
  }
  return out;
}

// ---------- nutrition ----------
const KEYS = [
  ['sat_fat_g', /наситени/i],
  ['sugar_g', /захари/i],
  ['fat_g', /^мазнини/i],
  ['carbs_g', /^въглехидрати/i],
  ['fiber_g', /влакнини|фибри|баластни/i],
  ['protein_g', /белтъ|протеин/i],
  ['salt_g', /^сол/i],
];

function kcalFrom(key, value) {
  const v = String(value).replace(',', '.');
  let m = v.match(/([\d.]+)\s*(k?cal|ккал|кcal|кал)/i);
  if (m) return Number(m[1]);
  const nums = (v.match(/\d+(\.\d+)?/g) || []).map(Number);
  if (!nums.length) return null;
  if (/kj\s*\/\s*kcal|кдж\s*\/\s*ккал/i.test(key)) return nums[1] ?? null;
  return nums[0];
}

export function checkLabel(l) {
  if (l.kcal == null || l.protein_g == null || l.fat_g == null || l.carbs_g == null) return false;
  const est = 4 * l.protein_g + 4 * l.carbs_g + 9 * l.fat_g + 2 * (l.fiber_g || 0);
  if (l.kcal === 0) return est < 5;
  return Math.abs(est - l.kcal) / l.kcal <= 0.15;
}

export function parseEnergyValues(ev = {}) {
  const entries = Object.entries(ev);
  if (!entries.length) return null;
  const label = { source: 'energy_values' };
  for (const [k, v] of entries) {
    if (/енерги/i.test(k)) { label.kcal = kcalFrom(k, v); continue; }
    const hit = KEYS.find(([, re]) => re.test(k.trim()));
    if (hit && label[hit[0]] == null) label[hit[0]] = num(v);
  }
  if (label.kcal == null) return null;
  label.valid = checkLabel(label);
  return label;
}

// Fallback: macros written in the free-text description.
export function parseDescriptionNutrition(desc = '') {
  const d = desc.replace(/\s+/g, ' ');
  if (!/енергийна стойност|хранителна (стойност|информация)/i.test(d)) return null;
  const grab = re => { const m = d.match(re); return m ? num(m[1]) : null; };
  const after = word => new RegExp(word + '[^\\d\\-]{0,25}?(\\d+(?:[.,]\\d+)?(?:\\s*-\\s*\\d+(?:[.,]\\d+)?)?)', 'i');
  const label = {
    source: 'description_text',
    kcal: grab(/(\d+(?:[.,]\d+)?)\s*(?:kcal|ккал|кcal|кal)/i) ?? grab(/\((?:kcal|ккал)\)\s*(\d+(?:[.,]\d+)?)/i),
    fat_g: grab(after('мазнини')),
    sat_fat_g: grab(after('наситени мастни киселини')),
    carbs_g: grab(after('въглехидрати')),
    sugar_g: grab(after('захари')),
    fiber_g: grab(after('(?:влакнини|фибри)')),
    protein_g: grab(after('(?:белтъчини|белтъци|протеини?)')),
    salt_g: grab(after('сол')),
  };
  if (label.kcal == null || label.protein_g == null || label.carbs_g == null || label.fat_g == null) return null;
  label.valid = checkLabel(label);
  return label;
}

export function parseProductDetails(p) {
  const desc = p.description || '';
  const drained = desc.match(/отцедено\s+(?:нетно\s+)?тегло\s*:?\s*(\d+)\s*г/i);
  const approx = desc.match(/около\s*(\d+)\s*(?:гр|г)\b/i);
  return {
    fetched: new Date().toISOString().slice(0, 10),
    label: parseEnergyValues(p.energy_values) ?? parseDescriptionNutrition(desc),
    drained_grams: drained ? Number(drained[1]) : null,
    approx_grams: approx ? Number(approx[1]) : null,
    country: p.country_of_origin || null,
    may_contain_celery: /следи от\s+целина|съдържа целина|\bЦЕЛИНА\b/.test(desc) || undefined,
  };
}

// ---------- ingredient matching ----------
// \b and \w in rule patterns are made Unicode-aware (JS \b is ASCII-only).
const L = '[\\p{L}\\p{N}]';
const WB = `(?:(?<=${L})(?!${L})|(?<!${L})(?=${L}))`;
export function compileRule(pattern) {
  return new RegExp(pattern.replaceAll('\\b', WB).replaceAll('\\w', '[\\p{L}\\p{N}_]'), 'iu');
}

export function buildMatchers(ingredients, categoryGroups, globalExclude) {
  const global = globalExclude.map(compileRule);
  const list = ingredients.filter(i => i.match).map(i => ({
    id: i.id,
    include: i.match.include.map(compileRule),
    exclude: (i.match.exclude || []).map(compileRule),
    cats: new Set((i.match.categories || []).flatMap(g => categoryGroups[g] ?? [Number(g)])),
    notCats: new Set((i.match.exclude_categories || []).flatMap(g => categoryGroups[g] ?? [Number(g)])),
    fractionRules: (i.edible_fraction_rules || []).map(r => ({ re: compileRule(r.pattern), value: r.value })),
  }));
  return function match(name, categories) {
    if (global.some(re => re.test(name))) return null;
    const hits = [];
    for (const m of list) {
      if (m.cats.size && !categories.some(c => m.cats.has(c))) continue;
      if (m.notCats.size && categories.some(c => m.notCats.has(c))) continue;
      let best = 0;
      for (const re of m.include) { const r = name.match(re); if (r && r[0].length > best) best = r[0].length; }
      if (!best || m.exclude.some(re => re.test(name))) continue;
      hits.push({ id: m.id, score: best, m });
    }
    if (!hits.length) return null;
    hits.sort((a, b) => b.score - a.score);
    const top = hits[0];
    const fraction = top.m.fractionRules.find(r => r.re.test(name))?.value;
    return {
      ingredient_id: top.id,
      edible_fraction: fraction,
      ambiguous: hits.length > 1 && hits[1].score === top.score ? hits.filter(h => h.score === top.score).map(h => h.id) : null,
    };
  };
}
