import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Logo } from "@/components/Logo";
import { SocialButtons } from "@/components/SocialButtons";
import { accountStatus, isGuest } from "@/lib/auth/guest";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tc] = await Promise.all([getTranslations("login"), getTranslations("common")]);
  return { title: `${t("title")} · ${tc("appName")}` };
}

/**
 * For people who already have an account (new people start with the questions — middleware sends them there).
 * Google on top, email and password below for the accounts made before. A guest who comes here keeps
 * their plan: Google is linked to them, and an email sign-in takes their data along (actions.ts).
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ deleted?: string; account?: string }> }) {
  const { deleted, account } = await searchParams;
  const [t, tc] = await Promise.all([getTranslations("login"), getTranslations("common")]);
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  const guest = isGuest(user);
  return (
    <main className="page justify-center">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="sr-only">{tc("appName")}</h1>
        <Logo size={56} tagline />
        <p className="text-subtle">{t("intro")}</p>
      </div>
      {deleted && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">
          {t("deleted")}
        </p>
      )}

      <SocialButtons mode={guest ? "link" : "signIn"} next="/" failed={accountStatus(account) === "failed"} />

      <div className="flex items-center gap-3 text-sm text-subtle" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        {t("orEmail")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <LoginForm />

      <Link href="/onboarding" className="btn-ghost self-center text-accent">
        {t("noAccount")}
      </Link>
    </main>
  );
}
