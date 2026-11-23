// Weekly meal planner, version 3 (two-stage, with re-pricing rounds).
//   node scripts/plan.mjs data/profiles/<name>.json
//
// Stage 1 — choose meals: which recipe goes into each slot and roughly how many grams, so that every day
//   hits the kcal range and protein minimum and the variety rules hold. Cost is estimated per gram
//   (cheapest product) plus a penalty per distinct ingredient, so the week reuses what it buys.
// Stage 2 — buy: with the recipes fixed, choose eBag products and whole packs, re-tune the grams within the
//   recipe ranges using each product's own label macros, and minimise the checkout total within budget.
// Macros: the bought product's eBag label when valid, otherwise USDA (ingredients.json).
// Not handled yet: batch cooking/leftovers, price of pantry items.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import highsLoader from 'highs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = p => JSON.parse(fs.readFileSync(path.resolve(ROOT, p), 'utf8'));
const profile = readJson(process.argv[2] || 'data/profiles/test.json');
const t00 = Date.now();

const ingredients = new Map(readJson('data/ingredients.json').ingredients.map(i => [i.id, i]));
const recipesAll = readJson('data/recipes.json').recipes;
const products = readJson('data/ebag_products.json').products;
const MACROS = ['kcal', 'protein_g', 'fat_g', 'carbs_g'];

// ---------- 1. targets ----------
const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 };
function computeTargets(p) {
  const bmr = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const tdee = bmr * ACTIVITY[p.activity];
  let kcal = tdee;
  if (p.goal === 'lose') kcal = tdee - Math.min(0.2 * tdee, 750);
  if (p.goal === 'gain') kcal = tdee + 300;
  kcal = Math.max(kcal, p.sex === 'male' ? 1500 : 1200);
  const refWeight = Math.min(p.weight_kg, 25 * (p.height_cm / 100) ** 2); // weight at BMI 25
  const protein = (p.goal === 'lose' ? 2.0 : 1.6) * refWeight;
  return {
    bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: Math.round(kcal),
    kcal_min: Math.round(kcal - (p.kcal_tolerance ?? 100)), kcal_max: Math.round(kcal + (p.kcal_tolerance ?? 100)),
    protein_min: Math.round(protein), ref_weight: Math.round(refWeight * 10) / 10,
    formula: `Mifflin-St Jeor BMR x ${ACTIVITY[p.activity]} (${p.activity})${p.goal === 'lose' ? ' - 20% (max 750)' : ''}; protein ${p.goal === 'lose' ? 2.0 : 1.6} g x ${Math.round(refWeight)} kg (weight at BMI 25 or less)`,
  };
}
const T = profile.targets_override ?? computeTargets(profile);

// ---------- 2. products per ingredient (with their own macros) ----------
const pantry = new Set(profile.pantry ?? []);
const ingMacro = (ing, m) => (ing.per_100g?.[m] ?? 0) / 100; // per gram
function offerMacros(p, ing) {
  const l = p.label;
  if (l?.valid && MACROS.every(m => l[m] != null)) {
    const perG = l.basis === 'per_100ml' ? 1 / (100 * (ing.density_g_per_ml ?? 1)) : 1 / 100;
    return { source: 'label', ...Object.fromEntries(MACROS.map(m => [m, l[m] * perG])) };
  }
  return { source: 'usda', ...Object.fromEntries(MACROS.map(m => [m, ingMacro(ing, m)])) };
}
const offers = new Map(); // ingredient_id -> [{product, usable_g, price, per_g, macros}]
for (const p of products) {
  const ing = ingredients.get(p.ingredient_id);
  if (!ing || !p.available || !p.price?.regular || !(p.pack?.grams > 0)) continue;
  const ef = p.edible_fraction ?? ing.edible_fraction ?? 1;
  const usable = (p.pack.drained_grams ?? p.pack.grams) * ef;
  const price = p.price.promo ?? p.price.regular;
  if (!offers.has(ing.id)) offers.set(ing.id, []);
  offers.get(ing.id).push({ product: p, usable_g: usable, price, per_g: price / usable, macros: offerMacros(p, ing) });
}
for (const [id, list] of offers) offers.set(id, list.sort((a, b) => a.per_g - b.per_g).slice(0, profile.products_per_ingredient ?? 3));
const canGet = id => pantry.has(id) || offers.has(id);
// Stage-1 view of an ingredient: cheapest product's macros and price per gram; smallest pack price for the "new ingredient" penalty.
const est = id => {
  const ing = ingredients.get(id);
  if (pantry.has(id)) return { per_g: 0, macros: offerMacros({}, ing), packPrice: 0 };
  const list = offers.get(id);
  return { per_g: list[0].per_g, macros: list[0].macros, packPrice: Math.min(...list.map(o => o.price)) };
};

