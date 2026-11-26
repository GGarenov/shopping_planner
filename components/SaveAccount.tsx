"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SOCIAL_PROVIDERS, type AccountStatus, type SocialProvider } from "@/lib/auth/guest";
import { createClient } from "@/lib/supabase/client";

/**
 * "Save your plan — continue with Google" for guests (taylor_the_app/loginless.md, part 3). Links the provider to
 * the guest's own user, so everything stays; /auth/callback handles the return. Also shows the result once
 * (?account=saved|failed) — to everyone, since after saving the user is no longer a guest.
 */
export function SaveAccount({
  guest,
  next,
  variant,
  status,
}: {
  guest: boolean;
  /** Where to come back to after signing in. */
  next: string;
  variant: "plan" | "ebag";
  status: AccountStatus | null;
}) {
  const t = useTranslations("account");
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [failed, setFailed] = useState(false);

  const start = async (provider: SocialProvider) => {
    setBusy(provider);
    setFailed(false);
    const redirectTo = `${window.location.origin}/auth/callback?${new URLSearchParams({ next, provider })}`;
    // Navigates away to Google on success; only an error comes back here.
    const { error } = await createClient().auth.linkIdentity({ provider, options: { redirectTo } });
    if (error) {
      setBusy(null);
      setFailed(true);
    }
  };

  return (
    <>
      {status === "saved" && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">
          {t("saved")}
        </p>
      )}
      {guest && (
        <section className="card flex flex-col gap-3" aria-labelledby="save-account-title">
          <h2 id="save-account-title" className="text-lg font-semibold">
            {t(`${variant}.title`)}
          </h2>
          <p className="text-sm text-subtle">{t(`${variant}.text`)}</p>
          {SOCIAL_PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => void start(p)}
              disabled={!!busy}
              className={
                p === "google"
                  ? "inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border-2 border-border bg-white px-4 text-lg font-bold text-[#1f1f1f] active:opacity-80 disabled:opacity-50"
                  : "inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl bg-[#1877f2] px-4 text-lg font-bold text-white active:opacity-80 disabled:opacity-50"
              }
            >
              {p === "google" ? <GoogleIcon /> : <FacebookIcon />}
              {busy === p ? t("redirecting") : t(p)}
            </button>
          ))}
          {(failed || status === "failed") && (
            <p className="error" role="alert">
              {t("failed")}
            </p>
          )}
        </section>
      )}
    </>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-6 shrink-0" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden fill="currentColor">
      <path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z" />
    </svg>
  );
}
