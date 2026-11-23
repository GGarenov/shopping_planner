import type { Metadata } from "next";
import { Hero } from "@/components/Hero";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { getConnectionRow } from "@/lib/ebag/oauth";
import { getLatestPlan } from "@/lib/plans/load";
import { eur } from "@/lib/plans/shopping";
import { requireCompleteProfile } from "@/lib/profile/load";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { bgDate } from "@/lib/sync/status";
import { sofiaToday } from "@/lib/planner/week";
import { EbagConnected } from "./EbagConnected";

export const metadata: Metadata = { title: "eBag · Пазарен план" };

const ERRORS: Record<string, string> = {
  denied: "Не разреши достъп в eBag. Можеш да опиташ пак по всяко време.",
  state: "Свързването изтече или беше прекъснато. Опитай пак.",
  exchange: "eBag не потвърди връзката. Опитай пак след малко.",
  ebag: "eBag върна грешка. Опитай пак след малко.",
  start: "Не успяхме да се свържем с eBag. Опитай пак след малко.",
  disconnect: "Не успяхме да прекъснем връзката. Опитай пак.",
};

export default async function EbagPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireCompleteProfile();
  const q = await searchParams;
  const supabase = await createClient();
  const [row, plan] = await Promise.all([getConnectionRow(createAdminClient(), user.id), getLatestPlan(supabase)]);
  const connected = row?.status === "connected";
  const expired = !!row && !connected;

  return (
    <>
      <main className="page pb-24">
        <Hero title="eBag количка">
          <p className="text-white/90">Пращаме списъка за седмицата в твоята количка в eBag. Поръчваш и плащаш сам в eBag — ние не можем да поръчваме.</p>
        </Hero>

        {q.connected && <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">eBag профилът ти е свързан.</p>}
        {q.disconnected && <p className="rounded-xl border border-border px-4 py-3 text-sm" role="status">Връзката с eBag е прекъсната.</p>}
        {q.error && (
          <p className="error" role="alert">
            {ERRORS[q.error] ?? ERRORS.ebag}
          </p>
        )}

        {!connected && (
          <section className="card flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{expired ? "Връзката с eBag е изтекла" : "Свържи своя eBag профил"}</h2>
            <p className="text-sm opacity-80">
              Ще влезеш в eBag.bg и ще разрешиш на „Пазарен план“ да добавя продукти в количката ти. Паролата ти остава в eBag — ние
              пазим само ключ за достъп до количката, криптиран. Можеш да прекъснеш връзката по всяко време.
            </p>
            <a href="/api/ebag/connect" className="btn-primary">
              {expired ? "Свържи отново" : "Свържи eBag"}
            </a>
          </section>
        )}

        {connected && (
          <>
            <p className="text-sm opacity-70">Свързан от {bgDate(row.connected_at)}.</p>
            {!plan && (
              <section className="flex flex-col gap-3">
                <p className="opacity-80">Още нямаш план. Създай седмичен план и после го прати в количката.</p>
                <Link href="/plan" className="btn-primary">
                  Към плана
                </Link>
              </section>
            )}
            <EbagConnected
              today={sofiaToday()}
              plan={
                plan
                  ? {
                      id: plan.id,
                      ebagIds: plan.shopping.map((it) => it.ebag_id),
                      summary: `${plan.shopping.length} продукта · около ${eur(plan.checkout_eur)} по цени от ${plan.solver.prices_date ? bgDate(plan.solver.prices_date) : "днес"}`,
                    }
                  : null
              }
            />
          </>
        )}

        {row && (
          <form action="/api/ebag/disconnect" method="post" className="mt-auto border-t border-border pt-4">
            <button type="submit" className="btn-ghost w-full">
              Прекъсни връзката с eBag
            </button>
          </form>
        )}
      </main>
      <BottomNav />
    </>
  );
}
