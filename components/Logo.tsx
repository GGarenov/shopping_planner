// Brand mark «Лагуна»: a plate with fork and knife and a sunny check mark — "your plan is ready".
// The same drawing is rendered into the app icons by scripts/make_icons.mjs (keep them in sync).
import { useTranslations } from "next-intl";

export function LogoMark({ size = 40, rounded = true, className }: { size?: number; rounded?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx={rounded ? 16 : 0} fill="#0b8a91" />
      <circle cx="32" cy="34" r="17" fill="#ffffff" />
      <circle cx="32" cy="34" r="11" fill="none" stroke="#bfeceb" strokeWidth="2" />
      <path d="M25 34 l5 5 l10 -11" stroke="#f0a800" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 16 v12 M9 16 v6 q0 3 3 3 q3 0 3 -3 v-6" stroke="#ffffff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M52 16 v12 M52 16 q-4 2 -4 7 h4" stroke="#ffffff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark + "Пазарен план" wordmark. `tone="light"` for the turquoise header. */
export function Logo({ size = 40, tone = "dark", tagline = false }: { size?: number; tone?: "dark" | "light"; tagline?: boolean }) {
  const t = useTranslations("common");
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} className={`shrink-0 rounded-[25%] shadow-sm ${tone === "light" ? "ring-2 ring-white/70" : ""}`} />
      <span className="flex flex-col leading-none">
        <span className={`font-extrabold tracking-tight ${tone === "light" ? "text-white" : "text-foreground"}`} style={{ fontSize: size * 0.5 }}>
          {t("appName")}
        </span>
        {tagline && <span className={`mt-1 text-xs ${tone === "light" ? "text-white/80" : "opacity-70"}`}>{t("tagline")}</span>}
      </span>
    </span>
  );
}
