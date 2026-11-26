// Moving a guest's data to an existing account: only from real guests, never over the account's own data.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { mergeGuestInto } from "./guestMerge";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

/** In-memory admin client: profiles and plans by user_id, auth users by id. */
function fakeAdmin(users: Record<string, { is_anonymous?: boolean }>, data: { profiles: Row[]; plans: Row[] }) {
  const deleted: string[] = [];
  const from = (table: "profiles" | "plans") => {
    let filter: [string, unknown] | null = null;
    const rows = () => data[table].filter((r) => !filter || r[filter[0]] === filter[1]);
    const builder = {
      select: () => builder,
      eq: (c: string, v: unknown) => ((filter = [c, v]), builder),
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: rows().at(-1) ?? null, error: null }),
      insert: async (row: Row) => (data[table].push(row), { error: null }),
    };
    return builder;
  };
  const admin = {
    from,
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: users[id] ? { id, ...users[id] } : null } }),
        deleteUser: async (id: string) => (deleted.push(id), { error: null }),
      },
    },
  } as unknown as SupabaseClient;
  return { admin, deleted, data };
}

const guestProfile = { user_id: "g", age: 60, created_at: "x", updated_at: "y" };
const guestPlan = { id: "p1", user_id: "g", week_start: "2026-11-23", plan: [], created_at: "z" };

describe("mergeGuestInto", () => {
  it("an account without a profile gets the guest's profile and latest plan; the guest is deleted", async () => {
    const f = fakeAdmin({ g: { is_anonymous: true } }, { profiles: [guestProfile], plans: [guestPlan] });
    expect(await mergeGuestInto(f.admin, "g", "u")).toBe("merged");
    expect(f.data.profiles).toContainEqual({ user_id: "u", age: 60 });
    expect(f.data.plans).toContainEqual({ user_id: "u", week_start: "2026-11-23", plan: [] });
    expect(f.deleted).toEqual(["g"]);
  });

  it("an account with its own profile keeps it; the guest is still deleted", async () => {
    const f = fakeAdmin({ g: { is_anonymous: true } }, { profiles: [guestProfile, { user_id: "u", age: 40 }], plans: [guestPlan] });
    expect(await mergeGuestInto(f.admin, "g", "u")).toBe("kept");
    expect(f.data.profiles.filter((p) => p.user_id === "u")).toEqual([{ user_id: "u", age: 40 }]);
    expect(f.data.plans.filter((p) => p.user_id === "u")).toEqual([]);
    expect(f.deleted).toEqual(["g"]);
  });

  it("never takes data from, or deletes, a user who is not a guest", async () => {
    const f = fakeAdmin({ g: {} }, { profiles: [guestProfile], plans: [guestPlan] });
    expect(await mergeGuestInto(f.admin, "g", "u")).toBe("skipped");
    expect(f.data.profiles).toHaveLength(1);
    expect(f.deleted).toEqual([]);
  });

  it("does nothing when the guest is the account itself", async () => {
    const f = fakeAdmin({ g: { is_anonymous: true } }, { profiles: [guestProfile], plans: [] });
    expect(await mergeGuestInto(f.admin, "g", "g")).toBe("skipped");
    expect(f.deleted).toEqual([]);
  });
});
