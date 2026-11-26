// The eBag callback URL: eBag rejects a redirect URI without a scheme, so a bare host in APP_BASE_URL still works.
import { afterEach, describe, expect, it, vi } from "vitest";
import { redirectUri } from "./oauth";

afterEach(() => vi.unstubAllEnvs());

describe("redirectUri", () => {
  it("uses APP_BASE_URL in production, with or without the scheme and a trailing slash", () => {
    for (const base of ["https://pazarko-app.vercel.app", "pazarko-app.vercel.app", " https://pazarko-app.vercel.app/ "]) {
      vi.stubEnv("APP_BASE_URL", base);
      expect(redirectUri("https://other.vercel.app"), base).toBe("https://pazarko-app.vercel.app/api/ebag/callback");
    }
  });

  it("falls back to the request's origin (local dev, or a localhost value copied to the server)", () => {
    vi.stubEnv("APP_BASE_URL", "");
    expect(redirectUri("http://localhost:3000")).toBe("http://localhost:3000/api/ebag/callback");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    expect(redirectUri("https://pazarko-app.vercel.app")).toBe("https://pazarko-app.vercel.app/api/ebag/callback");
  });
});
