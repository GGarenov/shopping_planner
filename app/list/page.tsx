import type { Metadata } from "next";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { PricesNotice } from "@/components/PricesNotice";
import { shortDate, sofiaToday } from "@/lib/planner/week";
import { getSyncStatus } from "@/lib/sync/status";
import { getLatestPlan, getPlan } from "@/lib/plans/load";
import { groupByAisle, shoppingTotals } from "@/lib/plans/shopping";
import { PANTRY_OPTIONS } from "@/lib/profile/options";
import { requireCompleteProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";
import { ShoppingList } from "./ShoppingList";

export const metadata: Metadata = { title: "Списък за пазаруване · Пазарен план" };

export default async function ListPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
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
          <h1 className="text-2xl font-bold">Списък за пазаруване</h1>
          <p className="opacity-80">Списъкът се прави заедно с плана. Първо създай седмичен план.</p>
          <Link href="/plan" className="btn-primary">
            Към плана
          </Link>
        </main>
        <BottomNav />
      </>
    );
  }

  const { data: checks, error } = await supabase.from("shopping_checks").select("ebag_id, checked").eq("plan_id", plan.id);
  if (error) console.error("list: loading checks failed", error.message);
  const checked = (checks ?? []).filter((c) => c.checked).map((c) => Number(c.ebag_id));

  const totals = shoppingTotals(plan.shopping);
  const pantryLabels = (plan.solver.pantry ?? []).map((id) => PANTRY_OPTIONS.find((p) => p.value === id)?.label ?? id);
  const days = plan.plan.length;

  return (
    <>
      <main className="page pb-24">
        <header className="flex flex-col gap-1">
          <p className="text-sm opacity-70">
            Седмица {shortDate(plan.week_start, 0)} – {shortDate(plan.week_start, days - 1)}
          </p>
          <h1 className="text-2xl font-bold">Списък за пазаруване</h1>
        </header>

        {isOld ? (
          <p className="rounded-xl border border-border px-4 py-3 text-sm" role="status">
            Списък от по-стар план.{" "}
            <Link href="/list" className="font-semibold underline">
              Към текущия списък
            </Link>
          </p>
        ) : (
          <>
            <PricesNotice planPricesDate={plan.solver.prices_date} latestPricesDate={sync.pricesDate} today={sofiaToday()} />
            <Link href="/ebag" className="btn-primary">
              Изпрати в eBag количката
            </Link>
          </>
        )}

        <ShoppingList planId={plan.id} groups={groupByAisle(plan.shopping)} totals={totals} initialChecked={checked} />

        <footer className="flex flex-col gap-2 border-t border-border pt-4 text-sm opacity-70">
          {pantryLabels.length > 0 && <p>Не купуваме, защото ги имаш вкъщи: {pantryLabels.join(", ")}.</p>}
          <p>
            Купуваш цели опаковки, затова плащаш повече, отколкото изяждаш за седмицата — остатъкът остава за после.
          </p>
          {plan.solver.prices_date && <p>Цени от {plan.solver.prices_date.split("-").reverse().join(".")} — в eBag може да са се променили.</p>}
        </footer>
      </main>
      <BottomNav />
    </>
  );
}
