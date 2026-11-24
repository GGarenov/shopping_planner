// The app's real translations for tests (English over Bulgarian, like i18n/request.ts).
import { readFileSync } from "node:fs";
import path from "node:path";
import { NAMESPACES, type Locale } from "@/lib/i18n/config";

type Messages = Record<string, unknown>;
const root = path.resolve(__dirname, "..");
const load = (locale: Locale): Messages =>
  Object.fromEntries(NAMESPACES.map((ns) => [ns, JSON.parse(readFileSync(path.join(root, "messages", locale, `${ns}.json`), "utf8"))]));

function merge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = base[k];
    out[k] = v && typeof v === "object" && b && typeof b === "object" ? merge(b as Messages, v as Messages) : v;
  }
  return out;
}

export function messagesFor(locale: Locale): Messages {
  return locale === "bg" ? load("bg") : merge(load("bg"), load("en"));
}
