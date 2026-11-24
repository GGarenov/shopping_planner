import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", async () => (await import("@/test/server")).intlServer);
// sync_runs query: .from().select().eq().order().limit().abortSignal().maybeSingle()
const db = vi.hoisted(() => ({ result: { data: null, error: null } as { data: unknown; error: unknown }, throws: false }));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => {
    if (db.throws) throw new Error("missing env");
    const q = {
      from: () => q,
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      abortSignal: () => q,
      maybeSingle: async () => db.result,
    };
    return q;
  },
}));
const { GET } = await import("./route");

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

beforeEach(() => {
  db.throws = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/health", () => {
  it("200 ok: database answers and prices were synced recently", async () => {
    db.result = { data: { finished_at: hoursAgo(5) }, error: null };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", checks: { database: { ok: true }, sync: { ok: true, age_hours: 5 } }, version: "dev" });
  });

  it("200 degraded: the daily sync is late (or never ran)", async () => {
    db.result = { data: { finished_at: hoursAgo(50) }, error: null };
    expect(await (await GET()).json()).toMatchObject({ status: "degraded", checks: { sync: { ok: false, age_hours: 50 } } });
    db.result = { data: null, error: null };
    expect(await (await GET()).json()).toMatchObject({ status: "degraded", checks: { sync: { ok: false, last_success_at: null } } });
  });

  it("503 down: the database does not answer — without leaking the reason", async () => {
    db.result = { data: null, error: { message: "password authentication failed for user postgres" } };
    const res = await GET();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ status: "down", checks: { database: { ok: false } } });
    expect(text).not.toContain("password");
    db.throws = true;
    expect((await GET()).status).toBe(503);
  });
});
