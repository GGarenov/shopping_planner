import type { Metadata } from "next";
import Link from "next/link";
import { computeTargets, explainTargets, resolveTargets, type BodyData } from "@/lib/planner/targets";
import { requireCompleteProfile } from "@/lib/profile/load";
import { GOAL_OPTIONS } from "@/lib/profile/options";
import { TargetsEditor } from "./TargetsEditor";

export const metadata: Metadata = { title: "Твоите цели · Пазарен план" };

export default async function TargetsPage() {
  const { profile } = await requireCompleteProfile();
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
  const steps = explainTargets(body);
  const goal = GOAL_OPTIONS.find((g) => g.value === profile.goal)?.label;

  return (
    <main className="page">
      <header className="flex flex-col gap-1">
        <p className="text-sm opacity-70">Цел: {goal}</p>
        <h1 className="text-2xl font-bold">Твоите дневни цели</h1>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <div className="card flex flex-col gap-1">
          <span className="text-sm opacity-70">Калории на ден</span>
          <span className="text-2xl font-bold tabular-nums">
            {targets.kcal_min}–{targets.kcal_max}
          </span>
          <span className="text-sm opacity-70">kcal</span>
        </div>
        <div className="card flex flex-col gap-1">
          <span className="text-sm opacity-70">Протеин на ден</span>
          <span className="text-2xl font-bold tabular-nums">≥ {targets.protein_min}</span>
          <span className="text-sm opacity-70">грама</span>
        </div>
      </section>

      {targets.source === "manual" && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm">Целите са зададени ръчно от теб.</p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Как ги изчислихме</h2>
        <ol className="flex flex-col gap-2">
          {steps.map((s) => (
            <li key={s.label} className="card flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{s.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{s.value}</span>
              </div>
              <span className="text-sm break-words opacity-70">{s.expression}</span>
            </li>
          ))}
        </ol>
        <p className="text-sm opacity-70">
          Всеки ден от плана ще е в този диапазон калории и поне с този протеин — не само средно за седмицата.
        </p>
      </section>

      <TargetsEditor targets={targets} computed={computed} />

      <nav className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
        <Link href="/onboarding" className="btn-secondary">
          Редактирай данните си
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn-ghost w-full">
            Изход
          </button>
        </form>
      </nav>
    </main>
  );
}