// ---------- 3. filter recipes (diet, exclusions, availability) ----------
const banned = new Set([...(profile.exclude_tags ?? []), ...(profile.allergens ?? [])]);
const ingOk = ing => ![...(ing.tags || []), ...(ing.allergens || [])].some(t => banned.has(t)) && (!profile.diet || ing.diets?.includes(profile.diet));
const SLOT_TYPES = { breakfast: ['breakfast'], lunch: ['lunch'], dinner: ['dinner'], snack: ['snack', 'dessert'] };
const MAIN_PROTEINS = new Set(['chicken', 'turkey', 'pork', 'beef', 'mixed_meat', 'fish', 'seafood']);
const FISH = new Set(['fish', 'seafood']);
const usable = [], dropped = [];
for (const r of recipesAll) {
  if (r.meal_types.every(m => m === 'side')) continue;
  const items = [];
  let ok = true;
  for (const it of r.ingredients) {
    const ing = ingredients.get(it.id);
    const optional = it.g == null && it.min_g === 0;
    if (!ingOk(ing) || !canGet(it.id)) { if (optional) continue; ok = false; dropped.push(`${r.id} (${it.id}${canGet(it.id) ? '' : ': no eBag product'})`); break; }
    items.push({ ...it, ing });
  }
  if (ok) usable.push({ ...r, items });
}

// ---------- 4. prefilter: best candidates per slot ----------
for (const r of usable) {
  let cost = 0, protein = 0;
  for (const it of r.items) {
    const g = it.g ?? (it.min_g + it.max_g) / 2;
    const e = est(it.id);
    cost += g * e.per_g; protein += g * e.macros.protein_g;
  }
  r._score = cost / Math.max(protein, 5); // EUR per gram of protein
}
const K = profile.candidates_per_slot ?? 8;
const slots = profile.slots ?? ['breakfast', 'lunch', 'dinner', 'snack'];
const days = profile.days ?? 7;
const candidates = {};
for (const s of slots) {
  const pool = usable.filter(r => r.meal_types.some(m => SLOT_TYPES[s].includes(m))).sort((a, b) => a._score - b._score);
  const pick = new Set(pool.filter(r => !r.treat).slice(0, K));
  if (s === 'lunch' || s === 'dinner') {
    pool.filter(r => FISH.has(r.protein)).slice(0, 3).forEach(r => pick.add(r));
    for (const g of MAIN_PROTEINS) pool.filter(r => r.protein === g).slice(0, 2).forEach(r => pick.add(r));
  }
  if (s === 'snack') pool.filter(r => r.treat).slice(0, 4).forEach(r => pick.add(r));
  candidates[s] = [...pick];
}

