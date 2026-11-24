"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { decryptJson } from "@/lib/crypto/secret";
import { getConnectionRow, revokeAtEbag, type UserConnection } from "@/lib/ebag/oauth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requestLog } from "@/lib/requestLog";

const feedbackInput = z.object({ message: z.string().trim().min(3).max(4000), page: z.string().max(200).optional() });

export async function sendFeedback(
  _prev: { ok?: boolean; error?: string } | null,
  form: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const parsed = feedbackInput.safeParse({ message: form.get("message"), page: form.get("page") ?? undefined });
  const t = await getTranslations("profile.feedback");
  if (!parsed.success) return { error: t("tooShort") };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: (await getTranslations("common"))("loginAgain") };
  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    message: parsed.data.message,
    page: parsed.data.page ?? null,
    user_agent: (await headers()).get("user-agent")?.slice(0, 300) ?? null,
  });
  if (error) {
    (await requestLog({ action: "sendFeedback" })).error("feedback.save_failed", { err: new Error(error.message) });
    return { error: t("failed") };
  }
  return { ok: true };
}

/**
 * Deletes the account and all its data (SPEC §9 GDPR): eBag access is revoked at eBag first, then the auth user is
 * deleted — profile, plans, shopping checks and eBag tokens go with it (foreign keys cascade).
 */
export async function deleteAccount(_prev: { error?: string } | null, form: FormData): Promise<{ error?: string }> {
  const t = await getTranslations("profile.delete");
  if (form.get("confirm") !== "yes") return { error: t("mustConfirm") };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  try {
    const row = await getConnectionRow(admin, user.id);
    if (row) await revokeAtEbag(decryptJson<UserConnection>(row.tokens_encrypted));
  } catch (e) {
    (await requestLog({ action: "deleteAccount" })).warn("account.ebag_revoke_failed", { err: String(e) });
  }
  await supabase.auth.signOut({ scope: "local" }); // clear this browser's session cookies first
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    (await requestLog({ action: "deleteAccount" })).error("account.delete_failed", { err: new Error(error.message) });
    return { error: t("failed") };
  }
  (await requestLog({ action: "deleteAccount" })).info("account.deleted", { user: user.id });
  redirect("/login?deleted=1");
}
