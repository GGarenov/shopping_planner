// Shapes the eBag MCP responses (get_cart, get_delivery_info, get_delivery_slots) for the in-app cart screen.
// Pure — no I/O; the API routes fetch, the client renders.

export interface CartViewItem {
  id: number;
  name: string;
  url: string;
  image: string | null;
  packSize: string;
  unit: "kg" | "pcs";
  quantity: number;
  step: number;
  min: number;
  max: number | null;
  price: number | null; // per unit, promo if any
  regularPrice: number | null;
  lineTotal: number | null;
  available: boolean;
}

export interface CartView {
  items: CartViewItem[];
  count: number;
  total: number;
  savings: number;
  shipping: number | null;
  url: string;
}

export interface DeliveryInfo {
  area: string | null;
  minOrder: number | null;
  /** Fee steps: below cheaperFrom → high; below freeFrom → low; from freeFrom → free. */
  highFee: number | null;
  lowFee: number | null;
  cheaperFrom: number | null;
  freeFrom: number | null;
}

export interface Slot {
  date: string; // YYYY-MM-DD (Europe/Sofia)
  time: string; // "21:00-22:00"
}

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

type RawCartItem = {
  product?: {
    id?: number;
    name?: string;
    url?: string;
    image_url?: string | null;
    is_available?: boolean;
    prices?: { unit_delta?: unknown; promo_unit_delta?: unknown };
    pack_size?: string;
    unit?: string;
    quantity_step?: unknown;
    minimum_quantity?: unknown;
    maximum_quantity?: unknown;
    available_quantity?: unknown;
  };
  quantity?: unknown;
  line_total?: unknown;
  available?: boolean;
};

export type RawCart = { items?: RawCartItem[]; totals?: { total?: unknown; savings?: unknown; shipping_price?: unknown }; total_items?: unknown; url?: string };

export function parseCart(pages: RawCart[]): CartView {
  const first = pages[0] ?? {};
  const items: CartViewItem[] = pages
    .flatMap((p) => p.items ?? [])
    .filter((it) => it.product?.id != null)
    .map((it) => {
      const p = it.product!;
      const regular = num(p.prices?.unit_delta);
      const promo = num(p.prices?.promo_unit_delta);
      const stock = num(p.available_quantity);
      return {
        id: Number(p.id),
        name: p.name ?? "",
        url: p.url ?? "https://ebag.bg/",
        image: p.image_url ?? null,
        packSize: p.pack_size ?? "",
        unit: p.unit === "kg" ? "kg" : "pcs",
        quantity: num(it.quantity) ?? 0,
        step: num(p.quantity_step) || 1,
        min: num(p.minimum_quantity) || num(p.quantity_step) || 1,
        max: num(p.maximum_quantity) ?? stock,
        price: promo ?? regular,
        regularPrice: promo != null ? regular : null,
        lineTotal: num(it.line_total),
        available: it.available !== false && p.is_available !== false && (stock == null || stock > 0),
      };
    });
  return {
    items,
    count: num(first.total_items) ?? items.length,
    total: num(first.totals?.total) ?? 0,
    savings: num(first.totals?.savings) ?? 0,
    shipping: num(first.totals?.shipping_price),
    url: first.url ?? "https://ebag.bg/cart/",
  };
}

export function parseDelivery(raw: Record<string, unknown> | null | undefined): DeliveryInfo | null {
  if (!raw) return null;
  return {
    area: [raw.area, raw.city].filter(Boolean).join(", ") || null,
    minOrder: num(raw.order_min_price),
    highFee: num(raw.high_shipping_price),
    lowFee: num(raw.low_shipping_price),
    cheaperFrom: num(raw.cheaper_shipping_price_threshold),
    freeFrom: num(raw.free_shipping_price_threshold),
  };
}

/** The first `n` delivery slots, in time order. */
export function firstSlots(raw: { slots?: Record<string, string[]> } | null | undefined, n = 4): Slot[] {
  const out: Slot[] = [];
  for (const date of Object.keys(raw?.slots ?? {}).sort())
    for (const time of [...(raw!.slots![date] ?? [])].sort()) {
      out.push({ date, time });
      if (out.length >= n) return out;
    }
  return out;
}

export type DeliveryHint =
  | { kind: "below_min"; missing: number }
  | { kind: "to_cheaper"; missing: number; fee: number | null; nextFee: number | null }
  | { kind: "to_free"; missing: number; fee: number | null }
  | { kind: "free" };

/** What to tell the user about delivery for this cart total (eBag's own fee is in the cart; this explains it). */
export function deliveryHint(total: number, d: DeliveryInfo | null): DeliveryHint | null {
  if (!d) return null;
  const r = (x: number) => Math.round(x * 100) / 100;
  if (d.minOrder != null && total < d.minOrder) return { kind: "below_min", missing: r(d.minOrder - total) };
  if (d.cheaperFrom != null && total < d.cheaperFrom) return { kind: "to_cheaper", missing: r(d.cheaperFrom - total), fee: d.highFee, nextFee: d.lowFee };
  if (d.freeFrom != null && total < d.freeFrom) return { kind: "to_free", missing: r(d.freeFrom - total), fee: d.lowFee };
  if (d.freeFrom != null) return { kind: "free" };
  return null;
}

/** Next quantity for +/− respecting step and minimum (below the minimum means remove → 0). */
export function stepQuantity(item: Pick<CartViewItem, "quantity" | "step" | "min" | "max">, dir: 1 | -1): number {
  const next = Math.round((item.quantity + dir * item.step) * 10_000) / 10_000;
  if (dir < 0 && next < item.min) return 0;
  if (dir > 0 && item.max != null && next > item.max) return item.quantity;
  return Math.max(next, dir > 0 ? item.min : 0);
}
