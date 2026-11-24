// Next.js instrumentation: starts Sentry on the server (Node.js and edge) and reports errors thrown while
// rendering pages, in route handlers and server actions (onRequestError). Off without NEXT_PUBLIC_SENTRY_DSN.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") Sentry.init(sentryOptions);
}

export const onRequestError = Sentry.captureRequestError;
