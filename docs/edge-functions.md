# Edge Functions

All edge functions run on Supabase Edge Functions (Deno runtime). They authenticate the caller via Bearer token and use `SUPABASE_SERVICE_ROLE_KEY` for admin database operations.

## Common patterns

**Authentication:**
```typescript
const authHeader = req.headers.get('Authorization');
const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: authHeader } },
});
const { data: { user } } = await userClient.auth.getUser();
```

**Environment variables** (available in all functions):
| Variable | Description |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Public/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key (bypasses RLS) |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key (search-venues, compute-eta only) |

**Invoking from the app:**
```typescript
await supabase.functions.invoke('function-name', {
  body: { ... },
  headers: { Authorization: `Bearer ${session?.access_token}` }, // some functions require this explicitly
});
```

---

## `search-venues`

**Path:** `supabase/functions/search-venues/index.ts`

Searches for nearby venues based on the plan's vibe and location, then computes travel time to each.

### Request

```json
POST /functions/v1/search-venues
Authorization: Bearer <access_token>

{ "plan_id": "uuid" }
```

### What it does

1. Fetches the plan's `anchor_lat`, `anchor_lng`, `vibe`, and `travel_mode_default`
2. Maps the vibe to Google Place types:
   | Vibe | Place types |
   |---|---|
   | Food | restaurant |
   | Drinks | bar |
   | Coffee | cafe |
   | Movie | movie_theater |
   | Gaming | amusement_center, bowling_alley |
   | Active | gym, sports_club |
   | Party | night_club, bar |
   | _(none)_ | restaurant, bar, cafe |
3. Calls **Google Places Nearby Search** (2km radius, max 20 results) with field mask: `places.id,displayName,location,rating,userRatingCount,priceLevel,primaryTypeDisplayName,photos,shortFormattedAddress,websiteUri,googleMapsUri,currentOpeningHours`
4. Calls **Google Routes `computeRouteMatrix`** to get ETA from anchor to each venue
5. Sorts results by ETA (shortest first)
6. Upserts into `venue_candidates` with `source = 'nearby_search'` and rich data (photo_urls, address, website_url, maps_url, user_rating_count, is_open)

### Response

```json
{ "inserted": 15 }
```

### Errors

| Status | Cause |
|---|---|
| 401 | Missing or invalid auth token |
| 400 | Missing `plan_id` in body |
| 404 | Plan not found |
| 502 | Google Places API error |

---

## `compute-eta`

**Path:** `supabase/functions/compute-eta/index.ts`

Computes ETAs from all members' current locations to the plan's selected destination.

### Request

```json
POST /functions/v1/compute-eta
Authorization: Bearer <access_token>

{ "plan_id": "uuid" }
```

### What it does

1. Fetches the plan's `selected_place_id` and `travel_mode_default`
2. Finds all active `location_share_sessions` for this plan
3. Gets the latest `location_points` entry per session
4. Calls **Google Routes `computeRouteMatrix`** with all member locations as origins and the destination as the single destination
5. Upserts results into `eta_snapshots` (conflict on `plan_id, user_id`)
6. Broadcasts `eta_updated` event on the `eta-{plan_id}` Supabase Realtime channel

### Response

```json
{ "computed": 3 }
```

### Errors

| Status | Cause |
|---|---|
| 401 | Missing or invalid auth token |
| 400 | Missing `plan_id` |
| 404 | Plan not found |
| 502 | Google Routes API error |

---

## `notify`

**Path:** `supabase/functions/notify/index.ts`

Sends push notifications to plan members via the Expo Push API. Self-heals stale push tokens.

### Request

```json
POST /functions/v1/notify
Authorization: Bearer <access_token>

{
  "event": "plan_activated",
  "plan_id": "uuid",
  "actor_user_id": "uuid",
  "extra": {
    "actor_name": "Alice",
    "plan_title": "Friday dinner",
    "place_name": "Olive Garden",
    "message_body": "omw!"
  }
}
```

### Events and messages

| Event | Recipients | Notification body |
|---|---|---|
| `member_joined` | Host only | `"{actor_name} joined"` |
| `venue_suggested` | All members except actor | `"{actor_name} suggested {place_name}"` |
| `venue_locked` | All members except actor | `"Venue set: {place_name}"` |
| `voting_reopened` | All members except actor | `"{actor_name} re-opened voting — pick again"` |
| `plan_activated` | All members except actor | `"{plan_title} is happening now!"` |
| `plan_ended` | All members except actor | `"{plan_title} has ended"` |
| `plan_cancelled` | All members except actor | `"{plan_title} was cancelled"` |
| `leaving` | All members except actor | `"{actor_name} is on the way!"` |
| `arrived` | All members except actor | `"{actor_name} arrived!"` |
| `chat_message` | All members except actor | `"{actor_name}: {message_body}"` (truncated to 100 chars) |

The actor is always excluded from the recipient list. `member_joined` additionally filters to host only.

### What it does

1. Fetches all `plan_members` joined with `users(push_token)` using the service role key
2. Filters out the actor and members without push tokens
3. For `member_joined`, further filters to host only
4. Builds notification payload with title (plan name) and body (event-specific message)
5. Posts batch to `https://exp.host/--/api/v2/push/send`
6. Inspects per-recipient tickets in the response. For any ticket with `status='error'` and `details.error='DeviceNotRegistered'`, clears that user's `push_token` (self-healing for uninstalls).
7. Returns `{ sent, ok, errors }` and logs `notify event=X sent=N ok=N errors=N`

### Response

```json
{ "sent": 4, "ok": 4, "errors": 0 }
```

### Adding a new event

1. Add the event name to the `NotifyEvent` union type at the top of `notify/index.ts`
2. Add a case to the `buildMessage()` switch with the notification body
3. Optionally filter the recipients (e.g., host-only)
4. Call from the app:
   ```ts
   notifyMembers('your_event_name', { extra_key: 'value' });
   ```
   (The helper in `plan/[id]/index.tsx` handles auth + the standard payload shape.)
5. Redeploy: `npx supabase functions deploy notify`
6. Update the event matrix above in this doc

---

## Deploying

```bash
npx supabase functions deploy <function-name>
```

Deploy all functions:
```bash
for fn in search-venues compute-eta notify; do
  npx supabase functions deploy $fn
done
```

## Setting secrets

Google Maps API key (needed for search-venues and compute-eta):
```bash
npx supabase secrets set GOOGLE_MAPS_API_KEY=<your-key>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are automatically available in all edge functions.

## Viewing logs

In the Supabase dashboard → Functions → pick a function → Logs tab. Or via the CLI:
```bash
npx supabase functions logs <function-name>
```

The `notify` function logs delivery health (`sent=N ok=N errors=N`) which is the first place to look if push notifications aren't arriving.
