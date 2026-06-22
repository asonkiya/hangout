---
layout: default
title: Privacy Policy
permalink: /privacy-policy
---

# Privacy Policy

**Last updated: 2026-06-21**

This Privacy Policy describes how Pull Up ("we", "us", "the app") collects, uses, and shares information about you when you use the Pull Up mobile app.

If you have questions about this policy, contact: **kamehamehaa0@gmail.com**.

---

## 1. What we collect

| Type | Examples | Why |
|---|---|---|
| Account information | Email address, display name | Authentication, identifying you to plan members |
| Push notification token | Anonymous device identifier issued by Apple/Google via Expo | Sending you notifications about your plans |
| Location data | GPS coordinates while you're actively sharing your ETA for a plan | Showing your position on the group's live map; computing ETAs to the meetup spot |
| Plan content | Plan titles, vibes, scheduled times, venue selections, chat messages | Core app functionality |
| Venue activity | Which venues you swipe right/left on; which you suggest | Group voting and venue recommendation |

We do **not** collect: contacts, photos, microphone access, advertising identifiers, device sensor data beyond GPS, or any data when the app is closed.

## 2. How we use it

- **App functionality**: every piece of data we collect is used to deliver the app's core features (plan coordination, venue voting, live ETA tracking, group chat).
- **Communication**: push notifications about plan events you've opted into (member joined, venue locked, plan starting, friend arrived, new chat message).
- **No advertising, no profiling, no resale.** We do not sell your data to third parties. We do not use it for advertising or profiling.

## 3. Location sharing — special rules

Location sharing is **opt-in per plan** and works as follows:

- You must explicitly tap "Share ETA for this plan" and grant foreground location permission for each plan
- Sharing is **foreground only** — when you close or background the app, no new location data is uploaded
- Sessions auto-expire after **4 hours**
- You can stop sharing at any time from the ETA screen
- Your location is only visible to other members of the same plan, and only while your session is active
- We never share your location outside the app or with third parties

## 4. Third parties we use

| Service | What they handle | Privacy policy |
|---|---|---|
| **Supabase** (database, auth, edge functions) | Stores all app data; processes authentication | [supabase.com/privacy](https://supabase.com/privacy) |
| **Google Maps Platform** (Places, Routes APIs) | Returns nearby venue suggestions; computes driving/walking ETAs from your location to venues | [policies.google.com/privacy](https://policies.google.com/privacy) |
| **Expo Push Notifications** | Delivers push notifications to your device | [expo.dev/privacy](https://expo.dev/privacy) |
| **Apple Push Notification Service / Google Firebase Cloud Messaging** | Underlying delivery of notifications | Apple / Google policies above |

We do not use third-party analytics services, advertising SDKs, or trackers.

## 5. Data retention

| Data | Retention |
|---|---|
| Account profile | Until you delete your account |
| Plans and chat messages | Until you delete your account (cascades remove all plans you created) |
| Location points | Cleared when their session ends (sessions auto-expire after 4 hours) |
| ETA snapshots | Until the parent plan is deleted |
| Push tokens | Automatically cleared if our system detects you've uninstalled the app |

## 6. Deleting your account

You can delete your account at any time from the Profile tab in the app:

1. Open the Profile tab
2. Scroll to "Delete account"
3. Confirm in the two follow-up dialogs

Account deletion permanently removes:
- Your account credentials
- All plans you created (including all members' messages and votes within them)
- Your messages in plans you joined
- All your location history
- Your push notification token

This action **cannot be undone** and takes effect immediately. Plans where you were only a member (not the creator) will continue to exist for the other members; your contributions to them are removed.

## 7. Children

Pull Up is not directed at children under 13 and we do not knowingly collect data from children under 13. If you believe we have, contact us and we will delete it.

## 8. Your rights

Depending on your jurisdiction (e.g. EU/UK GDPR, California CCPA), you may have rights to:
- Access the data we hold about you
- Correct inaccurate data
- Delete your data (see Section 6)
- Object to or restrict processing
- Data portability

To exercise any of these rights, email **kamehamehaa0@gmail.com**.

## 9. Security

We use industry-standard security practices:
- All data transmitted between the app and our servers is encrypted in transit (HTTPS/TLS)
- Database access is gated by Row Level Security policies
- Authentication tokens are stored in the device's secure enclave (iOS Keychain / Android Keystore)
- No raw passwords are stored on our servers (we use Supabase Auth's hashed password storage)

We cannot guarantee absolute security. If you suspect your account has been compromised, change your password and email us.

## 10. International users

The app's servers (Supabase) are located in the United States. By using the app, you consent to your data being transferred to and processed in the US.

## 11. Changes to this policy

We may update this policy as the app evolves. Material changes will be communicated via an in-app notice or push notification. Continued use of the app after a change constitutes acceptance.

## 12. Contact

For questions, data requests, or concerns about this policy:

**kamehamehaa0@gmail.com**
