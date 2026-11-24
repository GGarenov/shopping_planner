// Brand «Pazarko»: a yellow paper shopping bag with "Pazarko" written on it and a small coral smile, on turquoise.
// The app icons (public/icons) are rendered from the same drawing: scripts/make_icons.mjs (keep them in sync).
import { useTranslations } from "next-intl";

export const BRAND = "Pazarko";

/** The bag mark. `rounded` = rounded square tile (in-app); the phone icons use a full square. */
export function LogoMark({ size = 40, rounded = true, className }: { size?: number; rounded?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx={rounded ? 14 : 0} fill="#0b8a91" />
      <path d="M23 20 Q23 10 32 10 Q41 10 41 20" fill="none" stroke="#ffd166" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M12 21 H52 L49.5 55 Q49.2 58 46 58 H18 Q14.8 58 14.5 55 Z" fill="#ffd166" />
      <path d="M12 21 H52 L51.7 25 H12.3 Z" fill="#f0a800" />
      <circle cx="23" cy="23" r="1.6" fill="#0c3b40" />
      <circle cx="41" cy="23" r="1.6" fill="#0c3b40" />
      <text
        x="32"
        y="44"
        textAnchor="middle"
        fontWeight="900"
        fontSize="8.6"
        fill="#0b7d86"
        letterSpacing="-.2"
        style={{ fontFamily: "var(--font-nunito), ui-rounded, system-ui, sans-serif" }}
      >
        {BRAND}
      </text>
      <path d="M24 49 Q32 53 40 49" fill="none" stroke="#ff7a6b" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Mark + "Pazarko" wordmark ("Pazar" turquoise + "ko" sunny; all white on the turquoise header). */
export function Logo({ size = 40, tone = "dark", tagline = false }: { size?: number; tone?: "dark" | "light"; tagline?: boolean }) {
  const t = useTranslations("common");
  const light = tone === "light";
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} className={`shrink-0 rounded-[22%] shadow-sm ${light ? "ring-2 ring-white/70" : ""}`} />
      <span className="flex flex-col leading-none">
        {/* The wordmark is a logo (WCAG 1.4.3 exempts logotypes from contrast): one image named «Pazarko». */}
        <span role="img" aria-label={BRAND} data-logo className="font-black tracking-tight" style={{ fontSize: size * 0.56 }}>
          <span aria-hidden className={light ? "text-white" : "text-accent"}>
            Pazar
          </span>
          <span aria-hidden className={light ? "text-sun" : "text-[#f0a800]"}>
            ko
          </span>
        </span>
        {tagline && <span className={`mt-1 text-xs ${light ? "text-white/80" : "text-subtle"}`}>{t("tagline")}</span>}
      </span>
    </span>
  );
}
