# Database Schema

All tables live in the `public` schema with Row Level Security enabled. UUIDs are generated with `pgcrypto`.

## Enums

| Enum | Values |
|---|---|
| `plan_state` | `open`, `venue_locked`, `active`, `completed`, `cancelled` |
| `departure_status` | `not_left`, `leaving`, `arrived` |
| `travel_mode` | `drive`, `walk` |
| `member_role` | `host`, `member` |
| `rsvp_status` | `pending`, `going`, `maybe`, `not_going` |
| `invite_status` | `pending`, `accepted`, `expired` |
| `swipe_direction` | `right`, `left` |
| `selection_type` | `auto`, `host` |
| `share_status` | `active`, `stopped`, `expired` |
| `share_mode` | `foreground` |

## Tables

### `users`

User profiles, auto-created on signup via the `handle_new_user()` trigger.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | References `auth.users(id)` |
| `display_name` | text | Required |
| `avatar_url` | text | Nullable |
| `phone_e164` | text | Unique, nullable |
| `email` | text | Nullable |
| `push_token` | text | Expo push token, nullable |
| `created_at` | timestamptz | Default `now()` |

**RLS policies:**
- `users_select_own` — can read own profile
- `users_select_coplan` — can read profiles of users who share a plan
- `users_insert_own` — can insert own profile
- `users_update_own` — can update own profile

### `plans`

A plan with its lifecycle state and venue selection.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `creator_user_id` | uuid FK | References `users(id)` |
| `title` | text | Required |
| `state` | plan_state | Default `open` |
| `scheduled_for` | timestamptz | Nullable — when the hangout is planned |
| `anchor_lat` | double precision | Nullable — user's location when searching venues |
| `anchor_lng` | double precision | Nullable |
| `selected_place_id` | text | Google Place ID, set when venue is locked (cleared on re-open) |
| `selected_place_name` | text | Display name of selected venue |
| `travel_mode_default` | travel_mode | Default `drive` |
| `vibe` | text | Nullable — maps to venue types (Food, Drinks, Coffee, etc.) |
| `arrival_time` | timestamptz | Nullable — "be there by" time set in LOCKED state |
| `created_at` | timestamptz | Default `now()` |

**Indexes:**
- `(creator_user_id, scheduled_for DESC)`
- `(state) WHERE state IN ('open','venue_locked','active')`

**RLS policies:**
- `plans_select_creator` — creator can always read
- `plans_select_member` — members can read (via `my_plan_ids()`)
- `plans_insert_creator` — only creator can insert
- `plans_update_creator` — only creator can update

> **Note:** `plans_update_creator` checks `creator_user_id`, not `plan_members.role = 'host'`. In practice they're always the same person today (the creator is auto-inserted as host), but if you ever support promoting another member to host, this policy will need to widen.

### `plan_members`

Join table linking users to plans with their role and status.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `plan_id` | uuid FK | References `plans(id)` ON DELETE CASCADE |
| `user_id` | uuid FK | References `users(id)` ON DELETE CASCADE |
| `role` | member_role | Default `member` |
| `rsvp_status` | rsvp_status | Default `pending` |
| `departure_status` | departure_status | Default `not_left` |
| `joined_at` | timestamptz | Default `now()` |

**Constraints:** `UNIQUE (plan_id, user_id)`

**RLS policies:**
- `pm_select` — can see members of plans you belong to
- `pm_insert_self` — can add yourself to a plan
- `pm_update_self` — can update your own membership (departure status, RSVP)

### `plan_invites`

Shareable invite tokens for joining plans.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `plan_id` | uuid FK | References `plans(id)` ON DELETE CASCADE |
| `token` | text | Unique, used in deep links (`pullup://join/{token}`) |
| `inviter_user_id` | uuid FK | References `users(id)` |
| `invitee_contact` | text | Nullable |
| `status` | invite_status | Default `pending` |
| `expires_at` | timestamptz | Required (typically 7 days from creation) |

### `venue_candidates`

