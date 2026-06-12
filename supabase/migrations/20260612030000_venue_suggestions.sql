alter table public.venue_candidates
  add column suggested_by_user_id uuid references public.users(id) on delete set null;

create index on public.venue_candidates (plan_id, suggested_by_user_id);
