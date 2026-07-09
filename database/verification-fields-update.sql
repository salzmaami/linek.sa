-- Linek verification fields update
-- Safe to run in Supabase SQL Editor.

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

select
  column_name,
  is_nullable,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'verification_requests'
  and column_name in (
    'national_id_number',
    'date_of_birth',
    'national_address_short',
    'ownership_document',
    'tourism_license_number',
    'iban',
    'commercial_registration',
    'owner_declaration_accepted',
    'national_id_file',
    'selfie_file'
  )
order by column_name;
