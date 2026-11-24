// Shared Sentry options for the browser, the Node.js server and the edge middleware.
// Off unless NEXT_PUBLIC_SENTRY_DSN is set (so local runs, tests and forks send nothing).
// No personal data: no IPs, cookies or request bodies; user IDs only as the same one-way reference the logs use.
import type { ErrorEvent, EventHint } from "@sentry/nextjs";
import { redact, userRef } from "@/lib/log";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** Strips anything personal from an event before it leaves the app. */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  void _hint;
  if (event.user) event.user = event.user.id ? { id: userRef(String(event.user.id)) ?? undefined } : undefined;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      const { "user-agent": ua, "x-request-id": rid } = event.request.headers;
      event.request.headers = { ...(ua ? { "user-agent": ua } : {}), ...(rid ? { "x-request-id": rid } : {}) };
    }
    if (event.request.query_string) event.request.query_string = "[redacted]";
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }
  if (event.extra) event.extra = redact(event.extra) as Record<string, unknown>;
  return event;
}

export const sentryOptions = {
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  beforeSend: scrubEvent,
};
