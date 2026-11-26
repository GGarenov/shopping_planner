// Languages and message namespaces. UI text lives in messages/<locale>/<namespace>.json (Bulgarian is the source;
// a key missing in English falls back to Bulgarian). Recipe/ingredient translations: data/i18n/*.en.json.
export const LOCALES = ["bg", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "bg";
export const LOCALE_COOKIE = "lang";

/** One JSON file per area; keep in sync with the files in messages/bg and messages/en. */
export const NAMESPACES = [
  "common",
  "nav",
  "login",
  "install",
  "onboarding",
  "options",
  "targets",
  "plan",
  "recipe",
  "list",
  "ebag",
  "profile",
  "planner",
  "errors",
  "account",
  "welcome",
] as const;

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
