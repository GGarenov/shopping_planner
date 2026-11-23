import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ingredient, Product, Recipe } from "./plan";

export interface PlannerData {
  ingredients: Ingredient[];
  recipes: Recipe[];
  products: Product[];
  /** Date of the prices (latest successful sync/seed), e.g. "2026-11-23". */
  pricesDate: string | null;
}

// Reference data changes once a day (sync); keep it per server instance for a few minutes.
const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; data: PlannerData } | null = null;

const PAGE = 1000; // PostgREST returns at most 1000 rows per request

async function selectAll<T>(supabase: SupabaseClient, table: "ingredients" | "recipes" | "products"): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = supabase.from(table).select("data");
    const q = (table === "products" ? base.eq("available", true).order("ebag_id") : base.order("id")).range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) throw new Error(`${table} select failed: ${error.message}`);
    rows.push(...(data as { data: T }[]).map((r) => r.data));
    if (data.length < PAGE) return rows;
  }
}

export async function loadPlannerData(supabase: SupabaseClient): Promise<PlannerData> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const [ingredients, recipes, products, run] = await Promise.all([
    selectAll<Ingredient>(supabase, "ingredients"),
    selectAll<Recipe>(supabase, "recipes"),
    selectAll<Product>(supabase, "products"), // available products only
    supabase.from("sync_runs").select("finished_at, stats").eq("status", "success").order("finished_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const stats = (run.data?.stats ?? {}) as { prices_date?: string };
  const data: PlannerData = {
    ingredients,
    recipes,
    products,
    pricesDate: stats.prices_date ?? run.data?.finished_at?.slice(0, 10) ?? null,
  };
  cache = { at: Date.now(), data };
  return data;
}
