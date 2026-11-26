import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Hero } from "@/components/Hero";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { getConnectionRow } from "@/lib/ebag/oauth";
import { getLatestPlan } from "@/lib/plans/load";
import { eur } from "@/lib/plans/shopping";
import { requireCompleteProfile } from "@/lib/profile/load";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { longDate } from "@/lib/i18n/format";
import { ingredientName } from "@/lib/i18n/content";
import { sofiaToday } from "@/lib/planner/week";
import { SaveAccount } from "@/components/SaveAccount";
import { accountStatus, isGuest } from "@/lib/auth/guest";
import { EbagConnected } from "./EbagConnected";

export async function generateMetadata(): Promise<Metadata> {
  const common = await getTranslations("common");
  return { title: `eBag · ${common("appName")}` };
}

const ERRORS = ["denied", "state", "exchange", "ebag", "start", "disconnect"] as const;

export default async function EbagPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireCompleteProfile();
  const q = await searchParams;
  const [t, locale] = await Promise.all([getTranslations("ebag"), getLocale()]);
  const errorKey = ERRORS.find((k) => k === q.error) ?? "ebag";
  const supabase = await createClient();
  const [row, plan] = await Promise.all([getConnectionRow(createAdminClient(), user.id), getLatestPlan(supabase)]);
  const guest = isGuest(user);
  const account = accountStatus(q.account);
  const connected = row?.status === "connected";
  const expired = !!row && !connected;

  return (
    <>
      <main className="page pb-24">
        <Hero title={t("heroTitle")}>
          <p className="text-white/90">{t("heroText")}</p>
        </Hero>

        {q.connected && (
          <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">
            {t("connectedNotice")}
          </p>
        )}
        {q.disconnected && (
          <p className="rounded-xl border border-border px-4 py-3 text-sm" role="status">
            {t("disconnectedNotice")}
          </p>
        )}
        {q.error && (
          <p className="error" role="alert">
            {t(`errors.${errorKey}`)}
          </p>
        )}

        {/* Only the "logged in, plan saved" notice up here; for a guest the save card comes after eBag. */}
        <SaveAccount guest={false} next="/ebag" variant="ebag" status={account} />

        {!connected && (
          <section className="card flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{expired ? t("expiredTitle") : t("connectTitle")}</h2>
            <p className="text-sm text-subtle">{t("connectText")}</p>
            <a href="/api/ebag/connect" className="btn-primary">
              {expired ? t("reconnectShort") : t("connect")}
            </a>
          </section>
        )}

        {connected && (
          <>
            <p className="text-sm text-subtle">{t("connectedSince", { date: longDate(row.connected_at, locale) })}</p>
            {!plan && (
              <section className="flex flex-col gap-3">
                <p className="text-subtle">{t("noPlan")}</p>
                <Link href="/plan" className="btn-primary">
                  {t("toPlan")}
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
                      ingredients: Object.fromEntries(
                        plan.shopping.map((it) => [it.ebag_id, ingredientName(it.ingredient_id, it.ingredient, locale)]),
                      ),
                      summary: t("summary", {
                        n: plan.shopping.length,
                        amount: eur(plan.checkout_eur, locale),
                        date: plan.solver.prices_date ? longDate(plan.solver.prices_date, locale) : t("today"),
                      }),
                    }
                  : null
              }
            />
          </>
        )}

        {/* Guests can use eBag too (docs/notes/issues.md, 2), but without a login it all goes after 3 days. */}
        <SaveAccount guest={guest} next="/ebag" variant="ebag" status={account === "failed" ? "failed" : null} />

        {row && (
          <form action="/api/ebag/disconnect" method="post" className="mt-auto border-t border-border pt-4">
            <button type="submit" className="btn-ghost w-full">
              {t("disconnect")}
            </button>
          </form>
        )}
      </main>
      <BottomNav />
    </>
  );
}
