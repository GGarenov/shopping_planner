"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = ["Избираме рецепти за всеки ден…", "Проверяваме калориите и протеина…", "Търсим най-изгодните продукти в eBag…", "Смятаме цели опаковки…"];

export function GeneratePlanButton({ label = "Създай план", variant = "primary" }: { label?: string; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3000);
    return () => clearInterval(t);
  }, [busy]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        setError(body.error ?? "Нещо се обърка. Опитай отново.");
        return;
      }
      router.push("/plan");
      router.refresh();
    } catch {
      setError("Няма връзка. Провери интернета и опитай отново.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button type="button" className={variant === "primary" ? "btn-primary" : "btn-secondary"} onClick={generate} disabled={busy}>
        {busy ? "Съставяме плана…" : label}
      </button>
      {busy && (
        <p className="text-center text-sm opacity-70" aria-live="polite">
          {STEPS[step]} (до ~15 сек)
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
