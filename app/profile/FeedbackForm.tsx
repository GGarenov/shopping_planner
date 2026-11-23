"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendFeedback } from "./actions";

export function FeedbackForm() {
  const [state, action, pending] = useActionState(sendFeedback, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <label htmlFor="feedback" className="text-sm opacity-80">
        Какво не работи, какво ти липсва, какво ти хареса? Пиши свободно — четем всичко.
      </label>
      <textarea id="feedback" name="message" rows={4} maxLength={4000} required className="input min-h-28 py-3" placeholder="Напр. „Рецептата за … е много сложна“" />
      <input type="hidden" name="page" value="/profile" />
      <button type="submit" className="btn-secondary" disabled={pending}>
        {pending ? "Изпращаме…" : "Изпрати"}
      </button>
      {state?.ok && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">
          Благодарим! Получихме съобщението ти.
        </p>
      )}
      {state?.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
