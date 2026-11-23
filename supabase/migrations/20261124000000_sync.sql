-- Phase 5: daily eBag sync in GitHub Actions.
-- Product details (nutrition label, drained weight) fetched from eBag's get_product. The sync fetches at most
-- 400 per run and re-checks them after 30 days, so the cache has to survive between runs (was
-- data/ebag_nutrition_cache.json). Written and read only by the sync (service role).
create table public.ebag_details (
  ebag_id bigint primary key,
  data    jsonb not null,
  fetched date not null
);

alter table public.ebag_details enable row level security;
-- no policies: service role only
revoke all on public.ebag_details from anon, authenticated;
