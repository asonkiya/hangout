create extension if not exists "pgcrypto";

-- ── enums ──────────────────────────────────────────────────────
create type public.plan_state      as enum ('open','venue_locked','active','completed','cancelled');
create type public.travel_mode     as enum ('drive','walk');
create type public.member_role     as enum ('host','member');
create type public.rsvp_status     as enum ('pending','going','maybe','not_going');
create type public.invite_status   as enum ('pending','accepted','expired');
create type public.swipe_direction as enum ('right','left');
create type public.selection_type  as enum ('auto','host');
create type public.share_status    as enum ('active','stopped','expired');
create type public.share_mode      as enum ('foreground');

-- ─────────────────────────────────────────────────────────────
-- TABLES (all created first to avoid forward-reference issues
-- in RLS policies that join across tables)
-- ─────────────────────────────────────────────────────────────

create table public.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url   text,
  phone_e164   text unique,
  email        text,
  created_at   timestamptz not null default now()
);

create table public.plans (
  id                  uuid primary key default gen_random_uuid(),
  creator_user_id     uuid not null references public.users(id),
  title               text not null,
  state               public.plan_state not null default 'open',
  scheduled_for       timestamptz,
  anchor_lat          double precision,
  anchor_lng          double precision,
  selected_place_id   text,
  selected_place_name text,
  travel_mode_default public.travel_mode not null default 'drive',
  created_at          timestamptz not null default now()
);
create index on public.plans (creator_user_id, scheduled_for desc);
create index on public.plans (state) where state in ('open','venue_locked','active');

