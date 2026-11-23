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

/** Bulgarian number format: decimal comma, no thousands separator (e.g. 77,4 · 2,0 · 1,375). */
const bg = (n: number, minFraction = 0) =>
  n.toLocaleString("bg-BG", { useGrouping: false, minimumFractionDigits: minFraction, maximumFractionDigits: 3 });

export interface FormulaStep {
  label: string;
  expression: string;
  value: string;
}

/** Step-by-step explanation in Bulgarian for the targets screen. */
export function explainTargets(p: BodyData): FormulaStep[] {
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
    goalExpr = `${tdee} − ${cut} (20 %, най-много 750)`;
  } else if (p.goal === "gain") {
    goalExpr = `${tdee} + 300`;
  } else {
    goalExpr = `${tdee} (без промяна)`;
  }

  return [
    {
      label: "Базов метаболизъм (Mifflin-St Jeor)",
      expression: `10 × ${bg(p.weight_kg)} кг + 6,25 × ${p.height_cm} см − 5 × ${p.age} г. ${sexTerm}`,
      value: `${t.bmr} kcal`,
    },
    {
      label: "Дневен разход с активността",
      expression: `${t.bmr} × ${bg(factor)}`,
      value: `${tdee} kcal`,
    },
    {
      label: "Според целта",
      expression: `${goalExpr}; минимум ${floor}`,
      value: `${t.kcal} kcal`,
    },
    {
      label: "Диапазон",
      expression: `${t.kcal} ± ${p.kcal_tolerance ?? DEFAULT_KCAL_TOLERANCE}`,
      value: `${t.kcal_min}–${t.kcal_max} kcal`,
    },
    {
      label: "Протеин (минимум)",
      expression: `${bg(proteinPerKg, 1)} г × ${bg(t.ref_weight)} кг (по-малкото от теглото и теглото при ИТМ 25 = ${bg(bmi25)} кг)`,
      value: `${t.protein_min} г`,
    },
  ];
}
