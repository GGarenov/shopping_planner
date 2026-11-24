"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getUserAndProfile } from "@/lib/profile/load";
import { errorKey, targetsOverrideSchema } from "@/lib/profile/schema";
import { requestLog } from "@/lib/requestLog";

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
  const t = await getTranslations("errors");
  const parsed = targetsOverrideSchema.safeParse(values);
  if (!parsed.success) return { error: t(errorKey(parsed.error.issues[0]?.message, "invalidValues")), values };

  const { supabase, user } = await getUserAndProfile();
  const { error } = await supabase.from("profiles").update({ targets_override: parsed.data }).eq("user_id", user.id);
  if (error) {
    (await requestLog({ action: "saveTargetsOverride" })).error("targets.save_failed", { code: error.code, err: new Error(error.message) });
    return { error: t("saveFailed"), values };
  }
  revalidatePath("/targets");
  return { saved: true };
}

export async function resetTargetsOverride(): Promise<void> {
  const { supabase, user } = await getUserAndProfile();
  const { error } = await supabase.from("profiles").update({ targets_override: null }).eq("user_id", user.id);
  if (error)
    (await requestLog({ action: "resetTargetsOverride" })).error("targets.reset_failed", {
      code: error.code,
      err: new Error(error.message),
    });
  revalidatePath("/targets");
}
