# Architecture

## Overview

Hangout is a mobile-first social planning app. Users create plans, invite friends, vote on venues (or directly suggest spots), share live locations, and watch each other converge on the destination in real time.

```
+-------------------+       +-------------------+       +-------------------+
|   Expo / React    | <---> |     Supabase      | <---> |   Google Maps     |
|   Native App      |       |   (Postgres +     |       |   Platform        |
|   (Expo Go)       |       |    Auth + Edge    |       |   (Places +       |
|                   |       |    Functions +    |       |    Routes APIs)   |
|                   |       |    Realtime)      |       |                   |
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
| Auth | Supabase Auth (email/password, magic-link capable) |
| Database | Supabase Postgres with Row Level Security |
| Realtime | Supabase Realtime (postgres_changes + broadcast) |
| Edge functions | Supabase Edge Functions (Deno) |
| Venue search | Google Places API (New) — Nearby Search + Place Details + Autocomplete |
| ETA computation | Google Routes API — `computeRouteMatrix` |
| Notifications | Expo Push Notifications |
| Deep linking | Custom URL scheme (`hangout://`) — works in standalone/dev build, not Expo Go |
| Maps | `react-native-maps` with custom Avatar markers |
| Gestures | `react-native-gesture-handler` + `react-native-reanimated` (venues swipe deck only) |

## App routing (Expo Router)

```
app/
  _layout.tsx               # Root: font loading, auth guard, push token registration, deep links, GestureHandlerRootView
  (auth)/
    _layout.tsx
    login.tsx               # Email/password sign in & sign up
    verify.tsx              # Magic-link verification handoff
  (tabs)/
    _layout.tsx             # Custom tab bar with raised center "+" button
    index.tsx               # Plans list: live ticker, next-up hero, upcoming rows, past (collapsible)
    profile.tsx             # User profile, sign out
  plan/
    create.tsx              # Create new plan (modal) — title, vibe, when, optional venue pre-pick
    [id]/
      _layout.tsx           # Plan stack navigator
      index.tsx             # Plan detail with 4 state-driven layouts (planning/locked/live/done)
      venues.tsx            # Venue swiping (gesture-driven) + match modal
      suggest.tsx           # Modal: search Google Places, insert as suggestion candidate
      invite.tsx            # Link card with copy + native share sheet
      chat.tsx              # Group chat
      edit.tsx              # Edit plan title/vibe/scheduled time
      eta.tsx               # ETA sharing dashboard with shared location map
  join/
    [token].tsx             # Invite link landing — joins user as plan_member
```

## Plan lifecycle (state machine)

```
                ┌─────────────┐  re-open
   open ──────> │ venue_locked│ ─────────> open
     │          └─────────────┘
     │                │
     │                v
     │             active ──────> completed
     │                │
     └────────────────+──────────> cancelled
```

| State | Meaning | Who triggers |
|---|---|---|
| `open` | Plan created, no venue yet | Auto on creation (unless host pre-picks) |
| `venue_locked` | Venue selected (by vote or host) | Any member via 60% threshold (`auto`) or host (`host`) |
| `active` | Happening now | Host taps "Start plan" |
| `completed` | Hangout finished | Host taps "End plan" |
| `cancelled` | Plan called off | Host taps "Cancel plan" |

The host can also **re-open voting** from `venue_locked`, which flips state back to `open` and clears `selected_place_id/name`. The previously locked venue remains as a candidate so it's still swipeable alongside any new suggestions.

## Plan detail screen — 4-state layout

`app/plan/[id]/index.tsx` renders four distinct UIs based on `plan.state`:

| State | Key UI |
|---|---|
| PLANNING (`open`) | Voting card (progress + "Swipe venues" + "Suggest a place"), crew avatars, chat/edit buttons |
| LOCKED (`venue_locked`) | Venue photo card, directions/website, countdown, arrival-time picker, "Who's in", "Start plan" (host) |
| LIVE (`active`) | `LiveMap` with destination + friend avatars, status rows (Arrived/On the way/Not left), chat peek, "I'm leaving"/"I've arrived" |
| DONE (`completed`/`cancelled`) | "That was fun." recap card, "Plan another" + "View chat" |

## Realtime strategy

The app uses Supabase Realtime in two modes:

1. **`postgres_changes`** — subscriptions on `plans`, `plan_members`, `venue_candidates`, `location_points`, `eta_snapshots` trigger UI refetches when rows change (state transitions, departure status, new suggestions, new GPS pings, new ETAs)
2. **`broadcast`** — the `compute-eta` edge function broadcasts `eta_updated` events so subscribers refresh without polling

