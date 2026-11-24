// Weekly meal planner — TypeScript port of scripts/plan.mjs (two-stage HiGHS optimizer). Pure: data in, plan out.
//
// Stage 1 — choose meals: which recipe goes into each slot and roughly how many grams, so that every day
//   hits the kcal range and protein minimum and the variety rules hold. Cost is estimated per gram
//   (cheapest product).
// Stage 2 — buy: with the recipes fixed, choose eBag products and whole packs, re-tune the grams within the
//   recipe ranges using each product's own label macros, and minimise the checkout total within budget.
// Macros: the bought product's eBag label when valid, otherwise USDA (ingredients.json).
//
// Ported 1:1 from the original scripts/plan.mjs and verified to give an identical plan (2026-11-23). Intentional
// changes since (Phase 3b): rounding margin in stage 2; a recipe may repeat up to 4×/week (was 2 — the main cause of
// "no plan" at realistic budgets); avoid_recipes for "new plan"; a diagnosis step on failure (budget_too_low with the
// cheapest plan found, vs not enough recipes); every solve has a hard wall-clock stop (persistent HiGHS API +
// interrupt callbacks). Tried and dropped: whole-pack costs inside stage 1 — HiGHS WASM can't solve that in seconds.
// scripts/plan.mjs is a CLI wrapper around this file.
// Imports use .ts extensions so Node can run this file directly (type stripping) from scripts/.
import { getHighs } from "./highs.ts";
import { computeTargets, type Activity, type Goal, type Sex, type Targets } from "./targets.ts";

// ---------- types ----------
type Macro = "kcal" | "protein_g" | "fat_g" | "carbs_g";
const MACROS: Macro[] = ["kcal", "protein_g", "fat_g", "carbs_g"];
type Macros = Record<Macro, number>;

export interface Ingredient {
  id: string;
  name_bg: string;
  aisle: string;
  per_100g?: Partial<Record<Macro, number>>;
  edible_fraction?: number;
  density_g_per_ml?: number;
  diets?: string[];
  tags?: string[];
  allergens?: string[];
}

export interface RecipeIngredient {
  id: string;
  g?: number | null;
  min_g?: number;
  max_g?: number;
  step_g?: number;
}

export interface Recipe {
  id: string;
  name: string;
  meal_types: string[];
  protein?: string;
  treat?: boolean;
  ingredients: RecipeIngredient[];
  [k: string]: unknown;
}

export interface Product {
  ebag_id: number;
  ingredient_id: string;
  name: string;
  url: string;
  sold_by: string;
  available: boolean;
  edible_fraction?: number;
  pack: { label: string; grams: number | null; drained_grams?: number | null };
  price: { regular: number | null; promo: number | null };
  label?: ({ valid?: boolean; basis?: string } & Partial<Record<Macro, number | null>>) | null;
}

export interface PlanProfile {
  name?: string;
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: Activity;
  goal: Goal;
  budget_eur: number;
  diet?: string | null;
  exclude_tags?: string[];
  allergens?: string[];
  pantry?: string[];
  targets_override?: Targets | null;
  kcal_tolerance?: number;
  days?: number;
  slots?: Slot[];
  /** Max uses of one recipe per week (default 4; never twice a day). */
  max_repeats?: number;
  max_desserts_per_week?: number;
  /** Recipes to steer away from (e.g. the previous plan's), so "new plan" gives a different week. */
  avoid_recipes?: string[];
  /** Stage-1 cost added per use of an avoided recipe, in EUR (default 0.4: about half the recipes change). */
  avoid_penalty_eur?: number;
  /** How far over budget a plan may go before the kcal window is widened (default 0.05 = 5 %). */
  budget_slack?: number;
  /** On failure, find out why (extra solves, a few seconds). false = fail fast with the generic message. Default true. */
  diagnose?: boolean;
  /** Hard stop for the whole run in seconds (default 40). */
  deadline_s?: number;
  min_fish_per_week?: number;
  no_same_protein_per_day?: boolean;
  candidates_per_slot?: number;
  products_per_ingredient?: number;
  rounds?: number;
  refine_candidates_per_slot?: number;
  stage1_time_limit_s?: number;
  /** Stage 1 aims this far inside the kcal window / above the protein minimum (default 10 kcal / 1 g; was 25 / 3 —
   *  too tight for small, low-kcal profiles: stage 1 found no plan in time on Vercel, 2026-11-23 tester feedback). */
  stage1_kcal_margin?: number;
  stage1_protein_margin?: number;
  stage2_time_limit_s?: number;
  mip_gap?: number;
  mip_heuristic_effort?: number;
}

export type Slot = "breakfast" | "lunch" | "dinner" | "snack";

