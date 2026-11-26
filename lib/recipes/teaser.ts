// A few real recipes (photo + name) for the "putting your week together" screen while a plan is being made
// (components/PlanLoading.tsx). Only decoration: not the recipes the plan will get.
import "server-only";
import recipes from "@/data/recipes.json";
import { recipeName } from "@/lib/i18n/content";
import { recipePhoto } from "./images";

export interface TeaserRecipe {
  name: string;
  photo: string;
}

const ALL = (recipes.recipes as { id: string; name: string }[]).filter((r) => recipePhoto(r.id));

/** `n` different recipes with photos, in random order. */
export function teaserRecipes(locale: string, n = 7, random = Math.random): TeaserRecipe[] {
  const pool = [...ALL];
  const out: TeaserRecipe[] = [];
  while (out.length < n && pool.length) {
    const [r] = pool.splice(Math.floor(random() * pool.length), 1);
    out.push({ name: recipeName(r!.id, r!.name, locale), photo: recipePhoto(r!.id)!.small });
  }
  return out;
}
