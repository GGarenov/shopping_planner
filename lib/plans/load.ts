import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanDay, ShoppingItem } from "@/lib/planner/plan";
import type { Targets } from "@/lib/planner/targets";

export interface PlanRow {
  id: string;
  week_start: string;
  targets: Targets;
  plan: PlanDay[];
  shopping: ShoppingItem[];
  checkout_eur: number;
  eaten_eur: number;
  solver: { budget_eur?: number; pantry?: string[]; prices_date?: string | null; total_seconds?: number } & Record<string, unknown>;
  created_at: string;
}

const normalize = (r: Record<string, unknown>): PlanRow =>
  ({ ...r, checkout_eur: Number(r.checkout_eur), eaten_eur: Number(r.eaten_eur), solver: r.solver ?? {} }) as PlanRow;

/** The user's newest plan (RLS limits rows to the logged-in user). */
export async function getLatestPlan(supabase: SupabaseClient): Promise<PlanRow | null> {
  const { data, error } = await supabase.from("plans").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`plans select failed: ${error.message}`);
  return data ? normalize(data) : null;
}

export async function getPlan(supabase: SupabaseClient, id: string): Promise<PlanRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase.from("plans").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`plans select failed: ${error.message}`);
  return data ? normalize(data) : null;
}

export interface PlanSummary {
  id: string;
  week_start: string;
  checkout_eur: number;
  eaten_eur: number;
  created_at: string;
}

/** The user's plans, newest first (RLS limits rows to the logged-in user). */
export async function listPlans(supabase: SupabaseClient, limit = 20): Promise<PlanSummary[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("id, week_start, checkout_eur, eaten_eur, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`plans select failed: ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, checkout_eur: Number(r.checkout_eur), eaten_eur: Number(r.eaten_eur) }) as PlanSummary);
}
