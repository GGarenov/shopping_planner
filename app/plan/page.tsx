import type { Metadata } from "next";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { PricesNotice } from "@/components/PricesNotice";
import { shortDate, sofiaToday, todayIndexInWeek } from "@/lib/planner/week";
import { getSyncStatus } from "@/lib/sync/status";
import { getLatestPlan, getPlan } from "@/lib/plans/load";
import { requireCompleteProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";
import { GeneratePlanButton } from "./GeneratePlanButton";
import { WeekView } from "./WeekView";

export const metadata: Metadata = { title: "Седмичен план · Пазарен план" };

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  await requireCompleteProfile();
  const supabase = await createClient();
  const [latest, sync] = await Promise.all([getLatestPlan(supabase), getSyncStatus(supabase)]);
  const plan = (id && id !== latest?.id ? await getPlan(supabase, id) : null) ?? latest;
  const isOld = !!plan && plan.id !== latest?.id;

  if (!plan) {
    return (
      <>
        <main className="page pb-24">
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Седмичен план</h1>
            <p className="opacity-80">
              Още нямаш план. Ще изберем закуска, обяд, вечеря и междинно хранене за 7 дни — всеки ден в твоите калории и
              протеин, в рамките на бюджета ти.
            </p>
          </header>
          <GeneratePlanButton />
        </main>
        <BottomNav />
      </>
    );
  }

  const dates = plan.plan.map((_, i) => shortDate(plan.week_start, i));
  const budget = plan.solver.budget_eur;

  return (
    <>
      <main className="page pb-24">
        <header className="flex flex-col gap-1">
          <p className="text-sm opacity-70">
            Седмица {dates[0]} – {dates[dates.length - 1]}
          </p>
          <h1 className="text-2xl font-bold">Седмичен план</h1>
        </header>

        {isOld ? (
          <p className="rounded-xl border border-border px-4 py-3 text-sm" role="status">
            Това е по-стар план.{" "}
            <Link href="/plan" className="font-semibold underline">
              Към текущия план
            </Link>
          </p>
        ) : (
          <PricesNotice planPricesDate={plan.solver.prices_date} latestPricesDate={sync.pricesDate} today={sofiaToday()} />
        )}

        <section className="grid grid-cols-2 gap-3">
          <div className="card flex flex-col">
            <span className="text-sm opacity-70">Плащаш в eBag</span>
            <span className="text-xl font-bold tabular-nums">{eur(plan.checkout_eur)}</span>
            {budget != null && <span className="text-xs opacity-60">бюджет {eur(budget)}</span>}
          </div>
          <div className="card flex flex-col">
            <span className="text-sm opacity-70">Изяждаш тази седмица</span>
            <span className="text-xl font-bold tabular-nums">{eur(plan.eaten_eur)}</span>
            <span className="text-xs opacity-60">остатъкът остава за после</span>
          </div>
        </section>

        <Link href={isOld ? `/list?id=${plan.id}` : "/list"} className="btn-primary">
          Списък за пазаруване
        </Link>

        <WeekView
          planId={plan.id}
          days={plan.plan}
          dates={dates}
          initialDay={todayIndexInWeek(plan.week_start)}
          kcalMin={plan.targets.kcal_min}
          kcalMax={plan.targets.kcal_max}
          proteinMin={plan.targets.protein_min}
        />

        <footer className="flex flex-col gap-2 border-t border-border pt-4">
          {!isOld && (
            <Link href="/plan/new" className="btn-secondary">
              Нов план
            </Link>
          )}
          {plan.solver.prices_date && (
            <p className="text-center text-xs opacity-60">Цени от {plan.solver.prices_date.split("-").reverse().join(".")}</p>
          )}
        </footer>
      </main>
      <BottomNav />
    </>
  );
}
