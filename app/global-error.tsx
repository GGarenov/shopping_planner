"use client";

import { useEffect, useState } from "react";
import bg from "@/messages/bg/profile.json";
import en from "@/messages/en/profile.json";

/** Last-resort error page (the root layout itself failed) — must render its own <html>. No intl provider here:
 *  the language comes straight from the `lang` cookie (read after mount to keep hydration stable). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale, setLocale] = useState<"bg" | "en">("bg");
  useEffect(() => {
    if (/(?:^|;\s*)lang=en(?:;|$)/.test(document.cookie)) setLocale("en");
  }, []);
  const t = (locale === "en" ? en : bg).pages;
  return (
    <html lang={locale}>
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{t.errorTitle}</h1>
        <p>{t.globalErrorText}</p>
        <button type="button" onClick={reset} style={{ padding: 12, borderRadius: 12, fontSize: 16 }}>
          {t.retry}
        </button>
      </body>
    </html>
  );
}
