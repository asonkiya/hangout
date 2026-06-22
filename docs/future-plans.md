# Future Plans

A running backlog of work that hasn't been picked up yet, grouped by category and ordered by rough priority within each group. An agent (or human) should be able to read any entry and have enough context to start, including the files involved, the data model touchpoints, and the gotchas to watch for.

Last refreshed: 2026-06-16.

---

## Correctness / bug-squashing

### 1. End-to-end shakedown with a second account
Most lurking bugs only show up under multi-user usage. Run the full loop with two real accounts:
1. Account A creates a plan, shares invite
2. Account B joins via the link (works in a dev build, not Expo Go — see [features.md §2](features.md#2-invite--join-flow))
3. Both swipe; trigger an auto-lock
4. Both suggest a custom venue; verify it appears live on the other side with the "Suggested by" pill
5. Host activates; both share location; verify avatars appear on each other's `LiveMap`
6. Host ends plan; verify recap state on both

Things that might break here that solo testing missed: realtime subs for `venue_candidates` INSERT, `location_points` co-member SELECT (RLS policy `lp_select_co_member`), push notifications not arriving, the host-only update policy on `plans` (the `plans_update_creator` policy ties to `creator_user_id`, not `role='host'` — flag if a non-creator host ever gets demoted by this).

### 2. Verify the departure status fix
Earlier session: user reported "I'm leaving" / "I've arrived" buttons not updating the UI. Fix landed in `db17d1d` (manual `fetchAll()` after the mutation) but wasn't confirmed working after a full Expo Go reload. Worth re-testing once the shakedown happens.

### 3. Re-check the "Start plan" button
Same pattern as above — `activatePlan()` in `app/plan/[id]/index.tsx:118-126` was failing silently; fixed in `a29bf9f` to surface RLS errors via Alert. Confirm it actually fires the state transition cleanly under multi-user conditions.

---

## Feature gaps (real holes in the product)

### 4. Move location sharing into the root layout
**Problem.** `Location.watchPositionAsync` lives inside `app/plan/[id]/eta.tsx`. When the user navigates away from that screen, the cleanup runs `locSub.current?.remove()` → no new `location_points` until they return to the ETA tab. The `location_share_sessions` row stays `active` so other members see a frozen avatar.

**Fix.** Lift the subscription into `app/_layout.tsx` (or a custom hook used by the root layout). On mount, query `location_share_sessions` for any `(user_id=me, status='active', expires_at>now)` rows and start a single watch that uploads points for ALL active sessions.

**Files.** `app/_layout.tsx`, `app/plan/[id]/eta.tsx` (remove the watch), maybe a new `lib/locationSharing.ts` hook.

**Gotcha.** iOS will still suspend `watchPositionAsync` ~10 min after backgrounding without background-location entitlements. This fix just removes the screen-coupling — true background tracking is item #6.

### 5. Face-off tiebreaker
**Problem.** When multiple venues all hit the 60% auto-select threshold, `checkAutoSelect` in `app/plan/[id]/venues.tsx:133-154` locks the first one it sees. No tie-breaking.

**Fix.** When two or more candidates are tied (or within 1 vote of each other) on a swipe that would trigger auto-lock, instead push the host to `app/plan/[id]/faceoff.tsx` (new) with the tied candidate IDs. UI: bracket-style side-by-side cards, host taps a winner, the winner gets the host-type `venue_selection_events` insert.

**Files.** `app/plan/[id]/venues.tsx` (detection), `app/plan/[id]/faceoff.tsx` (new), `app/plan/[id]/_layout.tsx` (registration).

**Gotcha.** Make sure only the host can resolve a tie — RLS policy `vse_insert` already enforces this for `selection_type='host'`.

### 6. Background location
**Problem.** Today, sharing only works while the app is in the foreground. Useful upgrade for real-world hangout coordination.

**Approach.** Requires:
- A dev build (Expo Go doesn't support background location native modules)
- `expo-task-manager` + `expo-location`'s `startLocationUpdatesAsync` with a background task
- Updated `share_mode` enum to add `'background'`
- Updated consent screen copy + Apple "always" permission rationale
- App Store review will scrutinize this — be ready to justify the use case

**Files.** `app/plan/[id]/eta.tsx` (mode toggle), `app/_layout.tsx` (register task), new `lib/backgroundLocationTask.ts`, migration to extend `share_mode` enum.

### 7. Recent crew / past members suggestions
**Problem.** Invite screen (`app/plan/[id]/invite.tsx`) shows the link card and share button, but has a placeholder section for "or grab a recent crew" that's never been wired up.

**Fix.** Query `plan_members` joined on past plans for the current user, dedupe by `user_id`, show as tappable avatar tiles. Tapping inserts that user into `plan_members` for the new plan and notifies them.

**Files.** `app/plan/[id]/invite.tsx`.

**Gotcha.** Need to think about whether you can add someone to a plan without their consent. Today, joining requires the user to tap an invite link. Adding them directly bypasses that. Probably want this to send them a notification with a "Join" CTA rather than silently inserting.

---

## UX polish (cosmetic, low risk)

### 8. Skeleton loaders
**Problem.** All loading states are `ActivityIndicator` spinners. Looks generic.

**Fix.** Build `components/ui/Skeleton.tsx` — a shimmer-animated `View` (using RN `Animated`, not Reanimated, since the `HButton` precedent showed Reanimated v4 isn't compatible with Expo Go). Replace `ActivityIndicator` in:
- `app/(tabs)/index.tsx` (plans list loading)
- `app/plan/[id]/index.tsx` (plan detail loading)
- `app/plan/[id]/venues.tsx` ("Finding spots nearby…" state)

**Files.** `components/ui/Skeleton.tsx` (new), `components/ui/index.ts` (export), then 3 screen edits.

### 9. Empty states + first-time onboarding
**Problem.** The empty-plans state on home is just text ("No plans yet — tap + below"). New users have no context for what the app does.

**Fix.** A 2- or 3-screen welcome carousel on first launch (or on first time the home screen is empty):
1. "Swipe to find the spot" with a mock venue card
2. "See who's on the way" with a mock LiveMap
3. "+ to start a hangout"

Use `expo-secure-store` to set an `onboarding_completed` flag so it only shows once.

**Files.** `app/onboarding.tsx` (new), `app/_layout.tsx` (route), `app/(tabs)/index.tsx` (empty state copy refresh).

### 10. Profile screen functionality
**Problem.** `app/(tabs)/profile.tsx` is mostly a sign-out button. Should also support:
- Edit `display_name`
- Toggle push notifications (with copy explaining what events trigger)
- View location sharing history (past `location_share_sessions`)
- Delete account (see item #13)

**Files.** `app/(tabs)/profile.tsx`, possibly a new `app/profile/edit.tsx` and `app/profile/notifications.tsx`.

---

## Production readiness (pre-launch checklist)

### 11. EAS dev build
**Why.** Required for:
- `hangout://` deep links to actually work when tapped from iMessage (currently they only work inside Expo Go via `exp://`, see [features.md §2](features.md#expo-go-caveat))
- Reanimated v4 + gesture-handler to work for the venue swipe deck on the device
- Background location (item #6)
- Real-world testing with people who don't run your local dev server

**How.** `eas build --profile development --platform ios`. Add an `eas.json` if not present. Install on test devices via TestFlight or direct install.

**Files.** `eas.json` (new), `app.json` may need updates to bundle ID / signing config.

### 12. Privacy policy + terms of service
**Why.** App Store and Play Store require both. Especially load-bearing because Hangout handles real-time location.

**Approach.** Use a generator (e.g., termly.io, iubenda) — get a real lawyer review if/when this monetizes. Host the pages somewhere stable (a GitHub Pages site is fine for v1) and link from the app's profile/settings screen.

**Files.** `app/(tabs)/profile.tsx` (links), no schema changes.

### 13. Delete account flow
**Why.** Apple's App Store guidelines (5.1.1.v) require this for any app with account signup. Play Store has similar requirements.

**Fix.** In profile, a "Delete account" button with a 2-step confirmation. Calls a new edge function `delete-account` that:
1. Calls `admin.auth.deleteUser()` (Supabase admin API)
2. Cascades clean up `users` row → cascades clean up plan_members, location data, etc. via FK cascades

**Files.** `app/(tabs)/profile.tsx`, `supabase/functions/delete-account/index.ts` (new).

**Gotcha.** Make sure cascade deletes really do clean everything — the `plans` cascade list is verified in [database.md "Cascade behaviour"](database.md#cascade-behaviour) but `users` cascade behaviour also matters. Be careful with `plans` rows where the deleted user is `creator_user_id` — there's no `on delete cascade` defined on that column, so an orphaned plan with no creator might result.

### 14. Analytics wiring
**Problem.** `analytics_events` table exists in the schema but nothing writes to it.

**Fix.** Hook up these events to the existing table:
- `plan_created`
- `venue_locked` (with `selection_type` as a prop)
- `venue_suggested`
- `plan_activated`
- `location_sharing_started`
- `chat_message_sent`
- `voting_reopened`
- `plan_completed` / `plan_cancelled`

Write a thin client helper `lib/analytics.ts` with `track(event_name, properties)` that just does an insert. No third-party tool needed yet.

**Files.** `lib/analytics.ts` (new), small additions in handlers across `app/`.

### 15. App Store / Play Store submission
**Why.** `docs/publishing.md` walks through the process but you haven't actually done it.

**Prereqs.** Items #11, #12, #13 above. Apple Developer account ($99/yr), Play Console account ($25 one-time).

**Process.** EAS Submit handles most of it (`eas submit --platform ios`).

---

## Future swings (the bigger stuff)

### 16. In-app friend graph
**Problem.** No concept of "friends" outside per-plan invites. Every plan requires a fresh share-link, even if you hang out with the same crew weekly.

**Fix.** New `friends` table (`user_id`, `friend_user_id`, `created_at`, `status: pending|accepted`). Friend request UI in profile. Then `app/plan/[id]/invite.tsx` can show friends as one-tap-to-add tiles.

**Tradeoff.** Adds significant social-network surface area (privacy, blocking, request management). Worth it only if the per-plan invite friction is actually slowing people down — validate before building.

### 17. Photo uploads in chat
**Problem.** `plan_messages` only supports text (`message_type='text'` is the default).

**Fix.** Supabase Storage bucket `plan_media`, RLS gated on plan membership. `expo-image-picker` in chat input. New `message_type='image'` with the URL in `body` (or a new `media_url` column).

**Files.** Migration, `app/plan/[id]/chat.tsx`, possibly a `MessageMedia` component.

### 18. Plan templates / "redo this hangout"
**Problem.** No way to re-use a past plan setup.

**Fix.** "Plan another with this crew" CTA on the DONE state already exists in the UI but isn't wired up. Hook it to: create a new plan with same title pattern, same vibe, prefill members.

**Files.** `app/plan/[id]/index.tsx` (DONE state action), helper to clone plan + members.

### 19. iMessage extension / WhatsApp share card
**Why.** The network-effect cliff — getting friend group #2 to install the app — is the single biggest adoption blocker (see the product spec's "Honest concerns"). An iMessage extension that lets friends RSVP without installing the standalone app would meaningfully lower the friction.

**Approach.** iOS iMessage extension is its own Xcode target. Would require ejecting from managed Expo or significant config. Big lift. Lower priority until product-market fit is more validated.

---

## Notes for the agent picking this up

- Always check `docs/database.md` for current schema before assuming column names. The repo iterates fast and migrations land often.
- `docs/features.md` has end-to-end flow walkthroughs that are usually the fastest way to understand how a feature actually works.
- Push to `main` is the workflow — small commits, no PR ceremony for solo work.
- Run `npx tsc --noEmit` before committing. Two pre-existing TS errors are known and OK to ignore: `app/plan/[id]/index.tsx` Label children (number→string) and shadowColor duplicate on the LIVE state status row.
- Realtime subs in Supabase don't always fire for the user's own writes — every mutating handler in the codebase explicitly calls `fetchAll()` (or the equivalent refetch) after the await. Don't rely on realtime alone.
- Expo Go limitations to remember: Reanimated v4 + gesture-handler need a dev build, custom URL schemes (`hangout://`) don't work, background location doesn't work.