// ---------- LP helpers ----------
const term = (c, v) => `${c >= 0 ? '+' : '-'} ${Math.abs(c).toFixed(6)} ${v}`;
const expr = terms => terms.map((t, i) => (i && i % 6 === 0 ? '\n   ' : '') + t).join(' ');
function newModel() {
  const m = { obj: [], cons: [], bounds: [], generals: [], binaries: [], cid: 0 };
  m.add = (terms, op, rhs) => { if (terms.length) m.cons.push(` c${m.cid++}: ${expr(terms)} ${op} ${rhs}`); };
  m.lp = () => `Minimize\n obj: ${expr(m.obj.length ? m.obj : ['+ 0 dummy'])}\nSubject To\n${m.cons.join('\n')}\nBounds\n${m.bounds.join('\n')}\n` +
    (m.generals.length ? `General\n ${m.generals.join(' ')}\n` : '') + (m.binaries.length ? `Binary\n ${m.binaries.join(' ')}\n` : '') + 'End\n';
  return m;
}
// Adds recipe/quantity variables for the given slot options. Returns X list and per-day grams per ingredient.
function addMeals(m, optionsFor, fixed) {
  const X = [];
  const dayUse = Array.from({ length: days }, () => new Map()); // d -> iid -> [[c, var]]
  const rIndex = new Map(usable.map((r, i) => [r, i]));
  for (let d = 0; d < days; d++) for (const s of slots) {
    for (const r of optionsFor(d, s)) {
      const ri = rIndex.get(r);
      const x = `x_${d}_${s}_${ri}`;
      X.push({ name: x, d, s, r });
      if (fixed) m.bounds.push(` ${x} = 1`); else m.binaries.push(x);
      r.items.forEach((it, k) => {
        let gTerms; // [coef, var, upper bound of var] — grams = coef * var
        if (it.g != null) gTerms = [[it.g, x, 1]];
        else if (it.step_g) {
          const n = `n_${d}_${s}_${ri}_${k}`;
          m.generals.push(n);
          m.add([term(1, n), term(-it.min_g / it.step_g, x)], '>=', 0);
          m.add([term(1, n), term(-it.max_g / it.step_g, x)], '<=', 0);
          gTerms = [[it.step_g, n, it.max_g / it.step_g]];
        } else {
          const q = `q_${d}_${s}_${ri}_${k}`;
          m.add([term(1, q), term(-it.min_g, x)], '>=', 0);
          m.add([term(1, q), term(-it.max_g, x)], '<=', 0);
          gTerms = [[1, q, it.max_g]];
        }
        (it._vars ??= {})[`${d}_${s}`] = gTerms;
        if (!dayUse[d].has(it.id)) dayUse[d].set(it.id, []);
        dayUse[d].get(it.id).push(...gTerms);
      });
    }
    m.add(X.filter(v => v.d === d && v.s === s).map(v => term(1, v.name)), '=', 1);
  }
  return { X, dayUse };
}
const highsP = highsLoader();
async function solve(m, opts) {
  const highs = await highsP;
  const t = Date.now();
  const res = highs.solve(m.lp(), { output_flag: false, ...opts });
  const ok = res.Columns && ['Optimal', 'Time limit reached'].includes(res.Status) && Number.isFinite(res.ObjectiveValue);
  return { res, ok, s: (Date.now() - t) / 1000, val: v => res.Columns?.[v]?.Primal ?? 0 };
}

console.log(`Targets: ${T.kcal_min}-${T.kcal_max} kcal/day, protein >= ${T.protein_min} g/day, budget ${profile.budget_eur} EUR`);
console.log(`Recipes: ${usable.length} usable (${dropped.length} dropped); candidates: ${slots.map(s => `${s} ${candidates[s].length}`).join(', ')}`);

