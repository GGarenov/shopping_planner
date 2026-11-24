// Builds data/usda/usda_macros.csv from the raw USDA FoodData Central downloads:
//   - Foundation Foods (JSON, 2026-10-29)
//   - SR Legacy (CSV, 2018-04)
// Output: one row per food, macros per 100 g edible portion.
// Usage: node scripts/build_usda_table.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "data", "usda", "raw");
const FOUNDATION_JSON = path.join(RAW, "foundation", "FoodData_Central_foundation_food_json_2026-10-29.json");
const SR_DIR = path.join(RAW, "sr_legacy", "FoodData_Central_sr_legacy_food_csv_2018-04");
const OUT = path.join(ROOT, "data", "usda", "usda_macros.csv");

// USDA nutrient ids, in order of preference for each column.
const FIELDS = {
  kcal: [1008, 2047, 2048], // Energy (kcal); Atwater general / specific
  protein_g: [1003],
  fat_g: [1004, 1085], // Total lipid; Total fat (NLEA)
  carbs_g: [1005, 1050], // Carbohydrate by difference; by summation
  fiber_g: [1079],
  sugar_g: [2000, 1063], // Sugars total incl. NLEA; Sugars, Total
  sat_fat_g: [1258],
  sodium_mg: [1093],
};
const WANTED = new Set(Object.values(FIELDS).flat());

// Minimal RFC 4180 CSV parser (quoted fields, "" escapes).
function parseCsv(text) {
  const rows = [];
  let row = [],
    field = "",
    inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}
const readCsv = (f) => parseCsv(fs.readFileSync(path.join(SR_DIR, f), "utf8"));

function pick(nutrients) {
  const out = {};
  for (const [col, ids] of Object.entries(FIELDS)) {
    const id = ids.find((id) => nutrients.has(id));
    out[col] = id === undefined ? null : nutrients.get(id);
  }
  // Derive kcal from macros if USDA gives no energy value.
  out.kcal_estimated = false;
  if (out.kcal == null && out.protein_g != null && out.fat_g != null && out.carbs_g != null) {
    out.kcal = 4 * out.protein_g + 9 * out.fat_g + 4 * out.carbs_g;
    out.kcal_estimated = true;
  }
  return out;
}

const foods = [];

// Foundation Foods
const foundation = JSON.parse(fs.readFileSync(FOUNDATION_JSON, "utf8")).FoundationFoods;
for (const f of foundation) {
  const n = new Map();
  for (const fn of f.foodNutrients ?? []) {
    const id = fn.nutrient?.id;
    if (WANTED.has(id) && fn.amount != null && !n.has(id)) n.set(id, Number(fn.amount));
  }
  foods.push({
    fdc_id: f.fdcId,
    source: "foundation",
    category: f.foodCategory?.description ?? "",
    description: f.description,
    ...pick(n),
  });
}

// SR Legacy
const categories = new Map(readCsv("food_category.csv").map((c) => [c.id, c.description]));
const srNutrients = new Map();
for (const r of readCsv("food_nutrient.csv")) {
  const id = Number(r.nutrient_id);
  if (!WANTED.has(id) || r.amount === "") continue;
  if (!srNutrients.has(r.fdc_id)) srNutrients.set(r.fdc_id, new Map());
  srNutrients.get(r.fdc_id).set(id, Number(r.amount));
}
for (const f of readCsv("food.csv")) {
  foods.push({
    fdc_id: Number(f.fdc_id),
    source: "sr_legacy",
    category: categories.get(f.food_category_id) ?? "",
    description: f.description,
    ...pick(srNutrients.get(f.fdc_id) ?? new Map()),
  });
}

// Write CSV
const cols = ["fdc_id", "source", "category", "description", ...Object.keys(FIELDS), "kcal_estimated"];
const esc = (v) => {
  if (v == null) return "";
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
foods.sort((a, b) => a.category.localeCompare(b.category) || a.description.localeCompare(b.description));
const lines = [cols.join(","), ...foods.map((f) => cols.map((c) => esc(f[c])).join(","))];
fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");

const missing = (c) => foods.filter((f) => f[c] == null).length;
console.log(`Wrote ${foods.length} foods to ${path.relative(ROOT, OUT)}`);
console.log(
  `  foundation: ${foods.filter((f) => f.source === "foundation").length}, sr_legacy: ${foods.filter((f) => f.source === "sr_legacy").length}`,
);
console.log(`  missing kcal: ${missing("kcal")}, protein: ${missing("protein_g")}, fat: ${missing("fat_g")}, carbs: ${missing("carbs_g")}`);
console.log(`  kcal estimated from macros: ${foods.filter((f) => f.kcal_estimated).length}`);
