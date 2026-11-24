// Builds data/recipes.json from the hand-written sources in data/recipes_src/*.json.
// - validates every recipe (ingredient ids, ranges, fields)
// - computes macros per serving at the minimum and maximum amounts
// - derives diets, allergens and exclusion tags from the ingredients
// Usage: node scripts/build_recipes.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "data", "recipes_src");
const OUT = path.join(ROOT, "data", "recipes.json");
const ingredients = new Map(
  JSON.parse(fs.readFileSync(path.join(ROOT, "data", "ingredients.json"), "utf8")).ingredients.map((i) => [i.id, i]),
);

const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack", "dessert", "side"]);
const CUISINES = new Set(["bulgarian", "international", "fitness"]);
const PROTEINS = new Set([
  "chicken",
  "turkey",
  "pork",
  "beef",
  "mixed_meat",
  "fish",
  "seafood",
  "eggs",
  "dairy",
  "legumes",
  "tofu",
  "none",
]);
const MACROS = ["kcal", "protein_g", "fat_g", "carbs_g", "fiber_g"];
const DIETS = ["vegan", "vegetarian", "pescatarian"];

const errors = [],
  warnings = [];
const err = (r, m) => errors.push(`${r}: ${m}`);
const warn = (r, m) => warnings.push(`${r}: ${m}`);
const round = (x) => Math.round(x * 10) / 10;

const files = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith(".json"))
  .sort();
const recipes = [],
  seen = new Set();

for (const file of files) {
  const src = JSON.parse(fs.readFileSync(path.join(SRC, file), "utf8"));
  for (const r of src.recipes) {
    const id = r.id ?? "(no id)";
    if (!/^[a-z0-9_]+$/.test(id)) err(id, "id must be lowercase latin letters, digits, underscores");
    if (seen.has(id)) err(id, "duplicate id");
    seen.add(id);
    if (!r.name) err(id, "missing name");
    if (!r.meal_types?.length || r.meal_types.some((m) => !MEAL_TYPES.has(m))) err(id, `bad meal_types ${r.meal_types}`);
    if (!CUISINES.has(r.cuisine)) err(id, `bad cuisine ${r.cuisine}`);
    if (!PROTEINS.has(r.protein)) err(id, `bad protein ${r.protein}`);
    if (!r.steps?.length) err(id, "no steps");

    const lo = Object.fromEntries(MACROS.map((m) => [m, 0]));
    const hi = Object.fromEntries(MACROS.map((m) => [m, 0]));
    const required = [],
      optional = [];
    for (const it of r.ingredients || []) {
      const ing = ingredients.get(it.id);
      if (!ing) {
        err(id, `unknown ingredient ${it.id}`);
        continue;
      }
      const fixed = it.g != null;
      const min = fixed ? it.g : it.min_g,
        max = fixed ? it.g : it.max_g;
      if (min == null || max == null || min < 0 || max < min) {
        err(id, `bad amounts for ${it.id}`);
        continue;
      }
      if (it.step_g && (min % it.step_g || max % it.step_g)) warn(id, `${it.id} min/max not multiples of step_g`);
      (min > 0 ? required : optional).push(ing);
      for (const m of MACROS) {
        const v = ing.per_100g?.[m] ?? 0;
        lo[m] += (v * min) / 100;
        hi[m] += (v * max) / 100;
      }
    }

    // Diets fit if every required ingredient fits; optional ones (min 0) can be left out by the solver.
    const diets = DIETS.filter((d) => required.every((i) => i.diets?.includes(d)));
    const midCarbs = (lo.carbs_g + hi.carbs_g) / 2;
    if (midCarbs <= 20) diets.push("low_carb");
    const allergens = [...new Set(required.flatMap((i) => i.allergens || []))].sort();
    const allergensOptional = [...new Set(optional.flatMap((i) => i.allergens || []))].filter((a) => !allergens.includes(a)).sort();
    const exclusionTags = [...new Set(required.flatMap((i) => i.tags || []))].sort();

    const isMain = r.meal_types.some((m) => m === "lunch" || m === "dinner") && !r.meal_types.includes("side");
    if (isMain && hi.protein_g < 25) warn(id, `main meal with only ${round(hi.protein_g)} g protein at max amounts`);
    if (hi.kcal > 1300) warn(id, `${round(hi.kcal)} kcal at max amounts`);

    recipes.push({
      ...r,
      section: src.section,
      batch_servings: r.batch_servings ?? 1,
      keeps_days: r.keeps_days ?? 1,
      treat: r.treat ?? false,
      total_min: (r.prep_min ?? 0) + (r.cook_min ?? 0),
      diets,
      allergens,
      ...(allergensOptional.length ? { allergens_optional: allergensOptional } : {}),
      exclusion_tags: exclusionTags,
      nutrition_per_serving: {
        min: Object.fromEntries(MACROS.map((m) => [m, round(lo[m])])),
        max: Object.fromEntries(MACROS.map((m) => [m, round(hi[m])])),
      },
    });
  }
}

if (warnings.length) console.log("Warnings:\n  " + warnings.join("\n  "));
if (errors.length) {
  console.error("Errors:\n  " + errors.join("\n  "));
  process.exit(1);
}

fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      _about: {
        description:
          "Recipes for the planner, in Bulgarian. Built from data/recipes_src by scripts/build_recipes.mjs — edit the sources, not this file.",
        updated: new Date().toISOString().slice(0, 10),
        amounts:
          "Grams per serving of raw, edible ingredient (peeled, without bone). min_g/max_g = range the solver may choose; g = fixed; min_g 0 = optional; step_g = whole pieces only (eggs 60 g each).",
        batch_servings: "Smallest sensible batch to cook at once (e.g. a tray of brownies = 8). Leftovers keep for keeps_days.",
        diets: "Derived: a diet fits if all required ingredients fit it. low_carb = 20 g carbs or less per serving at mid amounts.",
        nutrition_per_serving:
          "Macros with every ingredient at its min and at its max amount (USDA or manual values from ingredients.json).",
        count: recipes.length,
      },
      recipes,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

const by = (k) =>
  recipes.reduce((a, r) => {
    for (const v of [].concat(r[k])) a[v] = (a[v] || 0) + 1;
    return a;
  }, {});
console.log(`Wrote ${recipes.length} recipes to data/recipes.json`);
console.log("meal types:", by("meal_types"));
console.log("protein:", by("protein"));
console.log("diets:", by("diets"));
