"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { deliveryHint, stepQuantity, type CartView, type CartViewItem, type DeliveryInfo, type Slot } from "@/lib/ebag/cartView";
import { packUnits } from "@/lib/i18n/format";
import { eur } from "@/lib/plans/shopping";

interface View {
  cart: CartView;
  delivery: DeliveryInfo | null;
  slots: Slot[];
}

type T = ReturnType<typeof useTranslations<"ebag">>;

const qtyLabel = (t: T, locale: string, q: number, unit: "kg" | "pcs") =>
  unit === "kg" ? t("qtyKg", { q: locale === "en" ? String(q) : String(q).replace(".", ",") }) : t("qtyPcs", { q: String(q) });

/** bg "днес 10:00–12:00" / "пт 28.11 10:00–12:00", en "today 10:00–12:00" / "Fri 28 Nov 10:00–12:00". */
function slotLabel(t: T, locale: string, s: Slot, today: string): string {
  const days = Math.round((Date.parse(s.date) - Date.parse(today)) / 86_400_000);
  const [, m, d] = s.date.split("-");
  const date = new Date(`${s.date}T12:00:00Z`);
  const dayMonth =
    locale === "en" ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(date) : `${d}.${m}`;
  const day =
    days === 0
      ? t("slotToday")
      : days === 1
        ? t("slotTomorrow")
        : t("slotDay", { weekday: t("weekdays").split(",")[date.getUTCDay()] ?? "", date: dayMonth });
  return `${day} ${s.time.replace("-", "–")}`;
}

