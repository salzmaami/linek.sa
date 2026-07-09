-- Linek MVP schema verification
-- Safe to run in Supabase SQL Editor. This file only reads metadata.

with required_tables(table_name) as (
  values
    ('users'),
    ('admin_users'),
    ('owner_profiles'),
    ('verification_requests'),
    ('subscriptions'),
    ('owners'),
    ('properties'),
    ('property_images'),
    ('property_photos'),
    ('amenities'),
    ('property_amenities'),
    ('availability'),
    ('blocked_dates'),
    ('external_calendars'),
    ('owner_payment_methods'),
    ('bookings'),
    ('booking_events'),
    ('booking_page_visits'),
    ('notifications'),
    ('support_tickets'),
    ('audit_logs'),
    ('verification_reviews'),
    ('site_settings')
)
select
  'tables' as check_group,
  r.table_name as item,
  case when t.table_name is null then 'missing' else 'ok' end as status
from required_tables r
left join information_schema.tables t
  on t.table_schema = 'public'
 and t.table_name = r.table_name
order by item;

with required_columns(table_name, column_name) as (
  values
    ('properties', 'title'),
    ('properties', 'slug'),
    ('properties', 'owner_profile_id'),
    ('properties', 'status'),
    ('properties', 'calendar_last_synced_at'),
    ('bookings', 'reference'),
    ('bookings', 'guest_access_token'),
    ('bookings', 'check_in'),
    ('bookings', 'check_out'),
    ('bookings', 'expires_at'),
    ('bookings', 'payment_link_snapshot'),
    ('owner_profiles', 'verification_status'),
    ('owner_profiles', 'requested_plan'),
    ('owner_profiles', 'property_limit'),
    ('verification_requests', 'national_id_number'),
    ('verification_requests', 'date_of_birth'),
    ('verification_requests', 'national_address_short'),
    ('verification_requests', 'ownership_document'),
    ('verification_requests', 'tourism_license_number'),
    ('verification_requests', 'iban'),
    ('verification_requests', 'commercial_registration'),
    ('verification_requests', 'owner_declaration_accepted'),
    ('owner_payment_methods', 'payment_provider'),
    ('external_calendars', 'calendar_url'),
    ('site_settings', 'value'),
    ('site_settings', 'is_public')
)
select
  'columns' as check_group,
  r.table_name || '.' || r.column_name as item,
  case when c.column_name is null then 'missing' else 'ok' end as status
from required_columns r
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = r.table_name
 and c.column_name = r.column_name
order by item;

with required_functions(function_name) as (
  values
    ('set_updated_at'),
    ('current_user_is_admin'),
    ('next_booking_reference'),
    ('property_dates_available'),
    ('expire_pending_bookings'),
    ('owner_can_access_property')
)
select
  'functions' as check_group,
  function_name as item,
  case when p.proname is null then 'missing' else 'ok' end as status
from required_functions r
left join pg_namespace n
  on n.nspname = 'public'
left join pg_proc p
  on n.oid = p.pronamespace
 and p.proname = r.function_name
order by item;

with required_buckets(bucket_id) as (
  values
    ('property-images'),
    ('verification-documents')
)
select
  'storage_buckets' as check_group,
  bucket_id as item,
  case when b.id is null then 'missing' else 'ok' end as status
from required_buckets r
left join storage.buckets b
  on b.id = r.bucket_id
order by item;

select
  'rls_enabled' as check_group,
  tablename as item,
  case when rowsecurity then 'ok' else 'missing' end as status
from pg_tables
where schemaname = 'public'
  and tablename in (
    'users',
    'admin_users',
    'owner_profiles',
    'verification_requests',
    'subscriptions',
    'owners',
    'properties',
    'property_images',
    'property_photos',
    'amenities',
    'property_amenities',
    'availability',
    'blocked_dates',
    'external_calendars',
    'owner_payment_methods',
    'bookings',
    'booking_events',
    'booking_page_visits',
    'notifications',
    'support_tickets',
    'audit_logs',
    'verification_reviews',
    'site_settings'
  )
order by item;

select
  'policies_count' as check_group,
  schemaname || '.' || tablename as item,
  count(*)::text as status
from pg_policies
where schemaname in ('public', 'storage')
group by schemaname, tablename
order by item;
