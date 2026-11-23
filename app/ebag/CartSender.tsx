"use client";

import { useState } from "react";
import type { CartItemResult } from "@/lib/ebag/cart";

const BATCH = 6;

export function CartSender({ planId, ebagIds, onDone }: { planId: string; ebagIds: number[]; onDone?: () => void }) {
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
        const res = await fetch("/api/ebag/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, ebagIds: batch }),
        });
        const body = (await res.json().catch(() => ({}))) as { results?: CartItemResult[]; pending?: number[]; error?: string; reason?: string };
        if (!res.ok || !body.results) {
          setError({ text: body.error ?? "Нещо се обърка. Опитай отново.", reconnect: body.reason === "reconnect" });
          return;
        }
        all.push(...body.results);
        setResults([...all]);
        setDone(all.length);
        queue = [...(body.pending ?? []), ...queue.slice(BATCH)];
      }
      setFinished(true);
    } catch {
      setError({ text: "Няма връзка. Провери интернета и опитай отново — вече добавените продукти остават в количката.", reconnect: false });
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

      {finished && results.length > 0 && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm font-semibold" role="status">
          Готово: {added.length + replaced.length} от {results.length} продукта са в количката ти.
        </p>
      )}

      {results.length > 0 && (
        <details className="flex flex-col gap-2" open={missing.length + replaced.length > 0}>
          <summary className="cursor-pointer text-sm opacity-80">
            Резултат по продукти: ✓ {added.length} · ↻ {replaced.length} · ✗ {missing.length}
          </summary>
          <ul className="mt-2 flex flex-col gap-2" aria-label="Резултат по продукти">
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
        </details>
      )}
    </section>
  );
}
