"use client";

import Link from "next/link";
import { usePlanGenerator } from "./usePlanGenerator";

/** The first plan (empty state). New plans go through /plan/new, where the settings can be changed first. */
export function GeneratePlanButton({ label = "Създай план" }: { label?: string }) {
  const { generate, busy, error, info, fixable, stepText } = usePlanGenerator();
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="btn-primary" onClick={() => void generate()} disabled={busy}>
        {busy ? "Съставяме плана…" : label}
      </button>
      {busy && (
        <p className="text-center text-sm opacity-70" aria-live="polite">
          {stepText} (до ~15 сек)
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
              Промени бюджета или ограниченията
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
