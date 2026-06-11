# Architecture

## Overview

Hangout is a mobile-first social planning app. Users create plans, invite friends, vote on venues, share live ETAs, and coordinate arrival in real time.

```
+-------------------+       +-------------------+       +-------------------+
|   Expo / React    | <---> |     Supabase      | <---> |   Google Maps     |
|   Native App      |       |   (Postgres +     |       |   Platform        |
|   (Expo Go)       |       |    Auth + Edge     |       |   (Places +       |
|                   |       |    Functions +     |       |    Routes APIs)   |
|                   |       |    Realtime)       |       |                   |
+-------------------+       +-------------------+       +-------------------+
        |                           |
        |                     Expo Push API
        |                     (notifications)
        v                           v
   iOS / Android              exp.host/--/api/v2/push/send
```

## Tech stack

| Layer | Technology |
|---|---|
| Mobile app | React Native, Expo SDK 54, Expo Router v6 |
| Auth | Supabase Auth (email/password) |
| Database | Supabase Postgres with Row Level Security |
| Realtime | Supabase Realtime (postgres_changes + broadcast) |
| Edge functions | Supabase Edge Functions (Deno) |
| Venue search | Google Places API (New) — Nearby Search |
| ETA computation | Google Routes API — computeRouteMatrix |
| Notifications | Expo Push Notifications |
| Deep linking | Custom URL scheme (`hangout://`) |

## App routing (Expo Router)

```
app/
  _layout.tsx             # Root: auth guard, push token registration, deep links
  (auth)/
    _layout.tsx
    login.tsx             # Email/password sign in & sign up
  (tabs)/
    _layout.tsx           # Tab navigator
    index.tsx             # Plans list (Active / Upcoming / Past)
  plan/
    create.tsx            # Create new plan (modal)
    [id]/
      _layout.tsx         # Plan stack navigator
      index.tsx           # Plan detail: lifecycle, departure status, arrival time
      venues.tsx          # Venue swiping and selection
      chat.tsx            # Group chat
      eta.tsx             # ETA sharing & live map
  join/
    [token].tsx           # Invite link handler
```

## Plan lifecycle (state machine)

```
  open ──────> venue_locked ──────> active ──────> completed
    |                |                 |
    +----------------+-----------------+──────> cancelled
```

| State | Meaning | Who triggers |
|---|---|---|
| `open` | Plan created, no venue yet | Auto on creation |
| `venue_locked` | Venue selected (by vote or host) | Any member (auto) or host (manual) |
| `active` | Happening now | Host taps "Start plan" |
| `completed` | Hangout finished | Host taps "End plan" |
| `cancelled` | Plan called off | Host taps "Cancel plan" |

## Realtime strategy

The app uses Supabase Realtime in two modes:

1. **postgres_changes** — subscriptions on `plans` and `plan_members` tables trigger UI refetches when rows are updated (state transitions, departure status changes, new members)
2. **broadcast** — the `compute-eta` edge function broadcasts `eta_updated` events so the ETA screen refreshes without polling

Push notifications supplement realtime for when the app is backgrounded.

## Data flow examples

### Creating a plan
1. User fills in title, date, vibe on `plan/create.tsx`
2. Insert into `plans` table (state = `open`)
3. Insert host into `plan_members` (role = `host`)
4. Redirect to plan detail

### Venue selection
1. User opens `plan/[id]/venues.tsx`
2. App requests location permission, stores anchor on the plan
3. Calls `search-venues` edge function → Google Places + Routes API → upserts `venue_candidates`
4. User swipes right/left on cards
5. If threshold met (60% right swipes) → auto-lock venue; or host manually locks
6. Plan state transitions to `venue_locked`
7. Push notification sent to all members

### ETA sharing
1. User starts location sharing on `plan/[id]/eta.tsx`
2. Creates `location_share_session`, periodically inserts `location_points`
3. Calls `compute-eta` edge function → Google Routes API → upserts `eta_snapshots`
4. Edge function broadcasts `eta_updated` → all members' ETA screens refresh

## Security model

- **Row Level Security (RLS)** on every table
- **`my_plan_ids()`** — security definer helper function that returns plan IDs the current user belongs to, avoiding infinite recursion in self-referential policies
- **Edge functions** authenticate via Bearer token, then use `SUPABASE_SERVICE_ROLE_KEY` for admin operations (bypasses RLS)
- **`handle_new_user()`** trigger — security definer function that auto-creates a `users` row when `auth.users` gets an insert
