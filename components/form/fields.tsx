"use client";

// Form controls shared by the onboarding wizard and the "new plan" settings screen.

export function Choice({
  checked,
  onClick,
  label,
  sub,
  disabled,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
  sub?: string;
  disabled?: boolean;
}) {
  return (
    <button type="button" role="radio" aria-checked={checked} className="choice disabled:opacity-50" onClick={onClick} disabled={disabled}>
      <span aria-hidden className={`size-5 shrink-0 rounded-full border-2 ${checked ? "border-accent bg-accent" : "border-border"}`} />
      <span className="flex flex-col">
        <span className="text-lg font-medium">{label}</span>
        {sub && <span className="text-sm opacity-70">{sub}</span>}
      </span>
    </button>
  );
}

export function Chips({ options, selected, onToggle }: { options: { value: string; label: string }[]; selected: string[]; onToggle: (v: string) => void }) {
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

export function NumberField({
  label,
  unit,
  value,
  onChange,
  decimal,
  id,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  decimal?: boolean;
  id?: string;
}) {
  const inputId = id ?? `f-${label}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input id={inputId} className="input" inputMode={decimal ? "decimal" : "numeric"} value={value} onChange={(e) => onChange(e.target.value.replace(",", "."))} />
        <span className="w-28 shrink-0 text-sm opacity-70">{unit}</span>
      </div>
    </div>
  );
}

export const BUDGET_PRESETS = [50, 100, 150];

/** Weekly budget: quick presets plus any amount typed in ("Друга сума"). */
export function BudgetField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPreset = BUDGET_PRESETS.some((b) => String(b) === value);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Бюджет за седмицата">
        {BUDGET_PRESETS.map((b) => (
          <button key={b} type="button" role="radio" aria-checked={value === String(b)} className="choice justify-center py-3 text-lg font-semibold" onClick={() => onChange(String(b))}>
            {b} €
          </button>
        ))}
      </div>
      <label htmlFor="budget-other" className="text-sm font-medium">
        Друга сума
      </label>
      <div className="flex items-center gap-3">
        <input
          id="budget-other"
          className={`input text-lg ${isPreset ? "" : "border-accent"}`}
          inputMode="decimal"
          placeholder="напр. 80"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
        />
        <span className="w-28 shrink-0 text-sm opacity-70">€ / седмица</span>
      </div>
      <p className="text-xs opacity-70">От 20 до 2000 €. За един човек обикновено стигат 70–100 €.</p>
    </div>
  );
}
