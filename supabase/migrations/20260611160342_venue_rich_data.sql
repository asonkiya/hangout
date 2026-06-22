alter table public.venue_candidates
  add column photo_urls jsonb,
  add column address text,
  add column website_url text,
  add column maps_url text,
  add column user_rating_count integer,
  add column is_open boolean;
