# Contributing

## Branch strategy

We work off `main`. For small changes, commit directly to `main`. For larger features, create a feature branch and open a PR.

## Making changes

### App code (screens, components, types)

1. Make your changes in `app/`, `lib/`, `types/`, or `constants/`
2. Test on a physical device via Expo Go
3. Run `npx tsc --noEmit` to type-check (ignore Deno errors in `supabase/functions/`)
4. Commit and push

### Database schema changes

1. Create a migration file: `npx supabase migration new <name>`
2. Write your SQL in the generated file
3. Apply it to the remote database:
   ```bash
   supabase db push --linked
   ```
   If the CLI complains that older migrations aren't applied (history mismatch), repair first:
   ```bash
   supabase migration repair --status applied --linked <timestamp1> <timestamp2> ...
   ```
4. Update `types/database.ts` to match the new schema
5. Update `docs/database.md` — add the migration entry and any new tables/columns

### Edge functions

1. Create a new directory under `supabase/functions/<name>/`
2. Add `index.ts` following the pattern of existing functions (see `docs/edge-functions.md`)
3. Test locally:
   ```bash
   npx supabase functions serve <name> --env-file .env
   ```
4. Deploy:
   ```bash
   supabase functions deploy <name>
   ```

## Code style

- TypeScript everywhere — no `.js` files in the app
- Use the design tokens from `constants/index.ts` (COLORS, SPACING, FONT_SIZE) — don't hardcode colors or spacing
- Keep screens self-contained — styles are defined at the bottom of each screen file via `StyleSheet.create()`
- Use `supabase.from()` for all database operations — no raw SQL from the client
- Edge functions use Deno imports (`https://esm.sh/...`) not npm

## Commit messages

Follow this style:
```
<short summary of what changed>

<optional longer description>
```

Examples:
- `Add push notifications and onboarding README`
- `Fix migration: tables before RLS policies, qualify ambiguous column ref`
- `Add ETA-based venue sorting via Routes API`

## Adding a new screen

1. Create the file under the appropriate route in `app/`
2. Expo Router auto-registers it based on the file path
3. Add a `<Stack.Screen>` entry in the parent `_layout.tsx` if it needs custom options (e.g. `presentation: 'modal'`)

## Adding a notification trigger

1. Identify the event and which screen triggers it
2. After the relevant Supabase mutation, add:
   ```typescript
   supabase.functions.invoke('notify', {
     body: {
       event: 'your_event_name',
       plan_id: id,
       actor_user_id: currentUserId,
       extra: { actor_name: myName, plan_title: plan.title },
     },
   });
   ```
3. Add the event to the `NotifyEvent` union AND the `buildMessage()` switch in `supabase/functions/notify/index.ts`
4. Redeploy the notify function (`supabase functions deploy notify`)
5. Update the event matrix in `docs/edge-functions.md`
