// TEMPORARY (Phase 3 spike): checks that the HiGHS WASM solver loads and solves inside a Vercel function.
// Remove once /api/plan is live.
import { NextResponse } from "next/server";
import { getHighs } from "@/lib/planner/highs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bootedAt = Date.now();
let requests = 0;

// Small knapsack-style MIP: 40 binaries, 3 constraints.
function lp(): string {
  const n = 40;
  const v = Array.from({ length: n }, (_, i) => `x${i}`);
  const w = (i: number) => ((i * 37) % 23) + 5;
  const val = (i: number) => ((i * 53) % 31) + 3;
  return [
    "Maximize",
    ` obj: ${v.map((x, i) => `+ ${val(i)} ${x}`).join(" ")}`,
    "Subject To",
    ` c0: ${v.map((x, i) => `+ ${w(i)} ${x}`).join(" ")} <= 200`,
    ` c1: ${v.slice(0, 20).map((x) => `+ 1 ${x}`).join(" ")} <= 6`,
    ` c2: ${v.slice(20).map((x) => `+ 1 ${x}`).join(" ")} >= 3`,
    "Binary",
    ` ${v.join(" ")}`,
    "End",
  ].join("\n");
}

export async function GET() {
  requests++;
  const t0 = Date.now();
  const highs = await getHighs();
  const t1 = Date.now();
  const res = highs.solve(lp(), { output_flag: false });
  const t2 = Date.now();
  return NextResponse.json({
    status: res.Status,
    objective: res.ObjectiveValue,
    load_ms: t1 - t0,
    solve_ms: t2 - t1,
    instance_age_ms: Date.now() - bootedAt,
    requests_on_instance: requests,
    node: process.version,
    region: process.env.VERCEL_REGION ?? "local",
  });
}
