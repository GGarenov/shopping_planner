import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireCompleteProfile } from "@/lib/profile/load";
import { DeleteForm } from "./DeleteForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("profile.delete");
  return { title: t("metaTitle") };
}

export default async function DeletePage() {
  const { user } = await requireCompleteProfile();
  const [t, tc] = await Promise.all([getTranslations("profile.delete"), getTranslations("common")]);
  return (
    <main className="page">
      <Link href="/profile" className="btn-ghost -ml-3 self-start">
        {tc("back")}
      </Link>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p>
        {t.rich("intro", {
          email: user.email ?? "",
          b: (chunks) => <span className="font-semibold break-all">{chunks}</span>,
        })}
      </p>
      <ul className="list-disc pl-6 text-sm">
        <li>{t("itemData")}</li>
        <li>{t("itemPlans")}</li>
        <li>{t("itemEbag")}</li>
      </ul>
      <p className="text-sm opacity-80">{t("note")}</p>
      <DeleteForm />
    </main>
  );
}
