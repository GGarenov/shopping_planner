"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { SocialProvider } from "@/lib/auth/guest";
import { createClient } from "@/lib/supabase/client";

/**
 * "Continue with Google" (docs/notes/loginless.md). Both modes return through /auth/callback:
 *  - link:   a guest's own user gets the provider, so the account becomes permanent and the plan stays
 *            (an account that already exists is signed in to instead, with the guest's data — see the callback);
 *  - signIn: no session yet — a plain sign-in (or sign-up) with the provider.
 */
export function SocialButtons({ mode, next, failed = false }: { mode: "link" | "signIn"; next: string; failed?: boolean }) {
  const t = useTranslations("account");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const start = async (provider: SocialProvider) => {
    setBusy(true);
    setError(false);
    const options = { redirectTo: `${window.location.origin}/auth/callback?${new URLSearchParams({ next, provider })}` };
    const auth = createClient().auth;
    // Navigates away to the provider on success; only an error comes back here.
    const { error } = mode === "link" ? await auth.linkIdentity({ provider, options }) : await auth.signInWithOAuth({ provider, options });
    if (error) {
      // Before any redirect: e.g. "Manual linking is disabled" (Supabase setting) for a guest.
      console.error("social sign-in failed to start", error.message);
      setBusy(false);
      setError(true);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void start("google")}
        disabled={busy}
        className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border-2 border-border bg-white px-4 text-lg font-bold text-[#1f1f1f] active:opacity-80 disabled:opacity-50"
      >
        <GoogleIcon />
        {busy ? t("redirecting") : t("google")}
      </button>
      {(error || failed) && (
        <p className="error" role="alert">
          {t("failed")}
        </p>
      )}
    </div>
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
