"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BudgetField, Chips, Choice, NumberField } from "@/components/form/fields";
import { computeTargets, type Activity, type Goal, type Sex } from "@/lib/planner/targets";
import { ACTIVITY_OPTIONS, ALLERGEN_OPTIONS, DIET_OPTIONS, EXCLUDE_OPTIONS, GOAL_OPTIONS, PANTRY_OPTIONS, SEX_OPTIONS, dietKey, type Diet } from "@/lib/profile/options";
import { usePlanGenerator } from "../usePlanGenerator";
import { savePlanSettings } from "./actions";

export interface SettingsValues {
  sex: Sex;
  age: string;
  height_cm: string;
  weight_kg: string;
  activity: Activity;
  goal: Goal;
  budget_eur: string;
  diet: Diet | null;
  exclude_tags: string[];
  allergens: string[];
  pantry: string[];
  manual: boolean;
  kcal_min: string;
  kcal_max: string;
  protein_min: string;
  kcal_tolerance?: number;
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function PlanSettingsForm({ initial }: { initial: SettingsValues }) {
  const tp = useTranslations("plan");
  const t = useTranslations("plan.settings");
  const tg = useTranslations("plan.generate");
  const tc = useTranslations("common");
  const to = useTranslations("options");
  /** Option label from the "options" namespace, or the Bulgarian label from lib/profile/options while a key is missing. */
  const opt = (key: string, fallback: string) => (to.has(key) ? to(key) : fallback);
  const chips = (group: string, list: { value: string; label: string }[]) => list.map((o) => ({ value: o.value, label: opt(`${group}.${o.value}`, o.label) }));
  const [v, setV] = useState(initial);
  const [saving, startSaving] = useTransition();
  const gen = usePlanGenerator();
  const set = <K extends keyof SettingsValues>(k: K, val: SettingsValues[K]) => {
    setV((s) => ({ ...s, [k]: val }));
    gen.setError(null);
  };

  // Targets recalculated live from the body data (shown when not set by hand).
  const computed = useMemo(() => {
    const n = { age: Number(v.age), height_cm: Number(v.height_cm), weight_kg: Number(v.weight_kg) };
    if (!(n.age >= 14 && n.height_cm >= 120 && n.weight_kg >= 30)) return null;
    return computeTargets({ sex: v.sex, activity: v.activity, goal: v.goal, kcal_tolerance: v.kcal_tolerance, ...n });
  }, [v.sex, v.age, v.height_cm, v.weight_kg, v.activity, v.goal, v.kcal_tolerance]);

  const busy = saving || gen.busy;
  const submit = () =>
    startSaving(async () => {
      const res = await savePlanSettings({
        sex: v.sex,
        age: v.age,
        height_cm: v.height_cm,
        weight_kg: v.weight_kg,
        activity: v.activity,
        goal: v.goal,
        budget_eur: v.budget_eur,
        diet: v.diet,
        exclude_tags: v.exclude_tags,
        allergens: v.allergens,
        pantry: v.pantry,
        targets: v.manual ? { mode: "manual", kcal_min: v.kcal_min, kcal_max: v.kcal_max, protein_min: v.protein_min } : { mode: "auto" },
      });
      if (res.error) return gen.setError(res.error);
      await gen.generate();
    });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Link href="/plan" className="btn-ghost -ml-3 self-start">
          {tc("back")}
        </Link>
        <h1 className="text-2xl font-bold">{tp("newPlan")}</h1>
        <p className="opacity-80">{t("intro")}</p>
      </header>

      <section className="card flex flex-col gap-3" aria-labelledby="s-budget">
        <h2 id="s-budget" className="text-lg font-semibold">
          {t("budget")}
        </h2>
        <BudgetField value={v.budget_eur} onChange={(x) => set("budget_eur", x)} />
      </section>

      <section className="card flex flex-col gap-3" aria-labelledby="s-goal">
        <h2 id="s-goal" className="text-lg font-semibold">
          {t("weightGoal")}
        </h2>
        <NumberField id="weight" label={t("weight")} unit={t("kg")} value={v.weight_kg} onChange={(x) => set("weight_kg", x)} decimal />
        <div role="radiogroup" aria-label={t("goal")} className="flex flex-col gap-2">
          {GOAL_OPTIONS.map((o) => (
            <Choice
              key={o.value}
              checked={v.goal === o.value}
              onClick={() => set("goal", o.value)}
              label={opt(`goal.${o.value}.label`, o.label)}
              sub={opt(`goal.${o.value}.hint`, o.hint)}
            />
          ))}
        </div>
      </section>

      <section className="card flex flex-col gap-3" aria-labelledby="s-targets">
        <h2 id="s-targets" className="text-lg font-semibold">
          {t("targets")}
        </h2>
        {!v.manual ? (
          <>
            <p className="text-2xl font-bold tabular-nums">
              {computed ? (
                <>
                  {computed.kcal_min}–{computed.kcal_max} <span className="text-base font-normal">kcal</span> · ≥ {computed.protein_min}{" "}
                  <span className="text-base font-normal">{t("proteinUnit")}</span>
                </>
              ) : (
                <span className="text-base font-normal opacity-70">{t("fillBody")}</span>
              )}
            </p>
            <p className="text-sm opacity-70">{t("computedNote")}</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setV((s) => ({
                  ...s,
                  manual: true,
                  kcal_min: s.kcal_min || String(computed?.kcal_min ?? ""),
                  kcal_max: s.kcal_max || String(computed?.kcal_max ?? ""),
                  protein_min: s.protein_min || String(computed?.protein_min ?? ""),
                }))
              }
            >
              {t("setManually")}
            </button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <NumberField id="kmin" label={t("kcalFrom")} unit="" value={v.kcal_min} onChange={(x) => set("kcal_min", x)} />
              <NumberField id="kmax" label={t("kcalTo")} unit="" value={v.kcal_max} onChange={(x) => set("kcal_max", x)} />
            </div>
            <NumberField id="pmin" label={t("proteinMin")} unit={t("gPerDay")} value={v.protein_min} onChange={(x) => set("protein_min", x)} />
            <button type="button" className="btn-ghost" onClick={() => set("manual", false)}>
              {t("auto")}
              {computed
                ? t("autoValues", { kcalMin: String(computed.kcal_min), kcalMax: String(computed.kcal_max), protein: String(computed.protein_min) })
                : ""}
            </button>
          </>
        )}
      </section>

