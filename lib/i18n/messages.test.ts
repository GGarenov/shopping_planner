// Every Bulgarian key has an English translation (and no stray English-only keys), and every ICU placeholder used
// in Bulgarian also appears in English — so switching to EN never shows a fallback or breaks a {value}.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAMESPACES } from "./config";

const root = path.resolve(__dirname, "../..");
const load = (locale: string, ns: string) =>
  JSON.parse(readFileSync(path.join(root, "messages", locale, `${ns}.json`), "utf8")) as Record<string, unknown>;

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();

describe("translations", () => {
  for (const ns of NAMESPACES) {
    it(`${ns}: same keys and placeholders in bg and en`, () => {
      const bg = flatten(load("bg", ns));
      const en = flatten(load("en", ns));
      expect(Object.keys(en).sort()).toEqual(Object.keys(bg).sort());
      for (const [k, v] of Object.entries(bg)) expect(placeholders(en[k] ?? ""), `${ns}.${k}`).toEqual(placeholders(v));
    });
  }

  it("recipe and ingredient translations cover all data", () => {
    const recipes = JSON.parse(readFileSync(path.join(root, "data/recipes.json"), "utf8")).recipes as { id: string; steps?: string[] }[];
    const ingredients = JSON.parse(readFileSync(path.join(root, "data/ingredients.json"), "utf8")).ingredients as { id: string }[];
    const rEn = JSON.parse(readFileSync(path.join(root, "data/i18n/recipes.en.json"), "utf8")) as Record<
      string,
      { name: string; steps: string[] }
    >;
    const iEn = JSON.parse(readFileSync(path.join(root, "data/i18n/ingredients.en.json"), "utf8")) as Record<string, string>;
    for (const r of recipes) {
      expect(rEn[r.id]?.name, r.id).toBeTruthy();
      expect(rEn[r.id]?.steps.length, r.id).toBe(r.steps?.length ?? 0);
    }
    for (const i of ingredients) expect(iEn[i.id], i.id).toBeTruthy();
  });
});
