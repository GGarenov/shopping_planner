"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { signIn, signUp, type AuthState } from "./actions";

type Mode = "signin" | "signup";

export function LoginForm() {
  const t = useTranslations("login");
  const [mode, setMode] = useState<Mode>("signin");
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        <Tab active={mode === "signin"} onClick={() => setMode("signin")}>
          {t("tabSignIn")}
        </Tab>
        <Tab active={mode === "signup"} onClick={() => setMode("signup")}>
          {t("tabSignUp")}
        </Tab>
      </div>
      {/* key: fresh form state when switching tabs */}
      <CredentialsForm key={mode} mode={mode} />
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-11 rounded-lg text-base font-medium ${active ? "bg-background shadow-sm" : "text-subtle"}`}
    >
      {children}
    </button>
  );
}

function CredentialsForm({ mode }: { mode: Mode }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "signin" ? signIn : signUp, {});
  const t = useTranslations("login");
  const [show, setShow] = useState(false);
  const signup = mode === "signup";

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        {t("email")}
      </label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete={signup ? "email" : "username"}
        autoCapitalize="none"
        required
        defaultValue={state.email}
        placeholder={t("emailPlaceholder")}
        className="input"
      />
      <label htmlFor="password" className="text-sm font-medium">
        {t("password")}
      </label>
      <input
        id="password"
        name="password"
        type={show ? "text" : "password"}
        autoComplete={signup ? "new-password" : "current-password"}
        required
        minLength={signup ? 8 : undefined}
        className="input"
      />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={show} onChange={(e) => setShow(e.target.checked)} />
        {t("showPassword")}
      </label>
      {signup && <p className="text-sm text-subtle">{t("passwordHint")}</p>}
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? t("pending") : signup ? t("createAccount") : t("signIn")}
      </button>
    </form>
  );
}
