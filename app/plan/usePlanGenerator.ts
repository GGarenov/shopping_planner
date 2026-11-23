"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const PLAN_STEPS = ["Избираме рецепти за всеки ден…", "Проверяваме калориите и протеина…", "Търсим най-изгодните продукти в eBag…", "Смятаме цели опаковки…"];

/** POST /api/plan with progress text and Bulgarian errors; on success goes to /plan. */
export function usePlanGenerator() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fixable, setFixable] = useState(false); // the error is about the user's settings (budget, diet, exclusions)
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, PLAN_STEPS.length - 1)), 3000);
    return () => clearInterval(t);
  }, [busy]);

  /** Returns true when a plan was created. */
  const generate = async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setInfo(null);
    setFixable(false);
    try {
      const res = await fetch("/api/plan", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string; varied?: boolean | null };
      if (!res.ok || !body.id) {
        setError(body.error ?? "Нещо се обърка. Опитай отново.");
        setFixable(res.status === 422);
        return false;
      }
      if (body.varied === false) setInfo("Не намерихме различна седмица в рамките на бюджета — това е най-изгодният вариант.");
      router.push("/plan");
      router.refresh();
      return true;
    } catch {
      setError("Няма връзка. Провери интернета и опитай отново.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { generate, busy, error, setError, info, fixable, stepText: PLAN_STEPS[step]! };
}
