// apiFetch(): the one way the browser calls the app's API.
//  - JSON in, JSON out; a non-2xx answer becomes an ApiError with the server's code and (translated) message;
//  - a timeout per attempt (AbortController), so a hung request never leaves a spinner forever;
//  - retries only where it is safe: GETs, on a network error, a timeout or 502/503/504/429, with backoff.
//    Writes are never retried automatically (adding to the eBag cart twice would add twice).
import { parseErrorBody, type ErrorCode } from "./errors";

/** Client-side failures in addition to the server's codes. */
export type ClientErrorCode = ErrorCode | "network";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    /** The server's user-facing message ("" when there is none: use your own fallback). */
    message: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
  /** No answer at all: offline, DNS, the request timed out. */
  get offline() {
    return this.code === "network" || (this.code === "timeout" && this.status === 0);
  }
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Per attempt. Default 15 s. */
  timeoutMs?: number;
  /** Extra attempts after the first. Default: 2 for GET, 0 otherwise. */
  retries?: number;
  signal?: AbortSignal;
  /** For tests. */
  backoffMs?: number;
}

const RETRY_STATUS = new Set([429, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function apiFetch<T>(url: string, opts: ApiFetchOptions = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const retries = opts.retries ?? (method === "GET" ? 2 : 0);
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const backoff = opts.backoffMs ?? 400;

  for (let attempt = 0; ; attempt++) {
    const last = attempt >= retries;
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        cache: "no-store",
        signal: ctrl.signal,
        headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      if (opts.signal?.aborted) throw e; // the caller cancelled: not an error to show
      if (!last) {
        await sleep(backoff * 2 ** attempt);
        continue;
      }
      throw new ApiError(0, timedOut ? "timeout" : "network", "");
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }

    if (!res.ok && RETRY_STATUS.has(res.status) && !last) {
      await sleep(backoff * 2 ** attempt);
      continue;
    }
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return body as T;
    const err = parseErrorBody(body);
    throw new ApiError(
      res.status,
      err?.code ?? "internal",
      err?.message ?? "",
      err?.details,
      err?.requestId ?? res.headers.get("x-request-id") ?? undefined,
    );
  }
}

/** The message to show for a failed call: the server's own, or a fallback for offline / unknown errors. */
export function errorText(e: unknown, fallback: { offline: string; other: string; timeout?: string }): string {
  if (e instanceof ApiError) {
    if (e.message) return e.message;
    if (e.status === 0 && e.code === "timeout") return fallback.timeout ?? fallback.offline;
    return e.offline ? fallback.offline : fallback.other;
  }
  return fallback.offline; // fetch itself threw: no connection
}
