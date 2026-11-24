// /api/health on the real server: public (no login), reaches the test database, carries a request ID.
import { expect, test } from "@playwright/test";

test("health check answers without a login and reaches the database", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["x-request-id"]).toBeTruthy();
  expect(res.headers()["cache-control"]).toBe("no-store");
  const body = await res.json();
  expect(["ok", "degraded"]).toContain(body.status); // degraded = the test project's prices are older than 36 h
  expect(body.checks.database.ok).toBe(true);
});

test("API calls without a login get the error contract, not an HTML page", async ({ request }) => {
  const res = await request.post("/api/plan");
  expect(res.status()).toBe(401);
  expect(await res.json()).toEqual({
    error: { code: "unauthorized", message: "Влез отново в профила си.", requestId: expect.any(String) },
  });
});
