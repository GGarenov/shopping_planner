import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, intl } from "@/test/server";
import { GET, PATCH, POST } from "./route";

vi.mock("next-intl/server", async () => (await import("@/test/server")).intlServer);
const db = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client, createAdminClient: () => ({}) }));

// The user's eBag connection: stored tokens + their status.
const conn = vi.hoisted(() => ({ tokens: true, status: "connected" as string }));
const touch = vi.fn(async () => {});
vi.mock("@/lib/ebag/oauth", () => ({
  UserTokens: { load: async () => (conn.tokens ? { touch } : null) },
  getConnectionRow: async () => ({ status: conn.status }),
}));

// A fake eBag MCP: tool name → handler (throw to simulate eBag refusing / being down).
type Handler = (args: Record<string, unknown>) => unknown;
const ebag = vi.hoisted(() => ({
  tools: {} as Record<string, Handler>,
  calls: [] as [string, Record<string, unknown>][],
  connectFails: false,
}));
vi.mock("@/lib/ebag/api", () => ({
  connectEbag: async () => {
    if (ebag.connectFails) throw new Error("401 from eBag");
    return {
      call: async (name: string, args: Record<string, unknown>) => {
        ebag.calls.push([name, args]);
        const h = ebag.tools[name];
        if (!h) throw new Error(`unexpected tool ${name}`);
        return h(args);
      },
      close: async () => {},
    };
  },
}));
vi.spyOn(console, "error").mockImplementation(() => {});

const product = (id: number, name: string, qty = 1) => ({
  product: {
    id,
    name,
    url: `https://ebag.bg/p/${id}`,
    prices: { unit_delta: "2.00" },
    unit: "pcs",
    quantity_step: "1",
    available_quantity: "10",
  },
  quantity: String(qty),
  line_total: (2 * qty).toFixed(2),
  available: true,
});
const cartPage = {
  items: [product(1, "Домати", 2)],
  totals: { total: "4.00", savings: "0", shipping_price: "2.55" },
  total_items: 1,
  url: "https://ebag.bg/cart/",
};

const req = (method: string, body: unknown) =>
  new NextRequest("http://localhost/api/ebag/cart", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  intl.locale = "bg";
  db.client = fakeSupabase({ user: { id: "user-1" } }).client;
  Object.assign(conn, { tokens: true, status: "connected" });
  Object.assign(ebag, { calls: [], connectFails: false });
  ebag.tools = {
    get_cart: () => cartPage,
    get_delivery_info: () => ({ area: "Дианабад", city: "София", order_min_price: "15.34", free_shipping_price_threshold: "51.13" }),
    get_delivery_slots: () => ({ slots: { "2026-11-24": ["21:00-22:00"] } }),
    update_cart_item: () => ({ warnings: [] }),
    clear_cart: () => ({}),
  };
});

