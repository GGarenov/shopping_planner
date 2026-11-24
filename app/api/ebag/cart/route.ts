// /api/ebag/cart — the user's own eBag cart (SPEC §7.4). Never checks out: ordering and payment happen on eBag.
//   GET  → cart + delivery fees + first delivery slots (for the in-app cart screen)
//   POST → fill the cart from the plan: { planId, ebagIds (≤ 10), summary? } — the client sends batches of 6;
//          items not reached in time come back in `pending`
//   PATCH → change the cart: { op: "set", productId, quantity, unit } | { op: "remove", productId, unit } | { op: "clear" }
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { EbagApi } from "@/lib/ebag/api";
import { fillCartItem, getCartSummary, type CartItemResult } from "@/lib/ebag/cart";
import { firstSlots, parseCart, parseDelivery, type RawCart } from "@/lib/ebag/cartView";
import { withUserEbag } from "@/lib/ebag/session";
import { AppError } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { getPlan } from "@/lib/plans/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = 40_000;

/** All cart pages (50 items each). */
async function readCart(api: EbagApi) {
  const pages: RawCart[] = [];
  for (let page = 1; page <= 10; page++) {
    const p = await api.call<RawCart & { has_more?: boolean }>("get_cart", { page, page_size: 50 });
    pages.push(p);
    if (!p.has_more) break;
  }
  return parseCart(pages);
}

export const GET = apiHandler("GET /api/ebag/cart", async ({ log }) =>
  withUserEbag(log, async ({ api }) => {
    const cart = await readCart(api);
    // Delivery data is a nice-to-have: the cart still shows if eBag can't answer these (e.g. no saved address).
    const delivery = await api.call<Record<string, unknown>>("get_delivery_info", {}).then(parseDelivery, () => null);
    const slots = await api.call<{ slots?: Record<string, string[]> }>("get_delivery_slots", {}).then(
      (s) => firstSlots(s, 4),
      () => [],
    );
    return NextResponse.json({ cart, delivery, slots });
  }),
);

const patchBody = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("set"),
    productId: z.number().int().positive(),
    quantity: z.number().positive().max(1000),
    unit: z.enum(["pcs", "kg"]),
  }),
  z.object({ op: z.literal("remove"), productId: z.number().int().positive(), unit: z.enum(["pcs", "kg"]) }),
  z.object({ op: z.literal("clear") }),
]);

export const PATCH = apiHandler("PATCH /api/ebag/cart", async ({ log }, req: NextRequest) => {
  const t = await getTranslations("ebag.api");
  const parsed = patchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new AppError(400, "invalid_request", t("invalidRequest"));
  const b = parsed.data;
  return withUserEbag(log, async ({ api }) => {
    let warning: string | null = null;
    try {
      if (b.op === "clear") await api.call("clear_cart", {});
      else {
        const res = await api.call<{ warnings?: unknown[] }>("update_cart_item", {
          product_id: b.productId,
          action: b.op,
          quantity: b.op === "set" ? b.quantity : 0,
          unit: b.unit,
        });
        if (res.warnings?.length) warning = t("qtyAdjusted");
      }
    } catch (e) {
      log.warn("ebag.change_rejected", { op: b.op, err: String(e) });
      warning = t("changeRejected");
    }
    return NextResponse.json({ cart: await readCart(api), warning });
  });
});

const postBody = z.object({ planId: z.uuid(), ebagIds: z.array(z.number().int().positive()).max(10), summary: z.boolean().optional() });

export const POST = apiHandler("POST /api/ebag/cart", async ({ log }, req: NextRequest) => {
  const t0 = Date.now();
  const t = await getTranslations("ebag.api");
  const parsed = postBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new AppError(400, "invalid_request", t("invalidRequest"));
  return withUserEbag(log, async ({ api, supabase }) => {
    const plan = await getPlan(supabase, parsed.data.planId); // RLS: only the user's own plans
    if (!plan) throw new AppError(404, "not_found", t("planNotFound"));
    const wanted = new Set(parsed.data.ebagIds);
    const results: CartItemResult[] = [];
    const pending: number[] = [];
    for (const it of plan.shopping.filter((x) => wanted.has(x.ebag_id))) {
      if (Date.now() - t0 > BUDGET_MS) pending.push(it.ebag_id);
      else results.push(await fillCartItem(api, it));
    }
    const summary = parsed.data.summary && !pending.length ? await getCartSummary(api) : null;
    log.info("ebag.cart_filled", { items: results.length, pending: pending.length, ms: Date.now() - t0 });
    return NextResponse.json({ results, pending, summary });
  });
});
