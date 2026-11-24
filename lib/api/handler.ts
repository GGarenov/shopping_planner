// apiHandler(): the wrapper around every API route handler.
//  - gives the handler a logger bound to the request ID (set by middleware.ts) and the route name;
//  - turns a thrown AppError into the error contract (lib/api/errors.ts) with its status — logged as a warning;
//  - turns anything else into a 500 «something went wrong» — logged once as an error and reported to Sentry;
//  - writes one summary line per request (status, duration) and echoes the request ID in a response header.
import "server-only";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createLogger, type Logger } from "@/lib/log";
import { AppError, errorBody } from "./errors";

export const REQUEST_ID_HEADER = "x-request-id";

export interface ApiContext {
  log: Logger;
  requestId: string;
}

export function requestIdOf(req: Request | undefined): string {
  return req?.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
}

export function apiHandler<Args extends unknown[]>(
  route: string,
  handler: (ctx: ApiContext, ...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const t0 = Date.now();
    const req = args[0] instanceof Request ? args[0] : undefined;
    const requestId = requestIdOf(req);
    const log = createLogger({ requestId, route });
    let res: Response;
    try {
      res = await handler({ log, requestId }, ...args);
    } catch (e) {
      if (e instanceof AppError) {
        log.warn("request.rejected", { status: e.status, code: e.code });
        res = NextResponse.json(errorBody(e.code, e.message, { requestId, details: e.details }), { status: e.status });
      } else {
        log.error("request.failed", { err: e });
        const message = await getTranslations("common")
          .then((t) => t("somethingWrong"))
          .catch(() => "Something went wrong.");
        res = NextResponse.json(errorBody("internal", message, { requestId }), { status: 500 });
      }
    }
    try {
      res.headers.set(REQUEST_ID_HEADER, requestId);
    } catch {
      // immutable headers (e.g. Response.redirect) — the request ID is still in the logs
    }
    log.info("request.done", { status: res.status, ms: Date.now() - t0 });
    return res;
  };
}
