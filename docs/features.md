# Features

End-to-end walkthroughs of each major feature, mapping the user-facing flow to the code, schema, and edge functions that make it work. Read alongside `architecture.md` (system overview) and `database.md` (schema reference).

---

## 1. Plan creation

### Flow
1. User taps the raised `+` in the center tab bar → opens `app/plan/create.tsx` as a modal
2. Fills in **title** (required), picks a **vibe** (Food / Drinks / Party / Movie / Coffee / Gaming / Active), picks a **when-ish** time (Tonight 8pm / Tomorrow 7pm / This weekend 2pm / Pick exact via `DateTimePicker`)
3. (Optional) Searches a **venue to pre-pick** via the `PlacePicker` component — if filled, the plan starts in `venue_locked` state
4. Taps "Create plan" → redirected to the invite screen

### Code
- Screen: `app/plan/create.tsx`
- Helpers: `computeScheduled(when, exactDate)` converts the chip choice into an ISO timestamp client-side; no schema change needed
- Reusable component: `components/PlacePicker.tsx`

### Database writes
- `plans` insert: `title`, `state`, `scheduled_for`, `vibe`, optionally `selected_place_id/name`, `anchor_lat/lng`
- `plan_members` insert: `(plan.id, user.id, role='host', rsvp_status='going')`
- If pre-pick: additional `venue_candidates` insert (`source='host_picked'`) + `venue_selection_events` insert (`selection_type='host'`)

### Why this design
- Fuzzy "when-ish" chips reduce friction vs. forcing a date picker upfront. The picker is one tap away if needed.
- Pre-pick is optional: lets the host skip the whole swipe flow when they already know the spot ("yo, my place at 8") without forcing UI on the casual-decision path.

---

## 2. Invite & join flow

### Flow
1. After creating a plan (or from the plan detail), user lands on `app/plan/[id]/invite.tsx`
2. Sees a dashed-bordered link card with `pullup://join/{token}` and a **Copy** button
3. Taps **Share link** → native iOS/Android share sheet → sends via iMessage / WhatsApp / etc.
4. Recipient taps the link → if app installed, deep-link routes to `app/join/[token].tsx` → joins as a `plan_member` → push notification to host

### Code
- Invite screen: `app/plan/[id]/invite.tsx`
- Deep link handler: `app/_layout.tsx` (uses `Linking.parse`, routes `join/TOKEN` to `/join/[token]`)
- Join handler: `app/join/[token].tsx`
- Token generation: `Math.random().toString(36).slice(2, 10)` (8-char base36) — sufficient entropy for a 7-day-expiring invite

### Database writes
- `plan_invites` insert on share: `(plan_id, token, inviter_user_id, status='pending', expires_at=now+7d)`
- `plan_members` insert on join: `(plan_id, joiner_user_id, role='member', rsvp_status='going')`
- `plan_invites` update on join: `status='accepted'`

### Expo Go caveat
The `pullup://` scheme is only registered on a real built app (standalone or EAS dev build). In Expo Go, tapping the link from iMessage does nothing because no app on the recipient's phone owns that scheme. For dev testing across Expo Go, use `Linking.createURL('join/' + token)` which yields an `exp://` URL Expo Go intercepts — but only works if both devs share the same dev server.

---

## 3. Venue swipe & auto-lock

### Flow
1. From plan detail PLANNING state, user taps "Swipe venues" → `app/plan/[id]/venues.tsx`
2. App requests foreground location permission, saves it as `plans.anchor_lat/lng` if not set
3. Loads existing `venue_candidates`; if no rows with `source='nearby_search'`, invokes the `search-venues` edge function to populate the deck
4. User swipes right/left through the card stack:
   - Card follows the finger, rotates ±12° max based on translation
   - LIKE / NOPE stamps fade in past 20px of horizontal drag
   - Past 120px threshold or velocity > 800px/s → fling off-screen + medium haptic + record swipe
5. On every right-swipe: `checkAutoSelect(venue)` queries `(total_members)` vs `(right-swipes for this venue)`. If ratio ≥ 60% (`AUTO_SELECT_THRESHOLD`), auto-lock fires:
   - `plans` update: `state='venue_locked'`, `selected_place_id/name` set
   - `venue_selection_events` insert: `selection_type='auto'`
   - `MatchMoment` modal: confetti, "It's a match!", "Lock it in" (host) / "Keep swiping" buttons
6. Push notification (`venue_locked`) fires to all other members

