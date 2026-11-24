import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PlanOutput, ShoppingItem } from "@/lib/planner/plan";
import { AISLES, eur, groupByAisle, packLabel, shoppingTotals } from "./shopping";

const plansDir = path.resolve(__dirname, "../../data/plans");
const file = readdirSync(plansDir)
  .filter((f) => f.startsWith("test-"))
  .sort()
  .pop()!;
const plan = JSON.parse(readFileSync(path.join(plansDir, file), "utf8")) as PlanOutput;

describe("shopping list", () => {
  it("totals match the plan JSON (Phase 4 'done when')", () => {
    const t = shoppingTotals(plan.shopping);
    expect(t.checkout).toBeCloseTo(plan.checkout_eur, 2);
    expect(t.eaten).toBeCloseTo(plan.eaten_eur, 2);
    const groups = groupByAisle(plan.shopping);
    expect(groups.reduce((s, g) => s + g.cost, 0)).toBeCloseTo(plan.checkout_eur, 2);
  });

  it("keeps every item exactly once, aisles in store-walk order", () => {
    const groups = groupByAisle(plan.shopping);
    expect(groups.flatMap((g) => g.items)).toHaveLength(plan.shopping.length);
    const order = AISLES.map((a) => a.key);
    const idx = groups.map((g) => order.indexOf(g.key));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    for (const g of groups) expect(g.known).toBe(true);
  });

  it("unknown aisles go last, marked unknown", () => {
    const item = { ...plan.shopping[0]!, aisle: "zzz_new" } as ShoppingItem;
    const groups = groupByAisle([item, plan.shopping[1]!]);
    expect(groups.at(-1)).toMatchObject({ key: "zzz_new", known: false });
  });

  it("formats packs and euros", () => {
    expect(packLabel({ pack: "500 г", packs: 1 })).toBe("500 г");
    expect(packLabel({ pack: "~ 700 г / бр", packs: 2 })).toBe("2 × ~ 700 г / бр");
    expect(eur(9.4)).toBe("9,40 €");
  });
});
