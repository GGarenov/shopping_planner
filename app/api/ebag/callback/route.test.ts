// The eBag OAuth callback is the security-sensitive step: it must only accept the flow this browser started
// (state + encrypted PKCE cookie), from eBag (iss), for the logged-in user — and never store tokens otherwise.
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FLOW_COOKIE, sealFlow } from "@/lib/ebag/flowCookie";
import { fakeSupabase } from "@/test/server";
import { GET } from "./route";

const db = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client, createAdminClient: () => ({ admin: true }) }));

const saveConnection = vi.fn(async () => {});
vi.mock("@/lib/ebag/oauth", () => ({
  EBAG_ISSUER: "https://ebag.bg",
  EBAG_RESOURCE: "https://ebag.bg/mcp",
  getMetadata: async () => ({ issuer: "https://ebag.bg" }),
  getAppClient: async () => ({ client_id: "app-client" }),
  saveConnection: (...a: unknown[]) => saveConnection(...(a as [])),
}));
const exchangeAuthorization = vi.fn();
vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({ exchangeAuthorization: (...a: unknown[]) => exchangeAuthorization(...a) }));
vi.spyOn(console, "error").mockImplementation(() => {});

const USER = "user-1";
const REDIRECT = "https://app.example/api/ebag/callback";

beforeAll(() => {
  process.env.EBAG_TOKEN_KEY = randomBytes(32).toString("base64"); // the flow cookie is encrypted with it
});
beforeEach(() => {
  db.client = fakeSupabase({ user: { id: USER } }).client;
  exchangeAuthorization.mockResolvedValue({ access_token: "a", refresh_token: "r", token_type: "Bearer" });
});

function callback(params: Record<string, string>, flow: Partial<Parameters<typeof sealFlow>[0]> | null = {}) {
  const url = new URL("https://app.example/api/ebag/callback");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = new Headers();
  if (flow)
    headers.set("cookie", `${FLOW_COOKIE}=${sealFlow({ state: "st-1", verifier: "ver-1", userId: USER, redirect: REDIRECT, ...flow })}`);
  return GET(new NextRequest(url, { headers }));
}
const where = (res: Response) => new URL(res.headers.get("location")!).search;

describe("GET /api/ebag/callback", () => {
  it("connects: exchanges the code with the PKCE verifier, stores the tokens, clears the flow cookie", async () => {
    const res = await callback({ code: "code-1", state: "st-1", iss: "https://ebag.bg" });
    expect(res.status).toBe(303);
    expect(where(res)).toBe("?connected=1");
    expect(exchangeAuthorization).toHaveBeenCalledWith(
      "https://ebag.bg",
      expect.objectContaining({ authorizationCode: "code-1", codeVerifier: "ver-1", redirectUri: REDIRECT }),
    );
    expect(saveConnection).toHaveBeenCalledWith(
      { admin: true },
      USER,
      expect.objectContaining({ redirect: REDIRECT, tokens: expect.objectContaining({ refresh_token: "r" }) }),
      true,
    );
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${FLOW_COOKIE}=;.*Max-Age=0`, "i"));
  });

  it.each([
    ["the user said no at eBag", { error: "access_denied" }, {}, "?error=denied"],
    ["eBag returned another error", { error: "server_error" }, {}, "?error=ebag"],
    ["state does not match (forged / replayed request)", { code: "c", state: "other" }, {}, "?error=state"],
    ["no flow cookie (flow not started in this browser)", { code: "c", state: "st-1" }, null, "?error=state"],
    ["issuer is not eBag", { code: "c", state: "st-1", iss: "https://evil.example" }, {}, "?error=state"],
    ["flow belongs to another user", { code: "c", state: "st-1" }, { userId: "someone-else" }, "?error=state"],
  ] as const)("rejects when %s — no tokens stored", async (_why, params, flow, expected) => {
    const res = await callback(params, flow);
    expect(where(res)).toBe(expected);
    expect(exchangeAuthorization).not.toHaveBeenCalled();
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it("rejects an expired flow cookie", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-24T10:00:00Z") });
    const cookie = sealFlow({ state: "st-1", verifier: "v", userId: USER, redirect: REDIRECT });
    vi.setSystemTime(new Date("2026-11-24T10:11:00Z")); // 11 minutes later (cookie lives 10)
    const url = new URL("https://app.example/api/ebag/callback?code=c&state=st-1");
    const res = await GET(new NextRequest(url, { headers: { cookie: `${FLOW_COOKIE}=${cookie}` } }));
    vi.useRealTimers();
    expect(where(res)).toBe("?error=state");
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it("reports a failed code exchange without storing anything", async () => {
    exchangeAuthorization.mockRejectedValueOnce(new Error("invalid_grant"));
    const res = await callback({ code: "code-1", state: "st-1" });
    expect(where(res)).toBe("?error=exchange");
    expect(saveConnection).not.toHaveBeenCalled();
  });
});
