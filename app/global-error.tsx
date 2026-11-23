"use client";

/** Last-resort error page (the root layout itself failed) — must render its own <html>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="bg">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Нещо се обърка</h1>
        <p>Опитай отново след малко.</p>
        <button type="button" onClick={reset} style={{ padding: 12, borderRadius: 12, fontSize: 16 }}>
          Опитай пак
        </button>
      </body>
    </html>
  );
}
