"use server";

import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/profile/load";
import { profileInputSchema } from "@/lib/profile/schema";

export type SaveProfileResult = { error: string } | undefined;

export async function saveProfile(input: unknown): Promise<SaveProfileResult> {
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Невалидни данни" };

  const { supabase, user, profile } = await getUserAndProfile();
  const fields: Omit<typeof parsed.data, "consent"> & { consent?: true } = { ...parsed.data };
  delete fields.consent; // consent is stored as options.consent_at, not a column
  const options = { ...(profile?.options ?? {}), consent_at: profile?.options?.consent_at ?? new Date().toISOString() };

  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, ...fields, options }, { onConflict: "user_id" });
  if (error) {
    console.error("profiles upsert failed", error.code, error.message);
    return { error: "Не успяхме да запазим данните. Опитай отново." };
  }
  redirect("/targets");
}
