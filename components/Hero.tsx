import type { ReactNode } from "react";
import { LanguageToggle } from "./LanguageToggle";
import { Logo } from "./Logo";

/** Turquoise header band of the main screens: logo + language switch, optional line above the title, title, extra content. */
export function Hero({ title, kicker, children }: { title: string; kicker?: ReactNode; children?: ReactNode }) {
  return (
    <header className="hero">
      <div className="flex items-center justify-between gap-3">
        <Logo size={30} tone="light" />
        <LanguageToggle tone="light" />
      </div>
      <div className="flex flex-col">
        {kicker && <span className="text-sm text-white/80">{kicker}</span>}
        <h1 className="text-2xl font-extrabold">{title}</h1>
      </div>
      {children}
    </header>
  );
}
