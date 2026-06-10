import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')!;

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

  let plan_id: string;
  try {
    ({ plan_id } = await req.json());
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch plan
  const { data: plan, error: planError } = await adminClient
    .from('plans')
    .select('selected_place_id, travel_mode_default')
    .eq('id', plan_id)
    .single();

  if (planError || !plan) return new Response('Plan not found', { status: 404 });
  if (!plan.selected_place_id) {
    return new Response(JSON.stringify({ computed: 0, reason: 'no destination set' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch active location share sessions for this plan
  const { data: sessions } = await adminClient
    .from('location_share_sessions')
    .select('id, user_id')
    .eq('plan_id', plan_id)
    .eq('status', 'active');

  if (!sessions || sessions.length === 0) {
    return new Response(JSON.stringify({ computed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch latest location point per session
  const origins: Array<{ user_id: string; lat: number; lng: number }> = [];
  for (const session of sessions) {
    const { data: point } = await adminClient
      .from('location_points')
      .select('lat, lng, user_id')
      .eq('session_id', session.id)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (point) {
      origins.push({ user_id: session.user_id, lat: point.lat, lng: point.lng });
    }
  }

  if (origins.length === 0) {
    return new Response(JSON.stringify({ computed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Call Google Routes API — Compute Route Matrix
  const travelMode = plan.travel_mode_default === 'walk' ? 'WALK' : 'DRIVE';
  const routesRes = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,status',
    },
    body: JSON.stringify({
      origins: origins.map((o) => ({
        waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lng } } },
      })),
      destinations: [
        { waypoint: { placeId: plan.selected_place_id } },
      ],
      travelMode,
      routingPreference: travelMode === 'DRIVE' ? 'TRAFFIC_AWARE' : 'ROUTING_PREFERENCE_UNSPECIFIED',
    }),
  });

  if (!routesRes.ok) {
    const txt = await routesRes.text();
    return new Response(`Routes API error: ${txt}`, { status: 502 });
  }

  const routesData = await routesRes.json();
  const elements: Array<Record<string, unknown>> = Array.isArray(routesData) ? routesData : [];

  // Upsert eta_snapshots
  const now = new Date().toISOString();
  const snapshots = elements
    .filter((el) => (el.status as { code?: number } | null)?.code == null || (el.status as { code?: number })?.code === 0)
    .map((el) => {
      const originIdx = el.originIndex as number;
      const origin = origins[originIdx];
      if (!origin) return null;
      // duration is returned as "123s" — parseInt stops at the 's'
      const durationSec = typeof el.duration === 'string' ? parseInt(el.duration as string) : null;
      return {
        plan_id,
        user_id: origin.user_id,
        destination_place_id: plan.selected_place_id,
        duration_seconds: isNaN(durationSec as number) ? null : durationSec,
        distance_meters: typeof el.distanceMeters === 'number' ? el.distanceMeters : null,
        status: 'ok',
        mode: plan.travel_mode_default,
        computed_at: now,
      };
    })
    .filter(Boolean);

  if (snapshots.length > 0) {
    await adminClient
      .from('eta_snapshots')
      .upsert(snapshots, { onConflict: 'plan_id,user_id' });
  }

  // Broadcast eta_updated so the dashboard refreshes
  await adminClient.channel(`eta-${plan_id}`).send({
    type: 'broadcast',
    event: 'eta_updated',
    payload: { plan_id },
  });

  return new Response(JSON.stringify({ computed: snapshots.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
