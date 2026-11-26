import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Logo } from "@/components/Logo";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tc] = await Promise.all([getTranslations("welcome"), getTranslations("common")]);
  return { title: `${t("title")} · ${tc("appName")}` };
}

const POINTS = ["menu", "goals", "healthy", "list", "delivery"] as const;

/**
 * The start page for people who are not signed in (middleware sends "/" here): what the app does, in big type,
 * and one button to the questions. People with an account sign in from the link below.
 */
export default async function WelcomePage() {
  const t = await getTranslations("welcome");
  return (
    <main className="page">
      <header className="hero pb-14">
        <div className="flex items-center justify-between gap-3">
          <Logo size={30} tone="light" />
          <LanguageToggle tone="light" />
        </div>
        <h1 className="pt-3 text-3xl leading-tight font-black">
          {t.rich("headline", { em: (s) => <em className="text-sun not-italic">{s}</em> })}
        </h1>
      </header>

      <ul className="card -mt-14 flex flex-col gap-3 text-lg font-bold">
        {POINTS.map((p) => (
          <li key={p} className="flex items-center gap-3">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-base text-accent-fg">
              ✓
            </span>
            {t(`points.${p}`)}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-3">
        <Link href="/onboarding" className="btn-primary min-h-16 text-xl">
          {t("start")}
        </Link>
        <p className="text-center text-sm text-subtle">{t("note")}</p>
        <Link href="/login" className="btn-ghost self-center font-bold text-accent underline">
          {t("haveAccount")}
        </Link>
      </div>
    </main>
  );
}
