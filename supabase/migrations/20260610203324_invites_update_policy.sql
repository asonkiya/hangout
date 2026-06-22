create policy "invites_update_member" on public.plan_invites for update to authenticated
  using (exists (
    select 1 from public.plan_members pm
    where pm.plan_id = plan_id and pm.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.plan_members pm
    where pm.plan_id = plan_id and pm.user_id = (select auth.uid())
  ));
