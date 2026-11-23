"use client";

import { useActionState, useState } from "react";
import { sendLoginEmail, verifyLoginCode, type LoginState } from "./actions";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, setState] = useState<LoginState>({ step: "email", error: initialError });

  if (state.step === "email") return <EmailStep state={state} onSent={setState} />;
  return <CodeStep state={state} onBack={() => setState({ step: "email", email: state.email })} />;
}

function EmailStep({ state, onSent }: { state: Extract<LoginState, { step: "email" }>; onSent: (s: LoginState) => void }) {
  const [result, action, pending] = useActionState(async (prev: LoginState, fd: FormData) => {
    const next = await sendLoginEmail(prev, fd);
    if (next.step === "code") onSent(next);
    return next;
  }, state);

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        Имейл
      </label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        defaultValue={result.email}
        placeholder="ime@primer.bg"
        className="input"
      />
      {result.error && <p className="error">{result.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Изпращаме…" : "Изпрати ми линк за вход"}
      </button>
    </form>
  );
}

function CodeStep({ state, onBack }: { state: Extract<LoginState, { step: "code" }>; onBack: () => void }) {
  const [result, action, pending] = useActionState(verifyLoginCode, state);

  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm">
        {state.info} Отвори линка в имейла <strong>или</strong> въведи кода от него тук.
      </p>
      <label htmlFor="code" className="text-sm font-medium">
        Код от имейла
      </label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={12}
        required
        placeholder="12345678"
        className="input text-center text-2xl tracking-[0.3em]"
      />
      <input type="hidden" name="email" value={state.email} />
      {result.error && <p className="error">{result.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Проверяваме…" : "Влез"}
      </button>
      <button type="button" onClick={onBack} className="btn-ghost">
        Друг имейл / нов код
      </button>
    </form>
  );
}