Venues that may be selected as the destination for a plan. Populated from three sources: Google Places nearby search, host pre-pick at create, or peer suggestions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `plan_id` | uuid FK | References `plans(id)` ON DELETE CASCADE |
| `google_place_id` | text | Real Google Place ID, or synthetic `suggestion:{uuid}` for custom venues |
| `name` | text | Display name |
| `lat` / `lng` | double precision | Coordinates |
| `price_level` | smallint | 0–4, nullable |
| `rating` | numeric(3,1) | Google rating, nullable |
| `category` | text | e.g. "Restaurant", "Bar" |
| `source` | text | `nearby_search` (default), `host_picked`, or `suggestion` |
| `eta_seconds` | integer | Travel time from anchor, nullable |
| `photo_urls` | jsonb | Array of Google Places photo URLs, nullable |
| `address` | text | Short formatted address, nullable |
| `website_url` | text | Venue website, nullable |
| `maps_url` | text | Google Maps deep link, nullable |
| `user_rating_count` | integer | Number of Google ratings, nullable |
| `is_open` | boolean | Current open status from Places API, nullable |
| `suggested_by_user_id` | uuid FK | References `users(id)` ON DELETE SET NULL. Populated only when `source = 'suggestion'` |
| `created_at` | timestamptz | Default `now()` |

**Constraints:** `UNIQUE (plan_id, google_place_id)`

**Indexes:**
- `(plan_id, suggested_by_user_id)` — supports joining suggester display names

**RLS policies:**
- `vc_select` — any member of the plan can read candidates
- `vc_insert` — any member of the plan can insert (covers both auto-search and suggestions)

### `venue_swipes`

User votes on venue candidates (Tinder-style).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `plan_id` | uuid FK | ON DELETE CASCADE |
| `user_id` | uuid FK | ON DELETE CASCADE |
| `venue_candidate_id` | uuid FK | ON DELETE CASCADE |
| `direction` | swipe_direction | `right` (like) or `left` (pass) |
| `created_at` | timestamptz | Default `now()` |

**Constraints:** `UNIQUE (plan_id, user_id, venue_candidate_id)` — one vote per user per candidate

Suggesters get an auto-recorded right-swipe on their own suggestion at insertion time (handled client-side in `app/plan/[id]/suggest.tsx`).

### `venue_selection_events`

Records when and how a venue was selected as the plan's destination.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `plan_id` | uuid FK | ON DELETE CASCADE |
| `venue_candidate_id` | uuid FK | References `venue_candidates(id)` |
| `selected_by_user_id` | uuid FK | References `users(id)` |
| `selection_type` | selection_type | `auto` (60% threshold met) or `host` (manual pick) |
| `created_at` | timestamptz | Default `now()` |

**RLS policy `vse_insert`** (migration `20260610203322`):
- Any member can insert `selection_type = 'auto'`
- Only members with `role = 'host'` can insert `selection_type = 'host'`

### `location_share_sessions`

Tracks when a user is actively sharing their location for a plan.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `plan_id` | uuid FK | ON DELETE CASCADE |
| `user_id` | uuid FK | ON DELETE CASCADE |
| `status` | share_status | Default `active` |
| `started_at` | timestamptz | Default `now()` |
| `expires_at` | timestamptz | Required (typically `started_at + 4h`) |
| `stopped_at` | timestamptz | Nullable |
| `consent_version` | text | Required — bumped if consent copy changes |
| `share_mode` | share_mode | Default `foreground` (only value today) |

**Constraints:** `UNIQUE (plan_id, user_id) WHERE status = 'active'` — only one active session per user per plan

**RLS policies:**
- `lss_select` — any plan member can read all sessions for the plan
- `lss_insert_self` / `lss_update_self` — users can only create/modify their own sessions

### `location_points`

GPS pings from active location share sessions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `session_id` | uuid FK | References `location_share_sessions(id)` ON DELETE CASCADE |
| `user_id` | uuid FK | ON DELETE CASCADE |
| `lat` / `lng` | double precision | Coordinates |
| `accuracy_m` | double precision | Nullable |
| `captured_at` | timestamptz | Default `now()` |

**Indexes:**
- `(session_id, captured_at DESC)` — supports "latest point per session"
- `(user_id, captured_at DESC)`

