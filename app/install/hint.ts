// Per-device "install hint seen" flag. Browser storage is fine here: it's only a convenience.
const KEY = "install_hint_seen";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function shouldShowInstallHint(): boolean {
  if (typeof window === "undefined" || isStandalone()) return false;
  try {
    return localStorage.getItem(KEY) !== "1";
  } catch {
    return false;
  }
}

export function markInstallHintSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // storage blocked — the hint may show again, that's fine
  }
}

export type Platform = "ios" | "android" | "other";

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}
