"use server";

import { getUserAndProfile } from "@/lib/profile/load";
import { planSettingsSchema } from "@/lib/profile/schema";

/** Saves the "new plan" settings into the profile (they stay for next time). The client then generates the plan. */
export async function savePlanSettings(input: unknown): Promise<{ error?: string }> {
  const parsed = planSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Невалидни данни" };
  const { targets, ...fields } = parsed.data;
  const { supabase, user } = await getUserAndProfile();
  const targets_override = targets.mode === "manual" ? { kcal_min: targets.kcal_min, kcal_max: targets.kcal_max, protein_min: targets.protein_min } : null;
  const { error } = await supabase.from("profiles").update({ ...fields, targets_override }).eq("user_id", user.id);
  if (error) {
    console.error("plan settings update failed", error.code, error.message);
    return { error: "Не успяхме да запазим настройките. Опитай отново." };
  }
  return {};
}
