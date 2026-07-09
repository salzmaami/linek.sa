-- Linek auth cleanup
-- Safe to run in Supabase SQL Editor.
-- Mobile/WhatsApp is stored on owner_profiles. public.users should not block
-- new owner accounts when a phone number was reused during tests.

alter table public.users drop constraint if exists users_mobile_key;

select
  conname as constraint_name,
  contype as constraint_type
from pg_constraint
where conrelid = 'public.users'::regclass
order by conname;
