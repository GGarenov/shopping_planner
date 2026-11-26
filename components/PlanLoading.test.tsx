// @vitest-environment jsdom
// The "putting your week together" screen: shown only while a plan is being made; the seven days fill one by one.
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render";
import { PlanLoading } from "./PlanLoading";

const recipes = Array.from({ length: 7 }, (_, k) => ({ name: `R${k}`, photo: `/recipes/r${k}-400.webp` }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("PlanLoading", () => {
  it("shows nothing when no plan is being made", () => {
    const { container } = renderWithIntl(<PlanLoading busy={false} step="x" note="y" recipes={recipes} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("covers the screen with the step and the note, and fills the week day by day", () => {
    const { container } = renderWithIntl(<PlanLoading busy step="Избираме рецепти…" note="Отнема до ~15 секунди" recipes={recipes} />);
    expect(screen.getByRole("status")).toHaveTextContent("Сглобяваме седмицата ти");
    expect(screen.getByText("Избираме рецепти…")).toBeInTheDocument();
    expect(screen.getByText("Отнема до ~15 секунди")).toBeInTheDocument();
    const days = container.querySelectorAll("li");
    expect([...days].map((d) => d.textContent)).toEqual(["понеделник", "вторник", "сряда", "четвъртък", "петък", "събота", "неделя"]);
    const filled = () => container.querySelectorAll("img.opacity-100").length;
    expect(filled()).toBe(0);
    act(() => vi.advanceTimersByTime(1200));
    expect(filled()).toBe(1);
    act(() => vi.advanceTimersByTime(6 * 1700));
    expect(filled()).toBe(7);
  });
});
