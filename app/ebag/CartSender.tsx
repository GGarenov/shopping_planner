"use client";

import { useState } from "react";
import type { CartItemResult, CartSummary } from "@/lib/ebag/cart";
import { eur } from "@/lib/plans/shopping";

const BATCH = 6;

export function CartSender({ planId, ebagIds }: { planId: string; ebagIds: number[] }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<CartItemResult[]>([]);
  const [summary, setSummary] = useState<CartSummary | null>(null);
  const [error, setError] = useState<{ text: string; reconnect: boolean } | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    setResults([]);
    setSummary(null);
    setDone(0);
    let queue = [...ebagIds];
    const all: CartItemResult[] = [];
    try {
      while (queue.length) {
        const batch = queue.slice(0, BATCH);
        const last = queue.length <= BATCH;
        const res = await fetch("/api/ebag/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, ebagIds: batch, summary: last }),
        });
        const body = (await res.json().catch(() => ({}))) as { results?: CartItemResult[]; pending?: number[]; summary?: CartSummary | null; error?: string; reason?: string };
        if (!res.ok || !body.results) {
          setError({ text: body.error ?? "Нещо се обърка. Опитай отново.", reconnect: body.reason === "reconnect" });
          return;
        }
        all.push(...body.results);
        setResults([...all]);
        setDone(all.length);
        queue = [...(body.pending ?? []), ...queue.slice(BATCH)];
        if (body.summary) setSummary(body.summary);
      }
    } catch {
      setError({ text: "Няма връзка. Провери интернета и опитай отново — вече добавените продукти остават в количката.", reconnect: false });
    } finally {
      setBusy(false);
    }
  };

  const added = results.filter((r) => r.status === "added");
  const replaced = results.filter((r) => r.status === "replaced");
  const missing = results.filter((r) => r.status === "missing");

  return (
    <section className="flex flex-col gap-3">
      <button type="button" className="btn-primary" onClick={send} disabled={busy}>
        {busy ? `Добавяме… ${done} от ${ebagIds.length}` : results.length ? "Изпрати отново" : "Изпрати в количката"}
      </button>
      {busy && (
        <p className="text-center text-sm opacity-70" aria-live="polite">
          Проверяваме наличността на всеки продукт — около минута.
        </p>
      )}
      {error && (
        <div className="flex flex-col gap-2" role="alert">
          <p className="error">{error.text}</p>
          {error.reconnect && (
            <a href="/api/ebag/connect" className="btn-secondary">
              Свържи eBag отново
            </a>
          )}
        </div>
      )}

      {summary && (
        <div className="card flex flex-col gap-2">
          <p className="font-semibold">
            Готово: {added.length + replaced.length} от {results.length} продукта са в количката ти.
          </p>
          {summary.total != null && (
            <p className="text-sm">
              Количка в eBag: {summary.items ?? "?"} продукта, {eur(summary.total)}
              {summary.shipping != null && <> + доставка {eur(summary.shipping)}</>}
            </p>
          )}
          <a href={summary.url} target="_blank" rel="noopener noreferrer" className="btn-primary">
            Отвори количката в eBag ↗
          </a>
          <p className="text-sm opacity-70">Нищо не е поръчано. Провери количката и поръчай в eBag, ако искаш.</p>
        </div>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Резултат по продукти">
          {[...missing, ...replaced, ...added].map((r) => (
            <li key={r.ebag_id} className="card flex items-start gap-3 text-sm">
              <span aria-hidden className={`text-lg leading-none ${r.status === "missing" ? "text-red-600" : r.status === "replaced" ? "text-amber-600" : "text-accent"}`}>
                {r.status === "added" ? "✓" : r.status === "replaced" ? "↻" : "✗"}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-medium break-words">{r.line?.name ?? r.product}</span>
                <span className="opacity-70">
                  {r.status === "added" && `${r.line!.qty} ${r.line!.unit === "kg" ? "кг" : "бр."}`}
                  {r.status === "replaced" && `${r.line!.qty} ${r.line!.unit === "kg" ? "кг" : "бр."} — вместо „${r.product}“ (изчерпан)`}
                  {r.status === "missing" && `${r.ingredient}: изчерпан, няма заместител — купи го другаде`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
