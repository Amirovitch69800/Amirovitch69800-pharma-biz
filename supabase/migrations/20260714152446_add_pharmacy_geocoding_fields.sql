alter table public.pharmacies
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists geocoding_status text not null default 'pending',
  add column if not exists geocoding_provider text,
  add column if not exists geocoding_score numeric(6, 5),
  add column if not exists geocoding_label text,
  add column if not exists geocoding_error text,
  add column if not exists geocoded_at timestamptz;

alter table public.pharmacies
  drop constraint if exists pharmacies_geocoding_status_check;

alter table public.pharmacies
  add constraint pharmacies_geocoding_status_check
  check (geocoding_status in ('pending', 'geocoded', 'approximate', 'error', 'skipped'));

create index if not exists pharmacies_geocoding_status_idx
  on public.pharmacies (geocoding_status);

create index if not exists pharmacies_coordinates_idx
  on public.pharmacies (latitude, longitude)
  where latitude is not null and longitude is not null;
