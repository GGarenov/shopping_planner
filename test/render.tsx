// Renders a component with the app's real translations (messages/<locale>/*.json, English over Bulgarian like
// i18n/request.ts), so tests assert on the texts users actually see.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
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

export function renderWithIntl(
  ui: ReactElement,
  { locale = "bg" }: { locale?: Locale } = {},
): RenderResult & { user: ReturnType<typeof userEvent.setup> } {
  const user = userEvent.setup();
  const result = render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)} timeZone="Europe/Sofia">
      {ui}
    </NextIntlClientProvider>,
  );
  return { ...result, user };
}

/** A fetch Response with a JSON body. */
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
