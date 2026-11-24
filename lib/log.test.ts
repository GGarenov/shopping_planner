import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => captureException(...a) }));
const { createLogger, redact, serializeError, userRef } = await import("./log");

describe("userRef", () => {
  it("is short, stable and does not contain the ID", () => {
    const id = "6f1c2a7e-1234-4cde-9abc-0123456789ab";
    expect(userRef(id)).toMatch(/^u_[0-9a-f]{8}$/);
    expect(userRef(id)).toBe(userRef(id));
    expect(userRef(id)).not.toBe(userRef(`${id}x`));
    expect(userRef(id)).not.toContain("6f1c2a7e");
    expect(userRef(null)).toBeNull();
  });
});

describe("redact", () => {
  it("removes secrets and personal data, pseudonymises user IDs, keeps the rest", () => {
    const out = redact({
      email: "a@b.bg",
      password: "x",
      access_token: "t",
      tokens_encrypted: "…",
      headers: { authorization: "Bearer x", cookie: "sb=1", "user-agent": "UA" },
      user: "user-1",
      userId: "user-1",
      budget: 50,
      list: [{ refresh_token: "r", ok: true }],
    }) as Record<string, unknown>;
    expect(out).toMatchObject({
      email: "[redacted]",
      password: "[redacted]",
      access_token: "[redacted]",
      tokens_encrypted: "[redacted]",
      headers: { authorization: "[redacted]", cookie: "[redacted]", "user-agent": "UA" },
      user: userRef("user-1"),
      userId: userRef("user-1"),
      budget: 50,
      list: [{ refresh_token: "[redacted]", ok: true }],
    });
  });

  it("serialises errors (with their cause) and stops at a safe depth", () => {
    const e = new Error("outer", { cause: new Error("inner") });
    expect(serializeError(e)).toMatchObject({ name: "Error", message: "outer", cause: { message: "inner" } });
    expect(serializeError("plain")).toEqual({ message: "plain" });
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 10; i++) deep = deep.next = {};
    expect(JSON.stringify(redact(root))).toContain("[deep]");
  });
});

describe("createLogger", () => {
  let out: ReturnType<typeof vi.spyOn>;
  let err: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    process.env.LOG_LEVEL = "info";
    out = vi.spyOn(console, "log").mockImplementation(() => {});
    err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.LOG_LEVEL;
  });
  const line = (spy: ReturnType<typeof vi.spyOn>) => JSON.parse(String(spy.mock.calls.at(-1)![0]));

  it("writes one JSON line with level, time, message and the bound fields", () => {
    createLogger({ requestId: "r-1" }).child({ route: "POST /api/plan" }).info("plan.created", { total_s: 3.1, user: "user-1" });
    expect(line(out)).toMatchObject({ level: "info", msg: "plan.created", requestId: "r-1", route: "POST /api/plan", total_s: 3.1 });
    expect(line(out).user).toBe(userRef("user-1"));
    expect(Date.parse(line(out).time)).not.toBeNaN();
  });

  it("errors go to stderr with the error serialised, and to Sentry", () => {
    const e = new Error("db down");
    createLogger().error("plan.load_failed", { err: e, email: "x@y.z" });
    expect(line(err)).toMatchObject({ level: "error", err: { message: "db down" }, email: "[redacted]" });
    expect(captureException).toHaveBeenCalledWith(
      e,
      expect.objectContaining({ extra: expect.objectContaining({ msg: "plan.load_failed" }) }),
    );
  });

  it("respects LOG_LEVEL, and is silent in tests by default", () => {
    process.env.LOG_LEVEL = "warn";
    createLogger().info("hidden");
    expect(out).not.toHaveBeenCalled();
    delete process.env.LOG_LEVEL; // NODE_ENV=test → silent
    createLogger().warn("hidden too");
    createLogger().debug("and this");
    expect(console.warn).not.toHaveBeenCalled();
  });
});
