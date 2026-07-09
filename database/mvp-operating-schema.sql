-- Linek MVP operating schema
-- Run after database/leads.sql. This file is idempotent and keeps the older
-- public demo columns while adding the product-master MVP tables and policies.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  mobile text,
  role text not null default 'owner' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users drop constraint if exists users_mobile_key;

create table if not exists public.admin_users (
  user_id uuid primary key references public.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'super_admin', 'support')),
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;

create table if not exists public.owner_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  business_name text check (business_name is null or char_length(business_name) <= 140),
  city text not null check (char_length(city) between 2 and 80),
  whatsapp_number text not null check (char_length(whatsapp_number) between 7 and 30),
  requested_plan text not null default 'single' check (requested_plan in ('single', 'multi')),
  property_limit integer not null default 1 check (property_limit in (1, 5)),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 1200),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'approved', 'rejected', 'more_information_required')),
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- Compatibility table used by the existing closed-beta pages.
create table if not exists public.owners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete set null,
  owner_profile_id uuid unique references public.owner_profiles(id) on delete set null,
  lead_id uuid,
  name text not null check (char_length(name) between 2 and 120),
  phone text not null check (char_length(phone) between 7 and 30),
  city text check (city is null or char_length(city) between 2 and 80),
  status text not null default 'paused' check (status in ('active', 'paused', 'rejected')),
  plan_code text not null default 'starter' check (plan_code in ('single', 'multi', 'custom', 'starter', 'professional')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  subscription_status text not null default 'trial' check (subscription_status in ('trial', 'active', 'expired', 'cancelled')),
  linek_subscription_payment_link text check (linek_subscription_payment_link is null or char_length(linek_subscription_payment_link) <= 1000),
  linek_subscription_paid_at timestamptz,
  last_trial_alert_at timestamptz,
  internal_note text check (internal_note is null or char_length(internal_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.owners add column if not exists user_id uuid references public.users(id) on delete set null;
alter table public.owners add column if not exists owner_profile_id uuid references public.owner_profiles(id) on delete set null;
alter table public.owners add column if not exists lead_id uuid;
alter table public.owners add column if not exists plan_code text not null default 'starter';
alter table public.owners add column if not exists trial_started_at timestamptz;
alter table public.owners add column if not exists trial_ends_at timestamptz;
alter table public.owners add column if not exists subscription_status text not null default 'trial';
alter table public.owners add column if not exists linek_subscription_payment_link text;
alter table public.owners add column if not exists linek_subscription_paid_at timestamptz;
alter table public.owners add column if not exists last_trial_alert_at timestamptz;
alter table public.owners add column if not exists internal_note text;
alter table public.owners add column if not exists updated_at timestamptz not null default now();

alter table public.owners drop constraint if exists owners_status_check;
alter table public.owners
  add constraint owners_status_check
  check (status in ('active', 'paused', 'rejected'));

alter table public.owners drop constraint if exists owners_plan_code_check;
alter table public.owners
  add constraint owners_plan_code_check
  check (plan_code in ('single', 'multi', 'custom', 'starter', 'professional'));

alter table public.owners drop constraint if exists owners_subscription_status_check;
alter table public.owners
  add constraint owners_subscription_status_check
  check (subscription_status in ('trial', 'active', 'expired', 'cancelled'));

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'leads'
  ) then
    alter table public.owners
      drop constraint if exists owners_lead_id_fkey;
    alter table public.owners
      add constraint owners_lead_id_fkey
      foreign key (lead_id) references public.leads(id) on delete set null;
  end if;
end $$;

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owner_profiles(id) on delete cascade,
  national_id_file text check (national_id_file is null or char_length(national_id_file) <= 1200),
  selfie_file text check (selfie_file is null or char_length(selfie_file) <= 1200),
  national_id_number text check (national_id_number is null or national_id_number ~ '^[0-9]{10}$'),
  date_of_birth date,
  national_address_short text check (national_address_short is null or national_address_short ~ '^[A-Za-z]{4}[0-9]{4}$'),
  whatsapp_number text not null check (char_length(whatsapp_number) between 7 and 30),
  ownership_document text check (ownership_document is null or char_length(ownership_document) <= 1200),
  tourism_license_number text check (tourism_license_number is null or char_length(tourism_license_number) between 3 and 80),
  iban text check (iban is null or char_length(iban) <= 34),
  commercial_registration text check (commercial_registration is null or char_length(commercial_registration) <= 1200),
  owner_declaration_accepted boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 2000),
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'need_more_information')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.verification_requests alter column national_id_file drop not null;
alter table public.verification_requests alter column selfie_file drop not null;
alter table public.verification_requests add column if not exists national_id_number text;
alter table public.verification_requests add column if not exists date_of_birth date;
alter table public.verification_requests add column if not exists national_address_short text;
alter table public.verification_requests add column if not exists tourism_license_number text;
alter table public.verification_requests add column if not exists owner_declaration_accepted boolean not null default false;

