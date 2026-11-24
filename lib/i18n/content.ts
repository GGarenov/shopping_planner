// Recipe and ingredient texts in the user's language. Bulgarian is the data itself (recipes.json, ingredients.json,
// and the names saved inside each plan); English comes from data/i18n/*.en.json keyed by id, falling back to Bulgarian.
import ingredientsEn from "@/data/i18n/ingredients.en.json";
import recipesEn from "@/data/i18n/recipes.en.json";
import type { Locale } from "./config";

const RECIPES = recipesEn as Record<string, { name?: string; steps?: string[] }>;
const INGREDIENTS = ingredientsEn as Record<string, string>;

export function recipeName(id: string, bg: string, locale: Locale | string): string {
  return (locale === "en" && RECIPES[id]?.name) || bg;
}

export function recipeSteps(id: string, bg: string[], locale: Locale | string): string[] {
  const en = RECIPES[id]?.steps;
  return locale === "en" && en && en.length === bg.length ? en : bg;
}

export function ingredientName(id: string, bg: string, locale: Locale | string): string {
  return (locale === "en" && INGREDIENTS[id]) || bg;
}