create table public.plan_members (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.plans(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  role        public.member_role not null default 'member',
  rsvp_status public.rsvp_status not null default 'pending',
  joined_at   timestamptz not null default now(),
  unique (plan_id, user_id)
);
create index on public.plan_members (user_id);

create table public.plan_invites (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.plans(id) on delete cascade,
  token           text not null unique,
  inviter_user_id uuid not null references public.users(id),
  invitee_contact text,
  status          public.invite_status not null default 'pending',
  expires_at      timestamptz not null
);
create index on public.plan_invites (plan_id);

create table public.venue_candidates (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.plans(id) on delete cascade,
  google_place_id text not null,
  name            text not null,
  lat             double precision not null,
  lng             double precision not null,
  price_level     smallint,
  rating          numeric(3,1),
  category        text,
  source          text not null default 'nearby_search',
  created_at      timestamptz not null default now(),
  unique (plan_id, google_place_id)
);

create table public.venue_swipes (
  id                 uuid primary key default gen_random_uuid(),
  plan_id            uuid not null references public.plans(id) on delete cascade,
  user_id            uuid not null references public.users(id) on delete cascade,
  venue_candidate_id uuid not null references public.venue_candidates(id) on delete cascade,
  direction          public.swipe_direction not null,
  created_at         timestamptz not null default now(),
  unique (plan_id, user_id, venue_candidate_id)
);

create table public.venue_selection_events (
  id                  uuid primary key default gen_random_uuid(),
  plan_id             uuid not null references public.plans(id) on delete cascade,
  venue_candidate_id  uuid not null references public.venue_candidates(id),
  selected_by_user_id uuid not null references public.users(id),
  selection_type      public.selection_type not null,
  created_at          timestamptz not null default now()
);
create index on public.venue_selection_events (plan_id);

create table public.location_share_sessions (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.plans(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  status          public.share_status not null default 'active',
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  stopped_at      timestamptz,
  consent_version text not null,
  share_mode      public.share_mode not null default 'foreground'
);
create unique index on public.location_share_sessions (plan_id, user_id) where status = 'active';

create table public.location_points (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.location_share_sessions(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  accuracy_m  double precision,
  captured_at timestamptz not null default now()
);
create index on public.location_points (session_id, captured_at desc);
create index on public.location_points (user_id, captured_at desc);

create table public.eta_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  plan_id              uuid not null references public.plans(id) on delete cascade,
  user_id              uuid not null references public.users(id) on delete cascade,
  destination_place_id text not null,
  duration_seconds     integer,
  distance_meters      integer,
  status               text not null default 'ok',
  mode                 public.travel_mode not null default 'drive',
  computed_at          timestamptz not null default now()
);
create index on public.eta_snapshots (plan_id, computed_at desc);

create table public.plan_messages (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.plans(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  message_type text not null default 'text',
  body         text not null,
  created_at   timestamptz not null default now()
);
create index on public.plan_messages (plan_id, created_at);

create table public.analytics_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users(id) on delete set null,
  plan_id         uuid references public.plans(id) on delete set null,
  event_name      text not null,
  properties_json jsonb,
  created_at      timestamptz not null default now()
);
create index on public.analytics_events (event_name, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- RLS (enabled + policies, after all tables exist)
-- ─────────────────────────────────────────────────────────────

alter table public.users                  enable row level security;
alter table public.plans                  enable row level security;
alter table public.plan_members           enable row level security;
alter table public.plan_invites           enable row level security;
alter table public.venue_candidates       enable row level security;
alter table public.venue_swipes           enable row level security;
alter table public.venue_selection_events enable row level security;
alter table public.location_share_sessions enable row level security;
alter table public.location_points        enable row level security;
alter table public.eta_snapshots          enable row level security;
alter table public.plan_messages          enable row level security;
alter table public.analytics_events       enable row level security;

-- users
create policy "users_select_own" on public.users for select to authenticated
  using ((select auth.uid()) = id);
create policy "users_insert_own" on public.users for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "users_update_own" on public.users for update to authenticated
  using  ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Also allow members to read other members' profiles when they share a plan
create policy "users_select_coplan" on public.users for select to authenticated
  using (exists (
    select 1 from public.plan_members pm
    join public.plan_members pm2 on pm2.plan_id = pm.plan_id
    where pm.user_id = public.users.id and pm2.user_id = (select auth.uid())
  ));

-- plans
create policy "plans_select_creator" on public.plans for select to authenticated
  using ((select auth.uid()) = creator_user_id);
create policy "plans_select_member" on public.plans for select to authenticated
  using (id in (select public.my_plan_ids()));
create policy "plans_insert_creator" on public.plans for insert to authenticated
  with check ((select auth.uid()) = creator_user_id);
create policy "plans_update_creator" on public.plans for update to authenticated
  using  ((select auth.uid()) = creator_user_id)
  with check ((select auth.uid()) = creator_user_id);

-- Helper: returns plan_ids the current user belongs to (security definer avoids RLS recursion)
create or replace function public.my_plan_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select plan_id from public.plan_members where user_id = (select auth.uid());
$$;

-- plan_members
create policy "pm_select" on public.plan_members for select to authenticated
  using (plan_id in (select public.my_plan_ids()));
create policy "pm_insert_self" on public.plan_members for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "pm_update_self" on public.plan_members for update to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- plan_invites
create policy "invites_select_member" on public.plan_invites for select to authenticated
  using (exists (
    select 1 from public.plan_members pm
    where pm.plan_id = plan_id and pm.user_id = (select auth.uid())
  ));
-- Public token lookup for join flow
create policy "invites_select_by_token" on public.plan_invites for select to anon, authenticated
  using (true);
create policy "invites_insert_member" on public.plan_invites for insert to authenticated
  with check (
    (select auth.uid()) = inviter_user_id
    and exists (
      select 1 from public.plan_members pm
      where pm.plan_id = plan_id and pm.user_id = (select auth.uid())
    )
  );

-- venue_candidates
create policy "vc_select" on public.venue_candidates for select to authenticated
  using (exists (select 1 from public.plan_members pm where pm.plan_id = plan_id and pm.user_id = (select auth.uid())));
create policy "vc_insert" on public.venue_candidates for insert to authenticated
  with check (exists (select 1 from public.plan_members pm where pm.plan_id = plan_id and pm.user_id = (select auth.uid())));

-- venue_swipes
create policy "vs_select" on public.venue_swipes for select to authenticated
  using (exists (select 1 from public.plan_members pm where pm.plan_id = plan_id and pm.user_id = (select auth.uid())));
create policy "vs_insert" on public.venue_swipes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.plan_members pm where pm.plan_id = plan_id and pm.user_id = (select auth.uid()))
  );

-- venue_selection_events
create policy "vse_select" on public.venue_selection_events for select to authenticated
  using (exists (select 1 from public.plan_members pm where pm.plan_id = plan_id and pm.user_id = (select auth.uid())));
create policy "vse_insert_host" on public.venue_selection_events for insert to authenticated
  with check (
    (select auth.uid()) = selected_by_user_id
    and exists (
      select 1 from public.plan_members pm
      where pm.plan_id = plan_id and pm.user_id = (select auth.uid()) and pm.role = 'host'
    )
  );

-- location_share_sessions
create policy "lss_select" on public.location_share_sessions for select to authenticated
  using (exists (select 1 from public.plan_members pm where pm.plan_id = plan_id and pm.user_id = (select auth.uid())));
create policy "lss_insert_self" on public.location_share_sessions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.plan_members pm where pm.plan_id = plan_id and pm.user_id = (select auth.uid()))
  );
create policy "lss_update_self" on public.location_share_sessions for update to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- location_points
create policy "lp_select_own" on public.location_points for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "lp_insert_own" on public.location_points for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- eta_snapshots
create policy "eta_select" on public.eta_snapshots for select to authenticated
  using (exists (select 1 from public.plan_members pm where pm.plan_id = plan_id and pm.user_id = (select auth.uid())));

-- plan_messages
create policy "msg_select" on public.plan_messages for select to authenticated
  using (exists (select 1 from public.plan_members pm where pm.plan_id = plan_id and pm.user_id = (select auth.uid())));
create policy "msg_insert" on public.plan_messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.plan_members pm where pm.plan_id = plan_id and pm.user_id = (select auth.uid()))
  );

-- analytics_events
create policy "ae_insert_own" on public.analytics_events for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ─────────────────────────────────────────────────────────────
-- AUTO-CREATE USER PROFILE ON SIGNUP
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, display_name, phone_e164, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(coalesce(new.email, new.phone), '@', 1),
      'User'
    ),
    new.phone,
    new.email
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
