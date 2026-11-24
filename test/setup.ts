// Shared setup for component tests (files that opt into `// @vitest-environment jsdom`).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// The App Router hooks need a running Next.js app; tests get simple spies instead.
export const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/plan",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
}));

// next-intl's client hooks are use-intl plus a Next.js router lookup (useParams), which needs a running Next.js app.
// In tests the same translations come straight from use-intl; NextIntlClientProvider is use-intl's IntlProvider.
vi.mock("next-intl", async () => {
  const intl = await vi.importActual<typeof import("use-intl")>("use-intl");
  return { ...intl, NextIntlClientProvider: intl.IntlProvider };
});
