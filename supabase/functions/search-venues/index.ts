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
    .select('anchor_lat, anchor_lng, vibe')
    .eq('id', plan_id)
    .single();

  if (planError || !plan) return new Response('Plan not found', { status: 404 });

  const { anchor_lat, anchor_lng, vibe } = plan;
  if (anchor_lat == null || anchor_lng == null) {
    return new Response(JSON.stringify({ inserted: 0, reason: 'no anchor set' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const includedTypes = (vibe && VIBE_TO_TYPES[vibe]) ?? FALLBACK_TYPES;

  // Call Google Places Nearby Search (New)
  const placesRes = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.priceLevel,places.primaryTypeDisplayName',
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

  const rows = places.map((place) => ({
    plan_id,
    google_place_id: place.id as string,
    name: (place.displayName as { text: string })?.text ?? 'Unknown',
    lat: (place.location as { latitude: number })?.latitude,
    lng: (place.location as { longitude: number })?.longitude,
    rating: typeof place.rating === 'number' ? place.rating : null,
    price_level: PRICE_LEVEL_MAP[place.priceLevel as string] ?? null,
    category: (place.primaryTypeDisplayName as { text: string } | null)?.text ?? null,
    source: 'nearby_search',
  }));

  if (rows.length === 0) {
    return new Response(JSON.stringify({ inserted: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
