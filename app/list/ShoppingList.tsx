"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ingredientName } from "@/lib/i18n/content";
import { packUnits } from "@/lib/i18n/format";
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
  const t = useTranslations("list");
  const locale = useLocale();
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
        setError(t("saveFailed"));
      }
    });
  };

  return (
    <>
      <section className="grid grid-cols-2 gap-3">
        <div className="flex flex-col rounded-2xl bg-sun p-4 text-sun-fg">
          <span className="text-sm">{t("youPay")}</span>
          <span className="text-xl font-bold tabular-nums">{eur(totals.checkout, locale)}</span>
          <span className="text-xs opacity-60">{t("products", { n: ids.length })}</span>
        </div>
        <div className="card flex flex-col">
          <span className="text-sm opacity-70">{t("youEat")}</span>
          <span className="text-xl font-bold tabular-nums">{eur(totals.eaten, locale)}</span>
          <span className="text-xs opacity-60">{t("leftover")}</span>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm" aria-live="polite">
          {t.rich("taken", { done, total: ids.length, b: (chunks) => <span className="font-semibold tabular-nums">{chunks}</span> })}
        </p>
        {done > 0 && (
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => save(ids.filter((id) => checked.has(id)), false)}
          >
            {t("uncheckAll")}
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
            <span>{g.known ? t(`aisle.${g.key}`) : g.key}</span>
            <span className="text-sm font-normal tabular-nums opacity-70">{eur(g.cost, locale)}</span>
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
                      {packUnits(packLabel(it), locale)} · {ingredientName(it.ingredient_id, it.ingredient, locale)}
                    </span>
                    <span className="text-xs opacity-60">
                      {t("forRecipes", { used: String(it.used_edible_g), usable: String(it.usable_g) })}
                    </span>
                  </label>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{eur(it.cost, locale)}</span>
                    {it.promo && <span className="badge-promo">{t("promo")}</span>}
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline opacity-70"
                      aria-label={t("ebagLink", { product: it.product })}
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