export interface PlanItem {
  id: string;
  name: string;
  grams: number;
}
export interface PlanMeal extends Macros {
  slot: Slot;
  recipe_id: string;
  recipe: string;
  items: PlanItem[];
}
export interface PlanDay extends Macros {
  day: string;
  meals: PlanMeal[];
}
export interface ShoppingItem {
  aisle: string;
  ingredient_id: string;
  ingredient: string;
  product: string;
  ebag_id: number;
  url: string;
  unit: "kg" | "pcs";
  pack: string;
  packs: number;
  price_each: number;
  promo: boolean;
  cost: number;
  used_edible_g: number;
  usable_g: number;
  eaten_cost: number;
  macros_source: "label" | "usda";
  alternatives: { ebag_id: number; name: string; price: number; usable_g: number; unit: "kg" | "pcs" }[];
}

export interface PlanOutput {
  created: string;
  profile: string | undefined;
  targets: Targets;
  budget_eur: number;
  checkout_eur: number;
  eaten_eur: number;
  solver: {
    best_round: number;
    stage1: { status: string; seconds: number };
    stage2: { status: string; seconds: number; kcal_window_widened_by: number };
    total_seconds: number;
  };
  pantry: string[];
  plan: PlanDay[];
  shopping: ShoppingItem[];
}

export type PlanResult =
  | { ok: true; output: PlanOutput; log: string[] }
  | {
      ok: false;
      /** no_recipes / no_meal_plan: the recipes can't cover the targets with this diet and these exclusions;
       *  budget_too_low: a plan exists but costs more (min_budget_eur); no_purchase_plan: anything else. */
      reason: "no_recipes" | "no_meal_plan" | "budget_too_low" | "no_purchase_plan" | "timeout";
      message: string;
      min_budget_eur?: number;
      log: string[];
    };

export interface PlanInput {
  profile: PlanProfile;
  ingredients: Ingredient[];
  recipes: Recipe[];
  products: Product[];
}

const DAY_BG = ["Понеделник", "Вторник", "Сряда", "Четвъртък", "Петък", "Събота", "Неделя"];
const SLOT_TYPES: Record<Slot, string[]> = { breakfast: ["breakfast"], lunch: ["lunch"], dinner: ["dinner"], snack: ["snack", "dessert"] };
const MAIN_PROTEINS = new Set(["chicken", "turkey", "pork", "beef", "mixed_meat", "fish", "seafood"]);
const FISH = new Set(["fish", "seafood"]);
const ROUNDING_MARGIN_KCAL = 5;
const ROUNDING_MARGIN_PROTEIN_G = 1;

/** Bulgarian message shown when no plan is possible (SPEC §7.2). */
export const NO_PLAN_MESSAGE_BG =
  "Не успяхме да съставим план с тези настройки. Опитай с по-голям бюджет, по-малко изключения или по-широк диапазон калории.";

/** Not enough recipes fit the diet and exclusions while meeting the daily targets. */
export const NO_RECIPES_MESSAGE_BG =
  "Нямаме достатъчно рецепти, които да отговарят на диетата и изключенията ти и в същото време да покриват дневните ти цели. Опитай с по-малко изключения или по-широк диапазон калории.";

/** The solver ran out of time without a plan (not proven impossible). */
export const TIMEOUT_MESSAGE_BG = "Не успяхме да съставим плана навреме. Опитай отново — обикновено вторият опит минава.";

/** The budget is too low; min is the cheapest plan the planner found (whole euros). */
export function budgetMessageBg(budget: number, min: number): string {
  const eur = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")} €`;
  return `С бюджет ${eur(budget)} не успяхме да съберем седмичен план с твоите цели. Най-евтиният план, който намерихме, е около ${eur(min)}. Увеличи бюджета и опитай пак.`;
}

// ---------- LP helpers ----------
type GTerm = [number, string, number]; // grams = coef * var; [coef, var, upper bound of var]
const term = (c: number, v: string) => `${c >= 0 ? "+" : "-"} ${Math.abs(c).toFixed(6)} ${v}`;
const expr = (terms: string[]) => terms.map((t, i) => (i && i % 6 === 0 ? "\n   " : "") + t).join(" ");

interface Model {
  obj: string[];
  cons: string[];
  bounds: string[];
  generals: string[];
  binaries: string[];
  cid: number;
  add: (terms: string[], op: string, rhs: number) => void;
  lp: () => string;
}
function newModel(): Model {
  const m: Model = {
    obj: [],
    cons: [],
    bounds: [],
    generals: [],
    binaries: [],
    cid: 0,
    add: (terms, op, rhs) => {
      if (terms.length) m.cons.push(` c${m.cid++}: ${expr(terms)} ${op} ${rhs}`);
    },
    lp: () =>
      `Minimize\n obj: ${expr(m.obj.length ? m.obj : ["+ 0 dummy"])}\nSubject To\n${m.cons.join("\n")}\nBounds\n${m.bounds.join("\n")}\n` +
      (m.generals.length ? `General\n ${m.generals.join(" ")}\n` : "") +
      (m.binaries.length ? `Binary\n ${m.binaries.join(" ")}\n` : "") +
      "End\n",
  };
  return m;
}

