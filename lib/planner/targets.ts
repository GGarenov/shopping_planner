// Daily targets — ported 1:1 from scripts/plan.mjs → computeTargets (SPEC §7.1).
// Keep the numbers identical: the planner and the UI must agree.

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "high";
export type Goal = "lose" | "maintain" | "gain";

export const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};

export const DEFAULT_KCAL_TOLERANCE = 100;

export interface BodyData {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: Activity;
  goal: Goal;
  kcal_tolerance?: number;
}

/** Same shape as the planner's targets (stored in plans.targets). */
export interface Targets {
  bmr: number;
  tdee: number;
  kcal: number;
  kcal_min: number;
  kcal_max: number;
  protein_min: number;
  ref_weight: number;
  formula: string;
  source?: "computed" | "manual";
}

/** What the user can change on the targets screen (stored in profiles.targets_override). */
export interface TargetsOverride {
  kcal_min: number;
  kcal_max: number;
  protein_min: number;
}

export function computeTargets(p: BodyData): Targets {
  const factor = ACTIVITY_FACTOR[p.activity];
  const bmr = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + (p.sex === "male" ? 5 : -161);
  const tdee = bmr * factor;
  let kcal = tdee;
  if (p.goal === "lose") kcal = tdee - Math.min(0.2 * tdee, 750);
  if (p.goal === "gain") kcal = tdee + 300;
  kcal = Math.max(kcal, p.sex === "male" ? 1500 : 1200);
  const refWeight = Math.min(p.weight_kg, 25 * (p.height_cm / 100) ** 2); // weight at BMI 25
  const proteinPerKg = p.goal === "lose" ? 2.0 : 1.6;
  const protein = proteinPerKg * refWeight;
  const tol = p.kcal_tolerance ?? DEFAULT_KCAL_TOLERANCE;
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal: Math.round(kcal),
    kcal_min: Math.round(kcal - tol),
    kcal_max: Math.round(kcal + tol),
    protein_min: Math.round(protein),
    ref_weight: Math.round(refWeight * 10) / 10,
    formula: `Mifflin-St Jeor BMR x ${factor} (${p.activity})${p.goal === "lose" ? " - 20% (max 750)" : ""}; protein ${proteinPerKg} g x ${Math.round(refWeight)} kg (weight at BMI 25 or less)`,
    source: "computed",
  };
}

/** Computed targets with the user's manual override applied on top. */
export function resolveTargets(p: BodyData, override?: TargetsOverride | null): Targets {
  const t = computeTargets(p);
  if (!override) return t;
  return {
    ...t,
    kcal_min: override.kcal_min,
    kcal_max: override.kcal_max,
    kcal: Math.round((override.kcal_min + override.kcal_max) / 2),
    protein_min: override.protein_min,
    source: "manual",
  };
}

/** Number format without thousands separator: bg decimal comma (77,4 · 2,0 · 1,375), en decimal point (77.4 · 2.0). */
const fmt = (locale: string, n: number, minFraction = 0) =>
  n.toLocaleString(locale === "en" ? "en-GB" : "bg-BG", {
    useGrouping: false,
    minimumFractionDigits: minFraction,
    maximumFractionDigits: 3,
  });

export interface FormulaStep {
  label: string;
  expression: string;
  value: string;
}

/** Texts of the explanation per language (the targets screen passes the UI locale; default Bulgarian). */
const EXPLAIN_TEXT = {
  bg: {
    bmr: "Базов метаболизъм (Mifflin-St Jeor)",
    tdee: "Дневен разход с активността",
    goal: "Според целта",
    range: "Диапазон",
    protein: "Протеин (минимум)",
    kg: "кг",
    cm: "см",
    g: "г",
    years: "г.",
    cutNote: "(20 %, най-много 750)",
    noChange: "(без промяна)",
    min: "минимум",
    refNote: (bmi25: string, kg: string) => `(по-малкото от теглото и теглото при ИТМ 25 = ${bmi25} ${kg})`,
  },
  en: {
    bmr: "Basal metabolism (Mifflin-St Jeor)",
    tdee: "Daily burn with activity",
    goal: "For your goal",
    range: "Range",
    protein: "Protein (minimum)",
    kg: "kg",
    cm: "cm",
    g: "g",
    years: "y",
    cutNote: "(20 %, at most 750)",
    noChange: "(no change)",
    min: "minimum",
    refNote: (bmi25: string, kg: string) => `(the lower of your weight and the weight at BMI 25 = ${bmi25} ${kg})`,
  },
};

/** Step-by-step explanation for the targets screen, in Bulgarian (default) or English. */
export function explainTargets(p: BodyData, locale: string = "bg"): FormulaStep[] {
  const L = locale === "en" ? EXPLAIN_TEXT.en : EXPLAIN_TEXT.bg;
  const n = (v: number, minFraction = 0) => fmt(locale, v, minFraction);
  const t = computeTargets(p);
  const factor = ACTIVITY_FACTOR[p.activity];
  const sexTerm = p.sex === "male" ? "+ 5" : "− 161";
  const tdee = t.tdee;
  const floor = p.sex === "male" ? 1500 : 1200;
  const proteinPerKg = p.goal === "lose" ? 2.0 : 1.6;
  const bmi25 = Math.round(25 * (p.height_cm / 100) ** 2 * 10) / 10;

  let goalExpr: string;
  if (p.goal === "lose") {
    const rawTdee = (10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + (p.sex === "male" ? 5 : -161)) * factor;
    const cut = Math.round(Math.min(0.2 * rawTdee, 750));
    goalExpr = `${tdee} − ${cut} ${L.cutNote}`;
  } else if (p.goal === "gain") {
    goalExpr = `${tdee} + 300`;
  } else {
    goalExpr = `${tdee} ${L.noChange}`;
  }

  return [
    {
      label: L.bmr,
      expression: `10 × ${n(p.weight_kg)} ${L.kg} + ${n(6.25)} × ${p.height_cm} ${L.cm} − 5 × ${p.age} ${L.years} ${sexTerm}`,
      value: `${t.bmr} kcal`,
    },
    {
      label: L.tdee,
      expression: `${t.bmr} × ${n(factor)}`,
      value: `${tdee} kcal`,
    },
    {
      label: L.goal,
      expression: `${goalExpr}; ${L.min} ${floor}`,
      value: `${t.kcal} kcal`,
    },
    {
      label: L.range,
      expression: `${t.kcal} ± ${p.kcal_tolerance ?? DEFAULT_KCAL_TOLERANCE}`,
      value: `${t.kcal_min}–${t.kcal_max} kcal`,
    },
    {
      label: L.protein,
      expression: `${n(proteinPerKg, 1)} ${L.g} × ${n(t.ref_weight)} ${L.kg} ${L.refNote(n(bmi25), L.kg)}`,
      value: `${t.protein_min} ${L.g}`,
    },
  ];
}
