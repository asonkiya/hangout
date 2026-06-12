-- Allow plan co-members to read location_points from active sessions in their plan.
-- Required for live friend tracking on the plan detail LIVE map.
-- The session's owner already consented to share within the plan's scope.

drop policy "lp_select_own" on public.location_points;

create policy "lp_select_co_member" on public.location_points for select to authenticated
  using (
    exists (
      select 1
      from public.location_share_sessions s
      join public.plan_members pm on pm.plan_id = s.plan_id
      where s.id = location_points.session_id
        and s.status = 'active'
        and pm.user_id = (select auth.uid())
    )
  );
