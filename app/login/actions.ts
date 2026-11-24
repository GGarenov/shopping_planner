"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; email?: string };

// Messages are keys of the "login" namespace.
const credentials = z.object({
  email: z.email({ error: "invalidEmail" }),
  password: z.string().min(1, { error: "enterPassword" }),
});

const newAccount = credentials.extend({
  password: z.string().min(8, { error: "passwordMin" }).max(72, { error: "passwordTooLong" }),
});

const LOGIN_KEYS = ["invalidEmail", "enterPassword", "passwordMin", "passwordTooLong"] as const;
type LoginKey = (typeof LOGIN_KEYS)[number];
const validationKey = (m: string | undefined): LoginKey =>
  (LOGIN_KEYS as readonly string[]).includes(m ?? "") ? (m as LoginKey) : "invalidEmail";

const read = (fd: FormData) => ({
  email: String(fd.get("email") ?? "")
    .trim()
    .toLowerCase(),
  password: String(fd.get("password") ?? ""),
});

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const t = await getTranslations("login");
  const input = read(formData);
  const parsed = credentials.safeParse(input);
  if (!parsed.success) return { error: t(validationKey(parsed.error.issues[0]?.message)), email: input.email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    console.error("signInWithPassword failed", error.status, error.code);
    const msg =
      error.code === "invalid_credentials"
        ? t("invalidCredentials")
        : error.code === "email_not_confirmed"
          ? t("emailNotConfirmed")
          : error.status === 429
            ? t("tooManyAttempts")
            : t("signInFailed");
    return { error: msg, email: input.email };
  }
  // The language chosen earlier (profiles.options.lang) follows the user to this device.
  if (data.user) {
    const { data: profile } = await supabase.from("profiles").select("options").eq("user_id", data.user.id).maybeSingle();
    const lang = (profile?.options as { lang?: unknown } | null)?.lang;
    if (isLocale(lang)) (await cookies()).set(LOCALE_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  redirect("/");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const t = await getTranslations("login");
  const input = read(formData);
  const parsed = newAccount.safeParse(input);
  if (!parsed.success) return { error: t(validationKey(parsed.error.issues[0]?.message)), email: input.email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    console.error("signUp failed", error.status, error.code);
    const msg =
      error.code === "user_already_exists"
        ? t("userExists")
        : error.code === "weak_password"
          ? t("weakPassword")
          : error.status === 429
            ? t("tooManyAttempts")
            : t("signUpFailed");
    return { error: msg, email: input.email };
  }
  if (!data.session) {
    // "Confirm email" is still on in Supabase → no session until the email is confirmed.
    console.error("signUp returned no session — disable 'Confirm email' in Supabase Auth settings");
    return { error: t("awaitingConfirmation"), email: input.email };
  }
  redirect("/");
}
