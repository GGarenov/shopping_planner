import { describe, expect, it } from "vitest";
import type { ShoppingItem } from "@/lib/planner/plan";
import { fillCartItem, getCartSummary, type CartApi } from "./cart";

const item = {
  ebag_id: 1,
  product: "Мляко А",
  ingredient: "Мляко",
  packs: 2,
  unit: "pcs",
  used_edible_g: 1500,
  alternatives: [
    { ebag_id: 2, name: "Мляко Б", price: 1, usable_g: 1000, unit: "pcs" },
    { ebag_id: 3, name: "Мляко В", price: 1, usable_g: 500, unit: "pcs" },
  ],
} as unknown as ShoppingItem;

/** Fake eBag: stock per product id; `refuse` = ids the cart rejects. Records every call. */
function fakeEbag(stock: Record<number, number | null | "off">, refuse: number[] = []) {
  const calls: [string, Record<string, unknown>][] = [];
  const api: CartApi = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push([name, args]);
      const id = Number(args.product_id);
      if (name === "get_product") {
        const s = stock[id];
        if (s === undefined) throw new Error("not found");
        return { is_available: s !== "off", available_quantity: s === "off" ? 0 : s, unit: "pcs", prices: { unit_delta: "1.50", promo_unit_delta: null } } as T;
      }
      if (name === "update_cart_item") {
        if (refuse.includes(id)) throw new Error("refused");
        return {} as T;
      }
      if (name === "get_cart") return { total_items: 3, url: "https://ebag.bg/cart/", totals: { total: "12.30", shipping_price: "4.99" } } as T;
      throw new Error(name);
    },
  };
  return { api, calls };
}

describe("fillCartItem", () => {
  it("adds the planned product when in stock (set, planned packs)", async () => {
    const { api, calls } = fakeEbag({ 1: 10 });
    const r = await fillCartItem(api, item);
    expect(r).toMatchObject({ status: "added", line: { ebag_id: 1, qty: 2, price: 1.5 } });
    expect(calls.find(([n]) => n === "update_cart_item")?.[1]).toEqual({ product_id: 1, action: "set", quantity: 2, unit: "pcs" });
    expect(calls.some(([n]) => n === "checkout")).toBe(false);
  });

  it("available with quantity 0 counts as sold out → alternative with enough packs for the same grams", async () => {
    const { api } = fakeEbag({ 1: 0, 2: 5 });
    expect(await fillCartItem(api, item)).toMatchObject({ status: "replaced", line: { ebag_id: 2, qty: 2 } }); // 1500 g / 1000 g
  });

  it("if the cart refuses, tries the next alternative", async () => {
    const { api } = fakeEbag({ 1: 3, 2: 3, 3: 3 }, [1, 2]);
    expect(await fillCartItem(api, item)).toMatchObject({ status: "replaced", line: { ebag_id: 3, qty: 3 } });
  });

  it("reports missing when nothing is available", async () => {
    const { api } = fakeEbag({ 1: "off", 2: 0 });
    expect(await fillCartItem(api, item)).toMatchObject({ status: "missing" });
  });
});

describe("getCartSummary", () => {
  it("reads totals and the cart link", async () => {
    const { api } = fakeEbag({});
    expect(await getCartSummary(api)).toEqual({ items: 3, total: 12.3, shipping: 4.99, url: "https://ebag.bg/cart/" });
  });
});
