// Locale-aware formats used across the app (pure; works on server and client).
import type { Locale } from "./config";

/** Money: bg "9,40 €", en "€9.40". */
export function eur(n: number, locale: Locale | string = "bg"): string {
  return locale === "en" ? `€${n.toFixed(2)}` : `${n.toFixed(2).replace(".", ",")} €`;
}

/** Decimal number with up to `digits` decimals: bg "22,5", en "22.5". */
export function num(n: number, locale: Locale | string = "bg", digits = 1): string {
  const s = String(Math.round(n * 10 ** digits) / 10 ** digits);
  return locale === "en" ? s : s.replace(".", ",");
}

/** "2026-11-24" → bg "24.11.2026", en "24 Nov 2026". */
export function longDate(iso: string, locale: Locale | string = "bg"): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return locale === "en"
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d)
    : iso.slice(0, 10).split("-").reverse().join(".");
}

/** Week day `offset` from a YYYY-MM-DD week start: bg "24.11", en "24 Nov". */
export function shortDay(weekStart: string, offset: number, locale: Locale | string = "bg"): string {
  const d = new Date(`${weekStart}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return locale === "en"
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(d)
    : `${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** eBag pack labels are Bulgarian ("500 г", "~ 700 г / бр", "1 кг", "10 бр.", "1 л"); in English show the units in English. */
export function packUnits(label: string, locale: Locale | string = "bg"): string {
  if (locale !== "en") return label;
  return label
    // (?![а-я]) instead of \b: JavaScript's \b doesn't treat Cyrillic letters as word characters
    .replace(/(\d)\s*кг(?![а-я])/g, "$1 kg")
    .replace(/(\d)\s*мл(?![а-я])/g, "$1 ml")
    .replace(/(\d)\s*г(?![а-я])/g, "$1 g")
    .replace(/(\d)\s*л(?![а-я])/g, "$1 l")
    .replace(/\/\s*бр\.?/g, "/ pc")
    .replace(/(\d)\s*бр\.?/g, (_m, d: string) => `${d} ${d === "1" ? "pc" : "pcs"}`);
}
