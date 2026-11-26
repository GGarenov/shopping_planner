import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as { id: string; is_anonymous?: boolean } | null }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }),
}));
const { updateSession } = await import("./middleware");

const request = (path: string, headers: Record<string, string> = {}) => new NextRequest(`http://localhost${path}`, { headers });

beforeEach(() => {
  auth.user = null;
});

describe("middleware (updateSession)", () => {
  it("gives every request an ID, passes it on to the app and back to the browser", async () => {
    auth.user = { id: "u1" };
    const res = await updateSession(request("/plan"));
    const id = res.headers.get("x-request-id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("x-middleware-request-x-request-id")).toBe(id); // forwarded to route handlers / actions
  });

  it("uses Vercel's own request ID when there is one, and ignores one sent by the browser", async () => {
    auth.user = { id: "u1" };
    const res = await updateSession(request("/plan", { "x-vercel-id": "fra1::abc", "x-request-id": "spoofed" }));
    expect(res.headers.get("x-request-id")).toBe("fra1::abc");
  });

  it("logged out: pages redirect to /login, API calls get the 401 error contract", async () => {
    const page = await updateSession(request("/plan"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://localhost/login");
    expect(page.headers.get("x-request-id")).toBeTruthy();

    const api = await updateSession(request("/api/plan", { cookie: "lang=en" }));
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: { code: "unauthorized", message: "Please log in again.", requestId: expect.any(String) } });
  });

  it("logged out: the start page is the welcome page; it and the questions need no account", async () => {
    const home = await updateSession(request("/"));
    expect(home.headers.get("location")).toBe("http://localhost/welcome");
    for (const path of ["/welcome", "/onboarding", "/install"]) {
      const res = await updateSession(request(path));
      expect(res.status, path).toBe(200);
      expect(res.headers.get("location"), path).toBeNull();
    }
  });

  it("a guest may open /login (to sign in to a real account)", async () => {
    auth.user = { id: "g1", is_anonymous: true };
    const res = await updateSession(request("/login"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("/api/health is public (for uptime monitors)", async () => {
    const res = await updateSession(request("/api/health"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("logged in: /login sends the user home", async () => {
    auth.user = { id: "u1" };
    const res = await updateSession(request("/login"));
    expect(res.headers.get("location")).toBe("http://localhost/");
  });

  it("signed in (a guest too): the welcome page sends them home", async () => {
    for (const user of [{ id: "u1" }, { id: "g1", is_anonymous: true }]) {
      auth.user = user;
      const res = await updateSession(request("/welcome"));
      expect(res.headers.get("location")).toBe("http://localhost/");
    }
  });
});
