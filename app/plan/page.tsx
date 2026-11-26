import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Hero } from "@/components/Hero";
import { smallPhotos } from "@/lib/recipes/images";
import { teaserRecipes } from "@/lib/recipes/teaser";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { PricesNotice } from "@/components/PricesNotice";
import { eur, longDate, shortDay } from "@/lib/i18n/format";
import { sofiaToday, todayIndexInWeek } from "@/lib/planner/week";
import { getSyncStatus } from "@/lib/sync/status";
import { getLatestPlan, getPlan } from "@/lib/plans/load";
import { requireCompleteProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";
import { SaveAccount } from "@/components/SaveAccount";
import { accountStatus, isGuest } from "@/lib/auth/guest";
import { GeneratePlanButton } from "./GeneratePlanButton";
import { WeekView } from "./WeekView";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tc] = await Promise.all([getTranslations("plan"), getTranslations("common")]);
  return { title: `${t("title")} · ${tc("appName")}` };
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ id?: string; account?: string }> }) {
  const { id, account } = await searchParams;
  const [t, tc, locale] = await Promise.all([getTranslations("plan"), getTranslations("common"), getLocale()]);
  const { user } = await requireCompleteProfile();
  const saveAccount = <SaveAccount guest={isGuest(user)} next="/plan" variant="plan" status={accountStatus(account)} />;
  const supabase = await createClient();
  const [latest, sync] = await Promise.all([getLatestPlan(supabase), getSyncStatus(supabase)]);
  const plan = (id && id !== latest?.id ? await getPlan(supabase, id) : null) ?? latest;
  const isOld = !!plan && plan.id !== latest?.id;

  if (!plan) {
    return (
      <>
        <main className="page pb-24">
          <Hero title={t("title")}>
            <p className="text-white/90">{t("empty")}</p>
          </Hero>
          <GeneratePlanButton teaser={teaserRecipes(locale)} />
          {saveAccount}
        </main>
        <BottomNav />
      </>
    );
  }

  const dates = plan.plan.map((_, i) => shortDay(plan.week_start, i, locale));
  const budget = plan.solver.budget_eur;

  return (
    <>
      <main className="page pb-24">
        <Hero title={t("title")} kicker={`${dates[0]} – ${dates[dates.length - 1]}`}>
          <section className="grid grid-cols-2 gap-2">
            <div className="flex flex-col rounded-2xl bg-sun px-3 py-2.5 text-sun-fg">
              <span className="text-xs font-semibold">{t("youPay")}</span>
              <span className="text-xl font-extrabold tabular-nums">{eur(plan.checkout_eur, locale)}</span>
              {budget != null && (
                <span className="text-xs">
                  {t("budget", { amount: eur(budget, locale) })}
                  {plan.checkout_eur > budget && <>{t("overBudget", { amount: eur(plan.checkout_eur - budget, locale) })}</>}
                </span>
              )}
            </div>
            <div className="flex flex-col rounded-2xl bg-white/15 px-3 py-2.5">
              <span className="text-xs font-semibold text-white/85">{t("youEat")}</span>
              <span className="text-xl font-extrabold tabular-nums">{eur(plan.eaten_eur, locale)}</span>
              <span className="text-xs text-white/80">{t("restForLater")}</span>
            </div>
          </section>
        </Hero>

        {isOld ? (
          <p className="rounded-xl border border-border px-4 py-3 text-sm" role="status">
            {t("oldPlan")}{" "}
            <Link href="/plan" className="font-semibold underline">
              {t("toCurrent")}
            </Link>
          </p>
        ) : (
          <PricesNotice planPricesDate={plan.solver.prices_date} latestPricesDate={sync.pricesDate} today={sofiaToday()} />
        )}

        {saveAccount}

        <Link href={isOld ? `/list?id=${plan.id}` : "/list"} className="btn-primary">
          {t("shoppingList")}
        </Link>

        <WeekView
          planId={plan.id}
          days={plan.plan}
          dates={dates}
          initialDay={todayIndexInWeek(plan.week_start)}
          kcalMin={plan.targets.kcal_min}
          kcalMax={plan.targets.kcal_max}
          proteinMin={plan.targets.protein_min}
          photos={smallPhotos(plan.plan.flatMap((d) => d.meals.map((m) => m.recipe_id)))}
        />

        <footer className="flex flex-col gap-2 border-t border-border pt-4">
          {!isOld && (
            <Link href="/plan/new" className="btn-secondary">
              {t("newPlan")}
            </Link>
          )}
          {plan.solver.prices_date && (
            <p className="text-center text-xs text-subtle">{tc("pricesFrom", { date: longDate(plan.solver.prices_date, locale) })}</p>
          )}
        </footer>
      </main>
      <BottomNav />
    </>
  );
}
