import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isComplete, type CompleteProfile, type ProfileRow } from "./schema";

/** Logged-in user + their profile row (or null). Redirects to /login when logged out. */
export async function getUserAndProfile() {
  const res = await getOptionalUserAndProfile();
  if (!res.user) redirect("/login");
  return res as typeof res & { user: NonNullable<typeof res.user> };
}

/** Like getUserAndProfile, but logged out is fine (user and profile null): onboarding works before any account. */
export async function getOptionalUserAndProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };

  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error(`profiles select failed: ${error.message}`);

  const profile = data
    ? ({
        ...data,
        weight_kg: data.weight_kg == null ? null : Number(data.weight_kg),
        budget_eur: data.budget_eur == null ? null : Number(data.budget_eur),
        options: data.options ?? {},
      } as ProfileRow)
    : null;

  return { supabase, user, profile };
}

/** For pages that need a finished onboarding; sends the user to /onboarding otherwise. */
export async function requireCompleteProfile(): Promise<{ user: { id: string; email?: string }; profile: CompleteProfile }> {
  const { user, profile } = await getUserAndProfile();
  if (!isComplete(profile)) redirect("/onboarding");
  return { user, profile };
}
