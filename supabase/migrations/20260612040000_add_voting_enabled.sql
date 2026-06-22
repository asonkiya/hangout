-- Migration: Add voting_enabled to plans
alter table public.plans add column voting_enabled boolean not null default true;