alter table public.verification_requests drop constraint if exists verification_requests_national_id_number_check;
alter table public.verification_requests
  add constraint verification_requests_national_id_number_check
  check (national_id_number is null or national_id_number ~ '^[0-9]{10}$');

alter table public.verification_requests drop constraint if exists verification_requests_national_address_short_check;
alter table public.verification_requests
  add constraint verification_requests_national_address_short_check
  check (national_address_short is null or national_address_short ~ '^[A-Za-z]{4}[0-9]{4}$');

alter table public.verification_requests drop constraint if exists verification_requests_tourism_license_number_check;
alter table public.verification_requests
  add constraint verification_requests_tourism_license_number_check
  check (tourism_license_number is null or char_length(tourism_license_number) between 3 and 80);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owner_profiles(id) on delete cascade,
  plan text not null default 'starter' check (plan in ('starter', 'professional')),
  start_date date not null default current_date,
  end_date date,
  status text not null default 'trial' check (status in ('trial', 'active', 'expired', 'cancelled')),
  renewal_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.owners(id) on delete cascade,
  owner_profile_id uuid references public.owner_profiles(id) on delete cascade,
  title text check (title is null or char_length(title) between 2 and 140),
  name text check (name is null or char_length(name) between 2 and 140),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 2400),
  city text not null check (char_length(city) between 2 and 80),
  district text check (district is null or char_length(district) <= 120),
  address text check (address is null or char_length(address) <= 500),
  latitude numeric(10,7),
  longitude numeric(10,7),
  property_type text not null default 'شاليه' check (char_length(property_type) between 2 and 80),
  map_link text check (map_link is null or char_length(map_link) <= 1200),
  guests integer not null default 1 check (guests between 1 and 100),
  bedrooms integer not null default 1 check (bedrooms between 0 and 50),
  bathrooms integer not null default 1 check (bathrooms between 0 and 50),
  base_price integer not null default 0 check (base_price >= 0),
  weekend_price integer check (weekend_price is null or weekend_price >= 0),
  cleaning_fee integer not null default 0 check (cleaning_fee >= 0),
  security_deposit integer check (security_deposit is null or security_deposit >= 0),
  check_in text check (check_in is null or char_length(check_in) <= 40),
  check_out text check (check_out is null or char_length(check_out) <= 40),
  rules text check (rules is null or char_length(rules) <= 2000),
  cancellation_policy text check (cancellation_policy is null or char_length(cancellation_policy) <= 2000),
  payment_link text check (payment_link is null or char_length(payment_link) <= 1000),
  payment_method_note text check (payment_method_note is null or char_length(payment_method_note) <= 1000),
  verification_status text not null default 'under_review'
    check (verification_status in ('under_review', 'verified_basic', 'verified_payment_reviewed', 'rejected')),
  status text not null default 'draft'
    check (status in ('draft', 'under_review', 'published', 'active', 'inactive', 'paused', 'hidden', 'rejected')),
  calendar_last_synced_at timestamptz,
  owner_setup_token text unique,
  owner_setup_submitted_at timestamptz,
  internal_note text check (internal_note is null or char_length(internal_note) <= 2000),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_owner_required check (owner_id is not null or owner_profile_id is not null),
  constraint properties_title_or_name_required check (coalesce(nullif(title, ''), nullif(name, '')) is not null)
);

alter table public.properties add column if not exists owner_profile_id uuid references public.owner_profiles(id) on delete cascade;
alter table public.properties add column if not exists title text;
alter table public.properties add column if not exists name text;
alter table public.properties add column if not exists description text;
alter table public.properties add column if not exists district text;
alter table public.properties add column if not exists address text;
alter table public.properties add column if not exists latitude numeric(10,7);
alter table public.properties add column if not exists longitude numeric(10,7);
alter table public.properties add column if not exists property_type text not null default 'شاليه';
alter table public.properties add column if not exists map_link text;
alter table public.properties add column if not exists guests integer not null default 1;
alter table public.properties add column if not exists bedrooms integer not null default 1;
alter table public.properties add column if not exists bathrooms integer not null default 1;
alter table public.properties add column if not exists base_price integer not null default 0;
alter table public.properties add column if not exists weekend_price integer;
alter table public.properties add column if not exists cleaning_fee integer not null default 0;
alter table public.properties add column if not exists security_deposit integer;
alter table public.properties add column if not exists check_in text;
alter table public.properties add column if not exists check_out text;
alter table public.properties add column if not exists rules text;
alter table public.properties add column if not exists cancellation_policy text;
alter table public.properties add column if not exists payment_link text;
alter table public.properties add column if not exists payment_method_note text;
alter table public.properties add column if not exists verification_status text not null default 'under_review';
alter table public.properties add column if not exists status text not null default 'draft';
alter table public.properties add column if not exists calendar_last_synced_at timestamptz;
alter table public.properties add column if not exists owner_setup_token text;
alter table public.properties add column if not exists owner_setup_submitted_at timestamptz;
alter table public.properties add column if not exists internal_note text;
alter table public.properties add column if not exists published_at timestamptz;
alter table public.properties add column if not exists updated_at timestamptz not null default now();
alter table public.properties alter column owner_id drop not null;
alter table public.properties alter column property_type set default 'شاليه';
alter table public.properties alter column guests set default 1;
alter table public.properties alter column bedrooms set default 1;
alter table public.properties alter column bathrooms set default 1;
alter table public.properties alter column base_price set default 0;
alter table public.properties alter column cleaning_fee set default 0;
alter table public.properties alter column verification_status set default 'under_review';
alter table public.properties alter column status set default 'draft';

