// Google sign-in callback: a guest keeps their plan; an existing account takes the guest's data only through
// the encrypted cookie this server set; and the user always lands back inside the app (no open redirects).
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MERGE_COOKIE, sealGuest } from "@/lib/auth/guestMerge";
import { GET } from "./route";

const auth = vi.hoisted(() => ({
  user: null as { id: string; is_anonymous?: boolean } | null,
  exchange: vi.fn(),
  signInWithOAuth: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: auth.user } }),
      exchangeCodeForSession: auth.exchange,
      signInWithOAuth: auth.signInWithOAuth,
    },
  }),
  createAdminClient: () => ({ admin: true }),
}));
const merge = vi.hoisted(() => vi.fn(async () => "merged"));
vi.mock("@/lib/auth/guestMerge", async (orig) => ({ ...(await orig<object>()), mergeGuestInto: merge }));
vi.mock("@/lib/requestLog", () => ({ requestLog: async () => ({ info() {}, warn() {}, error() {} }) }));

beforeAll(() => {
  process.env.EBAG_TOKEN_KEY = randomBytes(32).toString("base64"); // the merge cookie is encrypted with it
});
beforeEach(() => {
  auth.user = null;
  auth.exchange.mockResolvedValue({ data: { user: { id: "u-real" } }, error: null });
  auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/o/oauth2/auth?x=1" }, error: null });
});

function callback(params: Record<string, string>, cookie?: string) {
  const url = new URL("https://app.example/auth/callback");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return GET(new NextRequest(url, { headers: cookie ? { cookie } : {} }));
}
const location = (res: Response) => res.headers.get("location")!;

describe("GET /auth/callback", () => {
  it("a code: exchanges it for the session and returns to `next` with ?account=saved", async () => {
    const res = await callback({ code: "c1", next: "/ebag", provider: "google" });
    expect(auth.exchange).toHaveBeenCalledWith("c1");
    expect(res.status).toBe(303);
    expect(location(res)).toBe("https://app.example/ebag?account=saved");
    expect(merge).not.toHaveBeenCalled();
  });

  it("never redirects outside the app", async () => {
    for (const next of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
      const res = await callback({ code: "c1", next });
      expect(location(res), next).toBe("https://app.example/plan?account=saved");
    }
  });

  it("no code, a failed exchange or a cancelled sign-in: ?account=failed", async () => {
    expect(location(await callback({ next: "/plan" }))).toMatch(/\?account=failed$/);
    expect(location(await callback({ error: "access_denied", next: "/plan" }))).toMatch(/\?account=failed$/);
    auth.exchange.mockResolvedValue({ data: { user: null }, error: { code: "bad_code", status: 400 } });
    expect(location(await callback({ code: "c1" }))).toMatch(/\?account=failed$/);
  });

  it("the Google account already exists: a guest signs in to it instead, carrying their ID in the sealed cookie", async () => {
    auth.user = { id: "g-1", is_anonymous: true };
    const res = await callback({ error_code: "identity_already_exists", next: "/plan", provider: "google" });
    expect(location(res)).toBe("https://accounts.google.com/o/oauth2/auth?x=1");
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://app.example/auth/callback?next=%2Fplan&provider=google" },
    });
    expect(res.headers.get("set-cookie")).toContain(`${MERGE_COOKIE}=v1.`);
  });

  it("…but not for someone who is not a guest, or with an unknown provider", async () => {
    auth.user = { id: "u-1" };
    expect(location(await callback({ error_code: "identity_already_exists", provider: "google" }))).toMatch(/account=failed$/);
    auth.user = { id: "g-1", is_anonymous: true };
    expect(location(await callback({ error_code: "identity_already_exists", provider: "github" }))).toMatch(/account=failed$/);
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("back from that sign-in: the guest's data moves to the account, and the cookie is cleared", async () => {
    const res = await callback({ code: "c2", next: "/plan", provider: "google" }, `${MERGE_COOKIE}=${sealGuest("g-1")}`);
    expect(merge).toHaveBeenCalledWith({ admin: true }, "g-1", "u-real");
    expect(location(res)).toBe("https://app.example/plan?account=saved");
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${MERGE_COOKIE}=;.*Max-Age=0`));
  });

  it("a forged or tampered cookie moves nothing", async () => {
    await callback({ code: "c2" }, `${MERGE_COOKIE}=v1.forged.cookie.value`);
    const sealed = sealGuest("g-1");
    await callback({ code: "c2" }, `${MERGE_COOKIE}=${sealed.slice(0, -2)}xx`);
    expect(merge).not.toHaveBeenCalled();
  });
});
