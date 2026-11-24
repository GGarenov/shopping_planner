import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import createNextIntlPlugin from "next-intl/plugin";

// Language from the `lang` cookie, messages from messages/<locale>/*.json (see i18n/request.ts).
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // E2E tests build into their own folder (with the test project's keys), so they never replace the normal build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The planner uses the `highs` WASM solver; keep it out of the bundler so the
  // .wasm file is traced and shipped with the serverless function (SPEC §7.2).
  serverExternalPackages: ["highs"],
  outputFileTracingIncludes: {
    "/api/plan": ["./node_modules/highs/build/*.wasm"],
  },
};

// Sentry (see instrumentation*.ts): uploads source maps at build time only when SENTRY_AUTH_TOKEN, SENTRY_ORG and
// SENTRY_PROJECT are set (Vercel), so stack traces show the real code. Without them the build is unchanged.
const uploadSourceMaps = !!(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !uploadSourceMaps, deleteSourcemapsAfterUpload: true },
  widenClientFileUpload: uploadSourceMaps,
});