      <section className="card flex flex-col gap-3" aria-labelledby="s-food">
        <h2 id="s-food" className="text-lg font-semibold">
          {t("food")}
        </h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("diet")}>
          {DIET_OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={v.diet === o.value}
              className="chip disabled:opacity-50"
              disabled={!!o.soon && v.diet !== o.value}
              title={o.soon ? to("diet.soon") : undefined}
              onClick={() => set("diet", o.value)}
            >
              {opt(`diet.${dietKey(o.value)}`, o.label)}
              {o.soon ? t("soon") : ""}
            </button>
          ))}
        </div>
        <h3 className="font-medium">{t("dontEat")}</h3>
        <Chips options={chips("exclude", EXCLUDE_OPTIONS)} selected={v.exclude_tags} onToggle={(x) => set("exclude_tags", toggle(v.exclude_tags, x))} />
        <h3 className="font-medium">{t("allergies")}</h3>
        <Chips options={chips("allergen", ALLERGEN_OPTIONS)} selected={v.allergens} onToggle={(x) => set("allergens", toggle(v.allergens, x))} />
      </section>

      <details className="card flex flex-col gap-3">
        <summary className="cursor-pointer text-lg font-semibold">{t("more")}</summary>
        <div className="mt-3 flex flex-col gap-3">
          <div role="radiogroup" aria-label={t("sex")} className="grid grid-cols-2 gap-2">
            {SEX_OPTIONS.map((o) => (
              <Choice key={o.value} checked={v.sex === o.value} onClick={() => set("sex", o.value)} label={opt(`sex.${o.value}`, o.label)} />
            ))}
          </div>
          <NumberField id="age" label={t("age")} unit={t("years")} value={v.age} onChange={(x) => set("age", x)} />
          <NumberField id="height" label={t("height")} unit={t("cm")} value={v.height_cm} onChange={(x) => set("height_cm", x)} />
          <h3 className="font-medium">{t("activityQ")}</h3>
          <div role="radiogroup" aria-label={t("activity")} className="flex flex-col gap-2">
            {ACTIVITY_OPTIONS.map((o) => (
              <Choice
                key={o.value}
                checked={v.activity === o.value}
                onClick={() => set("activity", o.value)}
                label={opt(`activity.${o.value}.label`, o.label)}
                sub={opt(`activity.${o.value}.example`, o.example)}
              />
            ))}
          </div>
          <h3 className="font-medium">{t("pantry")}</h3>
          <p className="text-sm opacity-70">{t("pantryNote")}</p>
          <Chips options={chips("pantry", PANTRY_OPTIONS)} selected={v.pantry} onToggle={(x) => set("pantry", toggle(v.pantry, x))} />
        </div>
      </details>

      <footer className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-background/95 px-4 pt-3 pb-4 backdrop-blur" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {gen.error && (
          <p className="error" role="alert">
            {gen.error}
          </p>
        )}
        {gen.info && (
          <p className="rounded-xl border border-border px-4 py-3 text-sm" role="status">
            {gen.info}
          </p>
        )}
        <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
          {gen.busy ? tg("creating") : saving ? tc("saving") : tg("createThe")}
        </button>
        {gen.busy && (
          <p className="text-center text-sm opacity-70" aria-live="polite">
            {tg("upTo30", { step: gen.stepText })}
          </p>
        )}
      </footer>
    </div>
  );
}
