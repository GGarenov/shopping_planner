"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CartItemResult } from "@/lib/ebag/cart";
import { ApiError, apiFetch, errorText } from "@/lib/api/client";

const BATCH = 6;

export function CartSender({
  planId,
  ebagIds,
  ingredients,
  onDone,
}: {
  planId: string;
  ebagIds: number[];
  /** Ingredient name in the UI language per planned eBag id (results carry the Bulgarian name). */
  ingredients?: Record<number, string>;
  onDone?: () => void;
}) {
  const t = useTranslations("ebag");
  const common = useTranslations("common");
  const qty = (q: number, unit: string) => (unit === "kg" ? t("qtyKg", { q: String(q) }) : t("qtyPcs", { q: String(q) }));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<CartItemResult[]>([]);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<{ text: string; reconnect: boolean } | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    setResults([]);
    setFinished(false);
    setDone(0);
    let queue = [...ebagIds];
    const all: CartItemResult[] = [];
    try {
      while (queue.length) {
        const batch = queue.slice(0, BATCH);
        // Adds to the real cart: never retried automatically (a retry could add the same items twice).
        const body = await apiFetch<{ results: CartItemResult[]; pending?: number[] }>("/api/ebag/cart", {
          method: "POST",
          body: { planId, ebagIds: batch },
          timeoutMs: 75_000,
        });
        all.push(...body.results);
        setResults([...all]);
        setDone(all.length);
        queue = [...(body.pending ?? []), ...queue.slice(BATCH)];
      }
      setFinished(true);
    } catch (e) {
      setError({
        text: errorText(e, { offline: t("sendOffline"), timeout: common("timedOut"), other: common("somethingWrong") }),
        reconnect: e instanceof ApiError && e.code === "reconnect",
      });
    } finally {
      setBusy(false);
      onDone?.(); // refresh the cart view, also after a partial run
    }
  };

  const added = results.filter((r) => r.status === "added");
  const replaced = results.filter((r) => r.status === "replaced");
  const missing = results.filter((r) => r.status === "missing");

  return (
    <section className="flex flex-col gap-3">
      <button type="button" className="btn-primary" onClick={send} disabled={busy}>
        {busy ? t("adding", { done, total: ebagIds.length }) : results.length ? t("resend") : t("send")}
      </button>
      {busy && (
        <p className="text-center text-sm text-subtle" aria-live="polite">
          {t("checking")}
        </p>
      )}
      {error && (
        <div className="flex flex-col gap-2" role="alert">
          <p className="error">{error.text}</p>
          {error.reconnect && (
            <a href="/api/ebag/connect" className="btn-secondary">
              {t("reconnect")}
            </a>
          )}
        </div>
      )}

      {finished && results.length > 0 && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm font-semibold" role="status">
          {t("sentDone", { n: added.length + replaced.length, total: results.length })}
        </p>
      )}

      {results.length > 0 && (
        <details className="flex flex-col gap-2" open={missing.length + replaced.length > 0}>
          <summary className="cursor-pointer text-sm text-subtle">
            {t("resultSummary", { added: added.length, replaced: replaced.length, missing: missing.length })}
          </summary>
          <ul className="mt-2 flex flex-col gap-2" aria-label={t("resultLabel")}>
            {[...missing, ...replaced, ...added].map((r) => (
              <li key={r.ebag_id} className="card flex items-start gap-3 text-sm">
                <span
                  aria-hidden
                  className={`text-lg leading-none ${r.status === "missing" ? "text-danger" : r.status === "replaced" ? "text-amber-600" : "text-accent"}`}
                >
                  {r.status === "added" ? "✓" : r.status === "replaced" ? "↻" : "✗"}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium break-words">{r.line?.name ?? r.product}</span>
                  <span className="text-subtle">
                    {r.status === "added" && qty(r.line!.qty, r.line!.unit)}
                    {r.status === "replaced" && t("replacedLine", { qty: qty(r.line!.qty, r.line!.unit), product: r.product })}
                    {r.status === "missing" && t("missingLine", { ingredient: ingredients?.[r.ebag_id] ?? r.ingredient })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
