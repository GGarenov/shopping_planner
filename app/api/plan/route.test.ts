import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanInput, PlanOutput, PlanResult } from "@/lib/planner/plan";
import { fakeSupabase, intl } from "@/test/server";
import { POST } from "./route";

vi.mock("next-intl/server", async () => (await import("@/test/server")).intlServer);
const supabase = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase.current }));
const loadPlannerData = vi.fn();
vi.mock("@/lib/planner/load", () => ({ loadPlannerData: (...a: unknown[]) => loadPlannerData(...a) }));
// The optimizer itself is tested in lib/planner/plan.test.ts; here only the route around it.
const generatePlan = vi.fn<(input: PlanInput) => Promise<PlanResult>>();
vi.mock("@/lib/planner/plan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/planner/plan")>()),
  generatePlan: (input: PlanInput) => generatePlan(input),
}));
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

const USER = { id: "user-1" };
const profile = {
  user_id: USER.id,
  sex: "female",
  age: 39,
  height_cm: 161,
  weight_kg: "52.0", // numeric columns arrive as strings
  activity: "light",
  goal: "lose",
  budget_eur: "50.00",
  diet: null,
  exclude_tags: ["pork"],
  allergens: [],
  pantry: ["salt"],
  options: { consent_at: "2026-11-23T10:00:00Z", kcal_tolerance: 100 },
  targets_override: null,
};
const output = { targets: {}, plan: [], shopping: [], checkout_eur: 50.45, eaten_eur: 31.1, budget_eur: 50, pantry: ["salt"], solver: {} };
const ok = (): PlanResult => ({ ok: true, output: output as unknown as PlanOutput, log: ["ok"] });
const lastPlan = { plan: [{ meals: [{ recipe_id: "musaka" }, { recipe_id: "tarator" }] }, { meals: [{ recipe_id: "musaka" }] }] };

function setup({
  user = USER as { id: string; is_anonymous?: boolean } | null,
  profileRow = profile as unknown,
  last = null as unknown,
  insert = { data: { id: "plan-9" }, error: null } as { data: unknown; error: { message: string } | null },
  plansToday = 0,
} = {}) {
  const fake = fakeSupabase({
    user,
    tables: {
      profiles: { maybeSingle: { data: profileRow, error: null } },
      plans: { maybeSingle: { data: last, error: null }, insert, select: { data: null, error: null, count: plansToday } },
    },
  });
  supabase.current = fake.client;
  return fake;
}

beforeEach(() => {
  intl.locale = "bg";
  loadPlannerData.mockResolvedValue({ ingredients: [], recipes: [], products: [], pricesDate: "2026-11-24" });
  generatePlan.mockReset();
});

