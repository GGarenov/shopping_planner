import { z } from "zod";
import { ALLERGEN_OPTIONS, EXCLUDE_OPTIONS, PANTRY_OPTIONS } from "./options";

/**
 * Validation messages below are translation keys of the "errors" namespace (messages/<locale>/errors.json).
 * Show one with `t(errorKey(issue.message))`, t = getTranslations("errors") / useTranslations("errors").
 * errorKey() maps zod's own untranslated messages (e.g. a non-numeric age) to the `fallback` key.
 */
export const ERROR_KEYS = [
  "sexRequired",
  "ageRange",
  "heightRange",
  "weightRange",
  "activityRequired",
  "goalRequired",
  "budgetMin",
  "budgetMax",
  "consentRequired",
  "kcalMin",
  "kcalMax",
  "proteinRange",
  "kcalSpan",
  "invalidData",
  "invalidValues",
  "saveFailed",
  "saveProfileFailed",
  "saveSettingsFailed",
] as const;
export type ErrorKey = (typeof ERROR_KEYS)[number];

export const errorKey = (message: string | undefined, fallback: ErrorKey = "invalidData"): ErrorKey =>
  (ERROR_KEYS as readonly string[]).includes(message ?? "") ? (message as ErrorKey) : fallback;

const oneOf = (opts: { value: string }[]) => z.enum(opts.map((o) => o.value) as [string, ...string[]]);

/** Onboarding input → profiles row. Ranges mirror the DB check constraints. */
export const profileInputSchema = z.object({
  sex: z.enum(["male", "female"], { error: "sexRequired" }),
  age: z.coerce.number().int().min(14, "ageRange").max(100, "ageRange"),
  height_cm: z.coerce.number().int().min(120, "heightRange").max(230, "heightRange"),
  weight_kg: z.coerce.number().min(30, "weightRange").max(300, "weightRange"),
  activity: z.enum(["sedentary", "light", "moderate", "high"], { error: "activityRequired" }),
  goal: z.enum(["lose", "maintain", "gain"], { error: "goalRequired" }),
  budget_eur: z.coerce.number().min(20, "budgetMin").max(2000, "budgetMax"),
  diet: z.enum(["vegetarian", "vegan", "pescatarian"]).nullable(),
  exclude_tags: z.array(oneOf(EXCLUDE_OPTIONS)).default([]),
  allergens: z.array(oneOf(ALLERGEN_OPTIONS)).default([]),
  pantry: z.array(oneOf(PANTRY_OPTIONS)).default([]),
  consent: z.literal(true, { error: "consentRequired" }),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export const targetsOverrideSchema = z
  .object({
    kcal_min: z.coerce.number().int().min(1000, "kcalMin").max(5000, "kcalMax"),
    kcal_max: z.coerce.number().int().min(1000, "kcalMin").max(5000, "kcalMax"),
    protein_min: z.coerce.number().int().min(30, "proteinRange").max(300, "proteinRange"),
  })
  .refine((v) => v.kcal_max - v.kcal_min >= 100, { error: "kcalSpan", path: ["kcal_max"] });

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

/** "New plan" settings screen: the profile fields (no consent step) + targets, automatic or set by hand. */
export const planSettingsSchema = profileInputSchema.omit({ consent: true }).extend({
  targets: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("auto") }),
    z.object({ mode: z.literal("manual"), kcal_min: z.unknown(), kcal_max: z.unknown(), protein_min: z.unknown() }).transform((v, ctx) => {
      const r = targetsOverrideSchema.safeParse(v);
      if (!r.success) {
        for (const i of r.error.issues) ctx.addIssue({ code: "custom", message: i.message });
        return z.NEVER;
      }
      return { mode: "manual" as const, ...r.data };
    }),
  ]),
});
export type PlanSettingsInput = z.input<typeof planSettingsSchema>;
