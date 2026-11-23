import type { Metadata } from "next";
import { requireCompleteProfile } from "@/lib/profile/load";
import { PlanSettingsForm, type SettingsValues } from "./PlanSettingsForm";

export const metadata: Metadata = { title: "Нов план · Пазарен план" };

export default async function NewPlanPage() {
  const { profile: p } = await requireCompleteProfile();
  const o = p.targets_override;
  const initial: SettingsValues = {
    sex: p.sex,
    age: String(p.age),
    height_cm: String(p.height_cm),
    weight_kg: String(p.weight_kg),
    activity: p.activity,
    goal: p.goal,
    budget_eur: String(p.budget_eur),
    diet: p.diet === "low_carb" ? null : p.diet,
    exclude_tags: p.exclude_tags,
    allergens: p.allergens,
    pantry: p.pantry,
    manual: !!o,
    kcal_min: o ? String(o.kcal_min) : "",
    kcal_max: o ? String(o.kcal_max) : "",
    protein_min: o ? String(o.protein_min) : "",
    kcal_tolerance: p.options.kcal_tolerance,
  };
  return (
    <main className="page pb-0">
      <PlanSettingsForm initial={initial} />
    </main>
  );
}