### Code
- Screen: `app/plan/[id]/venues.tsx`
- Match modal: `components/MatchMoment.tsx`
- Swipe gesture: `react-native-gesture-handler` (`Gesture.Pan()`)
- Card animation: `react-native-reanimated` (`useSharedValue`, `useAnimatedStyle`, `withSpring`, `withTiming`, `runOnJS`)
- Photo carousel: tap left/right thirds of the card photo to navigate `venue.photo_urls`; story-style segment indicators at top

### Database writes
- Multiple `venue_swipes` upserts (one per swipe), unique on `(plan_id, user_id, venue_candidate_id)`
- One `venue_selection_events` insert when threshold met
- One `plans` update when threshold met

### Notes
- Reanimated v4 requires a dev build for the gesture to work — in Expo Go alone, the swipe deck loads but won't be gesturally responsive (the action buttons still work)
- The threshold is intentionally low (60%) so quick decisions can happen with just 3/5 yeses, not 5/5

---

## 4. Custom venue suggestions

### Flow
1. From `app/plan/[id]/venues.tsx` header OR from the PLANNING voting card, user taps "+ Suggest"
2. Opens `app/plan/[id]/suggest.tsx` modal
3. `PlacePicker` searches Google Places Autocomplete; user picks a result
4. Place Details API fetches coords + address + Maps URL
5. User taps "Suggest it" → `venue_candidates` insert (`source='suggestion'`, `suggested_by_user_id=me`, synthetic `google_place_id='suggestion:'+uuid`) + auto-right-swipe for suggester
6. `notify` fires (`venue_suggested` event)
7. Other members' venue decks update live via realtime `INSERT` sub on `venue_candidates`
8. The suggestion card shows a "Suggested by {name}" pill at the top of its photo when displayed in the deck

### Code
- Screen: `app/plan/[id]/suggest.tsx`
- Picker: `components/PlacePicker.tsx` (uses `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` client-side)
- Display: `app/plan/[id]/venues.tsx` — suggester name joined via `users!suggested_by_user_id(display_name)`
- Realtime: `venues.tsx` subscribes to `venue_candidates` INSERT events filtered by `plan_id`

### Database writes
- One `venue_candidates` insert with rich data fields populated from Place Details
- One `venue_swipes` upsert (`direction='right'` for the suggester)

### Why this design
- Auto-counting the suggester's vote means a suggestion immediately counts as 1/N toward the auto-lock threshold — reduces friction and rewards initiative
- Real Google Places lookup (vs. plain text input) means the live map and ETA computation work the same way for suggestions as for nearby-search results
- The "Suggested by X" pill is a social signal: "Sarah picked this, not the algorithm"

---

## 5. Plan detail screen — 4 states

`app/plan/[id]/index.tsx` is the central screen. It branches on `plan.state` and renders a completely different layout for each:

### PLANNING (`open`)
- **Header**: title, vibe chip + scheduled date, StatePill ("Planning"), overflow menu
- **Voting card**: "Find the spot" — progress bar of `swipes done / total candidates`, "Swipe venues" primary button, "+ Suggest a place" secondary link
- **Crew**: avatar row of `plan_members` + dashed-bordered "+" to invite
- **Bottom**: Chat / Edit plan ghost buttons
- **Footer hint**: "Map, ETA and arrivals appear once the plan is locked."

### LOCKED (`venue_locked`)
- **Venue card**: photo from `venue_candidates.photo_urls[0]`, name + ETA chip ("12 min away"), address, Directions + Website buttons
- **Countdown strip**: "Tomorrow!" / "3 days to go" computed from `scheduled_for`
- **Arrival time**: tap to open `DateTimePicker` (datetime mode) — sets `plans.arrival_time`
- **Who's in**: large avatar row of plan members
- **Bottom**: Chat / Share ETA buttons, plus "Start plan — happening now" primary button (host only)
- **Overflow menu (host)**: Edit plan, Re-open voting, Cancel plan

### LIVE (`active`)
- **Header**: title, venue name + arrival time
- **LiveMap**: 196px tall MapView — destination pin + one Avatar marker per member currently sharing location, each with a status dot (gray=not_left / orange=leaving / green=arrived) and an ETA bubble ("12m")
- **Status rows**: Arrived / On the way / Not left — each section only shown if non-empty, with an avatar row of who's in that bucket
- **Chat peek**: last message preview tappable to open chat
- **Bottom**: "I'm leaving" → flips to "I've arrived" depending on `myStatus`; arrived shows a checkmark banner
- **Overflow menu (host)**: Edit plan, Cancel plan, End plan