alter table public.properties drop constraint if exists properties_status_check;
alter table public.properties
  add constraint properties_status_check
  check (status in ('draft', 'under_review', 'published', 'active', 'inactive', 'paused', 'hidden', 'rejected'));

alter table public.properties drop constraint if exists properties_verification_status_check;
alter table public.properties
  add constraint properties_verification_status_check
  check (verification_status in ('under_review', 'verified_basic', 'verified_payment_reviewed', 'rejected'));

alter table public.properties drop constraint if exists properties_owner_required;
alter table public.properties
  add constraint properties_owner_required
  check (owner_id is not null or owner_profile_id is not null);

alter table public.properties drop constraint if exists properties_title_or_name_required;
alter table public.properties
  add constraint properties_title_or_name_required
  check (coalesce(nullif(title, ''), nullif(name, '')) is not null);

update public.properties
set title = coalesce(title, name),
    name = coalesce(name, title),
    owner_setup_token = coalesce(owner_setup_token, replace(gen_random_uuid()::text, '-', ''))
where title is null or name is null or owner_setup_token is null;

create table if not exists public.property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  image_url text not null check (char_length(image_url) <= 1200),
  display_order integer not null default 0 check (display_order >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compatibility table name used by older pages.
create table if not exists public.property_photos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  url text not null check (char_length(url) <= 1200),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.amenities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.amenities (name)
values ('WiFi'), ('Pool'), ('Kitchen'), ('Parking'), ('BBQ'), ('TV'), ('AC')
on conflict (name) do nothing;

create table if not exists public.property_amenities (
  property_id uuid not null references public.properties(id) on delete cascade,
  amenity_id uuid not null references public.amenities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (property_id, amenity_id)
);

create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  date date not null,
  status text not null default 'available' check (status in ('available', 'blocked', 'reserved', 'pending', 'external')),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, date)
);

create table if not exists public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  date date not null,
  source text not null default 'manual' check (source in ('owner', 'airbnb', 'booking', 'vrbo', 'google', 'apple', 'manual', 'ical')),
  external_calendar_id uuid,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, date, source)
);

create table if not exists public.external_calendars (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  platform text not null check (char_length(platform) between 2 and 80),
  calendar_url text not null check (char_length(calendar_url) <= 2000),
  last_sync timestamptz,
  sync_status text not null default 'active' check (sync_status in ('active', 'paused', 'error')),
  active boolean not null default true,
  imported_reservations integer not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.blocked_dates
  drop constraint if exists blocked_dates_external_calendar_id_fkey;
alter table public.blocked_dates
  add constraint blocked_dates_external_calendar_id_fkey
  foreign key (external_calendar_id) references public.external_calendars(id) on delete cascade;

create table if not exists public.owner_payment_methods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owner_profiles(id) on delete cascade,
  payment_provider text not null default 'payment_link' check (payment_provider in ('payment_link', 'bank_transfer')),
  payment_url text check (payment_url is null or char_length(payment_url) <= 1000),
  iban text check (iban is null or char_length(iban) <= 34),
  account_name text check (account_name is null or char_length(account_name) <= 140),
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.booking_reference_seq start 1;

create or replace function public.next_booking_reference()
returns text
language sql
as $$
  select 'LNK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.booking_reference_seq')::text, 6, '0');
$$;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique default public.next_booking_reference(),
  reference text unique,
  guest_access_token text not null default encode(gen_random_bytes(24), 'hex'),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid references public.owners(id) on delete set null,
  owner_profile_id uuid references public.owner_profiles(id) on delete set null,
  guest_name text not null check (char_length(guest_name) between 2 and 120),
  guest_mobile text check (guest_mobile is null or char_length(guest_mobile) between 7 and 30),
  guest_phone text check (guest_phone is null or char_length(guest_phone) between 7 and 30),
  check_in date,
  check_out date,
  booking_date date,
  guests_count integer not null default 1 check (guests_count between 1 and 100),
  guests integer,
  notes text check (notes is null or char_length(notes) <= 2000),
  total_price integer not null default 0 check (total_price >= 0),
  amount integer not null default 0 check (amount >= 0),
  payment_link_snapshot text check (payment_link_snapshot is null or char_length(payment_link_snapshot) <= 1000),
  payment_instructions_snapshot text check (payment_instructions_snapshot is null or char_length(payment_instructions_snapshot) <= 2000),
  status text not null default 'pending'
    check (status in ('new', 'pending', 'pending_owner_approval', 'pending_payment', 'confirmed', 'rejected', 'expired', 'cancelled')),
  payment_status text not null default 'not_started'
    check (payment_status in ('not_started', 'waiting_for_payment', 'paid_unverified', 'paid_confirmed', 'cancelled')),
  owner_decision_note text check (owner_decision_note is null or char_length(owner_decision_note) <= 1000),
  viewed_by_owner_at timestamptz,
  decided_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_dates_required check (
    (check_in is not null and check_out is not null and check_out > check_in)
    or booking_date is not null
  )
);

