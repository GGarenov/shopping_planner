"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PlanDay } from "@/lib/planner/plan";
import { dayLongKey, dayShortKey, slotKey } from "@/lib/planner/labels";
import { recipeName } from "@/lib/i18n/content";

export function WeekView({
  planId,
  days,
  dates,
  initialDay,
  kcalMin,
  kcalMax,
  proteinMin,
  photos = {},
}: {
  planId: string;
  days: PlanDay[];
  dates: string[];
  initialDay: number;
  kcalMin: number;
  kcalMax: number;
  proteinMin: number;
  /** recipe id → small photo URL */
  photos?: Record<string, string>;
}) {
  const t = useTranslations("plan");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [active, setActive] = useState(Math.min(initialDay, days.length - 1));
  const day = days[active]!;
  const kcalOk = day.kcal >= kcalMin && day.kcal <= kcalMax;
  const proteinOk = day.protein_g >= proteinMin;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={t("week.days")} className="grid grid-cols-7 gap-1">
        {days.map((d, i) => (
          <button
            key={d.day}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`${t(dayLongKey(i))} ${dates[i]}`}
            onClick={() => setActive(i)}
            className={`flex min-h-14 flex-col items-center justify-center rounded-xl text-sm ${
              i === active ? "bg-accent font-extrabold text-accent-fg shadow-sm" : "border border-border bg-muted"
            }`}
          >
            <span>{t(dayShortKey(i))}</span>
            <span className="text-xs opacity-80">{dates[i]}</span>
          </button>
        ))}
      </div>

      <section className="card flex flex-col gap-2" aria-label={t("week.dayTotals")}>
        <h2 className="font-semibold">{t(dayLongKey(active))}</h2>
        <div className="grid grid-cols-4 gap-2 text-center text-sm">
          <Stat label={tc("kcal")} value={day.kcal} ok={kcalOk} />
          <Stat label={tc("protein")} value={tc("grams", { n: String(day.protein_g) })} ok={proteinOk} />
          <Stat label={tc("fat")} value={tc("grams", { n: String(day.fat_g) })} />
          <Stat label={tc("carbs")} value={tc("grams", { n: String(day.carbs_g) })} />
        </div>
      </section>

      <ul className="flex flex-col gap-3">
        {day.meals.map((m) => (
          <li key={m.slot}>
            <Link href={`/plan/${planId}/${active}/${m.slot}`} className="card flex items-center gap-3 p-3 active:opacity-80">
              <MealThumb src={photos[m.recipe_id]} slot={m.slot} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="slot-tag" style={{ background: `var(--slot-${m.slot})`, color: `var(--slot-${m.slot}-fg)` }}>
                  {t(slotKey(m.slot))}
                </span>
                <span className="leading-snug font-bold">{recipeName(m.recipe_id, m.recipe, locale)}</span>
                <span className="text-sm opacity-70">
                  {t("week.mealLine", { kcal: String(Math.round(m.kcal)), protein: String(Math.round(m.protein_g)) })}
                </span>
              </div>
              <span aria-hidden className="text-xl opacity-40">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: string | number; ok?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-base font-semibold tabular-nums">
        {value}
        {ok !== undefined && <span className={ok ? "text-accent" : "text-danger"}>{ok ? " ✓" : " !"}</span>}
      </span>
      <span className="text-xs opacity-60">{label}</span>
    </div>
  );
}

/** Recipe photo, or a soft plate icon in the meal's colour when there is none. */
function MealThumb({ src, slot }: { src?: string; slot: string }) {
  if (src)
    return (
      // Pre-sized WebP from public/recipes (400 px) — no Next image optimisation needed.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={72} height={72} loading="lazy" className="size-[72px] shrink-0 rounded-xl object-cover" />
    );
  return (
    <span
      aria-hidden
      className="flex size-[72px] shrink-0 items-center justify-center rounded-xl"
      style={{ background: `var(--slot-${slot})`, color: `var(--slot-${slot}-fg)` }}
    >
      <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="13" r="6.5" />
        <path d="M3 4v6M5.5 4v6M3 7h2.5M21 4c-1.5 1-2 2.5-2 5h2V4Z" />
      </svg>
    </span>
  );
}
