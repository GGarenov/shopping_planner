// GET /api/health — for uptime monitors (no login). Shows only operational facts, never user data:
//   200 { status: "ok" }        database reachable, prices synced within the last 36 h
//   200 { status: "degraded" }  database reachable, but the daily eBag sync is late (prices may be stale)
//   503 { status: "down" }      the database does not answer
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The sync runs daily; more than a day and a half without a successful run means something is wrong. */
const SYNC_STALE_AFTER_HOURS = 36;
const DB_TIMEOUT_MS = 5_000;

export const GET = apiHandler("GET /api/health", async ({ log }) => {
  const t0 = Date.now();
  let lastSync: string | null = null;
  let dbOk = false;
  try {
    const query = createAdminClient()
      .from("sync_runs")
      .select("finished_at")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
      .maybeSingle();
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    dbOk = true;
    lastSync = (data?.finished_at as string | null) ?? null;
  } catch (e) {
    log.error("health.db_unreachable", { err: e });
  }
  const dbMs = Date.now() - t0;
  const ageHours = lastSync ? Math.round(((Date.now() - Date.parse(lastSync)) / 3_600_000) * 10) / 10 : null;
  const syncOk = ageHours !== null && ageHours <= SYNC_STALE_AFTER_HOURS;
  const status = !dbOk ? "down" : syncOk ? "ok" : "degraded";
  if (status === "degraded") log.warn("health.sync_stale", { last_success_at: lastSync, age_hours: ageHours });

  return NextResponse.json(
    {
      status,
      checks: {
        database: { ok: dbOk, latency_ms: dbMs },
        sync: { ok: syncOk, last_success_at: lastSync, age_hours: ageHours, stale_after_hours: SYNC_STALE_AFTER_HOURS },
      },
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      time: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
});
