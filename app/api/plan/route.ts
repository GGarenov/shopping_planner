// POST /api/plan — generates the user's weekly plan and saves it to `plans` (SPEC §7.2).
import { NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { AppError, type ErrorCode } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { isGuest } from "@/lib/auth/guest";
import { num } from "@/lib/i18n/format";
import { resolveTargets } from "@/lib/planner/targets";
import { generatePlan, NO_RECIPES_MESSAGE_BG, type PlanDay, type PlanResult } from "@/lib/planner/plan";
import { loadPlannerData } from "@/lib/planner/load";
import { planWeekStart } from "@/lib/planner/week";
import { isComplete, type ProfileRow } from "@/lib/profile/schema";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // the planner targets ≤ 15 s; headroom for cold starts and fallback attempts
/** Plans a guest may make in 24 hours (taylor_the_app/loginless.md, part 6). Accounts have no limit. */
const GUEST_PLANS_PER_DAY = 10;

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/** The user-facing "no plan" error in the user's language, built from the planner's reason (its `message` is Bulgarian). */
function failure(res: Extract<PlanResult, { ok: false }>, budget: number, t: Translator, locale: string): AppError {
  // Same rounding as budgetMessageBg: bg "80,5 €", en "€80.5".
  const money = (n: number) => (locale === "en" ? `€${num(n, locale, 2)}` : `${num(n, locale, 2)} €`);
  const no = (code: ErrorCode, message: string, details?: Record<string, unknown>) => new AppError(422, code, message, details);
  if (res.reason === "budget_too_low" && res.min_budget_eur != null)
    return no("budget_too_low", t("budgetTooLow", { budget: money(budget), min: money(res.min_budget_eur) }), {
      min_budget_eur: res.min_budget_eur,
    });
  if (res.reason === "timeout") return no("timeout", t("timeout"));
  if (res.reason === "no_recipes" || res.message === NO_RECIPES_MESSAGE_BG) return no("no_recipes", t("noRecipes"));
  return no("no_plan", t("noPlan"), { reason: res.reason });
}

export const POST = apiHandler("POST /api/plan", async ({ log }) => {
  const t0 = Date.now();
  const [t, tc, locale] = await Promise.all([getTranslations("planner"), getTranslations("common"), getLocale()]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError(401, "unauthorized", tc("loginAgain"));
  // Every plan is up to a minute of solver time: a guest (no account, made with one tap) gets a daily limit.
  if (isGuest(user)) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase.from("plans").select("id", { count: "exact", head: true }).gte("created_at", since);
    if ((count ?? 0) >= GUEST_PLANS_PER_DAY) throw new AppError(429, "too_many", t("guestLimit"));
  }

  const { data: row, error: profileError } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (profileError) throw new Error(`profile select failed: ${profileError.message}`, { cause: profileError });
  const profile = row
    ? ({ ...row, weight_kg: Number(row.weight_kg), budget_eur: Number(row.budget_eur), options: row.options ?? {} } as ProfileRow)
    : null;
  if (!isComplete(profile)) throw new AppError(400, "profile_incomplete", t("profileIncomplete"));

  let data;
  try {
    data = await loadPlannerData(supabase);
  } catch (e) {
    log.error("plan.load_failed", { err: e });
    throw new AppError(500, "load_failed", t("loadFailed"));
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
  const { data: last } = await supabase
    .from("plans")
    .select("plan")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
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
    // Stage 1 (choosing meals) needs ~6 s on a laptop and found no plan in time on the server (2026-11-24): the
    // budgeted run failed, and the user was told "budget too low". The deadlines below still cap the whole run.
    stage1_time_limit_s: 12,
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
    log.warn("plan.infeasible", { user: user.id, reason: res.reason, solver_log: res.log });
    throw failure(res, profile.budget_eur, t, locale);
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
    log.error("plan.save_failed", { err: new Error(saveError.message) });
    throw new AppError(500, "save_failed", t("saveFailed"));
  }

  log.info("plan.created", {
    user: user.id,
    load_s: (tLoaded - t0) / 1000,
    solve_s: (tSolved - tLoaded) / 1000,
    total_s: (Date.now() - t0) / 1000,
    checkout: out.checkout_eur,
  });
  return NextResponse.json({ id: saved.id, seconds: (Date.now() - t0) / 1000, varied: avoid.length ? varied : null });
});
