// The one error shape every API route returns, shared by the server (AppError → JSON) and the client (apiFetch).
//   HTTP 4xx/5xx + { "error": { "code": "budget_too_low", "message": "…", "requestId": "…", "details": { … } } }
// `message` is already translated into the user's language and safe to show; `code` is for the client's logic.

export const ERROR_CODES = [
  "unauthorized", // 401: not logged in (or the session expired)
  "invalid_request", // 400: the body or parameters are wrong
  "profile_incomplete", // 400: onboarding not finished
  "not_found", // 404
  "reconnect", // 409: the eBag connection is missing or expired
  "budget_too_low", // 422: planner — details.min_budget_eur
  "no_recipes", // 422: planner — not enough recipes for the diet / exclusions
  "no_plan", // 422: planner — no plan for another reason
  "timeout", // 422 from the planner, or a client-side timeout
  "load_failed", // 500: reference data could not be loaded
  "save_failed", // 500: the result could not be saved
  "ebag_down", // 502: eBag did not answer
  "internal", // 500: anything unexpected
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; requestId?: string; details?: Record<string, unknown> };
}

/** An expected failure: thrown inside apiHandler(), answered with its status and code, logged as a warning. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorBody(
  code: ErrorCode,
  message: string,
  extra: { requestId?: string; details?: Record<string, unknown> } = {},
): ApiErrorBody {
  return {
    error: {
      code,
      message,
      ...(extra.requestId ? { requestId: extra.requestId } : {}),
      ...(extra.details ? { details: extra.details } : {}),
    },
  };
}

/** Reads the error contract from a parsed response body (null when the body is something else). */
export function parseErrorBody(body: unknown): ApiErrorBody["error"] | null {
  const e = (body as { error?: unknown } | null)?.error;
  if (!e || typeof e !== "object") return null;
  const { code, message } = e as { code?: unknown; message?: unknown };
  if (typeof message !== "string") return null;
  return {
    ...(e as ApiErrorBody["error"]),
    code: (ERROR_CODES as readonly string[]).includes(code as string) ? (code as ErrorCode) : "internal",
  };
}