**Important quirk:** Supabase Realtime sometimes doesn't fire reliably for the user's own writes. Mutating handlers in the app call `fetchAll()` (or the relevant refetch) explicitly after the await, in addition to relying on realtime. The realtime sub still handles other users' updates.

Push notifications supplement realtime for when the app is backgrounded.

## Data flow examples

### Creating a plan (no pre-pick)
1. User fills in title, vibe, when on `plan/create.tsx`
2. Insert into `plans` (state = `open`, `scheduled_for` from when-ish chip)
3. Insert host into `plan_members` (role = `host`)
4. Redirect to `plan/[id]/invite`

### Creating a plan (with pre-pick)
1. Same as above but with a `PickedPlace` from the `PlacePicker` component
2. Insert into `plans` with state = `venue_locked` + `selected_place_id/name` + `anchor_lat/lng` from the picked place
3. Insert host into `plan_members`
4. Insert a `venue_candidates` row with `source = 'host_picked'`
5. Insert a `venue_selection_events` row with `selection_type = 'host'`
6. Redirect to invite screen

### Venue swipe + auto-lock
1. User opens `plan/[id]/venues.tsx`
2. Request location permission, store anchor on the plan if not set
3. Load existing `venue_candidates`; if none with `source='nearby_search'`, invoke `search-venues` edge function
4. User swipes right/left → upsert `venue_swipes`
5. After each right-swipe: `checkAutoSelect()` queries swipe counts; if ≥ 60% members liked it, flip plan state and insert `venue_selection_events` with `selection_type = 'auto'`
6. `MatchMoment` modal fires; push notification sent via `notify` function

### Custom suggestion (peer)
1. Any member taps "+ Suggest" → opens `plan/[id]/suggest.tsx`
2. `PlacePicker` (Google Places Autocomplete + Place Details) returns coords + name + maps URL
3. Insert `venue_candidates` row with `source='suggestion'`, `suggested_by_user_id=me`, synthetic `google_place_id='suggestion:'+uuid`
4. Auto-record a right-swipe for the suggester
5. Push notification fires (`venue_suggested`)
6. Other members' venue decks update live via `INSERT` realtime sub on `venue_candidates`

### Live location & friend tracking
1. User taps "Share ETA" → opens `plan/[id]/eta.tsx`
2. Grants foreground location permission, inserts `location_share_sessions` (4h expiry)
3. `Location.watchPositionAsync` fires every ~20s, inserts `location_points`
4. Each insert triggers `compute-eta` (debounced) → writes `eta_snapshots` + broadcasts `eta_updated`
5. On `plan/[id]/index.tsx` LIVE state: realtime sub on `location_points` + `eta_snapshots` triggers `fetchMemberLocations()` which joins active sessions, latest point per user, and latest ETA → passes to `LiveMap`
6. `LiveMap` renders the destination pin + one Avatar marker per member with status dot + ETA bubble, auto-fits the region

## Security model

- **Row Level Security (RLS)** on every table
- **`my_plan_ids()`** — security-definer helper that returns plan IDs the current user belongs to, avoiding infinite recursion in self-referential `plan_members` policies
- **Edge functions** authenticate via Bearer token (validated against `SUPABASE_ANON_KEY`), then use `SUPABASE_SERVICE_ROLE_KEY` for admin operations (bypasses RLS)
- **`handle_new_user()`** trigger — security-definer function that auto-creates a `users` row when `auth.users` gets an insert
- **Location privacy** — `location_points` SELECT is gated on (a) the point's session is `active` AND (b) the requester is a member of the session's plan. No background sharing; sessions auto-expire after 4 hours.
- **Push tokens** — stored on `users.push_token`. Notify function clears tokens that return `DeviceNotRegistered` (uninstalled app).

## Design system

Tokens in `constants/index.ts`:
- `COLORS` — primary palette + status tints (success/warning/error) + neutrals
- `VIBE_COLORS` — per-vibe (Food, Drinks, etc.) bg/fg/border for chips
- `RADIUS`, `SPACING`, `FONT_SIZE`, `SHADOWS`, `AVATAR_COLORS`

Shared components in `components/ui/`:
- `NavHead`, `HButton`, `VibeChip`, `StatePill`, `Avatar`, `AvatarRow`, `Card`, `Label`, `ProgressBar`, `CustomTabBar`

Specialized components in `components/`:
- `LiveMap` — MapView with custom Avatar markers
- `MatchMoment` — full-screen overlay when a venue auto-locks
- `PlacePicker` — reusable Google Places autocomplete input

Font: Outfit (400/500/600/700/800) loaded via `@expo-google-fonts/outfit` in the root layout.
