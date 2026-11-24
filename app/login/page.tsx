import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tc] = await Promise.all([getTranslations("login"), getTranslations("common")]);
  return { title: `${t("title")} · ${tc("appName")}` };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const [t, tc] = await Promise.all([getTranslations("login"), getTranslations("common")]);
  return (
    <main className="page justify-center">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="sr-only">{tc("appName")}</h1>
        <Logo size={56} tagline />
        <p className="opacity-80">{t("intro")}</p>
      </div>
      {deleted && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">
          {t("deleted")}
        </p>
      )}
      <LoginForm />
    </main>
  );
}
