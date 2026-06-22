# Publishing to App Stores

Guide for submitting Hangout to the Apple App Store and Google Play Store using EAS (Expo Application Services).

---

## Prerequisites

- Node.js 18+, Expo CLI, EAS CLI (`npm install -g eas-cli`)
- An [Expo account](https://expo.dev/signup) (free)
- Apple Developer Program membership ($99/year) — [enroll here](https://developer.apple.com/programs/enroll/)
- Google Play Developer account ($25 one-time) — [register here](https://play.google.com/console/signup)

---

## 1. App Assets

Prepare these before building:

| Asset | Spec | Notes |
|---|---|---|
| App icon | 1024×1024 PNG, no transparency, no rounded corners | Apple and Google both require this. Place at `assets/icon.png` |
| Adaptive icon (Android) | 1024×1024 foreground + background | `assets/adaptive-icon.png` — Android crops this into circles/squircles |
| Splash screen | 1284×2778 PNG | `assets/splash.png` — shown during app load |
| App Store screenshots | iPhone 6.7" (1290×2796), 6.5" (1284×2778), 5.5" (1242×2208) | Minimum 3 screenshots per size. Use Simulator to capture |
| Play Store screenshots | Phone (1080×1920+), 7" tablet, 10" tablet | Minimum 2 phone screenshots |
| Feature graphic (Android) | 1024×500 PNG | Required for Play Store listing |

### Generating screenshots

```bash
# Run on iOS Simulator, take screenshots with Cmd+S
npx expo run:ios --device "iPhone 15 Pro Max"

# Run on Android emulator, take screenshots with the emulator toolbar
npx expo run:android
```

---

## 2. App Configuration

Update `app.json` (or `app.config.js`) with production values:

```jsonc
{
  "expo": {
    "name": "Hangout",
    "slug": "hangout",
    "version": "1.0.0",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "bundleIdentifier": "com.yourname.hangout",
      "buildNumber": "1",
      "supportsTablet": false,
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "Hangout uses your location to find nearby venues and share your ETA with your group.",
        "NSLocationAlwaysUsageDescription": "Hangout uses your location in the background to keep your ETA updated for your group."
      }
    },
    "android": {
      "package": "com.yourname.hangout",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE"
      ]
    }
  }
}
```

### Permission strings

Apple rejects apps with vague permission descriptions. Be specific:

- **Location**: "Hangout uses your location to find nearby venues and share your ETA with friends in your group."
- **Notifications**: "Hangout sends notifications when friends join your plan, a venue is picked, or someone is on their way."

---

## 3. EAS Build Configuration

Create or update `eas.json` in the project root:

```json
{
  "cli": {
    "version": ">= 3.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@example.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_TEAM_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "production"
      }
    }
  }
}
```

---

## 4. Build the Apps

```bash
# Log into EAS
eas login

# Build for both platforms
eas build --platform ios --profile production
eas build --platform android --profile production
```

iOS builds require an Apple Developer account linked to EAS. On first run, EAS will prompt you to authenticate and will manage provisioning profiles and certificates automatically.

Android builds produce an AAB (Android App Bundle) by default, which is what Google Play requires.

---

## 5. Apple App Store Submission

### 5a. App Store Connect setup

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Create a new app: **My Apps → + → New App**
3. Fill in:
   - Platform: iOS
   - Name: Hangout
   - Primary language: English (U.S.)
   - Bundle ID: select the one matching `app.json`
   - SKU: `hangout-v1` (any unique string)

### 5b. App information

- **Category**: Social Networking
- **Content rights**: "This app does not contain third-party content"
- **Age rating**: Fill out the questionnaire (likely 4+ or 12+ depending on content)

### 5c. Privacy policy

Apple requires a privacy policy URL. It must cover:
- What data you collect (location, email, phone, push tokens)
- How you use it (venue search, ETA sharing, notifications)
- Third parties (Google Maps API, Supabase, Expo Push Service)
- Data retention and deletion
- Contact information

Host this on a simple webpage (GitHub Pages, Notion public page, etc.).

### 5d. App privacy (nutrition labels)

In App Store Connect, declare data collection:
- **Location**: Used for app functionality (venue search, ETA)
- **Contact info (email)**: Used for app functionality (account)
- **Identifiers (user ID)**: Used for app functionality
- **Usage data**: Used for analytics (if analytics_events is used)

### 5e. Submit for review

```bash
eas submit --platform ios --profile production
```

Or upload manually via Transporter app on macOS.

### 5f. Review notes

Provide Apple with:
- A test account (email + password) that's already set up
- Brief instructions: "Sign in → Create a plan → Invite a friend → Browse venues → Chat"
- Explain location usage: "Location is used to find nearby venues and calculate ETAs between group members"

### Common rejection reasons

| Reason | Fix |
|---|---|
| Missing privacy policy | Add URL in App Store Connect |
| Vague permission strings | Rewrite to explain exactly why the app needs the permission |
| Login issues | Provide working test credentials in review notes |
| Crashes on launch | Test the production build on a real device before submitting |
| Incomplete features | Make sure all buttons/screens work, even if minimal |

---

## 6. Google Play Store Submission

### 6a. Google Play Console setup

1. Go to [Google Play Console](https://play.google.com/console/)
2. **Create app** → fill in app name, language, app/game, free/paid

### 6b. Store listing

- **Short description** (80 chars): "Plan hangouts, pick venues, and track who's on the way"
- **Full description** (4000 chars): Describe features — plan creation, venue swiping, group chat, ETA tracking
- **Screenshots**: Upload phone screenshots (minimum 2)
- **Feature graphic**: 1024×500 banner image

### 6c. Content rating

Fill out the IARC questionnaire in **Policy → App content → Content rating**. Likely rated "Everyone" or "Teen".

### 6d. Data safety

Declare in **Policy → App content → Data safety**:
- Location data: collected, not shared with third parties, required for core functionality
- Email: collected for account creation
- Name: collected for display to group members
- Device identifiers: push notification tokens

### 6e. Service account for automated submission

1. In Google Cloud Console, create a service account
2. Grant it access to Google Play Developer API
3. Download the JSON key file
4. Place it at `./google-play-service-account.json` (add to `.gitignore`)
5. In Play Console, grant the service account "Release manager" permissions

### 6f. Submit

```bash
eas submit --platform android --profile production
```

Google review typically takes 1–3 days for new apps.

---

## 7. Post-Launch

### OTA updates with expo-updates

For JS-only changes (no native module changes), push updates without a new store review:

```bash
eas update --branch production --message "Fix chat scroll bug"
```

Configure in `app.json`:
```json
{
  "expo": {
    "updates": {
      "url": "https://u.expo.dev/YOUR_PROJECT_ID"
    },
    "runtimeVersion": {
      "policy": "sdkVersion"
    }
  }
}
```

### When you need a new store build

- Adding/removing native modules (e.g., new Expo SDK packages with native code)
- Changing `app.json` values like `bundleIdentifier` or `package`
- Upgrading Expo SDK version
- Changing native permissions

### Version bumping

```bash
# Bump version for a new release
# In app.json: increment "version" (shown to users)
# EAS auto-increments buildNumber/versionCode if autoIncrement is set
eas build --platform all --profile production
```

---

## 8. Timeline Estimate

| Step | Time |
|---|---|
| Assets (icon, splash, screenshots) | 1 day |
| App Store Connect / Play Console setup | 1 day |
| Privacy policy | 1–2 hours |
| EAS build config + first build | 1–2 hours |
| Apple review | 1–7 days (usually 1–2) |
| Google review | 1–3 days |
| **Total** | **~1–2 weeks** |

First submissions may take longer due to back-and-forth with reviewers. Subsequent updates are usually reviewed within 24 hours.

---

## 9. TestFlight / Internal Testing (Recommended First)

Before going public, distribute to testers:

### iOS (TestFlight)

1. Build with `eas build --platform ios --profile production`
2. Submit with `eas submit --platform ios`
3. In App Store Connect, go to the TestFlight tab
4. Add internal testers (up to 100 via email)
5. TestFlight review takes ~1 day (less strict than App Store review)

### Android (Internal Testing)

1. Build with `eas build --platform android --profile production`
2. In Play Console, go to **Testing → Internal testing**
3. Create a release, upload the AAB
4. Add testers via email list or Google Group
5. Available within minutes (no review for internal track)

Do a TestFlight/internal round first to catch issues before the public launch.
