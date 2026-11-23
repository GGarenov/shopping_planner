import type { ReactNode } from "react";
import { Logo } from "./Logo";

/** Turquoise header band of the main screens: small logo, optional line above the title, title, extra content. */
export function Hero({ title, kicker, children }: { title: string; kicker?: ReactNode; children?: ReactNode }) {
  return (
    <header className="hero">
      <div className="flex items-center justify-between gap-3">
        <Logo size={30} tone="light" />
        {kicker && <span className="text-sm text-white/80">{kicker}</span>}
      </div>
      <h1 className="text-2xl font-extrabold">{title}</h1>
      {children}
    </header>
  );
}
