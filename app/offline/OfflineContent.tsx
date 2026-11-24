"use client";

import { useEffect, useState } from "react";
import bg from "@/messages/bg/profile.json";
import en from "@/messages/en/profile.json";

/** The offline page is built once (no cookies at build time), so the language is read from the `lang` cookie after mount. */
export function OfflineContent() {
  const [locale, setLocale] = useState<"bg" | "en">("bg");
  useEffect(() => {
    if (/(?:^|;\s*)lang=en(?:;|$)/.test(document.cookie)) setLocale("en");
  }, []);
  const t = (locale === "en" ? en : bg).pages;
  return (
    <>
      <h1 className="text-2xl font-bold">{t.offlineTitle}</h1>
      <p className="text-subtle">{t.offlineText}</p>
      {/* Full page load on purpose: retries the network instead of client-side routing. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="btn-primary">
        {t.retry}
      </a>
    </>
  );
}
