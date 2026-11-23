// End-to-end planner test on the repo's data files (SPEC §9: "one end-to-end test that generates a plan from fixture data").
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { generatePlan, NO_PLAN_MESSAGE_BG, type PlanInput, type PlanOutput, type PlanProfile } from "./plan";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));

const data: Omit<PlanInput, "profile"> = {
  ingredients: read("data/ingredients.json").ingredients,
  recipes: read("data/recipes.json").recipes,
  products: read("data/ebag_products.json").products,
};
const testProfile = read("data/profiles/test.json") as PlanProfile;

describe("generatePlan (data/profiles/test.json)", () => {
  let out: PlanOutput;

  beforeAll(async () => {
    const res = await generatePlan({ ...data, profile: testProfile });
    if (!res.ok) throw new Error(`no plan: ${res.reason} — ${res.log.join(" | ")}`);
    out = res.output;
  }, 60_000);

  it("has 7 days × breakfast, lunch, dinner, snack", () => {
    expect(out.plan).toHaveLength(7);
    for (const day of out.plan) expect(day.meals.map((m) => m.slot)).toEqual(["breakfast", "lunch", "dinner", "snack"]);
  });

  it("every day is within the kcal range and above the protein minimum", () => {
    const tol = out.solver.stage2.kcal_window_widened_by;
    expect(tol).toBe(0);
    for (const day of out.plan) {
      expect(day.kcal).toBeGreaterThanOrEqual(out.targets.kcal_min);
      expect(day.kcal).toBeLessThanOrEqual(out.targets.kcal_max);
      expect(day.protein_g).toBeGreaterThanOrEqual(out.targets.protein_min);
    }
  });

  it("checkout fits the budget and equals the shopping list total", () => {
    expect(out.checkout_eur).toBeLessThanOrEqual(testProfile.budget_eur);
    const sum = out.shopping.reduce((a, s) => a + s.cost, 0);
    expect(out.checkout_eur).toBeCloseTo(sum, 2);
    expect(out.eaten_eur).toBeLessThanOrEqual(out.checkout_eur);
  });

  it("buys whole packs that cover what is eaten, and never buys pantry items", () => {
    for (const s of out.shopping) {
      expect(Number.isInteger(s.packs)).toBe(true);
      expect(s.packs).toBeGreaterThan(0);
      expect(s.usable_g + 1).toBeGreaterThanOrEqual(s.used_edible_g);
      expect(testProfile.pantry).not.toContain(s.ingredient_id);
    }
  });

  it("respects variety rules: ≤ 2× per recipe, ≥ 1 fish, ≤ 2 desserts", () => {
    const meals = out.plan.flatMap((d) => d.meals);
    const counts = new Map<string, number>();
    for (const m of meals) counts.set(m.recipe_id, (counts.get(m.recipe_id) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    const recipes = new Map(data.recipes.map((r) => [r.id, r]));
    const fish = meals.filter((m) => (m.slot === "lunch" || m.slot === "dinner") && ["fish", "seafood"].includes(recipes.get(m.recipe_id)?.protein ?? ""));
    expect(fish.length).toBeGreaterThanOrEqual(1);
    expect(meals.filter((m) => recipes.get(m.recipe_id)?.treat).length).toBeLessThanOrEqual(2);
  });

  it("every meal has positive grams and macros that add up to the day totals", () => {
    for (const day of out.plan) {
      for (const m of day.meals) for (const i of m.items) expect(i.grams).toBeGreaterThan(0);
      expect(Math.abs(day.meals.reduce((a, m) => a + m.kcal, 0) - day.kcal)).toBeLessThanOrEqual(1);
    }
  });
});

describe("generatePlan — infeasible input", () => {
  it("returns a Bulgarian message instead of throwing when the budget is far too small", async () => {
    const res = await generatePlan({ ...data, profile: { ...testProfile, budget_eur: 15 } });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toBe(NO_PLAN_MESSAGE_BG);
      expect(["no_meal_plan", "no_purchase_plan"]).toContain(res.reason);
    }
  }, 60_000);
});
