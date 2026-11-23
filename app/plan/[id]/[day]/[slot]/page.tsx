import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SLOT_BG } from "@/lib/planner/labels";
import type { Recipe } from "@/lib/planner/plan";
import { getPlan } from "@/lib/plans/load";
import { recipePhoto } from "@/lib/recipes/images";
import { requireCompleteProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Рецепта · Пазарен план" };

interface RecipeData extends Recipe {
  steps?: string[];
  prep_min?: number;
  cook_min?: number;
  total_min?: number;
}

const one = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

export default async function MealPage({ params }: { params: Promise<{ id: string; day: string; slot: string }> }) {
  const { id, day, slot } = await params;
  await requireCompleteProfile();
  const supabase = await createClient();

  const plan = await getPlan(supabase, id);
  const dayIndex = Number(day);
  const planDay = Number.isInteger(dayIndex) ? plan?.plan[dayIndex] : undefined;
  const meal = planDay?.meals.find((m) => m.slot === slot);
  if (!plan || !planDay || !meal) notFound();

  const { data: recipeRow } = await supabase.from("recipes").select("data").eq("id", meal.recipe_id).maybeSingle();
  const recipe = (recipeRow?.data ?? null) as RecipeData | null;
  const pantry = new Set(plan.solver.pantry ?? []);
  const photo = recipePhoto(meal.recipe_id);
  const time = recipe?.total_min ?? ((recipe?.prep_min ?? 0) + (recipe?.cook_min ?? 0) || null);

  return (
    <main className="page">
      <header className="flex flex-col gap-2">
        <Link href={`/plan?id=${plan.id}`} className="btn-ghost -ml-3 self-start">
          ← Към плана
        </Link>
        <p className="text-sm opacity-70">
          {planDay.day} · {SLOT_BG[meal.slot]}
        </p>
        <h1 className="text-2xl font-bold leading-tight">{meal.recipe}</h1>
        {time ? (
          <p className="text-sm opacity-70">
            {recipe?.prep_min != null && `Подготовка ${recipe.prep_min} мин`}
            {recipe?.prep_min != null && recipe?.cook_min ? " · " : ""}
            {recipe?.cook_min ? `Готвене ${recipe.cook_min} мин` : ""}
            {` · общо ${time} мин`}
          </p>
        ) : null}
      </header>

      {photo && (
        <figure className="-mt-2 flex flex-col gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized 800 px WebP from public/recipes */}
          <img src={photo.large} alt={meal.recipe} width={800} height={800} className="aspect-square w-full rounded-3xl object-cover shadow-sm" />
          <figcaption className="text-right text-xs opacity-60">
            Снимката е примерна ·{" "}
            <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {photo.site}
            </a>
          </figcaption>
        </figure>
      )}

      <section className="grid grid-cols-4 gap-2 text-center" aria-label="Хранителна стойност">
        <Macro label="kcal" value={Math.round(meal.kcal).toString()} />
        <Macro label="протеин" value={`${one(meal.protein_g)} г`} />
        <Macro label="мазнини" value={`${one(meal.fat_g)} г`} />
        <Macro label="въглех." value={`${one(meal.carbs_g)} г`} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Продукти</h2>
        <ul className="card flex flex-col divide-y divide-border p-0">
          {meal.items.map((it) => (
            <li key={it.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <span>
                {it.name}
                {pantry.has(it.id) && <span className="ml-2 text-xs opacity-60">(имаш вкъщи)</span>}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{it.grams} г</span>
            </li>
          ))}
        </ul>
        <p className="text-xs opacity-60">Грамовете са за ядивната част (без кори, кости, черупки).</p>
      </section>

      {recipe?.steps?.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Приготвяне</h2>
          <ol className="flex flex-col gap-3">
            {recipe.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <div className="card flex flex-col p-3">
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-xs opacity-60">{label}</span>
    </div>
  );
}