// ---------- 5. stage 1: choose meals ----------
// costPerG: price per gram used for each ingredient in the objective (re-priced between rounds, see below).
function buildStage1(costPerG, pools, budgetFactor = 1) {
  for (const r of usable) for (const it of r.items) delete it._vars;
  const m1 = newModel();
  const s1 = addMeals(m1, (d, s) => pools[s], false);
  const kcal = Array.from({ length: days }, () => []), prot = Array.from({ length: days }, () => []);
  const weekly = new Map(); // iid -> [[c, var, ub]]
  for (let d = 0; d < days; d++) for (const [iid, gTerms] of s1.dayUse[d]) {
    const e = est(iid);
    for (const [c, v] of gTerms) {
      if (e.macros.kcal) kcal[d].push(term(c * e.macros.kcal, v));
      if (e.macros.protein_g) prot[d].push(term(c * e.macros.protein_g, v));
      if (!pantry.has(iid)) m1.obj.push(term(c * costPerG.get(iid), v));
    }
    if (!pantry.has(iid)) (weekly.get(iid) ?? weekly.set(iid, []).get(iid)).push(...gTerms);
  }
  // Estimated cost must fit the budget (after re-pricing this approximates the real checkout).
  // (re-priced rounds count whole packs of the cheapest product, which overestimates — hence the headroom;
  // stage 2 enforces the real budget)
  m1.add(m1.obj.slice(), '<=', profile.budget_eur * budgetFactor);
  // Stage-1 targets are slightly tighter so stage 2 has room to adjust with real label macros.
  for (let d = 0; d < days; d++) {
    m1.add(kcal[d], '>=', T.kcal_min + 25); m1.add(kcal[d], '<=', T.kcal_max - 25); m1.add(prot[d], '>=', T.protein_min + 3);
  }
  // variety
  const uses = new Map();
  for (const v of s1.X) (uses.get(v.r.id) ?? uses.set(v.r.id, []).get(v.r.id)).push(v);
  for (const [, list] of uses) {
    m1.add(list.map(v => term(1, v.name)), '<=', profile.max_repeats ?? 2);
    for (let d = 0; d < days; d++) m1.add(list.filter(v => v.d === d).map(v => term(1, v.name)), '<=', 1);
  }
  m1.add(s1.X.filter(v => v.r.treat).map(v => term(1, v.name)), '<=', profile.max_desserts_per_week ?? 2);
  if (profile.no_same_protein_per_day !== false) for (let d = 0; d < days; d++) for (const g of MAIN_PROTEINS)
    m1.add(s1.X.filter(v => v.d === d && (v.s === 'lunch' || v.s === 'dinner') && v.r.protein === g).map(v => term(1, v.name)), '<=', 1);
  const minFish = profile.min_fish_per_week ?? 1;
  if (minFish > 0) m1.add(s1.X.filter(v => FISH.has(v.r.protein) && (v.s === 'lunch' || v.s === 'dinner')).map(v => term(1, v.name)), '>=', minFish);
  return { m1, s1, weekly };
}

