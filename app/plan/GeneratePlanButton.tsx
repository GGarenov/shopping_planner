"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePlanGenerator } from "./usePlanGenerator";

/** The first plan (empty state). New plans go through /plan/new, where the settings can be changed first. */
export function GeneratePlanButton({ label }: { label?: string }) {
  const t = useTranslations("plan.generate");
  const { generate, busy, error, info, fixable, stepText } = usePlanGenerator();
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="btn-primary" onClick={() => void generate()} disabled={busy}>
        {busy ? t("creating") : (label ?? t("create"))}
      </button>
      {busy && (
        <p className="text-center text-sm text-subtle" aria-live="polite">
          {t("upTo15", { step: stepText })}
        </p>
      )}
      {info && (
        <p className="rounded-xl border border-border px-4 py-3 text-sm" role="status">
          {info}
        </p>
      )}
      {error && (
        <div className="flex flex-col gap-2" role="alert">
          <p className="error">{error}</p>
          {fixable && (
            <Link href="/plan/new" className="btn-secondary">
              {t("fixSettings")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
