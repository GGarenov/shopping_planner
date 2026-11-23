"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; email?: string };

const credentials = z.object({
  email: z.email({ error: "Невалиден имейл адрес" }),
  password: z.string().min(1, { error: "Въведи парола" }),
});

const newAccount = credentials.extend({
  password: z.string().min(8, { error: "Паролата трябва да е поне 8 символа" }).max(72, { error: "Паролата е твърде дълга" }),
});

const read = (fd: FormData) => ({
  email: String(fd.get("email") ?? "").trim().toLowerCase(),
  password: String(fd.get("password") ?? ""),
});

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const input = read(formData);
  const parsed = credentials.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email: input.email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    console.error("signInWithPassword failed", error.status, error.code);
    const msg =
      error.code === "invalid_credentials"
        ? "Грешен имейл или парола."
        : error.code === "email_not_confirmed"
          ? "Акаунтът не е потвърден. Пиши ни от линка „Обратна връзка“."
          : error.status === 429
            ? "Твърде много опити. Изчакай малко и опитай пак."
            : "Не успяхме да те впишем. Опитай отново.";
    return { error: msg, email: input.email };
  }
  redirect("/");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const input = read(formData);
  const parsed = newAccount.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email: input.email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    console.error("signUp failed", error.status, error.code);
    const msg =
      error.code === "user_already_exists"
        ? "Вече има акаунт с този имейл. Влез от „Вход“."
        : error.code === "weak_password"
          ? "Паролата е твърде слаба. Избери по-дълга."
          : error.status === 429
            ? "Твърде много опити. Изчакай малко и опитай пак."
            : "Не успяхме да създадем акаунта. Опитай отново.";
    return { error: msg, email: input.email };
  }
  if (!data.session) {
    // "Confirm email" is still on in Supabase → no session until the email is confirmed.
    console.error("signUp returned no session — disable 'Confirm email' in Supabase Auth settings");
    return { error: "Акаунтът е създаден, но чака потвърждение. Пиши ни от „Обратна връзка“.", email: input.email };
  }
  redirect("/");
}
