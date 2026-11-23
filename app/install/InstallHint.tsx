"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { InstallButton } from "@/components/InstallButton";
import { LogoMark } from "@/components/Logo";
import { useInstall } from "@/lib/pwa/install";
import { markInstallHintSeen } from "./hint";

/** Shown once in the browser before onboarding: one big «Добави в телефона» button, or continue in the browser. */
export function InstallHint({ next }: { next: string }) {
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
        <h1 className="text-2xl font-extrabold">Сложи „Пазарен план“ на телефона</h1>
        <p className="opacity-80">Отваря се с едно докосване от началния екран, на цял екран — като истинско приложение.</p>
      </header>
      <InstallButton />
      <footer className="mt-auto flex flex-col gap-2">
        <button type="button" className="btn-ghost w-full" onClick={proceed}>
          Не сега — продължи в браузъра
        </button>
      </footer>
    </div>
  );
}
