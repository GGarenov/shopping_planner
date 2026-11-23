import type { Metadata } from "next";
import { getUserAndProfile } from "@/lib/profile/load";
import { DEFAULT_PANTRY } from "@/lib/profile/options";
import { isComplete } from "@/lib/profile/schema";
import { OnboardingWizard, type WizardValues } from "./OnboardingWizard";

export const metadata: Metadata = { title: "Твоите данни · Пазарен план" };

export default async function OnboardingPage() {
  const { profile } = await getUserAndProfile();
  const editing = isComplete(profile);

  const initial: WizardValues = {
    sex: profile?.sex ?? null,
    age: profile?.age?.toString() ?? "",
    height_cm: profile?.height_cm?.toString() ?? "",
    weight_kg: profile?.weight_kg?.toString() ?? "",
    activity: profile?.activity ?? null,
    goal: profile?.goal ?? null,
    budget_eur: profile?.budget_eur?.toString() ?? "100",
    diet: profile?.diet === "low_carb" ? null : (profile?.diet ?? null),
    exclude_tags: profile?.exclude_tags ?? [],
    allergens: profile?.allergens ?? [],
    pantry: profile ? profile.pantry : DEFAULT_PANTRY,
    consent: !!profile?.options?.consent_at,
  };

  return (
    <main className="page">
      <OnboardingWizard initial={initial} editing={editing} />
    </main>
  );
}
