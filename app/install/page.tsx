import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InstallHint } from "./InstallHint";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tc] = await Promise.all([getTranslations("install"), getTranslations("common")]);
  return { title: `${t("title")} · ${tc("appName")}` };
}

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
