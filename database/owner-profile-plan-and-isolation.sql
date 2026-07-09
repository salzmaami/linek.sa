-- Linek owner profile plan and isolation update
-- Safe to run in Supabase SQL Editor.

alter table public.owner_profiles add column if not exists requested_plan text not null default 'single';
alter table public.owner_profiles add column if not exists property_limit integer not null default 1;

alter table public.owner_profiles drop constraint if exists owner_profiles_requested_plan_check;
alter table public.owner_profiles
  add constraint owner_profiles_requested_plan_check
  check (requested_plan in ('single', 'multi'));

alter table public.owner_profiles drop constraint if exists owner_profiles_property_limit_check;
alter table public.owner_profiles
  add constraint owner_profiles_property_limit_check
  check (property_limit in (1, 5));

update public.owner_profiles
set property_limit = case when requested_plan = 'multi' then 5 else 1 end
where property_limit not in (1, 5);

select
  id,
  user_id,
  full_name,
  requested_plan,
  property_limit,
  verification_status
from public.owner_profiles
order by created_at desc
limit 20;
