// Row Level Security, tested against a real Supabase database: two signed-in users (A and B) and an anonymous
// visitor try to read and change each other's data. This is the proof behind "each user sees only their own data".
//
// Runs only against a separate TEST project (never production) whose schema is the migrations in supabase/migrations:
//   RLS_SUPABASE_URL, RLS_SUPABASE_ANON_KEY, RLS_SUPABASE_SERVICE_ROLE_KEY  (e.g. in .env.test.local)
//   npm run test:rls
// Without these variables the suite is skipped, so `npm test` works anywhere. Creates two throwaway users and
// deletes them at the end (their rows cascade).
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL_ = process.env.RLS_SUPABASE_URL;
const ANON = process.env.RLS_SUPABASE_ANON_KEY;
const SERVICE = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;
const configured = !!(URL_ && ANON && SERVICE);
if (configured && process.env.NEXT_PUBLIC_SUPABASE_URL && URL_ === process.env.NEXT_PUBLIC_SUPABASE_URL)
  throw new Error("RLS tests refuse to run against the production project (RLS_SUPABASE_URL = NEXT_PUBLIC_SUPABASE_URL).");

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

interface TestUser {
  id: string;
  db: SupabaseClient;
}

describe.skipIf(!configured)("Row Level Security (test Supabase project)", () => {
  const admin = configured ? createClient(URL_!, SERVICE!, opts) : (null as unknown as SupabaseClient);
  const anon = configured ? createClient(URL_!, ANON!, opts) : (null as unknown as SupabaseClient);
  const created: string[] = [];
  let A: TestUser;
  let B: TestUser;
  let planA: string;
  const ingredientId = `rls_test_${randomUUID().slice(0, 8)}`;

  async function signedInUser(tag: string): Promise<TestUser> {
    const email = `rls-${tag}-${randomUUID().slice(0, 8)}@example.com`;
    const password = `Rls-${randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    created.push(data.user.id);
    const db = createClient(URL_!, ANON!, opts);
    const { error: e2 } = await db.auth.signInWithPassword({ email, password });
    if (e2) throw e2;
    return { id: data.user.id, db };
  }

  const profile = (userId: string) => ({
    user_id: userId,
    sex: "female",
    age: 30,
    height_cm: 165,
    weight_kg: 60,
    activity: "light",
    goal: "maintain",
    budget_eur: 80,
    options: { consent_at: new Date().toISOString() },
  });
  const plan = { week_start: "2026-11-23", targets: {}, plan: [], shopping: [], checkout_eur: 50, eaten_eur: 30, solver: {} };

  beforeAll(async () => {
    [A, B] = await Promise.all([signedInUser("a"), signedInUser("b")]);
    // A sets up their own data through RLS (as the app does).
    const p = await A.db.from("profiles").insert(profile(A.id));
    expect(p.error).toBeNull();
    const { data, error } = await A.db.from("plans").insert(plan).select("id").single();
    expect(error).toBeNull();
    planA = data!.id as string;
    expect((await A.db.from("shopping_checks").insert({ plan_id: planA, ebag_id: 1, checked: true })).error).toBeNull();
    // Reference data is written only by the service role (seed/sync).
    expect((await admin.from("ingredients").insert({ id: ingredientId, data: { id: ingredientId } })).error).toBeNull();
  }, 60_000);

  afterAll(async () => {
    if (!configured) return;
    await admin.from("ingredients").delete().eq("id", ingredientId);
    await Promise.all(created.map((id) => admin.auth.admin.deleteUser(id)));
  }, 60_000);

  describe("profiles", () => {
    it("A reads their own profile; B and anonymous see nothing", async () => {
      expect((await A.db.from("profiles").select("user_id").eq("user_id", A.id)).data).toHaveLength(1);
      expect((await B.db.from("profiles").select("user_id").eq("user_id", A.id)).data).toEqual([]);
      expect((await anon.from("profiles").select("user_id")).data ?? []).toEqual([]);
    });

    it("B cannot change A's profile or create one in A's name", async () => {
      await B.db.from("profiles").update({ budget_eur: 1 }).eq("user_id", A.id);
      const { data } = await admin.from("profiles").select("budget_eur").eq("user_id", A.id).single();
      expect(Number(data!.budget_eur)).toBe(80);
      expect((await B.db.from("profiles").insert(profile(A.id))).error).not.toBeNull();
    });
  });

  describe("plans", () => {
    it("A sees their plan; B does not", async () => {
      expect((await A.db.from("plans").select("id").eq("id", planA)).data).toHaveLength(1);
      expect((await B.db.from("plans").select("id").eq("id", planA)).data).toEqual([]);
    });

    it("B cannot delete A's plan or save a plan in A's name", async () => {
      await B.db.from("plans").delete().eq("id", planA);
      expect((await admin.from("plans").select("id").eq("id", planA)).data).toHaveLength(1);
      expect((await B.db.from("plans").insert({ ...plan, user_id: A.id })).error).not.toBeNull();
    });

    it("plans are immutable once made (no update, even by the owner)", async () => {
      await A.db.from("plans").update({ checkout_eur: 1 }).eq("id", planA);
      const { data } = await admin.from("plans").select("checkout_eur").eq("id", planA).single();
      expect(Number(data!.checkout_eur)).toBe(50);
    });
  });

  describe("shopping list ticks", () => {
    it("only the plan's owner can read or tick items", async () => {
      expect((await A.db.from("shopping_checks").select("ebag_id").eq("plan_id", planA)).data).toHaveLength(1);
      expect((await B.db.from("shopping_checks").select("ebag_id").eq("plan_id", planA)).data).toEqual([]);
      expect((await B.db.from("shopping_checks").upsert({ plan_id: planA, ebag_id: 2, checked: true })).error).not.toBeNull();
    });
  });

  describe("secrets (eBag tokens, sync tokens, product details): service role only", () => {
    for (const table of ["ebag_connections", "system_secrets", "ebag_details"]) {
      it(`${table}: signed-in users and anonymous visitors get no access at all`, async () => {
        for (const client of [A.db, anon]) {
          expect((await client.from(table).select("*")).error).not.toBeNull();
          expect((await client.from(table).insert({})).error).not.toBeNull();
        }
      });
    }
  });

  describe("feedback", () => {
    it("users can send feedback in their own name only, and cannot read anyone's", async () => {
      expect((await A.db.from("feedback").insert({ user_id: A.id, message: "RLS test — please ignore" })).error).toBeNull();
      expect((await B.db.from("feedback").insert({ user_id: A.id, message: "spoofed" })).error).not.toBeNull();
      const read = await A.db.from("feedback").select("*");
      expect(read.error !== null || (read.data ?? []).length === 0).toBe(true);
      await admin.from("feedback").delete().eq("user_id", A.id);
    });
  });

  describe("reference data (ingredients, recipes, products, sync runs)", () => {
    it("signed-in users can read it; anonymous visitors cannot", async () => {
      expect((await A.db.from("ingredients").select("id").eq("id", ingredientId)).data).toHaveLength(1);
      expect((await anon.from("ingredients").select("id").eq("id", ingredientId)).data ?? []).toEqual([]);
    });

    it("nobody but the service role can change it", async () => {
      expect((await A.db.from("ingredients").insert({ id: `${ingredientId}_x`, data: {} })).error).not.toBeNull();
      await A.db
        .from("ingredients")
        .update({ data: { hacked: true } })
        .eq("id", ingredientId);
      await A.db.from("ingredients").delete().eq("id", ingredientId);
      const { data } = await admin.from("ingredients").select("data").eq("id", ingredientId).single();
      expect(data!.data).toEqual({ id: ingredientId });
    });
  });

  describe("guests (anonymous sign-in; needs «Allow anonymous sign-ins» on in the test project)", () => {
    async function guest(): Promise<TestUser> {
      const db = createClient(URL_!, ANON!, opts);
      const { data, error } = await db.auth.signInAnonymously();
      if (error) throw error;
      created.push(data.user!.id);
      return { id: data.user!.id, db };
    }

    it("a guest keeps their own data and sees nobody else's", async () => {
      const G = await guest();
      expect((await G.db.from("profiles").insert(profile(G.id))).error).toBeNull();
      expect((await G.db.from("plans").insert(plan)).error).toBeNull();
      expect((await G.db.from("profiles").select("user_id")).data).toEqual([{ user_id: G.id }]);
      expect((await G.db.from("plans").select("id").eq("user_id", A.id)).data).toEqual([]);
      expect((await G.db.from("profiles").insert(profile(B.id))).error).not.toBeNull();
    }, 30_000);

    it("only the service role may run the guest cleanup", async () => {
      const G = await guest();
      for (const db of [anon, G.db, A.db]) expect((await db.rpc("delete_stale_guests", { max_idle: "0 seconds" })).error).not.toBeNull();
    }, 30_000);

    it("the cleanup deletes idle guests (with their data) and never an account", async () => {
      const G = await guest();
      await G.db.from("profiles").insert(profile(G.id));
      // Guests may connect eBag too (docs/notes/issues.md, 2): the connection must go with them.
      expect((await admin.from("ebag_connections").insert({ user_id: G.id, tokens_encrypted: "rls-test" })).error).toBeNull();
      // A guest active in the last hour stays.
      expect((await admin.rpc("delete_stale_guests", { max_idle: "1 hour" })).error).toBeNull();
      expect((await admin.auth.admin.getUserById(G.id)).data.user).not.toBeNull();
      // Idle for longer than the limit (here: any time at all) → gone, with their profile. Accounts A and B stay.
      // Note: this also removes any other guests in the TEST project — never run against production (see the top).
      const { data: n, error } = await admin.rpc("delete_stale_guests", { max_idle: "0 seconds" });
      expect(error).toBeNull();
      expect(n).toBeGreaterThanOrEqual(1);
      expect((await admin.auth.admin.getUserById(G.id)).data.user).toBeNull();
      expect((await admin.from("profiles").select("user_id").eq("user_id", G.id)).data).toEqual([]);
      expect((await admin.from("ebag_connections").select("user_id").eq("user_id", G.id)).data).toEqual([]);
      for (const u of [A, B]) expect((await admin.auth.admin.getUserById(u.id)).data.user).not.toBeNull();
    }, 30_000);
  });

  it("deleting a user removes all their data (GDPR: delete my account)", async () => {
    const C = await signedInUser("c");
    await C.db.from("profiles").insert(profile(C.id));
    const { data } = await C.db.from("plans").insert(plan).select("id").single();
    await admin.auth.admin.deleteUser(C.id);
    created.splice(created.indexOf(C.id), 1);
    expect((await admin.from("profiles").select("user_id").eq("user_id", C.id)).data).toEqual([]);
    expect((await admin.from("plans").select("id").eq("id", data!.id)).data).toEqual([]);
  }, 30_000);
});
