"use client";

import { useActionState } from "react";
import { deleteAccount } from "../actions";

export function DeleteForm() {
  const [state, action, pending] = useActionState(deleteAccount, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex items-start gap-3">
        <input type="checkbox" name="confirm" value="yes" required className="mt-1 size-5 shrink-0" />
        <span>Разбирам, че профилът и данните ми ще бъдат изтрити завинаги.</span>
      </label>
      <button type="submit" className="btn-primary bg-red-600" disabled={pending}>
        {pending ? "Изтриваме…" : "Изтрий профила ми"}
      </button>
      {state?.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
