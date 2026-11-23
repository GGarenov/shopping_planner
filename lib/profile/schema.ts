import { z } from "zod";
import { ALLERGEN_OPTIONS, EXCLUDE_OPTIONS, PANTRY_OPTIONS } from "./options";

const oneOf = (opts: { value: string }[]) => z.enum(opts.map((o) => o.value) as [string, ...string[]]);

/** Onboarding input → profiles row. Ranges mirror the DB check constraints. */
export const profileInputSchema = z.object({
  sex: z.enum(["male", "female"], { error: "Избери пол" }),
  age: z.coerce.number().int().min(14, "Възраст 14–100").max(100, "Възраст 14–100"),
  height_cm: z.coerce.number().int().min(120, "Ръст 120–230 см").max(230, "Ръст 120–230 см"),
  weight_kg: z.coerce.number().min(30, "Тегло 30–300 кг").max(300, "Тегло 30–300 кг"),
  activity: z.enum(["sedentary", "light", "moderate", "high"], { error: "Избери активност" }),
  goal: z.enum(["lose", "maintain", "gain"], { error: "Избери цел" }),
  budget_eur: z.coerce.number().min(20, "Бюджет поне 20 €").max(1000, "Бюджет до 1000 €"),
  diet: z.enum(["vegetarian", "vegan", "pescatarian"]).nullable(),
  exclude_tags: z.array(oneOf(EXCLUDE_OPTIONS)).default([]),
  allergens: z.array(oneOf(ALLERGEN_OPTIONS)).default([]),
  pantry: z.array(oneOf(PANTRY_OPTIONS)).default([]),
  consent: z.literal(true, { error: "Нужно е съгласие за обработка на данните" }),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export const targetsOverrideSchema = z
  .object({
    kcal_min: z.coerce.number().int().min(1000, "Минимум 1000 kcal").max(5000, "Максимум 5000 kcal"),
    kcal_max: z.coerce.number().int().min(1000, "Минимум 1000 kcal").max(5000, "Максимум 5000 kcal"),
    protein_min: z.coerce.number().int().min(30, "Протеин 30–300 г").max(300, "Протеин 30–300 г"),
  })
  .refine((v) => v.kcal_max - v.kcal_min >= 100, { error: "Диапазонът трябва да е поне 100 kcal", path: ["kcal_max"] });

/** Row shape from the `profiles` table. */
export interface ProfileRow {
  user_id: string;
  sex: "male" | "female" | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity: "sedentary" | "light" | "moderate" | "high" | null;
  goal: "lose" | "maintain" | "gain" | null;
  budget_eur: number | null;
  diet: "vegetarian" | "vegan" | "pescatarian" | "low_carb" | null;
  exclude_tags: string[];
  allergens: string[];
  pantry: string[];
  options: { consent_at?: string; kcal_tolerance?: number; install_hint_seen?: boolean } & Record<string, unknown>;
  targets_override: { kcal_min: number; kcal_max: number; protein_min: number } | null;
}

export type CompleteProfile = ProfileRow & {
  sex: "male" | "female";
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: "sedentary" | "light" | "moderate" | "high";
  goal: "lose" | "maintain" | "gain";
  budget_eur: number;
};

export function isComplete(p: ProfileRow | null): p is CompleteProfile {
  return (
    !!p &&
    !!p.sex &&
    !!p.age &&
    !!p.height_cm &&
    p.weight_kg != null &&
    !!p.activity &&
    !!p.goal &&
    p.budget_eur != null &&
    !!p.options?.consent_at
  );
}
