"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useInstall } from "@/lib/pwa/install";

/**
 * «Добави в телефона». Android/Chromium: opens the system install dialog directly. iPhone (and browsers without the
 * install API): opens a short 2-step guide, because Apple does not let websites install themselves.
 * Renders nothing inside the installed app.
 */
export function InstallButton({
  variant = "primary",
  className = "",
}: {
  variant?: "primary" | "secondary" | "banner";
  className?: string;
}) {
  const t = useTranslations("install");
  const { ready, standalone, installed, canPrompt, platform, prompt } = useInstall();
  const [guide, setGuide] = useState(false);
  if (!ready || standalone) return null;

  if (installed)
    return (
      <p className={`rounded-2xl bg-accent-soft px-4 py-3 text-sm font-semibold ${className}`} role="status">
        {t("installed")}
      </p>
    );

  const onClick = async () => {
    if (canPrompt) await prompt();
    else setGuide(true);
  };

  const button =
    variant === "banner" ? (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-2xl border-2 border-accent bg-muted p-3 text-left ${className}`}
      >
        <PhoneIcon className="size-9 shrink-0 text-accent" />
        <span className="flex flex-1 flex-col">
          <span className="font-extrabold">{t("addToPhone")}</span>
          <span className="text-sm text-subtle">{t("bannerSub")}</span>
        </span>
        <span aria-hidden className="text-xl text-accent">
          ›
        </span>
      </button>
    ) : (
      <button type="button" onClick={onClick} className={`${variant === "primary" ? "btn-primary" : "btn-secondary"} gap-2 ${className}`}>
        <PhoneIcon className="size-6" />
        {t("addToPhone")}
      </button>
    );

  return (
    <>
      {button}
      {guide && <InstallGuide platform={platform} onClose={() => setGuide(false)} />}
    </>
  );
}

function InstallGuide({ platform, onClose }: { platform: string; onClose: () => void }) {
  const t = useTranslations("install");
  const ios = platform === "ios";
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-guide-title"
      onClick={onClose}
    >
      <div
        className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-t-3xl bg-background px-5 pt-5"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="install-guide-title" className="text-xl font-extrabold">
          {ios ? t("iosTitle") : t("addToPhone")}
        </h2>
        {ios ? (
          <>
            <ol className="flex flex-col gap-3">
              <li className="card flex items-center gap-3">
                <Step n={1} />
                <span>{t.rich("iosStep1", { strong, share: () => <ShareIcon label={t("share")} /> })}</span>
              </li>
              <li className="card flex items-center gap-3">
                <Step n={2} />
                <span>{t.rich("iosStep2", { strong })}</span>
              </li>
            </ol>
            <p className="text-sm text-subtle">{t("iosNote")}</p>
            <span aria-hidden className="animate-bounce self-center text-3xl text-accent">
              ↓
            </span>
          </>
        ) : (
          <ol className="flex flex-col gap-3">
            <li className="card flex items-center gap-3">
              <Step n={1} />
              <span>{t.rich("androidStep1", { strong })}</span>
            </li>
            <li className="card flex items-center gap-3">
              <Step n={2} />
              <span>{t.rich("androidStep2", { strong })}</span>
            </li>
          </ol>
        )}
        <button type="button" className="btn-secondary" onClick={onClose}>
          {t("gotIt")}
        </button>
      </div>
    </div>
  );
}

const strong = (c: React.ReactNode) => <strong>{c}</strong>;

function Step({ n }: { n: number }) {
  return <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-extrabold text-accent-fg">{n}</span>;
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M12 8v6M9 11l3 3 3-3" />
    </svg>
  );
}

function ShareIcon({ label }: { label: string }) {
  return (
    <svg
      aria-label={label}
      viewBox="0 0 24 24"
      className="inline size-5 align-text-bottom text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
