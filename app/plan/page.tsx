import type { Metadata } from "next";
import { Hero } from "@/components/Hero";
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
          <Hero title="Седмичен план">
            <p className="text-white/90">
              Още нямаш план. Ще изберем закуска, обяд, вечеря и междинно хранене за 7 дни — всеки ден в твоите калории и
              протеин, в рамките на бюджета ти.
            </p>
          </Hero>
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
        <Hero title="Седмичен план" kicker={`${dates[0]} – ${dates[dates.length - 1]}`}>
          <section className="grid grid-cols-2 gap-2">
            <div className="flex flex-col rounded-2xl bg-sun px-3 py-2.5 text-sun-fg">
              <span className="text-xs font-semibold">Плащаш в eBag</span>
              <span className="text-xl font-extrabold tabular-nums">{eur(plan.checkout_eur)}</span>
              {budget != null && <span className="text-xs">бюджет {eur(budget)}</span>}
            </div>
            <div className="flex flex-col rounded-2xl bg-white/15 px-3 py-2.5">
              <span className="text-xs font-semibold text-white/85">Изяждаш тази седмица</span>
              <span className="text-xl font-extrabold tabular-nums">{eur(plan.eaten_eur)}</span>
              <span className="text-xs text-white/80">остатъкът остава за после</span>
            </div>
          </section>
        </Hero>

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