**RLS policy `lp_select_co_member`** (migration `20260612040000`):
- Plan co-members can SELECT location_points whose session belongs to a plan they're in AND the session is `active`
- This unlocks the live friend-tracking map on the plan detail; without it, users could only see their own pings

### `eta_snapshots`

Computed ETAs from each user's location to the plan's destination. Written by the `compute-eta` edge function.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `plan_id` | uuid FK | ON DELETE CASCADE |
| `user_id` | uuid FK | ON DELETE CASCADE |
| `destination_place_id` | text | Google Place ID |
| `duration_seconds` | integer | Nullable |
| `distance_meters` | integer | Nullable |
| `status` | text | Default `ok` |
| `mode` | travel_mode | Default `drive` |
| `computed_at` | timestamptz | Default `now()` |

**Constraints:** `UNIQUE (plan_id, user_id)` (migration `20260610203323`) — one row per user per plan, updated in place

### `plan_messages`

Group chat messages within a plan.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `plan_id` | uuid FK | ON DELETE CASCADE |
| `user_id` | uuid FK | ON DELETE CASCADE |
| `message_type` | text | Default `text` |
| `body` | text | Message content |
| `created_at` | timestamptz | Default `now()` |

### `analytics_events`

Generic event tracking (not currently wired into the UI; kept for future instrumentation).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `user_id` | uuid FK | Nullable, ON DELETE SET NULL |
| `plan_id` | uuid FK | Nullable, ON DELETE SET NULL |
| `event_name` | text | Required |
| `properties_json` | jsonb | Nullable |
| `created_at` | timestamptz | Default `now()` |

## Helper functions

### `my_plan_ids()`

```sql
SECURITY DEFINER, SET search_path = ''
RETURNS SETOF uuid
```

Returns all `plan_id` values from `plan_members` where `user_id` matches the current auth user. Used in RLS policies to avoid infinite recursion when `plan_members` policies reference themselves.

### `handle_new_user()`

```sql
SECURITY DEFINER, SET search_path = ''
TRIGGER on auth.users AFTER INSERT
```

Auto-creates a row in `public.users` when a new auth user signs up. Extracts `display_name` from `raw_user_meta_data`, falling back to the email prefix.

## Cascade behaviour

Deleting a `plans` row cascades to:
- `plan_members`, `plan_invites`, `venue_candidates`, `venue_swipes` (via `venue_candidates`), `venue_selection_events`, `location_share_sessions`, `location_points` (via session), `eta_snapshots`, `plan_messages`

`analytics_events.plan_id` is `ON DELETE SET NULL` — analytics rows survive plan deletion.

So `delete from public.plans;` is a clean wipe of all plan data while leaving `users` accounts untouched.

## Migrations

| File | Description |
|---|---|
| `0001_initial_schema.sql` | Full initial schema: all tables, enums, RLS policies, triggers, `my_plan_ids()`, `handle_new_user()` |
| `20260610203321_add_vibe_to_plans.sql` | Add `vibe` column to plans |
| `20260610203322_auto_select_policy.sql` | Allow any member to insert auto venue selections; only host for manual |
| `20260610203323_eta_snapshots_unique.sql` | Unique constraint on `(plan_id, user_id)` in `eta_snapshots` |
| `20260610203324_invites_update_policy.sql` | Allow members to update invite status |
| `20260611015929_add_eta_to_venue_candidates.sql` | Add `eta_seconds` to venue_candidates |
| `20260611025540_lifecycle_features.sql` | Add `departure_status` enum on plan_members, `arrival_time` on plans |
| `20260611034934_add_push_token.sql` | Add `push_token` to users |
| `20260611160342_venue_rich_data.sql` | Add `photo_urls`, `address`, `website_url`, `maps_url`, `user_rating_count`, `is_open` to venue_candidates |
| `20260612030000_venue_suggestions.sql` | Add `suggested_by_user_id` to venue_candidates + index |
| `20260612040000_location_points_co_member_select.sql` | Replace `lp_select_own` with `lp_select_co_member` (unlocks live friend tracking) |
