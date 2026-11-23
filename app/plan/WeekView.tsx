"use client";

import Link from "next/link";
import { useState } from "react";
import type { PlanDay } from "@/lib/planner/plan";
import { DAY_SHORT_BG as DAY_SHORT, SLOT_BG } from "@/lib/planner/labels";


export function WeekView({
  planId,
  days,
  dates,
  initialDay,
  kcalMin,
  kcalMax,
  proteinMin,
}: {
  planId: string;
  days: PlanDay[];
  dates: string[];
  initialDay: number;
  kcalMin: number;
  kcalMax: number;
  proteinMin: number;
}) {
  const [active, setActive] = useState(Math.min(initialDay, days.length - 1));
  const day = days[active]!;
  const kcalOk = day.kcal >= kcalMin && day.kcal <= kcalMax;
  const proteinOk = day.protein_g >= proteinMin;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Дни" className="grid grid-cols-7 gap-1">
        {days.map((d, i) => (
          <button
            key={d.day}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`${d.day} ${dates[i]}`}
            onClick={() => setActive(i)}
            className={`flex min-h-14 flex-col items-center justify-center rounded-xl text-sm ${
              i === active ? "bg-accent font-extrabold text-accent-fg shadow-sm" : "border border-border bg-muted"
            }`}
          >
            <span>{DAY_SHORT[i]}</span>
            <span className="text-xs opacity-80">{dates[i]}</span>
          </button>
        ))}
      </div>

      <section className="card flex flex-col gap-2" aria-label="Общо за деня">
        <h2 className="font-semibold">{day.day}</h2>
        <div className="grid grid-cols-4 gap-2 text-center text-sm">
          <Stat label="kcal" value={day.kcal} ok={kcalOk} />
          <Stat label="протеин" value={`${day.protein_g} г`} ok={proteinOk} />
          <Stat label="мазнини" value={`${day.fat_g} г`} />
          <Stat label="въглех." value={`${day.carbs_g} г`} />
        </div>
      </section>

      <ul className="flex flex-col gap-3">
        {day.meals.map((m) => (
          <li key={m.slot}>
            <Link href={`/plan/${planId}/${active}/${m.slot}`} className="card flex items-center gap-3 active:opacity-80">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="slot-tag" style={{ background: `var(--slot-${m.slot})`, color: `var(--slot-${m.slot}-fg)` }}>
                  {SLOT_BG[m.slot]}
                </span>
                <span className="font-bold leading-snug">{m.recipe}</span>
                <span className="text-sm opacity-70">
                  {Math.round(m.kcal)} kcal · {Math.round(m.protein_g)} г протеин
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
