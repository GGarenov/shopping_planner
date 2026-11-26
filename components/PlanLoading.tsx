"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { TeaserRecipe } from "@/lib/recipes/teaser";

/** First tile fills after FIRST_MS, then one every STEP_MS: the week is full in ~11 s, inside a typical run. */
const FIRST_MS = 1200;
const STEP_MS = 1700;
const MONDAY = Date.UTC(2026, 10, 23); // any Monday: only the weekday names are used

/**
 * Full screen while a plan is being made (docs/notes/issues.md, 3): seven empty
 * days fill one by one with a dish photo, the step text changes, and a bar fills. With «reduce motion» on, the
 * tiles still fill but nothing moves or pulses.
 */
export function PlanLoading({
  busy,
  step,
  note,
  recipes,
  seconds = 15,
}: {
  busy: boolean;
  /** The current step ("Избираме рецепти…"), from usePlanGenerator. */
  step: string;
  /** "up to ~15 s". */
  note: string;
  recipes: TeaserRecipe[];
  /** How long the bar takes to (almost) fill. */
  seconds?: number;
}) {
  const t = useTranslations("plan.generate");
  const locale = useLocale();
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    if (!busy) return;
    setFilled(0);
    const timers = Array.from({ length: 7 }, (_, k) => setTimeout(() => setFilled(k + 1), FIRST_MS + k * STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [busy]);

  if (!busy) return null;
  const weekday = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "bg-BG", { weekday: "long", timeZone: "UTC" });
  const days = Array.from({ length: 7 }, (_, k) => weekday.format(new Date(MONDAY + k * 86_400_000)));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background" role="status" aria-busy="true">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-6 text-center">
        <h2 className="text-2xl font-black">{t("loadingTitle")}</h2>
        <ul className="grid grid-cols-2 gap-2.5" aria-hidden>
          {days.map((day, k) => {
            const done = k < filled;
            const recipe = recipes[k];
            return (
              <li
                key={day}
                className={`relative grid aspect-video place-items-center overflow-hidden rounded-2xl border-2 bg-muted font-extrabold text-subtle last:col-span-2 last:aspect-[32/9] ${
                  done ? "border-accent" : `border-dashed border-border ${k === filled ? "motion-safe:animate-pulse" : ""}`
                }`}
              >
                {recipe && (
                  // eslint-disable-next-line @next/next/no-img-element -- small static photos, shown for seconds
                  <img
                    src={recipe.photo}
                    alt=""
                    className={`absolute inset-0 size-full object-cover motion-safe:transition motion-safe:duration-500 ${
                      done ? "scale-100 opacity-100" : "scale-110 opacity-0"
                    }`}
                  />
                )}
                <span
                  className={`capitalize ${done ? "absolute top-1.5 left-1.5 rounded-full bg-white/90 px-2.5 py-0.5 text-xs text-foreground" : "relative"}`}
                >
                  {day}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="min-h-7 text-lg font-bold text-accent" aria-live="polite">
          {step}
        </p>
        <div className="h-2.5 overflow-hidden rounded-full border border-border bg-muted">
          <div className="plan-loading-bar h-full rounded-full bg-sun" style={{ animationDuration: `${seconds}s` }} />
        </div>
        <p className="text-sm text-subtle">{note}</p>
      </div>
    </div>
  );
}
