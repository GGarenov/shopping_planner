// Renders a component with the app's real translations (messages/<locale>/*.json, English over Bulgarian like
// i18n/request.ts), so tests assert on the texts users actually see.
import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "./messages";

export { messagesFor };

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

/** An API error response in the app's error contract (lib/api/errors.ts). */
export const apiError = (status: number, code: string, message: string, details?: Record<string, unknown>) =>
  json({ error: { code, message, ...(details ? { details } : {}) } }, status);
