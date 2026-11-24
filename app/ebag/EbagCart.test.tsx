// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartView, CartViewItem } from "@/lib/ebag/cartView";
import { apiError, json, renderWithIntl } from "@/test/render";
import { EbagCart } from "./EbagCart";

const item = (o: Partial<CartViewItem> & Pick<CartViewItem, "id" | "name">): CartViewItem => ({
  url: `https://ebag.bg/p/${o.id}`,
  image: null,
  packSize: "500 г",
  unit: "pcs",
  quantity: 1,
  step: 1,
  min: 1,
  max: 50,
  price: 2,
  regularPrice: null,
  lineTotal: 2,
  available: true,
  ...o,
});

const cart = (items: CartViewItem[]): CartView => {
  const total = Math.round(items.reduce((a, i) => a + (i.lineTotal ?? 0), 0) * 100) / 100;
  return { items, count: items.length, total, savings: 0, shipping: 2.55, url: "https://ebag.bg/cart/" };
};

const delivery = { area: "Дианабад, София", minOrder: 15.34, highFee: 2.55, lowFee: 1.53, cheaperFrom: 35.79, freeFrom: 51.13 };
const slots = [
  { date: "2026-11-24", time: "21:00-22:00" },
  { date: "2026-11-25", time: "08:00-09:00" },
];
const twoItems = cart([
  item({ id: 1, name: "Пилешко филе", quantity: 2, price: 4.6, lineTotal: 9.2 }),
  item({ id: 2, name: "Извара", price: 1.79, regularPrice: 2.1, lineTotal: 1.79 }),
  item({ id: 3, name: "Домати", price: 2.49, lineTotal: 2.49 }),
  item({ id: 4, name: "Яйца", price: 3.47, lineTotal: 3.47 }),
]);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET") return json({ cart: twoItems, delivery, slots });
    const body = JSON.parse(String(init!.body));
    if (body.op === "set") {
      const items = twoItems.items.map((i) =>
        i.id === body.productId ? { ...i, quantity: body.quantity, lineTotal: (i.price ?? 0) * body.quantity } : i,
      );
      return json({ cart: cart(items), warning: null });
    }
    if (body.op === "remove") return json({ cart: cart(twoItems.items.filter((i) => i.id !== body.productId)), warning: null });
    return json({ cart: cart([]), warning: null }); // clear
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const patchBodies = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH").map(([, init]) => JSON.parse(String(init!.body)));
const row = (name: string) => screen.getByRole("link", { name }).closest("li")!;

describe("EbagCart", () => {
  it("shows the live cart: items, promo, totals, delivery hint and earliest slot", async () => {
    renderWithIntl(<EbagCart today="2026-11-24" refreshKey={0} />);
    expect(await screen.findByRole("heading", { name: "Количката ти в eBag" })).toBeInTheDocument();
    expect(within(row("Извара")).getByText("Промо")).toBeInTheDocument();
    expect(screen.getByText("16,95 €")).toBeInTheDocument(); // products
    expect(screen.getByText("19,50 €")).toBeInTheDocument(); // + delivery 2,55
    expect(screen.getByText("Още 18,84 € до по-евтина доставка (1,53 €).")).toBeInTheDocument();
    expect(screen.getByText(/Най-ранна доставка/)).toHaveTextContent("днес 21:00–22:00");
    expect(screen.getByText("утре 08:00–09:00")).toBeInTheDocument();
  });

  it("«+» sets the new quantity at eBag and shows the updated line", async () => {
    const { user } = renderWithIntl(<EbagCart today="2026-11-24" refreshKey={0} />);
    await screen.findByText("Пилешко филе");
    await user.click(within(row("Пилешко филе")).getByRole("button", { name: "Повече" }));
    await waitFor(() => expect(patchBodies()).toEqual([{ op: "set", productId: 1, quantity: 3, unit: "pcs" }]));
    expect(await within(row("Пилешко филе")).findByText("13,80 €")).toBeInTheDocument();
  });

  it("«−» at the minimum becomes «Махни» and removes the product", async () => {
    const { user } = renderWithIntl(<EbagCart today="2026-11-24" refreshKey={0} />);
    await screen.findByText("Домати");
    await user.click(within(row("Домати")).getByRole("button", { name: "Махни" }));
    await waitFor(() => expect(patchBodies()).toEqual([{ op: "remove", productId: 3, unit: "pcs" }]));
    await waitFor(() => expect(screen.queryByText("Домати")).not.toBeInTheDocument());
  });

  it("asks before clearing the whole cart", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { user } = renderWithIntl(<EbagCart today="2026-11-24" refreshKey={0} />);
    const clear = await screen.findByRole("button", { name: "Изчисти количката" });
    await user.click(clear);
    expect(patchBodies()).toEqual([]);
    await user.click(clear);
    await waitFor(() => expect(patchBodies()).toEqual([{ op: "clear" }]));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Количката ти е празна.")).toBeInTheDocument();
  });

  it("expired eBag connection: shows the reason and a «connect again» link", async () => {
    fetchMock.mockResolvedValueOnce(apiError(409, "reconnect", "Връзката с eBag е изтекла."));
    renderWithIntl(<EbagCart today="2026-11-24" refreshKey={0} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Връзката с eBag е изтекла.");
    expect(within(alert).getByRole("link", { name: "Свържи eBag отново" })).toHaveAttribute("href", "/api/ebag/connect");
  });

  it("eBag hiccups once: the cart still loads (reading is retried quietly)", async () => {
    fetchMock.mockResolvedValueOnce(apiError(502, "ebag_down", "eBag не отговаря в момента."));
    renderWithIntl(<EbagCart today="2026-11-24" refreshKey={0} />);
    expect(await screen.findByText("Пилешко филе", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("eBag down on every try: the message, and «Опитай пак» loads the cart again", async () => {
    const down = () => apiError(502, "ebag_down", "eBag не отговаря в момента.");
    fetchMock.mockResolvedValueOnce(down()).mockResolvedValueOnce(down()).mockResolvedValueOnce(down());
    const { user } = renderWithIntl(<EbagCart today="2026-11-24" refreshKey={0} />);
    expect(await screen.findByText("eBag не отговаря в момента.", {}, { timeout: 4000 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Опитай пак" }));
    expect(await screen.findByText("Пилешко филе")).toBeInTheDocument();
  });

  it("no connection: says so (not a generic error)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithIntl(<EbagCart today="2026-11-24" refreshKey={0} />);
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent(/интернет|връзка/i);
  });

  it("below eBag's minimum order: the order button is disabled and says what is missing", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ cart: cart([item({ id: 9, name: "Лук", price: 0.79, lineTotal: 0.79 })]), delivery, slots: [] }),
    );
    renderWithIntl(<EbagCart today="2026-11-24" refreshKey={0} />);
    expect(await screen.findByText("Още 14,55 € до минималната поръчка в eBag.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Поръчай в eBag/ })).toHaveAttribute("aria-disabled", "true");
  });
});
