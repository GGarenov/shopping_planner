import type { Metadata } from "next";
import { InstallHint } from "./InstallHint";

export const metadata: Metadata = { title: "Инсталирай · Пазарен план" };

export default async function InstallPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only allow same-site relative paths.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <main className="page">
      <InstallHint next={safeNext} />
    </main>
  );
}
