// Guests: Supabase anonymous users (docs/notes/loginless.md). Safe on the client and the server.

/** Social sign-in: Google only (decided 2026-11-26 — no Facebook). */
export type SocialProvider = "google";
export const isSocialProvider = (v: unknown): v is SocialProvider => v === "google";

/** A user without an account: data kept for 3 days, no eBag. */
export const isGuest = (user: { is_anonymous?: boolean } | null | undefined): boolean => !!user?.is_anonymous;

/** Result of the account step, shown once on the page the user returns to (?account=…). */
export type AccountStatus = "saved" | "failed";
export const accountStatus = (v: string | undefined): AccountStatus | null => (v === "saved" || v === "failed" ? v : null);

/** Same-site relative path only (no open redirects). */
export const safeNext = (v: string | null | undefined, fallback = "/plan"): string =>
  v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback;
