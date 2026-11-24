import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMatchers,
  checkLabel,
  compileRule,
  parseDescriptionNutrition,
  parseEnergyValues,
  parsePack,
  parsePrices,
  parseProductDetails,
  parseWeightFromName,
  type MatchableIngredient,
} from "./parse";

describe("parsePack", () => {
  it.each([
    ["650 г", { grams: 650, ml: null, count: null }],
    ["2 x 500 г", { grams: 1000 }],
    ["4 х 125 г", { grams: 500 }], // Cyrillic х
    ["1 кг", { grams: 1000 }],
    ["1,5 кг", { grams: 1500 }],
    ["500 мл", { ml: 500, grams: null }],
    ["1 л", { ml: 1000 }],
    ["10 бр.", { count: 10, grams: null }],
    ["1 връзка", { count: 1 }],
    ["400 гр", { grams: 400 }],
  ])("%s", (label, expected) => {
    expect(parsePack(label)).toMatchObject(expected);
  });

  it("flags variable weight (~)", () => {
    expect(parsePack("~ 670 г / бр")).toMatchObject({ grams: 670, variable_weight: true });
  });

  it("does not read a unit glued to a word ('гр' in 'грах')", () => {
    expect(parsePack("1 грах").grams).toBeNull();
  });

  it("products sold by kg use the quantity step", () => {
    expect(parsePack("~ 1 кг", "kg", 0.5)).toMatchObject({ grams: 500, variable_weight: false });
  });
});

describe("parseWeightFromName", () => {
  it.each([
    ["Карфиол 0.800-1.100 кг", 950],
    ["Краставица 200-250 г", 225],
    ["Авокадо Хас около 125 гр.", 125],
    ["Тиква ~ 1 кг", 1000],
    ["Протеин Whey 450 G", 450],
    ["Протеин 1.816 Kg", 1816],
    ["Pure Whey 0.454 Strawberry", 454],
    ["Магданоз връзка", null],
  ])("%s → %s", (name, grams) => {
    expect(parseWeightFromName(name)).toBe(grams);
  });
});

describe("parsePrices", () => {
  it("regular, promo and price per kg", () => {
    expect(parsePrices({ unit_delta: "8,80", promo_unit_delta: "6,99" }, 600)).toEqual({ regular: 8.8, promo: 6.99, per_kg: 14.67 });
  });
  it("ignores a 'promo' that is not cheaper", () => {
    expect(parsePrices({ unit_delta: 5, promo_unit_delta: 5 }, 1000).promo).toBeNull();
  });
  it("notes multi-pack discounts", () => {
    const p = parsePrices({ unit_delta: 2, bundle_discount_data: { original_price: "2,50", percent: 20 } });
    expect(p.bundle_note).toBe("-20% multi-pack (was 2.5)");
  });
});

describe("checkLabel (kcal vs macros within ±15 %)", () => {
  it("accepts a consistent label", () => {
    // almonds: 4·21 + 4·22 + 9·50 = 622 vs 646 → 3.7 % off
    expect(checkLabel({ kcal: 646, protein_g: 21, carbs_g: 22, fat_g: 50 })).toBe(true);
  });
  it("rejects kcal that does not match the macros", () => {
    expect(checkLabel({ kcal: 300, protein_g: 21, carbs_g: 22, fat_g: 50 })).toBe(false);
  });
  it("rejects a label with missing macros", () => {
    expect(checkLabel({ kcal: 100, protein_g: 5, carbs_g: 10 })).toBe(false);
  });
  it("zero-kcal products (water, salt) are valid only with ~zero macros", () => {
    expect(checkLabel({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })).toBe(true);
    expect(checkLabel({ kcal: 0, protein_g: 5, carbs_g: 0, fat_g: 0 })).toBe(false);
  });
  it("counts fibre at 2 kcal/g", () => {
    // 4·10 + 4·50 + 9·5 + 2·10 = 305
    expect(checkLabel({ kcal: 305, protein_g: 10, carbs_g: 50, fat_g: 5, fiber_g: 10 })).toBe(true);
  });
});

describe("parseEnergyValues", () => {
  it("reads a structured eBag label (kJ/kcal, Bulgarian keys)", () => {
    const l = parseEnergyValues({
      "Енергийна стойност kJ/kcal": "2703/646",
      Мазнини: "50 г",
      "от които наситени мастни киселини": "4 г",
      Въглехидрати: "22 г",
      "от които захари": "4 г",
      Белтъчини: "21 г",
      Сол: "2 г",
    });
    expect(l).toEqual({
      source: "energy_values",
      kcal: 646,
      fat_g: 50,
      sat_fat_g: 4,
      carbs_g: 22,
      sugar_g: 4,
      protein_g: 21,
      salt_g: 2,
      valid: true,
    });
  });
  it("reads '… kcal' inside the value and decimal commas", () => {
    expect(parseEnergyValues({ Енергия: "1046 kJ / 250 kcal", Мазнини: "<0,5", Въглехидрати: "61,5", Белтъци: "1,2" })).toMatchObject({
      kcal: 250,
      fat_g: 0.5,
      carbs_g: 61.5,
      protein_g: 1.2,
    });
  });
  it("ranges are unusable", () => {
    expect(parseEnergyValues({ "Енергийна стойност": "100 kcal", Мазнини: "3-5" })?.fat_g).toBeNull();
  });
  it("no energy → null", () => {
    expect(parseEnergyValues({ Мазнини: "3" })).toBeNull();
    expect(parseEnergyValues({})).toBeNull();
  });
});

