"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions/locale";
import { LOCALES } from "@/lib/i18n/config";

const LABEL: Record<string, string> = { bg: "БГ", en: "EN" };
const NAME: Record<string, string> = { bg: "Български", en: "English" };

/** «БГ | EN» switch. `tone="light"` on the turquoise header, `"dark"` on light backgrounds. */
export function LanguageToggle({ tone = "dark" }: { tone?: "light" | "dark" }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const base = tone === "light" ? "bg-white/15 text-white" : "bg-muted text-foreground border border-border";
  const on = tone === "light" ? "bg-white text-accent" : "bg-accent text-accent-fg";
  return (
    <div
      role="group"
      aria-label="Език / Language"
      className={`inline-flex shrink-0 rounded-full p-0.5 text-xs font-extrabold ${base} ${pending ? "opacity-60" : ""}`}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          disabled={pending}
          onClick={() =>
            locale !== l &&
            start(async () => {
              await setLocale(l);
              router.refresh();
            })
          }
          className={`min-h-8 min-w-10 rounded-full px-2.5 ${locale === l ? on : ""}`}
        >
          {/* Accessible name «EN English»: starts with the visible text, so voice control («click EN») works too. */}
          {LABEL[l]} <span className="sr-only">{NAME[l]}</span>
        </button>
      ))}
    </div>
  );
}