interface Offer {
  product: Product;
  usable_g: number;
  price: number;
  per_g: number;
  macros: Macros & { source: "label" | "usda" };
}
interface UsableItem extends RecipeIngredient {
  ing: Ingredient;
  _vars?: Record<string, GTerm[]>;
}
interface UsableRecipe extends Recipe {
  items: UsableItem[];
  _score?: number;
}

export async function generatePlan(input: PlanInput, now: () => number = Date.now): Promise<PlanResult> {
  const t00 = now();
  const log: string[] = [];
  const { profile } = input;
  const ingredients = new Map(input.ingredients.map((i) => [i.id, i]));
  const recipesAll = input.recipes;
  const products = input.products;

  // ---------- 1. targets ----------
  const T: Targets = profile.targets_override ?? computeTargets(profile);

  // ---------- 2. products per ingredient (with their own macros) ----------
  const pantry = new Set(profile.pantry ?? []);
  const ingMacro = (ing: Ingredient, m: Macro) => (ing.per_100g?.[m] ?? 0) / 100; // per gram
  const offerMacros = (p: Partial<Product>, ing: Ingredient): Offer["macros"] => {
    const l = p.label;
    if (l?.valid && MACROS.every((m) => l[m] != null)) {
      const perG = l.basis === "per_100ml" ? 1 / (100 * (ing.density_g_per_ml ?? 1)) : 1 / 100;
      return { source: "label", ...(Object.fromEntries(MACROS.map((m) => [m, (l[m] as number) * perG])) as Macros) };
    }
    return { source: "usda", ...(Object.fromEntries(MACROS.map((m) => [m, ingMacro(ing, m)])) as Macros) };
  };
  const offers = new Map<string, Offer[]>();
  for (const p of products) {
    const ing = ingredients.get(p.ingredient_id);
    if (!ing || !p.available || !p.price?.regular || !((p.pack?.grams ?? 0) > 0)) continue;
    const ef = p.edible_fraction ?? ing.edible_fraction ?? 1;
    const usable = (p.pack.drained_grams ?? p.pack.grams!) * ef;
    const price = p.price.promo ?? p.price.regular;
    if (!offers.has(ing.id)) offers.set(ing.id, []);
    offers.get(ing.id)!.push({ product: p, usable_g: usable, price, per_g: price / usable, macros: offerMacros(p, ing) });
  }
  for (const [id, list] of offers) offers.set(id, list.sort((a, b) => a.per_g - b.per_g).slice(0, profile.products_per_ingredient ?? 3));
  const canGet = (id: string) => pantry.has(id) || offers.has(id);
  const est = (id: string) => {
    const ing = ingredients.get(id)!;
    if (pantry.has(id)) return { per_g: 0, macros: offerMacros({}, ing), packPrice: 0 };
    const list = offers.get(id)!;
    return { per_g: list[0]!.per_g, macros: list[0]!.macros, packPrice: Math.min(...list.map((o) => o.price)) };
  };

  // ---------- 3. filter recipes (diet, exclusions, availability) ----------
  const banned = new Set([...(profile.exclude_tags ?? []), ...(profile.allergens ?? [])]);
  const ingOk = (ing: Ingredient | undefined) =>
    !!ing &&
    ![...(ing.tags || []), ...(ing.allergens || [])].some((t) => banned.has(t)) &&
    (!profile.diet || !!ing.diets?.includes(profile.diet));
  const usable: UsableRecipe[] = [];
  const dropped: string[] = [];
  for (const r of recipesAll) {
    if (r.meal_types.every((m) => m === "side")) continue;
    const items: UsableItem[] = [];
    let ok = true;
    for (const it of r.ingredients) {
      const ing = ingredients.get(it.id);
      const optional = it.g == null && it.min_g === 0;
      if (!ingOk(ing) || !canGet(it.id)) {
        if (optional) continue;
        ok = false;
        dropped.push(`${r.id} (${it.id}${canGet(it.id) ? "" : ": no eBag product"})`);
        break;
      }
      items.push({ ...it, ing: ing! });
    }
    if (ok) usable.push({ ...r, items });
  }

  // ---------- 4. prefilter: best candidates per slot ----------
  for (const r of usable) {
    let cost = 0,
      protein = 0;
    for (const it of r.items) {
      const g = it.g ?? (it.min_g! + it.max_g!) / 2;
      const e = est(it.id);
      cost += g * e.per_g;
      protein += g * e.macros.protein_g;
    }
    r._score = cost / Math.max(protein, 5); // EUR per gram of protein
  }
  const K = profile.candidates_per_slot ?? 6;
  const slots: Slot[] = profile.slots ?? ["breakfast", "lunch", "dinner", "snack"];
  const days = profile.days ?? 7;
  const candidates = {} as Record<Slot, UsableRecipe[]>;
  for (const s of slots) {
    const pool = usable.filter((r) => r.meal_types.some((m) => SLOT_TYPES[s].includes(m))).sort((a, b) => a._score! - b._score!);
    const pick = new Set(pool.filter((r) => !r.treat).slice(0, K));
    if (s === "lunch" || s === "dinner") {
      pool
        .filter((r) => FISH.has(r.protein ?? ""))
        .slice(0, 3)
        .forEach((r) => pick.add(r));
      for (const g of MAIN_PROTEINS)
        pool
          .filter((r) => r.protein === g)
          .slice(0, 2)
          .forEach((r) => pick.add(r));
    }
    if (s === "snack")
      pool
        .filter((r) => r.treat)
        .slice(0, 4)
        .forEach((r) => pick.add(r));
    candidates[s] = [...pick];
  }
  if (slots.some((s) => !candidates[s].length)) {
    return {
      ok: false,
      reason: "no_recipes",
      message: NO_RECIPES_MESSAGE_BG,
      log: [`no recipes for some slot; dropped: ${dropped.length}`],
    };
  }

  // Adds recipe/quantity variables for the given slot options. Returns X list and per-day grams per ingredient.
  interface XVar {
    name: string;
    d: number;
    s: Slot;
    r: UsableRecipe;
  }
  const rIndex = new Map(usable.map((r, i) => [r, i]));
  function addMeals(m: Model, optionsFor: (d: number, s: Slot) => UsableRecipe[], fixed: boolean) {
    const X: XVar[] = [];
    const dayUse = Array.from({ length: days }, () => new Map<string, GTerm[]>()); // d -> iid -> gTerms
    for (let d = 0; d < days; d++)
      for (const s of slots) {
        for (const r of optionsFor(d, s)) {
          const ri = rIndex.get(r);
          const x = `x_${d}_${s}_${ri}`;
          X.push({ name: x, d, s, r });
          if (fixed) m.bounds.push(` ${x} = 1`);
          else m.binaries.push(x);
          r.items.forEach((it, k) => {
            let gTerms: GTerm[];
            if (it.g != null) gTerms = [[it.g, x, 1]];
            else if (it.step_g) {
              const n = `n_${d}_${s}_${ri}_${k}`;
              m.generals.push(n);
              m.add([term(1, n), term(-it.min_g! / it.step_g, x)], ">=", 0);
              m.add([term(1, n), term(-it.max_g! / it.step_g, x)], "<=", 0);
              gTerms = [[it.step_g, n, it.max_g! / it.step_g]];
            } else {
              const q = `q_${d}_${s}_${ri}_${k}`;
              m.add([term(1, q), term(-it.min_g!, x)], ">=", 0);
              m.add([term(1, q), term(-it.max_g!, x)], "<=", 0);
              gTerms = [[1, q, it.max_g!]];
            }
            (it._vars ??= {})[`${d}_${s}`] = gTerms;
            if (!dayUse[d]!.has(it.id)) dayUse[d]!.set(it.id, []);
            dayUse[d]!.get(it.id)!.push(...gTerms);
          });
        }
        m.add(
          X.filter((v) => v.d === d && v.s === s).map((v) => term(1, v.name)),
          "=",
          1,
        );
      }
    return { X, dayUse };
  }

  const highs = await getHighs();
  // Hard stop for the whole run: a serverless function must answer even if HiGHS overruns its own time_limit
  // (seen once: a 190 s solve with an 8 s limit after many solves in one process).
  const planDeadline = t00 + (profile.deadline_s ?? 40) * 1000;
  const S = highs.constants.modelStatus;
  const STATUS: Partial<Record<number, string>> = {
    [S.optimal]: "Optimal",
    [S.timeLimit]: "Time limit reached",
    [S.interrupted]: "Time limit reached",
    [S.infeasible]: "Infeasible",
  };
  function solve(m: Model, opts: { time_limit: number } & Record<string, string | number | boolean>) {
    const t = now();
    const remaining = Math.max(0.5, (planDeadline - t) / 1000);
    const timeLimit = Math.min(opts.time_limit, remaining);
    const guard = Math.min(t + (timeLimit + 2) * 1000, planDeadline + 2000);
    const stop = (e: { interrupt(): void }): undefined => {
      if (now() > guard) e.interrupt();
    };
    const model = highs.createModel({ format: "lp", data: m.lp() });
    try {
      model.options.set({ output_flag: false, ...opts, time_limit: timeLimit });
      const C = highs.constants.callbackType;
      const { modelStatus } = model.run({ [C.simplexInterrupt]: stop, [C.ipmInterrupt]: stop, [C.mipInterrupt]: stop });
      const status = STATUS[modelStatus] ?? `status ${modelStatus}`;
      const hasSolution = Number(model.info.get("primal_solution_status")) === 2; // feasible
      const ok = hasSolution && (modelStatus === S.optimal || modelStatus === S.timeLimit || modelStatus === S.interrupted);
      const cols = new Map<string, number>();
      if (ok) {
        const x = model.getSolution().colValue;
        for (let i = 0; i < x.length; i++) cols.set(model.getColName(i), x[i]!);
      }
      return { ok, status, s: (now() - t) / 1000, val: (v: string | undefined) => (v ? (cols.get(v) ?? 0) : 0) };
    } finally {
      model.dispose();
    }
  }

  log.push(`Targets: ${T.kcal_min}-${T.kcal_max} kcal/day, protein >= ${T.protein_min} g/day, budget ${profile.budget_eur} EUR`);
  log.push(
    `Recipes: ${usable.length} usable (${dropped.length} dropped); candidates: ${slots.map((s) => `${s} ${candidates[s].length}`).join(", ")}`,
  );

  // ---------- 5. stage 1: choose meals ----------
  function buildStage1(costPerG: Map<string, number>, pools: Record<Slot, UsableRecipe[]>, budgetFactor = 1) {
    for (const r of usable) for (const it of r.items) delete it._vars;
    const m1 = newModel();
    const s1 = addMeals(m1, (_d, s) => pools[s], false);
    const kcal = Array.from({ length: days }, () => [] as string[]);
    const prot = Array.from({ length: days }, () => [] as string[]);
    const weekly = new Map<string, GTerm[]>();
    for (let d = 0; d < days; d++)
      for (const [iid, gTerms] of s1.dayUse[d]!) {
        const e = est(iid);
        for (const [c, v] of gTerms) {
          if (e.macros.kcal) kcal[d]!.push(term(c * e.macros.kcal, v));
          if (e.macros.protein_g) prot[d]!.push(term(c * e.macros.protein_g, v));
          if (!pantry.has(iid)) m1.obj.push(term(c * costPerG.get(iid)!, v));
        }
        if (!pantry.has(iid)) (weekly.get(iid) ?? weekly.set(iid, []).get(iid)!).push(...gTerms);
      }
    // Estimated cost must fit the budget; stage 2 enforces the real budget.
    m1.add(m1.obj.slice(), "<=", profile.budget_eur * budgetFactor);
    // Stage-1 targets are slightly tighter so stage 2 has room to adjust with real label macros.
    for (let d = 0; d < days; d++) {
      m1.add(kcal[d]!, ">=", T.kcal_min + (profile.stage1_kcal_margin ?? 10));
      m1.add(kcal[d]!, "<=", T.kcal_max - (profile.stage1_kcal_margin ?? 10));
      m1.add(prot[d]!, ">=", T.protein_min + (profile.stage1_protein_margin ?? 1));
    }
    // variety
    const uses = new Map<string, XVar[]>();
    for (const v of s1.X) (uses.get(v.r.id) ?? uses.set(v.r.id, []).get(v.r.id)!).push(v);
    for (const [, list] of uses) {
      // Up to 4 uses a week (never twice a day): fewer distinct recipes = fewer half-used packs. With 2, most
      // realistic budgets got no plan (2026-11-23: male €98 → €68 checkout for the same targets).
      m1.add(
        list.map((v) => term(1, v.name)),
        "<=",
        profile.max_repeats ?? 4,
      );
      for (let d = 0; d < days; d++)
        m1.add(
          list.filter((v) => v.d === d).map((v) => term(1, v.name)),
          "<=",
          1,
        );
    }
    m1.add(
      s1.X.filter((v) => v.r.treat).map((v) => term(1, v.name)),
      "<=",
      profile.max_desserts_per_week ?? 2,
    );
    if (profile.no_same_protein_per_day !== false)
      for (let d = 0; d < days; d++)
        for (const g of MAIN_PROTEINS)
          m1.add(
            s1.X.filter((v) => v.d === d && (v.s === "lunch" || v.s === "dinner") && v.r.protein === g).map((v) => term(1, v.name)),
            "<=",
            1,
          );
    // Soft "something new": a small cost per use of an avoided recipe (added after the budget row, so it is not money).
    const avoid = new Set(profile.avoid_recipes ?? []);
    if (avoid.size) for (const v of s1.X) if (avoid.has(v.r.id)) m1.obj.push(term(profile.avoid_penalty_eur ?? 0.4, v.name));
    const minFish = profile.min_fish_per_week ?? 1;
    if (minFish > 0)
      m1.add(
        s1.X.filter((v) => FISH.has(v.r.protein ?? "") && (v.s === "lunch" || v.s === "dinner")).map((v) => term(1, v.name)),
        ">=",
        minFish,
      );
    return { m1, s1, weekly };
  }

  // ---------- 6. stage 2: buy (recipes fixed) ----------
  interface UVar {
    name: string;
    j: number;
    o: Offer;
  }
  interface BVar {
    name: string;
    offer: Offer;
    iid: string;
    j: number;
  }
  function stage2(chosen: Map<string, UsableRecipe>, budget = profile.budget_eur, timeLimit = profile.stage2_time_limit_s ?? 10) {
    let r2!: ReturnType<typeof solve>;
    let U!: Map<string, UVar[]>;
    let B!: BVar[];
    let tol = 0;
    let cap = budget;
    // Attempts, in order of preference: exact targets within budget; exact targets up to 5 % over budget (better
    // than days off target for a few cents); then a slightly wider kcal window. Without a budget: just the window.
    const slack = Number.isFinite(budget) ? budget * (1 + (profile.budget_slack ?? 0.05)) : budget;
    const attempts: [number, number][] = Number.isFinite(budget)
      ? [
          [0, budget],
          [0, slack],
          [50, slack],
          [100, slack],
        ]
      : [
          [0, budget],
          [50, budget],
          [100, budget],
        ];
    for ([tol, cap] of attempts) {
      // if real label macros make a day miss the window, widen it a little
      for (const r of usable) for (const it of r.items) delete it._vars;
      const m2 = newModel();
      addMeals(m2, (d, s) => [chosen.get(`${d}_${s}`)!], true);
      const s2 = { dayUse: Array.from({ length: days }, () => new Map<string, GTerm[]>()) };
      for (let d = 0; d < days; d++)
        for (const s of slots)
          for (const it of chosen.get(`${d}_${s}`)!.items) {
            if (!s2.dayUse[d]!.has(it.id)) s2.dayUse[d]!.set(it.id, []);
            s2.dayUse[d]!.get(it.id)!.push(...it._vars![`${d}_${s}`]!);
          }
      U = new Map();
      B = [];
      const kcal = Array.from({ length: days }, () => [] as string[]);
      const prot = Array.from({ length: days }, () => [] as string[]);
      const used = new Set<string>();
      for (let d = 0; d < days; d++)
        for (const [iid, gTerms] of s2.dayUse[d]!) {
          if (pantry.has(iid)) {
            const ing = ingredients.get(iid)!;
            for (const [c, v] of gTerms) {
              if (ingMacro(ing, "kcal")) kcal[d]!.push(term(c * ingMacro(ing, "kcal"), v));
              if (ingMacro(ing, "protein_g")) prot[d]!.push(term(c * ingMacro(ing, "protein_g"), v));
            }
            continue;
          }
          used.add(iid);
          const us = offers.get(iid)!.map((o, j) => ({ name: `u_${d}_${iid}_${j}`, j, o }));
          U.set(`${d}|${iid}`, us);
          m2.add([...us.map((u) => term(1, u.name)), ...gTerms.map(([c, v]) => term(-c, v))], "=", 0);
          for (const u of us) {
            if (u.o.macros.kcal) kcal[d]!.push(term(u.o.macros.kcal, u.name));
            if (u.o.macros.protein_g) prot[d]!.push(term(u.o.macros.protein_g, u.name));
          }
        }
      // Small safety margin: the plan shows grams rounded to whole numbers, and day totals are summed from those,
      // so without it a day could display e.g. 2187 kcal against a 2185 maximum.
      for (let d = 0; d < days; d++) {
        m2.add(kcal[d]!, ">=", T.kcal_min - tol + ROUNDING_MARGIN_KCAL);
        m2.add(kcal[d]!, "<=", T.kcal_max + tol - ROUNDING_MARGIN_KCAL);
        m2.add(prot[d]!, ">=", T.protein_min + ROUNDING_MARGIN_PROTEIN_G);
      }
      for (const iid of used)
        offers.get(iid)!.forEach((o, j) => {
          const b = `b_${iid}_${j}`;
          B.push({ name: b, offer: o, iid, j });
          m2.generals.push(b);
          m2.bounds.push(` 0 <= ${b} <= 50`);
          m2.obj.push(term(o.price, b));
          const usesT: string[] = [];
          for (let d = 0; d < days; d++) {
            const u = U.get(`${d}|${iid}`)?.find((x) => x.j === j);
            if (u) usesT.push(term(1, u.name));
          }
          m2.add([...usesT, term(-o.usable_g, b)], "<=", 0);
        });
      if (Number.isFinite(cap))
        m2.add(
          B.map((b) => term(b.offer.price, b.name)),
          "<=",
          cap,
        );
      r2 = solve(m2, { time_limit: timeLimit, mip_rel_gap: 0.005 });
      if (r2.ok) break;
      log.push(`  stage 2 attempt tol=${tol} budget=${cap.toFixed(2)}: ${r2.status}`);
    }
    if (!r2.ok) return { ok: false as const };
    const val = r2.val;
    const macroPerG = (d: number, iid: string, m: Macro) => {
      const us = U.get(`${d}|${iid}`);
      if (!us) return ingMacro(ingredients.get(iid)!, m);
      const tot = us.reduce((a, u) => a + val(u.name), 0);
      if (tot < 1e-6) return us[0]!.o.macros[m];
      return us.reduce((a, u) => a + val(u.name) * u.o.macros[m], 0) / tot;
    };
    const plan: PlanDay[] = [];
    for (let d = 0; d < days; d++) {
      const meals: PlanMeal[] = [];
      for (const s of slots) {
        const r = chosen.get(`${d}_${s}`)!;
        const items = r.items
          .map((it) => ({
            id: it.id,
            name: it.ing.name_bg,
            grams: Math.round(it._vars![`${d}_${s}`]!.reduce((a, [c, v]) => a + c * val(v), 0)),
          }))
          .filter((i) => i.grams > 0);
        const n = (m: Macro) => Math.round(items.reduce((a, i) => a + macroPerG(d, i.id, m) * i.grams, 0) * 10) / 10;
        meals.push({ slot: s, recipe_id: r.id, recipe: r.name, items, ...(Object.fromEntries(MACROS.map((m) => [m, n(m)])) as Macros) });
      }
      const sum = (m: Macro) => Math.round(meals.reduce((a, x) => a + x[m], 0));
      plan.push({ day: DAY_BG[d % 7]!, meals, ...(Object.fromEntries(MACROS.map((m) => [m, sum(m)])) as Macros) });
    }
    const shopping: ShoppingItem[] = B.filter((b) => Math.round(val(b.name)) > 0)
      .map((b) => {
        const n = Math.round(val(b.name)),
          o = b.offer,
          p = o.product,
          ing = ingredients.get(b.iid)!;
        let usedG = 0;
        for (let d = 0; d < days; d++) usedG += val(U.get(`${d}|${b.iid}`)?.find((x) => x.j === b.j)?.name);
        return {
          aisle: ing.aisle,
          ingredient_id: b.iid,
          ingredient: ing.name_bg,
          product: p.name,
          ebag_id: p.ebag_id,
          url: p.url,
          unit: p.sold_by === "kg" ? ("kg" as const) : ("pcs" as const),
          pack: p.pack.label,
          packs: n,
          price_each: o.price,
          promo: p.price.promo != null,
          cost: Math.round(n * o.price * 100) / 100,
          used_edible_g: Math.round(usedG),
          usable_g: Math.round(n * o.usable_g),
          eaten_cost: Math.round((usedG / o.usable_g) * o.price * 100) / 100,
          macros_source: o.macros.source,
          alternatives: offers
            .get(b.iid)!
            .filter((_, j) => j !== b.j)
            .map((a) => ({
              ebag_id: a.product.ebag_id,
              name: a.product.name,
              price: a.price,
              usable_g: Math.round(a.usable_g),
              unit: a.product.sold_by === "kg" ? ("kg" as const) : ("pcs" as const),
            })),
        };
      })
      .sort((a, b) => a.aisle.localeCompare(b.aisle) || a.ingredient.localeCompare(b.ingredient));
    const checkout = shopping.reduce((a, s) => a + s.cost, 0);
    const eaten = shopping.reduce((a, s) => a + s.eaten_cost, 0);
    return { ok: true as const, plan, shopping, checkout, eaten, status: r2.status, seconds: r2.s, tol };
  }

  // ---------- 7. rounds: stage 1 -> stage 2, re-pricing ingredients by real pack usage ----------
  const costPerG = new Map([...offers.keys()].map((iid) => [iid, offers.get(iid)![0]!.per_g]));
  const rounds = profile.rounds ?? 1;
  const stage1Opts = {
    time_limit: profile.stage1_time_limit_s ?? 6,
    mip_rel_gap: profile.mip_gap ?? 0.03,
    mip_heuristic_effort: profile.mip_heuristic_effort ?? 0.05,
  };
  type Stage2Ok = Extract<ReturnType<typeof stage2>, { ok: true }>;
  let best: (Stage2Ok & { round: number; stage1: { status: string; seconds: number } }) | null = null;
  let bestChosen: Map<string, UsableRecipe> | null = null;
  let stage1Failed = false;
  let firstChosen: Map<string, UsableRecipe> | null = null;
  const seen = new Set<string>();
  function refinedPools() {
    const K2 = profile.refine_candidates_per_slot ?? 5;
    const score = (r: UsableRecipe) =>
      r.items.reduce((a, it) => a + (it.g ?? (it.min_g! + it.max_g!) / 2) * (pantry.has(it.id) ? 0 : costPerG.get(it.id)!), 0) /
      Math.max(
        5,
        r.items.reduce((a, it) => a + (it.g ?? (it.min_g! + it.max_g!) / 2) * est(it.id).macros.protein_g, 0),
      );
    const pools = {} as Record<Slot, UsableRecipe[]>;
    for (const s of slots) {
      const keep = new Set([...bestChosen!.entries()].filter(([k]) => k.endsWith(`_${s}`)).map(([, r]) => r));
      [...candidates[s]]
        .sort((a, b) => score(a) - score(b))
        .filter((r) => !r.treat)
        .slice(0, K2)
        .forEach((r) => keep.add(r));
      pools[s] = [...keep];
    }
    return pools;
  }
  for (let round = 1; round <= rounds; round++) {
    if (round > 1 && !bestChosen) break;
    const { m1, s1, weekly } = buildStage1(costPerG, round === 1 ? candidates : refinedPools(), round === 1 ? 1 : 1.15);
    const r1 = solve(m1, stage1Opts);
    if (!r1.ok) {
      log.push(`Round ${round}: stage 1 found no plan (${r1.status})`);
      if (round === 1) {
        stage1Failed = true;
        break;
      }
      continue;
    }
    const chosen = new Map<string, UsableRecipe>();
    for (const v of s1.X) if (r1.val(v.name) > 0.5) chosen.set(`${v.d}_${v.s}`, v.r);
    const key = [...chosen.values()].map((r) => r.id).join(",");
    const grams = new Map<string, number>();
    for (const [iid, terms] of weekly)
      grams.set(
        iid,
        terms.reduce((a, [c, v]) => a + c * r1.val(v), 0),
      );
    if (seen.has(key)) {
      log.push(`Round ${round}: same meals as before (${r1.s.toFixed(1)} s) — stopping`);
      break;
    }
    seen.add(key);
    firstChosen ??= chosen;
    const r2 = stage2(chosen);
    log.push(
      `Round ${round}: stage 1 ${r1.status} ${r1.s.toFixed(1)} s, stage 2 ${r2.ok ? `${r2.status} ${r2.seconds.toFixed(1)} s — checkout ${r2.checkout.toFixed(2)} EUR` : "no purchase plan"}`,
    );
    if (r2.ok && (!best || r2.checkout < best.checkout)) {
      best = { ...r2, round, stage1: { status: r1.status, seconds: r1.s } };
      bestChosen = chosen;
    }
    for (const [iid, g] of grams) {
      if (g < 1) continue;
      const o = offers.get(iid)![0]!;
      const eff = (Math.ceil(g / o.usable_g) * o.price) / g;
      costPerG.set(iid, Math.max(o.per_g, eff));
    }
  }
  if (!best && profile.diagnose === false) {
    return { ok: false, reason: stage1Failed ? "no_meal_plan" : "no_purchase_plan", message: NO_PLAN_MESSAGE_BG, log };
  }
  if (!best) {
    // Find out why, so the user gets an actionable message: is it the recipes (diet/exclusions vs targets) or money?
    let chosen = firstChosen;
    if (stage1Failed) {
      const { m1, s1 } = buildStage1(costPerG, candidates, Infinity); // same, without the budget estimate
      const r1 = solve(m1, stage1Opts);
      log.push(`Diagnose: stage 1 without budget ${r1.status} ${r1.s.toFixed(1)} s`);
      // Only a proven "infeasible" means the recipes can't do it; running out of time is not the user's problem.
      if (!r1.ok)
        return r1.status === "Infeasible"
          ? { ok: false, reason: "no_meal_plan", message: NO_RECIPES_MESSAGE_BG, log }
          : { ok: false, reason: "timeout", message: TIMEOUT_MESSAGE_BG, log };
      chosen = new Map();
      for (const v of s1.X) if (r1.val(v.name) > 0.5) chosen.set(`${v.d}_${v.s}`, v.r);
    }
    const free = chosen ? stage2(chosen, Infinity, Math.min(6, profile.stage2_time_limit_s ?? 10)) : null;
    if (free?.ok) {
      const min = Math.ceil(free.checkout);
      log.push(`Diagnose: cheapest plan found without the budget: ${free.checkout.toFixed(2)} EUR`);
      return { ok: false, reason: "budget_too_low", message: budgetMessageBg(profile.budget_eur, min), min_budget_eur: min, log };
    }
    return { ok: false, reason: "no_purchase_plan", message: NO_PLAN_MESSAGE_BG, log };
  }

  // ---------- 8. result ----------
  const totalS = (now() - t00) / 1000;
  const output: PlanOutput = {
    created: new Date(now()).toISOString(),
    profile: profile.name,
    targets: T,
    budget_eur: profile.budget_eur,
    checkout_eur: Math.round(best.checkout * 100) / 100,
    eaten_eur: Math.round(best.eaten * 100) / 100,
    solver: {
      best_round: best.round,
      stage1: best.stage1,
      stage2: { status: best.status, seconds: best.seconds, kcal_window_widened_by: best.tol },
      total_seconds: totalS,
    },
    pantry: [...pantry],
    plan: best.plan,
    shopping: best.shopping,
  };
  return { ok: true, output, log };
}
