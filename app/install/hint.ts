// Per-device "install hint seen" flag. Browser storage is fine here: it's only a convenience.
import { isStandalone } from "@/lib/pwa/install";

const KEY = "install_hint_seen";

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
