# Claude Design Handoff

## What this app is

Pull Up is a social planning app — create a plan, invite friends, swipe on venues (Tinder-style), lock a destination, share ETAs, and group chat. Built with Expo SDK 54 + React Native + Supabase.

## Design system (current)

All design tokens live in `constants/index.ts`:

```
Colors:
  primary:       #5B4FE9  (indigo — brand color)
  primaryLight:  #EAE8FD  (tinted backgrounds, selected chips)
  surface:       #FFFFFF  (cards, modals)
  background:    #F5F5F7  (page bg)
  text:          #1A1A1A  (primary text)
  textSecondary: #6B7280  (labels, hints)
  border:        #E5E7EB  (dividers, input borders)
  success:       #10B981  (green — arrived, open)
  warning:       #F59E0B  (amber — on the way)
  error:         #EF4444  (red — cancel, closed, danger)

Spacing: xs=4, sm=8, md=16, lg=24, xl=32, xxl=48
Font sizes: xs=11, sm=13, md=15, lg=17, xl=20, xxl=28, display=36
Border radius: inputs=12, cards=16, venue cards=20, chips=20, buttons=12-14
```

No icon library is installed — back buttons use `<-` text, the FAB uses `+` text, tab bar has no icons. No custom fonts.

---

## Screen inventory (13 screens)

### 1. Login — `app/(auth)/login.tsx`
- Email/password form with sign in / create account toggle tabs
- "pull up" wordmark at top, tagline below
- **Issues**: No social auth buttons, no forgot-password flow, hardcoded test credentials as defaults

### 2. OTP Verify — `app/(auth)/verify.tsx`
- 6-digit OTP input with large spaced characters
- Resend code link
- Currently only reachable via phone auth (email flow skips this)

### 3. Plans List (Home) — `app/(tabs)/index.tsx`
- Sectioned list: Active → Upcoming → Past
- Each plan card: title, date, state badge, venue name
- FAB bottom-right for creating new plan
- Empty state when no plans
- **Issues**: Cards are minimal — no member avatars, no vibe indicator, no preview image

### 4. Profile — `app/(tabs)/profile.tsx`
- Letter avatar (first initial in circle)
- Editable display name (inline edit with save/cancel)
- Read-only email, optional phone
- "Member since" date
- Sign out button (clears push token)
- **Issues**: No profile photo upload, no theme toggle, no notification preferences

### 5. Create Plan — `app/plan/create.tsx`
- Title input (large, underlined)
- Vibe chips: Food, Drinks, Party, Movie, Coffee, Gaming, Active
- Optional date (YYYY-MM-DD) + time (HH:MM) text inputs
- Cancel / Create header buttons
- **Issues**: Date/time are raw text inputs — no date picker. No travel mode selector (defaults to drive)

### 6. Edit Plan — `app/plan/[id]/edit.tsx`
- Same form layout as Create, pre-filled with current values
- "Clear date & time" option
- Cancel / Save header
- Host only

### 7. Plan Detail — `app/plan/[id]/index.tsx`
- Header: back arrow, title, date, state badge
- Venue section: destination name or "Browse & vote on venues" button
- Arrival time: display + host-only set/edit (HH:MM text input)
- Departure status panel (active plans only): "I'm leaving" / "I've arrived" button, grouped member lists (Arrived / On the way / Not left yet)
- Members list: avatar initial + name + role
- Actions: Edit plan (host), Invite friends, Pick a venue, Group chat, Share ETA, Start/End/Cancel plan (host)
- Terminal state banner for completed/cancelled
- **Issues**: Dense — lots of sections stacked vertically. Venue section is plain text. No vibe/category shown.

### 8. Venue Swipe — `app/plan/[id]/venues.tsx`
- Tinder-style card with hero photo (220px), name, category, address
- Meta chips: ETA, rating + count, price level ($-$$$$), open/closed
- Card actions: "Open in Maps" + "Lock this in"
- Swipe buttons: Pass (red) / Like (green)
- Counter in header: "3/20"
- Placeholder initial when no photo
- Done state: "All done swiping!" with start-over option
- **Issues**: No swipe gesture animation — just tap buttons. No photo carousel (only shows first photo, up to 5 are available). Cards don't stack visually.

