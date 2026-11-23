"use client";

import { useEffect } from "react";

/** Any unexpected error on a screen: a calm Bulgarian message and a retry, instead of Next's English error page. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="page justify-center">
      <h1 className="text-2xl font-bold">Нещо се обърка</h1>
      <p className="opacity-80">Опитай отново. Ако продължава, пиши ни от Профил → Обратна връзка.</p>
      {error.digest && <p className="text-xs opacity-50">Код: {error.digest}</p>}
      <button type="button" className="btn-primary" onClick={reset}>
        Опитай пак
      </button>
      {/* plain link: a full reload also recovers from a stale app version after a deploy */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="btn-ghost">
        Към началото
      </a>
    </main>
  );
}
