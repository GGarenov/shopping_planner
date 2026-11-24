import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, errorBody, parseErrorBody } from "./errors";

vi.mock("next-intl/server", async () => (await import("@/test/server")).intlServer);
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => captureException(...a) }));
const { apiHandler } = await import("./handler");
const { intl } = await import("@/test/server");

beforeEach(() => {
  intl.locale = "bg";
});

const req = (id?: string) => new Request("http://localhost/api/x", { headers: id ? { "x-request-id": id } : {} });

describe("apiHandler", () => {
  it("passes the answer through and echoes the request ID from middleware", async () => {
    const handler = apiHandler<[Request]>("GET /api/x", async ({ requestId }) => Response.json({ requestId }));
    const res = await handler(req("req-42"));
    expect(await res.json()).toEqual({ requestId: "req-42" });
    expect(res.headers.get("x-request-id")).toBe("req-42");
  });

  it("an AppError becomes the error contract with its status (not reported to Sentry)", async () => {
    const handler = apiHandler("GET /api/x", async () => {
      throw new AppError(422, "budget_too_low", "Бюджетът е малък.", { min_budget_eur: 60 });
    });
    const res = await handler();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: { code: "budget_too_low", message: "Бюджетът е малък.", requestId: expect.any(String), details: { min_budget_eur: 60 } },
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("anything else: 500 «something went wrong» in the user's language, reported once, internals hidden", async () => {
    intl.locale = "en";
    const boom = new Error("connection string postgres://secret");
    const handler = apiHandler<[Request]>("GET /api/x", async () => {
      throw boom;
    });
    const res = await handler(req("req-7"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: { code: "internal", message: "Something went wrong. Please try again.", requestId: "req-7" } });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(boom, expect.anything());
  });

  it("keeps working for redirects (immutable headers)", async () => {
    const handler = apiHandler("GET /api/x", async () => Response.redirect("http://localhost/ebag", 303));
    expect((await handler()).status).toBe(303);
  });
});

describe("error contract helpers", () => {
  it("errorBody leaves out empty extras", () => {
    expect(errorBody("not_found", "Няма го.")).toEqual({ error: { code: "not_found", message: "Няма го." } });
  });

  it("parseErrorBody reads the contract and rejects anything else", () => {
    expect(parseErrorBody({ error: { code: "reconnect", message: "m", requestId: "r" } })).toEqual({
      code: "reconnect",
      message: "m",
      requestId: "r",
    });
    expect(parseErrorBody({ error: { code: "made_up", message: "m" } })?.code).toBe("internal");
    expect(parseErrorBody({ error: "old string shape" })).toBeNull();
    expect(parseErrorBody({ error: { code: "x" } })).toBeNull();
    expect(parseErrorBody(null)).toBeNull();
  });
});
