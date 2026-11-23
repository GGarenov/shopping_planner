// Recipe photos (from scripts/fetch_recipe_images.ts → data/recipe_images.json, files in public/recipes/).
import images from "@/data/recipe_images.json";

export interface RecipePhoto {
  small: string; // 400 px square
  large: string; // 800 px square
  sourceUrl: string;
  site: string;
}

const db = images as Record<string, { file: string; source_url: string; site: string }>;

export function recipePhoto(recipeId: string): RecipePhoto | null {
  const r = db[recipeId];
  if (!r) return null;
  return { small: r.file, large: r.file.replace(/-400\.webp$/, "-800.webp"), sourceUrl: r.source_url, site: r.site };
}

/** recipe id → small photo URL, for the week view (client component gets only what it shows). */
export function smallPhotos(recipeIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of recipeIds) {
    const p = recipePhoto(id);
    if (p) out[id] = p.small;
  }
  return out;
}
