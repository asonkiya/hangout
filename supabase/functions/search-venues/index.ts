import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')!;

const VIBE_TO_TYPES: Record<string, string[]> = {
  Food: ['restaurant'],
  Drinks: ['bar'],
  Coffee: ['cafe'],
  Movie: ['movie_theater'],
  Gaming: ['amusement_center', 'bowling_alley'],
  Active: ['gym', 'sports_club'],
  Party: ['night_club', 'bar'],
};

const FALLBACK_TYPES = ['restaurant', 'bar', 'cafe'];

const PRICE_LEVEL_MAP: Record<string, number | null> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
  PRICE_LEVEL_UNSPECIFIED: null,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
  }

  // Authenticate
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  // Parse body
  let plan_id: string;
  try {
    ({ plan_id } = await req.json());
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // Fetch plan
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: plan, error: planError } = await adminClient
    .from('plans')
    .select('anchor_lat, anchor_lng, vibe, travel_mode_default')
    .eq('id', plan_id)
    .single();

  if (planError || !plan) return new Response('Plan not found', { status: 404 });

  const { anchor_lat, anchor_lng, vibe, travel_mode_default } = plan;
  if (anchor_lat == null || anchor_lng == null) {
    return new Response(JSON.stringify({ inserted: 0, reason: 'no anchor set' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const includedTypes = (vibe && VIBE_TO_TYPES[vibe]) ?? FALLBACK_TYPES;

  // 1. Google Places Nearby Search
  const placesRes = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.priceLevel,places.primaryTypeDisplayName,places.photos,places.shortFormattedAddress,places.websiteUri,places.googleMapsUri,places.currentOpeningHours',
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: anchor_lat, longitude: anchor_lng },
          radius: 2000.0,
        },
      },
    }),
  });

  if (!placesRes.ok) {
    const txt = await placesRes.text();
    return new Response(`Places API error: ${txt}`, { status: 502 });
  }

  const placesData = await placesRes.json();
  const places: Array<Record<string, unknown>> = placesData.places ?? [];

  if (places.length === 0) {
    return new Response(JSON.stringify({ inserted: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Routes API — compute travel time from anchor to each venue
  const travelMode = travel_mode_default === 'walk' ? 'WALK' : 'DRIVE';
  const routesRes = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,status',
    },
    body: JSON.stringify({
      origins: [{
        waypoint: { location: { latLng: { latitude: anchor_lat, longitude: anchor_lng } } },
      }],
      destinations: places.map((p) => ({
        waypoint: {
          location: {
            latLng: {
              latitude: (p.location as { latitude: number }).latitude,
              longitude: (p.location as { longitude: number }).longitude,
            },
          },
        },
      })),
      travelMode,
      routingPreference: travelMode === 'DRIVE' ? 'TRAFFIC_AWARE' : undefined,
    }),
  });

  // Build destinationIndex → eta_seconds map (Routes API may fail gracefully)
  const etaMap = new Map<number, number>();
  if (routesRes.ok) {
    const routesData: Array<{ originIndex: number; destinationIndex: number; duration?: string; status?: { code: number } }> = await routesRes.json();
    for (const element of routesData) {
      if (element.duration && (!element.status || element.status.code === 0)) {
        // duration is "123s" — parseInt stops at non-digit
        etaMap.set(element.destinationIndex, parseInt(element.duration));
      }
    }
  }

  // 3. Build rows with eta + rich data, sort by it
  const rows = places.map((place, i) => {
    const photos = place.photos as Array<{ name: string }> | undefined;
    const photoUrls = photos
      ?.slice(0, 5)
      .map((p) => `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=800&key=${GOOGLE_MAPS_API_KEY}`)
      ?? null;

    const openingHours = place.currentOpeningHours as { openNow?: boolean } | undefined;

    return {
      plan_id,
      google_place_id: place.id as string,
      name: (place.displayName as { text: string })?.text ?? 'Unknown',
      lat: (place.location as { latitude: number })?.latitude,
      lng: (place.location as { longitude: number })?.longitude,
      rating: typeof place.rating === 'number' ? place.rating : null,
      user_rating_count: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
      price_level: PRICE_LEVEL_MAP[place.priceLevel as string] ?? null,
      category: (place.primaryTypeDisplayName as { text: string } | null)?.text ?? null,
      source: 'nearby_search',
      eta_seconds: etaMap.get(i) ?? null,
      photo_urls: photoUrls,
      address: (place.shortFormattedAddress as string) ?? null,
      website_url: (place.websiteUri as string) ?? null,
      maps_url: (place.googleMapsUri as string) ?? null,
      is_open: openingHours?.openNow ?? null,
    };
  });

  // Sort by ETA (nulls last)
  rows.sort((a, b) => {
    if (a.eta_seconds == null && b.eta_seconds == null) return 0;
    if (a.eta_seconds == null) return 1;
    if (b.eta_seconds == null) return -1;
    return a.eta_seconds - b.eta_seconds;
  });

  const { data, error: upsertError } = await adminClient
    .from('venue_candidates')
    .upsert(rows, { onConflict: 'plan_id,google_place_id' })
    .select('id');

  if (upsertError) {
    return new Response(`DB error: ${upsertError.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ inserted: data?.length ?? 0 }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