### 9. Group Chat — `app/plan/[id]/chat.tsx`
- Standard chat layout: messages list + input bar
- My messages: indigo bubble, right-aligned
- Their messages: white bubble, left-aligned, sender name above
- Timestamps on each bubble
- Send button with disabled state
- Realtime via Supabase postgres_changes
- **Issues**: No read receipts, no typing indicator, no image/link previews

### 10. ETA Dashboard — `app/plan/[id]/eta.tsx`
- Map at top (~38% height) when venue or member locations exist: red pin for venue, colored pins per member, legend below map, re-center button
- Consent card: "Share your ETA" with privacy explanation + button
- Sharing banner (green): "Sharing your location" + Stop button
- ETA list: ranked by time, showing avatar, name, mode, distance, duration, last-computed time
- Empty state when no one is sharing
- **Issues**: No custom map markers (uses default pins). Member locations update on distance/time intervals, not continuous.

### 11. Join Plan — `app/join/[token].tsx`
- Loading spinner → auto-redirects to plan detail on success
- Error state: "Couldn't join" message + "Go home" button
- Handles expired/invalid/already-used invites

### 12. Tab Bar — `app/(tabs)/_layout.tsx`
- Two tabs: Plans, Profile
- Text-only labels — no icons
- Uses default Expo Router tab bar

### 13. Plan Layout — `app/plan/[id]/_layout.tsx`
- Stack navigator wrapping: index, venues, eta, chat, edit
- All headers hidden (screens render their own)

---

## What needs design love

### High priority
- **Tab bar icons** — currently text-only, needs proper icons (could use `@expo/vector-icons` or SVGs)
- **Venue swipe gestures** — real drag/fling animation instead of tap buttons, card stack visual
- **Venue photo carousel** — `photo_urls` has up to 5 images, only first is shown
- **Plan cards on home** — show member count/avatars, vibe chip, maybe venue photo if locked
- **Date/time picker** — replace raw YYYY-MM-DD / HH:MM text inputs with native date pickers

### Medium priority
- **Custom map markers** — replace default pins with avatar-initial markers matching the app's style
- **Empty states** — all empty states are minimal text, could use illustrations
- **Transitions/animations** — no screen transitions, no loading skeletons, no micro-interactions
- **Back button** — `<-` text everywhere, should be a proper chevron icon
- **Typography** — no custom font loaded, using system defaults

### Nice to have
- **Dark mode** — constants are set up for it but no theme switching
- **Haptics** — swipe actions, button presses
- **Profile photo** — avatar is always a letter initial
- **Onboarding flow** — first-time user walkthrough
- **Pull-to-refresh** — plan list and ETA list don't have it

---

## File structure for design work

```
app/
├── (auth)/
│   ├── login.tsx          # sign in / sign up
│   └── verify.tsx         # OTP verification
├── (tabs)/
│   ├── _layout.tsx        # tab bar config
│   ├── index.tsx          # plans list (home)
│   └── profile.tsx        # user profile
├── join/
│   └── [token].tsx        # invite redemption
├── plan/
│   ├── create.tsx         # new plan form
│   └── [id]/
│       ├── _layout.tsx    # stack nav
│       ├── index.tsx      # plan detail
│       ├── edit.tsx       # edit plan form
│       ├── venues.tsx     # venue swipe cards
│       ├── chat.tsx       # group chat
│       └── eta.tsx        # ETA map + list
├── _layout.tsx            # root layout (auth guard, notifications)
constants/
└── index.ts               # COLORS, SPACING, FONT_SIZE, thresholds
```

---

## Data available but not yet rendered

- **Venue photos**: `photo_urls` array has up to 5 URLs per venue — only index 0 is shown
- **Venue website**: `website_url` is stored but not displayed on the card
- **Plan vibe**: stored on the plan but not shown on home list cards or plan detail header
- **Member count**: available from plan_members but not shown on home list cards
- **Travel mode**: `travel_mode_default` (drive/walk) exists but isn't selectable in create/edit forms
