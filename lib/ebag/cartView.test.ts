import { describe, expect, it } from "vitest";
import { deliveryHint, firstSlots, parseCart, parseDelivery, stepQuantity, type RawCart } from "./cartView";

// Shapes as returned by eBag's MCP on 2026-11-23.
const cart: RawCart = {
  items: [
    {
      product: {
        id: 635268,
        name: "Прясно Мляко Верея 1,5%",
        url: "https://ebag.bg/priasno-mliako-vereia-15/635268",
        image_url: "https://ebag.bg/products/635268/images/0/400",
        is_available: true,
        prices: { unit_delta: "1.60", promo_unit_delta: null },
        pack_size: "1 л",
        unit: "pcs",
        quantity_step: "1.0000",
        minimum_quantity: "1.0000",
        maximum_quantity: null,
        available_quantity: "126.0",
      },
      quantity: "2.000",
      line_total: "3.20",
      available: true,
    },
    {
      product: { id: 1, name: "Банани", unit: "kg", prices: { unit_delta: "2.00", promo_unit_delta: "1.50" }, quantity_step: "0.5000", minimum_quantity: "0.5000", available_quantity: "0" },
      quantity: "1.000",
      line_total: "1.50",
    },
  ],
  totals: { total: "4.70", savings: "0.50", shipping_price: "2.55" },
  total_items: 2,
  url: "https://ebag.bg/cart/",
};
const delivery = { area: "Дианабад", city: "София", low_shipping_price: "1.53", high_shipping_price: "2.55", order_min_price: "15.34", cheaper_shipping_price_threshold: "35.79", free_shipping_price_threshold: "51.13" };

describe("parseCart", () => {
  it("reads items, promo prices, steps, totals", () => {
    const v = parseCart([cart]);
    expect(v).toMatchObject({ count: 2, total: 4.7, savings: 0.5, shipping: 2.55, url: "https://ebag.bg/cart/" });
    expect(v.items[0]).toMatchObject({ id: 635268, quantity: 2, step: 1, min: 1, max: 126, price: 1.6, regularPrice: null, lineTotal: 3.2, unit: "pcs", available: true });
    expect(v.items[1]).toMatchObject({ unit: "kg", step: 0.5, price: 1.5, regularPrice: 2, available: false });
  });
  it("handles an empty cart", () => {
    expect(parseCart([{ items: [], totals: { total: "0", savings: "0", shipping_price: "2.55" }, total_items: 0 }])).toMatchObject({ items: [], count: 0, total: 0 });
  });
});

describe("delivery", () => {
  const d = parseDelivery(delivery)!;
  it("parses fees and thresholds", () => expect(d).toEqual({ area: "Дианабад, София", minOrder: 15.34, highFee: 2.55, lowFee: 1.53, cheaperFrom: 35.79, freeFrom: 51.13 }));
  it("explains what is missing for each fee step", () => {
    expect(deliveryHint(10, d)).toEqual({ kind: "below_min", missing: 5.34 });
    expect(deliveryHint(30, d)).toEqual({ kind: "to_cheaper", missing: 5.79, fee: 2.55, nextFee: 1.53 });
    expect(deliveryHint(40, d)).toEqual({ kind: "to_free", missing: 11.13, fee: 1.53 });
    expect(deliveryHint(60, d)).toEqual({ kind: "free" });
  });
  it("first slots in time order across days", () => {
    expect(firstSlots({ slots: { "2026-11-24": ["09:00-10:00", "08:00-09:00"], "2026-11-23": ["22:00-23:00"] } }, 3)).toEqual([
      { date: "2026-11-23", time: "22:00-23:00" },
      { date: "2026-11-24", time: "08:00-09:00" },
      { date: "2026-11-24", time: "09:00-10:00" },
    ]);
  });
});

describe("stepQuantity", () => {
  it("steps by the product's step and removes below the minimum", () => {
    expect(stepQuantity({ quantity: 1, step: 0.5, min: 0.5, max: null }, 1)).toBe(1.5);
    expect(stepQuantity({ quantity: 0.5, step: 0.5, min: 0.5, max: null }, -1)).toBe(0);
    expect(stepQuantity({ quantity: 3, step: 1, min: 1, max: 3 }, 1)).toBe(3);
  });
});
