"use client";

import { useActionState, useState } from "react";
import type { Targets } from "@/lib/planner/targets";
import { resetTargetsOverride, saveTargetsOverride, type OverrideState } from "./actions";

export function TargetsEditor({ targets, computed }: { targets: Targets; computed: Targets }) {
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
          Промени целите ръчно
        </button>
        {targets.source === "manual" && (
          <form action={resetTargetsOverride}>
            <button type="submit" className="btn-ghost w-full">
              Върни изчислените ({computed.kcal_min}–{computed.kcal_max} kcal, {computed.protein_min} г протеин)
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="card flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field name="kcal_min" label="kcal от" defaultValue={state.values?.kcal_min ?? targets.kcal_min} />
        <Field name="kcal_max" label="kcal до" defaultValue={state.values?.kcal_max ?? targets.kcal_max} />
      </div>
      <Field name="protein_min" label="Протеин минимум (г)" defaultValue={state.values?.protein_min ?? targets.protein_min} />
      {state.error && <p className="error">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Запазваме…" : "Запази"}
      </button>
      <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
        Отказ
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
