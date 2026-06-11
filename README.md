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
app/                  # Expo Router screens
  (auth)/             # Login flow
  (tabs)/             # Home tab (plans list)
  plan/
    create.tsx        # Create a new plan
    [id]/
      index.tsx       # Plan detail (lifecycle, departure status)
      venues.tsx      # Venue swiping & selection
      chat.tsx        # Group chat
      eta.tsx         # ETA sharing
  join/[token].tsx    # Invite link handler

lib/supabase.ts       # Supabase client
types/database.ts     # TypeScript types matching the DB schema
constants/index.ts    # Colors, spacing, font sizes

supabase/
  functions/          # Deno edge functions
    compute-eta/      # Computes ETAs via Google Routes API
    search-venues/    # Searches nearby venues via Google Places API
    notify/           # Sends push notifications via Expo Push API
  migrations/         # SQL migration files
```

## Running migrations

Migrations are applied to the remote Supabase DB directly:

```bash
source .env
npx supabase db query "$(cat supabase/migrations/<migration-file>.sql)" --db-url "$SUPABASE_DB_URL"
```

## Deploying edge functions

```bash
npx supabase functions deploy <function-name> --project-ref <your-project-ref>
```

## Tech stack

- **Frontend**: React Native + Expo SDK 54, Expo Router v6
- **Backend**: Supabase (Postgres, Auth, Realtime, Edge Functions)
- **APIs**: Google Places API (New), Google Routes API
- **Notifications**: Expo Push Notifications
