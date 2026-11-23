import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The planner uses the `highs` WASM solver; keep it out of the bundler so the
  // .wasm file is traced and shipped with the serverless function (SPEC §7.2).
  serverExternalPackages: ["highs"],
  outputFileTracingIncludes: {
    "/api/plan": ["./node_modules/highs/build/*.wasm"],
  },
};

export default nextConfig;
