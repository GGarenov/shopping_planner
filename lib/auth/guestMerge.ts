// A guest signs in with a Google/Facebook account that already exists here: Supabase can't link it to the guest
// (identity_already_exists), so the user signs in to that account instead and the guest's data follows them.
// The guest's ID travels between the two redirects in a short-lived, encrypted (AES-GCM: tamper-proof) cookie.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptJson, encryptJson } from "@/lib/crypto/secret";

export const MERGE_COOKIE = "guest_merge";
const MAX_AGE_S = 10 * 60;

export const mergeCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const, // read on the top-level redirect back from Google
  path: "/auth",
  maxAge: MAX_AGE_S,
};

/** The row without its own ID and timestamps: the copy gets new ones. */
const omit = (row: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));

export function sealGuest(guestId: string): string {
  return encryptJson({ guestId, exp: Date.now() + MAX_AGE_S * 1000 });
}

export function openGuest(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const v = decryptJson<{ guestId: string; exp: number }>(value);
    return v.exp > Date.now() ? v.guestId : null;
  } catch {
    return null;
  }
}

/**
 * Moves a guest's profile and latest plan to an existing account, then deletes the guest.
 * Only when the account has no profile yet: an account's own data always wins over a guest's.
 * Only from anonymous users (checked here, not trusted from the cookie). Returns what happened, for the log.
 */
export async function mergeGuestInto(admin: SupabaseClient, guestId: string, userId: string): Promise<"merged" | "kept" | "skipped"> {
  if (guestId === userId) return "skipped";
  const { data: guest } = await admin.auth.admin.getUserById(guestId);
  if (!guest.user?.is_anonymous) return "skipped";

  const { data: own } = await admin.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
  let result: "merged" | "kept" = "kept";
  if (!own) {
    const { data: profile } = await admin.from("profiles").select("*").eq("user_id", guestId).maybeSingle();
    if (profile) {
      const { error } = await admin.from("profiles").insert({ ...omit(profile, ["created_at", "updated_at"]), user_id: userId });
      if (error) throw new Error(`guest merge: profile insert failed: ${error.message}`);
      result = "merged";
    }
    const { data: plan } = await admin
      .from("plans")
      .select("*")
      .eq("user_id", guestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (plan) {
      const { error } = await admin.from("plans").insert({ ...omit(plan, ["id", "created_at"]), user_id: userId });
      if (error) throw new Error(`guest merge: plan insert failed: ${error.message}`);
    }
  }
  // The guest is no longer needed either way (cascades to its profile, plans and ticks).
  await admin.auth.admin.deleteUser(guestId);
  return result;
}
