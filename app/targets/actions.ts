"use server";

import { revalidatePath } from "next/cache";
import { getUserAndProfile } from "@/lib/profile/load";
import { targetsOverrideSchema } from "@/lib/profile/schema";

export type OverrideState = {
  error?: string;
  saved?: boolean;
  /** What the user typed, so the form keeps it after a failed submit. */
  values?: Record<"kcal_min" | "kcal_max" | "protein_min", string>;
};

export async function saveTargetsOverride(_prev: OverrideState, formData: FormData): Promise<OverrideState> {
  const values = {
    kcal_min: String(formData.get("kcal_min") ?? ""),
    kcal_max: String(formData.get("kcal_max") ?? ""),
    protein_min: String(formData.get("protein_min") ?? ""),
  };
  const parsed = targetsOverrideSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Невалидни стойности", values };

  const { supabase, user } = await getUserAndProfile();
  const { error } = await supabase.from("profiles").update({ targets_override: parsed.data }).eq("user_id", user.id);
  if (error) {
    console.error("targets_override update failed", error.code, error.message);
    return { error: "Не успяхме да запазим. Опитай отново.", values };
  }
  revalidatePath("/targets");
  return { saved: true };
}

export async function resetTargetsOverride(): Promise<void> {
  const { supabase, user } = await getUserAndProfile();
  const { error } = await supabase.from("profiles").update({ targets_override: null }).eq("user_id", user.id);
  if (error) console.error("targets_override reset failed", error.code, error.message);
  revalidatePath("/targets");
}
