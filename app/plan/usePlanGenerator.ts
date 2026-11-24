"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/** Progress steps shown while the plan is being made: keys plan.generate.steps.<index>. */
export const PLAN_STEPS = ["0", "1", "2", "3"];

/** POST /api/plan with progress text and translated errors; on success goes to /plan. */
export function usePlanGenerator() {
  const router = useRouter();
  const t = useTranslations("plan.generate");
  const tc = useTranslations("common");
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
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string; reason?: string; varied?: boolean | null };
      if (!res.ok || !body.id) {
        setError(body.error ?? tc("somethingWrong"));
        setFixable(res.status === 422 && body.reason !== "timeout"); // a timeout is not about the settings
        return false;
      }
      if (body.varied === false) setInfo(t("notVaried"));
      router.push("/plan");
      router.refresh();
      return true;
    } catch {
      setError(tc("noConnection"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { generate, busy, error, setError, info, fixable, stepText: t(`steps.${PLAN_STEPS[step]!}`) };
}
