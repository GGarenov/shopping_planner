// Filling a user's eBag cart from a shopping list (SPEC §7.4; port of scripts/send_to_cart.mjs). For every item:
// re-check stock (get_product), else try the plan's alternatives with enough packs for the same edible grams;
// put it in the cart with action "set" (idempotent), and if eBag still refuses, try the next option.
// Never checks out — the MCP cannot, and we must not try.
import type { ShoppingItem } from "@/lib/planner/plan";

export interface CartApi {
  call<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T>;
}

export interface CartLine {
  ebag_id: number;
  name: string;
  qty: number;
  unit: string;
  price: number | null;
}

export interface CartItemResult {
  ebag_id: number; // the planned product
  product: string;
  ingredient: string;
  status: "added" | "replaced" | "missing";
  line?: CartLine;
}

export interface CartSummary {
  items: number | null;
  total: number | null;
  shipping: number | null;
  url: string;
}

type EbagProduct = {
  is_available?: boolean;
  available_quantity?: number | string | null;
  unit?: string;
  prices?: { unit_delta?: string | number | null; promo_unit_delta?: string | number | null };
};

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** In stock = is_available AND quantity > 0 (eBag can say available with quantity 0). */
async function inStock(api: CartApi, id: number): Promise<EbagProduct | null> {
  try {
    const p = await api.call<EbagProduct>("get_product", { product_id: id });
    const stock = num(p.available_quantity);
    return p.is_available && (stock == null || stock > 0) ? p : null;
  } catch {
    return null;
  }
}

async function setInCart(api: CartApi, line: CartLine): Promise<boolean> {
  try {
    await api.call("update_cart_item", { product_id: line.ebag_id, action: "set", quantity: line.qty, unit: line.unit });
    return true;
  } catch {
    return false;
  }
}

export async function fillCartItem(api: CartApi, item: ShoppingItem): Promise<CartItemResult> {
  const base = { ebag_id: item.ebag_id, product: item.product, ingredient: item.ingredient };
  const options: (() => Promise<CartLine | null>)[] = [
    async () => {
      const p = await inStock(api, item.ebag_id);
      return p
        ? {
            ebag_id: item.ebag_id,
            name: item.product,
            qty: item.packs,
            unit: p.unit ?? item.unit,
            price: num(p.prices?.promo_unit_delta ?? p.prices?.unit_delta),
          }
        : null;
    },
    ...(item.alternatives ?? []).map((alt) => async () => {
      const p = await inStock(api, alt.ebag_id);
      if (!p) return null;
      const qty = Math.max(1, Math.ceil(item.used_edible_g / Math.max(alt.usable_g, 1)));
      return {
        ebag_id: alt.ebag_id,
        name: alt.name,
        qty,
        unit: p.unit ?? alt.unit,
        price: num(p.prices?.promo_unit_delta ?? p.prices?.unit_delta),
      };
    }),
  ];
  for (const [i, option] of options.entries()) {
    const line = await option();
    if (line && (await setInCart(api, line))) return { ...base, status: i === 0 ? "added" : "replaced", line };
  }
  return { ...base, status: "missing" };
}

export async function getCartSummary(api: CartApi): Promise<CartSummary> {
  const cart = await api.call<{ total_items?: number; url?: string; totals?: { total?: unknown; shipping_price?: unknown } }>("get_cart", {
    page_size: 50,
  });
  return {
    items: num(cart.total_items),
    total: num(cart.totals?.total),
    shipping: num(cart.totals?.shipping_price),
    url: cart.url ?? "https://ebag.bg/cart/",
  };
}