alter table public.bookings add column if not exists public_code text;
alter table public.bookings add column if not exists reference text;
alter table public.bookings add column if not exists guest_access_token text;
alter table public.bookings add column if not exists owner_id uuid references public.owners(id) on delete set null;
alter table public.bookings add column if not exists owner_profile_id uuid references public.owner_profiles(id) on delete set null;
alter table public.bookings add column if not exists guest_mobile text;
alter table public.bookings add column if not exists guest_phone text;
alter table public.bookings add column if not exists check_in date;
alter table public.bookings add column if not exists check_out date;
alter table public.bookings add column if not exists booking_date date;
alter table public.bookings add column if not exists guests_count integer not null default 1;
alter table public.bookings add column if not exists guests integer;
alter table public.bookings add column if not exists notes text;
alter table public.bookings add column if not exists total_price integer not null default 0;
alter table public.bookings add column if not exists amount integer not null default 0;
alter table public.bookings add column if not exists payment_link_snapshot text;
alter table public.bookings add column if not exists payment_instructions_snapshot text;
alter table public.bookings add column if not exists status text not null default 'pending';
alter table public.bookings add column if not exists payment_status text not null default 'not_started';
alter table public.bookings add column if not exists owner_decision_note text;
alter table public.bookings add column if not exists viewed_by_owner_at timestamptz;
alter table public.bookings add column if not exists decided_at timestamptz;
alter table public.bookings add column if not exists expires_at timestamptz not null default (now() + interval '30 minutes');
alter table public.bookings add column if not exists updated_at timestamptz not null default now();
alter table public.bookings alter column public_code set default public.next_booking_reference();
alter table public.bookings alter column guest_access_token set default encode(gen_random_bytes(24), 'hex');
alter table public.bookings alter column guests_count set default 1;
alter table public.bookings alter column total_price set default 0;
alter table public.bookings alter column amount set default 0;
alter table public.bookings alter column status set default 'pending';
alter table public.bookings alter column payment_status set default 'not_started';
alter table public.bookings alter column expires_at set default (now() + interval '30 minutes');

update public.bookings
set public_code = coalesce(public_code, 'LNK-' || to_char(created_at, 'YYYY') || '-' || upper(substr(replace(id::text, '-', ''), 1, 6))),
    guest_access_token = coalesce(guest_access_token, encode(gen_random_bytes(24), 'hex'))
where public_code is null or guest_access_token is null;

alter table public.bookings alter column public_code set not null;
alter table public.bookings alter column guest_access_token set not null;

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check
  check (status in ('new', 'pending', 'pending_owner_approval', 'pending_payment', 'confirmed', 'rejected', 'expired', 'cancelled'));

alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings
  add constraint bookings_payment_status_check
  check (payment_status in ('not_started', 'waiting_for_payment', 'paid_unverified', 'paid_confirmed', 'cancelled'));

alter table public.bookings drop constraint if exists bookings_dates_required;
alter table public.bookings
  add constraint bookings_dates_required
  check (
    (check_in is not null and check_out is not null and check_out > check_in)
    or booking_date is not null
  );

update public.bookings
set reference = coalesce(reference, public_code),
    guest_mobile = coalesce(guest_mobile, guest_phone),
    guest_phone = coalesce(guest_phone, guest_mobile),
    check_in = coalesce(check_in, booking_date),
    check_out = coalesce(check_out, booking_date + 1),
    total_price = greatest(total_price, amount),
    amount = greatest(amount, total_price),
    status = case when status = 'pending_owner_approval' then 'pending' else status end
where reference is null
   or guest_mobile is null
   or guest_phone is null
   or check_in is null
   or check_out is null
   or status = 'pending_owner_approval';

