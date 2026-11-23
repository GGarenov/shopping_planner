import type { Metadata } from "next";
import { Hero } from "@/components/Hero";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { getConnectionRow } from "@/lib/ebag/oauth";
import { resolveTargets } from "@/lib/planner/targets";
import { shortDate } from "@/lib/planner/week";
import { listPlans } from "@/lib/plans/load";
import { eur } from "@/lib/plans/shopping";
import { requireCompleteProfile } from "@/lib/profile/load";
import { GOAL_OPTIONS } from "@/lib/profile/options";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { FeedbackForm } from "./FeedbackForm";

export const metadata: Metadata = { title: "Профил · Пазарен план" };

const created = (iso: string) =>
  new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function ProfilePage() {
  const { user, profile } = await requireCompleteProfile();
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
  const goal = GOAL_OPTIONS.find((g) => g.value === profile.goal)?.label;

  return (
    <>
      <main className="page pb-24">
        <Hero title="Профил">
          <p className="text-sm break-all text-white/85">{user.email}</p>
        </Hero>

        <section className="flex flex-col gap-2">
          <Link href="/targets" className="card flex items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="font-semibold">Твоите цели</span>
              <span className="text-sm opacity-70">
                {goal} · {targets.kcal_min}–{targets.kcal_max} kcal · протеин ≥ {targets.protein_min} г
              </span>
            </span>
            <span aria-hidden>›</span>
          </Link>
          <Link href="/onboarding" className="card flex items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="font-semibold">Твоите данни</span>
              <span className="text-sm opacity-70">
                {profile.weight_kg} кг · {profile.height_cm} см · бюджет {eur(profile.budget_eur)}/седмица
              </span>
            </span>
            <span aria-hidden>›</span>
          </Link>
          <Link href="/ebag" className="card flex items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="font-semibold">eBag</span>
              <span className="text-sm opacity-70">{ebag?.status === "connected" ? "Свързан" : ebag ? "Връзката е изтекла" : "Не е свързан"}</span>
            </span>
            <span aria-hidden>›</span>
          </Link>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="plans-title">
          <h2 id="plans-title" className="text-lg font-semibold">
            Планове
          </h2>
          {plans.length === 0 ? (
            <p className="text-sm opacity-70">Още нямаш планове.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {plans.map((p, i) => (
                <li key={p.id}>
                  <Link href={i === 0 ? "/plan" : `/plan?id=${p.id}`} className="card flex items-center justify-between gap-3">
                    <span className="flex flex-col">
                      <span className="font-medium">
                        Седмица {shortDate(p.week_start, 0)} – {shortDate(p.week_start, 6)}
                        {i === 0 && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold">текущ</span>}
                      </span>
                      <span className="text-sm opacity-70">
                        {eur(p.checkout_eur)} · създаден {created(p.created_at)}
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
            Обратна връзка
          </h2>
          <FeedbackForm />
        </section>

        <nav className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn-secondary w-full">
              Изход
            </button>
          </form>
          <Link href="/profile/delete" className="btn-ghost text-red-600">
            Изтрий профила ми
          </Link>
        </nav>
      </main>
      <BottomNav />
    </>
  );
}
