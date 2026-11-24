"use client";

import * as Sentry from "@sentry/nextjs";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

/** Any unexpected error on a screen: a calm message in the user's language and a retry, instead of Next's error page. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("profile.pages");
  useEffect(() => {
    Sentry.captureException(error); // no-op without a DSN
  }, [error]);
  return (
    <main className="page justify-center">
      <h1 className="text-2xl font-bold">{t("errorTitle")}</h1>
      <p className="text-subtle">{t("errorText")}</p>
      {error.digest && <p className="text-xs text-subtle">{t("errorCode", { code: error.digest })}</p>}
      <button type="button" className="btn-primary" onClick={reset}>
        {t("retry")}
      </button>
      {/* plain link: a full reload also recovers from a stale app version after a deploy */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="btn-ghost">
        {t("home")}
      </a>
    </main>
  );
}
