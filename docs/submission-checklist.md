# Submission Checklist

A tactical, in-order guide for getting Pull Up into TestFlight and Google Play Internal Testing, then to public release. This is concrete: do these things in this order. See [publishing.md](publishing.md) for the broader reference doc.

**Project metadata to know:**
- Bundle ID / Package: `com.pullup.app`
- App name: Pull Up
- Slug: `pullup`
- Expo project ID: `3cc02532-191c-4caa-a79b-9dbda688cd9d` (already in `app.json`)
- Privacy policy URL: `https://asonkiya.github.io/pullup/privacy-policy` (live once GH Pages is enabled — see Step 2)
- Contact email: `kamehamehaa0@gmail.com`

---

## Phase 0 — While accounts are pending (parallel)

### Step 1. Enroll in dev accounts

- [ ] **Apple Developer Program** ($99/yr) — [enroll](https://developer.apple.com/programs/enroll/). Approval takes 24–48h; sometimes Apple requests ID verification. Use a personal Apple ID unless you have an entity (LLC, etc.) for organizational enrollment.
- [ ] **Google Play Console** ($25 one-time) — [register](https://play.google.com/console/signup). Identity verification can take 1–3 days.

While waiting, do the rest of Phase 0.

### Step 2. Enable GitHub Pages for the privacy policy

The privacy policy lives at `docs/privacy-policy.md`. To serve it:

- [ ] Go to GitHub → `asonkiya/pullup` (rename the repo from `hangout` first if you haven't) → **Settings → Pages**
- [ ] Source: **Deploy from a branch**
- [ ] Branch: `main`, folder: `/docs`
- [ ] Save
- [ ] Wait ~1 min, then verify: `https://asonkiya.github.io/pullup/privacy-policy` should render the markdown

If the URL ends up different (e.g., the username is different), update:
- `app/(auth)/login.tsx` (the "privacy policy" link in the consent text)
- `app/(tabs)/profile.tsx` (the `openPrivacy()` function)

### Step 3. Generate app assets

Already in repo:
- ✅ `assets/icon.png` (1024×1024)
- ✅ `assets/android-icon-foreground.png` + background + monochrome
- ✅ `assets/splash-icon.png`

Still needed:
- [ ] **Splash screen** (`assets/splash.png`, 1284×2778 PNG) — currently only `splash-icon.png` exists. Either keep using the icon (Expo will fall back) or design a proper splash.
- [ ] **App Store screenshots** — minimum 3 per size:
  - iPhone 6.7" (1290×2796) — required
  - iPhone 6.5" (1284×2778) — required if your screens look different on this aspect
- [ ] **Play Store screenshots** — minimum 2 phone (1080×1920+)
- [ ] **Play Store feature graphic** (`1024×500` PNG)

Easiest path: run `npx expo start` on iOS Simulator with an iPhone 15 Pro Max, take screenshots with `Cmd+S` on each major screen (home with a plan, swipe deck, plan detail LIVE state with the map). Drop them in a new `store-assets/` folder (gitignored, you'll upload to App Store Connect / Play Console directly).

### Step 4. Sanity check production app config

- [ ] `app.json` — verify:
  - `version` is `1.0.0` ✅
  - `ios.bundleIdentifier` is `com.pullup.app` ✅
  - `ios.buildNumber` is `1` ✅
  - `ios.infoPlist.NSLocationWhenInUseUsageDescription` exists ✅
  - `android.package` is `com.pullup.app` ✅
  - `android.versionCode` is `1` ✅

- [ ] Test the production build runs cleanly:
  ```bash
  npx expo start --no-dev --minify
  ```
  Scan with Expo Go and do a quick smoke test. Production-style builds catch issues like missing env vars that dev mode hides.

---

## Phase 1 — Once Apple Developer is approved

### Step 5. Link EAS to Apple

```bash
eas login
eas credentials
```

When prompted, sign in with your Apple ID. Pick the iOS bundle ID `com.pullup.app`. EAS will generate provisioning profiles and certificates automatically.

### Step 6. Update `eas.json` submit config

Replace the placeholder `submit.production.ios` block in `eas.json`:

```jsonc
"submit": {
  "production": {
    "ios": {
      "appleId": "<your Apple ID email>",
      "ascAppId": "<your App Store Connect App ID — get this after step 7>",
      "appleTeamId": "<your Apple Team ID from developer.apple.com/account>"
    }
  }
}
```

### Step 7. Create the app in App Store Connect

- [ ] Sign into [App Store Connect](https://appstoreconnect.apple.com/)
- [ ] **Apps → +** → New App:
  - Platform: iOS
  - Name: **Pull Up**
  - Primary language: English (U.S.)
  - Bundle ID: `com.pullup.app` (must match `app.json`)
  - SKU: `pullup-1` (any unique string, internal only)
- [ ] Copy the ASC App ID (numeric, visible in the URL after creation) → paste into `eas.json` `ascAppId`

### Step 8. Build for iOS

```bash
eas build --platform ios --profile production
```

Takes ~15-25 min. EAS will email you when done; or watch the link they print. The artifact is an `.ipa`.

### Step 9. Submit to TestFlight

```bash
eas submit --platform ios --profile production
```

EAS uploads the `.ipa` to App Store Connect. TestFlight processing takes ~10-30 min after upload. Apple does a brief "TestFlight review" (usually 24h, not full App Store review) before testers can install.

### Step 10. Add TestFlight testers

In App Store Connect → your app → **TestFlight** tab:

- [ ] Add internal testers via email (up to 100; immediate access once TestFlight review passes)
- [ ] Add your own email, your friend's email, anyone else you want testing

Testers download TestFlight from the App Store, then install Pull Up from there.

---

## Phase 2 — Once Google Play Console is approved

### Step 11. Create the app in Play Console

- [ ] Sign into [Google Play Console](https://play.google.com/console/)
- [ ] **Create app**:
  - App name: Pull Up
  - Default language: English (United States)
  - App or game: App
  - Free or paid: Free
- [ ] Accept the developer policies

### Step 12. Create a service account for EAS submit

- [ ] Go to Play Console → **Setup → API access**
- [ ] Click "Create new service account" (opens Google Cloud Console)
- [ ] Create a service account, grant it access to the Play Developer API
- [ ] Generate a JSON key, download it
- [ ] Back in Play Console, grant the service account "Release manager" permissions for your app
- [ ] Save the JSON key as `google-play-service-account.json` in the project root (it's already in `.gitignore` for `.env*` patterns; double-check)

### Step 13. Update `eas.json` Android submit config

```jsonc
"submit": {
  "production": {
    "ios": { ... },
    "android": {
      "serviceAccountKeyPath": "./google-play-service-account.json",
      "track": "internal"
    }
  }
}
```

(Use `track: "internal"` for first submission so it goes to Internal Testing, not public.)

### Step 14. Build for Android

```bash
eas build --platform android --profile production
```

Takes ~10-20 min. Produces an `.aab`.

### Step 15. Initial Play Console setup (required before any submission)

Before EAS submit can push the AAB, Play Console requires some app info to be filled in. In Play Console:

- [ ] **Set up your app** checklist:
  - [ ] App access — "All functionality is available without special access" (or provide test credentials if needed)
  - [ ] Ads — declare whether app contains ads (Pull Up: no)
  - [ ] Content rating — fill out the IARC questionnaire (likely Everyone or Teen)
  - [ ] Target audience — pick age range (probably 13+ given location features)
  - [ ] News app — no
  - [ ] COVID-19 contact tracing — no
  - [ ] Data safety — declare:
    - **Location**: collected, not shared with third parties, "Required for core functionality", encrypted in transit, users can request deletion
    - **Email**: collected, used for account management
    - **Name**: collected, displayed to other users in plans
    - **Device IDs**: push tokens, used for messaging
  - [ ] Government apps — no
  - [ ] Privacy policy — paste `https://asonkiya.github.io/pullup/privacy-policy`

- [ ] **Store listing**:
  - Short description (80 chars): "Plan meetups, pick venues, and track who's on the way"
  - Full description (4000 chars): Use the product spec we wrote earlier
  - Upload phone screenshots (min 2)
  - Upload feature graphic (1024×500)

### Step 16. Submit to Play Internal Testing

```bash
eas submit --platform android --profile production
```

The AAB goes to Internal Testing track. In Play Console → **Testing → Internal testing**:

- [ ] Create a release if not auto-created
- [ ] Roll out to internal testing
- [ ] **Testers** tab → create email list → add yourself, your friend, etc.
- [ ] Share the opt-in URL with testers

Internal testing builds are available within minutes (no review).

---

## Phase 3 — Public launch

### Step 17. iOS App Store submission

In App Store Connect:

- [ ] **App Information**:
  - Category: Social Networking
  - Content rights: "Does not contain third-party content"
  - Age rating: Fill out the questionnaire (likely 12+ for the location/social features)
  - Privacy Policy URL: `https://asonkiya.github.io/pullup/privacy-policy`

- [ ] **Pricing and Availability**: Free, all territories (or pick specific countries)

- [ ] **App Privacy** (nutrition labels) — declare:
  - Contact info → email → Used for app functionality, linked to user
  - Location → precise location → Used for app functionality, linked to user
  - User content → photos OR text (chat messages) → Used for app functionality
  - Identifiers → User ID → Used for app functionality, linked to user

- [ ] **Prepare for Submission** (the version page):
  - What's new: "Initial release"
  - Screenshots: upload the ones from Step 3
  - Description, keywords, support URL, marketing URL
  - **Build**: select the build from TestFlight (only available after a successful TestFlight upload + processing)

- [ ] **App Review Information**:
  - Sign-in: provide test credentials (create a dedicated `appstore-review@yourdomain.com` account or reuse `dev@pullup.app`)
  - Notes: "Sign in with provided credentials → tap + to create a plan → name it → swipe through venues → 60% group consensus auto-locks the venue → 'Start plan' → 'Share ETA' → see the live map."

- [ ] **Submit for Review** — Apple's review typically takes 24-48h for first submissions, sometimes up to a week.

### Step 18. Google Play production submission

In Play Console → **Production**:

- [ ] Create a new release (or promote the internal testing release)
- [ ] Same AAB you used for internal can be promoted
- [ ] Add release notes
- [ ] Roll out — Google review usually 1-3 days for new apps

---

## Common rejection reasons (and how to avoid them)

| Reason | Prevention |
|---|---|
| Vague permission strings | Already addressed — `NSLocationWhenInUseUsageDescription` explains the exact use |
| Login issues during review | Provide credentials in review notes; test the production build before submitting |
| Privacy policy missing or unreachable | Test the URL before submitting; make sure GH Pages is live |
| Missing account deletion (Apple 5.1.1.v) | Already addressed — Profile tab → Delete account |
| Crashes on launch | Test the production-built `.ipa` via TestFlight before public submission |
| "App is incomplete" | Make sure every visible button works; no placeholder screens |
| Location permission without justification | Already addressed — the rationale string explains it's per-plan, foreground only |

---

## After launch — OTA updates

For JS-only changes (no native modules, no `app.json` changes), push hotfixes without a new store review:

```bash
eas update --branch production --message "Fix chat scroll bug"
```

For native changes (new SDK packages, permission changes, `app.json` updates), you need a new build and resubmission. The version-bumping flow:

```bash
# bump app.json `version` (user-visible string like "1.0.1")
# `buildNumber` (iOS) and `versionCode` (Android) auto-increment via eas.json
eas build --platform all --profile production
eas submit --platform all --profile production
```

---

## Timeline estimate (realistic)

| Phase | Time |
|---|---|
| Apple Developer enrollment | 1–2 days |
| Play Console verification | 1–3 days |
| Asset preparation (screenshots, splash, feature graphic) | 4–8 hours |
| EAS config + first iOS build | 1–2 hours |
| EAS config + first Android build | 1–2 hours |
| TestFlight review for first build | 24h |
| Internal Testing track for first build | Minutes |
| Beta testing window | 3–7 days (your choice) |
| App Store review (first submission) | 1–7 days (usually 1–3) |
| Play Store review (first submission) | 1–3 days |
| **Total wall-clock** | **~2-3 weeks from today** |

---

## What's already done in the code

These submission prerequisites are already shipped — you don't need to do anything for them:

- ✅ `app.json` permission rationale strings (`NSLocationWhenInUseUsageDescription`)
- ✅ `app.json` buildNumber / versionCode set
- ✅ EAS project ID configured
- ✅ `eas.json` with development / preview / production profiles
- ✅ Delete account flow (Profile tab → Delete account → 2-step confirm → `delete-account` edge function)
- ✅ Privacy policy (`docs/privacy-policy.md`, ready to serve via GH Pages)
- ✅ Privacy disclosure on signup form
- ✅ Privacy policy link in Profile screen
- ✅ `delete-account` edge function deployed
