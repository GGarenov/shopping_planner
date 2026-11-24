"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";

/** Switches the UI language: a cookie for this device, and the profile (options.lang) so it follows the user. */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data } = await supabase.from("profiles").select("options").eq("user_id", user.id).maybeSingle();
    if (data)
      await supabase
        .from("profiles")
        .update({ options: { ...(data.options ?? {}), lang: locale } })
        .eq("user_id", user.id);
  }
  revalidatePath("/", "layout");
}
