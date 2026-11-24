"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const ITEMS: { href: string; label: string; icon: string; also?: string[] }[] = [
  { href: "/plan", label: "plan", icon: "M4 5h16M4 12h16M4 19h10" },
  { href: "/list", label: "list", icon: "M3 4h2l2.4 11h11.2L21 7H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" },
  { href: "/ebag", label: "ebag", icon: "M6 8h12l-1 12H7L6 8Zm3 0V6a3 3 0 0 1 6 0v2" },
  { href: "/profile", label: "profile", also: ["/targets"], icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" },
];

/** Fixed bottom tab bar for the main screens. Pages using it need bottom padding (pb-24). */
export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-white/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map((it) => {
          const active = [it.href, ...(it.also ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${active ? "font-extrabold text-accent" : "opacity-60"}`}
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d={it.icon} />
                </svg>
                {t(it.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
