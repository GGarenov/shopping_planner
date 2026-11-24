import { useLocale, useTranslations } from "next-intl";
import { longDate } from "@/lib/i18n/format";
import { daysBetween, STALE_AFTER_DAYS } from "@/lib/sync/status";

/**
 * Notice about price freshness: newer prices than the plan was made with ("make a new plan"), or no successful
 * sync for a few days ("prices may be outdated"). Renders nothing when everything is current.
 */
export function PricesNotice({
  planPricesDate,
  latestPricesDate,
  today,
}: {
  planPricesDate: string | null | undefined;
  latestPricesDate: string | null;
  today: string;
}) {
  const t = useTranslations("plan.prices");
  const locale = useLocale();
  if (latestPricesDate && planPricesDate && latestPricesDate > planPricesDate) {
    return (
      <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">
        {t("newer", { date: longDate(latestPricesDate, locale) })}
      </p>
    );
  }
  if (latestPricesDate && daysBetween(latestPricesDate, today) >= STALE_AFTER_DAYS) {
    return (
      <p className="rounded-xl border border-border px-4 py-3 text-sm" role="status">
        {t("stale", { date: longDate(latestPricesDate, locale) })}
      </p>
    );
  }
  return null;
}
