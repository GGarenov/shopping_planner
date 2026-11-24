// Sentry in the browser: unhandled errors and the error pages (app/error.tsx, app/global-error.tsx) are reported.
// Off without NEXT_PUBLIC_SENTRY_DSN. No session replay: it would record what users type (health data, budget).
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

Sentry.init(sentryOptions);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
