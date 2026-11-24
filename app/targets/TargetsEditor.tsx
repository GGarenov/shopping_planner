"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { Targets } from "@/lib/planner/targets";
import { resetTargetsOverride, saveTargetsOverride, type OverrideState } from "./actions";

export function TargetsEditor({ targets, computed }: { targets: Targets; computed: Targets }) {
  const t = useTranslations("targets");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: OverrideState, fd: FormData) => {
    const res = await saveTargetsOverride(prev, fd);
    if (res.saved) setOpen(false);
    return res;
  }, {});

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
          {t("editManually")}
        </button>
        {targets.source === "manual" && (
          <form action={resetTargetsOverride}>
            <button type="submit" className="btn-ghost w-full">
              {t("resetComputed", {
                kcalMin: String(computed.kcal_min),
                kcalMax: String(computed.kcal_max),
                protein: String(computed.protein_min),
              })}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="card flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field name="kcal_min" label={t("kcalFrom")} defaultValue={state.values?.kcal_min ?? targets.kcal_min} />
        <Field name="kcal_max" label={t("kcalTo")} defaultValue={state.values?.kcal_max ?? targets.kcal_max} />
      </div>
      <Field name="protein_min" label={t("proteinMin")} defaultValue={state.values?.protein_min ?? targets.protein_min} />
      {state.error && <p className="error">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? tc("saving") : tc("save")}
      </button>
      <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
        {tc("cancel")}
      </button>
    </form>
  );
}

function Field({ name, label, defaultValue }: { name: string; label: string; defaultValue: number | string }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input name={name} inputMode="numeric" defaultValue={defaultValue} className="input" required />
    </label>
  );
}
