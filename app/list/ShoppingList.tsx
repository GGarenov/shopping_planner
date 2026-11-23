"use client";

import { useState, useTransition } from "react";
import { eur, packLabel, type AisleGroup } from "@/lib/plans/shopping";
import { setChecked } from "./actions";

export function ShoppingList({
  planId,
  groups,
  totals,
  initialChecked,
}: {
  planId: string;
  groups: AisleGroup[];
  totals: { checkout: number; eaten: number };
  initialChecked: number[];
}) {
  const [checked, setCheckedState] = useState(() => new Set(initialChecked));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const all = groups.flatMap((g) => g.items);
  const ids = [...new Set(all.map((it) => it.ebag_id))];
  const done = ids.filter((id) => checked.has(id)).length;

  const save = (changed: number[], value: boolean) => {
    const apply = (v: boolean) =>
      setCheckedState((prev) => {
        const next = new Set(prev);
        for (const id of changed) {
          if (v) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    apply(value); // optimistic
    setError(null);
    startTransition(async () => {
      const res = await setChecked(planId, changed, value).catch(() => ({ ok: false }));
      if (!res.ok) {
        apply(!value);
        setError("Отметката не се запази. Провери връзката и опитай пак.");
      }
    });
  };

  return (
    <>
      <section className="grid grid-cols-2 gap-3">
        <div className="flex flex-col rounded-2xl bg-sun p-4 text-sun-fg">
          <span className="text-sm">Плащаш в eBag</span>
          <span className="text-xl font-bold tabular-nums">{eur(totals.checkout)}</span>
          <span className="text-xs opacity-60">{ids.length} продукта</span>
        </div>
        <div className="card flex flex-col">
          <span className="text-sm opacity-70">Изяждаш тази седмица</span>
          <span className="text-xl font-bold tabular-nums">{eur(totals.eaten)}</span>
          <span className="text-xs opacity-60">остатъкът остава за после</span>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm" aria-live="polite">
          Взети: <span className="font-semibold tabular-nums">{done}</span> от {ids.length}
        </p>
        {done > 0 && (
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => save(ids.filter((id) => checked.has(id)), false)}
          >
            Махни отметките
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2" aria-labelledby={`aisle-${g.key}`}>
          <h2 id={`aisle-${g.key}`} className="flex items-baseline justify-between text-lg font-semibold">
            <span>{g.label}</span>
            <span className="text-sm font-normal tabular-nums opacity-70">{eur(g.cost)}</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {g.items.map((it) => {
              const on = checked.has(it.ebag_id);
              const inputId = `item-${it.ebag_id}`;
              return (
                <li key={`${it.ingredient_id}-${it.ebag_id}`} className={`card flex items-start gap-3 ${on ? "opacity-60" : ""}`}>
                  <input
                    id={inputId}
                    type="checkbox"
                    className="mt-1 size-6 shrink-0 accent-accent"
                    checked={on}
                    onChange={(e) => save([it.ebag_id], e.target.checked)}
                  />
                  <label htmlFor={inputId} className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={`font-medium break-words ${on ? "line-through" : ""}`}>{it.product}</span>
                    <span className="text-sm opacity-70">
                      {packLabel(it)} · {it.ingredient}
                    </span>
                    <span className="text-xs opacity-60">
                      за рецептите: {it.used_edible_g} г от {it.usable_g} г
                    </span>
                  </label>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{eur(it.cost)}</span>
                    {it.promo && <span className="badge-promo">Промо</span>}
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline opacity-70"
                      aria-label={`${it.product} в eBag (нов прозорец)`}
                    >
                      eBag ↗
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