### DONE (`completed` / `cancelled`)
- **Display text**: "That was fun." or "Plan cancelled."
- **Recap card**: photo + venue + crew avatars
- **Bottom**: "Plan another with this crew" + "View chat"

### Realtime + focus refetching

The screen subscribes to:
- `plans` UPDATE (state transitions, arrival time changes)
- `plan_members` (RSVPs, departure status, new members)
- `location_points` INSERT (any new GPS ping) → triggers `fetchMemberLocations()`
- `eta_snapshots` (ETA updates) → triggers `fetchMemberLocations()`
- Broadcast `plan_updated`

Also: `useFocusEffect` calls `fetchAll()` whenever the screen regains focus. This is critical because Supabase Realtime sometimes doesn't fire for the user's own writes — so after every mutation the handler explicitly calls `fetchAll()` too.

---

## 6. Live friend tracking on the map

### Flow
1. Plan must be in `active` state
2. Each member opens `app/plan/[id]/eta.tsx` and taps "Share ETA for this plan"
3. They grant foreground location permission → `location_share_sessions` insert (4h expiry)
4. `Location.watchPositionAsync` watches position (Balanced accuracy, 50m distance threshold or 30s interval, whichever fires first)
5. Each fire: `location_points` insert + invoke `compute-eta` edge function (debounced)
6. `compute-eta` computes ETA from this user's latest position to the venue → upserts `eta_snapshots` → broadcasts `eta_updated`
7. Other members' plan detail LIVE state realtime sub picks up the point/ETA → `fetchMemberLocations()` runs → `LiveMap` re-renders with updated marker positions

### Code
- Map component: `components/LiveMap.tsx`
- Fetch: `fetchMemberLocations()` in `app/plan/[id]/index.tsx` — joins active sessions, latest point per user (via subquery), latest ETA per user (deduped by `computed_at desc`), and member's `departure_status` from `plan_members`
- Sharing UI: `app/plan/[id]/eta.tsx`
- Edge function: `supabase/functions/compute-eta/index.ts`

### Database reads
- `location_share_sessions` filtered to `(plan_id, status='active')`
- `location_points` latest per session (most recent by `captured_at`)
- `eta_snapshots` latest per user — `etaByUser` map built client-side from a sorted query

### Privacy
- Foreground-only sharing — no background updates (would require a dev build with `expo-task-manager` and the background location plugin)
- Per-plan scoped — sharing in plan A doesn't expose your location in plan B
- 4-hour auto-expire on sessions
- Explicit consent screen before first share, with `consent_version` recorded
- `lp_select_co_member` RLS policy gates reads to (a) the session is active AND (b) the requester is a plan member

### Caveat
The location subscription is bound to the ETA screen's lifecycle. Navigate away from `eta.tsx` and `locSub.current?.remove()` runs in cleanup — no more new points until you return to that screen (the `AppState` listener pushes one fresh point when the app foregrounds). A future improvement is moving the subscription up into the root layout so sharing persists across screens.

---

## 7. Chat

### Flow
1. From PLANNING / LOCKED / LIVE / DONE states, tap "Chat" → `app/plan/[id]/chat.tsx`
2. Type a message, hit send → `plan_messages` insert
3. `notify` fires (`chat_message` event) → all other members get a push
4. Realtime sub on `plan_messages` updates everyone's chat view live

### Code
- Screen: `app/plan/[id]/chat.tsx`
- Last-message peek: `fetchAll()` in `app/plan/[id]/index.tsx` pulls the last message for the LIVE state chat peek row

---

## 8. Push notifications

### Setup
1. Root layout (`app/_layout.tsx`) requests notification permission on auth
2. Calls `Notifications.getExpoPushTokenAsync({ projectId })` → token like `ExponentPushToken[xxx]`
3. Saves to `users.push_token`

### Sending
- Any client mutation that should notify others calls `supabase.functions.invoke('notify', { body: { event, plan_id, actor_user_id, extra } })`
- Edge function picks up the call, builds an Expo Push message per recipient, batch-sends to `https://exp.host/--/api/v2/push/send`
- Self-healing: tickets returning `DeviceNotRegistered` cause the function to null out that user's `push_token`

### Tapping
- Notification handler in root layout: `addNotificationResponseReceivedListener`
- Extracts `plan_id` from `notification.request.content.data` → `router.push('/plan/' + planId)`

