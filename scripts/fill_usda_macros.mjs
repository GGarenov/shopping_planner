// Fills per_100g and usda.description/dataset in data/ingredients.json from data/usda/usda_macros.csv,
// using each ingredient's usda.fdc_id. Run after adding or changing ingredients:
//   node scripts/fill_usda_macros.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ING = path.join(ROOT, 'data', 'ingredients.json');
const CSV = path.join(ROOT, 'data', 'usda', 'usda_macros.csv');

function parseLine(line) {
  const out = []; let f = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(f); f = ''; } else f += c;
  }
  out.push(f); return out;
}

const [header, ...rows] = fs.readFileSync(CSV, 'utf8').trim().split('\n');
const cols = parseLine(header);
const usda = new Map(rows.map(r => { const v = parseLine(r); return [Number(v[0]), Object.fromEntries(cols.map((c, i) => [c, v[i]]))]; }));

const MACROS = ['kcal', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'sugar_g', 'sat_fat_g', 'sodium_mg'];
const doc = JSON.parse(fs.readFileSync(ING, 'utf8'));
let missing = 0;
for (const ing of doc.ingredients) {
  // Diet tags are nested: vegan ⊂ vegetarian ⊂ pescatarian.
  const d = new Set(ing.diets || []);
  if (d.has('vegan')) d.add('vegetarian');
  if (d.has('vegetarian')) d.add('pescatarian');
  ing.diets = ['vegan', 'vegetarian', 'pescatarian', 'low_carb'].filter(x => d.has(x));
  if (ing.manual_per_100g) { ing.per_100g = ing.manual_per_100g; continue; } // not in USDA; macros entered by hand
  const row = usda.get(ing.usda?.fdc_id);
  if (!row) { console.error(`!! ${ing.id}: fdc_id ${ing.usda?.fdc_id} not found`); missing++; continue; }
  ing.usda = { fdc_id: ing.usda.fdc_id, dataset: row.source, description: row.description };
  ing.per_100g = Object.fromEntries(MACROS.map(m => [m, row[m] === '' ? null : Number(row[m])]));
}

// Keep a stable, readable key order.
const ORDER = ['id', 'name_en', 'name_bg', 'aisle', 'usda', 'per_100g'];
doc.ingredients = doc.ingredients.map(i => Object.fromEntries([
  ...ORDER.filter(k => k in i).map(k => [k, i[k]]),
  ...Object.entries(i).filter(([k]) => !ORDER.includes(k)),
]));
doc._about.updated = new Date().toISOString().slice(0, 10);
fs.writeFileSync(ING, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`${doc.ingredients.length} ingredients, ${missing} missing USDA rows`);
const ids = doc.ingredients.map(i => i.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) console.error('!! duplicate ids:', dupes);