describe("/api/ebag/cart", () => {
  describe("GET (cart screen)", () => {
    it("401 when not logged in", async () => {
      db.client = fakeSupabase({ user: null }).client;
      expect((await GET()).status).toBe(401);
    });

    it("403 for a guest: eBag needs an account", async () => {
      db.client = fakeSupabase({ user: { id: "guest-1", is_anonymous: true } }).client;
      const res = await GET();
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatchObject({ code: "guest", message: "Влез с Google, за да свържеш eBag." });
    });

    it("409 «connect again» when the user has no eBag connection", async () => {
      conn.tokens = false;
      const res = await GET();
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatchObject({ code: "reconnect", message: "Свържи eBag профила си отново." });
    });

    it("returns the cart, delivery fees and the earliest slots", async () => {
      const body = await (await GET()).json();
      expect(body.cart).toMatchObject({ count: 1, total: 4, shipping: 2.55, items: [{ id: 1, name: "Домати", quantity: 2 }] });
      expect(body.delivery).toMatchObject({ area: "Дианабад, София", minOrder: 15.34 });
      expect(body.slots).toEqual([{ date: "2026-11-24", time: "21:00-22:00" }]);
      expect(touch).toHaveBeenCalled(); // connection marked as used
    });

    it("still shows the cart when eBag has no delivery info (e.g. no saved address)", async () => {
      ebag.tools.get_delivery_info = () => {
        throw new Error("no address");
      };
      const res = await GET();
      expect(res.status).toBe(200);
      expect((await res.json()).delivery).toBeNull();
    });

    it("409 when eBag rejects the stored login (connection expired)", async () => {
      ebag.connectFails = true;
      conn.status = "expired";
      const res = await GET();
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("reconnect");
    });

    it("502 «eBag is down» when the connection is fine but eBag fails", async () => {
      ebag.connectFails = true;
      const res = await GET();
      expect(res.status).toBe(502);
      expect((await res.json()).error).toMatchObject({
        code: "ebag_down",
        message: "eBag не отговаря в момента. Опитай отново след малко.",
      });
    });
  });

  describe("PATCH (change the cart)", () => {
    it("400 on an invalid body, before touching eBag", async () => {
      const res = await PATCH(req("PATCH", { op: "set", productId: -1, quantity: 2, unit: "box" }));
      expect(res.status).toBe(400);
      expect(ebag.calls).toEqual([]);
    });

    it("set → update_cart_item with the absolute quantity, then the fresh cart", async () => {
      const res = await PATCH(req("PATCH", { op: "set", productId: 1, quantity: 3, unit: "pcs" }));
      expect(ebag.calls[0]).toEqual(["update_cart_item", { product_id: 1, action: "set", quantity: 3, unit: "pcs" }]);
      expect(await res.json()).toMatchObject({ warning: null, cart: { count: 1 } });
    });

    it("remove and clear map to the right eBag tools", async () => {
      await PATCH(req("PATCH", { op: "remove", productId: 1, unit: "pcs" }));
      await PATCH(req("PATCH", { op: "clear" }));
      expect(ebag.calls.map(([n, a]) => [n, a.action])).toEqual([
        ["update_cart_item", "remove"],
        ["get_cart", undefined],
        ["clear_cart", undefined],
        ["get_cart", undefined],
      ]);
    });

    it("tells the user when eBag adjusted or refused the change", async () => {
      ebag.tools.update_cart_item = () => ({ warnings: ["max 5"] });
      const adjusted = await PATCH(req("PATCH", { op: "set", productId: 1, quantity: 9, unit: "pcs" }));
      expect((await adjusted.json()).warning).toBe("eBag коригира количеството според наличността.");
      ebag.tools.update_cart_item = () => {
        throw new Error("sold out");
      };
      const refused = await PATCH(req("PATCH", { op: "set", productId: 1, quantity: 2, unit: "pcs" }));
      expect((await refused.json()).warning).toBe("eBag не прие промяната — виж актуалната количка.");
    });
  });

  describe("POST (send the plan's list to the cart)", () => {
    const PLAN_ID = "11111111-1111-4111-8111-111111111111";
    const planRow = (shopping: unknown[]) => ({
      id: PLAN_ID,
      week_start: "2026-11-23",
      plan: [],
      shopping,
      checkout_eur: "1",
      eaten_eur: "1",
      solver: {},
      targets: {},
      created_at: "x",
    });
    const item = (ebag_id: number, alternatives: unknown[] = []) => ({
      ebag_id,
      product: `P${ebag_id}`,
      ingredient: "I",
      packs: 1,
      unit: "pcs",
      used_edible_g: 500,
      alternatives,
    });

    it("404 when the plan is not the user's own (RLS returns nothing)", async () => {
      const res = await POST(req("POST", { planId: PLAN_ID, ebagIds: [1] }));
      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatchObject({ code: "not_found", message: "Планът не е намерен." });
    });

    it("adds in-stock items, replaces sold-out ones, reports the rest", async () => {
      const shopping = [item(1), item(2, [{ ebag_id: 22, name: "Alt", usable_g: 250, unit: "pcs" }]), item(3), item(4)];
      db.client = fakeSupabase({
        user: { id: "user-1" },
        tables: { plans: { maybeSingle: { data: planRow(shopping), error: null } } },
      }).client;
      const stock: Record<number, number> = { 1: 5, 2: 0, 22: 3, 3: 0 };
      ebag.tools.get_product = (a) => ({
        is_available: true,
        available_quantity: stock[Number(a.product_id)] ?? 0,
        unit: "pcs",
        prices: { unit_delta: "1" },
      });
      const res = await POST(req("POST", { planId: PLAN_ID, ebagIds: [1, 2, 3] })); // item 4 is not in this batch
      const { results, pending } = await res.json();
      expect(pending).toEqual([]);
      expect(results.map((r: { ebag_id: number; status: string }) => [r.ebag_id, r.status])).toEqual([
        [1, "added"],
        [2, "replaced"],
        [3, "missing"],
      ]);
      expect(results[1].line).toMatchObject({ ebag_id: 22, qty: 2 }); // 500 g needed / 250 g packs
      expect(ebag.calls.some(([n]) => n === "checkout")).toBe(false); // never orders
    });
  });
});
