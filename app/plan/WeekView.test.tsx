// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { days } from "@/test/fixtures";
import { renderWithIntl } from "@/test/render";
import { WeekView } from "./WeekView";

const props = {
  planId: "plan-1",
  days,
  dates: ["23.11", "24.11"],
  initialDay: 0,
  kcalMin: 1400,
  kcalMax: 1600,
  proteinMin: 100,
  photos: { ovesena_kasha_banan: "/recipes/ovesena_kasha_banan-400.webp" },
};

const meals = () => screen.getAllByRole("link");

describe("WeekView", () => {
  it("opens on the given day with its four meals linking to the recipes", () => {
    renderWithIntl(<WeekView {...props} />);
    expect(screen.getByRole("tab", { name: "Понеделник 23.11" })).toHaveAttribute("aria-selected", "true");
    expect(meals()).toHaveLength(4);
    expect(meals()[0]).toHaveAttribute("href", "/plan/plan-1/0/breakfast");
    expect(within(meals()[0]!).getByText("Закуска")).toBeInTheDocument();
    expect(within(meals()[0]!).getByText("470 kcal · 19 г протеин")).toBeInTheDocument();
  });

  it("marks day totals: ✓ in range, ! when protein is below the minimum", async () => {
    const { user } = renderWithIntl(<WeekView {...props} />);
    const totals = () => screen.getByRole("region", { name: "Общо за деня" });
    expect(within(totals()).getAllByText("✓", { exact: false })).toHaveLength(2);
    await user.click(screen.getByRole("tab", { name: "Вторник 24.11" }));
    expect(within(totals()).getByRole("heading")).toHaveTextContent("Вторник");
    expect(within(totals()).getByText("!", { exact: false })).toBeInTheDocument();
    expect(meals()[0]).toHaveAttribute("href", "/plan/plan-1/1/breakfast");
  });

  it("shows the recipe photo when there is one, a coloured placeholder otherwise", () => {
    const { container } = renderWithIntl(<WeekView {...props} />);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute("src", "/recipes/ovesena_kasha_banan-400.webp");
    expect(container.querySelectorAll("li svg")).toHaveLength(3);
  });

  it("in English: translated day, slot and recipe names", () => {
    renderWithIntl(<WeekView {...props} />, { locale: "en" });
    expect(screen.getByRole("tab", { name: "Monday 23.11" })).toBeInTheDocument();
    expect(within(meals()[3]!).getByText("Snack")).toBeInTheDocument();
    expect(within(meals()[1]!).getByText(/red lentil/i)).toBeInTheDocument();
  });
});
