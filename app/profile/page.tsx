import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Hero } from "@/components/Hero";
import { InstallButton } from "@/components/InstallButton";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { getConnectionRow } from "@/lib/ebag/oauth";
import { resolveTargets } from "@/lib/planner/targets";
import { listPlans } from "@/lib/plans/load";
import { eur, shortDay } from "@/lib/i18n/format";
import { requireCompleteProfile } from "@/lib/profile/load";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { FeedbackForm } from "./FeedbackForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("profile");
  return { title: t("metaTitle") };
}

/** bg "23.11, 17:39", en "23 Nov, 17:39". */
const created = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "bg-BG", {
    timeZone: "Europe/Sofia",
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export default async function ProfilePage() {
  const { user, profile } = await requireCompleteProfile();
  const [t, tc, to, locale] = await Promise.all([getTranslations("profile"), getTranslations("common"), getTranslations("options"), getLocale()]);
  const supabase = await createClient();
  const [plans, ebag] = await Promise.all([listPlans(supabase, 20), getConnectionRow(createAdminClient(), user.id)]);
  const targets = resolveTargets(
    {
      sex: profile.sex,
      age: profile.age,
      height_cm: profile.height_cm,
      weight_kg: profile.weight_kg,
      activity: profile.activity,
      goal: profile.goal,
      kcal_tolerance: profile.options.kcal_tolerance,
    },
    profile.targets_override,
  );
  const goal = to(`goal.${profile.goal}.label`);

  return (
    <>
      <main className="page pb-24">
        <Hero title={t("title")}>
          <p className="text-sm break-all text-white/85">{user.email}</p>
        </Hero>

        <InstallButton variant="banner" />

        <section className="flex flex-col gap-2">
          <Link href="/targets" className="card flex items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="font-semibold">{t("goalsTitle")}</span>
              <span className="text-sm opacity-70">
                {t("goalsSummary", { goal, min: String(targets.kcal_min), max: String(targets.kcal_max), protein: String(targets.protein_min) })}
              </span>
            </span>
            <span aria-hidden>›</span>
          </Link>
          <Link href="/onboarding" className="card flex items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="font-semibold">{t("detailsTitle")}</span>
              <span className="text-sm opacity-70">
                {t("detailsSummary", { weight: String(profile.weight_kg), height: String(profile.height_cm), budget: eur(profile.budget_eur, locale) })}
              </span>
            </span>
            <span aria-hidden>›</span>
          </Link>
          <Link href="/ebag" className="card flex items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="font-semibold">eBag</span>
              <span className="text-sm opacity-70">{ebag?.status === "connected" ? t("ebagConnected") : ebag ? t("ebagExpired") : t("ebagNotConnected")}</span>
            </span>
            <span aria-hidden>›</span>
          </Link>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="plans-title">
          <h2 id="plans-title" className="text-lg font-semibold">
            {t("plansTitle")}
          </h2>
          {plans.length === 0 ? (
            <p className="text-sm opacity-70">{t("noPlans")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {plans.map((p, i) => (
                <li key={p.id}>
                  <Link href={i === 0 ? "/plan" : `/plan?id=${p.id}`} className="card flex items-center justify-between gap-3">
                    <span className="flex flex-col">
                      <span className="font-medium">
                        {t("week", { from: shortDay(p.week_start, 0, locale), to: shortDay(p.week_start, 6, locale) })}
                        {i === 0 && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold">{t("current")}</span>}
                      </span>
                      <span className="text-sm opacity-70">
                        {t("planMeta", { price: eur(p.checkout_eur, locale), created: created(p.created_at, locale) })}
                      </span>
                    </span>
                    <span aria-hidden>›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="feedback-title">
          <h2 id="feedback-title" className="text-lg font-semibold">
            {t("feedbackTitle")}
          </h2>
          <FeedbackForm />
        </section>

        <nav className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn-secondary w-full">
              {tc("logout")}
            </button>
          </form>
          <Link href="/profile/delete" className="btn-ghost text-red-600">
            {t("deleteLink")}
          </Link>
        </nav>
      </main>
      <BottomNav />
    </>
  );
}
