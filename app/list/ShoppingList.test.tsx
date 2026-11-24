// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { groupByAisle, shoppingTotals } from "@/lib/plans/shopping";
import { shopping } from "@/test/fixtures";
import { renderWithIntl } from "@/test/render";
import { ShoppingList } from "./ShoppingList";

const setChecked = vi.fn<(planId: string, ids: number[], checked: boolean) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
vi.mock("./actions", () => ({ setChecked: (...a: [string, number[], boolean]) => setChecked(...a) }));

const props = { planId: "plan-1", groups: groupByAisle(shopping), totals: shoppingTotals(shopping), initialChecked: [] as number[] };

describe("ShoppingList", () => {
  it("shows aisles in shop order with products, prices, promo and totals", () => {
    renderWithIntl(<ShoppingList {...props} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Зеленчуци3,28 €", "Млечни и яйца3,47 €"]);
    expect(screen.getByText("6,75 €")).toBeInTheDocument(); // you pay
    expect(screen.getByText("Домати Рома")).toBeInTheDocument();
    expect(screen.getAllByText("Промо")).toHaveLength(1);
    expect(screen.getByText(/Взети:/)).toHaveTextContent("Взети: 0 от 3");
  });

  it("ticks an item, saves it and updates the count", async () => {
    const { user } = renderWithIntl(<ShoppingList {...props} />);
    const box = screen.getByRole("checkbox", { name: /Лук Кромид/ });
    await user.click(box);
    expect(box).toBeChecked();
    expect(screen.getByText(/Взети:/)).toHaveTextContent("Взети: 1 от 3");
    await waitFor(() => expect(setChecked).toHaveBeenCalledWith("plan-1", [102], true));
  });

  it("reverts the tick and says so when saving fails", async () => {
    setChecked.mockResolvedValueOnce({ ok: false });
    const { user } = renderWithIntl(<ShoppingList {...props} />);
    const box = screen.getByRole("checkbox", { name: /Яйца M/ });
    await user.click(box);
    expect(await screen.findByRole("alert")).toHaveTextContent("Отметката не се запази");
    expect(box).not.toBeChecked();
  });

  it("«Махни отметките» unticks everything that was ticked", async () => {
    const { user } = renderWithIntl(<ShoppingList {...props} initialChecked={[101, 201]} />);
    expect(screen.getByText(/Взети:/)).toHaveTextContent("Взети: 2 от 3");
    await user.click(screen.getByRole("button", { name: "Махни отметките" }));
    await waitFor(() => expect(setChecked).toHaveBeenCalledWith("plan-1", [101, 201], false));
    expect(screen.getAllByRole("checkbox").filter((b) => (b as HTMLInputElement).checked)).toHaveLength(0);
  });

  it("in English: translated aisles, ingredients, units and money", () => {
    renderWithIntl(<ShoppingList {...props} />, { locale: "en" });
    const veg = screen.getByRole("region", { name: /Vegetables/ });
    expect(within(veg).getByText(/500 g · Tomatoes/)).toBeInTheDocument();
    expect(within(veg).getByText(/1 kg · Onions/)).toBeInTheDocument();
    expect(screen.getByText("€6.75")).toBeInTheDocument();
    expect(screen.getByText(/Taken:/)).toHaveTextContent("Taken: 0 of 3");
  });
});
