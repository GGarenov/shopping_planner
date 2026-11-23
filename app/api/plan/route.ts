// POST /api/plan — generates the user's weekly plan and saves it to `plans` (SPEC §7.2).
import { NextResponse } from "next/server";
import { resolveTargets } from "@/lib/planner/targets";
import { generatePlan, type PlanDay } from "@/lib/planner/plan";
import { loadPlannerData } from "@/lib/planner/load";
import { planWeekStart } from "@/lib/planner/week";
import { isComplete, type ProfileRow } from "@/lib/profile/schema";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // the planner targets ≤ 15 s; headroom for cold starts and fallback attempts

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST() {
  const t0 = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Влез отново в профила си.");

  const { data: row, error: profileError } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (profileError) {
    console.error("plan: profile select failed", profileError.message);
    return fail(500, "Нещо се обърка. Опитай отново.");
  }
  const profile = row ? ({ ...row, weight_kg: Number(row.weight_kg), budget_eur: Number(row.budget_eur), options: row.options ?? {} } as ProfileRow) : null;
  if (!isComplete(profile)) return fail(400, "Първо попълни данните си.");

  let data;
  try {
    data = await loadPlannerData(supabase);
  } catch (e) {
    console.error("plan: loading reference data failed", e);
    return fail(500, "Не успяхме да заредим продуктите. Опитай отново след малко.");
  }
  const tLoaded = Date.now();

  const body = {
    sex: profile.sex,
    age: profile.age,
    height_cm: profile.height_cm,
    weight_kg: profile.weight_kg,
    activity: profile.activity,
    goal: profile.goal,
    kcal_tolerance: profile.options.kcal_tolerance,
  };
  const targets = resolveTargets(body, profile.targets_override);

  // "Нов план" should give a different week: steer away from the recipes of the latest plan.
  const { data: last } = await supabase.from("plans").select("plan").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const avoid = [...new Set(((last?.plan ?? []) as PlanDay[]).flatMap((d) => d.meals.map((m) => m.recipe_id)))];

  const planProfile = {
    name: "app",
    ...body,
    budget_eur: profile.budget_eur,
    diet: profile.diet,
    exclude_tags: profile.exclude_tags,
    allergens: profile.allergens,
    pantry: profile.pantry,
    targets_override: targets,
    avoid_recipes: avoid,
    stage2_time_limit_s: 8,
  };
  const input = { ingredients: data.ingredients, recipes: data.recipes, products: data.products };
  // "Нов план": first try a different week (fail fast); if that doesn't fit, the best plan regardless of the last one.
  // Deadlines keep both attempts inside the function limit (maxDuration 60 s).
  let res = await generatePlan({ ...input, profile: { ...planProfile, diagnose: avoid.length === 0, deadline_s: avoid.length ? 20 : 40 } });
  let varied = avoid.length > 0;
  if (!res.ok && avoid.length > 0) {
    res = await generatePlan({ ...input, profile: { ...planProfile, avoid_recipes: [], deadline_s: 30 } });
    varied = false;
  }
  const tSolved = Date.now();

  if (!res.ok) {
    console.warn("plan: no feasible plan", { user: user.id, reason: res.reason, log: res.log });
    return NextResponse.json({ error: res.message, reason: res.reason, min_budget_eur: res.min_budget_eur }, { status: 422 });
  }

  const out = res.output;
  const { data: saved, error: saveError } = await supabase
    .from("plans")
    .insert({
      user_id: user.id,
      week_start: planWeekStart(),
      targets: out.targets,
      plan: out.plan,
      shopping: out.shopping,
      checkout_eur: out.checkout_eur,
      eaten_eur: out.eaten_eur,
      solver: {
        ...out.solver,
        budget_eur: out.budget_eur,
        pantry: out.pantry,
        prices_date: data.pricesDate,
        load_seconds: (tLoaded - t0) / 1000,
        log: res.log,
      },
    })
    .select("id")
    .single();
  if (saveError) {
    console.error("plan: insert failed", saveError.message);
    return fail(500, "Планът е готов, но не успяхме да го запазим. Опитай отново.");
  }

  console.log("plan: ok", {
    load_s: (tLoaded - t0) / 1000,
    solve_s: (tSolved - tLoaded) / 1000,
    total_s: (Date.now() - t0) / 1000,
    checkout: out.checkout_eur,
  });
  return NextResponse.json({ id: saved.id, seconds: (Date.now() - t0) / 1000, varied: avoid.length ? varied : null });
}
