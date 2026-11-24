import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ingredientName, recipeName, recipeSteps } from "@/lib/i18n/content";
import { num } from "@/lib/i18n/format";
import { dayLongKey, slotKey } from "@/lib/planner/labels";
import type { Recipe } from "@/lib/planner/plan";
import { getPlan } from "@/lib/plans/load";
import { recipePhoto } from "@/lib/recipes/images";
import { requireCompleteProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tc] = await Promise.all([getTranslations("recipe"), getTranslations("common")]);
  return { title: `${t("title")} · ${tc("appName")}` };
}

interface RecipeData extends Recipe {
  steps?: string[];
  prep_min?: number;
  cook_min?: number;
  total_min?: number;
}

export default async function MealPage({ params }: { params: Promise<{ id: string; day: string; slot: string }> }) {
  const { id, day, slot } = await params;
  await requireCompleteProfile();
  const [t, tp, tc, locale] = await Promise.all([getTranslations("recipe"), getTranslations("plan"), getTranslations("common"), getLocale()]);
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
  const name = recipeName(meal.recipe_id, meal.recipe, locale);
  const steps = recipe?.steps?.length ? recipeSteps(meal.recipe_id, recipe.steps, locale) : null;
  const grams = (n: number) => tc("grams", { n: num(n, locale) });

  return (
    <main className="page">
      <header className="flex flex-col gap-2">
        <Link href={`/plan?id=${plan.id}`} className="btn-ghost -ml-3 self-start">
          {t("backToPlan")}
        </Link>
        <p className="text-sm opacity-70">
          {tp(dayLongKey(dayIndex))} · {tp(slotKey(meal.slot))}
        </p>
        <h1 className="text-2xl font-bold leading-tight">{name}</h1>
        {time ? (
          <p className="text-sm opacity-70">
            {recipe?.prep_min != null && t("prep", { n: String(recipe.prep_min) })}
            {recipe?.prep_min != null && recipe?.cook_min ? " · " : ""}
            {recipe?.cook_min ? t("cook", { n: String(recipe.cook_min) }) : ""}
            {t("total", { n: String(time) })}
          </p>
        ) : null}
      </header>

      {photo && (
        <figure className="-mt-2 flex flex-col gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized 800 px WebP from public/recipes */}
          <img src={photo.large} alt={name} width={800} height={800} className="aspect-square w-full rounded-3xl object-cover shadow-sm" />
          <figcaption className="text-right text-xs opacity-60">
            {t("photoNote")}{" "}
            <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {photo.site}
            </a>
          </figcaption>
        </figure>
      )}

      <section className="grid grid-cols-4 gap-2 text-center" aria-label={t("nutrition")}>
        <Macro label={tc("kcal")} value={Math.round(meal.kcal).toString()} />
        <Macro label={tc("protein")} value={grams(meal.protein_g)} />
        <Macro label={tc("fat")} value={grams(meal.fat_g)} />
        <Macro label={tc("carbs")} value={grams(meal.carbs_g)} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("ingredients")}</h2>
        <ul className="card flex flex-col divide-y divide-border p-0">
          {meal.items.map((it) => (
            <li key={it.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <span>
                {ingredientName(it.id, it.name, locale)}
                {pantry.has(it.id) && <span className="ml-2 text-xs opacity-60">{t("atHome")}</span>}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{tc("grams", { n: String(it.grams) })}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs opacity-60">{t("gramsNote")}</p>
      </section>

      {steps ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("steps")}</h2>
          <ol className="flex flex-col gap-3">
            {steps.map((s, i) => (
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