describe("parseDescriptionNutrition / parseProductDetails", () => {
  const desc =
    "Риба тон в собствен сос. Отцедено тегло: 112 г. Хранителна стойност на 100 г: енергийна стойност 490 kJ / 116 kcal, мазнини 1 г, от които наситени мастни киселини 0,3 г, въглехидрати 0 г, захари 0 г, белтъчини 26 г, сол 1,1 г.";

  it("parses macros from free text", () => {
    expect(parseDescriptionNutrition(desc)).toMatchObject({
      source: "description_text",
      kcal: 116,
      fat_g: 1,
      sat_fat_g: 0.3,
      carbs_g: 0,
      protein_g: 26,
      salt_g: 1.1,
      valid: true,
    });
  });

  it("returns null without a nutrition section", () => {
    expect(parseDescriptionNutrition("Прясно пилешко филе от България.")).toBeNull();
  });

  it("extracts drained weight, country and prefers structured labels", () => {
    const d = parseProductDetails({ description: desc, energy_values: null, country_of_origin: "Тайланд" });
    expect(d).toMatchObject({ drained_grams: 112, country: "Тайланд", label: { source: "description_text" } });
    const d2 = parseProductDetails({
      description: desc,
      energy_values: { "Енергийна стойност": "120 kcal", Белтъчини: "27", Мазнини: "1", Въглехидрати: "0" },
    });
    expect(d2.label?.source).toBe("energy_values");
  });
});

describe("compileRule (Unicode word boundaries)", () => {
  it("\\b works for Cyrillic", () => {
    const re = compileRule("\\bориз\\b");
    expect(re.test("Ориз Басмати 1 кг")).toBe(true);
    expect(re.test("Оризови бисквити")).toBe(false);
  });
});

describe("buildMatchers with the real ingredient rules", () => {
  const root = path.resolve(__dirname, "../..");
  const ingredients = JSON.parse(readFileSync(path.join(root, "data/ingredients.json"), "utf8")).ingredients as MatchableIngredient[];
  const products = JSON.parse(readFileSync(path.join(root, "data/ebag_products.json"), "utf8")).products as {
    name: string;
    ingredient_id: string;
    link: string;
  }[];

  it("re-links auto-linked products to the same ingredient (category filters off)", () => {
    // Categories are not stored in ebag_products.json, so ignore category constraints here.
    const noCats = ingredients.map((i) => (i.match ? { ...i, match: { ...i.match, categories: [], exclude_categories: [] } } : i));
    const match = buildMatchers(noCats, {}, []);
    const auto = products.filter((p) => p.link === "auto");
    const agree = auto.filter((p) => match(p.name, [])?.ingredient_id === p.ingredient_id).length;
    expect(auto.length).toBeGreaterThan(500);
    expect(agree / auto.length).toBeGreaterThan(0.95);
  });

  it("global exclusions win", () => {
    const match = buildMatchers(ingredients, {}, ["\\bпреса\\b"]);
    expect(match("Преса за чесън", [])).toBeNull();
  });

  it("longest include match wins and ties are reported as ambiguous", () => {
    const ings: MatchableIngredient[] = [
      { id: "milk", match: { include: ["мляко"] } },
      { id: "yogurt", match: { include: ["кисело мляко"] } },
      { id: "a", match: { include: ["сирене"] } },
      { id: "b", match: { include: ["сирене"] } },
    ];
    const match = buildMatchers(ings, {}, []);
    expect(match("Кисело мляко 2%", [])?.ingredient_id).toBe("yogurt");
    expect(match("Сирене краве", [])?.ambiguous).toEqual(["a", "b"]);
  });

  it("category groups restrict matches", () => {
    const ings: MatchableIngredient[] = [{ id: "chicken", match: { include: ["пилешк"], categories: ["meat"] } }];
    const match = buildMatchers(ings, { meat: [10, 11] }, []);
    expect(match("Пилешко филе", [11])?.ingredient_id).toBe("chicken");
    expect(match("Пилешка супа", [99])).toBeNull();
  });

  it("edible fraction rules apply", () => {
    const ings: MatchableIngredient[] = [
      { id: "eggs", match: { include: ["яйца"] }, edible_fraction_rules: [{ pattern: "пъдпъдъч", value: 0.9 }] },
    ];
    const match = buildMatchers(ings, {}, []);
    expect(match("Пъдпъдъчи яйца 18 бр.", [])?.edible_fraction).toBe(0.9);
    expect(match("Яйца М 10 бр.", [])?.edible_fraction).toBeUndefined();
  });
});
