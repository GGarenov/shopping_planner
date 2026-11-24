import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, errorText } from "./client";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const contract = (status: number, code: string, message: string) => json({ error: { code, message, requestId: "r-1" } }, status);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** A fetch that never answers, but stops when aborted (like the real one). */
const hang = (_url: string, init: RequestInit) =>
  new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

describe("apiFetch", () => {
  it("sends JSON and returns the parsed answer", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: "p1" }));
    await expect(apiFetch("/api/plan", { method: "POST", body: { a: 1 } })).resolves.toEqual({ id: "p1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/plan");
    expect(init).toMatchObject({ method: "POST", body: '{"a":1}', headers: { "Content-Type": "application/json" }, cache: "no-store" });
  });

  it("turns the error contract into an ApiError with the server's code and message", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: "budget_too_low", message: "Малък бюджет.", details: { min_budget_eur: 60 } } }, 422),
    );
    const e = await apiFetch("/api/plan", { method: "POST" }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({
      status: 422,
      code: "budget_too_low",
      message: "Малък бюджет.",
      details: { min_budget_eur: 60 },
      offline: false,
    });
  });

  it("a non-JSON error page becomes code «internal» with the request ID from the header", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>502</html>", { status: 500, headers: { "x-request-id": "r-9" } }));
    await expect(apiFetch("/x", { method: "POST" })).rejects.toMatchObject({
      status: 500,
      code: "internal",
      message: "",
      requestId: "r-9",
    });
  });

  it("GET: retries quietly on 503 / network errors, then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(contract(503, "internal", "busy"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json({ ok: true }));
    await expect(apiFetch("/api/ebag/cart", { backoffMs: 1 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("GET: gives up after the retries with the last error", async () => {
    fetchMock.mockImplementation(async () => contract(502, "ebag_down", "eBag не отговаря."));
    await expect(apiFetch("/api/ebag/cart", { backoffMs: 1 })).rejects.toMatchObject({ status: 502, code: "ebag_down" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never retries a 4xx (the answer will not change)", async () => {
    fetchMock.mockResolvedValue(contract(409, "reconnect", "Свържи eBag отново."));
    await expect(apiFetch("/api/ebag/cart", { backoffMs: 1 })).rejects.toMatchObject({ code: "reconnect" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("writes are not retried: a network error is reported at once as offline", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const e = (await apiFetch("/api/ebag/cart", { method: "POST", body: {} }).catch((x: unknown) => x)) as ApiError;
    expect(e).toMatchObject({ status: 0, code: "network", offline: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out a request that never answers", async () => {
    fetchMock.mockImplementation(hang);
    await expect(apiFetch("/api/plan", { method: "POST", timeoutMs: 20 })).rejects.toMatchObject({ status: 0, code: "timeout" });
  });

  it("a cancel by the caller is passed through, not turned into an error message", async () => {
    fetchMock.mockImplementation(hang);
    const ctrl = new AbortController();
    const p = apiFetch("/x", { signal: ctrl.signal, timeoutMs: 5_000 });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("errorText", () => {
  const fb = { offline: "offline", timeout: "slow", other: "other" };
  it("prefers the server's message, then a fallback that fits the failure", () => {
    expect(errorText(new ApiError(422, "no_plan", "Няма план."), fb)).toBe("Няма план.");
    expect(errorText(new ApiError(0, "network", ""), fb)).toBe("offline");
    expect(errorText(new ApiError(0, "timeout", ""), fb)).toBe("slow");
    expect(errorText(new ApiError(0, "timeout", ""), { offline: "offline", other: "other" })).toBe("offline");
    expect(errorText(new ApiError(500, "internal", ""), fb)).toBe("other");
    expect(errorText(new TypeError("x"), fb)).toBe("offline");
  });
});
