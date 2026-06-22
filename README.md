# Hangout

A social planning app built with Expo (SDK 54) and Supabase. Create plans with friends, vote on venues, share ETAs, and track who's on the way.

## Prerequisites

- **Node.js 22+** (LTS)
- **Expo Go** on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
- Access to the shared Supabase project (ask the repo owner for credentials)

## Getting started

```bash
# 1. Clone and install
git clone <repo-url> && cd hangout
npm install --legacy-peer-deps

# 2. Set up environment variables
cp .env.example .env
# Fill in the values (ask the repo owner for the Supabase URL, anon key, and Google Maps API key)

# 3. Start the dev server
npx expo start
```

Scan the QR code with Expo Go on your phone.

## Environment variables

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API key (Places + Routes APIs enabled) |
| `SUPABASE_DB_PASSWORD` | DB password (only needed for running migrations) |
| `SUPABASE_DB_URL` | Postgres connection string (only needed for running migrations) |

## Project structure

```
app/                    # Expo Router screens
  (auth)/               # Login + magic-link verify
  (tabs)/               # Home (plans list), profile
  plan/
    create.tsx          # Create a new plan (optional venue pre-pick)
    [id]/
      index.tsx         # Plan detail — 4 state-driven layouts
      venues.tsx        # Tinder-style venue swipe + auto-lock
      suggest.tsx       # Suggest a custom venue (Google Places search)
      invite.tsx        # Share invite link
      chat.tsx          # Group chat
      edit.tsx          # Edit plan title/vibe/time
      eta.tsx           # Location sharing + ETA dashboard
  join/[token].tsx      # Deep-link join handler

components/
  ui/                   # Shared design-system primitives
  LiveMap.tsx           # Map with destination + friend avatar markers
  MatchMoment.tsx       # Full-screen confetti when a venue auto-locks
  PlacePicker.tsx       # Google Places autocomplete input

lib/supabase.ts         # Supabase client
types/database.ts       # TypeScript types matching the DB schema
constants/index.ts      # Design tokens (colors, spacing, fonts, shadows, vibe colors)

supabase/
  functions/            # Deno edge functions
    compute-eta/        # Computes ETAs via Google Routes API
    search-venues/      # Searches nearby venues via Google Places API
    notify/             # Sends push notifications via Expo Push API
  migrations/           # SQL migration files
```

## Documentation

| Doc | What's in it |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System overview, plan state machine, realtime strategy, routing tree |
| [docs/features.md](docs/features.md) | End-to-end walkthroughs for every major feature |
| [docs/database.md](docs/database.md) | Tables, columns, RLS policies, migrations |
| [docs/edge-functions.md](docs/edge-functions.md) | Request/response for each edge function + notify event matrix |
| [docs/setup.md](docs/setup.md) | Local dev setup, environment variables, troubleshooting |
| [docs/contributing.md](docs/contributing.md) | Code style, migration workflow, adding screens/notifications |
| [docs/publishing.md](docs/publishing.md) | iOS / Android store submission steps |
| [docs/design-handoff.md](docs/design-handoff.md) | Screen inventory and design system notes |
| [docs/future-plans.md](docs/future-plans.md) | Prioritized backlog of unbuilt work — start here when picking up the project |

## Running migrations

```bash
supabase db push --linked
```

## Deploying edge functions

```bash
supabase functions deploy <function-name>
```

## Tech stack

- **Frontend**: React Native + Expo SDK 54, Expo Router v6
- **Backend**: Supabase (Postgres, Auth, Realtime, Edge Functions)
- **APIs**: Google Places API (New), Google Routes API
- **Notifications**: Expo Push Notifications
