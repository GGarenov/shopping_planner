"use client";

import { useCallback, useEffect, useState } from "react";
import { deliveryHint, stepQuantity, type CartView, type CartViewItem, type DeliveryInfo, type Slot } from "@/lib/ebag/cartView";
import { eur } from "@/lib/plans/shopping";

interface View {
  cart: CartView;
  delivery: DeliveryInfo | null;
  slots: Slot[];
}

const WEEKDAY = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
const qtyLabel = (q: number, unit: "kg" | "pcs") => (unit === "kg" ? `${String(q).replace(".", ",")} кг` : `${q} бр.`);

function slotLabel(s: Slot, today: string): string {
  const days = Math.round((Date.parse(s.date) - Date.parse(today)) / 86_400_000);
  const [, m, d] = s.date.split("-");
  const day = days === 0 ? "днес" : days === 1 ? "утре" : `${WEEKDAY[new Date(`${s.date}T12:00:00Z`).getUTCDay()]} ${d}.${m}`;
  return `${day} ${s.time.replace("-", "–")}`;
}

export function EbagCart({ today, refreshKey }: { today: string; refreshKey: number }) {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ text: string; reconnect: boolean } | null>(null);
  const [busy, setBusy] = useState<Set<number | "all">>(new Set());
  const [warning, setWarning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ebag/cart", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as Partial<View> & { error?: string; reason?: string };
      if (!res.ok || !body.cart) setError({ text: body.error ?? "Не успяхме да заредим количката.", reconnect: body.reason === "reconnect" });
      else setView({ cart: body.cart, delivery: body.delivery ?? null, slots: body.slots ?? [] });
    } catch {
      setError({ text: "Няма връзка. Провери интернета.", reconnect: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const patch = async (key: number | "all", body: Record<string, unknown>) => {
    setBusy((b) => new Set(b).add(key));
    setWarning(null);
    try {
      const res = await fetch("/api/ebag/cart", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = (await res.json().catch(() => ({}))) as { cart?: CartView; warning?: string | null; error?: string };
      if (out.cart) setView((v) => (v ? { ...v, cart: out.cart! } : v));
      setWarning(out.warning ?? (res.ok ? null : (out.error ?? "Промяната не мина. Опитай пак.")));
    } catch {
      setWarning("Няма връзка. Промяната не е запазена.");
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(key);
        return n;
      });
    }
  };

  const change = (it: CartViewItem, dir: 1 | -1) => {
    const q = stepQuantity(it, dir);
    if (q === it.quantity) return;
    void patch(it.id, q === 0 ? { op: "remove", productId: it.id, unit: it.unit } : { op: "set", productId: it.id, quantity: q, unit: it.unit });
  };

  if (loading && !view)
    return (
      <section className="flex flex-col gap-2" aria-busy="true" aria-label="Зареждаме количката">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-20 animate-pulse" />
        ))}
      </section>
    );
  if (error)
    return (
      <div className="flex flex-col gap-2" role="alert">
        <p className="error">{error.text}</p>
        {error.reconnect ? (
          <a href="/api/ebag/connect" className="btn-secondary">
            Свържи eBag отново
          </a>
        ) : (
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            Опитай пак
          </button>
        )}
      </div>
    );
  if (!view) return null;

  const { cart, delivery, slots } = view;
  const hint = deliveryHint(cart.total, delivery);
  const canOrder = cart.items.length > 0 && hint?.kind !== "below_min";

  return (
    <section className="flex flex-col gap-3" aria-labelledby="cart-title">
      <div className="flex items-baseline justify-between">
        <h2 id="cart-title" className="text-lg font-semibold">
          Количката ти в eBag
        </h2>
        <button type="button" className="text-sm underline opacity-70" onClick={() => void load()} disabled={loading}>
          {loading ? "Обновяваме…" : "Обнови"}
        </button>
      </div>

      {cart.items.length === 0 ? (
        <p className="card text-sm opacity-80">Количката ти е празна.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cart.items.map((it) => {
            const pending = busy.has(it.id) || busy.has("all");
            return (
              <li key={it.id} className={`card flex gap-3 ${pending ? "opacity-60" : ""} ${it.available ? "" : "border-red-500"}`}>
                {it.image ? (
                  // eBag's own product photo, already sized by eBag — no Next image optimisation needed.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image} alt="" width={64} height={64} loading="lazy" className="size-16 shrink-0 rounded-lg bg-white object-contain" />
                ) : (
                  <div className="size-16 shrink-0 rounded-lg bg-border" aria-hidden />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium break-words">
                    {it.name}
                  </a>
                  <span className="text-xs opacity-70">
                    {it.packSize && `${it.packSize} · `}
                    {it.price != null && `${eur(it.price)}${it.unit === "kg" ? "/кг" : ""}`}
                    {it.regularPrice != null && (
                      <>
                        {" "}
                        <s>{eur(it.regularPrice)}</s> <span className="rounded-full bg-accent-soft px-1.5 font-semibold">Промо</span>
                      </>
                    )}
                  </span>
                  {!it.available && <span className="text-xs font-semibold text-red-600">Изчерпан — махни го или го смени</span>}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1" role="group" aria-label={`Количество за ${it.name}`}>
                      <button
                        type="button"
                        className="btn-secondary size-9 p-0 text-lg"
                        onClick={() => change(it, -1)}
                        disabled={pending}
                        aria-label={stepQuantity(it, -1) === 0 ? "Махни" : "По-малко"}
                      >
                        {stepQuantity(it, -1) === 0 ? "×" : "−"}
                      </button>
                      <span className="min-w-14 text-center text-sm tabular-nums" aria-live="polite">
                        {qtyLabel(it.quantity, it.unit)}
                      </span>
                      <button type="button" className="btn-secondary size-9 p-0 text-lg" onClick={() => change(it, 1)} disabled={pending} aria-label="Повече">
                        +
                      </button>
                    </div>
                    <span className="font-semibold tabular-nums">{it.lineTotal != null ? eur(it.lineTotal) : ""}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {warning && (
        <p className="text-sm text-red-600" role="alert">
          {warning}
        </p>
      )}

      {cart.items.length > 0 && (
        <div className="card flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span>Продукти ({cart.count})</span>
            <span className="tabular-nums">{eur(cart.total)}</span>
          </div>
          {cart.shipping != null && (
            <div className="flex justify-between text-sm">
              <span>Доставка</span>
              <span className="tabular-nums">{cart.shipping === 0 ? "безплатна" : eur(cart.shipping)}</span>
            </div>
          )}
          {cart.savings > 0 && (
            <div className="flex justify-between text-sm text-accent">
              <span>Спестяваш</span>
              <span className="tabular-nums">−{eur(cart.savings)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 font-bold">
            <span>Общо</span>
            <span className="tabular-nums">{eur(cart.total + (cart.shipping ?? 0))}</span>
          </div>
          {hint && delivery?.freeFrom != null && (
            <div className="flex flex-col gap-1">
              <div className="h-2 overflow-hidden rounded-full bg-border" aria-hidden>
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (cart.total / delivery.freeFrom) * 100)}%` }} />
              </div>
              <p className="text-xs">
                {hint.kind === "below_min" && <span className="font-semibold text-red-600">Още {eur(hint.missing)} до минималната поръчка в eBag.</span>}
                {hint.kind === "to_cheaper" && `Още ${eur(hint.missing)} до по-евтина доставка (${eur(hint.nextFee ?? 0)}).`}
                {hint.kind === "to_free" && `Още ${eur(hint.missing)} до безплатна доставка.`}
                {hint.kind === "free" && "Доставката е безплатна."}
              </p>
            </div>
          )}
        </div>
      )}

      {slots.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            Най-ранна доставка{delivery?.area ? ` (${delivery.area})` : ""}: <span className="font-semibold whitespace-nowrap">{slotLabel(slots[0]!, today)}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {slots.slice(1).map((s) => (
              <span key={`${s.date}${s.time}`} className="rounded-full border border-border px-3 py-1 text-xs">
                {slotLabel(s, today)}
              </span>
            ))}
          </div>
        </div>
      )}

      {cart.items.length > 0 && (
        <>
          <a href={cart.url} target="_blank" rel="noopener noreferrer" className={`btn-primary ${canOrder ? "" : "pointer-events-none opacity-50"}`} aria-disabled={!canOrder}>
            Поръчай в eBag ↗︎
          </a>
          <p className="text-center text-xs opacity-70">Часа за доставка и плащането избираш в eBag — ние не можем да поръчваме.</p>
          <button
            type="button"
            className="btn-ghost text-sm"
            disabled={busy.size > 0}
            onClick={() => {
              if (window.confirm("Да изчистим ли цялата количка в eBag?")) void patch("all", { op: "clear" });
            }}
          >
            Изчисти количката
          </button>
        </>
      )}
    </section>
  );
}
