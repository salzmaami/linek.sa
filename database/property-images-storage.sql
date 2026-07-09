-- Linek property images storage
-- Safe to run in Supabase SQL Editor.

insert into storage.buckets (id, name, public)
values ('property-images', 'property-images', true)
on conflict (id) do nothing;

drop policy if exists "Owners upload property images" on storage.objects;
create policy "Owners upload property images" on storage.objects
for insert to authenticated
with check (bucket_id = 'property-images');

drop policy if exists "Public read property images" on storage.objects;
create policy "Public read property images" on storage.objects
for select to anon, authenticated
using (bucket_id = 'property-images');
