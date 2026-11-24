"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUserAndProfile } from "@/lib/profile/load";
import { errorKey, profileInputSchema } from "@/lib/profile/schema";

export type SaveProfileResult = { error: string } | undefined;

export async function saveProfile(input: unknown): Promise<SaveProfileResult> {
  const t = await getTranslations("errors");
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) return { error: t(errorKey(parsed.error.issues[0]?.message)) };

  const { supabase, user, profile } = await getUserAndProfile();
  const fields: Omit<typeof parsed.data, "consent"> & { consent?: true } = { ...parsed.data };
  delete fields.consent; // consent is stored as options.consent_at, not a column
  const options = { ...(profile?.options ?? {}), consent_at: profile?.options?.consent_at ?? new Date().toISOString() };

  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, ...fields, options }, { onConflict: "user_id" });
  if (error) {
    console.error("profiles upsert failed", error.code, error.message);
    return { error: t("saveProfileFailed") };
  }
  redirect("/targets");
}
