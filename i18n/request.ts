// next-intl without locale routing: the language comes from the `lang` cookie (default Bulgarian), URLs stay the same.
import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, NAMESPACES, type Locale } from "@/lib/i18n/config";

type Messages = Record<string, unknown>;

async function load(locale: Locale): Promise<Messages> {
  const parts = await Promise.all(
    NAMESPACES.map((ns) => import(`../messages/${locale}/${ns}.json`).then((m) => [ns, m.default as Messages] as const)),
  );
  return Object.fromEntries(parts);
}

/** English on top of Bulgarian: a missing English key shows the Bulgarian text instead of breaking. */
function merge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = base[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" ? merge(b as Messages, v as Messages) : v;
  }
  return out;
}

export default getRequestConfig(async () => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(value) ? value : DEFAULT_LOCALE;
  const bg = await load("bg");
  const messages = locale === "bg" ? bg : merge(bg, await load("en"));
  return { locale, messages, timeZone: "Europe/Sofia" };
});
