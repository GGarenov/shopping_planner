"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Activity, Goal, Sex } from "@/lib/planner/targets";
import {
  ACTIVITY_OPTIONS,
  ALLERGEN_OPTIONS,
  DIET_OPTIONS,
  EXCLUDE_OPTIONS,
  GOAL_OPTIONS,
  PANTRY_OPTIONS,
  SEX_OPTIONS,
  dietKey,
  type Diet,
} from "@/lib/profile/options";
import { errorKey, profileInputSchema, type ErrorKey } from "@/lib/profile/schema";
import { shouldShowInstallHint } from "@/app/install/hint";
import { BudgetField, Chips, Choice, NumberField } from "@/components/form/fields";
import { usePlanGenerator } from "@/app/plan/usePlanGenerator";
import { createClient } from "@/lib/supabase/client";
import { saveProfile } from "./actions";

export interface WizardValues {
  sex: Sex | null;
  age: string;
  height_cm: string;
  weight_kg: string;
  activity: Activity | null;
  goal: Goal | null;
  budget_eur: string;
  diet: Diet | null;
  exclude_tags: string[];
  allergens: string[];
  pantry: string[];
  consent: boolean;
}

type Field = keyof WizardValues;

interface Step {
  /** Key under onboarding.steps (title, optional hint). */
  key: string;
  hint?: boolean;
  fields: Field[];
}

const STEPS: Step[] = [
  { key: "sex", hint: true, fields: ["sex"] },
  { key: "body", fields: ["age", "height_cm", "weight_kg"] },
  { key: "activity", fields: ["activity"] },
  { key: "goal", fields: ["goal"] },
  { key: "budget", hint: true, fields: ["budget_eur"] },
  { key: "diet", fields: ["diet"] },
  { key: "exclude", hint: true, fields: ["exclude_tags", "allergens"] },
  { key: "pantry", hint: true, fields: ["pantry"] },
  { key: "consent", fields: ["consent"] },
];

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Error key ("errors" namespace) of the first invalid field, or null. */
function validate(values: WizardValues, fields: Field[]): ErrorKey | null {
  const mask = Object.fromEntries(fields.map((f) => [f, true])) as Partial<Record<Field, true>>;
  const r = profileInputSchema.pick(mask).safeParse(values);
  return r.success ? null : errorKey(r.error.issues[0]?.message);
}

