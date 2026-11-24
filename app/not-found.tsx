import Link from "next/link";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("profile.pages");
  return (
    <main className="page justify-center">
      <h1 className="text-2xl font-bold">{t("notFoundTitle")}</h1>
      <p className="opacity-80">{t("notFoundText")}</p>
      <Link href="/" className="btn-primary">
        {t("home")}
      </Link>
    </main>
  );
}
