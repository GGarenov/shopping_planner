"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { deleteAccount } from "../actions";

export function DeleteForm() {
  const [state, action, pending] = useActionState(deleteAccount, null);
  const t = useTranslations("profile.delete");
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex items-start gap-3">
        <input type="checkbox" name="confirm" value="yes" required className="mt-1 size-5 shrink-0" />
        <span>{t("confirm")}</span>
      </label>
      <button type="submit" className="btn-primary bg-danger text-white" disabled={pending}>
        {pending ? t("deleting") : t("submit")}
      </button>
      {state?.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
