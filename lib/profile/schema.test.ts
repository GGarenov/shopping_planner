import { describe, expect, it } from "vitest";
import { planSettingsSchema } from "./schema";

const base = {
  sex: "female",
  age: "29",
  height_cm: "165",
  weight_kg: "62.5",
  activity: "light",
  goal: "lose",
  budget_eur: "80",
  diet: null,
  exclude_tags: ["pork"],
  allergens: [],
  pantry: ["salt"],
  targets: { mode: "auto" },
};

describe("planSettingsSchema (Нов план → настройки)", () => {
  it("accepts automatic targets and coerces numbers", () => {
    const r = planSettingsSchema.parse(base);
    expect(r).toMatchObject({ age: 29, weight_kg: 62.5, budget_eur: 80, targets: { mode: "auto" } });
  });

  it("budget: any amount from 20 to 2000 €", () => {
    expect(planSettingsSchema.safeParse({ ...base, budget_eur: "20" }).success).toBe(true);
    expect(planSettingsSchema.safeParse({ ...base, budget_eur: "1000" }).success).toBe(true);
    expect(planSettingsSchema.safeParse({ ...base, budget_eur: "37.5" }).success).toBe(true);
    expect(planSettingsSchema.safeParse({ ...base, budget_eur: "19" }).success).toBe(false);
    expect(planSettingsSchema.safeParse({ ...base, budget_eur: "2001" }).success).toBe(false);
  });

  it("manual targets are validated (range ≥ 100 kcal)", () => {
    const ok = planSettingsSchema.parse({ ...base, targets: { mode: "manual", kcal_min: "1500", kcal_max: "1700", protein_min: "120" } });
    expect(ok.targets).toEqual({ mode: "manual", kcal_min: 1500, kcal_max: 1700, protein_min: 120 });
    const bad = planSettingsSchema.safeParse({ ...base, targets: { mode: "manual", kcal_min: "1500", kcal_max: "1550", protein_min: "120" } });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.message).toMatch(/100 kcal/);
  });

  it("no consent field needed here", () => {
    expect(planSettingsSchema.safeParse(base).success).toBe(true);
  });
});
