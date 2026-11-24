"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { sendFeedback } from "./actions";

export function FeedbackForm() {
  const [state, action, pending] = useActionState(sendFeedback, null);
  const form = useRef<HTMLFormElement>(null);
  const t = useTranslations("profile.feedback");
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <label htmlFor="feedback" className="text-sm text-subtle">
        {t("label")}
      </label>
      <textarea
        id="feedback"
        name="message"
        rows={4}
        maxLength={4000}
        required
        className="input min-h-28 py-3"
        placeholder={t("placeholder")}
      />
      <input type="hidden" name="page" value="/profile" />
      <button type="submit" className="btn-secondary" disabled={pending}>
        {pending ? t("sending") : t("send")}
      </button>
      {state?.ok && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">
          {t("thanks")}
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
