"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { InstallButton } from "@/components/InstallButton";
import { LogoMark } from "@/components/Logo";
import { useInstall } from "@/lib/pwa/install";
import { markInstallHintSeen } from "./hint";

/** Shown once in the browser before onboarding: one big «Добави в телефона» button, or continue in the browser. */
export function InstallHint({ next }: { next: string }) {
  const t = useTranslations("install");
  const router = useRouter();
  const { standalone } = useInstall();

  useEffect(() => {
    if (standalone) router.replace(next);
  }, [standalone, next, router]);

  const proceed = () => {
    markInstallHintSeen();
    router.replace(next);
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-col items-center gap-4 pt-6 text-center">
        <LogoMark size={88} className="rounded-[22%] shadow-md" />
        <h1 className="text-2xl font-extrabold">{t("heading")}</h1>
        <p className="opacity-80">{t("intro")}</p>
      </header>
      <InstallButton />
      <footer className="mt-auto flex flex-col gap-2">
        <button type="button" className="btn-ghost w-full" onClick={proceed}>
          {t("notNow")}
        </button>
      </footer>
    </div>
  );
}