export function OnboardingWizard({
  initial,
  editing,
  loggedIn,
  guest,
}: {
  initial: WizardValues;
  editing: boolean;
  /** There is a session (a guest's or an account's). Without one, a guest account is made at the last step. */
  loggedIn: boolean;
  /** No account (logged out, or an anonymous guest): the data is kept only for 3 days. */
  guest: boolean;
}) {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const router = useRouter();
  const [values, setValues] = useState<WizardValues>(initial);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const { generate, busy: planning, error: planError, fixable, stepText } = usePlanGenerator();
  const tp = useTranslations("plan.generate");

  // First visit in the browser (not the installed app): offer the install hint once.
  useEffect(() => {
    if (!editing && shouldShowInstallHint()) router.replace("/install?next=/onboarding");
  }, [editing, router]);

  const step = STEPS[stepIndex]!;
  const last = stepIndex === STEPS.length - 1;
  const set = <K extends Field>(k: K, v: WizardValues[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setError(null);
  };

  const next = () => {
    const err = validate(values, step.fields);
    if (err) return setError(te(err));
    if (!last) {
      setStepIndex((i) => i + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    startSaving(async () => {
      if (!loggedIn) {
        // The guest account is made only now, not on page load: visits that never finish (and bots) leave no users.
        const { error: authError } = await createClient().auth.signInAnonymously();
        if (authError) return setError(t(authError.status === 429 ? "guestTooMany" : "guestFailed"));
      }
      const res = await saveProfile(values); // editing: redirects back to /targets
      if (res?.error) return setError(res.error);
      // First time: straight on to the plan — no detour via the targets screen (it stays under Profile).
      await generate();
    });
  };
  const busy = saving || planning;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm text-subtle">
          {stepIndex > 0 ? (
            <button type="button" className="btn-ghost -ml-3" onClick={() => setStepIndex((i) => i - 1)}>
              {tc("back")}
            </button>
          ) : editing ? (
            <Link href="/targets" className="btn-ghost -ml-3">
              {t("cancel")}
            </Link>
          ) : !loggedIn ? (
            <Link href="/login" className="btn-ghost -ml-3">
              {t("haveAccount")}
            </Link>
          ) : (
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn-ghost -ml-3">
                {tc("logout")}
              </button>
            </form>
          )}
          <span>
            {stepIndex + 1} / {STEPS.length}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-accent transition-all" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
        </div>
        <h1 className="text-2xl font-bold">{t(`steps.${step.key}.title`)}</h1>
        {step.hint && <p className="text-subtle">{t(`steps.${step.key}.hint`)}</p>}
      </header>

      <section className="flex flex-col gap-3">
        <StepBody stepIndex={stepIndex} values={values} set={set} guest={guest} />
      </section>

      <footer className="mt-auto flex flex-col gap-2 pt-4">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {planError && (
          <div className="flex flex-col gap-2" role="alert">
            <p className="error">{planError}</p>
            {fixable && (
              <Link href="/plan/new" className="btn-secondary">
                {tp("fixSettings")}
              </Link>
            )}
          </div>
        )}
        <button type="button" className="btn-primary" onClick={next} disabled={busy}>
          {last ? (planning ? tp("creating") : saving ? tc("saving") : editing ? tc("save") : t("finish")) : t("next")}
        </button>
        {planning && (
          <p className="text-center text-sm text-subtle" aria-live="polite">
            {tp("upTo15", { step: stepText })}
          </p>
        )}
      </footer>
    </div>
  );
}

function StepBody({
  stepIndex,
  values,
  set,
  guest,
}: {
  stepIndex: number;
  values: WizardValues;
  set: <K extends Field>(k: K, v: WizardValues[K]) => void;
  guest: boolean;
}) {
  const t = useTranslations("onboarding");
  const to = useTranslations("options");
  const chips = (opts: { value: string }[], group: "exclude" | "allergen" | "pantry") =>
    opts.map((o) => ({ value: o.value, label: to(`${group}.${o.value}`) }));
  switch (stepIndex) {
    case 0:
      return (
        <div role="radiogroup" className="grid grid-cols-2 gap-3">
          {SEX_OPTIONS.map((o) => (
            <Choice key={o.value} checked={values.sex === o.value} onClick={() => set("sex", o.value)} label={to(`sex.${o.value}`)} />
          ))}
        </div>
      );
    case 1:
      return (
        <>
          <NumberField label={t("age")} unit={t("years")} value={values.age} onChange={(v) => set("age", v)} />
          <NumberField label={t("height")} unit={t("cm")} value={values.height_cm} onChange={(v) => set("height_cm", v)} />
          <NumberField label={t("weight")} unit={t("kg")} value={values.weight_kg} onChange={(v) => set("weight_kg", v)} decimal />
        </>
      );
    case 2:
      return (
        <div role="radiogroup" className="flex flex-col gap-3">
          {ACTIVITY_OPTIONS.map((o) => (
            <Choice
              key={o.value}
              checked={values.activity === o.value}
              onClick={() => set("activity", o.value)}
              label={to(`activity.${o.value}.label`)}
              sub={to(`activity.${o.value}.example`)}
            />
          ))}
        </div>
      );
    case 3:
      return (
        <div role="radiogroup" className="flex flex-col gap-3">
          {GOAL_OPTIONS.map((o) => (
            <Choice
              key={o.value}
              checked={values.goal === o.value}
              onClick={() => set("goal", o.value)}
              label={to(`goal.${o.value}.label`)}
              sub={to(`goal.${o.value}.hint`)}
            />
          ))}
        </div>
      );
    case 4:
      return (
        <>
          <BudgetField value={values.budget_eur} onChange={(v) => set("budget_eur", v)} />
        </>
      );
    case 5:
      return (
        <div role="radiogroup" className="flex flex-col gap-3">
          {DIET_OPTIONS.map((o) => (
            <Choice
              key={dietKey(o.value)}
              checked={values.diet === o.value}
              onClick={() => set("diet", o.value)}
              label={to(`diet.${dietKey(o.value)}`)}
              sub={o.soon ? to("diet.soon") : undefined}
              disabled={!!o.soon && values.diet !== o.value}
            />
          ))}
        </div>
      );
    case 6:
      return (
        <>
          <h2 className="font-semibold">{t("dontEat")}</h2>
          <Chips
            options={chips(EXCLUDE_OPTIONS, "exclude")}
            selected={values.exclude_tags}
            onToggle={(v) => set("exclude_tags", toggle(values.exclude_tags, v))}
          />
          <h2 className="mt-2 font-semibold">{t("allergies")}</h2>
          <Chips
            options={chips(ALLERGEN_OPTIONS, "allergen")}
            selected={values.allergens}
            onToggle={(v) => set("allergens", toggle(values.allergens, v))}
          />
          <p className="text-sm text-subtle">{t("allergyNote")}</p>
        </>
      );
    case 7:
      return (
        <Chips
          options={chips(PANTRY_OPTIONS, "pantry")}
          selected={values.pantry}
          onToggle={(v) => set("pantry", toggle(values.pantry, v))}
        />
      );
    case 8:
      return (
        <>
          <div className="card flex flex-col gap-2 text-sm">
            <p>{t("consentText1")}</p>
            <p>{t("consentText2")}</p>
            {guest && <p className="font-semibold">{t("consentGuest")}</p>}
          </div>
          <label className="choice">
            <input
              type="checkbox"
              className="size-6 accent-[var(--accent)]"
              checked={values.consent}
              onChange={(e) => set("consent", e.target.checked)}
            />
            <span>{t("consentCheckbox")}</span>
          </label>
        </>
      );
    default:
      return null;
  }
}
