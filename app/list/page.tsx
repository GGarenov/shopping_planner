import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Hero } from "@/components/Hero";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { PricesNotice } from "@/components/PricesNotice";
import { sofiaToday } from "@/lib/planner/week";
import { longDate, shortDay } from "@/lib/i18n/format";
import { ingredientName } from "@/lib/i18n/content";
import { getSyncStatus } from "@/lib/sync/status";
import { getLatestPlan, getPlan } from "@/lib/plans/load";
import { groupByAisle, shoppingTotals } from "@/lib/plans/shopping";
import { PANTRY_OPTIONS } from "@/lib/profile/options";
import { requireCompleteProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";
import { ShoppingList } from "./ShoppingList";
import { requestLog } from "@/lib/requestLog";

export async function generateMetadata(): Promise<Metadata> {
  const [t, common] = await Promise.all([getTranslations("list"), getTranslations("common")]);
  return { title: `${t("title")} · ${common("appName")}` };
}

export default async function ListPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const [t, locale] = await Promise.all([getTranslations("list"), getLocale()]);
  await requireCompleteProfile();
  const supabase = await createClient();
  const [latest, sync] = await Promise.all([getLatestPlan(supabase), getSyncStatus(supabase)]);
  const plan = (id && id !== latest?.id ? await getPlan(supabase, id) : null) ?? latest;
  const isOld = !!plan && plan.id !== latest?.id;

  if (!plan) {
    return (
      <>
        <main className="page pb-24">
          <Hero title={t("title")} />
          <p className="text-subtle">{t("emptyText")}</p>
          <Link href="/plan" className="btn-primary">
            {t("toPlan")}
          </Link>
        </main>
        <BottomNav />
      </>
    );
  }

  const { data: checks, error } = await supabase.from("shopping_checks").select("ebag_id, checked").eq("plan_id", plan.id);
  if (error) (await requestLog({ page: "/list" })).error("list.load_checks_failed", { err: new Error(error.message) });
  const checked = (checks ?? []).filter((c) => c.checked).map((c) => Number(c.ebag_id));

  const totals = shoppingTotals(plan.shopping);
  const pantryLabels = (plan.solver.pantry ?? []).map((id) =>
    ingredientName(id, PANTRY_OPTIONS.find((p) => p.value === id)?.label ?? id, locale),
  );
  const days = plan.plan.length;

  return (
    <>
      <main className="page pb-24">
        <Hero title={t("title")} kicker={`${shortDay(plan.week_start, 0, locale)} – ${shortDay(plan.week_start, days - 1, locale)}`} />

        {isOld ? (
          <p className="rounded-xl border border-border px-4 py-3 text-sm" role="status">
            {t("oldPlan")}{" "}
            <Link href="/list" className="font-semibold underline">
              {t("toCurrent")}
            </Link>
          </p>
        ) : (
          <>
            <PricesNotice planPricesDate={plan.solver.prices_date} latestPricesDate={sync.pricesDate} today={sofiaToday()} />
            <Link href="/ebag" className="btn-primary">
              {t("sendToEbag")}
            </Link>
          </>
        )}

        <ShoppingList planId={plan.id} groups={groupByAisle(plan.shopping)} totals={totals} initialChecked={checked} />

        <footer className="flex flex-col gap-2 border-t border-border pt-4 text-sm text-subtle">
          {pantryLabels.length > 0 && <p>{t("pantryNote", { items: pantryLabels.join(", ") })}</p>}
          <p>{t("packsNote")}</p>
          {plan.solver.prices_date && <p>{t("pricesNote", { date: longDate(plan.solver.prices_date, locale) })}</p>}
        </footer>
      </main>
      <BottomNav />
    </>
  );
}