// ---------- 6. stage 2: buy (recipes fixed) ----------
// Returns the finished plan (read immediately, because the next build overwrites the grams variables).
async function stage2(chosen) {
  let r2, U, B, tol;
  for (tol = 0; tol <= 100; tol += 50) {   // if real label macros make a day miss the window, widen it a little
    for (const r of usable) for (const it of r.items) delete it._vars;
    const m2 = newModel();
    addMeals(m2, (d, s) => [chosen.get(`${d}_${s}`)], true);
    const s2 = { dayUse: Array.from({ length: days }, () => new Map()) };
    for (let d = 0; d < days; d++) for (const s of slots) for (const it of chosen.get(`${d}_${s}`).items) {
      if (!s2.dayUse[d].has(it.id)) s2.dayUse[d].set(it.id, []);
      s2.dayUse[d].get(it.id).push(...it._vars[`${d}_${s}`]);
    }
    U = new Map(); B = [];
    const kcal = Array.from({ length: days }, () => []), prot = Array.from({ length: days }, () => []);
    const used = new Set();
    for (let d = 0; d < days; d++) for (const [iid, gTerms] of s2.dayUse[d]) {
      if (pantry.has(iid)) {
        const ing = ingredients.get(iid);
        for (const [c, v] of gTerms) {
          if (ingMacro(ing, 'kcal')) kcal[d].push(term(c * ingMacro(ing, 'kcal'), v));
          if (ingMacro(ing, 'protein_g')) prot[d].push(term(c * ingMacro(ing, 'protein_g'), v));
        }
        continue;
      }
      used.add(iid);
      const us = offers.get(iid).map((o, j) => ({ name: `u_${d}_${iid}_${j}`, j, o }));
      U.set(`${d}|${iid}`, us);
      m2.add([...us.map(u => term(1, u.name)), ...gTerms.map(([c, v]) => term(-c, v))], '=', 0);
      for (const u of us) {
        if (u.o.macros.kcal) kcal[d].push(term(u.o.macros.kcal, u.name));
        if (u.o.macros.protein_g) prot[d].push(term(u.o.macros.protein_g, u.name));
      }
    }
    for (let d = 0; d < days; d++) {
      m2.add(kcal[d], '>=', T.kcal_min - tol); m2.add(kcal[d], '<=', T.kcal_max + tol); m2.add(prot[d], '>=', T.protein_min);
    }
    for (const iid of used) offers.get(iid).forEach((o, j) => {
      const b = `b_${iid}_${j}`;
      B.push({ name: b, offer: o, iid, j });
      m2.generals.push(b);
      m2.bounds.push(` 0 <= ${b} <= 50`);
      m2.obj.push(term(o.price, b));
      const uses = [];
      for (let d = 0; d < days; d++) { const u = U.get(`${d}|${iid}`)?.find(x => x.j === j); if (u) uses.push(term(1, u.name)); }
      m2.add([...uses, term(-o.usable_g, b)], '<=', 0);
    });
    m2.add(B.map(b => term(b.offer.price, b.name)), '<=', profile.budget_eur);
    r2 = await solve(m2, { time_limit: profile.stage2_time_limit_s ?? 10, mip_rel_gap: 0.005 });
    if (r2.ok) break;
    if (process.env.PLAN_DEBUG) console.log(`  stage 2 attempt tol=${tol}: ${r2.res.Status}`);
  }
  if (!r2.ok) return { ok: false };
  const val = r2.val;
  const macroPerG = (d, iid, m) => {
    const us = U.get(`${d}|${iid}`);
    if (!us) return ingMacro(ingredients.get(iid), m);
    const tot = us.reduce((a, u) => a + val(u.name), 0);
    if (tot < 1e-6) return us[0].o.macros[m];
    return us.reduce((a, u) => a + val(u.name) * u.o.macros[m], 0) / tot;
  };
  const plan = [];
  for (let d = 0; d < days; d++) {
    const meals = [];
    for (const s of slots) {
      const r = chosen.get(`${d}_${s}`);
      const items = r.items.map(it => ({
        id: it.id, name: it.ing.name_bg,
        grams: Math.round(it._vars[`${d}_${s}`].reduce((a, [c, v]) => a + c * val(v), 0)),
      })).filter(i => i.grams > 0);
      const n = m => Math.round(items.reduce((a, i) => a + macroPerG(d, i.id, m) * i.grams, 0) * 10) / 10;
      meals.push({ slot: s, recipe_id: r.id, recipe: r.name, items, ...Object.fromEntries(MACROS.map(m => [m, n(m)])) });
    }
    const sum = m => Math.round(meals.reduce((a, x) => a + x[m], 0));
    plan.push({ day: DAY_BG[d % 7], meals, ...Object.fromEntries(MACROS.map(m => [m, sum(m)])) });
  }
  const shopping = B.filter(b => Math.round(val(b.name)) > 0).map(b => {
    const n = Math.round(val(b.name)), o = b.offer, p = o.product, ing = ingredients.get(b.iid);
    let used = 0; for (let d = 0; d < days; d++) used += val(U.get(`${d}|${b.iid}`)?.find(x => x.j === b.j)?.name);
    return {
      aisle: ing.aisle, ingredient_id: b.iid, ingredient: ing.name_bg, product: p.name, ebag_id: p.ebag_id, url: p.url,
      unit: p.sold_by === 'kg' ? 'kg' : 'pcs', pack: p.pack.label, packs: n, price_each: o.price, promo: p.price.promo != null,
      cost: Math.round(n * o.price * 100) / 100, used_edible_g: Math.round(used), usable_g: Math.round(n * o.usable_g),
      eaten_cost: Math.round((used / o.usable_g) * o.price * 100) / 100, macros_source: o.macros.source,
      alternatives: offers.get(b.iid).filter((_, j) => j !== b.j).map(a => ({ ebag_id: a.product.ebag_id, name: a.product.name, price: a.price, usable_g: Math.round(a.usable_g), unit: a.product.sold_by === 'kg' ? 'kg' : 'pcs' })),
    };
  }).sort((a, b) => a.aisle.localeCompare(b.aisle) || a.ingredient.localeCompare(b.ingredient));
  const checkout = shopping.reduce((a, s) => a + s.cost, 0);
  const eaten = shopping.reduce((a, s) => a + s.eaten_cost, 0);
  return { ok: true, plan, shopping, checkout, eaten, status: r2.res.Status, seconds: r2.s, tol };
}