export function EbagCart({ today, refreshKey }: { today: string; refreshKey: number }) {
  const t = useTranslations("ebag");
  const common = useTranslations("common");
  const locale = useLocale();
  const money = (n: number) => eur(n, locale);
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
      if (!res.ok || !body.cart) setError({ text: body.error ?? t("loadFailed"), reconnect: body.reason === "reconnect" });
      else setView({ cart: body.cart, delivery: body.delivery ?? null, slots: body.slots ?? [] });
    } catch {
      setError({ text: t("offline"), reconnect: false });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const patch = async (key: number | "all", body: Record<string, unknown>) => {
    setBusy((b) => new Set(b).add(key));
    setWarning(null);
    try {
      const res = await fetch("/api/ebag/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = (await res.json().catch(() => ({}))) as { cart?: CartView; warning?: string | null; error?: string };
      if (out.cart) setView((v) => (v ? { ...v, cart: out.cart! } : v));
      setWarning(out.warning ?? (res.ok ? null : (out.error ?? t("changeFailed"))));
    } catch {
      setWarning(t("changeOffline"));
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
    void patch(
      it.id,
      q === 0 ? { op: "remove", productId: it.id, unit: it.unit } : { op: "set", productId: it.id, quantity: q, unit: it.unit },
    );
  };

  if (loading && !view)
    return (
      <section className="flex flex-col gap-2" aria-busy="true" aria-label={t("loadingCart")}>
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
            {t("reconnect")}
          </a>
        ) : (
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            {common("retry")}
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
          {t("cartTitle")}
        </h2>
        <button type="button" className="text-sm underline opacity-70" onClick={() => void load()} disabled={loading}>
          {loading ? t("refreshing") : t("refresh")}
        </button>
      </div>

      {cart.items.length === 0 ? (
        <p className="card text-sm opacity-80">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cart.items.map((it) => {
            const pending = busy.has(it.id) || busy.has("all");
            return (
              <li key={it.id} className={`card flex gap-3 ${pending ? "opacity-60" : ""} ${it.available ? "" : "border-red-500"}`}>
                {it.image ? (
                  // eBag's own product photo, already sized by eBag — no Next image optimisation needed.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.image}
                    alt=""
                    width={64}
                    height={64}
                    loading="lazy"
                    className="size-16 shrink-0 rounded-lg bg-white object-contain"
                  />
                ) : (
                  <div className="size-16 shrink-0 rounded-lg bg-border" aria-hidden />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium break-words">
                    {it.name}
                  </a>
                  <span className="text-xs opacity-70">
                    {it.packSize && `${packUnits(it.packSize, locale)} · `}
                    {it.price != null && `${money(it.price)}${it.unit === "kg" ? t("perKg") : ""}`}
                    {it.regularPrice != null && (
                      <>
                        {" "}
                        <s>{money(it.regularPrice)}</s> <span className="badge-promo">{t("promo")}</span>
                      </>
                    )}
                  </span>
                  {!it.available && <span className="text-xs font-semibold text-red-600">{t("soldOut")}</span>}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1" role="group" aria-label={t("qtyFor", { name: it.name })}>
                      <button
                        type="button"
                        className="btn-secondary size-9 p-0 text-lg"
                        onClick={() => change(it, -1)}
                        disabled={pending}
                        aria-label={stepQuantity(it, -1) === 0 ? t("remove") : t("less")}
                      >
                        {stepQuantity(it, -1) === 0 ? "×" : "−"}
                      </button>
                      <span className="min-w-14 text-center text-sm tabular-nums" aria-live="polite">
                        {qtyLabel(t, locale, it.quantity, it.unit)}
                      </span>
                      <button
                        type="button"
                        className="btn-secondary size-9 p-0 text-lg"
                        onClick={() => change(it, 1)}
                        disabled={pending}
                        aria-label={t("more")}
                      >
                        +
                      </button>
                    </div>
                    <span className="font-semibold tabular-nums">{it.lineTotal != null ? money(it.lineTotal) : ""}</span>
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
            <span>{t("productsCount", { n: cart.count })}</span>
            <span className="tabular-nums">{money(cart.total)}</span>
          </div>
          {cart.shipping != null && (
            <div className="flex justify-between text-sm">
              <span>{t("delivery")}</span>
              <span className="tabular-nums">{cart.shipping === 0 ? t("free") : money(cart.shipping)}</span>
            </div>
          )}
          {cart.savings > 0 && (
            <div className="flex justify-between text-sm text-accent">
              <span>{t("savings")}</span>
              <span className="tabular-nums">−{money(cart.savings)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 font-bold">
            <span>{t("total")}</span>
            <span className="tabular-nums">{money(cart.total + (cart.shipping ?? 0))}</span>
          </div>
          {hint && delivery?.freeFrom != null && (
            <div className="flex flex-col gap-1">
              <div className="h-2 overflow-hidden rounded-full bg-border" aria-hidden>
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.min(100, (cart.total / delivery.freeFrom) * 100)}%` }}
                />
              </div>
              <p className="text-xs">
                {hint.kind === "below_min" && (
                  <span className="font-semibold text-red-600">{t("belowMin", { amount: money(hint.missing) })}</span>
                )}
                {hint.kind === "to_cheaper" && t("toCheaper", { amount: money(hint.missing), fee: money(hint.nextFee ?? 0) })}
                {hint.kind === "to_free" && t("toFree", { amount: money(hint.missing) })}
                {hint.kind === "free" && t("freeDelivery")}
              </p>
            </div>
          )}
        </div>
      )}

      {slots.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            {t.rich(delivery?.area ? "earliestArea" : "earliest", {
              area: delivery?.area ?? "",
              slot: slotLabel(t, locale, slots[0]!, today),
              b: (chunks) => <span className="font-semibold whitespace-nowrap">{chunks}</span>,
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            {slots.slice(1).map((s) => (
              <span key={`${s.date}${s.time}`} className="rounded-full border border-border px-3 py-1 text-xs">
                {slotLabel(t, locale, s, today)}
              </span>
            ))}
          </div>
        </div>
      )}

      {cart.items.length > 0 && (
        <>
          <a
            href={cart.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn-primary ${canOrder ? "" : "pointer-events-none opacity-50"}`}
            aria-disabled={!canOrder}
          >
            {t("order")}
          </a>
          <p className="text-center text-xs opacity-70">{t("orderNote")}</p>
          <button
            type="button"
            className="btn-ghost text-sm"
            disabled={busy.size > 0}
            onClick={() => {
              if (window.confirm(t("clearConfirm"))) void patch("all", { op: "clear" });
            }}
          >
            {t("clear")}
          </button>
        </>
      )}
    </section>
  );
}
