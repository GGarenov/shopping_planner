"use client";

// "Add to phone": Android/Chromium browsers fire `beforeinstallprompt` once per page load; keeping that event lets
// a button open the system install dialog with one tap. The event can fire before React hydrates, so an inline
// script in the root layout (lib/pwa/captureScript.ts) stores it on `window.__bip` first; this store reads it.
// iOS has no such API — Apple only allows "Share → Add to Home Screen", so there the button shows a short guide.
import { useSyncExternalStore } from "react";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __bip?: BeforeInstallPromptEvent | null;
    __bipInstalled?: boolean;
  }
}

export type Platform = "ios" | "android" | "other";

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

interface InstallState {
  ready: boolean; // false during server render / before hydration
  standalone: boolean;
  installed: boolean;
  canPrompt: boolean;
  platform: Platform;
}

const SERVER: InstallState = { ready: false, standalone: false, installed: false, canPrompt: false, platform: "other" };
let cache: InstallState | null = null;

function read(): InstallState {
  const next: InstallState = {
    ready: true,
    standalone: isStandalone(),
    installed: !!window.__bipInstalled,
    canPrompt: !!window.__bip,
    platform: detectPlatform(),
  };
  if (cache && (Object.keys(next) as (keyof InstallState)[]).every((k) => cache![k] === next[k])) return cache;
  return (cache = next);
}

function subscribe(cb: () => void) {
  window.addEventListener("bip-change", cb);
  return () => window.removeEventListener("bip-change", cb);
}

export function useInstall() {
  const state = useSyncExternalStore(subscribe, read, () => SERVER);
  /** Opens the system install dialog (Android/Chromium). Resolves true when the user accepted. */
  const prompt = async (): Promise<boolean> => {
    const e = window.__bip;
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    window.__bip = null; // one use per event
    if (outcome === "accepted") window.__bipInstalled = true;
    window.dispatchEvent(new Event("bip-change"));
    return outcome === "accepted";
  };
  return { ...state, prompt };
}