describe("POST /api/plan", () => {
  it("401 when not logged in", async () => {
    setup({ user: null });
    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "unauthorized", message: "Влез отново в профила си.", requestId: expect.any(String) },
    });
    expect(res.headers.get("x-request-id")).toEqual(expect.any(String));
  });

  it("a guest gets at most 10 plans in 24 hours (each is up to a minute of solver time)", async () => {
    const guest = { id: "guest-1", is_anonymous: true };
    setup({ user: guest, plansToday: 10 });
    const res = await POST();
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatchObject({ code: "too_many" });
    expect(generatePlan).not.toHaveBeenCalled();

    setup({ user: guest, plansToday: 9 });
    generatePlan.mockResolvedValue(ok());
    expect((await POST()).status).toBe(200);
  });

  it("accounts have no daily limit", async () => {
    setup({ plansToday: 50 });
    generatePlan.mockResolvedValue(ok());
    expect((await POST()).status).toBe(200);
  });

  it("400 when the profile is not complete yet", async () => {
    setup({ profileRow: { ...profile, options: {} } }); // no consent
    const res = await POST();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({ code: "profile_incomplete", message: "Първо попълни данните си." });
    expect(generatePlan).not.toHaveBeenCalled();
  });

  it("500 with a friendly message when the products can't be loaded", async () => {
    setup();
    loadPlannerData.mockRejectedValueOnce(new Error("db down"));
    const res = await POST();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatchObject({
      code: "load_failed",
      message: "Не успяхме да заредим продуктите. Опитай отново след малко.",
    });
  });

  it("first plan: one planner run with diagnosis, saved for the user", async () => {
    const fake = setup();
    generatePlan.mockResolvedValueOnce(ok());
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "plan-9", varied: null });
    expect(generatePlan).toHaveBeenCalledTimes(1);
    const { profile: p } = generatePlan.mock.calls[0]![0];
    expect(p).toMatchObject({ budget_eur: 50, weight_kg: 52, exclude_tags: ["pork"], avoid_recipes: [], diagnose: true, deadline_s: 40 });
    const [insert] = fake.writes("plans", "insert");
    expect(insert!.payload).toMatchObject({
      user_id: USER.id,
      checkout_eur: 50.45,
      eaten_eur: 31.1,
      solver: { budget_eur: 50, prices_date: "2026-11-24" },
    });
  });

  it("«Нов план»: steers away from last week's recipes (fast first try)", async () => {
    setup({ last: lastPlan });
    generatePlan.mockResolvedValueOnce(ok());
    const res = await POST();
    expect(await res.json()).toMatchObject({ varied: true });
    expect(generatePlan.mock.calls[0]![0].profile).toMatchObject({ avoid_recipes: ["musaka", "tarator"], diagnose: false, deadline_s: 20 });
  });

  it("«Нов план»: when a different week doesn't fit, falls back to the best plan instead of an error", async () => {
    setup({ last: lastPlan });
    generatePlan.mockResolvedValueOnce({ ok: false, reason: "no_purchase_plan", message: "x", log: [] }).mockResolvedValueOnce(ok());
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ varied: false });
    expect(generatePlan).toHaveBeenCalledTimes(2);
    expect(generatePlan.mock.calls[1]![0].profile).toMatchObject({ avoid_recipes: [], deadline_s: 30 });
  });

  it.each([
    ["bg", "С бюджет 50 € не успяхме да съберем седмичен план с твоите цели. Най-евтиният план, който намерихме, е около 79 €."],
    ["en", "€50"],
  ] as const)("422 budget too low (%s): names the budget and the cheapest plan found", async (locale, expected) => {
    intl.locale = locale;
    setup();
    generatePlan.mockResolvedValueOnce({ ok: false, reason: "budget_too_low", min_budget_eur: 79, message: "x", log: [] });
    const res = await POST();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: "budget_too_low", details: { min_budget_eur: 79 } });
    expect(body.error.message).toContain(expected);
    if (locale === "en") expect(body.error.message).toContain("€79");
  });

  it("422 timeout is reported as «try again», not as missing recipes", async () => {
    setup();
    generatePlan.mockResolvedValueOnce({ ok: false, reason: "timeout", message: "x", log: [] });
    const body = await (await POST()).json();
    expect(body.error).toMatchObject({
      code: "timeout",
      message: "Не успяхме да съставим плана навреме. Опитай отново — обикновено вторият опит минава.",
    });
  });

  it("500 when the finished plan can't be saved", async () => {
    setup({ insert: { data: null, error: { message: "insert failed" } } });
    generatePlan.mockResolvedValueOnce(ok());
    const res = await POST();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatchObject({
      code: "save_failed",
      message: "Планът е готов, но не успяхме да го запазим. Опитай отново.",
    });
  });

  it("500 «something went wrong» for an unexpected failure, never the internal error text", async () => {
    setup();
    generatePlan.mockRejectedValueOnce(new Error("solver exploded: secret internals"));
    const res = await POST();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: "internal", message: "Нещо се обърка. Опитай отново." });
    expect(JSON.stringify(body)).not.toContain("secret internals");
  });
});
