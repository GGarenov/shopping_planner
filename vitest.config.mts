import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Next.js compiles JSX itself (tsconfig "jsx": "preserve"); for tests use the automatic React runtime.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // "server-only" throws outside a React Server Components build; route-handler tests run plain Node.
      "server-only": path.resolve(__dirname, "test/empty.ts"),
    },
  },
  test: {
    // Unit tests run in Node; component tests (*.test.tsx) opt into jsdom with a `// @vitest-environment jsdom` comment.
    include: ["lib/**/*.test.ts", "app/**/*.test.{ts,tsx}", "components/**/*.test.tsx", "scripts/**/*.test.ts", "test/rls/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      // Unit-test coverage of the domain logic. Code that only talks to Supabase / eBag / the browser is excluded
      // here and is covered by the API-route, RLS and end-to-end tests instead (docs/notes plan, Phase 2).
      include: ["lib/**/*.ts"],
      exclude: [
        "lib/**/*.test.ts",
        "lib/supabase/client.ts", // Supabase client factories
        "lib/supabase/server.ts",
        "lib/requestLog.ts", // next/headers glue
        "lib/**/load.ts", // DB reads (planner data, plans, profile)
        "lib/sync/status.ts", // DB read
        "lib/ebag/api.ts", // MCP network client
        "lib/ebag/oauth.ts", // OAuth + DB
        "lib/ebag/session.ts", // route wrapper (auth + DB + network)
        "lib/ebag/ownerTokens.ts", // DB-backed token store
        "lib/i18n/content.ts", // JSON lookups
        "lib/recipes/images.ts", // JSON lookups
        "lib/ebag/flowCookie.ts", // server-only cookie wiring (OAuth route tests)
      ],
      reporter: ["text-summary", "text", "html", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      // Ratchet: set just below today's numbers so coverage can only go up. Raise them as tests are added.
      thresholds: { lines: 95, functions: 92, branches: 82, statements: 94 },
    },
  },
});
