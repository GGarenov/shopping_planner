// Weekly meal planner (command line). The planner itself lives in lib/planner/plan.ts — the app uses the same code.
//   node scripts/plan.mjs data/profiles/<name>.json      (npm run plan -- data/profiles/<name>.json)
// Reads the local data files, writes data/plans/<name>-<date>.json and prints the week.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePlan } from '../lib/planner/plan.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = p => JSON.parse(fs.readFileSync(path.resolve(ROOT, p), 'utf8'));
const profile = readJson(process.argv[2] || 'data/profiles/test.json');

const res = await generatePlan({
  profile,
  ingredients: readJson('data/ingredients.json').ingredients,
  recipes: readJson('data/recipes.json').recipes,
  products: readJson('data/ebag_products.json').products,
});
for (const line of res.log) console.log(line);
if (!res.ok) {
  console.error(`No feasible plan (${res.reason}). Try a wider kcal tolerance, more candidates per slot, a bigger budget or fewer exclusions.`);
  process.exit(1);
}

const out = res.output;
const outPath = path.join(ROOT, 'data', 'plans', `${profile.name}-${new Date().toISOString().slice(0, 10)}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

const SLOT_BG = { breakfast: 'Закуска', lunch: 'Обяд', dinner: 'Вечеря', snack: 'Междинно' };
const pantry = new Set(out.pantry);
for (const d of out.plan) {
  console.log(`\n${d.day}: ${d.kcal} kcal, ${d.protein_g} g protein, ${d.fat_g} g fat, ${d.carbs_g} g carbs`);
  for (const m of d.meals) console.log(`  ${SLOT_BG[m.slot].padEnd(9)} ${m.recipe} (${Math.round(m.kcal)} kcal, ${Math.round(m.protein_g)} g P) — ${m.items.filter(i => !pantry.has(i.id) && i.grams >= 10).map(i => `${i.name} ${i.grams} г`).join(', ')}`);
}
console.log('\nShopping list:');
for (const s of out.shopping) console.log(`  [${s.aisle}] ${s.packs} x ${s.product} (${s.pack}) — ${s.cost.toFixed(2)} EUR${s.promo ? ' (promo)' : ''}${s.macros_source === 'label' ? ' [eBag label]' : ''}`);
console.log(`\nCheckout: ${out.checkout_eur.toFixed(2)} EUR (budget ${out.budget_eur}); food actually eaten: ~${out.eaten_eur.toFixed(2)} EUR (best of round ${out.solver.best_round})`);
console.log(`Macros from eBag labels for ${out.shopping.filter(s => s.macros_source === 'label').length}/${out.shopping.length} bought products, USDA for the rest.`);
console.log(`Pantry (assumed at home): ${out.pantry.join(', ')}`);
console.log(`Total time ${out.solver.total_seconds.toFixed(1)} s. Saved: ${path.relative(ROOT, outPath)}`);