create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  event_type text not null check (event_type in (
    'Booking Created',
    'Guest Submitted',
    'Owner Viewed',
    'Owner Accepted',
    'Owner Rejected',
    'Booking Expired',
    'Payment Link Viewed',
    'Guest Cancelled',
    'Conflict Detected'
  )),
  created_by uuid references public.users(id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.booking_page_visits (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  visitor_identifier text check (visitor_identifier is null or char_length(visitor_identifier) <= 120),
  ip_address inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 1000),
  referrer text check (referrer is null or char_length(referrer) <= 1200),
  visited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient uuid references public.users(id) on delete cascade,
  owner_id uuid references public.owner_profiles(id) on delete cascade,
  type text not null check (type in ('WhatsApp', 'Email', 'In App')),
  title text not null check (char_length(title) between 2 and 160),
  message text not null check (char_length(message) <= 2000),
  read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.owner_profiles(id) on delete set null,
  subject text not null check (char_length(subject) between 2 and 160),
  message text not null check (char_length(message) <= 4000),
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  action text not null check (char_length(action) between 2 and 160),
  ip_address inet,
  device text check (device is null or char_length(device) <= 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.verification_reviews (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  status text not null default 'under_review' check (status in ('under_review', 'approved_basic', 'approved_payment_reviewed', 'rejected')),
  provider_checked boolean not null default false,
  payment_method_checked boolean not null default false,
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 2000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key check (key ~ '^[a-z0-9_-]+$'),
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.site_settings (key, value, is_public)
values (
  'pricing',
  jsonb_build_object(
    'single_price', 199,
    'multi_price', 299,
    'custom_label', 'تواصل معنا',
    'discount_enabled', false,
    'discount_percent', 0,
    'discount_label', '',
    'discount_note', '',
    'trial_days', 14
  ),
  true
)
on conflict (key) do nothing;

create index if not exists users_role_idx on public.users (role);
create index if not exists owner_profiles_user_id_idx on public.owner_profiles (user_id);
create index if not exists owners_user_id_idx on public.owners (user_id);
create index if not exists owners_phone_idx on public.owners (phone);
create index if not exists properties_owner_profile_id_idx on public.properties (owner_profile_id);
create index if not exists properties_owner_id_idx on public.properties (owner_id);
create index if not exists properties_slug_idx on public.properties (slug);
create index if not exists properties_status_idx on public.properties (status);
create index if not exists bookings_property_dates_idx on public.bookings (property_id, check_in, check_out);
create index if not exists bookings_property_date_idx on public.bookings (property_id, booking_date);
create index if not exists bookings_owner_profile_id_idx on public.bookings (owner_profile_id);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_reference_idx on public.bookings (reference);
create index if not exists bookings_public_code_idx on public.bookings (public_code);
create index if not exists bookings_expires_at_idx on public.bookings (expires_at);
create index if not exists booking_events_booking_id_idx on public.booking_events (booking_id, created_at);
create index if not exists availability_property_date_idx on public.availability (property_id, date);
create index if not exists blocked_dates_property_date_idx on public.blocked_dates (property_id, date);

create or replace function public.sync_booking_compatibility_fields()
returns trigger
language plpgsql
as $$
begin
  new.reference := coalesce(new.reference, new.public_code, public.next_booking_reference());
  new.public_code := coalesce(new.public_code, new.reference);
  new.guest_mobile := coalesce(new.guest_mobile, new.guest_phone);
  new.guest_phone := coalesce(new.guest_phone, new.guest_mobile);
  new.booking_date := coalesce(new.booking_date, new.check_in);
  new.check_in := coalesce(new.check_in, new.booking_date);
  new.check_out := coalesce(new.check_out, new.booking_date + 1);
  new.total_price := greatest(coalesce(new.total_price, 0), coalesce(new.amount, 0));
  new.amount := greatest(coalesce(new.amount, 0), coalesce(new.total_price, 0));
  if new.status = 'pending_owner_approval' then
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_booking_compatibility_fields on public.bookings;
create trigger sync_booking_compatibility_fields
before insert or update on public.bookings
for each row execute function public.sync_booking_compatibility_fields();

create or replace function public.create_booking_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.booking_events (booking_id, event_type, notes)
  values (new.id, 'Booking Created', 'تم إنشاء طلب الحجز.');
  return new;
end;
$$;

drop trigger if exists create_booking_created_event on public.bookings;
create trigger create_booking_created_event
after insert on public.bookings
for each row execute function public.create_booking_created_event();

create or replace function public.date_ranges_overlap(a_start date, a_end date, b_start date, b_end date)
returns boolean
language sql
immutable
as $$
  select daterange(a_start, a_end, '[)') && daterange(b_start, b_end, '[)');
$$;

create or replace function public.property_dates_available(
  target_property_id uuid,
  target_check_in date,
  target_check_out date,
  ignored_booking_id uuid default null
)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1
    from public.availability a
    where a.property_id = target_property_id
      and a.date >= target_check_in
      and a.date < target_check_out
      and a.status in ('blocked', 'reserved', 'pending', 'external')
  )
  and not exists (
    select 1
    from public.blocked_dates b
    where b.property_id = target_property_id
      and b.date >= target_check_in
      and b.date < target_check_out
  )
  and not exists (
    select 1
    from public.bookings existing
    where existing.property_id = target_property_id
      and (ignored_booking_id is null or existing.id <> ignored_booking_id)
      and existing.status in ('pending', 'confirmed')
      and existing.expires_at > now()
      and public.date_ranges_overlap(existing.check_in, existing.check_out, target_check_in, target_check_out)
  );
$$;

create or replace function public.enforce_booking_availability()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('pending', 'confirmed') and not public.property_dates_available(new.property_id, new.check_in, new.check_out, new.id) then
    raise exception 'التواريخ المختارة غير متاحة';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_booking_availability on public.bookings;
create trigger enforce_booking_availability
before insert or update of property_id, check_in, check_out, status on public.bookings
for each row execute function public.enforce_booking_availability();

create or replace function public.expire_pending_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer;
begin
  with expired as (
    update public.bookings
    set status = 'expired',
        payment_status = 'cancelled',
        updated_at = now()
    where status = 'pending'
      and expires_at <= now()
    returning id
  )
  insert into public.booking_events (booking_id, event_type, notes)
  select id, 'Booking Expired', 'انتهت مهلة 30 دقيقة دون رد المالك.'
  from expired;

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

create or replace function public.owner_can_access_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.properties p
    left join public.owner_profiles op on op.id = p.owner_profile_id
    left join public.owners o on o.id = p.owner_id
    where p.id = target_property_id
      and (op.user_id = auth.uid() or o.user_id = auth.uid())
  );
$$;

drop trigger if exists set_updated_at_users on public.users;
create trigger set_updated_at_users before update on public.users
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_admin_users on public.admin_users;
create trigger set_updated_at_admin_users before update on public.admin_users
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_owner_profiles on public.owner_profiles;
create trigger set_updated_at_owner_profiles before update on public.owner_profiles
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_owners on public.owners;
create trigger set_updated_at_owners before update on public.owners
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_verification_requests on public.verification_requests;
create trigger set_updated_at_verification_requests before update on public.verification_requests
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_subscriptions on public.subscriptions;
create trigger set_updated_at_subscriptions before update on public.subscriptions
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_properties on public.properties;
create trigger set_updated_at_properties before update on public.properties
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_property_images on public.property_images;
create trigger set_updated_at_property_images before update on public.property_images
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_amenities on public.amenities;
create trigger set_updated_at_amenities before update on public.amenities
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_availability on public.availability;
create trigger set_updated_at_availability before update on public.availability
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_blocked_dates on public.blocked_dates;
create trigger set_updated_at_blocked_dates before update on public.blocked_dates
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_external_calendars on public.external_calendars;
create trigger set_updated_at_external_calendars before update on public.external_calendars
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_owner_payment_methods on public.owner_payment_methods;
create trigger set_updated_at_owner_payment_methods before update on public.owner_payment_methods
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_bookings on public.bookings;
create trigger set_updated_at_bookings before update on public.bookings
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_booking_page_visits on public.booking_page_visits;
create trigger set_updated_at_booking_page_visits before update on public.booking_page_visits
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_notifications on public.notifications;
create trigger set_updated_at_notifications before update on public.notifications
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_support_tickets on public.support_tickets;
create trigger set_updated_at_support_tickets before update on public.support_tickets
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_audit_logs on public.audit_logs;
create trigger set_updated_at_audit_logs before update on public.audit_logs
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_site_settings on public.site_settings;
create trigger set_updated_at_site_settings before update on public.site_settings
for each row execute function public.set_updated_at();

grant usage on schema public to anon, authenticated, service_role;
grant usage, select on sequence public.booking_reference_seq to anon, authenticated, service_role;
grant select on public.amenities to anon, authenticated;
grant select on public.properties, public.property_images, public.property_photos to anon;
grant select on public.availability, public.blocked_dates to anon;
grant select on public.site_settings to anon, authenticated;
grant insert on public.bookings, public.booking_page_visits to anon;
grant select, insert, update, delete on
  public.users,
  public.owner_profiles,
  public.owners,
  public.verification_requests,
  public.subscriptions,
  public.properties,
  public.property_images,
  public.property_photos,
  public.amenities,
  public.property_amenities,
  public.availability,
  public.blocked_dates,
  public.external_calendars,
  public.owner_payment_methods,
  public.bookings,
  public.booking_events,
  public.booking_page_visits,
  public.notifications,
  public.support_tickets,
  public.audit_logs,
  public.site_settings
to authenticated;
grant all on all tables in schema public to service_role;
grant execute on function public.expire_pending_bookings() to service_role;
grant execute on function public.property_dates_available(uuid, date, date, uuid) to anon, authenticated, service_role;

alter table public.users enable row level security;
alter table public.admin_users enable row level security;
alter table public.owner_profiles enable row level security;
alter table public.owners enable row level security;
alter table public.verification_requests enable row level security;
alter table public.subscriptions enable row level security;
alter table public.properties enable row level security;
alter table public.property_images enable row level security;
alter table public.property_photos enable row level security;
alter table public.amenities enable row level security;
alter table public.property_amenities enable row level security;
alter table public.availability enable row level security;
alter table public.blocked_dates enable row level security;
alter table public.external_calendars enable row level security;
alter table public.owner_payment_methods enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
alter table public.booking_page_visits enable row level security;
alter table public.notifications enable row level security;
alter table public.support_tickets enable row level security;
alter table public.audit_logs enable row level security;
alter table public.verification_reviews enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists "Public read public site settings" on public.site_settings;
create policy "Public read public site settings" on public.site_settings
for select to anon, authenticated
using (is_public = true or public.current_user_is_admin());

drop policy if exists "Admins manage site settings" on public.site_settings;
create policy "Admins manage site settings" on public.site_settings
for all to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Users read own row" on public.users;
create policy "Users read own row" on public.users
for select to authenticated using (id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Users insert own row" on public.users;
create policy "Users insert own row" on public.users
for insert to authenticated with check (id = auth.uid());

drop policy if exists "Users update own row" on public.users;
create policy "Users update own row" on public.users
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Admins manage admin users" on public.admin_users;
create policy "Admins manage admin users" on public.admin_users
for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

drop policy if exists "Owners manage own profile" on public.owner_profiles;
create policy "Owners manage own profile" on public.owner_profiles
for all to authenticated
using (user_id = auth.uid() or public.current_user_is_admin())
with check (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Owners read own legacy owner" on public.owners;
create policy "Owners read own legacy owner" on public.owners
for select to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Owners update own legacy owner" on public.owners;
create policy "Owners update own legacy owner" on public.owners
for update to authenticated
using (user_id = auth.uid() or public.current_user_is_admin())
with check (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Owners manage own verification" on public.verification_requests;
create policy "Owners manage own verification" on public.verification_requests
for all to authenticated
using (
  public.current_user_is_admin()
  or exists (select 1 from public.owner_profiles op where op.id = owner_id and op.user_id = auth.uid())
)
with check (
  public.current_user_is_admin()
  or exists (select 1 from public.owner_profiles op where op.id = owner_id and op.user_id = auth.uid())
);

drop policy if exists "Owners read own subscriptions" on public.subscriptions;
create policy "Owners read own subscriptions" on public.subscriptions
for select to authenticated
using (
  public.current_user_is_admin()
  or exists (select 1 from public.owner_profiles op where op.id = owner_id and op.user_id = auth.uid())
);

drop policy if exists "Public can read published properties" on public.properties;
create policy "Public can read published properties" on public.properties
for select to anon, authenticated
using (status in ('published', 'active') or public.owner_can_access_property(id) or public.current_user_is_admin());

drop policy if exists "Owners insert own properties" on public.properties;
create policy "Owners insert own properties" on public.properties
for insert to authenticated
with check (
  public.current_user_is_admin()
  or exists (select 1 from public.owner_profiles op where op.id = owner_profile_id and op.user_id = auth.uid() and op.verification_status = 'approved')
);

drop policy if exists "Owners update own properties" on public.properties;
create policy "Owners update own properties" on public.properties
for update to authenticated
using (public.owner_can_access_property(id) or public.current_user_is_admin())
with check (public.owner_can_access_property(id) or public.current_user_is_admin());

drop policy if exists "Public can read photos for published properties" on public.property_photos;
create policy "Public can read photos for published properties" on public.property_photos
for select to anon, authenticated
using (
  exists (select 1 from public.properties p where p.id = property_id and p.status in ('published', 'active'))
  or public.owner_can_access_property(property_id)
  or public.current_user_is_admin()
);

drop policy if exists "Public can read images for published properties" on public.property_images;
create policy "Public can read images for published properties" on public.property_images
for select to anon, authenticated
using (
  exists (select 1 from public.properties p where p.id = property_id and p.status in ('published', 'active'))
  or public.owner_can_access_property(property_id)
  or public.current_user_is_admin()
);

drop policy if exists "Owners manage property photos" on public.property_photos;
create policy "Owners manage property photos" on public.property_photos
for all to authenticated
using (public.owner_can_access_property(property_id) or public.current_user_is_admin())
with check (public.owner_can_access_property(property_id) or public.current_user_is_admin());

drop policy if exists "Owners manage property images" on public.property_images;
create policy "Owners manage property images" on public.property_images
for all to authenticated
using (public.owner_can_access_property(property_id) or public.current_user_is_admin())
with check (public.owner_can_access_property(property_id) or public.current_user_is_admin());

drop policy if exists "Owners manage amenities" on public.property_amenities;
create policy "Owners manage amenities" on public.property_amenities
for all to authenticated
using (public.owner_can_access_property(property_id) or public.current_user_is_admin())
with check (public.owner_can_access_property(property_id) or public.current_user_is_admin());

drop policy if exists "Owners manage availability" on public.availability;
create policy "Owners manage availability" on public.availability
for all to authenticated
using (public.owner_can_access_property(property_id) or public.current_user_is_admin())
with check (public.owner_can_access_property(property_id) or public.current_user_is_admin());

drop policy if exists "Public read published availability" on public.availability;
create policy "Public read published availability" on public.availability
for select to anon, authenticated
using (
  exists (select 1 from public.properties p where p.id = property_id and p.status in ('published', 'active'))
  or public.owner_can_access_property(property_id)
  or public.current_user_is_admin()
);

drop policy if exists "Owners manage blocked dates" on public.blocked_dates;
create policy "Owners manage blocked dates" on public.blocked_dates
for all to authenticated
using (public.owner_can_access_property(property_id) or public.current_user_is_admin())
with check (public.owner_can_access_property(property_id) or public.current_user_is_admin());

drop policy if exists "Public read published blocked dates" on public.blocked_dates;
create policy "Public read published blocked dates" on public.blocked_dates
for select to anon, authenticated
using (
  exists (select 1 from public.properties p where p.id = property_id and p.status in ('published', 'active'))
  or public.owner_can_access_property(property_id)
  or public.current_user_is_admin()
);

drop policy if exists "Owners manage external calendars" on public.external_calendars;
create policy "Owners manage external calendars" on public.external_calendars
for all to authenticated
using (public.owner_can_access_property(property_id) or public.current_user_is_admin())
with check (public.owner_can_access_property(property_id) or public.current_user_is_admin());

drop policy if exists "Approved owners manage own payment methods" on public.owner_payment_methods;
create policy "Approved owners manage own payment methods" on public.owner_payment_methods
for all to authenticated
using (
  public.current_user_is_admin()
  or exists (select 1 from public.owner_profiles op where op.id = owner_id and op.user_id = auth.uid() and op.verification_status = 'approved')
)
with check (
  public.current_user_is_admin()
  or exists (select 1 from public.owner_profiles op where op.id = owner_id and op.user_id = auth.uid() and op.verification_status = 'approved')
);

drop policy if exists "Public can create booking requests" on public.bookings;
create policy "Public can create booking requests" on public.bookings
for insert to anon, authenticated
with check (
  status in ('pending', 'pending_owner_approval')
  and payment_status = 'not_started'
  and exists (
    select 1 from public.properties p
    where p.id = property_id
      and p.status in ('published', 'active')
  )
);

drop policy if exists "Owners read own bookings" on public.bookings;
create policy "Owners read own bookings" on public.bookings
for select to authenticated
using (
  public.current_user_is_admin()
  or public.owner_can_access_property(property_id)
);

drop policy if exists "Owners update own bookings" on public.bookings;
create policy "Owners update own bookings" on public.bookings
for update to authenticated
using (
  public.current_user_is_admin()
  or public.owner_can_access_property(property_id)
)
with check (
  public.current_user_is_admin()
  or public.owner_can_access_property(property_id)
);

drop policy if exists "Owners read booking events" on public.booking_events;
create policy "Owners read booking events" on public.booking_events
for select to authenticated
using (
  public.current_user_is_admin()
  or exists (select 1 from public.bookings b where b.id = booking_id and public.owner_can_access_property(b.property_id))
);

drop policy if exists "System insert booking events" on public.booking_events;
create policy "System insert booking events" on public.booking_events
for insert to authenticated
with check (
  public.current_user_is_admin()
  or exists (select 1 from public.bookings b where b.id = booking_id and public.owner_can_access_property(b.property_id))
);

drop policy if exists "Public can create page visits" on public.booking_page_visits;
create policy "Public can create page visits" on public.booking_page_visits
for insert to anon, authenticated
with check (
  exists (select 1 from public.properties p where p.id = property_id and p.status in ('published', 'active'))
);

drop policy if exists "Owners read own page visits" on public.booking_page_visits;
create policy "Owners read own page visits" on public.booking_page_visits
for select to authenticated
using (public.current_user_is_admin() or public.owner_can_access_property(property_id));

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
for select to authenticated
using (recipient = auth.uid() or public.current_user_is_admin());

drop policy if exists "Owners manage support tickets" on public.support_tickets;
create policy "Owners manage support tickets" on public.support_tickets
for all to authenticated
using (
  public.current_user_is_admin()
  or exists (select 1 from public.owner_profiles op where op.id = owner_id and op.user_id = auth.uid())
)
with check (
  public.current_user_is_admin()
  or exists (select 1 from public.owner_profiles op where op.id = owner_id and op.user_id = auth.uid())
);

drop policy if exists "Admins read audit logs" on public.audit_logs;
create policy "Admins read audit logs" on public.audit_logs
for select to authenticated using (public.current_user_is_admin());

drop policy if exists "Owners insert audit logs" on public.audit_logs;
create policy "Owners insert audit logs" on public.audit_logs
for insert to authenticated with check (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Admins manage verification reviews" on public.verification_reviews;
create policy "Admins manage verification reviews" on public.verification_reviews
for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

insert into storage.buckets (id, name, public)
values
  ('property-images', 'property-images', true),
  ('verification-documents', 'verification-documents', false)
on conflict (id) do nothing;

drop policy if exists "Owners upload property images" on storage.objects;
create policy "Owners upload property images" on storage.objects
for insert to authenticated
with check (bucket_id = 'property-images');

drop policy if exists "Public read property images" on storage.objects;
create policy "Public read property images" on storage.objects
for select to anon, authenticated
using (bucket_id = 'property-images');

drop policy if exists "Owners upload verification documents" on storage.objects;
create policy "Owners upload verification documents" on storage.objects
for insert to authenticated
with check (bucket_id = 'verification-documents');

drop policy if exists "Owner or admin read verification documents" on storage.objects;
create policy "Owner or admin read verification documents" on storage.objects
for select to authenticated
using (bucket_id = 'verification-documents' and (owner = auth.uid() or public.current_user_is_admin()));

notify pgrst, 'reload schema';
