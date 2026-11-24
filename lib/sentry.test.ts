import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { userRef } from "./log";
import { scrubEvent, sentryOptions } from "./sentry";

describe("Sentry", () => {
  it("is off without a DSN and never sends default personal data", () => {
    expect(sentryOptions.enabled).toBe(false);
    expect(sentryOptions.sendDefaultPii).toBe(false);
  });

  it("scrubs events: user only as a reference; no cookies, body, query or sensitive headers", () => {
    const event = {
      type: undefined,
      user: { id: "user-1", email: "a@b.bg", ip_address: "1.2.3.4" },
      request: {
        url: "https://app/plan?email=a@b.bg",
        cookies: { sb: "token" },
        data: { password: "x" },
        query_string: "email=a@b.bg",
        headers: { "user-agent": "UA", authorization: "Bearer x", cookie: "sb=1", "x-request-id": "r-1" },
      },
      extra: { access_token: "t", budget: 50 },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event)!;
    expect(out.user).toEqual({ id: userRef("user-1") });
    expect(out.request).toEqual({
      url: "https://app/plan",
      query_string: "[redacted]",
      headers: { "user-agent": "UA", "x-request-id": "r-1" },
    });
    expect(out.extra).toEqual({ access_token: "[redacted]", budget: 50 });
  });
});
