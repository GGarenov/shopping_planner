"use client";

import { useEffect, useState, useTransition } from "react";
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
  type Diet,
} from "@/lib/profile/options";
import { profileInputSchema } from "@/lib/profile/schema";
import { shouldShowInstallHint } from "@/app/install/hint";
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
  title: string;
  hint?: string;
  fields: Field[];
}

const STEPS: Step[] = [
  { title: "Пол", hint: "Нужен е за формулата за калориите.", fields: ["sex"] },
  { title: "Възраст, ръст и тегло", fields: ["age", "height_cm", "weight_kg"] },
  { title: "Колко се движиш?", fields: ["activity"] },
  { title: "Каква е целта ти?", fields: ["goal"] },
  { title: "Бюджет за седмицата", hint: "Колко искаш да харчиш за храна в eBag на седмица.", fields: ["budget_eur"] },
  { title: "Хранене", fields: ["diet"] },
  { title: "Изключения и алергии", hint: "Рецепти с тези продукти няма да влизат в плана.", fields: ["exclude_tags", "allergens"] },
  { title: "Какво имаш вкъщи?", hint: "Тези продукти се използват в рецептите, но не се купуват.", fields: ["pantry"] },
  { title: "Съгласие", fields: ["consent"] },
];

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function validate(values: WizardValues, fields: Field[]): string | null {
  const mask = Object.fromEntries(fields.map((f) => [f, true])) as Partial<Record<Field, true>>;
  const r = profileInputSchema.pick(mask).safeParse(values);
  return r.success ? null : (r.error.issues[0]?.message ?? "Невалидни данни");
}

export function OnboardingWizard({ initial, editing }: { initial: WizardValues; editing: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<WizardValues>(initial);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

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
    if (err) return setError(err);
    if (!last) {
      setStepIndex((i) => i + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    startSaving(async () => {
      const res = await saveProfile(values);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm opacity-70">
          {stepIndex > 0 ? (
            <button type="button" className="btn-ghost -ml-3" onClick={() => setStepIndex((i) => i - 1)}>
              ← Назад
            </button>
          ) : editing ? (
            <Link href="/targets" className="btn-ghost -ml-3">
              ← Отказ
            </Link>
          ) : (
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn-ghost -ml-3">
                Изход
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
        <h1 className="text-2xl font-bold">{step.title}</h1>
        {step.hint && <p className="opacity-75">{step.hint}</p>}
      </header>

      <section className="flex flex-col gap-3">
        <StepBody stepIndex={stepIndex} values={values} set={set} />
      </section>

      <footer className="mt-auto flex flex-col gap-2 pt-4">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn-primary" onClick={next} disabled={saving}>
          {last ? (saving ? "Запазваме…" : editing ? "Запази" : "Готово — покажи целите ми") : "Напред"}
        </button>
      </footer>
    </div>
  );
}

function StepBody({
  stepIndex,
  values,
  set,
}: {
  stepIndex: number;
  values: WizardValues;
  set: <K extends Field>(k: K, v: WizardValues[K]) => void;
}) {
  switch (stepIndex) {
    case 0:
      return (
        <div role="radiogroup" className="grid grid-cols-2 gap-3">
          {SEX_OPTIONS.map((o) => (
            <Choice key={o.value} checked={values.sex === o.value} onClick={() => set("sex", o.value)} label={o.label} />
          ))}
        </div>
      );
    case 1:
      return (
        <>
          <NumberField label="Възраст" unit="години" value={values.age} onChange={(v) => set("age", v)} />
          <NumberField label="Ръст" unit="см" value={values.height_cm} onChange={(v) => set("height_cm", v)} />
          <NumberField label="Тегло" unit="кг" value={values.weight_kg} onChange={(v) => set("weight_kg", v)} decimal />
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
              label={o.label}
              sub={o.example}
            />
          ))}
        </div>
      );
    case 3:
      return (
        <div role="radiogroup" className="flex flex-col gap-3">
          {GOAL_OPTIONS.map((o) => (
            <Choice key={o.value} checked={values.goal === o.value} onClick={() => set("goal", o.value)} label={o.label} sub={o.hint} />
          ))}
        </div>
      );
    case 4:
      return (
        <>
          <NumberField label="Бюджет" unit="€ / седмица" value={values.budget_eur} onChange={(v) => set("budget_eur", v)} decimal />
          <div className="flex flex-wrap gap-2">
            {[60, 80, 100, 120, 150].map((b) => (
              <button
                key={b}
                type="button"
                className="chip"
                aria-pressed={values.budget_eur === String(b)}
                onClick={() => set("budget_eur", String(b))}
              >
                {b} €
              </button>
            ))}
          </div>
        </>
      );
    case 5:
      return (
        <div role="radiogroup" className="flex flex-col gap-3">
          {DIET_OPTIONS.map((o) => (
            <Choice key={o.label} checked={values.diet === o.value} onClick={() => set("diet", o.value)} label={o.label} />
          ))}
        </div>
      );
    case 6:
      return (
        <>
          <h2 className="font-semibold">Не ям</h2>
          <Chips options={EXCLUDE_OPTIONS} selected={values.exclude_tags} onToggle={(v) => set("exclude_tags", toggle(values.exclude_tags, v))} />
          <h2 className="mt-2 font-semibold">Алергии</h2>
          <Chips options={ALLERGEN_OPTIONS} selected={values.allergens} onToggle={(v) => set("allergens", toggle(values.allergens, v))} />
          <p className="text-sm opacity-70">Провери етикета на продуктите при сериозна алергия — данните идват от eBag.</p>
        </>
      );
    case 7:
      return <Chips options={PANTRY_OPTIONS} selected={values.pantry} onToggle={(v) => set("pantry", toggle(values.pantry, v))} />;
    case 8:
      return (
        <>
          <div className="card flex flex-col gap-2 text-sm">
            <p>
              За да изчислим целите ти, пазим пола, възрастта, ръста, теглото, активността, целта, бюджета и
              хранителните ти предпочитания. Това са лични данни.
            </p>
            <p>Използваме ги само за твоя план. Не ги споделяме. Можеш да изтриеш профила си с всички данни по всяко време.</p>
          </div>
          <label className="choice">
            <input
              type="checkbox"
              className="size-6 accent-[var(--accent)]"
              checked={values.consent}
              onChange={(e) => set("consent", e.target.checked)}
            />
            <span>Съгласен/на съм данните ми да се обработват за изготвяне на плана.</span>
          </label>
        </>
      );
    default:
      return null;
  }
}

function Choice({ checked, onClick, label, sub }: { checked: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <button type="button" role="radio" aria-checked={checked} className="choice" onClick={onClick}>
      <span
        aria-hidden
        className={`size-5 shrink-0 rounded-full border-2 ${checked ? "border-accent bg-accent" : "border-border"}`}
      />
      <span className="flex flex-col">
        <span className="text-lg font-medium">{label}</span>
        {sub && <span className="text-sm opacity-70">{sub}</span>}
      </span>
    </button>
  );
}

function Chips({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={selected.includes(o.value)} onClick={() => onToggle(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumberField({
  label,
  unit,
  value,
  onChange,
  decimal,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  decimal?: boolean;
}) {
  const id = `f-${label}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          className="input"
          inputMode={decimal ? "decimal" : "numeric"}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(",", "."))}
        />
        <span className="w-28 shrink-0 text-sm opacity-70">{unit}</span>
      </div>
    </div>
  );
}
