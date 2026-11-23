// Latest successful price sync, for "Цени от <дата>" notices. sync_runs is readable by logged-in users.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SyncStatus {
  /** Date of the prices (YYYY-MM-DD) from the latest successful sync or seed. */
  pricesDate: string | null;
}

export async function getSyncStatus(supabase: SupabaseClient): Promise<SyncStatus> {
  const { data } = await supabase
    .from("sync_runs")
    .select("finished_at, stats")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const stats = (data?.stats ?? {}) as { prices_date?: string };
  return { pricesDate: stats.prices_date ?? data?.finished_at?.slice(0, 10) ?? null };
}

/** Whole days between two YYYY-MM-DD dates. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** "2026-11-24" → "24.11.2026". */
export const bgDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

/** Prices older than this many days get a "may be outdated" note (the sync runs daily). */
export const STALE_AFTER_DAYS = 3;