const DAY_BG = ['Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота', 'Неделя'];
const SLOT_BG = { breakfast: 'Закуска', lunch: 'Обяд', dinner: 'Вечеря', snack: 'Междинно' };

// ---------- 7. rounds: stage 1 -> stage 2, re-pricing ingredients by real pack usage ("slope scaling") ----------
// Round 1 prices every ingredient at its cheapest price per gram. After each round, an ingredient that was used
// only a little (e.g. 30 g out of a 500 g pack) gets the effective price "packs needed / grams used", so the
// next round prefers recipes that reuse what is already bought. The cheapest checkout of all rounds wins.
const costPerG = new Map([...offers.keys()].map(iid => [iid, offers.get(iid)[0].per_g]));
const rounds = profile.rounds ?? 1; // more rounds = slope-scaling experiments (see above); 1 is fastest and was best in tests
const stage1Opts = { time_limit: profile.stage1_time_limit_s ?? 6, mip_rel_gap: profile.mip_gap ?? 0.03, mip_heuristic_effort: profile.mip_heuristic_effort ?? 0.05 };
let best = null, bestChosen = null;
const seen = new Set();
// Later rounds search a smaller pool: the best plan's recipes (so a valid plan always exists) plus the
// top few recipes per slot by the re-priced cost per gram of protein.
function refinedPools() {
  const K2 = profile.refine_candidates_per_slot ?? 5;
  const score = r => r.items.reduce((a, it) => a + (it.g ?? (it.min_g + it.max_g) / 2) * (pantry.has(it.id) ? 0 : costPerG.get(it.id)), 0)
    / Math.max(5, r.items.reduce((a, it) => a + (it.g ?? (it.min_g + it.max_g) / 2) * est(it.id).macros.protein_g, 0));
  const pools = {};
  for (const s of slots) {
    const keep = new Set([...bestChosen.entries()].filter(([k]) => k.endsWith(`_${s}`)).map(([, r]) => r));
    [...candidates[s]].sort((a, b) => score(a) - score(b)).filter(r => !r.treat).slice(0, K2).forEach(r => keep.add(r));
    pools[s] = [...keep];
  }
  return pools;
}
for (let round = 1; round <= rounds; round++) {
  if (round > 1 && !bestChosen) break;
  const { m1, s1, weekly } = buildStage1(costPerG, round === 1 ? candidates : refinedPools(), round === 1 ? 1 : 1.15);
  const r1 = await solve(m1, stage1Opts);
  if (!r1.ok) { console.log(`Round ${round}: stage 1 found no plan (${r1.res.Status})`); if (round === 1) break; continue; }
  const chosen = new Map();
  for (const v of s1.X) if (r1.val(v.name) > 0.5) chosen.set(`${v.d}_${v.s}`, v.r);
  const key = [...chosen.values()].map(r => r.id).join(',');
  // weekly grams per ingredient from this round's quantities -> effective price per gram for the next round
  const grams = new Map();
  for (const [iid, terms] of weekly) grams.set(iid, terms.reduce((a, [c, v]) => a + c * r1.val(v), 0));
  if (seen.has(key)) { console.log(`Round ${round}: same meals as before (${r1.s.toFixed(1)} s) — stopping`); break; }
  seen.add(key);
  const r2 = await stage2(chosen);
  console.log(`Round ${round}: stage 1 ${r1.res.Status} ${r1.s.toFixed(1)} s, stage 2 ${r2.ok ? `${r2.status} ${r2.seconds.toFixed(1)} s — checkout ${r2.checkout.toFixed(2)} EUR` : 'no purchase plan'}`);
  if (r2.ok && (!best || r2.checkout < best.checkout)) { best = { ...r2, round, stage1: { status: r1.res.Status, seconds: r1.s } }; bestChosen = chosen; }
  for (const [iid, g] of grams) {
    if (g < 1) continue;
    const o = offers.get(iid)[0];
    const eff = (Math.ceil(g / o.usable_g) * o.price) / g;
    costPerG.set(iid, Math.max(o.per_g, eff));
  }
}
if (!best) { console.error('No feasible plan. Try a wider kcal tolerance, more candidates per slot, a bigger budget or fewer exclusions.'); process.exit(1); }

