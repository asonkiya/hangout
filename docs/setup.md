# Development Setup

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 22+ (LTS) | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| Expo Go | Latest from App Store / Play Store | [iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent) |
| Git | Any recent version | `brew install git` or [git-scm.com](https://git-scm.com) |

Optional (for running migrations or deploying edge functions):
- Supabase CLI: `npm install -g supabase` or use `npx supabase`

## Quick start

```bash
# 1. Clone the repo
git clone <repo-url>
cd hangout

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Set up environment
cp .env.example .env
# Edit .env with your credentials (see below)

# 4. Start the dev server
npx expo start
```

Scan the QR code with Expo Go on your phone. Make sure your phone and computer are on the same Wi-Fi network.

## Environment variables

Create a `.env` file in the project root (it's gitignored):

```bash
# Required for the app to run
EXPO_PUBLIC_SUPABASE_URL=https://ciucouvnqetkjvniofba.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<ask the repo owner>
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<ask the repo owner>

# Only needed for running migrations (not needed for app development)
SUPABASE_DB_PASSWORD=<ask the repo owner>
SUPABASE_DB_URL=postgresql://postgres:<password>@db.ciucouvnqetkjvniofba.supabase.co:5432/postgres
```

Ask the repo owner for the actual values. Never commit `.env` to git.

## Running the app

```bash
# Start Expo dev server
npx expo start

# Start with tunnel (if same-network doesn't work)
npx expo start --tunnel

# iOS simulator (requires Xcode)
npx expo start --ios

# Android emulator (requires Android Studio)
npx expo start --android
```

## Test account

The login screen has pre-filled credentials for development:
- **Email:** `dev@hangout.com`
- **Password:** `password123`

## Project structure

```
hangout/
  app/                    # Screens (Expo Router file-based routing)
  lib/                    # Shared utilities (supabase client)
  types/                  # TypeScript types (database.ts)
  constants/              # Design tokens (colors, spacing, font sizes)
  assets/                 # App icons and images
  supabase/
    functions/            # Edge functions (Deno)
    migrations/           # SQL migration files
  docs/                   # Documentation (you are here)
```

## Common tasks

### Running a migration

```bash
source .env
npx supabase db query "$(cat supabase/migrations/<file>.sql)" --db-url "$SUPABASE_DB_URL"
```

### Deploying an edge function

```bash
npx supabase functions deploy <function-name> --project-ref ciucouvnqetkjvniofba
```

### Creating a new migration

```bash
npx supabase migration new <descriptive-name>
# Edit the generated file in supabase/migrations/
# Then apply it (see above)
```

### Type checking

```bash
npx tsc --noEmit
```

Note: Edge functions (in `supabase/functions/`) will show Deno-related type errors — this is expected since they use Deno imports. Only app-level errors matter.

## Troubleshooting

### "Project needs updated Expo Go"
Make sure you're on Expo SDK 54 and using the latest Expo Go from the App Store (not a beta build).

### QR code doesn't connect
Try `npx expo start --tunnel` instead. This routes through ngrok and doesn't require same-network.

### "Database error saving new user"
The Supabase project may need email confirmation disabled for dev. Check Supabase Dashboard > Auth > Settings > Email confirmations.

### npm install fails
Use `--legacy-peer-deps`:
```bash
rm -rf node_modules
npm install --legacy-peer-deps
```
