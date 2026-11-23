import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeTargets, explainTargets, resolveTargets, type BodyData } from "./targets.ts";

const root = path.resolve(__dirname, "../..");
const testProfile = JSON.parse(readFileSync(path.join(root, "data/profiles/test.json"), "utf8")) as BodyData;

describe("computeTargets", () => {
  it("matches the targets the Node planner produced for data/profiles/test.json", () => {
    const planFile = readdirSync(path.join(root, "data/plans")).find((f) => f.startsWith("test-"));
    expect(planFile).toBeDefined();
    const plan = JSON.parse(readFileSync(path.join(root, "data/plans", planFile!), "utf8"));
    const { source, ...t } = computeTargets(testProfile);
    expect(source).toBe("computed");
    for (const k of ["bmr", "tdee", "kcal", "kcal_min", "kcal_max", "protein_min", "ref_weight", "formula"] as const) {
      expect(t[k]).toEqual(plan.targets[k]);
    }
  });

  it("male, lose: 20 % cut, protein 2.0 g × weight at BMI 25", () => {
    // BMR = 960 + 1100 - 170 + 5 = 1895; TDEE = 1895 × 1.375 = 2605.6; cut 521.1 → 2084.5
    const t = computeTargets({ sex: "male", age: 34, height_cm: 176, weight_kg: 96, activity: "light", goal: "lose" });
    expect(t.bmr).toBe(1895);
    expect(t.tdee).toBe(2606);
    expect(t.kcal).toBe(2085);
    expect([t.kcal_min, t.kcal_max]).toEqual([1985, 2185]);
    expect(t.ref_weight).toBe(77.4); // 25 × 1.76²
    expect(t.protein_min).toBe(155);
  });

  it("caps the deficit at 750 kcal", () => {
    // BMR = 1500 + 1250 - 125 + 5 = 2630; TDEE = 2630 × 1.725 = 4536.75; 20 % = 907 → capped at 750
    const t = computeTargets({ sex: "male", age: 25, height_cm: 200, weight_kg: 150, activity: "high", goal: "lose" });
    expect(t.kcal).toBe(Math.round(4536.75 - 750));
  });

  it("female floor of 1200 kcal", () => {
    const t = computeTargets({ sex: "female", age: 70, height_cm: 150, weight_kg: 45, activity: "sedentary", goal: "lose" });
    expect(t.kcal).toBe(1200);
  });

  it("male floor of 1500 kcal", () => {
    const t = computeTargets({ sex: "male", age: 80, height_cm: 155, weight_kg: 50, activity: "sedentary", goal: "lose" });
    expect(t.kcal).toBe(1500);
  });

  it("gain: +300, protein 1.6 g × actual weight when BMI < 25", () => {
    // BMR = 600 + 1031.25 - 100 - 161 = 1370.25; TDEE = × 1.55 = 2123.9; +300
    const t = computeTargets({ sex: "female", age: 20, height_cm: 165, weight_kg: 60, activity: "moderate", goal: "gain" });
    expect(t.kcal).toBe(Math.round(1370.25 * 1.55 + 300));
    expect(t.protein_min).toBe(96);
  });

  it("maintain: kcal = TDEE, custom tolerance", () => {
    const t = computeTargets({ sex: "male", age: 40, height_cm: 180, weight_kg: 80, activity: "moderate", goal: "maintain", kcal_tolerance: 150 });
    expect(t.kcal).toBe(t.tdee);
    expect(t.kcal_max - t.kcal_min).toBe(300);
  });
});

describe("resolveTargets", () => {
  it("applies the manual override", () => {
    const t = resolveTargets(testProfile, { kcal_min: 1900, kcal_max: 2100, protein_min: 160 });
    expect(t).toMatchObject({ kcal_min: 1900, kcal_max: 2100, kcal: 2000, protein_min: 160, source: "manual", bmr: 1895 });
  });

  it("returns computed targets without override", () => {
    expect(resolveTargets(testProfile, null)).toEqual(computeTargets(testProfile));
  });
});

describe("explainTargets", () => {
  it("ends with the same numbers as computeTargets", () => {
    const steps = explainTargets(testProfile);
    const t = computeTargets(testProfile);
    expect(steps).toHaveLength(5);
    expect(steps[0]!.value).toBe(`${t.bmr} kcal`);
    expect(steps[3]!.value).toBe(`${t.kcal_min}–${t.kcal_max} kcal`);
    expect(steps[4]!.value).toBe(`${t.protein_min} г`);
  });

  it("uses Bulgarian decimal commas", () => {
    const steps = explainTargets({ ...testProfile, weight_kg: 96.5 });
    expect(steps[0]!.expression).toContain("10 × 96,5 кг");
    expect(steps[1]!.expression).toContain("× 1,375");
    expect(steps[4]!.expression).toMatch(/^2,0 г × 77,4 кг .*= 77,4 кг\)$/);
  });
});