// ---------- 8. save + print ----------
const { plan, shopping, checkout, eaten } = best;
const totalS = (Date.now() - t00) / 1000;
const out = {
  created: new Date().toISOString(), profile: profile.name, targets: T, budget_eur: profile.budget_eur,
  checkout_eur: Math.round(checkout * 100) / 100, eaten_eur: Math.round(eaten * 100) / 100,
  solver: { best_round: best.round, stage1: best.stage1, stage2: { status: best.status, seconds: best.seconds, kcal_window_widened_by: best.tol }, total_seconds: totalS },
  pantry: [...pantry], plan, shopping,
};
const outPath = path.join(ROOT, 'data', 'plans', `${profile.name}-${new Date().toISOString().slice(0, 10)}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

for (const d of plan) {
  console.log(`\n${d.day}: ${d.kcal} kcal, ${d.protein_g} g protein, ${d.fat_g} g fat, ${d.carbs_g} g carbs`);
  for (const m of d.meals) console.log(`  ${SLOT_BG[m.slot].padEnd(9)} ${m.recipe} (${Math.round(m.kcal)} kcal, ${Math.round(m.protein_g)} g P) — ${m.items.filter(i => !pantry.has(i.id) && i.grams >= 10).map(i => `${i.name} ${i.grams} г`).join(', ')}`);
}
console.log('\nShopping list:');
for (const s of shopping) console.log(`  [${s.aisle}] ${s.packs} x ${s.product} (${s.pack}) — ${s.cost.toFixed(2)} EUR${s.promo ? ' (promo)' : ''}${s.macros_source === 'label' ? ' [eBag label]' : ''}`);
console.log(`\nCheckout: ${checkout.toFixed(2)} EUR (budget ${profile.budget_eur}); food actually eaten: ~${eaten.toFixed(2)} EUR (best of round ${best.round})`);
console.log(`Macros from eBag labels for ${shopping.filter(s => s.macros_source === 'label').length}/${shopping.length} bought products, USDA for the rest.`);
console.log(`Pantry (assumed at home): ${[...pantry].join(', ')}`);
console.log(`Total time ${totalS.toFixed(1)} s. Saved: ${path.relative(ROOT, outPath)}`);
