"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  | { step: "email"; error?: string; email?: string }
  | { step: "code"; email: string; error?: string; info?: string };

const emailSchema = z.email({ error: "Невалиден имейл адрес" });

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : (process.env.APP_BASE_URL ?? "http://localhost:3000");
}

export async function sendLoginEmail(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { step: "email", error: "Невалиден имейл адрес", email: String(formData.get("email") ?? "") };
  const email = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${await siteOrigin()}/auth/callback` },
  });
  if (error) {
    console.error("signInWithOtp failed", error.status, error.code, error.message);
    const msg =
      error.status === 429
        ? "Твърде много опити. Изчакай малко и опитай пак."
        : "Не успяхме да изпратим имейла. Опитай отново след малко.";
    return { step: "email", error: msg, email };
  }
  return { step: "code", email, info: `Изпратихме имейл на ${email}.` };
}

export async function verifyLoginCode(prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = prev.step === "code" ? prev.email : String(formData.get("email") ?? "");
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (token.length < 6) return { step: "code", email, error: "Въведи кода от имейла" };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    console.error("verifyOtp failed", error.status, error.code, error.message);
    return { step: "code", email, error: "Кодът е грешен или изтекъл. Поискай нов." };
  }
  redirect("/");
}
