import type { NextConfig } from "next";
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

export default withNextIntl(nextConfig);
