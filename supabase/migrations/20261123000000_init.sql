-- Shopping Planner — initial schema (SPEC §6)
-- RLS is enabled on every table.
--   reference data : readable by authenticated users, written only by the service role (seed / sync)
--   per-user data  : user_id = auth.uid()
--   secrets        : no policies at all → service role only

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- reference data
-- ---------------------------------------------------------------------------
create table public.ingredients (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.recipes (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.products (
  ebag_id       bigint primary key,
  ingredient_id text references public.ingredients (id) on delete set null,
  data          jsonb not null,
  available     boolean not null default false,
  price         numeric(10, 2),
  promo         numeric(10, 2),
  updated_at    timestamptz not null default now()
);
create index products_ingredient_id_idx on public.products (ingredient_id);
create index products_available_idx on public.products (ingredient_id) where available;

create table public.sync_runs (
  id          bigserial primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running', 'success', 'failed', 'aborted')),
  stats       jsonb,
  log         text
);
create index sync_runs_started_at_idx on public.sync_runs (started_at desc);

create trigger ingredients_updated_at before update on public.ingredients
  for each row execute function public.set_updated_at();
create trigger recipes_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- per-user data (deleting the auth user cascades to everything below)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  sex              text check (sex in ('male', 'female')),
  age              int check (age between 14 and 100),
  height_cm        int check (height_cm between 120 and 230),
  weight_kg        numeric(5, 1) check (weight_kg between 30 and 300),
  activity         text check (activity in ('sedentary', 'light', 'moderate', 'high')),
  goal             text check (goal in ('lose', 'maintain', 'gain')),
  budget_eur       numeric(8, 2) check (budget_eur > 0),
  diet             text check (diet in ('vegetarian', 'vegan', 'pescatarian', 'low_carb')), -- null = no restriction
  exclude_tags     text[] not null default '{}',
  allergens        text[] not null default '{}',
  pantry           text[] not null default '{}',
  options          jsonb not null default '{}',
  targets_override jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start   date not null,
  targets      jsonb not null,
  plan         jsonb not null,
  shopping     jsonb not null,
  checkout_eur numeric(10, 2),
  eaten_eur    numeric(10, 2),
  solver       jsonb,
  created_at   timestamptz not null default now()
);
create index plans_user_created_idx on public.plans (user_id, created_at desc);

create table public.shopping_checks (
  plan_id uuid not null references public.plans (id) on delete cascade,
  ebag_id bigint not null,
  checked boolean not null default false,
  primary key (plan_id, ebag_id)
);

-- ---------------------------------------------------------------------------
-- secrets (service role only)
-- ---------------------------------------------------------------------------
create table public.ebag_connections (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  tokens_encrypted text not null,
  connected_at     timestamptz not null default now(),
  last_used_at     timestamptz,
  status           text not null default 'connected' check (status in ('connected', 'expired', 'revoked'))
);

create table public.system_secrets (
  key             text primary key,
  value_encrypted text not null,
  updated_at      timestamptz not null default now()
);
create trigger system_secrets_updated_at before update on public.system_secrets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.ingredients      enable row level security;
alter table public.recipes          enable row level security;
alter table public.products         enable row level security;
alter table public.sync_runs        enable row level security;
alter table public.profiles         enable row level security;
alter table public.plans            enable row level security;
alter table public.shopping_checks  enable row level security;
alter table public.ebag_connections enable row level security;
alter table public.system_secrets   enable row level security;

-- reference data: read-only for logged-in users
create policy "ingredients: authenticated read" on public.ingredients
  for select to authenticated using (true);
create policy "recipes: authenticated read" on public.recipes
  for select to authenticated using (true);
create policy "products: authenticated read" on public.products
  for select to authenticated using (true);
create policy "sync_runs: authenticated read" on public.sync_runs
  for select to authenticated using (true);

-- profiles: own row only
create policy "profiles: own select" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "profiles: own insert" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profiles: own update" on public.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "profiles: own delete" on public.profiles
  for delete to authenticated using (user_id = (select auth.uid()));

-- plans: own rows only (plans are immutable once generated → no update policy)
create policy "plans: own select" on public.plans
  for select to authenticated using (user_id = (select auth.uid()));
create policy "plans: own insert" on public.plans
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "plans: own delete" on public.plans
  for delete to authenticated using (user_id = (select auth.uid()));

-- shopping_checks: allowed when the parent plan belongs to the user
create policy "shopping_checks: own plan" on public.shopping_checks
  for all to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid())));

-- secrets: no policies; additionally strip table privileges from client roles
revoke all on public.ebag_connections from anon, authenticated;
revoke all on public.system_secrets   from anon, authenticated;

-- reference tables are never writable from the client
revoke insert, update, delete on public.ingredients, public.recipes, public.products, public.sync_runs
  from anon, authenticated;