### Verifying it works
- Saved token visible: `select push_token from users where id = <you>`
- Direct test push:
  ```bash
  curl -X POST https://exp.host/--/api/v2/push/send \
    -H 'Content-Type: application/json' \
    -d '[{"to":"<YOUR_TOKEN>","title":"test","body":"hello","sound":"default"}]'
  ```
- If you get `status: "ok"` and a notification on your phone, the full pipeline works

---

## 9. Plan lifecycle actions

### Activate (`open` / `venue_locked` → `active`)
- Host taps "Start plan — happening now" on the LOCKED state
- `activatePlan()` updates `plans.state='active'`, surfaces RLS errors via Alert, calls `notifyMembers('plan_activated')`, and forces `fetchAll()`

### End (`active` → `completed`)
- Host overflow menu → "End plan"
- Confirms via Alert, updates `plans.state='completed'`, notifies, `router.back()`

### Cancel (any active state → `cancelled`)
- Host overflow menu → "Cancel plan"
- Confirms, updates `plans.state='cancelled'`, notifies, `router.back()`

### Re-open voting (`venue_locked` → `open`)
- Host overflow menu → "Re-open voting" (only shown when state is `venue_locked`)
- Updates `plans.state='open'`, `selected_place_id=null`, `selected_place_name=null`
- The previously locked venue stays as a candidate so it remains swipeable

### Set arrival time
- LOCKED state, host taps "+ Set arrival time" or "Edit"
- `DateTimePicker` in `datetime` mode, seeded with current `arrival_time` or `scheduled_for`
- Saves on tap → `plans.arrival_time` update + `fetchAll()`

---

## 10. Tab bar & home

### Custom tab bar
- `components/ui/CustomTabBar.tsx` replaces the default Expo Router tab bar
- Two tabs: **Plans** (Feather `calendar`) and **You** (Feather `user`)
- Center: raised 58px primary-color circle with white `+` icon, `translateY: -28` to lift it above the bar
- The center button is NOT a tab route — it calls `router.push('/plan/create')` directly

### Home (Plans list)
- `app/(tabs)/index.tsx`
- Sections:
  - **Live ticker** (top) — any plans in `active` state, with a pulsing dot
  - **Next up** — single hero card with the soonest upcoming plan (`open` or `venue_locked`), venue photo + countdown pill
  - **Upcoming** — compact rows for the rest
  - **Past plans** — collapsible, badge with count
- Enriches each plan with member display names (for AvatarRow) and venue photo (for hero card) via secondary queries in `fetchPlans()`
- Realtime sub on `plan_members` (any change) and `plans` UPDATE → refetch
- `useFocusEffect` refetches on tab focus

---

## 11. Design system

Tokens (`constants/index.ts`):
- Colors: `primary`, `primaryLight`, `primaryPressed`, `primaryFaint`, neutrals, status tints (`successTint`/`successDeep`, `warningTint`/`warningDeep`, `errorTint`)
- `VIBE_COLORS` — bg / fg / border per vibe (Food, Drinks, etc.)
- `RADIUS` (button, card, chip, pill), `SPACING`, `FONT_SIZE`, `SHADOWS`, `AVATAR_COLORS`
- Fonts: Outfit 400/500/600/700/800 via `@expo-google-fonts/outfit`

Shared UI (`components/ui/`):
- `HButton` — primary / ghost / tint / text variants; sm/md/lg sizes; press animation via RN `Animated.timing` (not Reanimated — Reanimated v4 isn't bundled in Expo Go)
- `NavHead` — 38px white circle back/close button + title + optional right slot
- `Avatar`, `AvatarRow` — letter circles with index-based color rotation
- `StatePill` — color-coded plan state badge (LIVE has a pulsing dot)
- `VibeChip` — per-vibe colored chip for vibes
- `Card`, `Label`, `ProgressBar`, `CustomTabBar`

Specialized (`components/`):
- `LiveMap`, `MatchMoment`, `PlacePicker`

---

## What's not built yet

- **Face-off tiebreaker** — when two venues both hit threshold, host picks via a bracket UI
- **Background location tracking** — needs `expo-task-manager` + dev build
- **Skeleton loading states** — currently spinners
- **Manual paste-invite-code entry point** — for Expo Go testing without deep linking
- **In-app friend graph** — currently the only way to add people is via per-plan invite link
- **Photo uploads in chat** — text only
- **Plan templates / "redo this plan"** — no UI for cloning past plans
