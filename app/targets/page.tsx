import type { Metadata } from "next";
import { Hero } from "@/components/Hero";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { computeTargets, explainTargets, resolveTargets, type BodyData } from "@/lib/planner/targets";
import { isGuest } from "@/lib/auth/guest";
import { requireCompleteProfile } from "@/lib/profile/load";
import { BottomNav } from "@/components/BottomNav";
import { TargetsEditor } from "./TargetsEditor";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tc] = await Promise.all([getTranslations("targets"), getTranslations("common")]);
  return { title: `${t("title")} · ${tc("appName")}` };
}

export default async function TargetsPage() {
  const { user, profile } = await requireCompleteProfile();
  const [t, tc, to, locale] = await Promise.all([
    getTranslations("targets"),
    getTranslations("common"),
    getTranslations("options"),
    getLocale(),
  ]);
  const body: BodyData = {
    sex: profile.sex,
    age: profile.age,
    height_cm: profile.height_cm,
    weight_kg: profile.weight_kg,
    activity: profile.activity,
    goal: profile.goal,
    kcal_tolerance: profile.options.kcal_tolerance,
  };
  const computed = computeTargets(body);
  const targets = resolveTargets(body, profile.targets_override);
  const steps = explainTargets(body, locale);
  const goal = to(`goal.${profile.goal}.label`);

  return (
    <>
      <main className="page pb-24">
        <Hero title={t("heading")} kicker={t("goal", { goal })} />

        <section className="grid grid-cols-2 gap-3">
          <div className="card flex flex-col gap-1">
            <span className="text-sm text-subtle">{t("kcalPerDay")}</span>
            <span className="text-2xl font-bold tabular-nums">
              {targets.kcal_min}–{targets.kcal_max}
            </span>
            <span className="text-sm text-subtle">kcal</span>
          </div>
          <div className="card flex flex-col gap-1">
            <span className="text-sm text-subtle">{t("proteinPerDay")}</span>
            <span className="text-2xl font-bold tabular-nums">≥ {targets.protein_min}</span>
            <span className="text-sm text-subtle">{t("grams")}</span>
          </div>
        </section>

        {targets.source === "manual" && <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm">{t("manual")}</p>}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("howCalculated")}</h2>
          <ol className="flex flex-col gap-2">
            {steps.map((s) => (
              <li key={s.label} className="card flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{s.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{s.value}</span>
                </div>
                <span className="text-sm break-words text-subtle">{s.expression}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-subtle">{t("everyDay")}</p>
        </section>

        <TargetsEditor targets={targets} computed={computed} />

        <nav className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
          <Link href="/onboarding" className="btn-secondary">
            {t("editData")}
          </Link>
          {!isGuest(user) && (
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn-ghost w-full">
                {tc("logout")}
              </button>
            </form>
          )}
        </nav>
      </main>
      <BottomNav />
    </>
  );
}
