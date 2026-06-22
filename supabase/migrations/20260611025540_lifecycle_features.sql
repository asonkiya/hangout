create type public.departure_status as enum ('not_left', 'leaving', 'arrived');

alter table public.plans
  add column arrival_time timestamptz;

alter table public.plan_members
  add column departure_status public.departure_status not null default 'not_left';
