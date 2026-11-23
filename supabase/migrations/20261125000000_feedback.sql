-- Phase 7: in-app feedback from testers («Обратна връзка» on the profile screen).
-- Users can only insert their own rows; reading is for the owner via the service role / dashboard.
-- Rows stay when the account is deleted, without the user link (the text is not tied to a person any more).
create table public.feedback (
  id         bigserial primary key,
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  message    text not null check (char_length(message) between 1 and 4000),
  page       text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "feedback: insert own" on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke select, update, delete on public.feedback from anon, authenticated;
