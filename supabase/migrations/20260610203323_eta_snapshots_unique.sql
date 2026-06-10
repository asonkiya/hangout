alter table public.eta_snapshots
  add constraint eta_snapshots_plan_user_unique unique (plan_id, user_id);
