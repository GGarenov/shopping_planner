// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeTargets } from "@/lib/planner/targets";
import { json, renderWithIntl } from "@/test/render";
import { router } from "@/test/setup";
import { PlanSettingsForm, type SettingsValues } from "./PlanSettingsForm";

const savePlanSettings = vi.fn<(input: unknown) => Promise<{ error?: string }>>(async () => ({}));
vi.mock("./actions", () => ({ savePlanSettings: (i: unknown) => savePlanSettings(i) }));

// The tester profile from the first round of feedback: woman, 39, 161 cm, 52 kg, light activity, losing weight.
const initial: SettingsValues = {
  sex: "female",
  age: "39",
  height_cm: "161",
  weight_kg: "52",
  activity: "light",
  goal: "lose",
  budget_eur: "80",
  diet: null,
  exclude_tags: ["pork"],
  allergens: [],
  pantry: ["salt"],
  manual: false,
  kcal_min: "",
  kcal_max: "",
  protein_min: "",
  kcal_tolerance: 100,
};
const body = { sex: "female", age: 39, height_cm: 161, activity: "light", kcal_tolerance: 100 } as const;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => json({ id: "new-plan", seconds: 5, varied: null }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const targetsText = () => screen.getByRole("region", { name: "Калории и протеин на ден" }).textContent ?? "";
const submit = () => screen.getByRole("button", { name: "Създай плана" });

describe("PlanSettingsForm («Нов план»)", () => {
  it("shows the current settings and the daily targets computed from them", () => {
    renderWithIntl(<PlanSettingsForm initial={initial} />);
    const t = computeTargets({ ...body, weight_kg: 52, goal: "lose" });
    expect(screen.getByLabelText("Тегло")).toHaveValue("52");
    expect(screen.getByLabelText("Друга сума")).toHaveValue("80");
    expect(targetsText()).toContain(`${t.kcal_min}–${t.kcal_max}`);
    expect(targetsText()).toContain(`≥ ${t.protein_min}`);
  });

  it("recalculates the targets live while the weight or goal changes", async () => {
    const { user } = renderWithIntl(<PlanSettingsForm initial={initial} />);
    const weight = screen.getByLabelText("Тегло");
    await user.clear(weight);
    await user.type(weight, "70");
    const t70 = computeTargets({ ...body, weight_kg: 70, goal: "lose" });
    expect(targetsText()).toContain(`${t70.kcal_min}–${t70.kcal_max}`);
    await user.click(screen.getByRole("radio", { name: /Поддържане/ }));
    const maintain = computeTargets({ ...body, weight_kg: 70, goal: "maintain" });
    expect(targetsText()).toContain(`${maintain.kcal_min}–${maintain.kcal_max}`);
  });

  it("saves the settings, then creates the plan and opens it", async () => {
    const { user } = renderWithIntl(<PlanSettingsForm initial={initial} />);
    await user.click(screen.getByRole("radio", { name: "100 €" }));
    await user.click(submit());
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/plan"));
    expect(savePlanSettings).toHaveBeenCalledWith(
      expect.objectContaining({ budget_eur: "100", weight_kg: "52", exclude_tags: ["pork"], targets: { mode: "auto" } }),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/plan", { method: "POST" });
  });

  it("manual targets start from the computed values and are sent as manual", async () => {
    const { user } = renderWithIntl(<PlanSettingsForm initial={initial} />);
    const t = computeTargets({ ...body, weight_kg: 52, goal: "lose" });
    await user.click(screen.getByRole("button", { name: "Задай ги ръчно" }));
    expect(screen.getByLabelText("kcal от")).toHaveValue(String(t.kcal_min));
    const protein = screen.getByLabelText("Протеин поне");
    await user.clear(protein);
    await user.type(protein, "90");
    await user.click(submit());
    await waitFor(() =>
      expect(savePlanSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: { mode: "manual", kcal_min: String(t.kcal_min), kcal_max: String(t.kcal_max), protein_min: "90" },
        }),
      ),
    );
  });

  it("a rejected setting is shown and no plan is made", async () => {
    savePlanSettings.mockResolvedValueOnce({ error: "Бюджет поне 20 €" });
    const { user } = renderWithIntl(<PlanSettingsForm initial={{ ...initial, budget_eur: "5" }} />);
    await user.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent("Бюджет поне 20 €");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("the planner's own message is shown when no plan fits (e.g. budget too low)", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "С бюджет 20 € не успяхме…", reason: "budget_too_low", min_budget_eur: 51 }, 422));
    const { user } = renderWithIntl(<PlanSettingsForm initial={initial} />);
    await user.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent("С бюджет 20 € не успяхме…");
    expect(router.push).not.toHaveBeenCalled();
  });
});
