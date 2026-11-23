import { bgDate, daysBetween, STALE_AFTER_DAYS } from "@/lib/sync/status";

/**
 * Notice about price freshness: newer prices than the plan was made with ("make a new plan"), or no successful
 * sync for a few days ("prices may be outdated"). Renders nothing when everything is current.
 */
export function PricesNotice({ planPricesDate, latestPricesDate, today }: { planPricesDate: string | null | undefined; latestPricesDate: string | null; today: string }) {
  if (latestPricesDate && planPricesDate && latestPricesDate > planPricesDate) {
    return (
      <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">
        Има нови цени от eBag ({bgDate(latestPricesDate)}). Натисни „Нов план“ на екрана с плана, за да ги използваш.
      </p>
    );
  }
  if (latestPricesDate && daysBetween(latestPricesDate, today) >= STALE_AFTER_DAYS) {
    return (
      <p className="rounded-xl border border-border px-4 py-3 text-sm" role="status">
        Цените не са обновявани от {bgDate(latestPricesDate)} — в eBag може да са се променили.
      </p>
    );
  }
  return null;
}
