alter table public.pharmacies
  add column if not exists hubspot_catalogue_naali_reference text[] not null default '{}'::text[],
  add column if not exists hubspot_catalogue_naali_reference_raw text;

create index if not exists pharmacies_hubspot_catalogue_naali_reference_idx
  on public.pharmacies
  using gin (hubspot_catalogue_naali_reference);
