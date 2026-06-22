drop policy "vse_insert_host" on public.venue_selection_events;

create policy "vse_insert" on public.venue_selection_events for insert to authenticated
  with check (
    (select auth.uid()) = selected_by_user_id
    and exists (
      select 1 from public.plan_members pm
      where pm.plan_id = plan_id and pm.user_id = (select auth.uid())
    )
    and (
      selection_type = 'auto'
      or exists (
        select 1 from public.plan_members pm
        where pm.plan_id = plan_id and pm.user_id = (select auth.uid()) and pm.role = 'host'
      )
    )
  );
