# Monetization

Brainstorm of revenue models that fit Pull Up's product shape, ordered by what seems highest-leverage relative to dev effort. None of this is built yet — this doc exists so we don't lose the thinking and so a future PM/founder/agent can pick up where we left off.

**Validate retention first.** Monetization on a product without users is theater. None of the below makes sense before there's evidence people return week-over-week.

---

## 1. Affiliate revenue at the "we're going there" moment ★ recommended first

The LIVE state of a plan is a unique moment: every member is verifiably about to physically arrive at a known place at a known time. This is the highest-intent moment in any local-commerce funnel — Gmaps doesn't have it, Yelp doesn't have it, dating apps don't have it.

### Sub-options

- **Reserve a table** — once a restaurant venue is locked, surface a "Book now" CTA → OpenTable / Resy / SevenRooms affiliate. Typical economics: ~$1-2 per seated cover.
- **Order a ride** — "Call an Uber/Lyft to {venue}" button in the LIVE state for any member whose `departure_status` is `not_left`. Both Uber and Lyft have public affiliate programs.
- **Order ahead** — Toast / Square Online integration so the group can pre-order drinks/food before arrival.

### Why this is the best fit

- Doesn't degrade the core UX (no ads in the swipe deck)
- Purely additive value at a high-intent moment
- No sales team required — these are SDK/API integrations
- Works pre-scale: any single user who books a table earns revenue
- Validates the "people actually go to these places" data asset

### Implementation sketch

- Affiliate links in the LOCKED state venue card and the LIVE state map overlay
- Track conversions via `analytics_events` (plus the partner's own attribution)
- Start with OpenTable since restaurant plans are the most common vibe

### Risks / unknowns

- OpenTable's affiliate program has historically required minimum traffic — verify thresholds
- Uber's deep links work but the "Pull Up earns a cut" partnership isn't automatic
- Pre-ordering only works for venues already on the partner platform

---

## 2. Venue-side sponsored placement (Gmaps Places-ads model)

Bars/restaurants pay to be inserted into the swipe deck — either with a "Sponsored" pill or via algorithmic boost in plans within their radius.

### Pricing models
- **CPC** — venue pays per right-swipe
- **CPL** — venue pays per plan that locks them in
- **Subscription** — venue pays $X/mo to appear in any plan within X-mile radius

### Why this is obvious but hard

- Need either a sales team to onboard venues directly (slow, expensive) or an existing local-ad network's inventory (rare for hyperlocal)
- Yelp tried this for years and it's a hard business — long sales cycles, churny SMB customers
- Won't work until you have ~10K+ DAU concentrated in 1-2 cities (otherwise the placements aren't worth paying for)

### Implementation sketch (when ready)

- New `venue_sponsorship` table — venue, geo, budget, status
- Adjust `search-venues` edge function to inject sponsored candidates into the result list with a `source = 'sponsored'`
- Sponsored cards get a "Promoted" pill (UX-honest, FTC-compliant)
- Cap to 1-2 per deck to preserve trust

---

## 3. Premium subscription ("Pull Up Plus")

| Free | Plus ($3-5/mo) |
|---|---|
| 3 active plans | Unlimited active plans |
| 6-person max group | 12+ person groups |
| 30-day plan history | Full archive + search |
| Standard vibes | Custom vibes, custom venue lists |
| — | "Redo this plan" templates |
| — | Location sharing on home tab without entering a specific plan |

### Honest take

Friend groups don't really subscribe. The average user makes plans 1–4×/week — that's not a daily-use product, and subs convert best on daily-use products. Realistic conversion: 1-3%. Fine for offset costs, not lights-out.

Plus, the "more plans / bigger groups" gating cuts against the core thesis (that this is the casual-decision app). Be careful not to wall off the basic flow.

### When to revisit

Once organic growth is real and there's clear "power user" cohort behavior — people who use it 3+ times/week, hit the 3-plan limit naturally, have larger groups.

---

## 4. Pull Up for venues (B2B side product)

A separate dashboard product for venues:
- Claim your listing
- See how many times your spot was swiped right vs left this month
- See when groups locked you in
- Push "happy hour starts in 30 min" notifications to users who have suggested or liked your venue in the past
- Respond to mentions in plan chats

Pricing: $50-200/mo per venue, tiered by city size or by data depth.

### Honest take

Completely different product, completely different sales motion. But B2B economics are vastly better than consumer — a single venue paying $100/mo is worth ~50 freemium users. Worth thinking about as a Year 2 play after the consumer side validates.

The interesting part: the data you'd be selling is *unique to this app*. Gmaps can't tell a venue "30 friend groups considered you tonight and 12 chose elsewhere — here's why." That's a real wedge.

---

## 5. Sponsored vibes / brand collabs

"Drinks Night presented by Aperol" — small brand logo on the Drinks vibe chip; maybe an occasional Aperol-branded venue card. Sponsorship deals at $10-50K/mo per brand.

### Honest take

Requires brand sales infrastructure, only works at meaningful scale, but high-margin and brand-friendly. Year 2+ play. The vibe categories are unusually well-suited to this (Movie → AMC, Active → Lululemon-sponsored gym suggestions, etc.) but execution requires real consumer marketing chops.

---

## 6. Last-mile commerce (out of scope for now)

- Group dinner bill-splitting via Stripe Connect → small fee per split
- Pre-paid group tabs ("everyone chips in $20 toward drinks")
- Tipping the suggester ("Sarah picked a great spot — send her $2")

Probably distractions until the core loop has product-market fit. Mentioned here so they're not forgotten.

---

## What's notable about Pull Up's monetization shape

Because every plan ends with a **known venue + known arriving group**, Pull Up has far better targeting data than Gmaps' generic Places ads.

Gmaps shows you a sponsored place when you search — but doesn't know if you went. Pull Up knows:
- Who considered each venue (swipes)
- Who chose each venue (selections)
- Who actually arrived (departure_status='arrived' + location_points)
- Who they were with (plan_members)
- Repeat behavior over time

That's a much stronger data asset for both affiliate attribution and (eventually) sponsored placement. It's the structural advantage worth leaning into — but only after you've validated retention.

---

## Order of operations (if/when monetization is on the table)

1. **Validate weekly retention** (Year 1) — no monetization until ≥30% W4 retention
2. **Ship #1 (affiliate at LIVE state)** — low effort, no UX cost, immediate revenue per user
3. **Wire `analytics_events`** to track plan → arrival conversion so you have data for partner negotiations
4. **Build #4 (venue dashboard)** once consumer side has 10K+ DAU
5. **Layer in #2 (sponsored placement) and #5 (brand collabs)** once distribution is meaningful

Don't try to do more than one of these at a time. Each adds product surface area that competes for attention with the core loop.
