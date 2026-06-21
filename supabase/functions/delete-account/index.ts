import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Re-assign or delete plans the user created.
  // FK plans.creator_user_id has no cascade — we delete plans they created
  // (cascades clean up members, candidates, messages, etc).
  const { error: deletePlansError } = await adminClient
    .from('plans')
    .delete()
    .eq('creator_user_id', user.id);
  if (deletePlansError) {
    console.error('Failed to delete plans:', deletePlansError);
    return new Response(JSON.stringify({ error: 'Failed to delete user plans' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Delete the auth user. This cascades to public.users (FK on user.id) which
  // in turn cascades to plan_members, venue_swipes, location_share_sessions,
  // location_points, eta_snapshots, plan_messages.
  const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteAuthError) {
    console.error('Failed to delete auth user:', deleteAuthError);
    return new Response(JSON.stringify({ error: deleteAuthError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ deleted: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
