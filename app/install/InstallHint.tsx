"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { detectPlatform, isStandalone, markInstallHintSeen, type Platform } from "./hint";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallHint({ next }: { next: string }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      router.replace(next);
      return;
    }
    setPlatform(detectPlatform());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [next, router]);

  const proceed = () => {
    markInstallHintSeen();
    router.replace(next);
  };

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setPromptEvent(null);
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Сложи приложението на началния екран</h1>
        <p className="opacity-80">Така се отваря с едно докосване, на цял екран — като истинско приложение.</p>
      </header>

      {installed ? (
        <div className="card">Готово! Отвори „Пазарен план“ от началния екран.</div>
      ) : platform === "ios" ? (
        <ol className="card flex list-decimal flex-col gap-3 pl-8">
          <li>
            Отвори тази страница в <strong>Safari</strong>.
          </li>
          <li>
            Натисни бутона <strong>Сподели</strong> <ShareIcon /> долу на екрана.
          </li>
          <li>
            Избери <strong>„Добави към началния екран“</strong> и после <strong>„Добави“</strong>.
          </li>
          <li>
            Отвори приложението от началния екран и влез отново — с <strong>кода</strong> от имейла.
          </li>
        </ol>
      ) : platform === "android" ? (
        promptEvent ? (
          <button type="button" className="btn-primary" onClick={install}>
            Инсталирай
          </button>
        ) : (
          <ol className="card flex list-decimal flex-col gap-3 pl-8">
            <li>
              Отвори тази страница в <strong>Chrome</strong>.
            </li>
            <li>
              Натисни менюто <strong>⋮</strong> горе вдясно.
            </li>
            <li>
              Избери <strong>„Инсталиране на приложението“</strong> или <strong>„Добавяне към началния екран“</strong>.
            </li>
          </ol>
        )
      ) : platform === "other" ? (
        <div className="card flex flex-col gap-3">
          <p>Приложението е направено за телефон. Отвори линка на телефона си, за да го инсталираш.</p>
          {promptEvent && (
            <button type="button" className="btn-secondary" onClick={install}>
              Инсталирай на този компютър
            </button>
          )}
        </div>
      ) : null}

      <footer className="mt-auto flex flex-col gap-2">
        <button type="button" className="btn-primary" onClick={proceed}>
          Продължи в браузъра
        </button>
      </footer>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg aria-label="Сподели" viewBox="0 0 24 24" className="inline size-5 align-text-bottom" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
